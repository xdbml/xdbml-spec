/**
 * Views (spec §14): the source query and the checks of §14.7.
 *
 * A View's source query is a body element, `source_query: '...'`, at most
 * once (§14.3). The grammar of v0.6.0 also accepted `source_query` in the
 * settings brackets; since v0.6.1 that form is not the view's source query
 * and draws a warning, so a document valid under v0.6.0 stays valid.
 *
 * `viewSourceQuery()` is the normalized AST of §28.7: the one source query
 * of a View, the first `source_query:` element of its body. Consumers such
 * as the playground inspector read it rather than walking the body.
 */

import type {
  ContainerDeclaration,
  SourceQueryItem,
  ViewDeclaration,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';

/** The source query of a View (spec §14.3, §28.7), or undefined when it declares none. */
export function viewSourceQuery (view: ViewDeclaration): SourceQueryItem | undefined {
  for (const item of view.body) {
    if (item.kind === 'SourceQueryItem') return item;
  }
  return undefined;
}

function views (doc: XDbmlDocument): ViewDeclaration[] {
  const out: ViewDeclaration[] = [];
  for (const stmt of doc.statements) {
    if (stmt.kind === 'ViewDeclaration') out.push(stmt);
    else if (stmt.kind === 'ContainerDeclaration') {
      for (const item of (stmt as ContainerDeclaration).body) {
        if (item.kind === 'ViewDeclaration') out.push(item);
      }
    }
  }
  return out;
}

/** The warnings of spec §14.7. Both concern forms v0.6.0 accepted. */
export function checkViews (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const view of views(doc)) {
    for (const s of view.settings) {
      if (s.name !== 'source_query') continue;
      diagnostics.push({
        severity: 'warning',
        code: 'source-query-in-settings',
        message:
          `View '${view.name}' writes source_query in its settings, where it is not the view's ` +
          "source query. Move it into the body: View name { source_query: '...' ... } (spec §14.3).",
        span: s.span,
      });
    }
    const queries = view.body.filter((b) => b.kind === 'SourceQueryItem');
    for (const extra of queries.slice(1)) {
      diagnostics.push({
        severity: 'warning',
        code: 'duplicate-source-query',
        message:
          `View '${view.name}' declares a second source query; the first one is the view's ` +
          'source query (spec §14.3).',
        span: extra.span,
      });
    }
  }
  return diagnostics;
}
