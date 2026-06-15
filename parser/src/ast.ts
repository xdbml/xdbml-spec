/**
 * xDBML AST node types.
 *
 * The AST is intentionally narrow: each node carries only what's needed
 * to round-trip xDBML source and to feed a downstream lowering pass
 * (DDL emitters, JSON Schema emitters, etc.). Generic open-vocabulary
 * settings are kept as Setting nodes rather than promoted to typed
 * fields, because the spec leaves the settings vocabulary open.
 */

export interface Position {
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
  /** 0-indexed byte offset into the source */
  offset: number;
}

export interface Span {
  start: Position;
  end: Position;
}

/* -------------------------------------------------------------------------
 * Top-level document
 * ----------------------------------------------------------------------- */

export interface XDbmlDocument {
  kind: 'XDbmlDocument';
  /** Present when the document opens with `xdbml: 0.1`. DBML-compat documents have this undefined. */
  version?: VersionDeclaration;
  experimental?: ExperimentalDeclaration;
  statements: TopLevelStatement[];
  span: Span;
}

export interface VersionDeclaration {
  kind: 'VersionDeclaration';
  /** The literal source text, e.g. "0.1" or "0.1.0". Semver shape validated at parse. */
  version: string;
  span: Span;
}

export interface ExperimentalDeclaration {
  kind: 'ExperimentalDeclaration';
  features: string[];
  span: Span;
}

export type TopLevelStatement =
  | ProjectDeclaration
  | ContainerDeclaration
  | EntityDeclaration
  | TypeDeclaration
  | EdgeDeclaration
  | ViewDeclaration
  | EnumDeclaration
  | RefDeclaration
  | TablePartialDeclaration
  | TableGroupDeclaration
  | NoteDeclaration
  | TopLevelRecordsDeclaration
  | ModuleImportDirective;

/* -------------------------------------------------------------------------
 * Project
 * ----------------------------------------------------------------------- */

export interface ProjectDeclaration {
  kind: 'ProjectDeclaration';
  name: string;
  body: ProjectBodyItem[];
  span: Span;
}

export type ProjectBodyItem = Setting | NoteBlock;

/* -------------------------------------------------------------------------
 * Container (xDBML §6)
 *
 * `Container core [type: schema, target: Oracle] { ... }`
 *
 * The keyword captures which synonym was used (Container | Schema | Database |
 * Keyspace | Namespace | Dataset | Bucket) for round-trip fidelity. All
 * variants share the same AST shape.
 * ----------------------------------------------------------------------- */

export interface ContainerDeclaration {
  kind: 'ContainerDeclaration';
  keyword: ContainerKeyword;
  name: string;
  settings: Setting[];
  body: ContainerBodyItem[];
  span: Span;
}

export type ContainerKeyword =
  | 'Container'
  | 'Schema'
  | 'Database'
  | 'Keyspace'
  | 'Namespace'
  | 'Dataset'
  | 'Bucket';

export type ContainerBodyItem =
  | EntityDeclaration
  | EdgeDeclaration
  | ViewDeclaration
  | EnumDeclaration
  | NoteBlock
  | ModuleImportDirective;

/* -------------------------------------------------------------------------
 * Entity (Table | Entity | Collection | Record)
 * ----------------------------------------------------------------------- */

export interface EntityDeclaration {
  kind: 'EntityDeclaration';
  keyword: EntityKeyword;
  /** May be `container.entity` form when declared schema-qualified */
  name: string;
  /** Optional `as Alias` */
  alias?: string;
  settings: Setting[];
  body: EntityBodyItem[];
  span: Span;
}

export type EntityKeyword = 'Table' | 'Entity' | 'Collection' | 'Record';

export type EntityBodyItem =
  | FieldDeclaration
  | IndexesBlock
  | ChecksBlock
  | NoteBlock
  | PartialInjection
  | RecordsBlock;

/* -------------------------------------------------------------------------
 * Field
 *
 * A field declaration carries a name, a type expression (possibly nested),
 * and an optional settings bracket. The type expression can be any of:
 *
 *   - a scalar like `int`, `varchar(255)`, `Decimal128`, `objectId`
 *   - a named-type reference like `Address`
 *   - a structural type: `object { ... }`, `array [ ... ]`, `map [k, v]`, `set [t]`
 *   - a polymorphism: `union [t, t]`, `oneOf { ... }`, `anyOf { ... }`, `allOf { ... }`
 *   - a JSON-with-schema: `json { ... }` (block optional)
 * ----------------------------------------------------------------------- */

export interface FieldDeclaration {
  kind: 'FieldDeclaration';
  name: string;
  /** True when the name came from a quoted identifier ("first name") */
  nameQuoted: boolean;
  type: TypeExpression;
  settings: Setting[];
  span: Span;
}

export type TypeExpression =
  | ScalarType
  | ObjectType
  | ArrayType
  | TupleType
  | MapType
  | SetType
  | UnionType
  | OneOfType
  | AnyOfType
  | AllOfType
  | JsonType
  | NamedTypeReference;

export interface ScalarType {
  kind: 'ScalarType';
  /** The base name: `int`, `varchar`, `decimal`, `objectId`, `Decimal128`, etc. */
  name: string;
  /** `(p, s)` parameters, e.g. for `decimal(19, 4)`. Numbers preserved as strings to keep round-trip fidelity. */
  params?: string[];
  span: Span;
}

export interface NamedTypeReference {
  kind: 'NamedTypeReference';
  name: string;
  span: Span;
}

export interface ObjectType {
  kind: 'ObjectType';
  /** Captures whether the source used `object`, `struct`, or `record` */
  keyword: 'object' | 'struct' | 'record';
  fields: (FieldDeclaration | NoteBlock | PartialInjection)[];
  span: Span;
}

export interface ArrayType {
  kind: 'ArrayType';
  keyword: 'array' | 'list';
  /** The element type when the array is homogeneous (`array [varchar]`). */
  elementType?: TypeExpression;
  /** When the array body uses `name type` form, e.g. `array [line_item object {...}]`, this carries the element name. */
  elementName?: string;
  /** Optional settings applied to the element type itself (rare). */
  elementSettings?: Setting[];
  span: Span;
}

export interface TupleType {
  kind: 'TupleType';
  /** Positional elements with `[N] name type` */
  elements: TupleElement[];
  span: Span;
}

export interface TupleElement {
  kind: 'TupleElement';
  position: number;
  name: string;
  type: TypeExpression;
  settings: Setting[];
  span: Span;
}

export interface MapType {
  kind: 'MapType';
  keyword: 'map' | 'dict' | 'dictionary';
  keyType: TypeExpression;
  valueType: TypeExpression;
  span: Span;
}

export interface SetType {
  kind: 'SetType';
  elementType: TypeExpression;
  span: Span;
}

export interface UnionType {
  kind: 'UnionType';
  members: (ScalarType | NamedTypeReference | NullTypeLiteral)[];
  span: Span;
}

export interface NullTypeLiteral {
  kind: 'NullTypeLiteral';
  span: Span;
}

export interface OneOfType {
  kind: 'OneOfType';
  alternatives: PolymorphicAlternative[];
  settings: Setting[];
  span: Span;
}

export interface AnyOfType {
  kind: 'AnyOfType';
  alternatives: PolymorphicAlternative[];
  settings: Setting[];
  span: Span;
}

export interface AllOfType {
  kind: 'AllOfType';
  alternatives: PolymorphicAlternative[];
  settings: Setting[];
  span: Span;
}

export interface PolymorphicAlternative {
  kind: 'PolymorphicAlternative';
  name: string;
  type: TypeExpression;
  settings: Setting[];
  span: Span;
}

export interface JsonType {
  kind: 'JsonType';
  /** `json`, `jsonb`, or `variant` */
  keyword: 'json' | 'jsonb' | 'variant';
  /** Optional schema block; absence = opaque JSON column */
  fields?: (FieldDeclaration | NoteBlock | PartialInjection)[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Named Type (§13)
 * ----------------------------------------------------------------------- */

export interface TypeDeclaration {
  kind: 'TypeDeclaration';
  name: string;
  /**
   * v0.2 scalar form (spec §14.7): when present, this Type is an alias
   * for the given type expression rather than an object-shaped record.
   * Examples:
   *
   *     Type Email varchar [pattern: '...', tags: ['pii']]
   *     Type Percentage decimal(5,2) [minimum: 0, maximum: 100]
   *
   * When `scalarBase` is set, `body` is empty and `settings` carries the
   * full field-level validation surface (pattern, length bounds, range
   * bounds, AI-readiness tags, notes, x_* custom properties).
   *
   * When `scalarBase` is undefined, the Type uses the v0.1 object form
   * (`Type Name { ...fields }`) and `body` carries the field declarations.
   *
   * Both forms can be used in the same file. Consumers that care about
   * which form was used look at this field.
   */
  scalarBase?: TypeExpression;
  settings: Setting[];
  body: (FieldDeclaration | NoteBlock | PartialInjection)[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Edge (§11)
 * ----------------------------------------------------------------------- */

export interface EdgeDeclaration {
  kind: 'EdgeDeclaration';
  name: string;
  settings: Setting[];
  body: EntityBodyItem[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * View (§12)
 * ----------------------------------------------------------------------- */

export interface ViewDeclaration {
  kind: 'ViewDeclaration';
  name: string;
  settings: Setting[];
  body: ViewBodyItem[];
  span: Span;
}

export type ViewBodyItem =
  | FieldDeclaration
  | NoteBlock
  | SourceQueryItem;

export interface SourceQueryItem {
  kind: 'SourceQueryItem';
  /** The raw query string. Opaque to the parser. */
  query: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Enum
 * ----------------------------------------------------------------------- */

export interface EnumDeclaration {
  kind: 'EnumDeclaration';
  /** Source casing of `enum` or `Enum`; both are valid. */
  keywordCasing: string;
  name: string;
  values: EnumValue[];
  span: Span;
}

export interface EnumValue {
  kind: 'EnumValue';
  name: string;
  nameQuoted: boolean;
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Ref (§10)
 * ----------------------------------------------------------------------- */

export interface RefDeclaration {
  kind: 'RefDeclaration';
  /** Optional named ref */
  name?: string;
  spec: RefSpec;
  settings: Setting[];
  span: Span;
}

export interface RefSpec {
  kind: 'RefSpec';
  source: RefEndpoint;
  operator: CardinalityOperator;
  target: RefEndpoint;
  span: Span;
}

export type CardinalityOperator = '<' | '>' | '-' | '<>';

export interface RefEndpoint {
  kind: 'RefEndpoint';
  /**
   * The dotted path. Composite FK form `customers.(id, country_code)` is
   * captured by `compositeFields` being non-empty.
   */
  path: PathSegment[];
  compositeFields?: string[];
  span: Span;
}

export type PathSegment =
  | PathField
  | PathArrayIndex
  | PathArrayWildcard
  | PathMapKey;

export interface PathField {
  kind: 'PathField';
  name: string;
  /** True for `.alternative_name` selectors through polymorphism */
  isAlternativeSelector?: boolean;
  span: Span;
}

export interface PathArrayIndex {
  kind: 'PathArrayIndex';
  index: number;
  span: Span;
}

export interface PathArrayWildcard {
  kind: 'PathArrayWildcard';
  span: Span;
}

export interface PathMapKey {
  kind: 'PathMapKey';
  key: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Indexes
 * ----------------------------------------------------------------------- */

export interface IndexesBlock {
  kind: 'IndexesBlock';
  entries: IndexEntry[];
  span: Span;
}

export interface IndexEntry {
  kind: 'IndexEntry';
  /** When this is a composite index, multiple components; otherwise one. */
  components: IndexComponent[];
  settings: Setting[];
  span: Span;
}

export type IndexComponent = IndexPathComponent | IndexExpressionComponent;

export interface IndexPathComponent {
  kind: 'IndexPathComponent';
  path: PathSegment[];
  span: Span;
}

export interface IndexExpressionComponent {
  kind: 'IndexExpressionComponent';
  /** Source text inside the backticks, no surrounding backticks */
  expression: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Checks (entity-level constraints; spec §10, new in v0.2)
 *
 * Multi-column constraint expressions inside an entity body, a peer of the
 * indexes block. Each entry is a backtick-wrapped expression in the target
 * engine's expression language, optionally followed by bracket settings
 * (`name:` for the constraint name in generated DDL, `note:` for free text).
 *
 *     Entity users {
 *       id     int [pk]
 *       wealth decimal(15,2)
 *       debt   decimal(15,2)
 *       checks {
 *         `debt + wealth >= 0` [name: 'chk_positive_net_worth']
 *         `wealth >= 0`
 *       }
 *     }
 *
 * The expression is treated as an opaque target-engine string. xDBML does
 * not parse or validate the expression syntax (per spec §10.3). Generators
 * emit it verbatim or normalize it for the target.
 * ----------------------------------------------------------------------- */

export interface ChecksBlock {
  kind: 'ChecksBlock';
  entries: CheckEntry[];
  span: Span;
}

export interface CheckEntry {
  kind: 'CheckEntry';
  /** Source text inside the backticks, no surrounding backticks. */
  expression: string;
  /** Optional settings -- typically `name:` and/or `note:`. */
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Table Partial / Table Group
 * ----------------------------------------------------------------------- */

export interface TablePartialDeclaration {
  kind: 'TablePartialDeclaration';
  name: string;
  settings: Setting[];
  body: EntityBodyItem[];
  span: Span;
}

export interface TableGroupDeclaration {
  kind: 'TableGroupDeclaration';
  name: string;
  settings: Setting[];
  members: string[];
  span: Span;
}

export interface PartialInjection {
  kind: 'PartialInjection';
  /** Identifier after the `~`. */
  partialName: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Records (sample data, §24)
 * ----------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * Records (spec §25, expanded in v0.2)
 *
 * Records declare sample data inline in the schema. Two forms:
 *
 *   - Inside an entity body, implicit column list (§25.1):
 *       records {
 *         1, 'Alice', 'alice@example.com'
 *         2, 'Bob',   'bob@example.com'
 *       }
 *     Values are assigned to fields in declaration order.
 *
 *   - Top-level, explicit column list (§25.2, new in v0.2):
 *       records users (id, name, email) {
 *         1, 'Alice', 'alice@example.com'
 *       }
 *     Columns not in the list default to null or the field's declared default.
 *
 * Each row is a comma-separated list of values on a single source line; rows
 * are separated by newlines. Trailing commas at end-of-row are tolerated.
 * Multi-line values are supported via triple-quoted strings (the line check
 * uses the comma's line vs the next-value's line, so a triple-quoted value
 * doesn't break row continuation).
 *
 * Value forms (§25.4): strings, multi-line strings, numbers, booleans, null,
 * ISO 8601 dates (lexed as strings), enum values (dotted identifiers like
 * Status.active), and backtick expressions. We reuse SettingValue for cell
 * values -- it's a superset (it also covers ListValue and RefValue, which
 * are unusual in records but not explicitly forbidden by the spec).
 * ----------------------------------------------------------------------- */

export interface RecordsBlock {
  kind: 'RecordsBlock';
  rows: RecordRow[];
  span: Span;
}

export interface RecordRow {
  kind: 'RecordRow';
  values: SettingValue[];
  span: Span;
}

export interface TopLevelRecordsDeclaration {
  kind: 'TopLevelRecordsDeclaration';
  /**
   * The entity being populated. Dotted form for cross-container references
   * such as `core.users`. Stored as the source-text dotted path; no
   * resolution is performed at parse time.
   */
  entityRef: string;
  /** The explicit column list. Required for the top-level form. */
  columns: string[];
  rows: RecordRow[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Notes
 *
 * Notes appear in two places:
 *   - As a top-level standalone declaration: `Note name { '''...''' }`
 *   - As an inline block inside an entity, container, etc.: `Note: '...'`
 * ----------------------------------------------------------------------- */

export interface NoteDeclaration {
  kind: 'NoteDeclaration';
  name?: string;
  body: string;
  span: Span;
}

/** Inline `Note: '...'` or `Note { '''...''' }` form */
export interface NoteBlock {
  kind: 'NoteBlock';
  body: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Module system (spec §26, new in v0.2)
 *
 * `use` and `reuse` directives import declarations from another xDBML file.
 * The directive can appear at file scope or inside a Container body; its
 * location determines where the imported elements live in the merged AST
 * (the "directive's location is the placement location" rule, §26.5).
 *
 * Each directive may carry an optional clone block embedding the imported
 * declarations directly in the importing file (§26.6). When a clone block
 * is present, the parser uses it as authoritative and does not open the
 * referenced file. When absent, the parser must open the referenced file
 * (P5 work; P4 only supports clone-present directives).
 *
 *     reuse { entity core.dim_customer } from './lib' [cloned_at: '...'] {
 *       Entity dim_customer { ... }
 *     }
 *
 *     use * from './internal-helpers'   // import-all form (must have clone in P4)
 *
 * Following design v2 decision Q-B, the AST is provenance-preserving:
 * `ModuleImportDirective` nodes carry the imported declarations inside their
 * `clone.statements` field rather than splicing them into the parent's
 * statement list. Downstream consumers that want a flat list use a
 * `flatten()` helper (forthcoming as separate API surface).
 * ----------------------------------------------------------------------- */

export interface ModuleImportDirective {
  kind: 'ModuleImportDirective';
  /**
   * Directive mode:
   *   - `'reuse'`: transitive (visible to files that further import this file).
   *     The recommended default per spec §26.4.
   *   - `'use'`: non-transitive (private to this file).
   */
  mode: 'use' | 'reuse';
  /** What to import: everything (`*`) or a selective list. */
  spec: ImportSpec;
  /**
   * The relative path string from the `from` clause, with quotes stripped.
   * Stored as-is; path resolution happens at name-resolution time (P5+).
   */
  from: string;
  /**
   * Optional metadata settings appearing between `from '...'` and the
   * clone block. In v0.2 phase 1, only `cloned_at` is defined; the parser
   * is permissive and stores any settings here.
   */
  settings: Setting[];
  /**
   * The embedded clone block. When present, this is the authoritative
   * content for the import. When absent (reference-only directive), the
   * parser must resolve the `from` path at parse time (P5+).
   */
  clone?: CloneBlock;
  span: Span;
}

/** Selective vs import-all distinction. */
export type ImportSpec =
  | { kind: 'ImportAll' }
  | { kind: 'ImportList'; items: ImportItem[] };

/**
 * A single import item in a selective `{ ... }` list:
 *
 *     entity core.dim_customer
 *     type Email as PII_Email
 *     field core.dim_customer.email
 *
 * The element type is one of the keywords from §26.3 (table, entity,
 * collection, record, enum, tablepartial, note, schema, container,
 * tablegroup, type, edge, view, diagramview, field). Stored lowercased.
 *
 * The source path follows xDBML's standard dotted form. Container.Entity
 * for an entity inside a Container; Container.Entity.Field for a field.
 */
export interface ImportItem {
  kind: 'ImportItem';
  /** Lowercased element type keyword. */
  elementType: string;
  /** Dotted source path. */
  sourcePath: string;
  /** Optional rename in the current file's namespace. */
  alias?: string;
  span: Span;
}

/**
 * A clone block embedding the imported declarations directly. For non-field
 * imports the clone contains TopLevelStatement nodes (the natural shape of
 * an entity, type, container, etc. clone). Field imports are not supported
 * in P4 -- when they land, this type may grow to a wider union.
 *
 * Per spec §26.6, the clone contains exactly the imported declaration(s),
 * without surrounding wrappers from the source file. For an entity clone
 * the content is the EntityDeclaration alone (no container wrapper); for a
 * container clone the content is the ContainerDeclaration including its
 * intrinsic entities.
 */
export interface CloneBlock {
  kind: 'CloneBlock';
  /**
   * Statements that the importing file pulls in from the source. Most are
   * top-level shapes (Entity, Type, Enum, Container, etc.). The one
   * exception is `FieldDeclaration`: when the parent directive imports
   * one or more fields via `field <path>` items (spec §26.8), each field
   * appears here as a bare FieldDeclaration with no entity wrapper.
   * The `flatten()` pass lifts each bare field into a synthetic
   * TypeDeclaration at file scope so downstream consumers see a normal
   * Named Type.
   */
  statements: (TopLevelStatement | FieldDeclaration)[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Settings (the bracket-list grammar shared by ~everything)
 *
 * The settings vocabulary is open by spec design (§22.5). To keep the AST
 * simple, every setting is represented as a name/value pair. Specific
 * recognized settings (flags like `pk`, `not null`; key-value like
 * `default: 'x'`; validation like `pattern: '...'`; AI-readiness like
 * `synonyms: [...]`) all reduce to this shape with `value` being null for
 * pure flags.
 *
 * Downstream passes (a future semantic-analysis stage) interpret the
 * setting name against the recognized vocabulary in spec §22 and §23.
 * ----------------------------------------------------------------------- */

export interface Setting {
  kind: 'Setting';
  /** Setting name, lowercased for canonical comparison. Source casing is preserved in `nameSource`. */
  name: string;
  nameSource: string;
  /** Value, if any. A pure flag like `pk` has `value: null`. */
  value: SettingValue | null;
  span: Span;
}

export type SettingValue =
  | StringValue
  | NumberValue
  | BooleanValue
  | NullValue
  | IdentifierValue
  | ExpressionValue
  | ListValue
  | RefValue;

export interface StringValue {
  kind: 'StringValue';
  /** The string content with surrounding quotes already stripped */
  value: string;
  /** Triple-quoted multi-line string */
  multiline: boolean;
  span: Span;
}

export interface NumberValue {
  kind: 'NumberValue';
  value: string;
  span: Span;
}

export interface BooleanValue {
  kind: 'BooleanValue';
  value: boolean;
  span: Span;
}

export interface NullValue {
  kind: 'NullValue';
  span: Span;
}

export interface IdentifierValue {
  kind: 'IdentifierValue';
  /** A bare or dotted identifier used as a value, e.g. `Oracle`, `cascade`, `set null`. */
  value: string;
  span: Span;
}

export interface ExpressionValue {
  kind: 'ExpressionValue';
  /** Source text inside backticks, no surrounding backticks */
  expression: string;
  span: Span;
}

export interface ListValue {
  kind: 'ListValue';
  items: SettingValue[];
  span: Span;
}

/** An inline `ref: > target.field` setting carries a small ref spec. */
export interface RefValue {
  kind: 'RefValue';
  operator: CardinalityOperator;
  target: RefEndpoint;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Parse options (new in v0.2 / parser batch P5)
 *
 * Configuration for `parse()`. Optional; omitting the options object keeps
 * the parser fully self-contained (only clone-block-bearing module directives
 * resolve; reference-only directives fail with the P4 error).
 *
 * When `readFile` is provided, the parser can resolve reference-only
 * `use`/`reuse` directives by opening the referenced file and synthesizing
 * a clone block from its matching declarations. The Node test runner passes
 * `fs.readFileSync`; the playground (browser) intentionally does NOT provide
 * one, keeping clone blocks as the only authoritative form there.
 * ----------------------------------------------------------------------- */

export interface ParseOptions {
  /**
   * The absolute or canonical path of the file being parsed. Used as the
   * base directory for relative `from './...'` paths in `use`/`reuse`
   * directives. If undefined, relative paths in directives can only be
   * resolved when they're already absolute (rare). For files loaded via
   * `readFile`, the parser passes the resolved path automatically.
   */
  filePath?: string;

  /**
   * Synchronous file reader. Called by the parser when it needs to resolve
   * a reference-only module directive. The argument is a resolved, stable
   * key: an absolute path for local sources, or a normalized `https://` URL
   * for remote (v0.3) sources (when a directive's `from` is a URL, or a
   * relative reference inside a remote module resolves to one). The function
   * should return the source text for that key, or throw if it is missing
   * or unreadable.
   *
   * Because this reader is synchronous, a host that supports remote sources
   * must return the fetched text from a cache it populated beforehand. The
   * network fetch, and its SSRF / redirect / size / timeout obligations
   * (spec §25.x.5), live in the host's resolver, not in the parser.
   *
   * If absent, reference-only directives fall back to the P4 rejection
   * with a clear "no resolver available" message. Clone-block-bearing
   * directives still work without a resolver because their content is
   * embedded in the importing file.
   */
  readFile?: (pathOrUrl: string) => string;

  /**
   * Maximum recursion depth when resolving directives. Each `from` traversal
   * deepens the stack by one; circular imports trigger the cycle-detection
   * path BEFORE this counter increases (cycles produce a parsed directive
   * with an empty clone, not a depth-limit error). The default (8) is
   * generous for realistic module graphs and small enough to keep the
   * stack bounded under pathological inputs.
   */
  maxDepth?: number;
}
