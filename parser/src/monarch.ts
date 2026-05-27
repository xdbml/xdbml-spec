/**
 * Monaco language configuration and Monarch tokens provider for xDBML.
 *
 * Monarch is a regex-based state-machine syntax highlighter that ships
 * with Monaco. This file produces the highlighting rules; the real parser
 * lives in ./parser.ts. The two operate independently: Monaco asks
 * Monarch "what color is each character" for highlighting, and asks the
 * parser "is the file valid and what's its AST" for everything else.
 *
 * The two must stay in sync grammatically (a keyword the parser
 * recognizes should also be highlighted as a keyword) but they don't
 * share code or state.
 *
 * Reference: https://microsoft.github.io/monaco-editor/monarch.html
 *
 * Types are loose `unknown` rather than depending on monaco-editor here,
 * because @xdbml/parse should be usable without forcing the Monaco
 * dependency on consumers that just want to parse. The Monaco types
 * are structurally compatible -- the consumer casts at the boundary.
 */

/** Subset of Monaco's LanguageConfiguration -- only the fields we set. */
export interface XDbmlLanguageConfiguration {
  comments: {
    lineComment: string;
    blockComment: [string, string];
  };
  brackets: [string, string][];
  autoClosingPairs: { open: string; close: string }[];
  surroundingPairs: { open: string; close: string }[];
  indentationRules?: {
    increaseIndentPattern: RegExp;
    decreaseIndentPattern: RegExp;
  };
}

/** Subset of Monaco's IMonarchLanguage -- the shape Monarch consumes. */
export interface XDbmlMonarchLanguage {
  tokenPostfix: string;
  brackets: { open: string; close: string; token: string }[];
  // Keyword groups referenced from tokenizer rules
  decls: string[];
  containerKeywords: string[];
  entityKeywords: string[];
  structuralTypeKeywords: string[];
  polymorphismKeywords: string[];
  scalarTypes: string[];
  bsonTypes: string[];
  settingFlags: string[];
  settingKeys: string[];
  granularityValues: string[];
  ignoreCase: boolean;
  unicode: boolean;
  tokenizer: Record<string, unknown[]>;
}

/* -------------------------------------------------------------------------
 * Language configuration
 * ----------------------------------------------------------------------- */

export const xdbmlLanguageConfig: XDbmlLanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: "'", close: "'" },
    { open: '`', close: '`' },
  ],
  indentationRules: {
    increaseIndentPattern: /^(.*\{[^}]*|\s*[{[].*)$/,
    decreaseIndentPattern: /^(.*\}.*|\s*[}\]].*)$/,
  },
};

/* -------------------------------------------------------------------------
 * Monarch tokens provider
 *
 * Token type conventions (these map to the Monaco theme rules):
 *   keyword                    -- core construct keywords (Project, Container, ...)
 *   keyword.declaration        -- top-level declaration keywords
 *   keyword.entity             -- Entity/Table/Collection/Record
 *   keyword.container          -- Container/Schema/Database/...
 *   keyword.type               -- structural type keywords (object/array/...)
 *   keyword.polymorphism       -- oneOf/anyOf/allOf/union
 *   keyword.directive          -- xdbml:, experimental:
 *   type                       -- scalar type names (int, varchar, decimal, ...)
 *   type.bson                  -- BSON type names (objectId, Decimal128, ...)
 *   identifier                 -- user-supplied names
 *   identifier.custom-property -- x_-prefixed custom property names
 *   string / string.multiline  -- string literals
 *   string.backtick            -- expression literals
 *   string.quoted-ident        -- double-quoted identifiers
 *   number                     -- numeric literals
 *   comment / comment.block    -- comments
 *   operators                  -- cardinality operators (< > - <>)
 *   keyword.wildcard           -- [*]
 *   keyword.partial            -- ~ in partial injection
 *   delimiter / @bracket       -- punctuation
 * ----------------------------------------------------------------------- */

export const xdbmlMonarchTokensProvider: XDbmlMonarchLanguage = {
  tokenPostfix: '.xdbml',

  brackets: [
    { open: '[', close: ']', token: 'delimiter.square' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
    { open: '{', close: '}', token: 'delimiter.curly' },
  ],

  // Top-level declaration keywords
  decls: [
    'project',
    'container',
    'schema',
    'database',
    'keyspace',
    'namespace',
    'dataset',
    'bucket',
    'table',
    'entity',
    'collection',
    'record',
    'type',
    'edge',
    'view',
    'enum',
    'ref',
    'note',
    'tablepartial',
    'tablegroup',
    'diagramview',
  ],

  containerKeywords: [
    'container',
    'schema',
    'database',
    'keyspace',
    'namespace',
    'dataset',
    'bucket',
  ],

  entityKeywords: ['table', 'entity', 'collection', 'record'],

  // Structural type expression keywords (used as type expressions inside fields)
  structuralTypeKeywords: [
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
  ],

  polymorphismKeywords: [
    'union',
    'oneof',
    'anyof',
    'allof',
  ],

  // SQL scalar types -- recognized for highlighting; the parser accepts any
  // identifier as a scalar type, so this list is for color, not validation.
  scalarTypes: [
    'tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint',
    'int32', 'int64',
    'float', 'double', 'decimal', 'dec', 'numeric', 'real',
    'bit', 'bool', 'boolean',
    'char', 'varchar', 'varchar2', 'nvarchar', 'nvarchar2', 'nchar',
    'text', 'mediumtext', 'longtext', 'string', 'ntext',
    'binary', 'varbinary', 'blob', 'mediumblob', 'longblob', 'tinyblob',
    'tinytext',
    'json', 'jsonb', 'variant', 'xml',
    'date', 'time', 'datetime', 'datetime2', 'timestamp',
    'timestamptz', 'year',
    'uuid', 'inet6',
    'money', 'smallmoney',
    'enum',
  ],

  // BSON / document-store types
  bsonTypes: [
    'objectid',
    'decimal128',
    'bindata',
    'minkey',
    'maxkey',
    'symbol',
    'regex',
    'long',
    'double',
  ],

  // Bare-flag settings: `pk`, `unique`, `not null`, etc.
  // `not null` and `primary key` are two words but tokenized one at a time
  // here -- the highlighter colors each as `keyword.setting`.
  // `required` is a synonym for `not null` (spec §8); the parser
  // normalizes it to `not null` in the AST, but for highlighting
  // purposes both spellings get the same `keyword.setting` color.
  settingFlags: [
    'pk',
    'primary',
    'key',
    'unique',
    'null',
    'not',
    'required',
    'increment',
  ],

  // Setting keys appearing as `name: value` -- recognized for highlighting.
  // Open-vocabulary at the parser level; this list drives coloring only.
  settingKeys: [
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
  ],

  granularityValues: [
    'year', 'quarter', 'month', 'week', 'day',
    'hour', 'minute', 'second',
    'millisecond', 'microsecond', 'nanosecond',
  ],

  ignoreCase: true,
  unicode: true,

  tokenizer: {
    root: [
      // xDBML / experimental directives at the very top of files
      [/^(\s*)(xdbml|experimental)(\s*)(:)/, [
        '',
        'keyword.directive',
        '',
        'delimiter',
      ]],

      // [*] -- array wildcard token (must precede generic bracket rules)
      [/\[\*\]/, 'keyword.wildcard'],

      // ~ prefix for partial injection
      [/~/, 'keyword.partial'],

      // Brackets, parens, braces
      [/[{}[\]()]/, '@bracket'],

      // Punctuation
      [/[,.:;]/, 'delimiter'],

      // Cardinality operators
      [/<>/, 'operators.cardinality'],
      [/[<>-](?![A-Za-z_])/, 'operators.cardinality'],

      // Comments
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment.block', '@comment'],

      // Triple-quoted multi-line strings -- must precede single-quoted
      [/'''/, { token: 'string.multiline', next: '@multilineString' }],

      // Quoted identifiers (double-quote)
      [/"/, { token: 'string.quoted-ident', next: '@quotedIdent' }],

      // Single-quoted strings
      [/'/, { token: 'string', next: '@singleString' }],

      // Backtick expression literals
      [/`/, { token: 'string.backtick', next: '@backtickExpr' }],

      // Numbers
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/-?\d+\.\d+([eE][+-]?\d+)?/, 'number.float'],
      [/-?\d+([eE][+-]?\d+)?/, 'number'],
      [/#[0-9A-Fa-f]{3,8}\b/, 'number.hex'],

      // x_ custom property identifiers
      [/\bx_[a-zA-Z0-9_]+/, 'identifier.custom-property'],

      // Identifiers and keyword recognition.
      // The parser is the authority on keyword vs identifier disambiguation;
      // Monarch does coarse highlighting based on lowercase comparison.
      [/[a-zA-Z_][\w$]*/, {
        cases: {
          '@containerKeywords': 'keyword.container',
          '@entityKeywords': 'keyword.entity',
          '@structuralTypeKeywords': 'keyword.type',
          '@polymorphismKeywords': 'keyword.polymorphism',
          '@decls': 'keyword.declaration',
          '@scalarTypes': 'type',
          '@bsonTypes': 'type.bson',
          '@settingFlags': 'keyword.setting',
          '@settingKeys': 'keyword.setting',
          '@granularityValues': 'keyword.value',
          'true': 'keyword.literal',
          'false': 'keyword.literal',
          'null': 'keyword.literal',
          '@default': 'identifier',
        },
      }],

      // Whitespace
      [/[ \t\r\n]+/, ''],
    ],

    comment: [
      [/[^/*]+/, 'comment.block'],
      [/\*\//, 'comment.block', '@pop'],
      [/[/*]/, 'comment.block'],
    ],

    singleString: [
      [/[^\\']+/, 'string'],
      [/\\./, 'string.escape'],
      [/'/, { token: 'string', next: '@pop' }],
    ],

    multilineString: [
      [/[^']+/, 'string.multiline'],
      [/'''/, { token: 'string.multiline', next: '@pop' }],
      [/'/, 'string.multiline'],
    ],

    quotedIdent: [
      [/[^\\"]+/, 'string.quoted-ident'],
      [/\\./, 'string.quoted-ident'],
      [/"/, { token: 'string.quoted-ident', next: '@pop' }],
    ],

    backtickExpr: [
      [/[^`]+/, 'string.backtick'],
      [/`/, { token: 'string.backtick', next: '@pop' }],
    ],
  },
};
