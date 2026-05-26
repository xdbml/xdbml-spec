/**
 * UI-facing error shape. Parser-internal `ParseError` and `LexError` are
 * converted into this for display in Monaco markers and (future) a
 * diagnostics list.
 */
export interface ParserError {
  readonly code: number;
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
