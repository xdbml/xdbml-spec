/**
 * Shared keyword vocabulary for xDBML tokenizers and highlighters.
 *
 * This module is the single source of truth for the keyword lists
 * that drive syntax highlighting across multiple surfaces:
 *
 *   - parser/src/monarch.ts        the playground's in-editor highlighter
 *   - tools/textmate/...           the TextMate grammar for VS Code,
 *                                  Shiki (xdbml.org code blocks, Claude
 *                                  chat code blocks, etc.), and GitHub
 *
 * The grammar in grammar/xDBML.g4 is the language's canonical
 * specification; this file mirrors its keyword vocabulary in a form
 * convenient for consumers. A keyword-consistency test (in
 * parser/test/) asserts that every keyword listed here is recognized
 * by the parser.
 *
 * When adding a keyword to xDBML:
 *   1. Update the grammar in grammar/xDBML.g4
 *   2. Update parser/src/parser.ts if the parser needs to recognize it
 *   3. Add it to the right array below
 *   4. Re-run the TextMate grammar build script
 *      (tools/textmate/scripts/build.mjs)
 *   5. Run `npm test` in the parser package to verify all three
 *      consumers see the keyword
 *
 * All keywords here are case-insensitive in xDBML. Stored in
 * lower-case as the canonical form; matchers should be case-insensitive.
 */

/* -------------------------------------------------------------------------
 * Declaration keywords
 *
 * The keywords that introduce a top-level declaration. The full set
 * includes both container-style keywords (Container, Schema, etc.)
 * and entity-style keywords (Table, Entity, etc.) plus other
 * top-level constructs (Ref, View, Note, Enum, etc.).
 * ----------------------------------------------------------------------- */

export const CONTAINER_KEYWORDS = [
  'container',
  'schema',
  'database',
  'keyspace',
  'namespace',
  'dataset',
  'bucket',
] as const;

export const ENTITY_KEYWORDS = [
  'table',
  'entity',
  'collection',
  'record',
] as const;

/**
 * The full set of declaration keywords. Includes containers,
 * entities, and other top-level constructs.
 */
export const DECLARATION_KEYWORDS = [
  'project',
  ...CONTAINER_KEYWORDS,
  ...ENTITY_KEYWORDS,
  'type',
  'edge',
  'view',
  'enum',
  'ref',
  'note',
  'tablepartial',
  'tablegroup',
  'diagramview',
] as const;

/* -------------------------------------------------------------------------
 * Type expression keywords
 *
 * Keywords that appear inside a field's type expression, after the
 * colon. Includes structural types (object, array, map) and
 * polymorphism markers (oneOf, anyOf, allOf, union).
 * ----------------------------------------------------------------------- */

export const STRUCTURAL_TYPE_KEYWORDS = [
  'object',
  'struct',
  'array',
  'list',
  'map',
  'dict',
  'dictionary',
  'set',
  'json',
  'jsonb',
  'variant',
] as const;

export const POLYMORPHISM_KEYWORDS = [
  'union',
  'oneof',
  'anyof',
  'allof',
] as const;

/* -------------------------------------------------------------------------
 * Scalar and BSON types
 *
 * The parser accepts any identifier as a scalar type (open vocabulary),
 * so these lists drive color, not validation. Themes color them under
 * `storage.type` (TextMate) or `type` (Monarch).
 * ----------------------------------------------------------------------- */

export const SCALAR_TYPES = [
  // Integers
  'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint',
  'int32', 'int64',
  // Floating point and decimal
  'float', 'double', 'decimal', 'dec', 'numeric', 'real',
  // Boolean
  'bit', 'bool', 'boolean',
  // Strings
  'char', 'varchar', 'varchar2', 'nvarchar', 'nvarchar2', 'nchar',
  'text', 'mediumtext', 'longtext', 'string', 'ntext',
  // Binary
  'binary', 'varbinary', 'blob', 'mediumblob', 'longblob', 'tinyblob',
  'tinytext',
  // Document
  'json', 'jsonb', 'variant', 'xml',
  // Date/time
  'date', 'time', 'datetime', 'datetime2', 'timestamp',
  'timestamptz', 'year',
  // Identity and network
  'uuid', 'inet6',
  // Money
  'money', 'smallmoney',
  // Enumeration as a type position
  'enum',
] as const;

export const BSON_TYPES = [
  'objectid',
  'decimal128',
  'bindata',
  'minkey',
  'maxkey',
  'symbol',
  'regex',
  'long',
  'double',
] as const;

/* -------------------------------------------------------------------------
 * Settings vocabulary
 *
 * Settings appear inside `[...]` brackets after a field declaration
 * or other construct. Two forms:
 *
 *   - Flag settings: bare names like `pk`, `unique`, `not null`
 *   - Keyed settings: `name: value` pairs
 *
 * `required` is normalized to `not null` by the parser per spec §8;
 * both spellings get the same color.
 *
 * Setting keys are open-vocabulary at the parser level (any identifier
 * followed by `:` is accepted as a setting), so this list drives
 * highlighting only.
 * ----------------------------------------------------------------------- */

export const SETTING_FLAGS = [
  'pk',
  'primary',
  'key',
  'unique',
  'null',
  'not',
  'required',
  'increment',
] as const;

export const SETTING_KEYS = [
  // General
  'note',
  'default',
  'ref',
  'name',
  'color',
  'headercolor',
  'as',
  'check',
  'inactive',
  // xDBML-specific
  'type',
  'target',
  'targets',
  'database_type',
  'source',
  'source_cardinality',
  'target_cardinality',
  'min_source',
  'max_source',
  'min_target',
  'max_target',
  'undirected',
  'discriminator',
  'source_query',
  'materialized',
  'refresh_schedule',
  'refresh_on',
  'source_database',
  'storage_options',
  // Validation
  'pattern',
  'format',
  'minlength',
  'maxlength',
  'minimum',
  'maximum',
  'exclusiveminimum',
  'exclusivemaximum',
  'multipleof',
  'minitems',
  'maxitems',
  'uniqueitems',
  'minproperties',
  'maxproperties',
  // AI-readiness
  'synonyms',
  'business_term',
  'granularity',
  'tags',
  // Referential actions
  'delete',
  'update',
  // Index entries
  'indexes',
  // Container settings
  'replication',
  'location',
  'default_charset',
] as const;

/* -------------------------------------------------------------------------
 * Value vocabularies
 *
 * Constants that appear as right-hand-side values for specific
 * settings (granularity for time-series, etc.). The parser doesn't
 * validate these; they're highlighted as constants when recognized.
 * ----------------------------------------------------------------------- */

export const GRANULARITY_VALUES = [
  'year', 'quarter', 'month', 'week', 'day',
  'hour', 'minute', 'second',
  'millisecond', 'microsecond', 'nanosecond',
] as const;

/* -------------------------------------------------------------------------
 * Top-level directives
 *
 * Appear only at the very top of a file: `xdbml: 0.1` or
 * `experimental: ...`. Distinct from declaration keywords because
 * their syntax (and meaning) is different.
 * ----------------------------------------------------------------------- */

export const DIRECTIVE_KEYWORDS = [
  'xdbml',
  'experimental',
] as const;
