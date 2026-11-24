/**
 * UI-facing error shape. Parser-internal `ParseError`, `LexError`, and
 * resolver `Diagnostic` are all converted into this for display in
 * Monaco markers and the diagnostics panel.
 *
 * `severity` distinguishes errors from warnings and information. Lex/parse
 * failures are always errors (the AST is unusable); resolver diagnostics
 * carry their own severity, `info` reporting what was done, such as a
 * change statement that `if exists` skipped (spec §29.10).
 *
 * `code` is `string` for resolver diagnostics (stable codes like
 * `unresolved-type`) and `number` for lex/parse (1 = lex, 2 = parse,
 * -1 = unexpected). The Monaco marker layer surfaces whichever shape
 * was supplied; downstream tooling can match on string codes to style
 * specific diagnostic categories.
 */
export interface ParserError {
  readonly code: number | string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly location: {
    readonly line: number;
    readonly column: number;
  };
  readonly endLocation: {
    readonly line: number;
    readonly column: number;
  };
}
