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
  CloneBlock,
  ContainerBodyItem,
  ContainerDeclaration,
  EntityDeclaration,
  ImportItem,
  ImportSpec,
  ModuleImportDirective,
  ParseOptions,
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

/* -------------------------------------------------------------------------
 * File resolution (P5)
 *
 * Given a `use`/`reuse` directive without an inline clone block, open the
 * referenced file via the supplied `readFile` resolver, parse it, and
 * synthesize a clone block containing the matching declarations.
 *
 * The Parser class invokes `resolveImport()` while parsing a directive.
 * Passing the parse function as a callback breaks the otherwise-circular
 * import between parser.ts and module-resolver.ts.
 * ----------------------------------------------------------------------- */

/**
 * A `parse`-like callback. Used by `resolveImport` to recursively parse
 * a referenced file with the same parser configuration and an extended
 * resolution stack. The Parser injects its own bound parse function.
 */
export type ParseFn = (
  source: string,
  options: ParseOptions,
  resolutionStack: ReadonlySet<string>,
  depth: number,
) => XDbmlDocument;

/**
 * Result of attempting to resolve a directive's referenced file.
 *
 *   - `kind: 'resolved'`  -- the file was opened, parsed, and a clone
 *     block was synthesized
 *   - `kind: 'cycle'`     -- the resolution chain already contains this
 *     file; per spec §26.14 cycles are allowed, so we return an empty
 *     clone block and let name resolution (P6+) handle the actual
 *     cross-file linking
 *   - `kind: 'no-resolver'` -- no `readFile` was supplied; caller should
 *     fall back to the P4 rejection
 */
export type ImportResolution =
  | { kind: 'resolved'; clone: CloneBlock; resolvedPath: string }
  | { kind: 'cycle'; resolvedPath: string }
  | { kind: 'no-resolver' };

/**
 * Resolve a directive's reference. Returns an `ImportResolution` indicating
 * what happened. The caller decides how to act (set `clone`, fail, etc).
 *
 * Path resolution: the directive's `from` is relative to the importer's
 * `filePath`. If `from` doesn't end with `.xdbml`, that extension is
 * appended. Returns the absolute resolved path on success.
 *
 * Cycles: if the resolved path is already in `resolutionStack`, returns
 * `kind: 'cycle'` without recursing.
 *
 * Depth: if `depth + 1 > maxDepth`, throws.
 */
export function resolveImport (
  directive: ModuleImportDirective,
  options: ParseOptions,
  resolutionStack: ReadonlySet<string>,
  depth: number,
  parseFn: ParseFn,
): ImportResolution {
  if (!options.readFile) {
    return { kind: 'no-resolver' };
  }

  const resolvedPath = resolveModulePath(directive.from, options.filePath);

  if (resolutionStack.has(resolvedPath)) {
    return { kind: 'cycle', resolvedPath };
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depth + 1 > maxDepth) {
    throw new Error(
      `Module resolution depth limit (${maxDepth}) exceeded while resolving '${directive.from}' ` +
      `from '${options.filePath ?? '<no filePath>'}'. ` +
      `Increase maxDepth in ParseOptions if your module graph is genuinely this deep.`,
    );
  }

  let referencedSource: string;
  try {
    referencedSource = options.readFile(resolvedPath);
  } catch (e) {
    const inner = (e as Error).message ?? String(e);
    throw new Error(
      `Failed to read referenced module file '${resolvedPath}' ` +
      `(directive '${directive.mode} { ... } from \"${directive.from}\"' in '${options.filePath ?? '<no filePath>'}'). ` +
      `Cause: ${inner}`,
    );
  }

  // Recursively parse the referenced file. We pass the SAME options, but
  // with `filePath` updated to the resolved path so any directives inside
  // that file resolve relative to it. The resolution stack is widened to
  // include this file, so cycles get caught.
  const nextStack = new Set(resolutionStack);
  nextStack.add(resolvedPath);
  const nextOptions: ParseOptions = { ...options, filePath: resolvedPath };

  let referencedDoc: XDbmlDocument;
  try {
    referencedDoc = parseFn(referencedSource, nextOptions, nextStack, depth + 1);
  } catch (e) {
    const inner = (e as Error).message ?? String(e);
    throw new Error(
      `Error while parsing referenced module file '${resolvedPath}' ` +
      `(via directive '${directive.mode} { ... } from \"${directive.from}\"' in '${options.filePath ?? '<no filePath>'}'). ` +
      `Cause: ${inner}`,
    );
  }

  // Extract the declarations matching the directive's import spec.
  const statements = extractImports(directive.spec, referencedDoc);

  // Synthesize the clone block. The span uses the directive's own span as
  // a placeholder; we don't have precise source positions for synthesized
  // content, and downstream consumers that care about spans (Monaco
  // markers, "go to definition") look at the inner declarations' own
  // spans, which point into the referenced file. Spans on the wrapper
  // CloneBlock node itself are rarely consulted.
  const clone: CloneBlock = {
    kind: 'CloneBlock',
    statements,
    span: directive.span,
  };

  return { kind: 'resolved', clone, resolvedPath };
}

/**
 * Walk the parsed source document and pick out declarations matching the
 * import spec. Applies aliases by renaming the extracted declaration.
 *
 * For `ImportAll`: every TopLevelStatement except ProjectDeclaration
 * (per spec §26.4, Project declarations cannot be imported).
 *
 * For `ImportList`: each item is matched by element-type + source path.
 * Items not found in the source produce nothing (silent for P5; a
 * future name-resolution pass should diagnose unresolved imports).
 */
function extractImports (spec: ImportSpec, sourceDoc: XDbmlDocument): TopLevelStatement[] {
  if (spec.kind === 'ImportAll') {
    return sourceDoc.statements
      .filter((s) => s.kind !== 'ProjectDeclaration')
      .map((s) => s); // shallow-clone-able; we don't mutate them
  }
  // ImportList: process each item.
  const out: TopLevelStatement[] = [];
  for (const item of spec.items) {
    const found = findImportTarget(item, sourceDoc);
    if (found) {
      out.push(applyAlias(found, item));
    }
    // Silent skip on not-found. The spec leaves diagnostics to name
    // resolution (§26.13). In practice, users notice missing entities
    // because their references downstream become unresolved.
  }
  return out;
}

/**
 * Find the declaration matching an import item in the source document.
 * Returns undefined when no match is found.
 *
 * Element-type to lookup:
 *   - 'entity' / 'table' / 'collection' / 'record':
 *       EntityDeclaration with matching name; supports dotted path
 *       like 'core.dim_customer' (Container 'core', Entity 'dim_customer').
 *   - 'type':
 *       TypeDeclaration with matching name (top-level only; spec doesn't
 *       support importing nested Types).
 *   - 'enum':
 *       EnumDeclaration with matching name; supports dotted path for
 *       container-scoped enums.
 *   - 'container' / 'schema':
 *       ContainerDeclaration with matching name (the whole container,
 *       including all its body items).
 *   - 'edge':
 *       EdgeDeclaration with matching name; supports dotted path.
 *   - 'view' / 'diagramview':
 *       ViewDeclaration with matching name; supports dotted path.
 *   - 'tablegroup':
 *       TableGroupDeclaration with matching name (top-level only).
 *   - 'tablepartial':
 *       TablePartialDeclaration with matching name (top-level only).
 *   - 'note':
 *       NoteDeclaration with matching name (top-level only).
 *
 * `field` imports are not supported in P5 (rejected at parse time).
 */
function findImportTarget (
  item: ImportItem,
  doc: XDbmlDocument,
): TopLevelStatement | undefined {
  const path = item.sourcePath;
  const segments = path.split('.');

  // Entity-shaped items: support container.entity dotted form.
  if (
    item.elementType === 'entity' ||
    item.elementType === 'table' ||
    item.elementType === 'collection' ||
    item.elementType === 'record'
  ) {
    if (segments.length === 1) {
      // Bare name -- match a top-level entity OR a container-scoped entity
      // whose bare name is unique.
      const topLevel = doc.statements.find(
        (s) => s.kind === 'EntityDeclaration' && s.name === segments[0],
      );
      if (topLevel) return topLevel;
      // Look inside containers.
      const matches: EntityDeclaration[] = [];
      for (const stmt of doc.statements) {
        if (stmt.kind === 'ContainerDeclaration') {
          for (const body of stmt.body) {
            if (body.kind === 'EntityDeclaration' && body.name === segments[0]) {
              matches.push(body);
            }
          }
        }
      }
      if (matches.length === 1) return matches[0];
      // Ambiguous or missing -- silent skip.
      return undefined;
    }
    if (segments.length === 2) {
      // container.entity
      const container = doc.statements.find(
        (s) => s.kind === 'ContainerDeclaration' && s.name === segments[0],
      );
      if (!container || container.kind !== 'ContainerDeclaration') return undefined;
      const entity = container.body.find(
        (b) => b.kind === 'EntityDeclaration' && b.name === segments[1],
      );
      return entity && entity.kind === 'EntityDeclaration' ? entity : undefined;
    }
    return undefined;
  }

  // Type, TableGroup, TablePartial, Note: top-level only, bare name.
  if (item.elementType === 'type') {
    return doc.statements.find(
      (s) => s.kind === 'TypeDeclaration' && s.name === path,
    );
  }
  if (item.elementType === 'tablegroup') {
    return doc.statements.find(
      (s) => s.kind === 'TableGroupDeclaration' && s.name === path,
    );
  }
  if (item.elementType === 'tablepartial') {
    return doc.statements.find(
      (s) => s.kind === 'TablePartialDeclaration' && s.name === path,
    );
  }
  if (item.elementType === 'note') {
    return doc.statements.find(
      (s) => s.kind === 'NoteDeclaration' && s.name === path,
    );
  }
  // Container / Schema: top-level, bare name.
  if (item.elementType === 'container' || item.elementType === 'schema') {
    return doc.statements.find(
      (s) => s.kind === 'ContainerDeclaration' && s.name === path,
    );
  }
  // Edge: top-level OR container-scoped.
  if (item.elementType === 'edge') {
    if (segments.length === 1) {
      return doc.statements.find(
        (s) => s.kind === 'EdgeDeclaration' && s.name === segments[0],
      );
    }
    if (segments.length === 2) {
      const container = doc.statements.find(
        (s) => s.kind === 'ContainerDeclaration' && s.name === segments[0],
      );
      if (!container || container.kind !== 'ContainerDeclaration') return undefined;
      const edge = container.body.find(
        (b) => b.kind === 'EdgeDeclaration' && b.name === segments[1],
      );
      return edge && edge.kind === 'EdgeDeclaration' ? edge : undefined;
    }
    return undefined;
  }
  // View / DiagramView: top-level OR container-scoped.
  if (item.elementType === 'view' || item.elementType === 'diagramview') {
    if (segments.length === 1) {
      return doc.statements.find(
        (s) => s.kind === 'ViewDeclaration' && s.name === segments[0],
      );
    }
    if (segments.length === 2) {
      const container = doc.statements.find(
        (s) => s.kind === 'ContainerDeclaration' && s.name === segments[0],
      );
      if (!container || container.kind !== 'ContainerDeclaration') return undefined;
      const view = container.body.find(
        (b) => b.kind === 'ViewDeclaration' && b.name === segments[1],
      );
      return view && view.kind === 'ViewDeclaration' ? view : undefined;
    }
    return undefined;
  }
  // Enum: top-level OR container-scoped.
  if (item.elementType === 'enum') {
    if (segments.length === 1) {
      return doc.statements.find(
        (s) => s.kind === 'EnumDeclaration' && s.name === segments[0],
      );
    }
    if (segments.length === 2) {
      const container = doc.statements.find(
        (s) => s.kind === 'ContainerDeclaration' && s.name === segments[0],
      );
      if (!container || container.kind !== 'ContainerDeclaration') return undefined;
      const enm = container.body.find(
        (b) => b.kind === 'EnumDeclaration' && b.name === segments[1],
      );
      return enm && enm.kind === 'EnumDeclaration' ? enm : undefined;
    }
    return undefined;
  }
  return undefined;
}

/**
 * Apply the alias from an import item by renaming the extracted declaration.
 * If no alias is present, returns the declaration unchanged.
 *
 * The rename is shallow: we update the top-level `name` field and leave
 * everything else intact. References inside the declaration (e.g., field
 * type expressions that name other Types) keep their original names --
 * the user is expected to ensure aliases don't break internal references.
 */
function applyAlias (
  stmt: TopLevelStatement,
  item: ImportItem,
): TopLevelStatement {
  if (!item.alias) return stmt;
  // Most declaration kinds have a `name` field. The ones that don't
  // (PartialInjection, certain VersionDeclarations) don't appear at
  // the top level. We narrow by kind and rebuild the typed object.
  switch (stmt.kind) {
    case 'EntityDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'TypeDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'EnumDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'EdgeDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'ViewDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'ContainerDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'TableGroupDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'TablePartialDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    case 'NoteDeclaration':
      return { ...stmt, name: item.alias } as TopLevelStatement;
    default:
      return stmt;
  }
}

/**
 * Resolve a relative `from` path against the importer's `filePath`. Returns
 * an absolute (or canonical) path that the caller's `readFile` will see as
 * a stable key.
 *
 * Rules:
 *   - If `from` ends with `.xdbml`, use as-is; otherwise append `.xdbml`.
 *   - If `from` starts with `./` or `../`, resolve relative to the directory
 *     of `importerPath`.
 *   - If `from` is otherwise relative (e.g., `lib/foo`), treat as relative
 *     to the importer's directory too.
 *   - If `from` looks absolute (starts with `/`), use as-is.
 *   - If `importerPath` is undefined, return `from` as-is (with `.xdbml`
 *     appended if needed) -- the readFile resolver is expected to handle
 *     any further resolution.
 *
 * Uses pure JavaScript path manipulation (no node:path) so the same code
 * runs in Node and in the browser. Forward slashes only; Windows paths
 * with backslashes should be normalized before reaching the parser.
 */
function resolveModulePath (
  fromClause: string,
  importerPath: string | undefined,
): string {
  let withExt = fromClause;
  if (!withExt.endsWith('.xdbml')) {
    withExt = `${withExt}.xdbml`;
  }
  // Absolute path: return as-is.
  if (withExt.startsWith('/')) return withExt;
  // No importer context: return as-is (resolver handles it).
  if (!importerPath) return withExt;
  // Resolve relative to importer's directory.
  const importerDir = posixDirname(importerPath);
  return posixJoin(importerDir, withExt);
}

function posixDirname (p: string): string {
  const idx = p.lastIndexOf('/');
  if (idx < 0) return '.';
  if (idx === 0) return '/';
  return p.slice(0, idx);
}

function posixJoin (base: string, rel: string): string {
  // Split base into segments; consume `.`/`..` from rel.
  const baseSegs = base === '/' ? [''] : base.split('/');
  const relSegs = rel.split('/');
  const out = baseSegs.slice();
  for (const seg of relSegs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      // Pop unless we'd cross above root.
      if (out.length > 0 && out[out.length - 1] !== '..' && out[out.length - 1] !== '') {
        out.pop();
      } else {
        out.push('..');
      }
    } else {
      out.push(seg);
    }
  }
  // Re-join. Leading empty (from absolute base) preserves the leading slash.
  let joined = out.join('/');
  if (base.startsWith('/') && !joined.startsWith('/')) joined = `/${joined}`;
  if (joined === '') joined = '.';
  return joined;
}

/**
 * Default recursion depth limit for module resolution. Enough for any
 * realistic module graph; small enough to bound stack usage on
 * pathological inputs.
 */
export const DEFAULT_MAX_DEPTH = 8;
