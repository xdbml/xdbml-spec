---
layout: home
title: xDBML
description: A unified, open markup language for describing structured and semi-structured data across relational, document, columnar, graph, and exchange formats. One declarative source, many target-native outputs. Strict superset of DBML 3.13.6, designed for AI-assisted data modeling, AI-mediated schema interchange, and metadata-as-code.
titleTemplate: eXtended Database Markup Language

hero:
  name: xDBML
  text: One schema language. <br>Many target technologies.
  tagline: A unified, open markup language for describing structured and semi-structured data across relational, document, columnar, graph, and exchange formats. <br>One declarative source describes them all. <br>Easy to author and interpret by both humans and AI, designed for the polyglot data stack.
  image:
    src: /logo/xdbml-mark.svg
    alt: xDBML
  actions:
    - theme: brand
      text: Get started in 5 minutes
      link: /learn/
    - theme: alt
      text: Read the spec
      link: /spec/v0.1
    - theme: alt
      text: View on GitHub
      link: https://github.com/xdbml/xdbml-spec

features:
  - icon: 🌐
    title: Polyglot by default
    details: One declarative source describes schemas for Oracle, PostgreSQL, SQL Server, BigQuery, Databricks, Snowflake, MongoDB, Cassandra, Neo4j, Avro, JSON Schema, Parquet, Protobuf, GraphQL, OpenAPI, and many more. <br>Vocabulary matches each target's native terms. <br>Write the schema once; xDBML tools generate target-native artifacts for every engine.

  - icon: 🤖
    title: AI-ready by design
    details: Synonyms, business-term references, granularity hints, classification tags, and a structured custom-properties mechanism. LLMs and humans read the same schema.

  - icon: 🪆
    title: Nested structures, first-class
    details: Objects, arrays of records, maps, sets, heterogeneous tuples, and polymorphism via oneOf/anyOf/allOf -- described directly without contortions.

  - icon: 🔗
    title: Property edges for graph models
    details: First-class Edge construct for labeled property graph databases (Neo4j, Gremlin, Neptune) and RDF-star. Round-trips to junction tables for relational targets.

  - icon: 📐
    title: Precise cardinality
    details: UML-style 'min..max' cardinality strings on relationships. The classic DBML operators remain as shorthand; precision is available when you need it.

  - icon: 📊
    title: Views as first-class constructs
    details: Materialized and virtual views with source queries captured as opaque metadata. <br>Handles native SQL view statements in every supported target.

  - icon: 🧬
    title: Strict superset of DBML
    details: "Every valid DBML 3.13.6 document is a valid xDBML document. Upgrade in place by adding 'xdbml: 0.1' at the top."

  - icon: 🏛️
    title: The schema layer
    details: "xDBML describes what data is -- entities, tables, classes, attributes, fields, columns, relationships, types, classifications. <br>Higher layers build on top: ODCS for contracts, OSI for measures and metrics, JSON Schema for validation, OWL for inference. <br>xDBML generates the schemas they reference."

  - icon: 🆓
    title: Open standard
    details: Apache License 2.0. Stewarded by Hackolade pending evolution to neutral foundation governance. <br>Free to use, extend, and implement.
---

<div class="vp-doc" style="max-width: 960px; margin: 64px auto; padding: 0 24px;">

## A first look

```xdbml
xdbml: 0.1

// Schema spans two storage engines: Oracle for customer master data,
// MongoDB for order documents. xDBML expresses both in one document
// using each engine's native vocabulary and type system.

Project ecommerce {
  database_type: 'Oracle'
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
Container core [type: schema] {
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
Container orders_store [type: database] {
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

A single document declares the schema across two storage engines: an Oracle relational schema for customer master data and a MongoDB database for order documents with nested arrays and polymorphic payment methods. Each container uses its engine's native vocabulary --  `Schema`,`Table`, `int`, and `varchar` on the Oracle side, and `Database`, `Collection`, `objectId`, `int32`, `string`, `Decimal128`, and `Date` on the MongoDB side. Notes at the project, type, container, table, collection, and field levels carry declarative meaning -- what the schema is for, what each entity represents, what each field means — making the document equally legible to humans, AI assistants, and downstream tools. From this one source, xDBML generates Oracle DDL, MongoDB `$jsonSchema` validators, JSON Schema, Avro schemas, and the schema section of an ODCS data contract.

## Why xDBML

DBML's strength is simplicity and developer accessibility -- the reasons it was adopted in the first place. 

xDBML extends DBML into a true metadata and semantic modeling language with richer support for validation, semantics, cardinality, annotations, and AI-friendly metadata, while deliberately staying readable and Git-friendly.

The discipline is to avoid the trap of standards which started with similar ambitions and lost mainstream developer appeal through over-engineering. The risk is to become another ambitious modeling standard that architects admire and developers avoid. xDBML aims to be the foundation for next-generation data modeling and AI-aware metadata -- one that teams actually choose to write by hand, not just generate from heavier sources.

## Where to go next

- **[Read the 5-minute introduction](/learn/)** for a quick tour of what xDBML does and why it exists
- **[Read the v0.1 specification](/spec/v0.1)** for the complete language reference
- **[Browse the examples](/examples/)** for realistic schemas across e-commerce, IoT, healthcare, social graphs, and financial services
- **[See the grammar](/grammar/)** for parser implementers
- **[Read the governance model](/governance)** to understand stewardship and the path to neutral governance
- **[Contribute](/contributing)** by filing an issue, proposing a construct, or building tooling

## Project status

xDBML is currently a draft v0.1 specification stewarded by [Hackolade](https://hackolade.com), with the grammar finalized and an open ecosystem of parsers, generators, and importers being built under Apache License 2.0. The path to neutral foundation governance is described in the [governance model](/governance).

Feedback from real-world use will shape v1.0. [Open an issue](https://github.com/xdbml/xdbml-spec/issues) with comments, proposals, or questions.

</div>
