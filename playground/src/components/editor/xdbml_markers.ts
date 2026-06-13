/**
 * Bridge parser errors to Monaco's marker API so they show as red
 * squiggles in the editor.
 *
 * Note: xDBML parser positions are 1-indexed for both line and column
 * (matching Monaco's convention), so no offset arithmetic is needed --
 * unlike DBML's parser which is 0-indexed.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

import type { ParserError } from '@/types';

import { XDBML_LANGUAGE_ID } from './xdbml_language';

export function setMonacoMarkers (
  model: monaco.editor.ITextModel,
  errors: readonly ParserError[],
): void {
  const markers: monaco.editor.IMarkerData[] = errors.map((e) => ({
    // Error vs Warning -- driven by the diagnostic's own severity rather
    // than hardcoded. Lex/parse failures arrive as 'error' (the AST is
    // unusable); resolver diagnostics are 'error' today but the panel
    // and marker layer are shape-ready for warnings.
    severity: e.severity === 'warning'
      ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Error,
    message: e.message,
    startLineNumber: e.location.line,
    startColumn: e.location.column,
    endLineNumber: e.endLocation.line,
    endColumn: Math.max(e.endLocation.column, e.location.column + 1),
    // The code field shows up in Monaco's hover tooltip. Resolver
    // diagnostics use stable string codes (e.g., 'unresolved-type');
    // lex/parse use numeric codes (1, 2). Both render fine.
    code: typeof e.code === 'number' && e.code === -1 ? undefined : String(e.code),
  }));
  monaco.editor.setModelMarkers(model, XDBML_LANGUAGE_ID, markers);
}
