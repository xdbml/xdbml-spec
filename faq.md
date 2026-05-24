---
title: Frequently asked questions
description: Common questions about xDBML scope, language design, ecosystem, and adoption.
---

# Frequently asked questions

This page collects questions that come up repeatedly. New entries are added as the same questions emerge from real conversations. Open an [issue](https://github.com/xdbml/xdbml-spec/issues) if your question is not answered here.



## Can I round-trip Oracle (or other RDBMS) DDL through xDBML and back without losing anything?

No, and this is by design. xDBML is not the round-trip format between an xDBML tool or xDBML-compatible data modeling tools and a target technology instance. That tool-to-target round-trip happens in **native DDL or schema** -- the tool understands Oracle's complete capability surface (partitioning, tablespaces, PL/SQL, triggers, identity columns, advanced constraints, materialized view refresh schedules, sequences) and preserves it in the tool's own canonical model.

xDBML carries the parts of that model with meaning across boundaries: structural shape, types, relationships, declarative constraints, classifications, and AI-readiness metadata. Operational and procedural features stay native.

The diagram in the [scope section of the specification](/spec/v0.1#_1-1-scope) shows the two distinct flows: xDBML between humans/AI and the tool on one side, native DDL or schema between the tool and the target instance on the other.

What this means in practice:

- An xDBML schema lifted from Oracle DDL preserves tables, columns, types, declarative constraints, relationships, and indexes in declarative form.
- It does not preserve partitions, storage configuration, triggers, PL/SQL, sequence definitions, or advanced constraint syntax.
- The original Oracle DDL is what you keep for those features -- xDBML is for a different conversation entirely (cross-engine reuse, AI assistance, governance integration, data contract generation).



## Why doesn't xDBML support partitions, storage configuration, or triggers?

These are target-specific operational features. xDBML's job is to describe the declarative shape and meaning of data across all storage technologies -- the parts that make sense in conversations between humans, AI assistants, and tools that span multiple engines. Operational features only make sense in the context of one specific target, and the modeling tool's native representation is where they belong.

A schema with Oracle-specific partition strategy is not portable to MongoDB or Avro by definition. xDBML expresses what IS portable -- the shape, the types, the relationships, the semantics -- so that one declarative source can describe schemas across an Oracle relational system, a MongoDB document store, an Avro event stream, and a JSON Schema API contract simultaneously.

If you need to capture partition strategy, sharding configuration, or any other operational feature, that lives in the modeling tool's native format alongside the xDBML projection. The tool generates the target-native DDL with all operational features intact; xDBML is the export channel for the parts that matter across boundaries.



## Does that make xDBML a logical data model?

No -- and the question has the wrong shape. xDBML is not bound to any single layer of the conceptual/logical/physical taxonomy. It is an exchange format -- a portable representation of the parts of a schema that have structure and meaning across boundaries (humans, AI, tools, engines, data modeling conceptual-logical-physical layers).

The same language constructs serve all three layers, depending on what the author includes or omits:

- A **conceptual** xDBML document lists entities and relationships with descriptive notes and semantic metadata (synonyms, business terms, classifications), without committing to types or implementation details. Useful for asking an AI assistant to draft the entity landscape for a new domain.

- A **logical** xDBML document adds engine-neutral typing, cardinality, declarative constraints, and normalized structure -- still without commitment to a specific target technology. Useful for asking an AI assistant to refine a conceptual draft into a deployable shape, or for cross-team schema design conversations before the engine choice is made.

- A **physical** xDBML document adds explicit `targets:` and per-Container `target:` declarations, engine-specific scalar types (`varchar`, `objectId`, `Decimal128`, `int32`), and engine-native container kinds (`schema`, `database`, `keyspace`, `namespace`). Useful for AI-assisted modeling against one or more concrete engines, or for handing a tool the structural-and-semantic content it needs to forward-engineer.

What xDBML deliberately is NOT is the persistent model artifact that a data modeling tool maintains internally. Those tool-native artifacts carry versioning, branching, audit trails, generation metadata, validation history, UI state, and target-specific operational features (partitions, storage, PL/SQL, triggers) -- everything needed to run a working modeling environment. xDBML is what the tool exports from its canonical model when something outside the tool needs to read the schema's structural and semantic content. The two are complementary, not interchangeable.



## How does xDBML relate to DBML?

xDBML is a **strict superset of DBML 3.13.6** under Apache License 2.0. Every valid DBML document is a valid xDBML document with identical semantics. To opt into xDBML extensions, add `xdbml: 0.1` at the top of a DBML document.

xDBML extends DBML with constructs DBML cannot currently express: explicit namespace levels (Containers), nested hierarchical types, structural polymorphism (oneOf/anyOf/allOf), first-class JSON columns with known shape, precise relationship cardinality, property-bearing graph edges, views, AI-readiness metadata, and a structured custom-properties mechanism.

DBML's `database_type:` setting is preserved as an alias for single-target schemas; see spec §5.3.



## Is xDBML competing with JSON Schema, OpenAPI, Avro, GraphQL, or SQL DDL?

No. Each of those serves a specific consumer in a specific context:

- **JSON Schema** validates JSON instances at runtime.
- **OpenAPI** describes HTTP API contracts.
- **Avro** is a binary serialization format for streaming.
- **GraphQL** is a query and API definition language.
- **SQL DDL** is what databases execute to create tables.

xDBML is the layer *above* these. From one xDBML document, generators emit a JSON Schema for runtime validation, an OpenAPI spec for the HTTP API, an Avro schema for the Kafka stream, GraphQL types for the query layer, and SQL DDL for the database. Each downstream format describes one specific consumer; xDBML describes the conceptual schema once and lowers to all of them.



## What's the relationship between xDBML and ODCS, OSI, OWL?

These are adjacent standards that layer above and below xDBML:

- **ODCS** (Open Data Contract Standard) wraps an xDBML schema with contractual metadata: quality rules, SLAs, ownership, pricing, lifecycle.
- **OSI** (Open Semantic Interchange) and **dbt MetricFlow** describe measures, metrics, and aggregations -- the computational meaning that xDBML deliberately leaves to the semantic layer.
- **OWL** and RDF-star handle inferential reasoning and knowledge-graph semantics.
- **OpenLineage** tracks data flow and lineage at runtime.

xDBML generates the schemas these standards reference and consumes nothing they own. The same xDBML document can feed an ODCS contract's schema section, an OSI semantic model's underlying tables, a SHACL validator's target shapes, and the SQL DDL that creates them.



## Who maintains xDBML?

xDBML is currently a draft v0.1 specification stewarded by [Hackolade](https://hackolade.com) (IntegrIT SA/NV) pending evolution to neutral foundation governance. The path is documented in the [governance model](/governance). The spec, grammar, examples, and reference implementations are published under Apache License 2.0 at [github.com/xdbml/xdbml-spec](https://github.com/xdbml/xdbml-spec).



## How can I contribute?

Several ways:

- **File an issue** on GitHub with feedback, questions, or proposals.
- **Implement xDBML support** in your tool or platform -- importers, generators, validators, IDE integrations.
- **Build the playground**, parser implementations in different languages, or example schemas for new domains.
- **Engage on governance** as xDBML moves toward neutral foundation stewardship.

See [contributing](/contributing) for details.



## When will v1.0 ship?

When v0.1 has been used long enough for the language to stabilize through real-world feedback. The grammar is finalized; the ecosystem is being built; the open questions are about which constructs prove essential and which prove unnecessary as more teams adopt the language. v1.0 will codify what survives that feedback loop.

---

*Have a question that should be here? [Open an issue](https://github.com/xdbml/xdbml-spec/issues/new) with the "FAQ candidate" label, or suggest an edit via the link below.*
