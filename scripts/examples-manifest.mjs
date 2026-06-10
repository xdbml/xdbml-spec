// scripts/examples-manifest.mjs
//
// Central registry of example files with their display titles, descriptions,
// and metadata for the docs landing page. Used by prepare-examples.mjs to
// generate viewing pages and the auto-managed regions of examples/README.md,
// and referenced by .vitepress/config.ts for the sidebar and by the
// playground's sample-content.ts for the dropdown.
//
// When adding a new example: add a .xdbml file in /examples/ and a
// corresponding entry below, then run `npm run prepare:examples` (or any
// `npm run docs:*` script) to regenerate examples/README.md's auto-managed
// table and generator block.
//
// Fields:
//   file        - basename of the .xdbml file in /examples/
//   slug        - URL slug for VitePress routing (no extension)
//   title       - shown in the sidebar, dropdown, and the README's table
//   domain      - short business-domain label for the README's Domain column
//   paradigm    - storage paradigm or target (e.g., "PostgreSQL relational")
//   description - long-form description shown on the docs viewing page
//   generators  - optional list of generator targets to demo in the README's
//                 "Generators target specific output formats" block. Each
//                 entry produces one `xdbml generate --target ...` line.
//                 Omit or leave empty when the example doesn't add a new
//                 generator target worth showcasing (e.g., another postgres
//                 example among several).
//   companionFiles - optional list of additional .xdbml files associated with
//                 the example. Companion files are copied to /public/examples/
//                 for download alongside the primary file but do not get
//                 their own viewing pages or manifest entries. The viewing
//                 page lists companions in a dedicated block.
//
//                 Currently unused -- the v0.2 module-system pair
//                 (09-modules-conformed-dimensions.xdbml and
//                 10-modules-consumer.xdbml) are each first-class examples
//                 with their own manifest entries and pages, cross-linking
//                 via description text. The mechanism remains available for
//                 future cases where a true asymmetric file pair makes
//                 sense (e.g., a JSON example with a peer .sample.json
//                 fixture that isn't worth its own viewing page).

export const examples = [
  {
    file:        '01-blog.xdbml',
    slug:        '01-blog',
    title:       'Blog (relational)',
    domain:      'Blogging platform',
    paradigm:    'PostgreSQL relational',
    description: 'An entry-level relational schema covering users, posts, and comments. Demonstrates basic entities, foreign keys, indexes, and validation patterns.',
    generators:  [],
  },
  {
    file:        '02-ecommerce.xdbml',
    slug:        '02-ecommerce',
    title:       'E-commerce (polyglot)',
    domain:      'E-commerce',
    paradigm:    'Oracle + MongoDB hybrid',
    description: 'A polyglot e-commerce schema combining Oracle relational system-of-record with MongoDB document storage. Demonstrates named types, nested arrays of objects, polymorphism with discriminator, BSON scalar types, cross-container relationships with explicit cardinality, and array traversal in foreign-key paths.',
    generators:  [
      { target: 'oracle' },
      { target: 'mongodb' },
    ],
  },
  {
    file:        '03-iot-telemetry.xdbml',
    slug:        '03-iot-telemetry',
    title:       'IoT telemetry',
    domain:      'IoT sensor data',
    paradigm:    'TimescaleDB time-series',
    description: 'Schema for an IoT telemetry platform ingesting sensor readings from heterogeneous devices. Demonstrates JSON-with-schema for variable device metadata, validation constraints on sensor value ranges, granularity hints for AI consumers, and deeply nested arrays of structured measurements.',
    generators:  [
      { target: 'avro' },
    ],
  },
  {
    file:        '04-social-graph.xdbml',
    slug:        '04-social-graph',
    title:       'Social graph (LPG)',
    domain:      'Social network',
    paradigm:    'Neo4j labeled property graph',
    description: 'A labeled property graph model for a social network. Demonstrates the Edge construct, multiple edge types between the same node types, cardinality on both sides of an edge, and edges with and without properties.',
    generators:  [
      { target: 'cypher' },
    ],
  },
  {
    file:        '05-healthcare-fhir.xdbml',
    slug:        '05-healthcare-fhir',
    title:       'Healthcare (FHIR-style)',
    domain:      'Clinical records',
    paradigm:    'PostgreSQL',
    description: 'A healthcare records schema partially inspired by FHIR resource patterns. Demonstrates named reusable types, recursive types for organizational hierarchy, polymorphic observation values, business_term references to clinical vocabularies (LOINC, SNOMED, ICD-10), and compliance tags (HIPAA, PII).',
    generators:  [
      { target: 'json-schema' },
    ],
  },
  {
    file:        '06-financial-services.xdbml',
    slug:        '06-financial-services',
    title:       'Financial services',
    domain:      'Retail banking',
    paradigm:    'Snowflake',
    description: 'A retail banking schema. Demonstrates materialized and virtual views with source queries, complex transaction polymorphism, regulatory compliance tags (PCI, SOX, KYC, AML), and AI-readiness for natural-language reporting queries.',
    generators:  [
      { target: 'odcs' },
    ],
  },
  {
    file:        '07-project-management.xdbml',
    slug:        '07-project-management',
    title:       'Project management (self-refs)',
    domain:      'Project tracking',
    paradigm:    'PostgreSQL relational',
    description: 'A project-management schema demonstrating recursive (self-referential) relationships. Employees report to other employees, tasks have parent tasks; both relationships are self-joins on the same entity, rendered in the diagram as loops out the right edge and over the top.',
    generators:  [
      { target: 'postgres' },
    ],
  },
  {
    file:        '08-university-registrar.xdbml',
    slug:        '08-university-registrar',
    title:       'University registrar (composite keys)',
    domain:      'Course enrollment',
    paradigm:    'PostgreSQL relational',
    description: 'A university registrar schema demonstrating composite primary keys and composite foreign keys. Course offerings are uniquely identified by (course, term, section); enrollments by adding the student to that triple. The diagram renders multi-column primary keys as multiple yellow rows and resolves the composite foreign key as a single relationship line with every constituent field showing the FK badge.',
    generators:  [
      { target: 'sql-ddl' },
    ],
  },
  {
    file:        '09-modules-conformed-dimensions.xdbml',
    slug:        '09-modules-conformed-dimensions',
    title:       'Module system: conformed dimensions library (v0.2)',
    domain:      'Enterprise conformed dimensions',
    paradigm:    'Library file (Snowflake-targeted)',
    description: 'The library half of a multi-file example pair. Declares canonical enterprise dimensions (Customer, Product, Date) and shared scalar Named Types (Email, CountryCode, CurrencyCode, PhoneE164) intended to be imported by data products via the xDBML v0.2 module system. The file has no `Project` block of its own because its sole purpose is to be reused. This is the file that [10-modules-consumer.xdbml](/examples/10-modules-consumer) imports from via `reuse { ... } from \'./09-modules-conformed-dimensions\'` directives. **Note**: exercises v0.2 features (scalar Named Types §14.7, entity-level checks §10) that the reference parser has not yet implemented; viewing the source works but loading it into the playground currently produces a parse error.',
    generators:  [],
  },
  {
    file:        '10-modules-consumer.xdbml',
    slug:        '10-modules-consumer',
    title:       'Module system: sales data product (v0.2)',
    domain:      'Sales data product',
    paradigm:    'Consumer file with module imports',
    description: 'The consumer half of a multi-file example pair. A sales data mart that imports canonical dimensions from [09-modules-conformed-dimensions.xdbml](/examples/09-modules-conformed-dimensions) using the xDBML v0.2 module system. Demonstrates Container-scoped imports (entities become `sales.dim_customer` not `core.dim_customer`), clone blocks with `cloned_at` metadata for file autonomy, multiple imports per directive with one shared clone block, and scalar Named Type imports at file scope. The file is fully self-contained because every `reuse` carries an inline clone; it parses correctly even when the library file is unavailable. **Note**: exercises v0.2 features (module system §26, scalar Named Types §14.7, entity-level checks §10) that the reference parser has not yet implemented; viewing the source works but loading it into the playground currently produces a parse error.',
    generators:  [],
  },
];
