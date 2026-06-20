/**
 * Pure validation logic for the xDBML MCP server, kept separate from the
 * MCP/transport wiring so it can be unit-tested directly against
 * `@xdbml/parse` with no MCP SDK in the loop.
 *
 * Validation is deliberately render-free: it runs only the parser and the
 * name resolver, never the renderer. That makes it much cheaper than
 * `render_xdbml` and gives precise locations -- line/column for syntax
 * errors, spans for unresolved references and duplicate declarations. The
 * intended use is a tight author -> validate -> fix -> render loop for a
 * model generating xDBML: catch a typo or a dangling reference before
 * paying to render a diagram.
 */

import {
  parse,
  flatten,
  resolveNames,
  ParseError,
  LexError,
  type XDbmlDocument,
} from '@xdbml/parse';

export interface ValidateArgs {
  source: string;
}

export interface ValidateDiagnostic {
  severity: 'error' | 'warning';
  /** Stable machine code, e.g. 'parse-error', 'unresolved-entity'. */
  code: string;
  message: string;
  /** 1-based source position of the offending construct. */
  line: number;
  column: number;
}

export interface ValidateOutcome {
  valid: boolean;
  summary: string;
  entityCount: number;
  diagnostics: ValidateDiagnostic[];
}

export type ToolResult = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

/** ParseError appends "(line N, column N)" to its own message; the structured
 * line/column fields already carry that, so strip the trailing suffix to keep
 * the human-readable text clean. */
function trimPositionSuffix (message: string): string {
  return message.replace(/\s*\(line \d+, column \d+\)\s*$/, '');
}

/**
 * Core validation, independent of MCP. Never throws on malformed xDBML; it
 * reports the problem as a diagnostic instead.
 */
export function validateXdbml (source: string): ValidateOutcome {
  // 1) Syntax. parse() tokenizes internally, so it can raise either a
  //    LexError (an unrecognizable token) or a ParseError (a grammar
  //    violation). Both carry a 1-based line/column position. parse() stops
  //    at the first syntax error, so at most one syntactic diagnostic here.
  let doc: XDbmlDocument;
  try {
    doc = parse(source);
  } catch (e) {
    if (e instanceof ParseError || e instanceof LexError) {
      const isLex = e instanceof LexError;
      return {
        valid: false,
        summary: `Invalid xDBML: ${isLex ? 'lexical' : 'syntax'} error at ` +
          `line ${e.position.line}, column ${e.position.column}.`,
        entityCount: 0,
        diagnostics: [{
          severity: 'error',
          code: isLex ? 'lex-error' : 'parse-error',
          message: trimPositionSuffix(e.message),
          line: e.position.line,
          column: e.position.column,
        }],
      };
    }
    throw e; // genuinely unexpected -- let it surface
  }

  // 2) Semantics. resolveNames reports unresolved references, duplicate
  //    declarations, and similar problems as structured diagnostics with
  //    spans. It does not throw: a well-formed-but-meaningless document
  //    still parses, it just resolves with diagnostics.
  const flat = flatten(doc);
  const entityCount = flat.statements.filter((s) => s.kind === 'EntityDeclaration').length;

  const diagnostics: ValidateDiagnostic[] = resolveNames(doc).diagnostics.map((d) => ({
    severity: d.severity,
    code: d.code,
    message: d.message,
    line: d.span.start.line,
    column: d.span.start.column,
  }));

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.length - errorCount;
  const valid = errorCount === 0;

  const entityLabel = `${entityCount} ${entityCount === 1 ? 'entity' : 'entities'}`;
  let summary: string;
  if (valid && warningCount === 0) {
    summary = `Valid xDBML: ${entityLabel}, all references resolved.`;
  } else if (valid) {
    summary = `Valid xDBML: ${entityLabel}, with ${warningCount} ` +
      `warning${warningCount === 1 ? '' : 's'}.`;
  } else {
    const warnPart = warningCount
      ? ` and ${warningCount} warning${warningCount === 1 ? '' : 's'}`
      : '';
    summary = `Invalid xDBML: ${errorCount} error${errorCount === 1 ? '' : 's'}` +
      `${warnPart} across ${entityLabel}.`;
  }

  return { valid, summary, entityCount, diagnostics };
}

/**
 * MCP-facing wrapper: formats the outcome as a single text block that is both
 * human-readable (summary + a bullet per diagnostic) and machine-readable (a
 * compact JSON tail an agent can parse without re-reading the prose).
 */
export function validateXdbmlTool (args: ValidateArgs): ToolResult {
  const outcome = validateXdbml(args.source ?? '');

  const lines = [outcome.summary];
  if (outcome.diagnostics.length > 0) {
    lines.push('');
    for (const d of outcome.diagnostics) {
      lines.push(
        `- [${d.severity}] ${d.code} (line ${d.line}, column ${d.column}): ` +
          trimPositionSuffix(d.message),
      );
    }
  }
  lines.push('', '```json', JSON.stringify({
    valid: outcome.valid,
    entityCount: outcome.entityCount,
    diagnostics: outcome.diagnostics,
  }), '```');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}
