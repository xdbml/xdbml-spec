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
  | SupertypeGroupDeclaration
  | DiagramViewDeclaration
  | NoteDeclaration
  | TopLevelRecordsDeclaration
  | MetadataDeclaration
  | DepDeclaration
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
  /** A sticky note attached to the Container (spec §19.4, v0.7). */
  | NoteDeclaration
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
  | ConstraintsBlock
  | NoteBlock
  | PartialInjection
  | RecordsBlock
  | DefinitionsBlock;

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
  /**
   * The base name: `int`, `varchar`, `decimal`, `objectId`, `Decimal128`,
   * etc. May be qualified, `core.job_status`, when it names an Enum
   * declared in a container (spec §16).
   */
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
 * Named Type (§15)
 * ----------------------------------------------------------------------- */

export interface TypeDeclaration {
  kind: 'TypeDeclaration';
  name: string;
  /**
   * v0.2 scalar form (spec §15.7): when present, this Type is an alias
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
 * Internal definitions (§15.8, v0.6.5)
 *
 * `definitions { ... }` in an entity body. Each entry is a Type declaration
 * written without the `Type` keyword, in the object form or the scalar
 * form, and is visible only inside the entity: its fields, at any depth,
 * and the other entries of the block resolve a type name among the entries
 * first. The parser reads the block in every body that `parseEntityBody`
 * reads (Entity, TablePartial, Edge); the resolver reports it outside an
 * Entity (§15.8.6). `entityDefinitions()` returns the entries by name.
 * ----------------------------------------------------------------------- */

export interface DefinitionsBlock {
  kind: 'DefinitionsBlock';
  entries: TypeDeclaration[];
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
 * View (§14)
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
  /**
   * May be `container.enum` form when declared schema-qualified at the
   * top level (`enum core.job_status`); the resolver files it under that
   * container, like an Enum declared inside the Container block.
   */
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
  /** The operator without its `?` marks, which `sourceOptional` and `targetOptional` carry. */
  operator: CardinalityOperator;
  /**
   * A `?` before the operator, `?>` (spec §11.1, v0.7): the source end may
   * have no counterpart, so its minimum cardinality is 0.
   */
  sourceOptional?: true;
  /** A `?` after the operator, `>?`: the target end's minimum cardinality is 0. */
  targetOptional?: true;
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
  /** Source text inside the delimiters, without them. */
  expression: string;
  /**
   * How the source wrote the expression (spec §10.5, v0.6): in backticks,
   * or in single or triple quotes. Both mean the same check; the raw AST
   * keeps the form. Absent on entries built by older code paths, which
   * only ever read backticks.
   */
  delimiter?: 'backtick' | 'quote';
  /** Optional settings -- typically `name:` and/or `note:`. */
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Constraints (spec §10, new in v0.6)
 *
 * `constraints { }` holds key lines and check lines. A key line names one
 * field, or a parenthesized list, and carries `pk` or `unique` (checked by
 * the resolver, so a bad line still parses). A check line is a CheckEntry,
 * the same node `checks { }` produces.
 * ----------------------------------------------------------------------- */

export interface ConstraintsBlock {
  kind: 'ConstraintsBlock';
  entries: ConstraintEntry[];
  span: Span;
}

export type ConstraintEntry = KeyConstraintEntry | CheckEntry;

export interface KeyConstraintEntry {
  kind: 'KeyConstraintEntry';
  /** One path per key field, in key order. */
  fields: PathSegment[][];
  /** True when the source wrote the fields in parentheses. */
  parenthesized: boolean;
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * EntityPartial / EntityGroup (spec §17)
 *
 * `EntityPartial` and `EntityGroup` are the xDBML keywords (v0.7.1);
 * `TablePartial` and `TableGroup`, the DBML keywords, are their aliases.
 * The node kinds keep the DBML names, and `keyword` records the word as
 * written, in its canonical casing.
 * ----------------------------------------------------------------------- */

export type PartialKeyword = 'EntityPartial' | 'TablePartial';
export type GroupKeyword = 'EntityGroup' | 'TableGroup';

export interface TablePartialDeclaration {
  kind: 'TablePartialDeclaration';
  /** The keyword as written: `EntityPartial`, or its DBML alias `TablePartial`. */
  keyword: PartialKeyword;
  name: string;
  settings: Setting[];
  body: EntityBodyItem[];
  span: Span;
}

export interface TableGroupDeclaration {
  kind: 'TableGroupDeclaration';
  /** The keyword as written: `EntityGroup`, or its DBML alias `TableGroup`. */
  keyword: GroupKeyword;
  name: string;
  settings: Setting[];
  members: string[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * SupertypeGroup (spec §12, new in v0.5)
 *
 * One supertype and its immediate subtypes along one axis of
 * specialization. The supertype is named by the `supertype:` setting; the
 * body lists the subtypes, separated like TableGroup members (newline,
 * comma or semicolon). Setting values are kept as written: canonical
 * values and aliases are resolved by `supertypeGroupSettings()`.
 * ----------------------------------------------------------------------- */

export interface SupertypeGroupDeclaration {
  kind: 'SupertypeGroupDeclaration';
  name: string;
  settings: Setting[];
  members: SupertypeGroupMember[];
  span: Span;
}

export interface SupertypeGroupMember {
  kind: 'SupertypeGroupMember';
  /** Entity path as written: `Person` or `crm.Person`. */
  name: string;
  /** Member settings; `strategy` is the only recognized one (spec §12.7.4). */
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * DiagramView (spec §18, defined in v0.6.3)
 *
 * A named subset of the model's diagram. The body lists categories, each a
 * keyword and a list of names or `*`:
 *
 *   DiagramView order_flow {
 *     Containers { sales  billing }
 *     Tables { sales.orders  crm.customers }
 *   }
 *
 * `{ * }` as the whole body lists every element of every category. The AST
 * keeps the category keyword as written (`Schemas`, `tables`, `Entities`)
 * next to the name of its category (`Containers`, `Tables`); names stay
 * unresolved strings, and `diagramViewMembers()` resolves them (spec
 * §18.2, §18.3, §29.8). The category names `Tables` and `TableGroups`
 * stand for `Entities` and `EntityGroups` as well (v0.7.1), as the node
 * kinds of §17 keep their DBML names.
 * ----------------------------------------------------------------------- */

export type DiagramViewCategoryName =
  | 'Tables'
  | 'Views'
  | 'Containers'
  | 'TableGroups'
  | 'SupertypeGroups'
  | 'Notes';

export interface DiagramViewDeclaration {
  kind: 'DiagramViewDeclaration';
  name: string;
  /** Bracket settings: `note`, and custom properties of any name (spec §18.1, §24.5). */
  settings: Setting[];
  /** `Note:` / `Note { }` elements of the body. `diagramViewNote()` gives the note. */
  notes: NoteBlock[];
  /** True when the whole body is `{ * }`: every element of every category. */
  wildcardBody: boolean;
  categories: DiagramViewCategory[];
  span: Span;
}

export interface DiagramViewCategory {
  kind: 'DiagramViewCategory';
  /**
   * The category: `Schemas` reads as `Containers`; `Entities` and
   * `EntityGroups` read as `Tables` and `TableGroups`.
   */
  category: DiagramViewCategoryName;
  /** The keyword as written, for round trips and the DBML-form check of §18.5. */
  keyword: string;
  /** True when the list holds `*`; names written beside it have no effect. */
  wildcard: boolean;
  items: DiagramViewItem[];
  span: Span;
}

export interface DiagramViewItem {
  kind: 'DiagramViewItem';
  /** Name as written: `orders` or `sales.orders`. */
  name: string;
  span: Span;
}

export interface PartialInjection {
  kind: 'PartialInjection';
  /** Identifier after the `~`. */
  partialName: string;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Records (sample data, §26)
 * ----------------------------------------------------------------------- */

/* -------------------------------------------------------------------------
 * Records (spec §26, expanded in v0.2)
 *
 * Records declare sample data inline in the schema. Two forms:
 *
 *   - Inside an entity body (§26.1), with the entity's columns in
 *     declaration order, or with a column list (v0.7):
 *       records {
 *         1, 'Alice', 'alice@example.com'
 *         2, 'Bob',   'bob@example.com'
 *       }
 *       records (id, email) {
 *         1, 'alice@example.com'
 *       }
 *
 *   - Top-level, explicit column list (§26.2, new in v0.2):
 *       records users (id, name, email) {
 *         1, 'Alice', 'alice@example.com'
 *       }
 *     Columns not in the list default to null or the field's declared default.
 *
 * Either form takes an `[example]` flag after its column list, or after
 * `records` when an entity's block has none (§26.5, v0.7). An entity holds
 * one records block (§26.6).
 *
 * Each row is a comma-separated list of values on a single source line; rows
 * are separated by newlines. Trailing commas at end-of-row are tolerated.
 * Multi-line values are supported via triple-quoted strings (the line check
 * uses the comma's line vs the next-value's line, so a triple-quoted value
 * doesn't break row continuation). An empty field, between two commas or
 * before the first one, is a NullValue with `empty: true` (§26.4, v0.7).
 *
 * Value forms (§26.4): strings, multi-line strings, numbers, booleans, null,
 * ISO 8601 dates (lexed as strings), enum values (dotted identifiers like
 * Status.active), and backtick expressions. We reuse SettingValue for cell
 * values -- it's a superset (it also covers ListValue and RefValue, which
 * are unusual in records but not explicitly forbidden by the spec).
 * ----------------------------------------------------------------------- */

export interface RecordsBlock {
  kind: 'RecordsBlock';
  /**
   * The column list of `records (a, b) { ... }` (v0.7), each column bare or
   * quoted and held as written. Absent when the block names no columns, in
   * which case the rows populate the entity's columns in declaration order.
   */
  columns?: string[];
  /** The settings in brackets, `[example]` among them (§26.5). */
  settings: Setting[];
  /** True when the block carries the `example` flag (§26.5). */
  example: boolean;
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
  /** The settings in brackets, `[example]` among them (§26.5). */
  settings: Setting[];
  /** True when the declaration carries the `example` flag (§26.5). */
  example: boolean;
  rows: RecordRow[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Notes
 *
 * Notes appear in three places (spec §19):
 *   - As a sticky note, a named declaration at the top level or in a
 *     Container body: `Note name [color: #abc] { '''...''' }`
 *   - As the note of the project, a top-level declaration without a
 *     name: `Note: '...'` (§19.5)
 *   - As an inline block inside an entity, container, etc.: `Note: '...'`
 * ----------------------------------------------------------------------- */

export interface NoteDeclaration {
  kind: 'NoteDeclaration';
  /**
   * The name of a sticky note, in the form of names.ts. A top-level name may
   * be qualified, `core.legend`, which places the note in the implicit
   * Container `core` (§19.2). Undefined for the note of the project (§19.5).
   */
  name?: string;
  /** Settings in brackets: `color` and custom properties (§19.3, v0.7). */
  settings: Setting[];
  /** The text, Markdown (§19.6). */
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
 * Metadata blocks (spec §24.7, v0.7; DBML 9.1)
 *
 *   Metadata Table users {
 *     owner: 'scott'
 *     note: 'Accounts of the web shop'
 *   }
 *
 * Settings for an element declared elsewhere, in this file or an imported
 * one. A block adds no element: a tool reads the element's settings with
 * its Metadata blocks applied (`metadataIndex`, metadata.ts).
 * ----------------------------------------------------------------------- */

/** The canonical kinds a Metadata block targets. */
export type MetadataTargetKind =
  | 'Table'
  | 'Column'
  | 'TableGroup'
  | 'Note'
  | 'Container'
  | 'View'
  | 'DiagramView';

export interface MetadataDeclaration {
  kind: 'MetadataDeclaration';
  /** The kind word as written: `Table`, `column`, `Schema`, `Field`. */
  targetKindSource: string;
  /**
   * The canonical kind, or undefined when the word names none. `Entity`,
   * `Collection` and `Record` read as `Table`, `Field` as `Column`, and a
   * container keyword as `Container`.
   */
  targetKind?: MetadataTargetKind;
  /**
   * The target's name in the form of names.ts: `users`, `core.users`,
   * `users.id`. An entity alias at its head is replaced by the entity's
   * name, as in a relationship endpoint (§7.4).
   */
  target: string;
  /** The target as written, before an alias is replaced. */
  targetSource: string;
  /** One setting per `key: value` line of the body. */
  settings: Setting[];
  /** Settings in brackets after the target, which DBML accepts and ignores. */
  bracketSettings: Setting[];
  /**
   * The file the block was read from, when the parser knew it
   * (`ParseOptions.filePath`). Diagnostics name it for a block that an
   * import brought.
   */
  file?: string;
  /**
   * Set by `flatten()` on a block that an import brought rather than one
   * the document writes itself. Imported blocks apply before the
   * document's own (§24.7.4).
   */
  imported?: true;
  span: Span;
}

/* -------------------------------------------------------------------------
 * Data lineage (spec §27, v0.7; DBML 10.0)
 *
 *   Dep: raw_orders -> stg_orders
 *   Dep order_revenue: stg_orders.revenue -> fct_orders.revenue [note: '...']
 *   Dep build_fct_orders [owner: 'analytics'] {
 *     stg_orders.revenue    -> fct_orders.revenue
 *     stg_customers.segment -> fct_orders.customer_segment
 *     Note: 'Joins each order to its customer.'
 *   }
 *
 * A Dep records that an entity, a View or a field is computed from another.
 * The inline form, `[dep: <- stg_orders]`, is a `DepValue` in the settings
 * of the element that carries it. `collectLineage()` (lineage.ts) gathers
 * both forms.
 * ----------------------------------------------------------------------- */

export interface DepDeclaration {
  kind: 'DepDeclaration';
  /** The optional name, bare or quoted, as written (§27.4). */
  name?: string;
  /** `short`: `Dep: a -> b`; `block`: `Dep name { ... }`. */
  form: 'short' | 'block';
  /**
   * The settings in brackets: after the dependency in the short form, after
   * the name in the block form.
   */
  settings: Setting[];
  /**
   * The `key: value` lines and the `Note` of a block's body, the note as a
   * `note` setting. A setting here takes precedence over the brackets
   * (§27.2).
   */
  bodySettings?: Setting[];
  /**
   * Brackets between the name and the colon of the short form,
   * `Dep n [note: 'x']: a -> b`, which DBML accepts. The brackets after
   * the dependency take precedence.
   */
  headerSettings?: Setting[];
  /** One for the short form; any number for a block. */
  dependencies: DepDependency[];
  span: Span;
}

/** One dependency: an upstream element feeds a downstream one (§27.1). */
export interface DepDependency {
  kind: 'DepDependency';
  upstream: RefEndpoint;
  downstream: RefEndpoint;
  /** The arrow as written: `->` puts the upstream end first, `<-` the downstream end. */
  arrow: '->' | '<-';
  /**
   * Settings in brackets after a dependency in a block (§27.2): they
   * concern this dependency alone.
   */
  settings: Setting[];
  span: Span;
}

/* -------------------------------------------------------------------------
 * Module system (spec §28, new in v0.2)
 *
 * `use` and `reuse` directives import declarations from another xDBML file.
 * The directive can appear at file scope or inside a Container body; its
 * location determines where the imported elements live in the merged AST
 * (the "directive's location is the placement location" rule, §28.5).
 *
 * Each directive may carry an optional clone block embedding the imported
 * declarations directly in the importing file (§28.6). When a clone block
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
   *     The recommended default per spec §28.4.
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
 * The element type is one of the keywords from §28.3 (table, entity,
 * collection, record, enum, tablepartial, note, schema, container,
 * tablegroup, type, edge, view, diagramview, field, and from v0.5
 * supertypegroup). Stored lowercased.
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
 * Per spec §28.6, the clone contains exactly the imported declaration(s),
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
   * one or more fields via `field <path>` items (spec §28.8), each field
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
 * The settings vocabulary is open by spec design (§24.5). To keep the AST
 * simple, every setting is represented as a name/value pair. Specific
 * recognized settings (flags like `pk`, `not null`; key-value like
 * `default: 'x'`; validation like `pattern: '...'`; AI-readiness like
 * `synonyms: [...]`) all reduce to this shape with `value` being null for
 * pure flags.
 *
 * Downstream passes (a future semantic-analysis stage) interpret the
 * setting name against the recognized vocabulary in spec §24 and §25.
 * ----------------------------------------------------------------------- */

export interface Setting {
  kind: 'Setting';
  /**
   * Setting name, lowercased for canonical comparison. Source casing is
   * preserved in `nameSource`. Two words read as one name: `required` is
   * `not null` (spec §8), and in a document that declares a version,
   * `color` on an entity, a View or an EntityPartial, and in a
   * `Metadata Table` or `Metadata View` block, is `headercolor`, the
   * header color (spec §7.5, v0.7.1).
   */
  name: string;
  nameSource: string;
  /** Value, if any. A pure flag like `pk` has `value: null`. */
  value: SettingValue | null;
  /**
   * True on a setting the parser added rather than read: `not null` on a
   * primary key field of a v0.6 document (spec §10.4). Its span is the
   * field's span.
   */
  implied?: true;
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
  | RefValue
  | DepValue;

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
  /**
   * True for an empty field of a records row, `1, , 'x'` or `, 'x'`, which
   * reads as null (§26.4, v0.7). Its span is empty, at the comma that
   * follows it.
   */
  empty?: true;
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
  /** The operator without its `?` marks. The field carrying the setting is the source end. */
  operator: CardinalityOperator;
  /** A `?` before the operator, `[ref: ?> users.id]` (spec §11.1, v0.7). */
  sourceOptional?: true;
  /** A `?` after the operator, `[ref: >? users.id]`. */
  targetOptional?: true;
  target: RefEndpoint;
  span: Span;
}

/**
 * An inline `dep` setting (spec §27.2, v0.7): `[dep: <- stg_orders]` makes
 * the named element upstream of the one carrying the setting, and
 * `[dep: -> fct_orders]` downstream of it.
 */
export interface DepValue {
  kind: 'DepValue';
  arrow: '->' | '<-';
  /** The element at the other end. */
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
   * or unreadable. When the source has no extension, the parser asks for
   * `<path>.xdbml`, then for `<path>.dbml` if the first call throws (§28.13).
   *
   * Because this reader is synchronous, a host that supports remote sources
   * must return the fetched text from a cache it populated beforehand. The
   * network fetch, and its SSRF / redirect / size / timeout obligations
   * (spec §28.14.5), live in the host's resolver, not in the parser.
   *
   * If absent, reference-only directives fall back to the P4 rejection
   * with a clear "no resolver available" message. Clone-block-bearing
   * directives still work without a resolver because their content is
   * embedded in the importing file.
   */
  readFile?: (pathOrUrl: string) => string;

  /**
   * Host mapping of module specifiers (v0.7, spec §28.13), the counterpart
   * of DBML 10.3's `resolveFileSpecifier`. Called with the string after
   * `from` and the importer's `filePath` for every source that is not an
   * `https://` URL, when the importer is a local file; never inside a
   * remote module (§28.14.1). Return the key to hand to `readFile`, used as
   * is (no extension search), or `undefined` to apply the default
   * resolution: relative to the importing file, with an absolute path
   * rejected. A host maps, say, `@shared/users` to a library folder, or
   * accepts absolute paths, here.
   */
  resolveSpecifier?: (specifier: string, importerPath: string | undefined) => string | undefined;

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
