---
title: 5-minute introduction
description: A fast-read introduction to xDBML -- one open markup language for relational, document, columnar, graph, and serialization paradigms. Strict superset of DBML 3.13.6, designed for AI-assisted data modeling.
---

# xDBML in 5 minutes

**xDBML** is a text-based markup language for describing the shape of structured data -- relational tables, document collections, event records, JSON columns, graph relationships, views, API contracts. One file, many targets. It is the markup that humans, AI assistants, and data modeling tools all use to describe the same schemas without translation loss.

xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**. The language matches the way modern LLMs already describe schemas: nested structures are first-class, polymorphism uses the same vocabulary as JSON Schema, paths into nested fields use unambiguous dot.notation, and every construct accepts settings that let natural-language queries resolve to canonical schema elements without guesswork.  It combines compactness, simplicity, and structure.  It is text‑only, declarative, and close to “pseudo‑code”.

xDBML is a strict superset of [DBML](https://dbml.dbdiagram.io), extended for the data shapes DBML can't: nested objects, sub-documents, maps, structs, records, arrays, lists, sets, tuples, polymorphism, named reusable types, JSON columns with known schema, target-native vocabulary (MongoDB collections, Avro records, Cassandra keyspaces), property-bearing graph edges, views, AI-readiness metadata, and a structured custom-properties mechanism.

xDBML extends DBML into a unified metadata and semantic modeling language with richer support for validation, semantics, cardinality, annotations, and AI-friendly metadata, while deliberately staying readable and Git-friendly. It is designed for AI-assisted data modeling and AI-mediated schema interchange.


## The first 60 seconds

Here is a complete xDBML document describing an order system. Read it once, top to bottom:

```
xdbml: 0.1

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


## Why this exists

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

But more importantly: **xDBML is the markup that AI assistants and modeling tools use to describe schemas.** When you ask Claude, ChatGPT, Gemini, Grok, Llama, Mistral AI, or any modern LLM to "design a schema for X," the model produces nested objects, polymorphic types, foreign-key references, and arrays of records. JSON Schema can express most of these but only for JSON-shaped data; SQL DDL can express tables and constraints but not nested types; Avro can express records but not relational schemas. xDBML is the only mainstream markup that expresses *all* of them, in the same syntax, with the AI-readiness metadata (synonyms, business terms, tags, granularity) that lets natural-language queries resolve to canonical schema elements without guesswork.

The same schema you author by hand is the schema your AI assistant can extend, refactor, and round-trip back to you. The same schema you generate from MongoDB can be lifted to Oracle, validated as JSON Schema, or wrapped in an ODCS contract.


## The six things that make xDBML different

### 1. Nested structures are first-class

Most schema languages assume flat tables. xDBML supports unlimited nesting:

```
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

```
notification oneOf {
  email object { address varchar, subject varchar }
  sms   object { phone varchar, body varchar }
  push  object { device_token varchar, payload object { title varchar, body varchar } }
} [discriminator: channel]
```

For scalar type alternatives:

```
score union [int, decimal, null]
```

### 3. Target-native vocabulary

Each storage tradition has its own word for the same concepts. xDBML accepts all of them:

```
Container core [type: schema] { Entity users { ... } }              // Oracle, PostgreSQL
Database orders_store { Collection orders { ... } }                 // MongoDB
Keyspace metrics { Table page_views { ... } }                       // Cassandra
Namespace events { Record OrderPlaced { ... } }                     // Avro
```

BSON types (`string`, `int32`, `int64`, `objectId`, `Decimal128`, `Date`, `BinData`, etc.) are recognized as scalar types and preserved through round-trips to MongoDB.

### 4. Precise cardinality on relationships

DBML's four operators express maximum cardinality. xDBML adds explicit min/max for precision:

```
// Compact form
Ref: orders.customer_id > customers.id

// Precise form -- each Pet may have no Owner; each Owner may have many Pets
Ref: pets.owner_id > people.id [source: '0..*', target: '0..1']
```

### 5. Property edges for graph models

Labeled Property Graph databases (Neo4j, Neptune) and RDF-star treat relationships as first-class with their own properties. DBML can't express this. xDBML's `Edge` construct does:

```
Edge KNOWS [source: Person, target: Person,
            source_cardinality: '0..*', target_cardinality: '0..*'] {
  since      date [not null]
  intimacy   int  [minimum: 0, maximum: 10]
}
```

### 6. Views as first-class constructs

xDBML expresses both virtual and materialized views, capturing the output shape declaratively and the source query as opaque metadata:

```
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

```
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

```
Entity customers [
  x_governance_owner: 'finance-team@acme.com',
  x_collibra_asset_id: 'urn:collibra:asset:abc-123',
  x_retention_days: 2555
] { ... }
```

These settings round-trip cleanly to Snowflake's Open Semantic Interchange (OSI), Collibra/DataHub/Open Metadata/Purview/Atlan metadata management systems, Avro `aliases`, OpenAPI descriptions, and JSON Schema annotations.

---

## What you don't have to learn

xDBML is deliberately narrow. The following are *not* xDBML's job:

- **Query languages.** xDBML doesn't replace SQL. It generates DDL; you still write `SELECT`.
- **Metrics, measures, aggregations.** Those belong in OSI, dbt MetricFlow, or LookML -- the semantic layer above xDBML.
- **Data quality rules, SLAs, ownership, pricing.** Those belong in ODCS (Open Data Contract Standard), which wraps an xDBML schema with contractual metadata.
- **Reasoning and inference.** OWL and knowledge graphs operate at a different layer.

xDBML describes shape and declarative metadata. Adjacent standards handle the layers above and below.

---

## Where to go from here

- **Read the [v0.1 specification](/spec/v0.1)** for the full language reference.
- **Browse the [examples](/examples/)** -- real schemas covering e-commerce, healthcare, IoT, financial services, social graphs, and a relational blog.
- **Try it in the playground** (planned): type or paste xDBML, see rendered diagrams and generated artifacts.
- **Read the [ODCS integration guide](/integrations/odcs)** if you're already using Open Data Contract Standard.
- **Star or contribute on [GitHub](https://github.com/xdbml/xdbml-spec)** -- the spec, the grammar, the reference parser, the importers and exporters, all open source under Apache 2.0.

xDBML is a draft v0.1 standard, stewarded by [Hackolade](https://hackolade.com) pending governance evolution. The grammar is finalized; the ecosystem is being built. Feedback from real-world use is what will shape v1.0.

---

*Last updated 2026. Apache License 2.0. xdbml.org*
