/**
 * "Append changes": the text edits that add change blocks (spec §29) at the
 * end of the open document.
 *
 * A change set, such as one an AI assistant proposes in a chat, arrives as
 * text or as a file. It is checked before anything is written:
 *
 *   - it holds change blocks only, with at most an `xdbml:` line, which is
 *     left out, so that a whole model is never appended by mistake;
 *   - it parses.
 *
 * Change blocks need `xdbml: 0.8` or later, so a document declaring an
 * earlier version has its version line raised, and a document without one
 * (plain DBML) receives one.
 *
 * Pure: takes the source and the changes, returns the edits or the reason
 * they are refused. Offsets are those of the source given.
 */
import { compareVersions, parse, ParseError } from '@xdbml/parse';

import type { TextEdit } from '../diagram/add-note';

export const CHANGES_VERSION = '0.8';

export interface AppendChangesPlan {
  ok: true;
  edits: TextEdit[];
  /** Offset, in the source after the edits, of the first appended change block, for revealing it. */
  revealOffset: number;
  /** The version the document declared before, when the edits raise it; `none` for a document without one. */
  raisedFrom?: string;
}

export interface AppendChangesRefusal {
  ok: false;
  message: string;
}

/** The `xdbml:` line of a source, after any comments that precede it. */
const VERSION_LINE = /^((?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*)xdbml[ \t]*:[ \t]*(\d+(?:\.\d+){0,2})/;

interface DeclaredVersion {
  version: string;
  offset: number;
  length: number;
}

function declaredVersion (source: string): DeclaredVersion | undefined {
  const m = VERSION_LINE.exec(source);
  if (!m) return undefined;
  const offset = m[1].length;
  return { version: m[2], offset, length: m[0].length - offset };
}

/**
 * The sentence that tells the person how appending changes the version
 * line, or undefined when the document already declares 0.8 or later.
 */
export function versionNotice (source: string): string | undefined {
  const declared = declaredVersion(source);
  if (!declared) return `The document declares no version. Appending adds xdbml: ${CHANGES_VERSION} at the top, which change blocks need.`;
  if (compareVersions(declared.version, CHANGES_VERSION) >= 0) return undefined;
  return `The document declares xdbml: ${declared.version}. Appending changes it to xdbml: ${CHANGES_VERSION}, which change blocks need.`;
}

/** A parse error's message, with the line counted in the changes as written. */
function parseMessage (e: ParseError, lineOffset: number): string {
  const text = e.message.replace(/ \(line \d+, column \d+\)$/, '');
  return `Line ${e.position.line - lineOffset}: ${text}`;
}

/** The edits that append `changes` to `source`; see the module comment. */
export function planAppendChanges ({ source, changes }: { source: string; changes: string }): AppendChangesPlan | AppendChangesRefusal {
  const ownVersion = declaredVersion(changes);
  const body = (ownVersion ? changes.slice(ownVersion.offset + ownVersion.length) : changes).trim();
  if (body === '') return { ok: false, message: 'Paste change blocks, or choose a file that holds them.' };

  // The changes are parsed on their own, under the version they need. The
  // added first line shifts the lines of a parse error by one.
  let statements;
  try {
    statements = parse(`xdbml: ${CHANGES_VERSION}\n${body}`).statements;
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, message: parseMessage(e, 1) };
    throw e;
  }
  const other = statements.find((s) => s.kind !== 'ChangesDeclaration');
  if (other) {
    return {
      ok: false,
      message: `Line ${other.span.start.line - 1} holds a declaration outside a change block. Append changes takes change blocks only, ` +
        "such as Changes { alter Table customers add Field email varchar }. To load a whole model, use Open.",
    };
  }
  if (statements.length === 0) return { ok: false, message: 'The text holds no change block.' };

  const edits: TextEdit[] = [];
  let raisedFrom: string | undefined;
  let shift = 0;
  const declared = declaredVersion(source);
  if (!declared) {
    const text = `xdbml: ${CHANGES_VERSION}\n\n`;
    edits.push({ offset: 0, length: 0, text });
    shift = text.length;
    raisedFrom = 'none';
  } else if (compareVersions(declared.version, CHANGES_VERSION) < 0) {
    const text = `xdbml: ${CHANGES_VERSION}`;
    edits.push({ offset: declared.offset, length: declared.length, text });
    shift = text.length - declared.length;
    raisedFrom = declared.version;
  }

  // One blank line between the document and the changes, and a final newline.
  const trailing = /\s*$/.exec(source)?.[0] ?? '';
  const end = source.length - trailing.length;
  const separator = end === 0 ? '' : '\n\n';
  edits.push({ offset: end, length: trailing.length, text: `${separator}${body}\n` });

  const plan: AppendChangesPlan = { ok: true, edits, revealOffset: end + shift + separator.length };
  if (raisedFrom !== undefined) plan.raisedFrom = raisedFrom;
  return plan;
}
