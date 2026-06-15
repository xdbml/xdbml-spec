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
  FieldDeclaration,
  ImportItem,
  ImportSpec,
  ModuleImportDirective,
  ObjectType,
  ParseOptions,
  TopLevelStatement,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import { SCALAR_TYPES, BSON_TYPES } from './keywords.ts';

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
 * Field-level imports (spec §26.8) get a special transform: the clone
 * block holds a bare `FieldDeclaration`, which `flatten()` lifts into a
 * synthetic `TypeDeclaration` at file scope. Downstream consumers see
 * a normal Named Type and can use it as a field type without learning
 * about the field-import construct.
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
  stmt: TopLevelStatement | FieldDeclaration,
  out: TopLevelStatement[],
): void {
  if (stmt.kind === 'FieldDeclaration') {
    // A bare FieldDeclaration only appears at the top level via the field-
    // import path -- the parser only accepts it inside a clone block. Lift
    // it to a synthetic TypeDeclaration so the name behaves like a Named
    // Type for any downstream consumer (resolver, code generator, etc).
    out.push(synthesizeTypeFromField(stmt));
    return;
  }
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

/**
 * Lift a bare FieldDeclaration (from a field-import clone block) into a
 * synthetic TypeDeclaration. The synthesized Type takes the field's name
 * (or alias, since the clone block already has the post-alias name) and
 * its full settings array.
 *
 *   - For SCALAR fields (any TypeExpression that isn't ObjectType): the
 *     Type is in scalar form with `scalarBase = field.type`. Equivalent
 *     to the v0.2 scalar-Named-Type form (spec §14.7).
 *
 *   - For OBJECT-typed fields (`field foo object { ... }`): the Type is
 *     in object form with `body = field.type.fields`. Equivalent to the
 *     v0.1 object-Named-Type form (spec §14).
 *
 * Other type shapes (Array, Map, Set, Tuple, Union, polymorphic types)
 * are valid as `scalarBase` of a Type and pass through unchanged. The
 * "scalar" in `scalarBase` is a historical name; functionally it means
 * "the base TypeExpression this Named Type aliases."
 */
function synthesizeTypeFromField (field: FieldDeclaration): TypeDeclaration {
  if (field.type.kind === 'ObjectType') {
    return {
      kind: 'TypeDeclaration',
      name: field.name,
      scalarBase: undefined,
      settings: field.settings,
      body: field.type.fields,
      span: field.span,
    };
  }
  return {
    kind: 'TypeDeclaration',
    name: field.name,
    scalarBase: field.type,
    settings: field.settings,
    body: [],
    span: field.span,
  };
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
 *     file; per spec §26.15 cycles are allowed, so we return an empty
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
function extractImports (
  spec: ImportSpec,
  sourceDoc: XDbmlDocument,
): (TopLevelStatement | FieldDeclaration)[] {
  if (spec.kind === 'ImportAll') {
    // ImportAll never matches field imports (the `*` form is for top-level
    // declarations only per spec §26.2). Return the source's top-level
    // statements minus Project.
    return sourceDoc.statements
      .filter((s) => s.kind !== 'ProjectDeclaration')
      .map((s) => s); // shallow-clone-able; we don't mutate them
  }
  // ImportList: process each item.
  const out: (TopLevelStatement | FieldDeclaration)[] = [];
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
 *   - 'field':
 *       FieldDeclaration found by walking a dotted path through
 *       containers, entities, and nested type expressions (object types,
 *       arrays via [*]/[N], maps via ['key'], tuples via [N]). Returned
 *       as a bare FieldDeclaration; the caller wraps it in a CloneBlock
 *       and `flatten()` later lifts it to a synthetic TypeDeclaration.
 *
 * The return type is widened to include `FieldDeclaration` solely for
 * the field-import case; for every other element type the returned shape
 * is a `TopLevelStatement`.
 */
function findImportTarget (
  item: ImportItem,
  doc: XDbmlDocument,
): TopLevelStatement | FieldDeclaration | undefined {
  const path = item.sourcePath;
  const segments = path.split('.');

  // Field imports go through their own walker. The path can be deeper
  // than `container.entity.field` -- the walker handles nested objects,
  // array wildcards, etc.
  if (item.elementType === 'field') {
    return findFieldTarget(segments, doc);
  }

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
 * Walk a dotted path through containers, entities, and (optionally) nested
 * object types to find a FieldDeclaration in a referenced source document.
 * Returns undefined when any segment fails to resolve.
 *
 * Path shapes accepted (per spec §26.8):
 *   - `entity.field`                    -- top-level entity
 *   - `container.entity.field`          -- container-qualified entity
 *   - `entity.field.sub`                -- nested via ObjectType
 *   - `container.entity.field.sub.leaf` -- container + nested
 *
 * Bracketed segments (`[*]`, `[N]`, `['key']`) are not supported because
 * the parser's ImportItem path grammar accepts only dotted identifiers.
 * A field whose source is reached only through an array or map element
 * needs to be re-declared as a Named Type at the source side instead.
 *
 * Named Type dereferencing: when walking a path like
 * `entity.field.subfield` where `field`'s type is a Named Type defined
 * in the source document, the walker looks up the Type and continues
 * the walk through its body. Cycle detection caps recursion at depth 8
 * (deep enough for realistic nesting, shallow enough that a malformed
 * cyclic type declaration can't hang the parser).
 */
function findFieldTarget (
  segments: string[],
  doc: XDbmlDocument,
): FieldDeclaration | undefined {
  if (segments.length < 2) return undefined;

  // -- Step 1: identify the entity and how many leading segments it consumed.
  let entity: EntityDeclaration | undefined;
  let entityPrefixLen = 0;

  // Try 2-segment: container.entity (only if we have room for at least
  // one field segment after).
  if (segments.length >= 3) {
    const container = doc.statements.find(
      (s) => s.kind === 'ContainerDeclaration' && s.name === segments[0],
    );
    if (container && container.kind === 'ContainerDeclaration') {
      const ent = container.body.find(
        (b) => b.kind === 'EntityDeclaration' && b.name === segments[1],
      );
      if (ent && ent.kind === 'EntityDeclaration') {
        entity = ent;
        entityPrefixLen = 2;
      }
    }
  }

  // Try 1-segment: top-level entity (declared outside any Container).
  if (!entity) {
    const topLevel = doc.statements.find(
      (s) => s.kind === 'EntityDeclaration' && s.name === segments[0],
    );
    if (topLevel && topLevel.kind === 'EntityDeclaration') {
      entity = topLevel;
      entityPrefixLen = 1;
    }
  }

  // Try 1-segment: bare entity name with unique match across containers.
  // (Ambiguous bare names -- entity X exists in multiple containers --
  // return undefined to force the importer to qualify the path.)
  if (!entity) {
    const matches: EntityDeclaration[] = [];
    for (const stmt of doc.statements) {
      if (stmt.kind === 'ContainerDeclaration') {
        for (const item of stmt.body) {
          if (item.kind === 'EntityDeclaration' && item.name === segments[0]) {
            matches.push(item);
          }
        }
      }
    }
    if (matches.length === 1) {
      entity = matches[0];
      entityPrefixLen = 1;
    }
  }

  if (!entity) return undefined;

  // -- Step 2: find the top-level field on the entity.
  const fieldSegments = segments.slice(entityPrefixLen);
  if (fieldSegments.length === 0) return undefined;

  let currentField: FieldDeclaration | undefined;
  for (const item of entity.body) {
    if (item.kind === 'FieldDeclaration' && item.name === fieldSegments[0]) {
      currentField = item;
      break;
    }
  }
  if (!currentField) return undefined;

  // If no more segments, we're done.
  if (fieldSegments.length === 1) return currentField;

  // -- Step 3: walk nested segments through object-typed fields.
  // Build a local Named-Type table from the source doc so the walker
  // can dereference scalar-Named-Type and object-form Named Types when
  // a path crosses a Named Type boundary.
  const typeTable = new Map<string, TypeDeclaration>();
  for (const s of doc.statements) {
    if (s.kind === 'TypeDeclaration') typeTable.set(s.name, s);
  }

  return walkObjectFieldPath(currentField, fieldSegments.slice(1), typeTable);
}

/**
 * Walk through remaining path segments, each step expecting the current
 * field's type to be an ObjectType (directly or after Named Type deref)
 * and looking up the next segment as a field name in that object.
 */
function walkObjectFieldPath (
  startField: FieldDeclaration,
  remaining: string[],
  typeTable: Map<string, TypeDeclaration>,
): FieldDeclaration | undefined {
  let current = startField;
  for (const seg of remaining) {
    const objType = derefToObject(current.type, typeTable, 0);
    if (!objType) return undefined;
    let next: FieldDeclaration | undefined;
    for (const item of objType.fields) {
      if (item.kind === 'FieldDeclaration' && item.name === seg) {
        next = item;
        break;
      }
    }
    if (!next) return undefined;
    current = next;
  }
  return current;
}

const BUILTIN_TYPE_NAMES = new Set<string>([
  ...SCALAR_TYPES.map((t) => t.toLowerCase()),
  ...BSON_TYPES.map((t) => t.toLowerCase()),
]);

/**
 * Dereference a TypeExpression to an ObjectType when possible. Returns
 * undefined when the expression is a builtin scalar, an array/map/tuple
 * (which the ImportItem path grammar can't navigate into), or a Named
 * Type that the source document doesn't declare.
 *
 * `depth` guards against cyclic Named-Type chains (e.g., `Type A B`,
 * `Type B A`). Realistic schemas won't approach the limit; the cap is
 * defensive.
 */
function derefToObject (
  type: TypeExpression,
  typeTable: Map<string, TypeDeclaration>,
  depth: number,
): ObjectType | undefined {
  if (depth > 8) return undefined;
  if (type.kind === 'ObjectType') return type;
  if (type.kind !== 'ScalarType') return undefined;

  // ScalarType might be a builtin or a reference to a declared Named
  // Type -- the parser doesn't distinguish them at parse time. If the
  // name matches a builtin, no Named-Type deref is possible.
  if (BUILTIN_TYPE_NAMES.has(type.name.toLowerCase())) return undefined;

  const td = typeTable.get(type.name);
  if (!td) return undefined;

  // Object-form Named Type: body holds the fields directly.
  if (!td.scalarBase && td.body.length > 0) {
    return {
      kind: 'ObjectType',
      keyword: 'object',
      fields: td.body,
      span: td.span,
    };
  }
  // Scalar-form Named Type: recurse into the base.
  if (td.scalarBase) {
    return derefToObject(td.scalarBase, typeTable, depth + 1);
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
 *
 * Field imports are aliased the same way: the bare FieldDeclaration's
 * `name` field becomes the alias. The synthesized TypeDeclaration that
 * `flatten()` produces will then carry the alias as its Named Type name.
 */
function applyAlias (
  stmt: TopLevelStatement | FieldDeclaration,
  item: ImportItem,
): TopLevelStatement | FieldDeclaration {
  if (!item.alias) return stmt;
  switch (stmt.kind) {
    case 'EntityDeclaration':
      return { ...stmt, name: item.alias };
    case 'TypeDeclaration':
      return { ...stmt, name: item.alias };
    case 'EnumDeclaration':
      return { ...stmt, name: item.alias };
    case 'EdgeDeclaration':
      return { ...stmt, name: item.alias };
    case 'ViewDeclaration':
      return { ...stmt, name: item.alias };
    case 'ContainerDeclaration':
      return { ...stmt, name: item.alias };
    case 'TableGroupDeclaration':
      return { ...stmt, name: item.alias };
    case 'TablePartialDeclaration':
      return { ...stmt, name: item.alias };
    case 'NoteDeclaration':
      return { ...stmt, name: item.alias };
    case 'FieldDeclaration':
      return { ...stmt, name: item.alias };
    default:
      return stmt;
  }
}

/* -------------------------------------------------------------------------
 * Module source classification (spec §26.14, "Remote module sources")
 *
 * A `from` source is recognized purely by its scheme. A source beginning
 * with 'https://' is a remote (URL) source; anything else is a relative
 * path, resolved exactly as in v0.2. Disallowed forms -- a non-https
 * scheme, a protocol-relative '//host/...' source, embedded credentials,
 * or a bare host such as 'github.com/owner/repo/...' -- are rejected here
 * so the parser can surface a located error at the source string.
 *
 * This is pure, synchronous classification. The actual network fetch is
 * delegated to ParseOptions.readFile (the host's resolver). The obligations
 * on a fetcher (SSRF defenses, https-only redirects, size and time limits)
 * live with that resolver, not here; see spec §26.14.5.
 * ----------------------------------------------------------------------- */

/** Raised when a `from` source string is structurally disallowed. */
export class ModuleSourceError extends Error {
  constructor (message: string) {
    super(message);
    this.name = 'ModuleSourceError';
  }
}

export type ModuleSource =
  | { kind: 'relative'; from: string }
  | { kind: 'url'; href: string };

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
// A scheme-less first path segment that looks like a public host. Used only
// to give a clearer error than "file not found" when someone pastes a URL
// without its scheme. Deliberately conservative: it requires a dot-separated
// label ending in an alphabetic TLD, so version directories like 'v1.2/...'
// and ordinary relative roots like 'lib/...' are NOT treated as hosts.
const BARE_HOST_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** True when a resolved key is a remote (https) URL rather than a path. */
export function isUrlKey (s: string): boolean {
  return /^https:\/\//i.test(s);
}

/**
 * Classify a directive's `from` source string. Returns a discriminated
 * union; throws ModuleSourceError for disallowed forms. Pure and sync.
 */
export function classifyModuleSource (from: string): ModuleSource {
  // Protocol-relative: ambiguous (no scheme to resolve against). Rejected.
  if (from.startsWith('//')) {
    throw new ModuleSourceError(
      `Protocol-relative module source ${JSON.stringify(from)} is not allowed; ` +
      `use an explicit 'https://' URL or a relative path.`,
    );
  }

  const schemeMatch = SCHEME_RE.exec(from);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'https') {
      throw new ModuleSourceError(
        `Module source scheme '${scheme}:' is not allowed; remote sources must use 'https://' ` +
        `(got ${JSON.stringify(from)}).`,
      );
    }
    let url: URL;
    try {
      url = new URL(from);
    } catch {
      throw new ModuleSourceError(
        `Module source ${JSON.stringify(from)} is not a valid 'https://' URL.`,
      );
    }
    if (url.username !== '' || url.password !== '') {
      throw new ModuleSourceError(
        `Module source ${JSON.stringify(from)} embeds credentials in the URL, which is not allowed; ` +
        `supply authentication through the resolver's configuration instead.`,
      );
    }
    return { kind: 'url', href: url.href };
  }

  // No scheme. Reject an obvious bare host (domain-like first segment
  // followed by a path) rather than silently treating it as a relative file.
  const slash = from.indexOf('/');
  if (slash > 0) {
    const firstSegment = from.slice(0, slash);
    if (BARE_HOST_RE.test(firstSegment)) {
      throw new ModuleSourceError(
        `Module source ${JSON.stringify(from)} looks like a bare host; ` +
        `prefix it with 'https://' to use it as a remote source, ` +
        `or write './${from}' if you really mean a relative path.`,
      );
    }
  }

  return { kind: 'relative', from };
}

/**
 * Resolve a `from` source against the importer's `filePath`, returning a
 * stable key for `readFile` and for cycle detection.
 *
 *   - A remote (https) source resolves to its normalized href. No '.xdbml'
 *     is appended (a raw-content URL may carry a query string).
 *   - A relative source whose importer is itself a remote module resolves
 *     against the importer's base URL per RFC 3986 (spec §26.14.1). A remote
 *     module therefore can never reach the local filesystem.
 *   - A relative source with a local importer resolves on the filesystem,
 *     exactly as in v0.2.
 *
 * Uses pure string / WHATWG-URL manipulation (no node:path) so the same
 * code runs in Node and the browser. Forward slashes only; Windows paths
 * with backslashes should be normalized before reaching the parser.
 */
function resolveModulePath (
  fromClause: string,
  importerPath: string | undefined,
): string {
  const source = classifyModuleSource(fromClause);

  // Remote (URL) source: the normalized href IS the resolution key.
  if (source.kind === 'url') {
    return source.href;
  }

  // Relative source under a remote importer: resolve against its base URL.
  if (importerPath && isUrlKey(importerPath)) {
    let rel = source.from;
    if (!rel.endsWith('.xdbml')) rel = `${rel}.xdbml`;
    // WHATWG URL resolution normalizes host case and dot-segments, which is
    // also what we want for the cycle-detection / de-duplication key.
    return new URL(rel, importerPath).href;
  }

  // Local relative source (unchanged v0.2 behavior).
  let withExt = source.from;
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
