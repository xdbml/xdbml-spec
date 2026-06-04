// scripts/examples-manifest.mjs
//
// Central registry of example files with their display titles and descriptions.
// Used by prepare-examples.mjs to generate viewing pages, and referenced by
// .vitepress/config.ts for the sidebar.
//
// When adding a new example: add a .xdbml file in /examples/ and a corresponding
// entry below. The build will pick it up automatically.

export const examples = [
  {
    file:        '01-blog.xdbml',
    slug:        '01-blog',
    title:       'Blog (relational)',
    paradigm:    'PostgreSQL relational',
    description: 'An entry-level relational schema covering users, posts, and comments. Demonstrates basic entities, foreign keys, indexes, and validation patterns.',
  },
  {
    file:        '02-ecommerce.xdbml',
    slug:        '02-ecommerce',
    title:       'E-commerce (polyglot)',
    paradigm:    'Oracle + MongoDB hybrid',
    description: 'A polyglot e-commerce schema combining Oracle relational system-of-record with MongoDB document storage. Demonstrates named types, nested arrays of objects, polymorphism with discriminator, BSON scalar types, cross-container relationships with explicit cardinality, and array traversal in foreign-key paths.',
  },
  {
    file:        '03-iot-telemetry.xdbml',
    slug:        '03-iot-telemetry',
    title:       'IoT telemetry',
    paradigm:    'TimescaleDB time-series',
    description: 'Schema for an IoT telemetry platform ingesting sensor readings from heterogeneous devices. Demonstrates JSON-with-schema for variable device metadata, validation constraints on sensor value ranges, granularity hints for AI consumers, and deeply nested arrays of structured measurements.',
  },
  {
    file:        '04-social-graph.xdbml',
    slug:        '04-social-graph',
    title:       'Social graph (LPG)',
    paradigm:    'Neo4j labeled property graph',
    description: 'A labeled property graph model for a social network. Demonstrates the Edge construct, multiple edge types between the same node types, cardinality on both sides of an edge, and edges with and without properties.',
  },
  {
    file:        '05-healthcare-fhir.xdbml',
    slug:        '05-healthcare-fhir',
    title:       'Healthcare (FHIR-style)',
    paradigm:    'PostgreSQL',
    description: 'A healthcare records schema partially inspired by FHIR resource patterns. Demonstrates named reusable types, recursive types for organizational hierarchy, polymorphic observation values, business_term references to clinical vocabularies (LOINC, SNOMED, ICD-10), and compliance tags (HIPAA, PII).',
  },
  {
    file:        '06-financial-services.xdbml',
    slug:        '06-financial-services',
    title:       'Financial services',
    paradigm:    'Snowflake',
    description: 'A retail banking schema. Demonstrates materialized and virtual views with source queries, complex transaction polymorphism, regulatory compliance tags (PCI, SOX, KYC, AML), and AI-readiness for natural-language reporting queries.',
  },
  {
    file:        '07-project-management.xdbml',
    slug:        '07-project-management',
    title:       'Project management (self-refs)',
    paradigm:    'PostgreSQL relational',
    description: 'A project-management schema demonstrating recursive (self-referential) relationships. Employees report to other employees, tasks have parent tasks; both relationships are self-joins on the same entity, rendered in the diagram as loops out the right edge and over the top.',
  },
];
