/**
 * Span -> line/column conversion for navigating Monaco to an AST node.
 *
 * The parser's AST stores Position info (1-indexed line + column +
 * 0-indexed byte offset) on every node's `span`. We don't need to
 * scan the source ourselves -- just read the position.
 *
 * Used by the "Edit in source" button: clicking it calls the editor's
 * exposed `revealPosition(line, column)` method, which scrolls Monaco
 * to that point and places the cursor there. The inspector itself
 * is read-only; the editor is where actual editing happens.
 */

import type { Span } from '@xdbml/parse';

export interface SourceLocation {
  line: number;
  column: number;
}

export function spanStart (span: Span): SourceLocation {
  return { line: span.start.line, column: span.start.column };
}
