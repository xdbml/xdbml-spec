/**
 * Name resolution pass (spec §27.10 / §27.15, parser batch P6).
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
  ObjectType,
  PathSegment,
  Position,
  RefEndpoint,
  Span,
  TopLevelStatement,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import { SCALAR_TYPES, BSON_TYPES } from './keywords.ts';
import { flatten } from './module-resolver.ts';
import { checkRelationships } from './relationships.ts';
import { checkSupertypeGroups } from './supertypes.ts';

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
  | 'possible-type-typo'
  | 'unresolved-entity'
  | 'unresolved-field'
  | 'unresolved-partial'
  | 'unresolved-tablegroup-member'
  | 'unresolved-records-entity'
  | 'unresolved-records-column'
  | 'empty-import'
  | 'invalid-nested-path'
  | 'foreign-master-composite'
  | 'foreign-master-duplicate-child'
  | 'foreign-master-without-ref'
  | 'construct-requires-version'
  | 'ambiguous-ref-endpoint'
  | 'invalid-constraint-type'
  | 'constraint-type-on-foreign-master'
  | 'invalid-undirected'
  | 'entity-level-many-to-many'
  // Supertype groups (spec §12, v0.5)
  | 'missing-supertype'
  | 'unresolved-supertype-group-member'
  | 'invalid-supertype-group-value'
  | 'duplicate-subtype'
  | 'supertype-is-subtype'
  | 'subtype-in-multiple-groups'
  | 'supertype-cycle'
  | 'supertype-attribute-redeclared'
  | 'discriminator-on-overlapping-group'
  | 'merge-without-roll-up'
  | 'empty-supertype-group';

/**
 * A single resolution diagnostic. Severity is currently always `error`,
 * but the field is included to leave room for future warnings (e.g.,
 * style concerns like "redundant alias matches original name").
 *
 * Position is given as a Span (start + end) rather than a single Position
 * so editor integrations (Monaco markers, LSP servers) can underline the
 * exact offending construct rather than guessing where the squiggle
 * should end. Each diagnostic's span corresponds to an AST node's own
 * span (a field's type expression, a path endpoint, an entity name).
 */
export interface Diagnostic {
  severity: 'error' | 'warning';
  code: DiagnosticCode;
  message: string;
  span: Span;
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
 * a BSON type (`objectId`), a user-defined Named Type (`Email`) or Enum,
 * or any other target-native type (`number`, `clob`, `serial`). The
 * parser doesn't distinguish at parse time -- they all land as
 * ScalarType nodes (or NamedTypeReference in some contexts). The
 * resolver uses these sets only to skip the symbol-table lookup for
 * names that can never be a Named Type reference.
 *
 * The sets are not a type vocabulary. Scalar type names pass through
 * as written (spec §1.2, principle 4), so a name that is neither a
 * builtin nor a declared Type or Enum is a target-native type, not an
 * error. See `nearMissTypeName()` for the one diagnostic such a name
 * can raise.
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

/**
 * The declared Types and Enums a bare type name can refer to. More than
 * one entry means the name is declared in several containers (Enums can
 * be container-scoped); the name still refers to a declaration, so it
 * is neither a target-native type nor a near miss.
 */
function typeOrEnumDeclarations (name: string, symbols: SymbolTable): SymbolEntry[] {
  const qualified = symbols.lookup(name);
  if (qualified && (qualified.kind === 'type' || qualified.kind === 'enum')) return [qualified];
  return symbols.lookupAllBare(name).filter((e) => e.kind === 'type' || e.kind === 'enum');
}

/**
 * Near-miss detection for target-native type names.
 *
 * A type name that is neither a builtin nor a declared Type or Enum is
 * accepted as a target-native type. The one case worth flagging is a
 * name that differs only slightly from a declared Type or Enum -- most
 * likely a misspelling (`Adress` for `Address`, `email` for `Email`).
 * Returns the declared name to suggest, or undefined when nothing is
 * close enough.
 *
 * Comparison is case-insensitive, so a difference of case alone counts
 * as a near miss (identifiers are case-sensitive, spec §3.8). The edit
 * distance allowed grows with the length of the name: none beyond case
 * for three characters or fewer, one edit up to seven characters, two
 * edits from eight. An adjacent transposition counts as one edit.
 */
function nearMissTypeName (name: string, symbols: SymbolTable): string | undefined {
  const lower = name.toLowerCase();
  const maxDistance = lower.length <= 3 ? 0 : lower.length <= 7 ? 1 : 2;
  // A qualified name (`core.job_stauts`) compares against qualified
  // declarations, a bare name against bare ones.
  const qualified = name.includes('.');
  let best: { name: string; distance: number } | undefined;
  for (const entry of symbols.entries()) {
    if (entry.kind !== 'type' && entry.kind !== 'enum') continue;
    const declared = qualified ? entry.qualifiedName : entry.name;
    const candidate = declared.toLowerCase();
    if (Math.abs(candidate.length - lower.length) > maxDistance) continue;
    const distance = editDistance(lower, candidate, maxDistance);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { name: declared, distance };
    }
  }
  return best?.name;
}

/**
 * Optimal string alignment distance (Levenshtein plus adjacent
 * transposition). Returns `limit + 1` as soon as every alignment of a
 * row exceeds `limit`, since callers only compare against the limit.
 */
function editDistance (a: string, b: string, limit: number): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = [];
  for (let i = 0; i < rows; i++) {
    d.push(new Array<number>(cols).fill(0));
    d[i][0] = i;
  }
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[rows - 1][cols - 1];
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

  // Pass 3: relationship rules that the grammar cannot express (spec 11.11).
  diagnostics.push(...checkRelationships(flat));

  // Pass 4: supertype group rules (spec 12.8).
  diagnostics.push(...checkSupertypeGroups(flat));

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
      addEntry(stmt.name, undefined, 'entity', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'TypeDeclaration':
      addEntry(stmt.name, undefined, 'type', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'EnumDeclaration': {
      // `enum core.job_status { ... }` (the DBML form) files the Enum
      // under container `core`, exactly as `Container core { Enum
      // job_status { ... } }` does: same qualified name, same bare name,
      // and declaring both is a duplicate (spec §16).
      const dot = stmt.name.lastIndexOf('.');
      if (dot > 0) {
        addEntry(stmt.name.slice(dot + 1), stmt.name.slice(0, dot), 'enum', stmt, stmt.span, entries, diagnostics, seen);
      } else {
        addEntry(stmt.name, undefined, 'enum', stmt, stmt.span, entries, diagnostics, seen);
      }
      return;
    }
    case 'EdgeDeclaration':
      addEntry(stmt.name, undefined, 'edge', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'ViewDeclaration':
      addEntry(stmt.name, undefined, 'view', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'ContainerDeclaration': {
      addEntry(stmt.name, undefined, 'container', stmt, stmt.span, entries, diagnostics, seen);
      // Walk container body for nested entities, edges, views, enums.
      for (const body of stmt.body) {
        switch (body.kind) {
          case 'EntityDeclaration':
            addEntry(body.name, stmt.name, 'entity', body, body.span, entries, diagnostics, seen);
            break;
          case 'EdgeDeclaration':
            addEntry(body.name, stmt.name, 'edge', body, body.span, entries, diagnostics, seen);
            break;
          case 'ViewDeclaration':
            addEntry(body.name, stmt.name, 'view', body, body.span, entries, diagnostics, seen);
            break;
          case 'EnumDeclaration':
            addEntry(body.name, stmt.name, 'enum', body, body.span, entries, diagnostics, seen);
            break;
          // NoteBlock and ModuleImportDirective contribute no symbols.
          default:
            break;
        }
      }
      return;
    }
    case 'TableGroupDeclaration':
      addEntry(stmt.name, undefined, 'tablegroup', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'TablePartialDeclaration':
      addEntry(stmt.name, undefined, 'tablepartial', stmt, stmt.span, entries, diagnostics, seen);
      return;
    case 'NoteDeclaration':
      if (stmt.name) {
        addEntry(stmt.name, undefined, 'note', stmt, stmt.span, entries, diagnostics, seen);
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
  span: Span,
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
      span,
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
    position: span.start,
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
        resolveTableGroupMember(member, stmt.span, symbols, diagnostics);
      }
      return;
    case 'TopLevelRecordsDeclaration': {
      const entity = resolveEntityRef(stmt.entityRef, symbols);
      if (!entity) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-records-entity',
          message: `Top-level records declaration refers to unknown entity '${stmt.entityRef}'.`,
          span: stmt.span,
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
              span: stmt.span,
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
            span: item.span,
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
      // A ScalarType is a builtin, a reference to a declared Type or
      // Enum, or a target-native type passed through as written (spec
      // §1.2, principle 4) -- the parser doesn't distinguish at parse
      // time. A target-native name is valid; the only diagnostic is a
      // warning when it is a near miss of a declared Type or Enum.
      if (!isBuiltinType(expr.name) && typeOrEnumDeclarations(expr.name, symbols).length === 0) {
        const suggestion = nearMissTypeName(expr.name, symbols);
        if (suggestion) {
          diagnostics.push({
            severity: 'warning',
            code: 'possible-type-typo',
            message: `Type '${expr.name}' is not declared; did you mean '${suggestion}'? Otherwise it is kept as a target-native type.`,
            span: expr.span,
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
          span: expr.span,
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
              span: field.span,
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
  // Foreign-key endpoint resolution proceeds in four phases:
  //
  //   PHASE 1  Find the entity. The entity is the longest leading run of
  //            PathField segments that resolves to a declared entity.
  //
  //   PHASE 2  Compute the post-entity path -- the segments that name a
  //            field on the entity and (optionally) navigate into the
  //            field's type. Includes any non-PathField segments (array
  //            wildcards, indices, map keys) that follow.
  //
  //   PHASE 3  Validate the top-level field exists on the entity.
  //
  //   PHASE 4  If more segments remain, walk the field's type expression
  //            consuming one segment at a time. Composite endpoints
  //            (`(f1, f2)`) get validated against whichever type the walk
  //            lands on (the entity itself, or a nested object).
  //
  // The walker handles ObjectType field access, Array/Set wildcards and
  // indices, Map key access, Tuple positional access, and Named Type
  // dereferencing (with a depth limit to break cycles).

  // PHASE 1: collect leading PathField run.
  const leadingFields: string[] = [];
  for (const seg of endpoint.path) {
    if (seg.kind === 'PathField') {
      leadingFields.push(seg.name);
    } else {
      // Stop at the first non-field segment -- nothing past it can be
      // part of the entity name.
      break;
    }
  }
  if (leadingFields.length === 0) return;

  const hasComposite = !!(endpoint.compositeFields && endpoint.compositeFields.length > 0);
  const hasNonFieldTail = endpoint.path.length > leadingFields.length;

  // Decide how many leading PathFields could form the entity. If there
  // are non-field segments after the leading run (e.g., `[*]`), the
  // entity must end at least one PathField before, because navigation
  // through array/map/etc. can only begin AFTER a field has been
  // selected. If there are no non-field segments and no composite
  // (the simple `a.b.c` case), the entity is everything except the last
  // segment. With composite and no nested tail, the entity can be the
  // ENTIRE leading run -- composite fields are listed separately.
  let maxEntityLen: number;
  if (hasNonFieldTail) {
    maxEntityLen = leadingFields.length - 1;
  } else if (hasComposite) {
    maxEntityLen = leadingFields.length;
  } else {
    maxEntityLen = leadingFields.length - 1;
  }
  // An entity-level endpoint (spec 11.16) names an entity and stops there:
  // `Customer`, or `shop.orders` for an entity inside a container. It is
  // checked as a fallback rather than first, so an endpoint that already
  // resolved as entity-plus-attribute keeps that reading and every document
  // that parsed before this means what it meant before.
  const wholePath = leadingFields.join('.');
  const entityLevelMatch = (!hasComposite && !hasNonFieldTail)
    ? resolveEntityRef(wholePath, symbols)
    : undefined;

  if (maxEntityLen < 1) {
    // A single segment cannot be entity-plus-attribute, so it is either an
    // entity-level endpoint or a reference to something undeclared.
    if (!entityLevelMatch) {
      diagnostics.push({
        severity: 'error',
        code: 'unresolved-entity',
        message: `Relationship endpoint references unknown entity '${wholePath}'.`,
        span: endpoint.span,
      });
    }
    return;
  }

  // PHASE 1 (cont'd): longest-prefix entity match.
  let entity: SymbolEntry | undefined;
  let entityPrefixLen = 0;
  for (let len = maxEntityLen; len >= 1; len -= 1) {
    const candidate = leadingFields.slice(0, len).join('.');
    const found = resolveEntityRef(candidate, symbols);
    if (found) {
      entity = found;
      entityPrefixLen = len;
      break;
    }
  }
  if (!entity) {
    if (entityLevelMatch) return; // entity-level endpoint; nothing further to check
    const guess = leadingFields.slice(0, maxEntityLen).join('.');
    diagnostics.push({
      severity: 'error',
      code: 'unresolved-entity',
      message: `Relationship endpoint references unknown entity '${guess}'.`,
      span: endpoint.span,
    });
    return;
  }
  if (entityLevelMatch) {
    // Both readings exist: `a.b` names an entity, and `a` names an entity
    // with a field `b`. The attribute reading wins, and the collision is
    // reported so the author can qualify the path differently.
    diagnostics.push({
      severity: 'warning',
      code: 'ambiguous-ref-endpoint',
      message:
        `Endpoint '${wholePath}' names both an entity and a field of entity '${entity.qualifiedName}'. ` +
        'Reading it as the field; rename one of them or qualify the path to remove the ambiguity.',
      span: endpoint.span,
    });
  }
  if (entity.declaration.kind !== 'EntityDeclaration') return;

  // PHASE 2: compute the post-entity portion of endpoint.path.
  const remaining = endpoint.path.slice(entityPrefixLen);

  // Special case: path is JUST the entity (no remaining segments). With
  // composite, validate composite fields against the entity body.
  if (remaining.length === 0) {
    if (hasComposite) {
      const fieldNameSet = collectFieldNames(entity.declaration);
      for (const fname of endpoint.compositeFields!) {
        if (!fieldNameSet.has(fname)) {
          diagnostics.push({
            severity: 'error',
            code: 'unresolved-field',
            message: `Field '${fname}' is not declared on entity '${entity.qualifiedName}'.`,
            span: endpoint.span,
          });
        }
      }
    }
    return;
  }

  // PHASE 3: the first remaining segment is the top-level field name.
  const topSeg = remaining[0];
  if (topSeg.kind !== 'PathField') {
    // E.g., entity followed immediately by `[*]`. Structurally invalid
    // because navigation can only begin after a field selection.
    diagnostics.push({
      severity: 'error',
      code: 'invalid-nested-path',
      message: `Foreign-key path on entity '${entity.qualifiedName}' starts with a non-field segment; expected a field name first.`,
      span: topSeg.span,
    });
    return;
  }
  const topField = entity.declaration.body.find(
    (item) => item.kind === 'FieldDeclaration' && item.name === topSeg.name,
  ) as FieldDeclaration | undefined;
  if (!topField) {
    diagnostics.push({
      severity: 'error',
      code: 'unresolved-field',
      message: `Field '${topSeg.name}' is not declared on entity '${entity.qualifiedName}'.`,
      span: topSeg.span,
    });
    return;
  }

  // PHASE 4: walk the field's type for any further segments.
  let finalType: TypeExpression | undefined = topField.type;
  if (remaining.length > 1) {
    const nested = remaining.slice(1);
    finalType = walkTypePath(topField.type, nested, symbols, diagnostics, 0);
    // walkTypePath returns undefined on error (and has already emitted
    // a diagnostic). Continue to composite validation only when the walk
    // succeeded.
    if (!finalType) return;
  }

  // Composite endpoint: validate composite fields against the final type.
  if (hasComposite) {
    const compositeFieldNames = extractFieldNamesFromType(finalType, symbols);
    if (!compositeFieldNames) {
      // The final type isn't an object-shaped type, so composite-field
      // validation can't apply. Emit a structural diagnostic.
      diagnostics.push({
        severity: 'error',
        code: 'invalid-nested-path',
        message: `Cannot apply composite fields (${endpoint.compositeFields!.join(', ')}) at this point in the path; the navigated type is not an object.`,
        span: endpoint.span,
      });
      return;
    }
    for (const fname of endpoint.compositeFields!) {
      if (!compositeFieldNames.has(fname)) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-field',
          message: `Field '${fname}' is not declared at the FK endpoint's nested object type.`,
          span: endpoint.span,
        });
      }
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

/* -------------------------------------------------------------------------
 * Type-path navigation (nested-field FK validation)
 *
 * Given a starting `TypeExpression` and a sequence of `PathSegment`s,
 * walk the type structure consuming one segment at a time. Each segment
 * shapes how we advance:
 *
 *   PathField              -> requires an ObjectType; selects the named field
 *   PathArrayWildcard [*]  -> requires Array/Set; advances to the element type
 *   PathArrayIndex [N]     -> Array (-> element), Tuple (-> position N's type)
 *   PathMapKey [k]         -> requires MapType; advances to the value type
 *
 * Named Types are dereferenced on entry (a `ScalarType` whose name isn't
 * a built-in or a `NamedTypeReference` -> look up in the symbol table;
 * if a scalar Named Type, deref to its base; if an object Named Type,
 * synthesize an ObjectType wrapping its body). A depth limit breaks
 * pathological cycles (`Type A B; Type B A`).
 *
 * On structural failure (wrong shape for the segment) or unresolved
 * names, the walker emits a diagnostic and returns undefined. On success
 * it returns the type after consuming all segments.
 * ----------------------------------------------------------------------- */

const MAX_TYPE_WALK_DEPTH = 16;

function walkTypePath (
  startType: TypeExpression,
  segments: ReadonlyArray<PathSegment>,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  depth: number,
): TypeExpression | undefined {
  let current: TypeExpression = startType;
  for (const seg of segments) {
    const next = stepIntoType(current, seg, symbols, diagnostics, depth);
    if (!next) return undefined;
    current = next;
  }
  return current;
}

function stepIntoType (
  current: TypeExpression,
  seg: PathSegment,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
  depth: number,
): TypeExpression | undefined {
  // Dereference Named Types up front so the segment-kind switch below
  // operates on the structural form.
  const resolved = dereferenceNamedType(current, symbols, depth);
  if (!resolved) return undefined; // depth limit hit (or unresolved Named Type)
  current = resolved;

  switch (seg.kind) {
    case 'PathField': {
      // Field access is only meaningful on ObjectType. Other shapes
      // (array/map/set/tuple) require an explicit element-access segment
      // first ([*], [N], [key]).
      if (current.kind !== 'ObjectType') {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-nested-path',
          message: `Cannot navigate field '${seg.name}' through ${current.kind}; use [*] (array/set), [N] (tuple), or [key] (map) before naming a field.`,
          span: seg.span,
        });
        return undefined;
      }
      const field = current.fields.find(
        (f) => f.kind === 'FieldDeclaration' && f.name === seg.name,
      ) as FieldDeclaration | undefined;
      if (!field) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-field',
          message: `Field '${seg.name}' is not declared on the nested object type.`,
          span: seg.span,
        });
        return undefined;
      }
      return field.type;
    }
    case 'PathArrayWildcard': {
      if (current.kind === 'ArrayType') {
        if (!current.elementType) {
          // `array [name type]` form -- the element type lives elsewhere
          // (elementName + elementSettings). For walker purposes, treat
          // the array as having an opaque element and stop walking
          // further by returning undefined silently (no diagnostic; this
          // is a v0.2 shape the spec calls out as alias-only).
          diagnostics.push({
            severity: 'error',
            code: 'invalid-nested-path',
            message: `Array uses the alias 'name type' form which does not expose a navigable element type for further path traversal.`,
            span: seg.span,
          });
          return undefined;
        }
        return current.elementType;
      }
      if (current.kind === 'SetType') {
        return current.elementType;
      }
      diagnostics.push({
        severity: 'error',
        code: 'invalid-nested-path',
        message: `Array wildcard [*] is only valid on array or set types, not ${current.kind}.`,
        span: seg.span,
      });
      return undefined;
    }
    case 'PathArrayIndex': {
      if (current.kind === 'ArrayType') {
        return current.elementType;
      }
      if (current.kind === 'TupleType') {
        const elem = current.elements.find((e) => e.position === seg.index);
        if (!elem) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-nested-path',
            message: `Tuple has no element at position [${seg.index}].`,
            span: seg.span,
          });
          return undefined;
        }
        return elem.type;
      }
      diagnostics.push({
        severity: 'error',
        code: 'invalid-nested-path',
        message: `Numeric index [${seg.index}] is only valid on array or tuple types, not ${current.kind}.`,
        span: seg.span,
      });
      return undefined;
    }
    case 'PathMapKey': {
      if (current.kind === 'MapType') {
        return current.valueType;
      }
      diagnostics.push({
        severity: 'error',
        code: 'invalid-nested-path',
        message: `Map key [${seg.key}] is only valid on map types, not ${current.kind}.`,
        span: seg.span,
      });
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Resolve a TypeExpression to its structural form by chasing through
 * Named Type references. Returns the resolved type, or undefined when
 * the depth limit is hit (cycle) or the Named Type doesn't exist (in
 * which case the field-type resolver has already emitted a diagnostic
 * elsewhere -- we silently fail here to avoid duplicate errors).
 *
 * For object-form Named Types, synthesizes an ObjectType wrapping the
 * Type's body so callers can navigate via PathField uniformly.
 */
function dereferenceNamedType (
  type: TypeExpression,
  symbols: SymbolTable,
  depth: number,
): TypeExpression | undefined {
  if (depth > MAX_TYPE_WALK_DEPTH) return undefined;

  // ScalarType might be a Named Type reference (parser ambiguity).
  // NamedTypeReference always is.
  let name: string | undefined;
  if (type.kind === 'ScalarType' && !isBuiltinType(type.name)) {
    name = type.name;
  } else if (type.kind === 'NamedTypeReference') {
    name = type.name;
  } else {
    // Already a structural form.
    return type;
  }

  const sym = symbols.lookup(name) ?? symbols.lookupBare(name);
  if (type.kind === 'ScalarType' && (!sym || sym.kind !== 'type')) {
    // An Enum or a target-native type: an opaque scalar, so a path that
    // navigates into it gets the walker's shape diagnostic. A name
    // declared as a Type or Enum in several containers stays unresolved.
    if (typeOrEnumDeclarations(name, symbols).length > 1) return undefined;
    return type;
  }
  if (!sym || sym.kind !== 'type' || sym.declaration.kind !== 'TypeDeclaration') {
    // Unresolved Named Type reference -- the field-type pass diagnoses
    // this. Return undefined so the walker bails without emitting a
    // duplicate error.
    return undefined;
  }
  const td = sym.declaration;
  if (td.scalarBase) {
    // Scalar Named Type -- recurse through to the base.
    return dereferenceNamedType(td.scalarBase, symbols, depth + 1);
  }
  // Object-form Named Type. Synthesize an ObjectType so the walker can
  // navigate its fields uniformly. The span points at the Type
  // declaration; segment-level positions remain correct because we don't
  // use the synthetic ObjectType's span for diagnostics.
  const synthesized: ObjectType = {
    kind: 'ObjectType',
    keyword: 'object',
    fields: td.body,
    span: td.span,
  };
  return synthesized;
}

/**
 * Get the set of declared field names on a type, dereferencing Named
 * Types as needed. Returns undefined when the type isn't an object-shaped
 * type at all (composite-field validation can't apply).
 */
function extractFieldNamesFromType (
  type: TypeExpression,
  symbols: SymbolTable,
): Set<string> | undefined {
  const resolved = dereferenceNamedType(type, symbols, 0);
  if (!resolved || resolved.kind !== 'ObjectType') return undefined;
  const names = new Set<string>();
  for (const f of resolved.fields) {
    if (f.kind === 'FieldDeclaration') names.add(f.name);
  }
  return names;
}

function resolveTableGroupMember (
  member: string,
  span: Span,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  const found = resolveEntityRef(member, symbols);
  if (!found) {
    diagnostics.push({
      severity: 'error',
      code: 'unresolved-tablegroup-member',
      message: `TableGroup member '${member}' does not resolve to an entity.`,
      span,
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
