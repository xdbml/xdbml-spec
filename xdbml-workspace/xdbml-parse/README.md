# @xdbml/parse — proof-of-concept

A TypeScript parser for **xDBML v0.1**, the eXtended Database Markup
Language ([xdbml.org/spec/v0.1](https://xdbml.org/spec/v0.1)). xDBML is a
strict superset of DBML 3.13.6 that adds containers, named reusable
types, nested object/array/map/set types, polymorphism
(`union`/`oneOf`/`anyOf`/`allOf`), JSON with schema, property-bearing
edges, views with opaque source queries, BSON scalar types, explicit
cardinality, AI-readiness metadata, and a structured custom-property
mechanism.

This package is a **proof of concept**. It parses every official example
in [`xdbml/xdbml-spec/examples`](https://github.com/xdbml/xdbml-spec/tree/main/examples)
and a focused suite of inline grammar tests, demonstrating the
architecture. It is not yet a complete reference parser — see
[Coverage and gaps](#coverage-and-gaps) below for what's in and what's
deferred.

## Quick start

Requires Node.js 22 or later.

```bash
node --experimental-strip-types test/run-tests.ts
```

Expected output:

```
== Inline grammar tests ==
  ✓ Bare DBML compat: no version header, simple Table
  ✓ Version header recognized
  ✓ Container with type setting
  ... (22 inline tests)
== Official example files (xdbml/xdbml-spec/examples) ==
  ✓ Parse 01-blog.xdbml
  ✓ Parse 02-ecommerce.xdbml
  ✓ Parse 03-iot-telemetry.xdbml
  ✓ Parse 04-social-graph.xdbml
  ✓ Parse 05-healthcare-fhir.xdbml
  ✓ Parse 06-financial-services.xdbml
== Summary ==
  28 passed, 0 failed
```

## Programmatic use

```typescript
import { parse } from '@xdbml/parse';

const doc = parse(`
  xdbml: 0.1
  Project ecommerce { targets: PostgreSQL }
  Container core [type: schema] {
    Entity customers {
      id    int     [pk]
      email varchar [unique, not null, pattern: '^[^@]+@[^@]+$']
    }
  }
`);

// doc.version, doc.statements, etc. -- all fully typed
```

The AST shape is defined in [`src/ast.ts`](src/ast.ts). Every node carries
a `span: { start, end }` with line/column/offset positions, so consumers
can produce useful error messages, formatters, and language services.

## Architecture

Three layers:

1. **Lexer** ([`src/lexer.ts`](src/lexer.ts), ~430 LOC) — produces a
   token stream from source text. Handles single-line and block
   comments, single-quoted and triple-quoted strings (with indentation
   normalization per spec §3.3), backtick expression literals,
   quoted identifiers, numbers with optional decimal and exponent, and
   the multi-character operators `<>` and `[*]`. Keywords are **not**
   distinguished at this level — they emerge as regular `Identifier`
   tokens and the parser interprets them with case-insensitive lowercase
   comparison (per spec §3.8).

2. **Parser** ([`src/parser.ts`](src/parser.ts), ~1000 LOC) — hand-written
   recursive-descent. Dispatches top-level statements on the leading
   keyword. The trickiest piece is the type-expression parser, which has
   to disambiguate:
     - `array [varchar]` (bare element type)
     - `array [varchar [not null]]` (element type with settings)
     - `array [line_item object {...}]` (named element type — the common
       MongoDB-style "named subdocuments inside arrays" pattern)
     - `array [[0] x object {...}, [1] y object {...}]` (tuple form)

   Polymorphic alternatives (`oneOf { name type }`) have the same shape
   as field declarations (`name type`); context drives the
   disambiguation.

3. **AST** ([`src/ast.ts`](src/ast.ts), ~370 LOC) — TypeScript interfaces
   for every node kind. Setting names are normalized to lowercase
   (`name`) while the source casing is preserved separately (`nameSource`),
   so downstream tooling can both match settings case-insensitively per
   spec and round-trip the original text.

## Coverage and gaps

### What parses correctly

| Feature | Status | Spec |
|---|---|---|
| `xdbml: 0.1` version header | ✓ | §4 |
| `experimental: [...]` opt-in | ✓ | §4.2 |
| `Project` with `targets:` / legacy `database_type:` | ✓ | §5 |
| `Container` (+ synonyms `Schema`, `Database`, `Keyspace`, `Namespace`, `Dataset`, `Bucket`) | ✓ | §6 |
| `Entity` (+ synonyms `Table`, `Collection`, `Record`) | ✓ | §7 |
| Field declarations with type and settings | ✓ | §8 |
| `object { ... }` (+ synonyms `struct`, `record`) | ✓ | §8.3 |
| `array [type]`, `array [name type]`, tuples | ✓ | §8.4-§8.6 |
| `map [k, v]`, `set [t]` | ✓ | §8.7 |
| `union [t1, t2, null]` | ✓ | §19.1 |
| `oneOf`, `anyOf`, `allOf` with `[discriminator: x]` | ✓ | §19.2 |
| `json { ... }`, `jsonb`, `variant` | ✓ | §20 |
| Named `Type` declarations and references | ✓ | §13 |
| BSON scalar types (`objectId`, `Decimal128`, `BinData`, `Date`, etc.) | ✓ | §21 |
| `Edge` declarations with `source`/`target`/cardinality settings and bodies | ✓ | §11 |
| `View` with `source_query`, `materialized`, `refresh_schedule` | ✓ | §12 |
| `Ref` with explicit cardinality `[source: '1..*', target: '1..1']` | ✓ | §10.7 |
| Cross-container refs with `.[*]` array wildcards | ✓ | §10.6 |
| Composite FK refs `a.(x, y) > b.(x, y)` | ✓ | §10.4 |
| `enum` declarations with quoted values | ✓ | §14 |
| `TablePartial` and `~name` injection (in Entity, Edge, Type, JSON bodies) | ✓ | §15.1 |
| `TableGroup` | ✓ | §15.2 |
| Indexes with composite, expression, and nested-path components | ✓ | §9 |
| Notes (inline `Note: '...'`, block `Note { '''...''' }`, top-level `Note name { ... }`) | ✓ | §17 |
| Settings: validation constraints (`pattern`, `minimum`, `maxLength`, `uniqueItems`, ...) | ✓ | §23 |
| Settings: AI-readiness (`synonyms`, `business_term`, `granularity`, `tags`) | ✓ | §22 |
| Settings: custom `x_*` properties | ✓ | §22.5 |
| Referential action values (`cascade`, `set null`, `no action`, `set default`) | ✓ | §10.9 |

### What's deferred (semantic-analysis pass)

The grammar's implementer notes (§Implementation note for parser
writers) explicitly defer several constraints to a post-parse semantic
pass. This proof-of-concept honors that boundary — the parser accepts
syntactically well-formed input and the semantic pass would reject
documents that violate these rules:

| Constraint | Spec |
|---|---|
| Tuple positions must be contiguous starting at 0 | §8.6 |
| Named types cannot shadow built-in type keywords | §13.2 |
| `Ref` paths require explicit `.[*]` when crossing an array | §10.6 |
| Polymorphic paths require explicit alternative selectors | §19.4 |
| Cardinality string content must match `'N..M'` shape | §10.7 |
| Cross-container refs must resolve to declared containers and entities | §6.6 |
| Circular type references must form valid cycles | §13.3 |
| Container's effective target resolution in polyglot projects | §5.2 |
| Target name alias normalization (`Postgres` → `PostgreSQL`) | §5.1 |

These belong in a separate `analyze()` pass that walks the AST,
builds a symbol table, and produces structured diagnostics. The
parser deliberately stays permissive to produce useful partial
results in editor contexts.

### What's not yet implemented

- **`records { ... }` sample data block** — currently parsed
  tolerantly (consumed but contents discarded). The spec §24 vocabulary
  for record values (strings, numbers, ISO dates, enum values,
  backtick-expressions) is straightforward to add.
- **`DiagramView` declarations** — top-level support for §16 is not
  wired in. Adding it is a small parser extension that mirrors
  `TableGroup`.
- **AST flavors (raw vs. normalized)** per §25.3 — the current AST is
  closest to the raw flavor. A normalizer would resolve named types,
  rewrite JSONPath-alias paths to canonical form, and tag entity
  references.
- **Round-trip emitter** — `parse(text)` works; the inverse
  `emit(ast)` is left for follow-up work and would benefit from CST
  retention (trivia, comments).

## DBML compatibility

A document without an `xdbml: 0.1` version header parses as plain DBML.
The parser still accepts all xDBML extension syntax when no header is
present, which is **looser than the spec requires** (§4.1: "no version
declaration → no xDBML extensions recognized"). Strictly enforcing this
would mean gating new constructs on `doc.version !== undefined`. For
the PoC we leave the gate open so the same parser can be used as a
liberal-mode DBML+xDBML hybrid; the semantic pass is the natural place
to enforce the gate when desired.

## Why a hand-written parser instead of generating from the ANTLR4 grammar?

The xDBML spec ships an ANTLR4 grammar at
[`grammar/xDBML.g4`](https://github.com/xdbml/xdbml-spec/blob/main/grammar/xDBML.g4).
For the PoC, a hand-written parser is the faster path because:

1. **Useful errors.** ANTLR's default error reporting is poor in
   editor contexts. Hand-written recursive-descent produces messages
   tied to specific grammar productions ("Expected `}` closing
   Container") rather than token-level surprises.
2. **Span-accurate AST.** The AST nodes we want carry explicit
   `start` / `end` positions including offsets, which an ANTLR-generated
   parser would need a custom visitor layer to produce.
3. **No build-time generator dependency.** A TypeScript
   recursive-descent parser is ~1500 LOC total and ships as plain
   TypeScript; an ANTLR-generated parser pulls in `antlr4ts` runtime
   and a code-generation step.
4. **The grammar is small.** xDBML's grammar is ~800 lines of ANTLR
   with only modest recursive depth; the hand-coded equivalent fits
   easily in one head.

The ANTLR grammar remains the **specification** — this parser is
validated against it conceptually (every parser rule maps to an ANTLR
production) and against the example corpus empirically. A second-pass
implementation could regenerate from ANTLR4 once the grammar
stabilizes, using this parser as a reference for error messages and
AST shape.

## Files

```
xdbml-parse/
├── src/
│   ├── ast.ts         AST node type definitions (~370 LOC)
│   ├── lexer.ts       Tokenizer (~430 LOC)
│   ├── parser.ts      Recursive-descent parser (~1000 LOC)
│   └── index.ts       Public API surface
├── test/
│   ├── examples/      Symlinked from xdbml/xdbml-spec/examples
│   └── run-tests.ts   Test runner: inline grammar tests + example files
├── package.json
├── tsconfig.json
└── README.md
```

## Next steps

A reasonable order of follow-up work:

1. **Semantic-analysis pass.** Implement the deferred constraints
   listed above. Output: `analyze(doc): Diagnostic[]`.
2. **AST normalization.** Implement raw → normalized AST conversion
   (§25.3): JSONPath path alias rewriting, named-type resolution,
   target alias resolution.
3. **`records { }` and `DiagramView`.** Round out the spec coverage.
4. **Forward-engineering generators.** PostgreSQL DDL, MongoDB
   `$jsonSchema`, JSON Schema, Avro — each is a focused walk of the
   normalized AST.
5. **DBML round-trip.** A back-emitter that produces DBML 3.13.6 for
   xDBML documents whose constructs all have DBML equivalents
   (and emits comments for those that don't, per §26.1).
6. **Monaco language services.** A `MonarchTokensProvider` for syntax
   highlighting, plus go-to-definition / completion / hover —
   straightforward once the AST and symbol table are in place. This is
   what would feed `playground.xdbml.org`.

## License

Apache License 2.0, matching DBML and the xDBML spec.
