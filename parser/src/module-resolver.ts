/**
 * Module-system support utilities.
 *
 * Per parser-design v2, the parser produces a provenance-preserving
 * "Shape B" AST: `ModuleImportDirective` nodes keep imported declarations
 * inside their `clone.statements` field rather than splicing them into the
 * parent's statement list. This preserves the information about which file
 * each declaration came from, useful for navigation, inspector panels,
 * round-tripping back to source text, etc.
 *
 * Many downstream consumers (code generators, diagram renderers, simple
 * walkers) just want a flat list of declarations and don't care about
 * provenance. The `flatten()` helper produces a new XDbmlDocument where
 * `ModuleImportDirective` nodes have been replaced by their `clone.statements`,
 * recursively.
 *
 * Currently P4-only: handles clone blocks. Reference-only directives are
 * rejected at parse time, so `flatten()` doesn't need to do file resolution.
 * In P5, a separate `resolveModules()` function will populate clone blocks
 * from referenced files before `flatten()` runs.
 */

import type {
  ContainerBodyItem,
  ContainerDeclaration,
  TopLevelStatement,
  XDbmlDocument,
} from './ast.ts';

/**
 * Produce a new XDbmlDocument with all module-system directives replaced
 * by their clone-block content, recursively.
 *
 * At the top level, each `ModuleImportDirective` is replaced by its
 * `clone.statements` (each statement appears at the same position the
 * directive used to occupy).
 *
 * Inside a Container body, each `ModuleImportDirective` is replaced by its
 * `clone.statements` as `ContainerBodyItem`s. Note that the spec table in
 * §26.6 guarantees that clone-block content for entity/edge/view/enum
 * imports is shape-compatible with `ContainerBodyItem`; other shapes
 * (e.g., a TablePartial clone inside a Container directive) would be
 * semantically invalid per the spec and would surface as a downstream
 * type error rather than being caught here.
 *
 * Provenance information is lost in the flattened view. Consumers that
 * want to know where each declaration came from should walk the original
 * (non-flattened) AST instead.
 */
export function flatten (doc: XDbmlDocument): XDbmlDocument {
  const statements: TopLevelStatement[] = [];
  for (const stmt of doc.statements) {
    flattenTopLevel(stmt, statements);
  }
  return {
    ...doc,
    statements,
  };
}

function flattenTopLevel (
  stmt: TopLevelStatement,
  out: TopLevelStatement[],
): void {
  if (stmt.kind === 'ModuleImportDirective') {
    // Replace the directive with its clone-block content. Each inner
    // statement is itself flattened (a clone may itself contain Containers
    // with nested directives, although the spec doesn't currently expect
    // multi-level nesting in v0.2 phase 1).
    if (stmt.clone) {
      for (const inner of stmt.clone.statements) {
        flattenTopLevel(inner, out);
      }
    }
    return;
  }
  if (stmt.kind === 'ContainerDeclaration') {
    out.push(flattenContainer(stmt));
    return;
  }
  // All other top-level statement kinds pass through unchanged.
  out.push(stmt);
}

function flattenContainer (c: ContainerDeclaration): ContainerDeclaration {
  const body: ContainerBodyItem[] = [];
  for (const item of c.body) {
    flattenContainerBodyItem(item, body);
  }
  return {
    ...c,
    body,
  };
}

function flattenContainerBodyItem (
  item: ContainerBodyItem,
  out: ContainerBodyItem[],
): void {
  if (item.kind === 'ModuleImportDirective') {
    if (item.clone) {
      // Each cloned statement becomes a ContainerBodyItem in the parent's
      // body. The type narrowing is technically unsafe -- the spec implies
      // that only EntityDeclaration, EdgeDeclaration, ViewDeclaration,
      // EnumDeclaration, and NoteBlock can validly appear in a Container's
      // clone block, but the parser is permissive about what was put there.
      // Downstream consumers handle the type-mismatch case.
      for (const inner of item.clone.statements) {
        // `inner` is TopLevelStatement; we re-narrow at use site.
        out.push(inner as unknown as ContainerBodyItem);
      }
    }
    return;
  }
  out.push(item);
}
