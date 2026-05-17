# xDBML

**xDBML** (eXtended Database Markup Language) is an **open markup language** for **describing the shape** of structured and semi-structured data, plus the **declarative metadata** attached to that shape **across heterogeneous storage technologies**. 

A single xDBML document expresses entities, fields, nested structures, relationships, polymorphism, named reusable types, classification tags, business-glossary references, validation constraints, synonyms, and the polyglot target-native vocabulary that real enterprise data architectures use. It round-trips cleanly to engine-native DDL (Oracle, PostgreSQL, SQL Server, Databricks, Snowflake, MongoDB, Cassandra, Neo4j, etc.), to serialization schemas (Avro, Parquet), and to API contracts (JSON Schema, OpenAPI, GraphQL). 

xDBML is a strict superset of [DBML 3.13.6](https://dbml.dbdiagram.io),the Database Markup Language maintained by Holistics under Apache 2.0, and **extends DBML** with the constructs it cannot currently express: explicit namespace levels, nested hierarchical types, structural polymorphism, first-class JSON columns with known shape, precise relationship cardinality, property-bearing graph edges, views, AI-readiness metadata, and a structured custom-properties mechanism.



## Designed for AI interactions

xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**. The language matches the way modern LLMs already describe schemas: nested structures are first-class, polymorphism uses the same `oneOf`/`anyOf`/`allOf` vocabulary as JSON Schema, paths into nested fields use unambiguous dotted notation, and every construct accepts `synonyms:`, `business_term:`, `tags:`, and `granularity:` settings that let natural-language queries resolve to canonical schema elements without guesswork. An LLM asked to "find the monthly recurring revenue field" should not have to infer from column naming conventions; xDBML lets the schema declare the synonyms explicitly. The same metadata that helps LLMs also helps humans, governance platforms, data catalogs, and semantic-layer tools — all of them benefit from explicit declarative meaning attached to the schema. Custom properties (via the `x_` prefix convention) let organizations attach domain-specific metadata without grammar changes, and the structured registry path means common patterns can be promoted to first-class status in future minor versions.



## Positioning

xDBML occupies the **schema layer of the modern data stack**. It carries **declarative meaning**: what data is called, what it represents, how it's classified.  But deliberately leaves *computational* meaning (measures, metrics, aggregations) to semantic-layer formats like the Open Semantic Interchange [OSI](https://opensemanticinterchange.org) and dbt MetricFlow, *contractual* obligations (quality rules, SLAs, ownership, pricing) to data-contract formats like [ODCS](https://bitol.io), and *inferential* reasoning to knowledge-graph standards like [OWL](https://www.w3.org/OWL/) and RDF-star. xDBML is the shape-and-declarative-metadata-layer companion to all of these standards, generating the schemas they reference and consuming nothing they own.

The same xDBML document feeds an ODCS contract's schema section, an OSI semantic model's underlying tables, a SHACL validator's target shapes, and the SQL DDL that creates them. 

xDBML is currently a draft v0.1 specification, stewarded by [Hackolade](https://hackolade.com) pending evolution to neutral governance, with the grammar finalized and an open ecosystem of parsers, generators, and importers being built under Apache License 2.0.



## Where to go next

- [`SPEC.md`](https://github.com/xdbml/xdbml-spec/tree/main/spec/v0.1/SPEC.md)  the full v0.1 language specification
- [`5-minutes.md`](./5-minutes.md) a fast-read introduction with worked examples
- [`grammar/`](./grammar/)  the ANTLR4 grammar
- [`examples/`](./examples/)  (TBA) reference xDBML documents covering e-commerce, healthcare, IoT, financial services, event-driven systems, and graph models
- [`integrations/`](./integrations/) (TBA) generators and importers (SQL DDL, JSON Schema, Avro, OpenAPI, MongoDB validators, Neo4j/Cypher, ODCS)
- [xdbml.org](https://xdbml.org)  (TBA) canonical home, playground, and community
