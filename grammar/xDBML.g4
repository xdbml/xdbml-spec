/*
 * xDBML v0.6.1 -- ANTLR4 grammar additions
 *
 * Status:    Draft v0.6.1 -- pre-stable
 * License:   Apache License 2.0
 * Spec:      xDBML Specification v0.6 (xdbml.org/spec/current)
 * Upstream:  github.com/holistics/dbml (Apache 2.0)
 *
 * This grammar layers xDBML extensions on top of the Holistics DBML
 * ANTLR4 grammar. It declares new tokens, new top-level rules, and
 * a small number of replacements for DBML rules that needed extending.
 *
 * v0.2 additions over v0.1:
 *   - Module system: 'use'/'reuse' directives with optional clone blocks
 *     at file scope and inside Container bodies. Element-type slot values
 *     (table, entity, field, type, etc.) are accepted as contextual
 *     keywords (IDENTIFIER values, validated post-parse).
 *   - Scalar Named Types: 'Type Name basetype [settings]' form alongside
 *     the existing 'Type Name { fields }' object-shaped form.
 *   - New reserved tokens: USE, REUSE, FROM, AS.
 *
 * v0.6.1 changes (spec §3.9, §3.10, §14):
 *   - listSeparator: in a list body, commas and semicolons may stand
 *     between items, before the first and after the last, any number of
 *     times. `indexes` keeps whitespace-only separation.
 *   - fieldName: the body keywords Note, indexes, checks, constraints,
 *     records and source_query also name fields; each starts its element
 *     only before ':' or '{'.
 *   - View: source_query is a body element only; the settings stay in the
 *     brackets.
 *
 * Replacements (rules redefined here that override upstream DBML):
 *   - tableDefinition  (adds Entity/Collection/Record keywords)
 *   - columnType       (replaced by typeExpression)
 *   - refSpec          (adds explicit cardinality, .[*] in paths)
 *   - indexEntry       (adds nested-field path support)
 *   - enumDefinition, tablePartialDefinition, tableGroupDefinition
 *                      (v0.6.1: list separators, spec §3.9)
 *   - schemaPrefix     (kept; explicit Container blocks coexist)
 *
 * Naming conventions:
 *   - Lowercase rule names = parser rules
 *   - UPPERCASE token names = lexer tokens
 *   - Section comments use //§N.X.Y to reference the spec
 *
 * Implementation note for parser writers:
 *   This grammar is intentionally permissive at the parse level. Several
 *   constraints (e.g. "tuple positions must be contiguous starting at 0",
 *   "named types cannot shadow builtins", "Ref paths require explicit .[*]
 *   when crossing arrays", "field imports may not appear in Container
 *   bodies", "element-type slot must be one of the recognized values")
 *   are enforced in a semantic-analysis pass that runs after parse.
 *   Keeping the grammar permissive produces clearer error messages and
 *   a smaller grammar surface.
 */

grammar xDBML;

// ===========================================================================
// CASE SENSITIVITY POLICY
// ===========================================================================
//
// Keywords (Project, Container, Table, Entity, Type, Note, Edge, View, etc.)
// and reserved-word settings are case-insensitive. The lexer accepts any
// casing: `note`, `Note`, `NOTE`, and `nOtE` all match the same token.
//
// Identifiers (entity names, field names, container names, type names) are
// case-sensitive: `customer_email` and `Customer_Email` are different
// identifiers. This matters for target databases with different casing
// conventions (MongoDB uses camelCase, Cassandra uses lower_snake_case,
// Oracle defaults to UPPER_SNAKE_CASE).
//
// Implementation: the grammar-level `caseInsensitive=true` option flips
// the entire lexer to case-insensitive matching. The IDENTIFIER and
// quotedIdentifier rules explicitly opt out via per-rule `caseInsensitive=false`
// to preserve identifier case-sensitivity.

options {
    caseInsensitive = true;
}

import DBML;  // Holistics upstream grammar

// ===========================================================================
// UPSTREAM TOKENS DEPENDED UPON
// ===========================================================================
// xDBML extends DBML and inherits these tokens from the upstream grammar.
// A conforming implementation must merge with a DBML grammar that exposes
// at least the following:
//
//   Tokens:
//     IDENTIFIER         : standard identifier per [A-Za-z_][A-Za-z0-9_]*
//     QUOTED_STRING      : double-quoted, "..."
//     STRING_LITERAL     : single-quoted, '...'
//     MULTILINE_STRING   : triple-quoted, '''...'''
//     NUMBER             : integer or decimal, optional sign and exponent
//     EXPRESSION_LITERAL : backtick-quoted, `...`
//     LINE_COMMENT       : // to end of line (-> skip)
//     BLOCK_COMMENT      : /* ... */ (-> skip)
//     WS                 : whitespace (-> skip)
//
//   Keyword tokens:
//     TABLE              : 'Table'
//     PROJECT            : 'Project'
//     REF                : 'Ref'
//     ENUM               : 'enum'  (lowercase per DBML convention)
//     INDEXES            : 'indexes'
//     CHECKS             : 'checks' (DBML 3.13.6+; required for the §10 checks block)
//     NOTE               : 'Note'
//
// If the upstream DBML grammar evolves and a depended-upon token is renamed,
// the merged xDBML grammar must adapt. The xDBML test corpus
// (github.com/xdbml/xdbml-tests) includes round-trip tests that catch
// upstream-drift regressions.

// ===========================================================================
// LEXER TOKENS
// ===========================================================================

// ---- §17.1 Version declaration --------------------------------------------

XDBML_DIRECTIVE     : 'xdbml' ;
EXPERIMENTAL        : 'experimental' ;

// ---- §17.7 Container keywords (all parse to the same AST node) ------------

CONTAINER           : 'Container' ;
SCHEMA              : 'Schema' ;
DATABASE            : 'Database' ;
KEYSPACE            : 'Keyspace' ;
NAMESPACE           : 'Namespace' ;
DATASET             : 'Dataset' ;
BUCKET              : 'Bucket' ;

// ---- §17.4.2 Entity keywords (all parse to the same AST node) -------------
// NOTE: TABLE is already defined in upstream DBML; not redefined here.

ENTITY              : 'Entity' ;
COLLECTION          : 'Collection' ;
RECORD              : 'Record' ;

// ---- §17.8 Named-type construct -------------------------------------------

TYPE_KW             : 'Type' ;

// ---- §17.11 Edge ----------------------------------------------------------

EDGE                : 'Edge' ;

// ---- §14 View ------------------------------------------------------------

VIEW                : 'View' ;

// ---- §12 SupertypeGroup (spec v0.5) ---------------------------------------

SUPERTYPE_GROUP     : 'SupertypeGroup' ;

// ---- §17.2 Structural type keywords ---------------------------------------

OBJECT              : 'object' ;
STRUCT              : 'struct' ;     // alias for object
TYPE_RECORD         : 'record' ;     // alias for object (lowercase; uppercase is Entity keyword)
ARRAY               : 'array' ;
LIST                : 'list' ;       // alias for array
MAP                 : 'map' ;
DICT                : 'dict' ;       // alias for map
DICTIONARY          : 'dictionary' ; // alias for map
SET                 : 'set' ;

// ---- §17.3 Polymorphism keywords ------------------------------------------

UNION               : 'union' ;
ONE_OF              : 'oneOf' ;
ANY_OF              : 'anyOf' ;
ALL_OF              : 'allOf' ;

// ---- §17.5 JSON-with-schema keywords --------------------------------------

JSON                : 'json' ;
JSONB               : 'jsonb' ;
VARIANT             : 'variant' ;

// ---- §25 Module system keywords (new in v0.2) ------------------------------
// These are reserved in directive positions (the top-level useDirective rule).
// They remain available as identifiers in other contexts via quoted-identifier
// escape ("from", "use", etc.) per the spec's standard identifier conventions.

USE                 : 'use' ;
REUSE               : 'reuse' ;
FROM                : 'from' ;
AS                  : 'as' ;

// ---- §17.10 Cardinality operators -----------------------------------------
// NOTE: The single-character operators '<', '>', '-' are inherited from
// upstream DBML. The compound '<>' must be lexed as one token, otherwise
// the parser would see it as '<' followed by '>'.

MANY_TO_MANY        : '<>' ;

// ---- §17.10/17.11 Cardinality settings keys -------------------------------
// These are identifier-shaped and could be matched by the upstream IDENTIFIER
// rule. They are recognized at the parser level rather than the lexer level
// to avoid making them reserved everywhere they appear as identifiers.
// See `cardinalitySetting` rule below.

// ---- §17.9 AI-readiness setting keys --------------------------------------
// Same approach as cardinality keys -- recognized as parser rules.

// ---- §17.5/17.6 Path syntax tokens ----------------------------------------

LBRACK_STAR         : '[*]' ;        // wildcard array iteration
                                     // Lex as single token to avoid '[' STAR ']' ambiguity
                                     // with array brackets and bracket settings.

// '*' as a standalone token for the import-all form of use/reuse directives
// (new in v0.2): `use * from './path'`. The longest-match rule ensures
// '[*]' is still tokenized as LBRACK_STAR before this STAR rule applies
// to bare '*'.
STAR                : '*' ;

// ---- §17.1 Comments (already in upstream DBML; declared here for completeness)
// LINE_COMMENT     : '//' ~[\r\n]* -> skip ;
// BLOCK_COMMENT    : '/*' .*? '*/' -> skip ;

// ===========================================================================
// PARSER RULES
// ===========================================================================
// Top-level entry point -- replaces upstream DBML's top rule.
// xDBML adds versionDeclaration at the top and new top-level constructs
// alongside the upstream DBML constructs.

xdbmlDocument
    : versionDeclaration?
      experimentalDeclaration?
      topLevelStatement*
      EOF
    ;

// ---- §17.1 Version declaration --------------------------------------------

versionDeclaration
    : XDBML_DIRECTIVE COLON versionLiteral
    ;

versionLiteral
    : NUMBER ('.' NUMBER)* ('.' NUMBER)?    // e.g. 0.1, 0.1.0, 1.2.3
    ;

experimentalDeclaration
    : EXPERIMENTAL COLON LBRACK featureNameList? RBRACK
    ;

featureNameList
    : IDENTIFIER (COMMA IDENTIFIER)*
    ;

// ---- Top-level statements -------------------------------------------------

topLevelStatement
    : projectDefinition
    | containerDefinition          //§17.7
    | tableDefinition              // upstream DBML, accepts xDBML keywords (§17.4.2)
    | typeDefinition               //§17.8
    | edgeDefinition               //§17.11
    | viewDefinition               //§14
    | enumDefinition               // upstream DBML
    | refDefinition                // upstream DBML, extended for cardinality (§17.10)
    | tablePartialDefinition       // upstream DBML
    | tableGroupDefinition         // upstream DBML
    | supertypeGroupDefinition     // spec §12 (new in v0.5)
    | diagramViewDefinition        // upstream DBML
    | noteDefinition               // upstream DBML
    | useDirective                 //§25  (new in v0.2)
    ;

// ---- §3.9 List bodies (v0.6.1) ---------------------------------------------
//
// In a list body, a comma or a semicolon may stand between two items, before
// the first or after the last, alone or several in a row, with no meaning of
// its own. Every rule below whose body holds a list reads (item |
// listSeparator)*. A separator inside an item stays an error: `id, int` does
// not declare a field. `indexes` keeps whitespace-only separation, since
// `email, name` may be meant as the composite index `(email, name)`.
//
// List bodies: Entity (and its synonyms), TablePartial, Edge, View,
// object-shaped Type, object / struct / record, json schema, oneOf / anyOf /
// allOf, Enum, constraints, checks, TableGroup, SupertypeGroup, Project, and
// DiagramView with its categories (upstream DBML). The top level and a
// Container body hold declarations, separated by whitespace only. A records
// row ends at the end of its line (§26).

listSeparator
    : COMMA
    | SEMICOLON
    ;

tableDefinition
    : tableKeyword entityReference (AS IDENTIFIER)? settingsBlock? LBRACE
        (entityBodyItem | listSeparator)*
      RBRACE
    ;

tablePartialDefinition
    : 'TablePartial' IDENTIFIER settingsBlock? LBRACE
        (entityBodyItem | listSeparator)*
      RBRACE
    ;

entityBodyItem
    : fieldDeclaration             // includes ~partial injections
    | indexBlock
    | checksBlock
    | constraintsBlock             // v0.6 §10
    | recordsBlock                 // §26 (upstream DBML)
    | noteDefinition
    ;

enumDefinition
    : ENUM entityReference LBRACE
        (enumValue | listSeparator)*
      RBRACE
    ;

// An enum value is a name, a double-quoted name as in DBML, or a
// single-quoted name; "on hold" and 'on hold' are the same value (§16).
enumValue
    : (fieldName | QUOTED_STRING | STRING_LITERAL) settingsBlock?
    ;

tableGroupDefinition
    : 'TableGroup' IDENTIFIER settingsBlock? LBRACE
        (entityReference | listSeparator)*
      RBRACE
    ;

// ---- §17.7 Container ------------------------------------------------------

containerDefinition
    : containerKeyword IDENTIFIER settingsBlock? LBRACE
        containerBody*
      RBRACE
    ;

containerKeyword
    : CONTAINER | SCHEMA | DATABASE | KEYSPACE | NAMESPACE | DATASET | BUCKET
    ;

containerBody
    : tableDefinition              // Entity/Table/Collection/Record
    | edgeDefinition
    | viewDefinition
    | enumDefinition               // enums may be container-scoped
    | noteDefinition
    | useDirective                 //§25  (new in v0.2; field imports are semantically rejected here)
    | containerSetting             // e.g. replication, location, default_charset
    ;

containerSetting
    : IDENTIFIER COLON settingValue
    ;

// ---- §17.4.2 Entity keywords (overrides upstream tableKeyword) -----------

tableKeyword
    : TABLE | ENTITY | COLLECTION | RECORD
    ;

// ---- §17.8 Named type definition ------------------------------------------
// v0.2 extends Named Types to also support scalar shapes via the
// `Type Name <baseType> [settings]` form alongside the existing
// `Type Name { fields }` object-shaped form (§13.7).

typeDefinition
    : TYPE_KW IDENTIFIER settingsBlock? LBRACE      // object-shaped (v0.1 form)
        (fieldDeclaration | listSeparator)*
      RBRACE
    | TYPE_KW IDENTIFIER typeExpression settingsBlock?   // scalar (v0.2 form)
    ;

// ---- §25 Module system (new in v0.2) --------------------------------------
//
// The useDirective rule covers both `use` and `reuse`, both `*` (import all)
// and `{ ... }` (selective) forms, optional directive-level settings, and
// the optional clone block carrying the embedded content.
//
// Element-type slot values (`field`, `entity`, `table`, etc.) are accepted
// as contextual keywords (IDENTIFIER values) rather than reserved tokens.
// The semantic-analysis pass validates that each elementType matches one of
// the spec-defined values (§25.3) and applies the placement/scope rules:
//   - field imports may only appear at file scope (rejected in containerBody)
//   - useDirective never appears inside Entity/Edge/View/Type bodies
//   - container/schema imports may only appear at file scope (containers are
//     top-level constructs)
//
// The cloneBlock contains the imported content, which may itself include
// further useDirective declarations (e.g., a reuse'd barrel file's content).

useDirective
    : (USE | REUSE) (STAR | importList) FROM STRING_LITERAL
      settingsBlock?
      cloneBlock?
    ;

importList
    : LBRACE importItem (COMMA? importItem)* RBRACE
    ;

importItem
    : elementType importPath (AS IDENTIFIER)?
    ;

elementType
    // Contextual keyword: validated post-parse against the recognized set
    // (table, entity, collection, record, enum, tablepartial, note, schema,
    // container, tablegroup, type, edge, view, diagramview, field).
    : IDENTIFIER
    ;

importPath
    // Distinct from `qualifiedName` (which requires at least one dot) because
    // import paths may be bare identifiers (top-level entities, types, enums)
    // or dotted (container.entity, container.entity.field).
    : IDENTIFIER (DOT IDENTIFIER)*
    ;

cloneBlock
    // Embedded clone content. The contained declarations follow the same
    // grammar as the corresponding top-level declarations, with one extra
    // shape: a clone may itself contain useDirective (for cases like a
    // 'reuse *' on a barrel file whose content includes its own reuses).
    //
    // The contained `fieldDeclaration` alternative is what supports
    // field-level imports (the clone is just the field declaration alone).
    : LBRACE cloneContent* RBRACE
    ;

cloneContent
    : tableDefinition
    | containerDefinition
    | typeDefinition
    | edgeDefinition
    | viewDefinition
    | enumDefinition
    | tablePartialDefinition
    | tableGroupDefinition
    | supertypeGroupDefinition      // spec §12 (new in v0.5)
    | diagramViewDefinition
    | noteDefinition
    | fieldDeclaration              // for field-level imports
    | useDirective                  // nested reuses (barrel-file pattern)
    ;

// ---- §17.11 Edge -----------------------------------------------------------

edgeDefinition
    : EDGE IDENTIFIER edgeSettingsBlock LBRACE
        (edgeBody | listSeparator)*
      RBRACE
    ;

edgeSettingsBlock
    : LBRACK edgeSetting (COMMA edgeSetting)* RBRACK
    ;

edgeSetting
    : 'source'              COLON entityReference         //§17.11.1
    | 'target'              COLON entityReference         //§17.11.1
    | 'source_cardinality'  COLON cardinalityValue        //§17.11.2
    | 'target_cardinality'  COLON cardinalityValue        //§17.11.2
    | 'undirected'          COLON BOOLEAN_LITERAL         //§17.11.3
    | generalSetting                                      // notes, tags, x_* etc.
    ;

edgeBody
    : fieldDeclaration
    | indexBlock
    | constraintsBlock             // v0.6 §10
    | tablePartialInjection        // ~partial_name
    | noteDefinition
    ;

entityReference
    : IDENTIFIER (DOT IDENTIFIER)*   // bare name or container.entity
    ;

// ---- §14 View ----------------------------------------------------------------
//
// A View has a name, settings in brackets after the name, and a body. The
// body holds the source query, the fields and a note; the settings of §14.5
// go in the brackets only (§14.2). A `name: value` line in the body, such as
// `materialized: true`, is a syntax error, since a field name is never
// followed by ':'. A source_query written in the brackets, which the grammar
// of v0.6.0 accepted, parses as a generalSetting: it is not the view's source
// query, and the resolver reports a warning (§14.3, §14.7), as it does for a
// second source_query element in the body.

viewDefinition
    : VIEW IDENTIFIER viewSettingsBlock? LBRACE
        (viewBody | listSeparator)*
      RBRACE
    ;

viewSettingsBlock
    : LBRACK viewSetting (COMMA viewSetting)* RBRACK
    ;

viewSetting
    : 'materialized'      COLON BOOLEAN_LITERAL          //§14.2
    | 'refresh_schedule'  COLON STRING_LITERAL           //§14.5
    | 'refresh_on'        COLON LBRACK identifierList RBRACK  //§14.5
    | 'source_database'   COLON STRING_LITERAL           //§14.3, §14.5
    | 'storage_options'   COLON settingValue             //§14.5
    | generalSetting                                     // note, synonyms, x_* etc.
    ;

viewBody
    : SOURCE_QUERY COLON (STRING_LITERAL | multilineString)   //§14.3, at most once
    | fieldDeclaration
    | noteDefinition
    ;

// ---- §12 SupertypeGroup (new in v0.5) -------------------------------------
//
// One supertype and its immediate subtypes along one axis of
// specialization. The name is required: a writer exporting a group that has
// none emits undefinedGroup1, undefinedGroup2, ... Members are separated as
// in every list body (spec §3.9).
//
// The grammar accepts any identifier as a value. The rules of spec §12.8 are
// checked after parsing: `supertype:` is required, values must be canonical
// or an accepted alias (§12.2), an entity is a subtype in one group only,
// and so on. That keeps a mistyped value a located diagnostic rather than a
// parse failure.

supertypeGroupDefinition
    : SUPERTYPE_GROUP IDENTIFIER supertypeGroupSettingsBlock? LBRACE
        (supertypeGroupMember | listSeparator)*
      RBRACE
    ;

supertypeGroupSettingsBlock
    : LBRACK supertypeGroupSetting (COMMA supertypeGroupSetting)* COMMA? RBRACK
    ;

supertypeGroupSetting
    : 'supertype'      COLON entityReference                  //§12.1
    | 'completeness'   COLON IDENTIFIER   // total | partial                     §12.3
    | 'exclusivity'    COLON IDENTIFIER   // disjoint | overlapping              §12.3
    | 'strategy'       COLON IDENTIFIER   // preserved_hierarchy | roll_up | roll_down  §12.7.1
    | 'merge'          COLON IDENTIFIER   // flat | nested                       §12.7.2
    | 'discriminator'  COLON (IDENTIFIER | STRING_LITERAL)    //§12.7.3
    | generalSetting                      // note, x_* custom properties
    ;

supertypeGroupMember
    : entityReference subtypeSettingsBlock?
    ;

subtypeSettingsBlock
    : LBRACK subtypeSetting (COMMA subtypeSetting)* COMMA? RBRACK
    ;

subtypeSetting
    : 'strategy' COLON IDENTIFIER                              //§12.7.4
    | generalSetting                      // x_* custom properties
    ;

// ---- §17.2 Type expressions (the core recursive type rule) ----------------
// Replaces upstream columnType. Used everywhere a type appears:
//   - field declarations
//   - named type bodies
//   - array elements
//   - map keys and values
//   - polymorphic alternatives
//   - tuple positions

typeExpression
    : scalarType                           //§17.2.1 - varchar, int, objectId, etc.
    | objectType                           //§17.2.1 - object { fields }
    | arrayType                            //§17.2.2 - array [element_type]
    | tupleType                            //§17.2.4 - array [ [0] name type, [1] name type ]
    | mapType                              //§17.2.7 - map [key_type, value_type]
    | setType                              //§17.2.7 - set [element_type]
    | unionType                            //§17.3.1 - union [type, type, null]
    | oneOfType                            //§17.3.2 - oneOf { name type, name type }
    | anyOfType                            //§17.3.2 - anyOf { ... }
    | allOfType                            //§17.3.2 - allOf { ... }
    | jsonType                             //§17.5   - json { fields } or json (opaque)
    | namedTypeReference                   //§17.8   - bare name of a Type declaration
    ;

scalarType
    : typeName ( LPAREN typeParameterList RPAREN )?   // e.g. varchar, decimal(19,4), objectId, core.job_status
    ;

// A type name may be qualified, as in DBML: `core.job_status` names an Enum
// declared in container `core` (spec §16). Any other name, qualified or not,
// passes through as a target-native type (spec §1.2). A segment may be
// quoted: "billing"."invoice status".
typeName
    : typeNameSegment (DOT typeNameSegment)*
    ;

typeNameSegment
    : IDENTIFIER
    | quotedIdentifier
    ;

typeParameterList
    : (NUMBER | STRING_LITERAL) (COMMA (NUMBER | STRING_LITERAL))*
    ;

objectType
    : objectKeyword LBRACE (fieldDeclaration | listSeparator)* RBRACE
    ;

objectKeyword
    : OBJECT | STRUCT | TYPE_RECORD
    ;

arrayType
    // A single element type is the common case. A comma-separated list --
    // `array [T1, T2, ...]` -- is shorthand for `array [union [T1, T2, ...]]`;
    // the listed types must be scalar or named types (or `null`), the same
    // members a `union` accepts.
    : arrayKeyword LBRACK typeExpression (COMMA typeExpression)* RBRACK
    ;

arrayKeyword
    : ARRAY | LIST
    ;

tupleType
    : arrayKeyword LBRACK
        tupleElement (COMMA? tupleElement)+
      RBRACK
    ;

tupleElement
    : LBRACK NUMBER RBRACK IDENTIFIER typeExpression settingsBlock?
    //  ^^^^^^^^^^^^^^^^^^ position index
    //                     ^^^^^^^^^^ element name
    //                                ^^^^^^^^^^^^^^ element type
    ;

mapType
    : mapKeyword LBRACK typeExpression COMMA typeExpression RBRACK
    ;

mapKeyword
    : MAP | DICT | DICTIONARY
    ;

setType
    // Like arrayType, a comma-separated list -- `set [T1, T2, ...]` -- is
    // shorthand for `set [union [T1, T2, ...]]`.
    : SET LBRACK typeExpression (COMMA typeExpression)* RBRACK
    ;

// ---- §17.3 Polymorphism ---------------------------------------------------

unionType
    : UNION LBRACK unionMember (COMMA unionMember)+ RBRACK
    ;

unionMember
    : scalarType
    | NULL_LITERAL          // 'null' as a type-membership keyword (§8.9)
    ;

oneOfType
    : ONE_OF LBRACE listSeparator* polymorphicAlternative (polymorphicAlternative | listSeparator)* RBRACE polymorphicSettings?
    ;

anyOfType
    : ANY_OF LBRACE listSeparator* polymorphicAlternative (polymorphicAlternative | listSeparator)* RBRACE polymorphicSettings?
    ;

allOfType
    : ALL_OF LBRACE listSeparator* polymorphicAlternative (polymorphicAlternative | listSeparator)* RBRACE polymorphicSettings?
    ;

polymorphicAlternative
    : IDENTIFIER typeExpression settingsBlock?
    //  ^^^^^^^^ alternative name (used as discriminator value and path selector)
    //           ^^^^^^^^^^^^^^ alternative type (usually objectType)
    ;

polymorphicSettings
    : LBRACK 'discriminator' COLON IDENTIFIER (COMMA generalSetting)* RBRACK
    ;

// ---- §17.5 JSON-with-schema -----------------------------------------------

jsonType
    : jsonKeyword ( LBRACE (fieldDeclaration | listSeparator)* RBRACE )?
    //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //          Optional schema block; absence = opaque JSON
    ;

jsonKeyword
    : JSON | JSONB | VARIANT
    ;

// ---- §17.8 Named-type reference -------------------------------------------
// A bare IDENTIFIER that resolves at semantic-analysis time. Built-in type
// keywords always win the parse; named types fill the remaining identifier
// space.

namedTypeReference
    : IDENTIFIER
    ;

// ---- Field declarations (used in entities, edges, views, types, objects) --

fieldDeclaration
    : fieldName typeExpression settingsBlock?
    | quotedIdentifier typeExpression settingsBlock?    // for non-identifier names
    | tablePartialInjection
    ;

// ---- §3.10 Keywords and field names (v0.6.1) ------------------------------
// No keyword is reserved as the name of a field or of an enum value. In a
// body, six words start an element, each only when the token that element
// needs follows it: Note before ':' or '{'; indexes, checks, constraints and
// records before '{'; source_query before ':'. A field declaration never has
// ':' or '{' right after its name, so two tokens of lookahead separate the
// readings. fieldName lists these six; every other keyword also names a
// field, and an implementation whose lexer reserves keyword tokens accepts
// them here as well.

fieldName
    : IDENTIFIER
    | NOTE | INDEXES | CHECKS | CONSTRAINTS | RECORDS | SOURCE_QUERY
    ;

tablePartialInjection
    : TILDE IDENTIFIER
    ;

quotedIdentifier
    : QUOTED_STRING                    // double-quoted, §3.2 of v0.1 spec
    ;

// ---- §17.6 Path syntax for nested-field references ------------------------
// Paths are used in:
//   - index entries (§9.3)
//   - ref endpoints (§10.5, §10.6)
//   - edge endpoints
//   - cross-container references (§6.6)
//
// The grammar accepts both the canonical dot-prefixed form (.[N], .[*])
// and the JSONPath-style form ([N], [*] without leading dot). A
// post-parse normalization pass converts the JSONPath form to canonical.

fieldPath
    : pathHead pathTail*
    ;

pathHead
    : IDENTIFIER                       // entity-relative path start
    | qualifiedName                    // container.entity-qualified path start
    ;

qualifiedName
    : IDENTIFIER (DOT IDENTIFIER)+
    ;

pathTail
    : DOT IDENTIFIER                   // .field_name
    | DOT LBRACK NUMBER RBRACK         // .[N]  positional
    | DOT LBRACK_STAR                  // .[*]  wildcard
    | DOT LBRACK STRING_LITERAL RBRACK // .["literal_key"]
    | DOT QUOTED_STRING                // ."quoted name"
    | LBRACK NUMBER RBRACK             // [N]   JSONPath alias (normalized)
    | LBRACK_STAR                      // [*]   JSONPath alias (normalized)
    ;

// ---- Index block (overrides upstream to support nested paths) -------------

// Not a list body (§3.9): entries are separated by whitespace only, so
// `email, name` is an error rather than two indexes; a composite index is
// written `(email, name)`.
indexBlock
    : INDEXES LBRACE indexEntry* RBRACE
    ;

indexEntry
    : fieldPath settingsBlock?
    | LPAREN indexComponent (COMMA indexComponent)+ RPAREN settingsBlock?
    | LPAREN EXPRESSION_LITERAL RPAREN settingsBlock?
    ;

indexComponent
    : fieldPath
    | EXPRESSION_LITERAL
    ;

// ---- §10 Checks block (entity-level constraints; new for v0.2) ------------
// Mirrors DBML 3.13.6 syntax. Each check is a backtick-wrapped expression
// (lexed as EXPRESSION_LITERAL) with optional settings (name, note).
// The block is a peer of indexBlock; both are entity-body alternatives.
// xDBML treats the expression as an opaque string and does not validate it.

checksBlock
    : CHECKS LBRACE (checkEntry | listSeparator)* RBRACE
    ;

// v0.6 (§10.5): a check expression is written in single (or triple)
// quotes, with backticks accepted as an alias. The quoted forms require a
// document declaring `xdbml: 0.6` or later; the resolver enforces that.
checkEntry
    : (STRING_LITERAL | MULTILINE_STRING | EXPRESSION_LITERAL) settingsBlock?
    ;

// ---- §10 Constraints block (new for v0.6) ----------------------------------
// Keys and checks in one entity-level block, a peer of indexBlock and
// checksBlock in entity, TablePartial and edge bodies. A key line names one
// field, or a parenthesized list in key order, and carries `pk` or `unique`
// (plus optional `name`, `note`); the resolver checks the flags, that the
// fields exist, and that a key path steps through object fields only. A
// check line is a checkEntry. `constraints` is a keyword only when `{`
// follows it, so a field may still be named `constraints`.

constraintsBlock
    : CONSTRAINTS LBRACE (constraintEntry | listSeparator)* RBRACE
    ;

constraintEntry
    : keyConstraint
    | checkEntry
    ;

keyConstraint
    : fieldPath settingsBlock?
    | LPAREN fieldPath (COMMA fieldPath)* RPAREN settingsBlock?
    ;

// ---- §11 Ref definitions (overrides upstream refSpec) --------------------
// Adds explicit cardinality settings on the Ref. Paths support nested fields.
//
// A Ref carries the relationship type in its settings block: the
// `foreign_master` flag marks denormalized replication, and its absence
// marks a referential relationship (a foreign key). See §11.10.
//
// v0.4 accepts a settings block in the long form as well, so all three
// declaration forms carry the same settings.

refDefinition
    : REF IDENTIFIER? LBRACE refSpec settingsBlock? RBRACE        // long form (settings new in v0.4)
    | REF IDENTIFIER? COLON refSpec settingsBlock?                // short form
    ;

refSpec
    : refEndpoint cardinalityOperator refEndpoint
    ;

refEndpoint
    : fieldPath
    | qualifiedName DOT LPAREN identifierList RPAREN              // composite FK
    ;

cardinalityOperator
    : LANGLE             // '<'  one-to-many
    | RANGLE             // '>'  many-to-one
    | MINUS              // '-'  one-to-one
    | MANY_TO_MANY       // '<>' many-to-many
    ;

// ---- §17.10 Cardinality settings (on Ref and via edgeSetting on Edge) -----

cardinalityValue
    : STRING_LITERAL     // '1..*', '0..1', '0..*', 'N..M' -- content validated semantically
    ;

cardinalitySetting
    : 'source'           COLON cardinalityValue
    | 'target'           COLON cardinalityValue
    | 'min_source'       COLON (NUMBER | STRING_LITERAL)    // STRING_LITERAL allows '*' as unbounded marker
    | 'max_source'       COLON (NUMBER | STRING_LITERAL)
    | 'min_target'       COLON (NUMBER | STRING_LITERAL)
    | 'max_target'       COLON (NUMBER | STRING_LITERAL)
    ;

// ---- §17.9 AI-readiness settings ------------------------------------------

aiReadinessSetting
    : 'synonyms'      COLON LBRACK stringList RBRACK      //§17.9.1
    | 'business_term' COLON STRING_LITERAL                //§17.9.2
    | 'granularity'   COLON granularityValue              //§17.9.3
    | 'tags'          COLON LBRACK stringList RBRACK      //§17.9.4
    ;

granularityValue
    : 'year' | 'quarter' | 'month' | 'week' | 'day'
    | 'hour' | 'minute' | 'second'
    | 'millisecond' | 'microsecond' | 'nanosecond'
    ;

// ---- §17.9.5 Custom properties (x_ prefix convention) ---------------------
// Custom properties are accepted as generic settings; the x_ prefix is a
// recommendation enforced (warned about) at lint time, not at parse time.

customProperty
    : XPREFIXED_IDENTIFIER COLON settingValue
    ;

XPREFIXED_IDENTIFIER
    : 'x_' [A-Za-z0-9_]+
    ;

// ---- Settings (generalized) -----------------------------------------------
// Settings appear in [ ... ] after most constructs. xDBML's settings vocabulary
// is open: the parser accepts any IDENTIFIER COLON value pair, plus the
// recognized first-class settings (validation constraints, AI-readiness,
// cardinality, etc.) for stronger error messages.

settingsBlock
    : LBRACK setting (COMMA setting)* RBRACK
    ;

setting
    : aiReadinessSetting
    | cardinalitySetting
    | validationSetting
    | customProperty
    | generalSetting
    | flagSetting
    ;

flagSetting
    : 'pk' | 'primary key' | 'unique' | 'null' | 'not null' | 'required' | 'increment'
    ;

generalSetting
    : IDENTIFIER COLON settingValue
    | quotedIdentifier COLON settingValue
    ;

// ---- §17.5 (validation constraints; full JSON Schema vocabulary) ---------

validationSetting
    : 'pattern'           COLON STRING_LITERAL
    | 'format'            COLON (IDENTIFIER | STRING_LITERAL)
    | 'minLength'         COLON NUMBER
    | 'maxLength'         COLON NUMBER
    | 'minimum'           COLON NUMBER
    | 'maximum'           COLON NUMBER
    | 'exclusiveMinimum'  COLON NUMBER
    | 'exclusiveMaximum'  COLON NUMBER
    | 'multipleOf'        COLON NUMBER
    | 'minItems'          COLON NUMBER
    | 'maxItems'          COLON NUMBER
    | 'uniqueItems'       COLON BOOLEAN_LITERAL
    | 'minProperties'     COLON NUMBER
    | 'maxProperties'     COLON NUMBER
    ;

// ---- Setting values -------------------------------------------------------

settingValue
    : STRING_LITERAL
    | multilineString
    | NUMBER
    | BOOLEAN_LITERAL
    | NULL_LITERAL
    | IDENTIFIER
    | qualifiedName
    | EXPRESSION_LITERAL                          // backtick-quoted
    | LBRACK valueList RBRACK                     // list value
    | LBRACE keyValueList RBRACE                  // nested object value
    ;

valueList
    : settingValue (COMMA settingValue)*
    ;

keyValueList
    : (IDENTIFIER COLON settingValue) (COMMA IDENTIFIER COLON settingValue)*
    ;

stringList
    : STRING_LITERAL (COMMA STRING_LITERAL)*
    ;

identifierList
    : IDENTIFIER (COMMA IDENTIFIER)*
    ;

multilineString
    : MULTILINE_STRING                            // '''...''' (already in upstream)
    ;

// ---- Project definition (extended from upstream with new settings) --------

projectDefinition
    : PROJECT IDENTIFIER LBRACE
        (projectSetting | listSeparator)*
      RBRACE
    ;

projectSetting
    : 'targets' COLON (stringOrIdent | stringOrIdentList)
    | 'database_type' COLON stringOrIdent                 // DBML-compatibility alias for single-target targets:
    | noteDefinition
    | generalSetting
    | customProperty
    ;

// Allow bare identifiers in settings where strings are expected. A bare
// identifier like `Oracle` is equivalent to the quoted form `'Oracle'`.
// Quoted form is still required when the value contains spaces, punctuation,
// or characters outside the bare-identifier character set.
stringOrIdent
    : STRING_LITERAL
    | IDENTIFIER
    ;

stringOrIdentList
    : LBRACK stringOrIdent (COMMA stringOrIdent)* RBRACK
    ;

// ===========================================================================
// LEXER FRAGMENTS AND TOKEN ALIASES
// ===========================================================================
// Tokens already defined by upstream DBML are not redeclared. Where xDBML
// needs a token that DBML doesn't expose by name (e.g. specific punctuation),
// a parser-rule alias is provided.

LBRACE              : '{' ;
RBRACE              : '}' ;
LBRACK              : '[' ;
RBRACK              : ']' ;
LPAREN              : '(' ;
RPAREN              : ')' ;
COLON               : ':' ;
COMMA               : ',' ;
SEMICOLON           : ';' ;
DOT                 : '.' ;
CONSTRAINTS         : 'constraints' ;   // v0.6 §10; contextual: a keyword only before '{'
RECORDS             : 'records' ;       // §26; contextual: a keyword only before '{' (v0.6.1 §3.10)
SOURCE_QUERY        : 'source_query' ;  // §14.3; contextual: a keyword only before ':' (v0.6.1 §3.10)
TILDE               : '~' ;
LANGLE              : '<' ;
RANGLE              : '>' ;
MINUS               : '-' ;

BOOLEAN_LITERAL     : 'true' | 'false' ;
NULL_LITERAL        : 'null' ;

// ----------------------------------------------------------------------------
// IDENTIFIER and quotedIdentifier override the upstream DBML versions to
// opt out of grammar-level case-insensitivity. Identifiers (entity names,
// field names, container names, type names) preserve user-supplied case.
// `customer_email` and `Customer_Email` are different identifiers because
// target databases have different casing conventions:
//   - MongoDB: typically camelCase (orderId, customerEmail)
//   - Cassandra: lower_snake_case
//   - Oracle: UPPER_SNAKE_CASE by default
//   - PostgreSQL: lower_snake_case by convention
//
// Per-rule `caseInsensitive=false` overrides the grammar-level
// `caseInsensitive=true` option declared at the top of this file.
// ----------------------------------------------------------------------------

IDENTIFIER options { caseInsensitive=false; }
    : [a-zA-Z_] [a-zA-Z0-9_]*
    ;

// quotedIdentifier supports identifiers with spaces or punctuation, common
// in legacy systems and SQL identifiers with embedded spaces.
quotedIdentifier options { caseInsensitive=false; }
    : '"' (~["\r\n])+ '"'
    ;

// NUMBER, STRING_LITERAL, MULTILINE_STRING, QUOTED_STRING,
// EXPRESSION_LITERAL, LINE_COMMENT, BLOCK_COMMENT, WS -- inherited from
// upstream DBML grammar.

// ===========================================================================
// NOTES FOR PARSER IMPLEMENTERS
// ===========================================================================
//
// 1. AST construction. The grammar above produces a parse tree that maps
//    directly to the AST documented in §26 (v0.2). Where the grammar accepts
//    multiple equivalent forms (e.g. tableKeyword alternatives, jsonKeyword
//    alternatives, dot-prefixed vs JSONPath path segments), a normalization
//    pass converts to canonical form before handing off to generators.
//
// 2. Path normalization. Both `addresses.[0].city` and `addresses[0].city`
//    parse via the fieldPath rule. The parser preserves the original form
//    in the raw AST; the normalizer rewrites the JSONPath alias form to the
//    canonical dot-prefixed form in the normalized AST flavor.
//
// 3. Polymorphic alternative naming. The polymorphicAlternative rule has
//    the same shape as fieldDeclaration (`IDENTIFIER typeExpression`).
//    Context disambiguates: inside oneOf/anyOf/allOf blocks, identifiers
//    are alternative names; inside object blocks, they are field names.
//
// 4. Semantic constraints enforced post-parse:
//      - tuple positions must be contiguous starting at 0 (§17.2.4)
//      - named types cannot shadow built-in type keywords (§13)
//      - ref paths require explicit .[*] when crossing an array (§18)
//      - polymorphic paths require explicit alternative selectors (§19)
//      - cardinality string content must match 'N..M' shape (§10)
//      - cross-container refs must resolve to declared containers and entities
//      - circular type references must form valid cycles (§13)
//      - module system (§25, new in v0.2):
//          * elementType slot values must be one of the recognized values
//            (table, entity, collection, record, enum, tablepartial, note,
//            schema, container, tablegroup, type, edge, view, diagramview,
//            field). Other values produce a clear error.
//          * field-element-type imports may only appear at file scope
//            (the containerBody alternative for useDirective is rejected
//            when the import items include `field`).
//          * container/schema imports may only appear at file scope
//            (Containers are top-level constructs).
//          * import paths must start with './' or '../' (relative paths only
//            in v0.2 phase 1; URLs deferred to a later phase).
//          * clone-block content (cloneContent) names must match the directive's
//            import items by name and element type, in any order.
//          * `xdbml: 0.1` documents may not use module-system constructs.
//      - entity-level checks block (§10, new in v0.2):
//          * each check expression is treated as an opaque target-engine
//            expression; xDBML does not validate the expression syntax.
//          * the `name:` setting is optional; generators MAY synthesize
//            a deterministic name when omitted.
//      - relationship settings (§11.9):
//          * `inactive` is a flag (no value); a visualization hint, not
//            a structural change. Parser preserves the flag in the AST.
//      - foreign master relationships (§11.10, new in v0.4):
//          * `foreign_master` is a flag (no value) on a Ref. Its absence
//            marks the relationship referential.
//          * neither endpoint may use the composite form `entity.(a, b)`
//            (§11.11). The grammar accepts it; the check is semantic so the
//            error can name the flag rather than fail on syntax alone.
//          * a given child attribute is the child of at most one foreign
//            master relationship (§11.11).
//          * on a field, `foreign_master` qualifies an inline `ref:` in the
//            same settings block and is an error without one (§11.10.2).
//          * the flag requires a document declaring `xdbml: 0.4` or later.
//      - relationship documentation (§11.14, §11.15, new in v0.4):
//          * `source_role` / `target_role` and `source_verb` / `target_verb`
//            are free text and never reach a generator.
//          * `constraint_type` takes `identifying` or `non_identifying`.
//            Any other value is an error. It does not apply to a foreign
//            master relationship, which carries no key dependency.
//          * these settings require a document declaring `xdbml: 0.4`.
//      - entity-level relationships (§11.16, new in v0.4):
//          * a Ref endpoint may name an entity and stop there, as in
//            `Customer` or `shop.orders`. The attribute reading of §11.5 is
//            tried first, so an endpoint that resolved under v0.3 resolves
//            the same way; the whole path is tried as an entity only when
//            that fails.
//          * a path naming both an entity and a field of another entity is
//            reported as a warning; the field reading wins.
//          * the operator carries reading direction alone and the default
//            cardinality inference of §11.8 does not apply.
//          * `<>` is rejected between entities: many-to-many states a
//            cardinality, which is unstated there.
//          * `undirected` takes true or false (§11.16.2).
//
// 5. Conflict resolution with upstream DBML. Where xDBML extends a rule
//    that exists upstream (tableKeyword, fieldPath, refSpec, indexBlock,
//    typeDefinition), the xDBML version replaces the upstream rule wholesale.
//    ANTLR4's `import` directive does not automatically resolve rule
//    replacements; a build script generates the merged grammar by composing
//    the upstream rules with xDBML's overrides.
//
// 6. Comments. Lexer rules for LINE_COMMENT, BLOCK_COMMENT, and WS are
//    inherited unchanged from upstream DBML and apply to xDBML documents.
//
// 7. Reserved keywords. The lexer tokens above (XDBML_DIRECTIVE,
//    EXPERIMENTAL, CONTAINER, SCHEMA, DATABASE, KEYSPACE, NAMESPACE,
//    DATASET, BUCKET, ENTITY, COLLECTION, RECORD, TYPE_KW, EDGE, VIEW,
//    OBJECT, STRUCT, TYPE_RECORD, ARRAY, LIST, MAP, DICT, DICTIONARY,
//    SET, UNION, ONE_OF, ANY_OF, ALL_OF, JSON, JSONB, VARIANT, USE,
//    REUSE, FROM, AS) are reserved per Appendix A. They are matched before
//    IDENTIFIER by the lexer's standard longest-match-with-priority rule.
//    To use a reserved keyword as an entity or field name, wrap it in
//    QUOTED_STRING.
//
// 8. Testing. A conforming parser implementation should:
//      - Round-trip every example in Appendix C of the v0.2 spec
//      - Reject malformed documents with line/column error reporting
//      - Honor version-mismatch behavior per §4 (v0.1 vs v0.2 features)
//      - Produce both raw and normalized AST flavors per §26
//      - Parse v0.1 documents with v0.1 semantics
//      - Implement module-system parsing per §25 including clone blocks
//    A reference test corpus is published at github.com/xdbml/xdbml-tests.
//
// ===========================================================================
