![xdbml-logo](public/logo/xdbml-logo.svg)

# xDBML

**[xDBML](https://xdbml.org/)** (eXtended Database Markup Language) is a **unified, open markup language** to **describe the shape** of structured and semi-structured data, plus the **declarative metadata** attached to that shape **across heterogeneous storage technologies**.

> [!TIP]
> **🎮 Try xDBML live in the playground at [xdbml.org/playground](https://xdbml.org/playground/index.html?example=02-ecommerce)** -- write or paste a schema, see the entity-relationship diagram update as you type, share your work via URL. Runs entirely in your browser; no install, no signup.

A single xDBML document expresses entities, tables, attributes, columns, fields, data types, nested structures, relationships, polymorphism, named reusable types, classification tags, business-glossary references, validation constraints, synonyms, and the polyglot target-native vocabulary that real enterprise data architectures use. It round-trips cleanly to engine-native DDL (Oracle, PostgreSQL, SQL Server, Databricks, Snowflake, MongoDB, Cassandra, Neo4j, etc.), to serialization schemas (Avro, Parquet), and to API contracts (JSON Schema, OpenAPI, GraphQL).

xDBML is a strict superset of [DBML 3.13.6](https://dbml.dbdiagram.io), the Database Markup Language maintained by Holistics under Apache 2.0, and **extends DBML** with the constructs it cannot currently express: explicit namespace levels, nested hierarchical types, structural polymorphism, first-class JSON columns with known shape, precise relationship cardinality, property-bearing graph edges, views, AI-readiness metadata, and a structured custom-properties mechanism.

## Designed for AI interactions

xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**. The language matches the way modern LLMs already describe schemas: nested structures are first-class, polymorphism uses the same `oneOf`/`anyOf`/`allOf` vocabulary as JSON Schema, paths into nested fields use unambiguous dotted notation, and every construct accepts `synonyms:`, `business_term:`, `tags:`, and `granularity:` settings that let natural-language queries resolve to canonical schema elements without guesswork. An LLM asked to "find the monthly recurring revenue field" should not have to infer from column naming conventions; xDBML lets the schema declare the semantics and synonyms explicitly.

The same metadata that helps LLMs also helps humans, governance platforms, data catalogs, and semantic-layer tools -- all of them benefit from explicit declarative meaning attached to the schema. Custom properties (via the `x_` prefix convention) let organizations attach domain-specific metadata without grammar changes, and the structured registry path means common patterns can be promoted to first-class status in future minor versions.

## Positioning

Enterprise data structures and semantics are trapped in technology-specific formats that GenAI can parse but cannot reliably compare, govern, transform, or reason over across platforms. xDBML provides a compact, open, polyglot, AI-readable schema language that captures the portable meaning of data structures without pretending to replace native implementation formats.

xDBML occupies the **schema layer of the modern data stack**. It carries **declarative meaning**: what data is called, what it represents, how it's classified. But deliberately leaves *curated markdown wiki of concepts* to Google's Open Knowledge Format ([OKF](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)), *computational* meaning (measures, metrics, aggregations) to semantic-layer formats like the Open Semantic Interchange [OSI](https://opensemanticinterchange.org) and dbt MetricFlow, *contractual* obligations (quality rules, SLAs, ownership, pricing) to data-contract formats like [ODCS](https://bitol.io), and *inferential* reasoning to knowledge-graph standards like [OWL](https://www.w3.org/OWL/) and RDF-star. xDBML is the shape-and-declarative-metadata-layer companion to all of these standards, generating the schemas they reference and consuming nothing they own.

The same xDBML document feeds an ODCS contract's schema section, an OSI semantic model's underlying tables, a SHACL validator's target shapes, and the SQL DDL that creates them.

xDBML is currently a draft v0.3 specification, stewarded by [Hackolade](https://hackolade.com) pending evolution to neutral governance, with the grammar finalized and an open ecosystem of parsers, generators, and importers being built under Apache License 2.0.

## Design philosophy

xDBML is the evolution of DBML from a lightweight schema-diagram language into a true metadata and semantic data modeling language. Where DBML excels at simplicity and developer accessibility -- strengths that drove its adoption -- xDBML targets the additional needs of metadata-as-code, semantic grounding for AI, governance integration, and model-driven engineering, with richer support for validation rules, semantics, cardinality, annotations, and AI-friendly metadata.

The hardest design constraint on xDBML is not what to add, but what to leave out. Other standards started with similar ambitions and lost mainstream developer appeal through over-engineering -- piling up features until the cost of authoring exceeded the benefit.  The risk is to become another ambitious data modeling standard that architects admire and developers avoid. 

xDBML aims to preserve DBML's readability and Git-friendly simplicity while adding the constructs the polyglot, AI-aware era requires. Every proposed extension is weighed against that constraint; constructs that would push xDBML toward XML-Schema complexity are deferred, simplified, or declined.

If xDBML succeeds at this balance, it can become a foundation for next-generation data modeling and AI-aware metadata systems -- one that real teams actually choose to write by hand, not just generate from heavier sources.

## Same frustrations as DBML -- plus the ones DBML cannot solve

xDBML is born to solve the same frustrations DBML was designed for:
- Difficulty building a mental "big picture" of an entire project's database structure
- Trouble understanding tables and what their fields mean
- ER diagrams and SQL DDL that are poorly written, hard to read, and usually outdated

Plus the additional pains DBML cannot solve: AI-readiness metadata for LLMs and governance platforms (synonyms, business terms, classifications, granularity), LLM-portable schemas that lower to any target without premature commitment, nested structures and polymorphism as first-class constructs (objects, arrays of records, oneOf alternatives with discriminators), schema drift across polyglot stacks (Oracle + MongoDB + Avro + BigQuery + Neo4j + ...), and property-bearing graph edges. See the [FAQ on xdbml.org](https://xdbml.org/faq) for the full positioning.

## Scope: what xDBML covers (and what it deliberately doesn't)

xDBML describes the **structural and semantic layer** of data: entities, fields, types, relationships, classifications, validation rules, and AI-readiness metadata. It is the format for **humans and AI to exchange schemas with an xDBML tool**.

![xDBML scope diagram](public/diagrams/xdbml-scope.svg)

xDBML is **not** the round-trip format between an xDBML tool or xDBML-compatible data modeling tool and a target technology. That tool-to-target round-trip happens in **native DDL or schema** -- the tool understands the target's complete capability surface (partitioning, sharding, tablespaces, replication, PL/SQL, triggers, identity columns, advanced constraints, refresh schedules) and preserves it in the tool's own canonical model. xDBML carries the parts of that model with meaning across boundaries.

Operational features, procedural code (PL/SQL, T-SQL, triggers, server-side functions), wire-protocol concerns (Avro evolution rules, Protobuf reserved fields, GraphQL federation directives), and query languages of any kind stay where they live. Adjacent standards layer above and below: ODCS for contracts, OSI and dbt MetricFlow for measures, OWL for inference, OpenLineage for lineage, and Google's Open Knowledge Format (OKF) for the curated, agent-facing knowledge context that an xDBML schema can populate. Diagramming languages such as Mermaid ER render a picture of a schema; xDBML is the schema that picture is generated from.

xDBML is a format, not a data modeling tool. The [playground at xdbml.org](https://xdbml.org/playground/index.html) demonstrates the language and works well for learning, prototyping, and small schemas, but sustained enterprise data modeling -- live-database reverse-engineering, target-native DDL generation across many engines, schema diffing and impact analysis, lineage and governance integration, and multi-user collaboration -- requires a purpose-built data modeling tool like ER/Studio, Erwin Data Modeler, or Hackolade. xDBML is designed as the textual exchange format and AI interaction surface that those tools can read, write, and round-trip with: complementing them, not replacing them.

## Tools and services

xDBML is a format, not a tool, but a small open ecosystem makes it easy to author, render, validate, and work with schemas wherever you are. One parser and one renderer power all of it, so a schema behaves identically in the browser, in your editor, in your own code, in a build pipeline, and inside an AI assistant. Everything here is Apache License 2.0.

**Playground.** [xdbml.org/playground](https://xdbml.org/playground/) renders the diagram as you type and shares your work via URL. Entirely in-browser, no install, no signup.

**VS Code extension.** The [xDBML extension for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=xdbml.xdbml) adds syntax highlighting for `.xdbml` files and an Open in Playground command, so you can author schemas in your editor and jump straight to the live diagram with one click, no copy and paste.

**Libraries (npm).** [`@xdbml/parse`](https://www.npmjs.com/package/@xdbml/parse) is the parser (tokenizer, parser, module resolver, and name resolver); [`@xdbml/render`](https://www.npmjs.com/package/@xdbml/render) is a framework-free renderer that turns a schema into an entity-relationship SVG. Both run anywhere JavaScript runs, so you can embed rendering or validation in your own code.

**Hosted render API.** A small HTTP service turns xDBML into an SVG (or PNG) over the wire, for documentation, build pipelines, or any tool that can make a request:

```
GET  https://xdbml-render-api.xdbml.workers.dev/render?src=<url-encoded xDBML>
POST https://xdbml-render-api.xdbml.workers.dev/render   (xDBML in the request body)
```

Options control layout (`arrange=relational|star|none`), background color, and whether the SVG embeds an "Open in xDBML playground" link. See [`api/`](./api) for the full reference.

**MCP server.** A remote [Model Context Protocol](https://modelcontextprotocol.io) server lets an AI assistant work with xDBML natively as tool calls. In Claude, add the URL as a custom connector (Settings, Connectors, Add custom connector):

```
https://xdbml-mcp.xdbml.workers.dev/mcp
```

It exposes two tools: `render_xdbml` (renders a schema to SVG, plus a PNG the model can actually see, and returns a playground link) and `validate_xdbml` (checks syntax and resolves references, reporting any problems with line/column locations, without rendering). Together they support a generate, validate, render loop: the assistant drafts a schema, validates it, fixes what it flags, and renders the result in one turn. See [`mcp/`](./mcp) for details.

## Where to go next

- [xdbml.org](https://xdbml.org) -- canonical home, with the playground 
- [`xDBML_in_5_minutes.md`](./xDBML_in_5_minutes.md) -- a fast-read introduction with worked examples
- [`faq.md`](./faq.md) -- frequently asked questions about scope, language design, and adoption
- [`spec/v0.3.md`](./spec/v0.3.md) -- the current v0.3 language specification (adds remote module sources over HTTPS)
- [`spec/v0.2.md`](./spec/v0.2.md) -- the previous v0.2 specification, still supported (module system, scalar Named Types, field-level imports)
- [`spec/v0.1.md`](./spec/v0.1.md) -- the original v0.1 specification, still supported
- [`examples/`](./examples) -- reference xDBML documents covering a blog, e-commerce, IoT telemetry, social graphs, healthcare, and financial services
- [`playground/`](https://xdbml.org/playground/index.html) -- try it in the playground by typing or pasting xDBML, and see rendered the corresponding Entity-Relationship diagram
- [`grammar/`](./grammar) -- the ANTLR4 grammar and reference test corpus and [parser/](./parser)
- [`tools/vscode-extension/`](./tools/vscode-extension) -- the VS Code extension (syntax highlighting + Open in Playground)
- [`api/`](./api) -- the hosted HTTP render service (xDBML to SVG/PNG over a request)
- [`mcp/`](./mcp) -- the remote MCP server exposing `render_xdbml` and `validate_xdbml` to AI assistants
