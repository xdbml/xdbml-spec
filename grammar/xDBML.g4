/*
 * xDBML v0.1 -- ANTLR4 grammar additions
 *
 * Status:    Draft v0.1 -- pre-stable
 * License:   Apache License 2.0
 * Spec:      xDBML Specification v0.1 (xdbml.org/spec/v0.1)
 * Upstream:  github.com/holistics/dbml (Apache 2.0)
 *
 * This grammar layers xDBML extensions on top of the Holistics DBML
 * ANTLR4 grammar. It declares new tokens, new top-level rules, and
 * a small number of replacements for DBML rules that needed extending.
 *
 * Replacements (rules redefined here that override upstream DBML):
 *   - tableDefinition  (adds Entity/Collection/Record keywords)
 *   - columnType       (replaced by typeExpression)
 *   - refSpec          (adds explicit cardinality, .[*] in paths)
 *   - indexEntry       (adds nested-field path support)
 *   - schemaPrefix     (kept; explicit Container blocks coexist)
 *
 * Naming conventions:
 *   - Lowercase rule names = parser rules
 *   - UPPERCASE token names = lexer tokens
 *   - Section comments use //§17.X.Y to reference the spec
 *
 * Implementation note for parser writers:
 *   This grammar is intentionally permissive at the parse level. Several
 *   constraints (e.g. "tuple positions must be contiguous starting at 0",
 *   "named types cannot shadow builtins", "Ref paths require explicit .[*]
 *   when crossing arrays") are enforced in a semantic-analysis pass that
 *   runs after parse. Keeping the grammar permissive produces clearer
 *   error messages and a smaller grammar surface.
 */

grammar xDBML;

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

// ---- §17.12 View ----------------------------------------------------------

VIEW                : 'View' ;

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
    | viewDefinition               //§17.12
    | enumDefinition               // upstream DBML
    | refDefinition                // upstream DBML, extended for cardinality (§17.10)
    | tablePartialDefinition       // upstream DBML
    | tableGroupDefinition         // upstream DBML
    | diagramViewDefinition        // upstream DBML
    | noteDefinition               // upstream DBML
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

typeDefinition
    : TYPE_KW IDENTIFIER settingsBlock? LBRACE
        fieldDeclaration*
      RBRACE
    ;

// ---- §17.11 Edge -----------------------------------------------------------

edgeDefinition
    : EDGE IDENTIFIER edgeSettingsBlock LBRACE
        edgeBody*
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
    | tablePartialInjection        // ~partial_name
    | noteDefinition
    ;

entityReference
    : IDENTIFIER (DOT IDENTIFIER)*   // bare name or container.entity
    ;

// ---- §17.12 View -----------------------------------------------------------

viewDefinition
    : VIEW IDENTIFIER viewSettingsBlock? LBRACE
        viewBody*
      RBRACE
    ;

viewSettingsBlock
    : LBRACK viewSetting (COMMA viewSetting)* RBRACK
    ;

viewSetting
    : 'source_query'      COLON multilineString          //§17.12.1
    | 'materialized'      COLON BOOLEAN_LITERAL          //§17.12.2
    | 'refresh_schedule'  COLON STRING_LITERAL           //§17.12.2
    | 'refresh_on'        COLON LBRACK identifierList RBRACK  //§17.12.2
    | 'source_database'   COLON STRING_LITERAL           //§17.12.3
    | 'storage_options'   COLON settingValue             //§17.12.5
    | generalSetting
    ;

viewBody
    : 'source_query' COLON multilineString    // also allowed inside body for readability
    | fieldDeclaration
    | noteDefinition
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
    : IDENTIFIER ( LPAREN typeParameterList RPAREN )?   // e.g. varchar, decimal(19,4), objectId
    ;

typeParameterList
    : (NUMBER | STRING_LITERAL) (COMMA (NUMBER | STRING_LITERAL))*
    ;

objectType
    : objectKeyword LBRACE fieldDeclaration* RBRACE
    ;

objectKeyword
    : OBJECT | STRUCT | TYPE_RECORD
    ;

arrayType
    : arrayKeyword LBRACK typeExpression RBRACK
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
    : SET LBRACK typeExpression RBRACK
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
    : ONE_OF LBRACE polymorphicAlternative+ RBRACE polymorphicSettings?
    ;

anyOfType
    : ANY_OF LBRACE polymorphicAlternative+ RBRACE polymorphicSettings?
    ;

allOfType
    : ALL_OF LBRACE polymorphicAlternative+ RBRACE polymorphicSettings?
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
    : jsonKeyword ( LBRACE fieldDeclaration* RBRACE )?
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
    : IDENTIFIER typeExpression settingsBlock?
    | quotedIdentifier typeExpression settingsBlock?    // for non-identifier names
    | tablePartialInjection
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

// ---- §17.10 Ref definitions (overrides upstream refSpec) ------------------
// Adds explicit cardinality settings on the Ref. Paths support nested fields.

refDefinition
    : REF IDENTIFIER? LBRACE refSpec RBRACE                       // long form
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
    : 'pk' | 'primary key' | 'unique' | 'null' | 'not null' | 'increment'
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
        projectSetting*
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
DOT                 : '.' ;
TILDE               : '~' ;
LANGLE              : '<' ;
RANGLE              : '>' ;
MINUS               : '-' ;

BOOLEAN_LITERAL     : 'true' | 'false' ;
NULL_LITERAL        : 'null' ;

// IDENTIFIER, NUMBER, STRING_LITERAL, MULTILINE_STRING, QUOTED_STRING,
// EXPRESSION_LITERAL, LINE_COMMENT, BLOCK_COMMENT, WS -- inherited from
// upstream DBML grammar.

// ===========================================================================
// NOTES FOR PARSER IMPLEMENTERS
// ===========================================================================
//
// 1. AST construction. The grammar above produces a parse tree that maps
//    directly to the AST documented in §17.10 (working spec) / §25 (v0.1).
//    Where the grammar accepts multiple equivalent forms (e.g. tableKeyword
//    alternatives, jsonKeyword alternatives, dot-prefixed vs JSONPath path
//    segments), a normalization pass converts to canonical form before
//    handing off to generators.
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
//      - named types cannot shadow built-in type keywords (§17.8.2)
//      - ref paths require explicit .[*] when crossing an array (§17.6.5)
//      - polymorphic paths require explicit alternative selectors (§17.6.6)
//      - cardinality string content must match 'N..M' shape (§17.10.1)
//      - cross-container refs must resolve to declared containers and entities
//      - circular type references must form valid cycles (§17.8.4)
//
// 5. Conflict resolution with upstream DBML. Where xDBML extends a rule
//    that exists upstream (tableKeyword, fieldPath, refSpec, indexBlock),
//    the xDBML version replaces the upstream rule wholesale. ANTLR4's
//    `import` directive does not automatically resolve rule replacements;
//    a build script generates the merged grammar by composing the upstream
//    rules with xDBML's overrides.
//
// 6. Comments. Lexer rules for LINE_COMMENT, BLOCK_COMMENT, and WS are
//    inherited unchanged from upstream DBML and apply to xDBML documents.
//
// 7. Reserved keywords. The lexer tokens above (XDBML_DIRECTIVE,
//    EXPERIMENTAL, CONTAINER, SCHEMA, DATABASE, KEYSPACE, NAMESPACE,
//    DATASET, BUCKET, ENTITY, COLLECTION, RECORD, TYPE_KW, EDGE, VIEW,
//    OBJECT, STRUCT, TYPE_RECORD, ARRAY, LIST, MAP, DICT, DICTIONARY,
//    SET, UNION, ONE_OF, ANY_OF, ALL_OF, JSON, JSONB, VARIANT) are
//    reserved per Appendix A. They are matched before IDENTIFIER by the
//    lexer's standard longest-match-with-priority rule. To use a reserved
//    keyword as an entity or field name, wrap it in QUOTED_STRING.
//
// 8. Testing. A conforming parser implementation should:
//      - Round-trip every example in Appendix C of the v0.1 spec
//      - Reject malformed documents with line/column error reporting
//      - Honor version-mismatch behavior per §17.1
//      - Produce both raw and normalized AST flavors per §17.10.3
//    A reference test corpus is published at github.com/xdbml/xdbml-tests.
//
// ===========================================================================
