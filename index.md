---
layout: home
title: xDBML
description: A unified, open markup language to describe the semantics of structured and semi-structured data across relational, document, columnar, graph, and exchange formats. One declarative source, many target-native outputs. Strict superset of DBML 3.13.6, designed for AI-assisted data modeling, AI-mediated schema interchange, and metadata-as-code.
titleTemplate: eXtended Database Markup Language

hero:
  name: xDBML
  text: One schema language. <br>Many target technologies.
  tagline: A unified, open markup language to describe the semantics of structured and semi-structured data across relational, document, columnar, graph, and exchange formats. <br>One declarative source describes them all. <br>Easy to author and interpret by both humans and AI, designed for the polyglot data stack.
  image:
    src: /logo/xdbml-mark.svg
    alt: xDBML
  actions:
    - theme: brand
      text: Get started in 5 minutes
      link: /learn/
    - theme: alt
      text: Try it live in the playground
      link: /playground/index.html?example=02-ecommerce
      target: _blank
      rel: noopener
    - theme: alt
      text: Read the spec
      link: /spec/v0.3
    - theme: alt
      text: View on GitHub
      link: https://github.com/xdbml/xdbml-spec

features:
  - icon: 🌐
    title: Polyglot by default
    details: One declarative source describes schemas for Oracle, PostgreSQL, SQL Server, BigQuery, Databricks, Snowflake, MongoDB, Cassandra, Neo4j, Avro, JSON Schema, Parquet, Protobuf, GraphQL, OpenAPI, and many more. <br>Vocabulary matches each target's native terms. <br>Write the schema once; xDBML tools generate target-native artifacts for every engine.

  - icon: 🤖
    title: AI-ready by design
    details: Synonyms, business-term references, granularity hints, classification tags, and a structured custom-properties mechanism. Designed for AI-assisted data modeling and <br>AI-mediated schema interchange. <br>LLMs and humans read and write the same schema language.

  - icon: 🪆
    title: Nested structures, first-class
    details: Objects, sub-documents, maps, structs, records, arrays, lists, sets, heterogeneous tuples, and polymorphism via union types or oneOf/anyOf/allOf choices described directly without contortions.

  - icon: 🔗
    title: Property edges for graph models
    details: First-class Edge construct for labeled property graph databases (Neo4j, Gremlin, Neptune) and RDF-star. Round-trips to junction tables for relational targets.

  - icon: 📐
    title: Precise cardinality
    details: UML-style 'min..max' cardinality strings on relationships. The classic DBML operators remain as shorthand; precision is available when you need it.

  - icon: 📊
    title: Views as first-class constructs
    details: Materialized and virtual views with source queries captured as metadata. <br>Native handling of SQL view statements in every supported target.

  - icon: 🏛️
    title: The schema layer
    details: "xDBML describes what data is -- entities, tables, classes, attributes, fields, columns, relationships, data types, classifications. <br>Higher layers build on top of xDBML: ODCS for contracts, OSI for measures and metrics, <br>JSON Schema for validation, OWL for inference. <br>xDBML tooling generates the schemas they reference."

  - icon: 🆓
    title: Open standard
    details: "Apache License 2.0, stewarded by Hackolade pending evolution to neutral foundation governance, and free to use, extend, and implement. <br>A strict superset of DBML 3.13.6: every valid DBML document is valid xDBML, and you upgrade in place by adding 'xdbml: 0.3' at the top."

  - icon: 🛠️
    title: Tools and services
    details: "A browser playground, a VS Code extension, the @xdbml/parse and @xdbml/render npm libraries, a hosted render API, and an MCP server that lets AI assistants render and validate xDBML. <br>One parser and one renderer behind all of it."
---

<div class="vp-doc" style="max-width: 960px; margin: 64px auto; padding: 0 24px;">

## A first look

::: tip 🎮 Try it live in the playground
<strong><a href="/playground/index.html?example=02-ecommerce" target="_blank" rel="noopener">Open the playground with a live example →</a></strong> -- it loads a polyglot e-commerce schema you can edit, with the entity-relationship diagram updating as you type. Share your work via URL. Runs entirely in your browser; no install, no signup.
:::

```xdbml
xdbml: 0.3

// Schema spans two storage engines: Oracle for customer master data,
// MongoDB for order documents. xDBML expresses both in one document
// using each engine's native vocabulary and type system.

Project ecommerce {
  targets: [Oracle, MongoDB]
  Note: '''
  Customer-facing e-commerce platform. Customer master data in Oracle for
  transactional consistency and reporting access; order documents in MongoDB
  for flexible nested shape and per-order schema evolution.
  '''
}

Type Address {
  Note: 'Postal address shared between customer profiles and order shipping records'

  street  varchar [not null]
  city    varchar [not null]
  country varchar [default: 'US']
}

// --- Oracle schema for customer master data ---------------------------
Container core [type: schema, target: Oracle] {
  Note: 'System of record for customer identity and contact information'

  Table customers {
    Note: 'One row per registered customer; lifetime account, never deleted'

    id              int     [pk]
    email           varchar [unique, not null,
                             pattern: '^[^@]+@[^@]+$',
                             tags: ['pii', 'gdpr-subject'],
                             note: 'Login identifier; verified during onboarding']
    primary_address Address
  }
}

// --- MongoDB database for order documents (BSON types throughout) -----
Container orders_store [type: database, target: MongoDB] {
  Note: 'Append-only order history; documents immutable after placement'

  Collection orders {
    Note: 'One document per placed order; includes line items and payment shape'

    _id            objectId    [pk]
    customer_id    int32       [not null,
                                note: 'Cross-engine reference to core.customers.id in Oracle']
    placed_at      Date        [granularity: second]
    line_items     array [
      line_item object {
        sku        string     [not null]
        quantity   int32      [not null, minimum: 1]
        unit_price Decimal128
      }
    ]
    payment_method oneOf {
      card   object { last4 string [maxLength: 4], brand string }
      bank   object { iban string }
      wallet object { provider string }
    } [discriminator: method_kind,
       note: 'Polymorphic payment shape; the method_kind field carries the variant tag']
  }
}

Ref: orders_store.orders.customer_id > core.customers.id [source: '1..*', target: '1..1']
```

A single document declares the schema across two storage engines: an Oracle relational schema for customer master data and a MongoDB database for order documents with nested arrays and polymorphic payment methods. Each container uses its engine's native vocabulary --  `Schema`,`Table`, `int`, and `varchar` on the Oracle side, and `Database`, `Collection`, `objectId`, `int32`, `string`, `Decimal128`, and `Date` on the MongoDB side. Notes at the project, type, container, table, collection, and field levels carry declarative meaning -- what the schema is for, what each entity represents, what each field means -- making the document equally legible to humans, AI assistants, and downstream tools. From this one source, xDBML generates Oracle DDL, MongoDB `$jsonSchema` validators, JSON Schema, Avro schemas, and the schema section of an ODCS data contract.

## Why xDBML

DBML's strength is simplicity and developer accessibility -- the reasons it was adopted in the first place. 

xDBML extends DBML into a true metadata and semantic data modeling language with richer support for validation, semantics, cardinality, annotations, and AI-friendly metadata, while deliberately staying readable and Git-friendly.

Enterprise data structures and semantics are trapped in technology-specific formats that GenAI can parse but cannot reliably compare, govern, transform, or reason over across platforms. xDBML provides a compact, open, polyglot, AI-readable schema language that captures the portable meaning of data structures without pretending to replace native implementation formats.

xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**. The language matches the way modern LLMs already describe schemas: nested structures are first-class, polymorphism uses the same vocabulary as JSON Schema, paths into nested fields use unambiguous dot.notation, and every construct accepts settings that let natural-language queries resolve to canonical schema elements without guesswork. It combines compactness, simplicity, and structure. It is text‑only, declarative, and close to “pseudo‑code”.

The discipline is to avoid the trap of standards which started with similar ambitions and lost mainstream developer appeal through over-engineering. The risk is to become another ambitious data modeling standard that architects admire and developers avoid. xDBML aims to be the foundation for next-generation data modeling and AI-aware metadata -- one that teams actually choose to write by hand, not just generate from heavier sources.

xDBML is born to solve the same frustrations DBML was designed for -- difficulty building a mental big picture, opaque field meanings, ER diagrams and DDL that are hard to read and usually outdated -- and the additional pains DBML cannot solve: AI-readiness metadata for LLMs and governance platforms, LLM-portable schemas without target lock-in, nested structures and polymorphism as first-class constructs, schema drift across polyglot stacks, and property-bearing graph edges. See the [FAQ](/faq) for the full positioning.

## Scope: what xDBML covers (and what it deliberately doesn't)

xDBML describes the **structural and semantic layer** of data: entities, fields, types, relationships, classifications, validation rules, and AI-readiness metadata. It is the format for **humans and AI to exchange schemas with an xDBML tool**.

![xDBML scope diagram](/diagrams/xdbml-scope.svg)

xDBML is **not** the round-trip format between a data modeling tool and a target technology. That tool-to-target round-trip happens in **native DDL or schema** -- the tool understands the target's complete capability surface (partitioning, sharding, tablespaces, replication, PL/SQL, triggers, identity columns, advanced constraints, refresh schedules) and preserves it in the tool's own canonical model. xDBML carries the parts of that model with meaning across boundaries.

Operational features (partitions, storage configuration, replication), procedural code (PL/SQL, T-SQL, triggers, server-side functions), wire-protocol concerns (Avro evolution rules, Protobuf reserved fields, GraphQL federation directives), and query languages of any kind stay where they live. Adjacent standards layer above and below: ODCS for contracts, OSI and dbt MetricFlow for measures, OWL for inference, OpenLineage for lineage, and Google's Open Knowledge Format (OKF) for the curated, agent-facing knowledge context that an xDBML schema can populate. Diagramming languages such as Mermaid ER render a picture of a schema; xDBML is the schema that picture is generated from.

xDBML is a format, not a data modeling tool. The <a href="/playground/index.html" target="_blank" rel="noopener">playground at xdbml.org</a> demonstrates the language and works well for learning, prototyping, and small schemas, but sustained enterprise data modeling -- live-database reverse-engineering, target-native DDL generation across many engines, schema diffing and impact analysis, lineage and governance integration, and multi-user collaboration -- requires a purpose-built data modeling tool like ER/Studio, Erwin Data Modeler, or Hackolade. xDBML is designed as the textual exchange format and AI interaction surface that those tools can read, write, and round-trip with: complementing them, not replacing them.

## Tools and services

xDBML is a format, not a tool, but a small open ecosystem makes it easy to author, render, and validate schemas wherever you work. One parser and one renderer back all of it, so a schema behaves the same in the browser, in your editor, in your own code, and inside an AI assistant, and everything is open source under Apache 2.0. The <a href="/playground/index.html" target="_blank" rel="noopener">playground</a> renders the diagram as you type and shares it by URL with no install, while the [xDBML VS Code extension](https://marketplace.visualstudio.com/items?itemName=xdbml.xdbml) brings syntax highlighting and a one-click Open in Playground command into your editor. For your own code, the [`@xdbml/parse`](https://www.npmjs.com/package/@xdbml/parse) and [`@xdbml/render`](https://www.npmjs.com/package/@xdbml/render) libraries on npm provide the parser and a framework-free SVG renderer, and a hosted render API turns a schema into an SVG or PNG over a single HTTP request, handy for documentation and build pipelines. To put xDBML inside an AI assistant, a remote Model Context Protocol (MCP) server exposes rendering and validation as native tools: in Claude, add `https://xdbml-mcp.xdbml.workers.dev/mcp` as a custom connector, and the assistant can write a schema, validate it, render it, and hand back a playground link in a single turn.

## Where to go next

- **[Read the 5-minute introduction](/learn/)** for a quick tour of what xDBML does and why it exists
- **[Browse the FAQ](/faq)** for answers to the questions newcomers most often ask
- **[Read the v0.3 specification](/spec/v0.3)** for the complete language reference
- **[Browse the examples](/examples/)** for realistic schemas across e-commerce, IoT, healthcare, social graphs, and financial services
- <a href="/playground/index.html?example=02-ecommerce" target="_blank" rel="noopener"><strong>Try it in the playground</strong></a> -- it opens with a live example you can edit, and renders the corresponding Entity-Relationship diagram as you type
- **[Review the ANTLR4 grammar](/grammar)** and [**parser**](https://github.com/xdbml/xdbml-spec/tree/main/parser)
- **[Install the VS Code extension](https://marketplace.visualstudio.com/items?itemName=xdbml.xdbml)**, or build on the [`@xdbml/parse`](https://www.npmjs.com/package/@xdbml/parse) and [`@xdbml/render`](https://www.npmjs.com/package/@xdbml/render) libraries, the [hosted render API](https://github.com/xdbml/xdbml-spec/tree/main/api), and the [MCP server](https://github.com/xdbml/xdbml-spec/tree/main/mcp) for AI assistants
- **[Read the governance model](/governance)** to understand stewardship and the path to neutral governance
- **[Contribute](/contributing)** by filing an issue, proposing a construct, or building tooling

## Project status

xDBML is currently a draft v0.3 specification stewarded by [Hackolade](https://hackolade.com), with the grammar finalized and an open ecosystem of parsers, generators, and importers being built under Apache License 2.0. The path to neutral foundation governance is described in the [governance model](/governance).

Feedback from real-world use will shape v1.0. [Open an issue](https://github.com/xdbml/xdbml-spec/issues) with comments, proposals, or questions.

</div>
