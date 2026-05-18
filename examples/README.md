# xDBML Examples

Reference xDBML documents covering a range of realistic business domains and storage paradigms. Each example is self-contained, parses standalone against the v0.1 grammar, and demonstrates a specific subset of the language's features.

These files serve three audiences:

- **Learners** picking up xDBML, who want to see realistic syntax in context.
- **Parser implementers**, who use these files as test fixtures and round-trip targets.
- **Evaluators**, who want to judge xDBML's expressiveness against alternatives.

## The examples

| File | Domain | Paradigm | Features emphasized |
|------|--------|----------|---------------------|
| [`01-blog.xdbml`](./01-blog.xdbml) | Blogging platform | PostgreSQL relational | Entry-level. Basic entities, foreign keys, indexes, validation patterns. |
| [`02-ecommerce.xdbml`](./02-ecommerce.xdbml) | E-commerce | Oracle + MongoDB hybrid | Named types, nested arrays of objects, polymorphism with discriminator, BSON scalar types, cross-container relationships with explicit cardinality, array traversal in foreign-key paths. |
| [`03-iot-telemetry.xdbml`](./03-iot-telemetry.xdbml) | IoT sensor data | TimescaleDB time-series | JSON-with-schema for variable device metadata, validation constraints on sensor value ranges, granularity for AI consumers, deeply nested arrays of structured measurements. |
| [`04-social-graph.xdbml`](./04-social-graph.xdbml) | Social network | Neo4j labeled property graph | The `Edge` construct, multiple edge types between the same node types, cardinality on both sides of an edge, edges with and without properties. |
| [`05-healthcare-fhir.xdbml`](./05-healthcare-fhir.xdbml) | Clinical records | PostgreSQL | Named reusable types (CodedConcept, HumanName, ContactPoint, Address), recursive types for organizational hierarchy, polymorphic observation values, `business_term` references to LOINC/SNOMED/ICD-10 vocabularies, compliance tags (HIPAA, PII). |
| [`06-financial-services.xdbml`](./06-financial-services.xdbml) | Retail banking | Snowflake | Materialized and virtual views with source queries, complex transaction polymorphism, regulatory compliance tags (PCI, SOX, KYC, AML), AI-readiness for natural-language reporting queries. |

## A note on the `note:` capability

Every example uses xDBML's `note:` setting extensively — at the project level, container level, entity level, field level, and inside nested types and polymorphic alternatives. This is deliberate. The examples demonstrate the full range of what `note:` can carry: short field-level descriptions, multi-paragraph design rationale, regulatory references, and cross-references to companion documentation.

**Production schemas should be more selective.** Over-noting is as bad as no noting — the noise drowns out the signal. As a general guideline:

- Project and container notes should explain *why* the schema is structured the way it is. Decisions worth preserving for the next maintainer.
- Entity notes should describe the entity's role in the broader system and any non-obvious lifecycle rules.
- Field notes should be reserved for fields whose meaning, format, or constraints are not obvious from name and type alone.

A field called `email` of type `varchar [unique, not null]` doesn't need a note. A field called `kyc_status` of type `varchar` with an enum constraint absolutely does.

## Running the examples through a parser

Once the reference parser is available, you can validate each example with:

```bash
xdbml parse 01-blog.xdbml
xdbml parse --all
```

Generators target specific output formats:

```bash
xdbml generate --target oracle    02-ecommerce.xdbml
xdbml generate --target mongodb   02-ecommerce.xdbml
xdbml generate --target avro      03-iot-telemetry.xdbml
xdbml generate --target cypher    04-social-graph.xdbml
xdbml generate --target json-schema 05-healthcare-fhir.xdbml
xdbml generate --target odcs      06-financial-services.xdbml
```

## Contributing examples

We welcome additional examples that demonstrate xDBML features not yet covered or cover domains the current set omits. Particularly desired:

- A **streaming platform** example showing Avro event records with full union semantics
- A **content management system** example showing deeply nested polymorphism (article body composed of mixed content blocks)
- A **multi-tenant SaaS** example showing how tenant isolation patterns translate to xDBML

To contribute, open a pull request adding a new file numbered consecutively. Follow the conventions of the existing examples: realistic domain, generous noting, demonstrated feature subset clearly identified in the project-level `Note`.

## License

The examples are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Copy, adapt, derive — no attribution required. The xDBML specification itself is Apache License 2.0.
