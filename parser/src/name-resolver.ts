/**
 * Name resolution pass (spec §26.10 / §26.14, parser batch P6).
 *
 * `resolveNames(doc)` walks an xDBML document (the flattened view; clone
 * blocks have been merged) and produces:
 *
 *   - A symbol table mapping qualified names to declarations
 *   - A list of diagnostics: unresolved references and name conflicts
 *
 * The resolver does NOT mutate the AST. It is a pure side computation
 * that downstream consumers can run for validation, IDE support, code
 * generation, etc. Spans on diagnostics point to the offending construct
 * in the source, so callers can surface them as editor markers.
 *
 * Per the spec, name resolution is a two-pass process:
 *
 *   Pass 1: Collect declarations.
 *     Walk all top-level + container-body declarations and add them to
 *     the symbol table. Duplicates (same qualified name + same kind)
 *     produce a `duplicate-declaration` diagnostic and the LATER
 *     declaration is silently dropped from the table.
 *
 *   Pass 2: Resolve references.
 *     Walk all reference sites and look up targets in the symbol table.
 *     References that don't resolve produce diagnostics. Built-in scalar
 *     and BSON types are recognized via SCALAR_TYPES / BSON_TYPES and
 *     never produce unresolved-type diagnostics.
 *
 * Two passes handle forward references (a Type declared at end of file
 * can be referenced from a field declared at the top) and circular
 * imports (cycles are already collapsed by `flatten()` / cycles in P5
 * resolution; the resolver just sees the merged namespace).
 *
 * The resolver flattens its input internally, so callers don't need to
 * `flatten()` first. Callers that want to surface diagnostics tied to
 * the original (provenance-preserving) AST can map positions back via
 * span comparison; in practice the cloned declarations' spans point
 * into the importing file's clone block, which is where the user can
 * edit them, so the natural workflow works correctly.
 */

import type {
  EntityDeclaration,
  EnumDeclaration,
  FieldDeclaration,
  Position,
  RefEndpoint,
  TopLevelStatement,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import { SCALAR_TYPES, BSON_TYPES } from './keywords.ts';
import { flatten } from './module-resolver.ts';

/* -------------------------------------------------------------------------
 * Public types
 * ----------------------------------------------------------------------- */

/**
 * Kind of declaration a symbol refers to. Mirrors the declaration AST
 * shape vocabulary; useful for diagnostics that want to say
 * "expected an entity, found a type" or similar.
 */
export type SymbolKind =
  | 'entity'
  | 'type'
  | 'enum'
  | 'container'
  | 'edge'
  | 'view'
  | 'tablegroup'
  | 'tablepartial'
  | 'note';

/**
 * One entry in the symbol table. Carries the declaration node (so
 * downstream consumers can navigate), the canonical qualified name, and
 * a source position for diagnostics.
 */
export interface SymbolEntry {
  /** The fully-qualified, dot-separated name (e.g., `core.dim_customer`). */
  qualifiedName: string;
  /** The bare, unqualified name as it appears in source. */
  name: string;
  /** Container the symbol lives in, if any (top-level entries leave this undefined). */
  containerName?: string;
  kind: SymbolKind;
  /** The declaration node. Type narrows on `kind`. */
  declaration:
    | EntityDeclaration
    | TypeDeclaration
    | EnumDeclaration
    | TopLevelStatement;
  /** Source position of the declaration (start of declaration). */
  position: Position;
}

/**
 * Stable diagnostic code. Tooling can match on these to filter or style
 * messages without parsing the human-readable text.
 */
export type DiagnosticCode =
  | 'duplicate-declaration'
  | 'unresolved-type'
  | 'unresolved-entity'
  | 'unresolved-field'
  | 'unresolved-partial'
  | 'unresolved-tablegroup-member'
  | 'unresolved-records-entity'
  | 'unresolved-records-column'
  | 'empty-import';

/**
 * A single resolution diagnostic. Severity is currently always `error`,
 * but the field is included to leave room for future warnings (e.g.,
 * style concerns like "redundant alias matches original name").
 */
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: DiagnosticCode;
  message: string;
  position: Position;
}

/**
 * The result of `resolveNames(doc)`. The symbol table is consultable for
 * downstream queries (e.g., "given a name, find the declaration"); the
 * diagnostics list is for surfacing problems.
 */
export interface ResolutionResult {
  diagnostics: Diagnostic[];
  symbols: SymbolTable;
}

/**
 * Read-only handle on the collected symbol table.
 *
 * Lookup is by qualified name (e.g., `core.dim_customer`). The class
 * also exposes a `lookupBare()` for the common case where the name has
 * no container prefix and the caller wants to find the unique match
 * (returns undefined if ambiguous or missing).
 */
export class SymbolTable {
  private readonly byQualified: Map<string, SymbolEntry>;
  private readonly byBare: Map<string, SymbolEntry[]>;

  constructor (entries: ReadonlyArray<SymbolEntry>) {
    this.byQualified = new Map();
    this.byBare = new Map();
    for (const e of entries) {
      this.byQualified.set(e.qualifiedName, e);
      const list = this.byBare.get(e.name) ?? [];
      list.push(e);
      this.byBare.set(e.name, list);
    }
  }

  /** Look up by canonical qualified name. */
  lookup (qualifiedName: string): SymbolEntry | undefined {
    return this.byQualified.get(qualifiedName);
  }

  /**
   * Look up by bare name. Returns the unique entry if exactly one match,
   * or undefined when missing or ambiguous (multiple containers contain
   * an entry with this bare name). For ambiguous cases, callers should
   * inspect `lookupAllBare()` if they want to disambiguate.
   */
  lookupBare (name: string): SymbolEntry | undefined {
    const list = this.byBare.get(name);
    if (!list || list.length !== 1) return undefined;
    return list[0];
  }

  /** Look up by bare name; returns all matches. */
  lookupAllBare (name: string): ReadonlyArray<SymbolEntry> {
    return this.byBare.get(name) ?? [];
  }

  /** Iterate all entries in declaration order. */
  entries (): IterableIterator<SymbolEntry> {
    return this.byQualified.values();
  }

  /** Total number of entries. */
  get size (): number {
    return this.byQualified.size;
  }
}

/* -------------------------------------------------------------------------
 * Built-in type recognition
 *
 * Field type expressions can name a builtin scalar (`int`, `varchar`),
 * a BSON type (`objectId`), or a user-defined Named Type (`Email`).
 * The parser doesn't distinguish at parse time -- they all land as
 * ScalarType nodes (or NamedTypeReference in some contexts). The
 * resolver uses these sets to decide whether to look up a name in the
 * symbol table.
 *
 * Matching is case-insensitive: `Int`, `int`, `INT` all map to the same
 * builtin per spec §3.8.
 * ----------------------------------------------------------------------- */

const BUILTIN_TYPES = new Set<string>([
  ...SCALAR_TYPES.map((t) => t.toLowerCase()),
  ...BSON_TYPES.map((t) => t.toLowerCase()),
]);

function isBuiltinType (name: string): boolean {
  return BUILTIN_TYPES.has(name.toLowerCase());
}

/* -------------------------------------------------------------------------
 * Main entry point
 * ----------------------------------------------------------------------- */

/**
 * Resolve names in an xDBML document. Flattens the AST internally
 * (so callers don't need to call `flatten()` first), then runs the
 * two-pass resolution algorithm. Returns diagnostics and the symbol
 * table.
 *
 * Cost is roughly linear in (declarations + reference sites). For
 * typical schemas (10s-100s of entities) this is fast enough to run
 * on every keystroke in an interactive editor.
 */
export function resolveNames (doc: XDbmlDocument): ResolutionResult {
  // Always work on the flattened view so cloned declarations are visible.
  // The flatten operation is shallow-cheap relative to the resolver pass.
  const flat = flatten(doc);

  const diagnostics: Diagnostic[] = [];
  const entries: SymbolEntry[] = [];

  // Pass 1: collect declarations.
  collectDeclarations(flat, entries, diagnostics);
  const symbols = new SymbolTable(entries);

  // Pass 2: resolve references.
  resolveReferences(flat, symbols, diagnostics);

  return { diagnostics, symbols };
}

/* -------------------------------------------------------------------------
 * Pass 1: collect declarations
 * ----------------------------------------------------------------------- */

function collectDeclarations (
  doc: XDbmlDocument,
  entries: SymbolEntry[],
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>(); // qualified-name keys to detect duplicates
  for (const stmt of doc.statements) {
    addTopLevelDeclaration(stmt, entries, diagnostics, seen);
  }
}

function addTopLevelDeclaration (
  stmt: TopLevelStatement,
  entries: SymbolEntry[],
  diagnostics: Diagnostic[],
  seen: Set<string>,
): void {
  switch (stmt.kind) {
    case 'EntityDeclaration':
      addEntry(stmt.name, undefined, 'entity', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'TypeDeclaration':
      addEntry(stmt.name, undefined, 'type', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'EnumDeclaration':
      addEntry(stmt.name, undefined, 'enum', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'EdgeDeclaration':
      addEntry(stmt.name, undefined, 'edge', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'ViewDeclaration':
      addEntry(stmt.name, undefined, 'view', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'ContainerDeclaration': {
      addEntry(stmt.name, undefined, 'container', stmt, stmt.span.start, entries, diagnostics, seen);
      // Walk container body for nested entities, edges, views, enums.
      for (const body of stmt.body) {
        switch (body.kind) {
          case 'EntityDeclaration':
            addEntry(body.name, stmt.name, 'entity', body, body.span.start, entries, diagnostics, seen);
            break;
          case 'EdgeDeclaration':
            addEntry(body.name, stmt.name, 'edge', body, body.span.start, entries, diagnostics, seen);
            break;
          case 'ViewDeclaration':
            addEntry(body.name, stmt.name, 'view', body, body.span.start, entries, diagnostics, seen);
            break;
          case 'EnumDeclaration':
            addEntry(body.name, stmt.name, 'enum', body, body.span.start, entries, diagnostics, seen);
            break;
          // NoteBlock and ModuleImportDirective contribute no symbols.
          default:
            break;
        }
      }
      return;
    }
    case 'TableGroupDeclaration':
      addEntry(stmt.name, undefined, 'tablegroup', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'TablePartialDeclaration':
      addEntry(stmt.name, undefined, 'tablepartial', stmt, stmt.span.start, entries, diagnostics, seen);
      return;
    case 'NoteDeclaration':
      if (stmt.name) {
        addEntry(stmt.name, undefined, 'note', stmt, stmt.span.start, entries, diagnostics, seen);
      }
      return;
    // No symbols contributed by Project, Ref, top-level Records, ModuleImportDirective.
    default:
      return;
  }
}

function addEntry (
  name: string,
  containerName: string | undefined,
  kind: SymbolKind,
  declaration: SymbolEntry['declaration'],
  position: Position,
  entries: SymbolEntry[],
  diagnostics: Diagnostic[],
  seen: Set<string>,
): void {
  const qualifiedName = containerName ? `${containerName}.${name}` : name;
  const key = `${kind}:${qualifiedName}`;
  if (seen.has(key)) {
    diagnostics.push({
      severity: 'error',
      code: 'duplicate-declaration',
      message: `Duplicate ${kind} declaration '${qualifiedName}'. ` +
        `Each ${kind} must have a unique qualified name within its scope.`,
      position,
    });
    return;
  }
  seen.add(key);
  entries.push({
    qualifiedName,
    name,
    containerName,
    kind,
    declaration,
    position,
  });
}

/* -------------------------------------------------------------------------
 * Pass 2: resolve references
 * ----------------------------------------------------------------------- */

function resolveReferences (
  doc: XDbmlDocument,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  for (const stmt of doc.statements) {
    resolveTopLevel(stmt, symbols, diagnostics);
  }
}

function resolveTopLevel (
  stmt: TopLevelStatement,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  switch (stmt.kind) {
    case 'EntityDeclaration':
      resolveEntityBody(stmt, undefined, symbols, diagnostics);
      return;
    case 'ContainerDeclaration':
      for (const body of stmt.body) {
        if (body.kind === 'EntityDeclaration') {
          resolveEntityBody(body, stmt.name, symbols, diagnostics);
        } else if (body.kind === 'ViewDeclaration') {
          // Views have field declarations too -- walk them as if they
          // were an entity.
          resolveViewBody(body, stmt.name, symbols, diagnostics);
        }
        // EdgeDeclaration: similar shape but rare; we walk its fields
        // when present. Skip for now to keep scope tight.
      }
      return;
    case 'ViewDeclaration':
      resolveViewBody(stmt, undefined, symbols, diagnostics);
      return;
    case 'RefDeclaration':
      resolveRefSpec(stmt.spec.source, symbols, diagnostics);
      resolveRefSpec(stmt.spec.target, symbols, diagnostics);
      return;
    case 'TableGroupDeclaration':
      for (const member of stmt.members) {
        resolveTableGroupMember(member, stmt.span.start, symbols, diagnostics);
      }
      return;
    case 'TopLevelRecordsDeclaration': {
      const entity = resolveEntityRef(stmt.entityRef, symbols);
      if (!entity) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-records-entity',
          message: `Top-level records declaration refers to unknown entity '${stmt.entityRef}'.`,
          position: stmt.span.start,
        });
      } else {
        // Validate each column is a field of the entity.
        const fieldNames = new Set<string>();
        for (const item of entity.declaration.kind === 'EntityDeclaration' ? entity.declaration.body : []) {
          if (item.kind === 'FieldDeclaration') fieldNames.add(item.name);
        }
        for (const col of stmt.columns) {
          if (!fieldNames.has(col)) {
            diagnostics.push({
              severity: 'error',
              code: 'unresolved-records-column',
              message: `Records column '${col}' is not a field of entity '${stmt.entityRef}'.`,
              position: stmt.span.start,
            });
          }
        }
      }
      return;
    }
    // No reference sites in TypeDeclaration headers (their settings are
    // open-vocabulary). Field-type references inside a Type's object form
    // are handled when we walk that Type as a "pseudo-entity" body --
    // but for P6 we keep the scope tight and don't recurse into Type
    // bodies. The cost is missed unresolved-type diagnostics for fields
    // INSIDE composite Named Types, which is acceptable for v0.2.
    default:
      return;
  }
}

function resolveEntityBody (
  entity: EntityDeclaration,
  containerName: string | undefined,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  for (const item of entity.body) {
    switch (item.kind) {
      case 'FieldDeclaration':
        resolveFieldDeclaration(item, symbols, diagnostics);
        break;
      case 'PartialInjection': {
        const target = symbols.lookup(item.partialName);
        if (!target || target.kind !== 'tablepartial') {
          diagnostics.push({
            severity: 'error',
            code: 'unresolved-partial',
            message: `Partial injection '~${item.partialName}' does not resolve to a TablePartial declaration.`,
            position: item.span.start,
          });
        }
        break;
      }
      // ChecksBlock, IndexesBlock, RecordsBlock, NoteBlock: contain
      // opaque expressions or content that the resolver doesn't try to
      // type-check. Skip.
      default:
        break;
    }
  }
  void containerName; // currently unused; reserved for future "field in nested scope" diagnostics
}

function resolveViewBody (
  view: { body: ReadonlyArray<{ kind: string }> },
  containerName: string | undefined,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  // Views can contain field declarations; walk them the same way.
  for (const item of view.body) {
    if (item.kind === 'FieldDeclaration') {
      resolveFieldDeclaration(item as FieldDeclaration, symbols, diagnostics);
    }
  }
  void containerName;
}

function resolveFieldDeclaration (
  field: FieldDeclaration,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  // Resolve the field's type expression. This walks into nested object
  // types, arrays, unions, etc. recursively -- callers don't need to
  // do their own recursion.
  resolveTypeExpression(field.type, symbols, diagnostics);

  // Resolve any inline `ref:` setting on the field. Other settings
  // (notes, defaults, etc.) carry no name references that the
  // resolver tracks.
  for (const setting of field.settings) {
    if (setting.value && setting.value.kind === 'RefValue') {
      resolveRefSpec(setting.value.target, symbols, diagnostics);
    }
  }
}

function resolveTypeExpression (
  expr: TypeExpression,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  switch (expr.kind) {
    case 'ScalarType':
      // A ScalarType is either a builtin or a reference to a Named Type
      // (the parser doesn't distinguish at parse time). Look up only
      // when the name isn't a builtin.
      if (!isBuiltinType(expr.name)) {
        const found = symbols.lookup(expr.name) ?? symbols.lookupBare(expr.name);
        if (!found || found.kind !== 'type') {
          diagnostics.push({
            severity: 'error',
            code: 'unresolved-type',
            message: `Type '${expr.name}' is not a built-in type or declared Named Type.`,
            position: expr.span.start,
          });
        }
      }
      return;
    case 'NamedTypeReference': {
      const found = symbols.lookup(expr.name) ?? symbols.lookupBare(expr.name);
      if (!found || found.kind !== 'type') {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-type',
          message: `Named type '${expr.name}' is not declared.`,
          position: expr.span.start,
        });
      }
      return;
    }
    case 'ObjectType':
      for (const field of expr.fields) {
        // ObjectType.fields is `(FieldDeclaration | NoteBlock | PartialInjection)[]`.
        // Only FieldDeclaration carries a type expression to resolve;
        // PartialInjection has a name (resolved as a partial reference),
        // NoteBlock has no name resolution surface.
        if (field.kind === 'FieldDeclaration') {
          resolveTypeExpression(field.type, symbols, diagnostics);
        } else if (field.kind === 'PartialInjection') {
          const target = symbols.lookup(field.partialName);
          if (!target || target.kind !== 'tablepartial') {
            diagnostics.push({
              severity: 'error',
              code: 'unresolved-partial',
              message: `Partial injection '~${field.partialName}' does not resolve to a TablePartial declaration.`,
              position: field.span.start,
            });
          }
        }
      }
      return;
    case 'ArrayType':
      // `elementType` is optional (when the array body uses the `name type`
      // alias form, the element type is reachable via a nested structure
      // that's covered elsewhere; here we only recurse when present).
      if (expr.elementType) {
        resolveTypeExpression(expr.elementType, symbols, diagnostics);
      }
      return;
    case 'MapType':
      resolveTypeExpression(expr.keyType, symbols, diagnostics);
      resolveTypeExpression(expr.valueType, symbols, diagnostics);
      return;
    case 'SetType':
      resolveTypeExpression(expr.elementType, symbols, diagnostics);
      return;
    case 'TupleType':
      for (const elem of expr.elements) {
        resolveTypeExpression(elem.type, symbols, diagnostics);
      }
      return;
    case 'JsonType':
      // No nested type expressions.
      return;
    case 'OneOfType':
    case 'AnyOfType':
    case 'AllOfType':
      for (const alt of expr.alternatives) {
        resolveTypeExpression(alt.type, symbols, diagnostics);
      }
      return;
    case 'UnionType':
      // UnionType uses `members` (not `alternatives`), and each member is
      // a (ScalarType | NamedTypeReference | NullTypeLiteral). The first
      // two have name fields that may need resolution; NullTypeLiteral is
      // a built-in placeholder for the `null` literal and has nothing to
      // resolve, so we skip it.
      for (const member of expr.members) {
        if (member.kind !== 'NullTypeLiteral') {
          resolveTypeExpression(member, symbols, diagnostics);
        }
      }
      return;
    default:
      return;
  }
}

function resolveRefSpec (
  endpoint: RefEndpoint,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  // Extract the leading run of PathField segments from the endpoint path.
  // Non-field segments (PathArrayIndex, PathArrayWildcard, PathMapKey)
  // mark a transition into nested-field navigation; nothing past those
  // can be part of the entity name.
  const fieldSegments: string[] = [];
  for (const seg of endpoint.path) {
    if (seg.kind === 'PathField') {
      fieldSegments.push(seg.name);
    } else {
      // Stop at the first non-field segment.
      break;
    }
  }

  // Composite endpoints: `customers.(id, country_code)` -- the WHOLE
  // path is the entity reference, and compositeFields lists the fields.
  if (endpoint.compositeFields && endpoint.compositeFields.length > 0) {
    const entityPath = fieldSegments.join('.');
    const entity = resolveEntityRef(entityPath, symbols);
    if (!entity) {
      diagnostics.push({
        severity: 'error',
        code: 'unresolved-entity',
        message: `Foreign-key endpoint references unknown entity '${entityPath}'.`,
        position: endpoint.span.start,
      });
      return;
    }
    if (entity.declaration.kind === 'EntityDeclaration') {
      const fieldNameSet = collectFieldNames(entity.declaration);
      for (const fname of endpoint.compositeFields) {
        if (!fieldNameSet.has(fname)) {
          diagnostics.push({
            severity: 'error',
            code: 'unresolved-field',
            message: `Field '${fname}' is not declared on entity '${entityPath}'.`,
            position: endpoint.span.start,
          });
        }
      }
    }
    return;
  }

  // Simple endpoint: `a.b.c.d` could be "entity a.b.c, field d" or
  // "entity a.b, field c (then nested .d)" or "entity a, field b
  // (then nested .c.d)". Try longest entity prefix first; the longest
  // prefix that resolves to a declared entity wins.
  if (fieldSegments.length < 2) {
    // Need at least one entity segment and one field segment.
    return;
  }
  // Try the longest prefix as the entity, then progressively shorter
  // prefixes until we find a match (or run out).
  let entity: SymbolEntry | undefined;
  let entityPrefixLen = 0;
  for (let len = fieldSegments.length - 1; len >= 1; len -= 1) {
    const candidate = fieldSegments.slice(0, len).join('.');
    const found = resolveEntityRef(candidate, symbols);
    if (found) {
      entity = found;
      entityPrefixLen = len;
      break;
    }
  }
  if (!entity) {
    // Use the most natural-looking guess (everything except the last
    // segment) as the unresolved entity name for the diagnostic.
    const guessEntity = fieldSegments.slice(0, -1).join('.');
    diagnostics.push({
      severity: 'error',
      code: 'unresolved-entity',
      message: `Foreign-key endpoint references unknown entity '${guessEntity}'.`,
      position: endpoint.span.start,
    });
    return;
  }
  // The first segment AFTER the entity prefix is the top-level field
  // name (the field on the entity itself). Subsequent segments are
  // nested-field navigation, which the resolver doesn't validate
  // (would require walking through type expressions). For P6 we only
  // check the top-level field name.
  if (entity.declaration.kind === 'EntityDeclaration') {
    const topFieldName = fieldSegments[entityPrefixLen];
    const fieldNameSet = collectFieldNames(entity.declaration);
    if (!fieldNameSet.has(topFieldName)) {
      diagnostics.push({
        severity: 'error',
        code: 'unresolved-field',
        message: `Field '${topFieldName}' is not declared on entity '${entity.qualifiedName}'.`,
        position: endpoint.span.start,
      });
    }
  }
}

function collectFieldNames (entity: EntityDeclaration): Set<string> {
  const names = new Set<string>();
  for (const item of entity.body) {
    if (item.kind === 'FieldDeclaration') names.add(item.name);
  }
  return names;
}

function resolveTableGroupMember (
  member: string,
  position: Position,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  const found = resolveEntityRef(member, symbols);
  if (!found) {
    diagnostics.push({
      severity: 'error',
      code: 'unresolved-tablegroup-member',
      message: `TableGroup member '${member}' does not resolve to an entity.`,
      position,
    });
  }
}

/**
 * Resolve an entity reference by name. Accepts bare (`dim_customer`) or
 * qualified (`core.dim_customer`) form. Bare references are resolved
 * through the SymbolTable's bare-name lookup; ambiguous bare references
 * (matching multiple containers) return undefined.
 */
function resolveEntityRef (
  ref: string,
  symbols: SymbolTable,
): SymbolEntry | undefined {
  // Try qualified first.
  const qualified = symbols.lookup(ref);
  if (qualified && qualified.kind === 'entity') return qualified;
  // Try bare.
  if (!ref.includes('.')) {
    const bare = symbols.lookupBare(ref);
    if (bare && bare.kind === 'entity') return bare;
  }
  return undefined;
}
