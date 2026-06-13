---
title: 5-minute introduction
description: A fast-read introduction to xDBML -- one open markup language for relational, document, columnar, graph, and serialization paradigms. Strict superset of DBML 3.13.6, designed for AI-assisted data modeling.
---

# xDBML in 5 minutes

**xDBML** is a text-based markup language for describing the shape of structured data -- relational tables, document collections, event records, JSON columns, graph relationships, views, API contracts. One file, many targets. It is the markup that humans, AI assistants, and data modeling tools all use to describe the same schemas without translation loss.

xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**. The language matches the way modern LLMs already describe schemas: nested structures are first-class, polymorphism uses the same vocabulary as JSON Schema, paths into nested fields use unambiguous dot.notation, and every construct accepts settings that let natural-language queries resolve to canonical schema elements without guesswork.  It combines compactness, simplicity, and structure.  It is text‑only, declarative, and close to “pseudo‑code”.

xDBML is a strict superset of [DBML](https://dbml.dbdiagram.io), extended for the data shapes DBML can't: nested objects, sub-documents, maps, structs, records, arrays, lists, sets, tuples, polymorphism, named reusable types, JSON columns with known schema, target-native vocabulary (MongoDB collections, Avro records, Cassandra keyspaces), property-bearing graph edges, views, AI-readiness metadata, and a structured custom-properties mechanism.

xDBML extends DBML into a unified metadata and semantic data modeling language with richer support for validation, semantics, cardinality, annotations, and AI-friendly metadata, while deliberately staying readable and Git-friendly. It is designed for AI-assisted data modeling and AI-mediated schema interchange.


## The first 60 seconds

Here is a complete xDBML document describing an order system. Read it once, top to bottom:

```xdbml
xdbml: 0.2

Project ecommerce {
  targets: [Oracle, MongoDB]
  Note: 'Customer master data in Oracle; order documents in MongoDB.'
}

Type Address {
  Note: 'Postal address shared between customer profiles and order shipping records'
  street  varchar [not null]
  city    varchar [not null]
  country varchar [default: 'US']
}

Container core [type: schema, target: Oracle] {
  Table customers {
    Note: 'One row per registered customer; lifetime account, never deleted'
    id              int     [pk]
    email           varchar [unique, not null, pattern: '^[^@]+@[^@]+$',
                             tags: ['pii', 'contact', 'gdpr-subject']]
    mrr_amount      decimal(10,2) [synonyms: ['monthly revenue', 'recurring revenue'],
                                   business_term: 'MRR',
                                   note: 'Login identifier; verified during onboarding']
    primary_address Address
  }
}

Container orders_store [type: database, target: MongoDB] {
  Collection orders {
    Note: 'One document per placed order; includes line items and payment shape'
    _id          objectId  [pk]
    customer_id  int32     [not null,
                            note: 'Cross-engine reference to core.customers.id in Oracle']
    placed_at    Date      [granularity: second]
    line_items   array [
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
    } [discriminator: method_kind]
  }
}

Ref: orders_store.orders.customer_id > core.customers.id [source: '1..*', target: '1..1']
```

What you just read:

- **A reusable `Address` type** used by any field needing an address shape
- **Two namespace levels (Containers)**: one for the Oracle schema, one for the MongoDB database
- **A relational `customers` table** with regex validation, GDPR/PII tags, and a field declaring its alternative names for AI consumers
- **A MongoDB `orders` collection** using BSON-native types (`objectId`, `int32`, `string`, `Decimal128`, `Date`), nested arrays of line items, and a polymorphic `payment_method` that's either a card, bank, or wallet
- **A cross-container relationship with explicit cardinality** linking each order's `customer_id` (BSON `int32` in MongoDB) back to the `customers.id` (relational `int` in Oracle)

This single file generates Oracle DDL for `customers`, a MongoDB `$jsonSchema` validator for `orders`, JSON Schema for an API contract, an Avro schema for an event stream, and the schema section of an ODCS data contract.


## Why xDBML was created

xDBML is born to solve the same frustrations DBML was designed for:

- **Difficulty building a "big picture"** of an entire project's database structure
- **Tables and fields whose meaning is opaque** to anyone not on the team
- **ER diagrams and SQL DDL that are hard to read**, poorly written, and usually outdated

And the additional frustrations DBML cannot address:

- **AI-readiness as a language feature.** Synonyms, business terms, classification tags, and granularity hints let LLMs, governance platforms, and downstream tools resolve natural-language queries to canonical schema elements without guesswork.
- **LLM-portable schemas.** Ask any LLM to design a schema in xDBML and the result lowers to whatever target you eventually choose -- no premature commitment to one format, no information loss switching between formats.
- **Nested structures and polymorphism as first-class constructs.** Objects, arrays of records, `oneOf` alternatives with discriminators -- expressed directly without contortions. JSON Schema can express most of these but only for JSON-shaped data; SQL DDL can express tables but not nested types; xDBML expresses all of them, in the same syntax.
- **Schema drift across polyglot stacks.** Hand-maintaining five schemas across Oracle, MongoDB, Avro, BigQuery, and Neo4j is where mistakes live. xDBML is the single source of truth.
- **Property-bearing graph edges.** Labeled property graph databases (Neo4j, Neptune) and RDF-star treat relationships as first-class with their own properties. DBML can't express this; xDBML's `Edge` construct does.


## The polyglot stack problem

Every modern data platform mixes paradigms. A typical SaaS product stores users in Oracle, events in Kafka with Avro schemas, application state in MongoDB, analytics in Databricks, and social graphs in Neo4j. Each technology has its own schema language.

**Hand-maintaining five schemas that describe the same business concepts is where mistakes live.** A field renamed in Oracle doesn't propagate to the MongoDB validator. A new payment method added to the Avro event schema isn't reflected in the BigQuery warehouse table. Drift between schemas is one of the most common sources of production data bugs.

xDBML is the single source of truth that generates all of them.

```
                                ┌─→ Oracle DDL (or PostgreSQL, SQL Server, Databricks, Snowflake,...)
                                ├─→ MongoDB $jsonSchema
xDBML  ──── generators ─────────┼─→ Avro / Parquet
                                ├─→ JSON Schema / OpenAPI
                                ├─→ Neo4j Cypher schema
                                └─→ ODCS schema section
```

But more importantly: **xDBML is the markup that AI assistants and data modeling tools use to describe schemas.** When you ask Claude, ChatGPT, Gemini, Grok, Llama, Mistral AI, or any modern LLM to "design a schema for X," the model produces nested objects, polymorphic types, foreign-key references, and arrays of records. JSON Schema can express most of these but only for JSON-shaped data; SQL DDL can express tables and constraints but not nested types; Avro can express records but not relational schemas. xDBML is the only mainstream markup that expresses *all* of them, in the same syntax, with the AI-readiness metadata (synonyms, business terms, tags, granularity) that lets natural-language queries resolve to canonical schema elements without guesswork.

The same schema you author by hand is the schema your AI assistant can extend, refactor, and round-trip back to you. The same schema you generate from MongoDB can be lifted to Oracle, validated as JSON Schema, or wrapped in an ODCS contract.


## The six things that make xDBML different

### 1. Nested structures are first-class

Most schema languages assume flat tables. xDBML supports unlimited nesting:

```xdbml
Entity customers {
  id int [pk]
  addresses array [
    address object {
      street varchar
      city   varchar
    }
  ]
}
```

This is the natural shape of MongoDB documents, JSON Schema documents, Avro records, BigQuery `STRUCT`s, and Snowflake `OBJECT`s. xDBML lets you describe them directly.

### 2. Polymorphism without contortions

When a value can take one of several shapes, declare it with `oneOf`:

```xdbml
notification oneOf {
  email object { address varchar, subject varchar }
  sms   object { phone varchar, body varchar }
  push  object { device_token varchar, payload object { title varchar, body varchar } }
} [discriminator: channel]
```

For scalar type alternatives:

```xdbml
score union [int, decimal, null]
```

### 3. Target-native vocabulary

Each storage tradition has its own word for the same concepts. xDBML accepts all of them:

```xdbml
Container core [type: schema] { Entity users { ... } }              // Oracle, PostgreSQL
Database orders_store { Collection orders { ... } }                 // MongoDB
Keyspace metrics { Table page_views { ... } }                       // Cassandra
Namespace events { Record OrderPlaced { ... } }                     // Avro
```

BSON types (`string`, `int32`, `int64`, `objectId`, `Decimal128`, `Date`, `BinData`, etc.) are recognized as scalar types and preserved through round-trips to MongoDB.

### 4. Precise cardinality on relationships

DBML's four operators express maximum cardinality. xDBML adds explicit min/max for precision:

```xdbml
// Compact form
Ref: orders.customer_id > customers.id

// Precise form -- each Pet may have no Owner; each Owner may have many Pets
Ref: pets.owner_id > people.id [source: '0..*', target: '0..1']
```

### 5. Property edges for graph models

Labeled Property Graph databases (Neo4j, Neptune) and RDF-star treat relationships as first-class with their own properties. DBML can't express this. xDBML's `Edge` construct does:

```xdbml
Edge KNOWS [source: Person, target: Person,
            source_cardinality: '0..*', target_cardinality: '0..*'] {
  since      date [not null]
  intimacy   int  [minimum: 0, maximum: 10]
}
```

### 6. Views as first-class constructs

xDBML expresses both virtual and materialized views, capturing the output shape declaratively and the source query as opaque metadata:

```xdbml
View top_customers [materialized: true, refresh_schedule: 'daily'] {
  source_query: '''
    SELECT id, name, SUM(total) AS lifetime_value
    FROM customers c JOIN orders o ON o.customer_id = c.id
    GROUP BY id, name
    FETCH FIRST 1000 ROWS ONLY
  '''

  id             int  [pk]
  name           varchar
  lifetime_value decimal(15,2)
}
```

### Plus: AI-readiness and custom metadata at every level

Four first-class settings make schemas legible to LLMs, semantic-layer tools, governance platforms, and data catalogs:

```xdbml
Entity customers {
  mrr_amount decimal [
    synonyms: ['monthly revenue', 'recurring revenue'],
    business_term: 'MRR',
    tags: ['finance', 'kpi', 'sox-controlled'],
    granularity: month
  ]
}
```

And when you need metadata xDBML doesn't promote to first-class, the `x_` prefix convention adds organization-specific extensions without grammar changes:

```xdbml
Entity customers [
  x_governance_owner: 'finance-team@acme.com',
  x_collibra_asset_id: 'urn:collibra:asset:abc-123',
  x_retention_days: 2555
] { ... }
```

These settings round-trip cleanly to Snowflake's Open Semantic Interchange (OSI), Collibra/DataHub/Open Metadata/Purview/Atlan metadata management systems, Avro `aliases`, OpenAPI descriptions, and JSON Schema annotations.

---

## What xDBML does -- and what it deliberately doesn't

xDBML describes the **structural and semantic layer** of data: entities, fields, types, relationships, classifications, validation rules, and AI-readiness metadata. It is the format for **humans and AI to exchange schemas with an xDBML tool**.

![xDBML scope diagram](/diagrams/xdbml-scope.svg)

The tool-to-target round-trip -- the one between a data modeling tool and an actual database -- happens in **native DDL or schema**, not in xDBML. The tool understands each target's complete capability surface (partitioning, sharding, tablespaces, PL/SQL, triggers, advanced constraints, identity columns, replication, refresh schedules) and preserves it in its own canonical model. xDBML carries the parts of that model that have meaning across boundaries: across engines, across tools, across humans and AI.

Trying to import Oracle DDL into xDBML and re-export it as Oracle DDL preserving operational features is a misuse of the standard. The tool-to-target conversation should happen in native DDL throughout. xDBML is for a different conversation entirely.

The following are *not* xDBML's job:

- **Engine operational features.** Partitioning strategies, sharding configuration, tablespaces, storage models, replication topology, materialized view refresh schedules, clustering keys, time-travel configuration. These stay native to each target and live in the data modeling tool's representation.
- **Procedural code.** PL/SQL, T-SQL, stored procedures, triggers, server-side functions, computed columns with engine-specific functions. xDBML expresses declarative shape and metadata, not behavior.
- **Identity and sequencing details.** IDENTITY columns, sequences, auto-increment configuration. xDBML can declare a field as a primary key with auto-generation; the exact sequence configuration is engine-specific.
- **Wire-protocol and evolution rules.** Avro schema evolution rules, Protobuf reserved fields, GraphQL federation directives, OpenAPI endpoints (xDBML describes the *types*, not the *operations*).
- **Query languages.** xDBML doesn't replace or is a functional superset of SQL, Cypher, MQL, or GraphQL queries. The xDBML tool may generate DDL; you still write `SELECT`.
- **Metrics, measures, aggregations.** Those belong in OSI, dbt MetricFlow, or LookML -- the semantic layer above xDBML.
- **Data quality rules, SLAs, ownership, pricing.** Those belong in ODCS (Open Data Contract Standard), which wraps an xDBML schema with contractual metadata.
- **Reasoning and inference.** OWL and knowledge graphs operate at a different layer.
- **Provisioning and operations.** Terraform, database operators, security policies -- these handle the infrastructure layer.

xDBML describes shape and declarative metadata. Adjacent standards handle the layers above and below.

---

## Where to go from here

- **Browse the [FAQ](/faq)** for answers to the questions newcomers most often ask after reading this introduction.
- **Read the [v0.2 specification](/spec/v0.2)** for the full language reference.
- **Browse the [examples](/examples/)** -- real schemas covering e-commerce, healthcare, IoT, financial services, social graphs, and a relational blog.
- **Try it in the <a href="/playground/index.html" target="_blank" rel="noopener">playground</a>** -- type or paste xDBML, see rendered the corresponding Entity-Relationship diagram.
- **Star or contribute on [GitHub](https://github.com/xdbml/xdbml-spec)** -- the spec, the grammar, the reference parser, the importers and exporters, all open source under Apache 2.0.

xDBML is a draft v0.2 standard, stewarded by [Hackolade](https://hackolade.com) pending governance evolution. The grammar is finalized; the ecosystem is being built. Feedback from real-world use is what will shape v1.0.

---

*Last updated May 2026. Apache License 2.0. xdbml.org*
