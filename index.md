---
layout: home
title: xDBML
description: An open markup language for describing the shape of structured data across relational, document, columnar, graph, and serialization paradigms. Strict superset of DBML 3.13.6, designed for AI-assisted data modeling, AI-mediated schema interchange, and metadata-as-code.
titleTemplate: eXtended Database Markup Language

hero:
  name: xDBML
  text: One schema. Many storage technologies.
  tagline: An open markup language for describing structured data across relational, document, columnar, graph, and serialization paradigms. Human-authorable, <br>AI-readable, designed for the polyglot data stack.
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
    details: One language for Oracle, PostgreSQL, MongoDB, Cassandra, BigQuery, Snowflake, Neo4j, Avro, Parquet, JSON Schema, and OpenAPI. Vocabulary matches each target's native terms.

  - icon: 🤖
    title: AI-ready by design
    details: Synonyms, business-term references, granularity hints, classification tags, and a structured custom-properties mechanism. LLMs and humans read the same schema.

  - icon: 🪆
    title: Nested structures, first-class
    details: Objects, arrays of records, maps, sets, heterogeneous tuples, and polymorphism via oneOf/anyOf/allOf — described directly without contortions.

  - icon: 🔗
    title: Property edges for graph models
    details: First-class Edge construct for labeled property graph databases (Neo4j, Memgraph, Neptune) and RDF-star. Round-trips to junction tables for relational targets.

  - icon: 📐
    title: Precise cardinality
    details: UML-style 'min..max' cardinality strings on relationships. The classic DBML operators remain as shorthand; precision is available when you need it.

  - icon: 📊
    title: Views as first-class constructs
    details: Materialized and virtual views with source queries captured as opaque metadata. Forward-engineers to native VIEW statements in every supported target.

  - icon: 🧬
    title: Strict superset of DBML
    details: "Every valid DBML 3.13.6 document is a valid xDBML document. Upgrade in place by adding 'xdbml: 0.1' at the top."

  - icon: 🏛️
    title: Layered, not competitive
    details: The schema-layer companion to ODCS (contracts), OSI (semantics), JSON Schema (validation), and OWL (reasoning). Each layer does one thing well.

  - icon: 🆓
    title: Open standard
    details: Apache License 2.0. Stewarded by Hackolade pending evolution to neutral foundation governance. Free to use, extend, and implement.
---

<div class="vp-doc" style="max-width: 960px; margin: 64px auto; padding: 0 24px;">

## A first look

```xdbml
xdbml: 0.1

Type Address {
  street  varchar [not null]
  city    varchar [not null]
  country varchar [default: 'US']
}

Container core [type: schema] {
  Entity customers {
    id              int     [pk]
    email           varchar [unique, not null,
                             pattern: '^[^@]+@[^@]+$',
                             tags: ['pii', 'gdpr-subject']]
    primary_address Address
  }
}

Container orders_store [type: database] {
  Collection orders {
    _id          objectId  [pk]
    customer_id  int       [not null]
    placed_at    timestamp [granularity: second]
    line_items   array [
      line_item object {
        sku        varchar [not null]
        quantity   int     [not null, minimum: 1]
        unit_price decimal(10,2)
      }
    ]
    payment_method oneOf {
      card   object { last4 varchar(4), brand varchar }
      bank   object { iban varchar }
      wallet object { provider varchar }
    } [discriminator: method_kind]
  }
}

Ref: orders_store.orders.customer_id        > core.customers.id [source: '1..*', target: '1..1']
Ref: orders_store.orders.line_items.[*].sku > catalog.products.sku
```

This single document expresses a relational customer schema in Oracle, a MongoDB collection with nested arrays and polymorphic payment methods, a reusable address type, and cross-container relationships including one that traverses an array. It generates Oracle DDL, MongoDB `$jsonSchema` validators, JSON Schema, Avro schemas, and the schema section of an ODCS data contract.

## Why xDBML

DBML's strength is simplicity and developer accessibility — the reasons it was adopted in the first place. xDBML extends DBML into a true metadata and semantic modeling language with richer support for validation, semantics, cardinality, annotations, and AI-friendly metadata, while deliberately staying readable and Git-friendly.

The discipline is to avoid the trap of standards like UML and XML Schema, which started with similar ambitions and lost mainstream developer appeal through over-engineering. xDBML aims to be the foundation for next-generation data modeling and AI-aware metadata — one that teams actually choose to write by hand, not just generate from heavier sources.

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
