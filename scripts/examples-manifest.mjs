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
    description: 'A polyglot e-commerce schema combining Oracle relational system-of-record with MongoDB document storage. Demonstrates named types (including the object-form `Address` Type with a nested `location` sub-object for bounded geographic coordinates), nested arrays of objects, polymorphism with discriminator, BSON scalar types, cross-container relationships with explicit cardinality, and array traversal in foreign-key paths.',
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
    description: 'The library half of a multi-file example pair. Declares canonical enterprise dimensions (Customer, Product, Date) and shared scalar Named Types (Email, CountryCode, CurrencyCode, PhoneE164) intended to be imported by data products via the xDBML v0.2 module system. The file has no `Project` block of its own because its sole purpose is to be reused. This is the file that [10-modules-consumer.xdbml](/examples/10-modules-consumer) imports from via `reuse { ... } from \'./09-modules-conformed-dimensions\'` directives. The `dim_customer` entity carries an `engagement_score` field with rich inline validation (numeric bounds, explanatory note) suitable for reuse via the field-level-import pattern (spec §27.8) -- complementing the Type-import pattern used for shared scalar types like Email and CountryCode.',
    generators:  [],
  },
  {
    file:        '10-modules-consumer.xdbml',
    slug:        '10-modules-consumer',
    title:       'Module system: sales data product (v0.2)',
    domain:      'Sales data product',
    paradigm:    'Consumer file with module imports',
    description: 'The consumer half of a multi-file example pair. A sales data mart that imports canonical dimensions from [09-modules-conformed-dimensions.xdbml](/examples/09-modules-conformed-dimensions) and also imports the complex object-form `Address` Type from [02-ecommerce.xdbml](/examples/02-ecommerce). Demonstrates the four principal reuse patterns side-by-side: Container-scoped entity imports (entities become `sales.dim_customer` not `core.dim_customer`); file-scope scalar Type imports for shared validation surfaces (Email, CountryCode, etc.); file-scope complex Type import for the structured `Address` Type with its nested `location` object; and a file-scope field-level import (`reuse { field core.dim_customer.engagement_score }`, spec §27.8) that brings a single field\'s validation surface in as a usable type, placed on `fact_sales.engagement_at_sale` as an SCD snapshot. Address is then placed on `sales.dim_customer.primary_address` as a consumer-side enhancement of the canonical dimension. Every `reuse` carries an inline clone block with `cloned_at` metadata, so the file is fully self-contained -- it parses correctly even when the library files are unavailable.',
    generators:  [],
  },
  {
    file:        '11-modules-remote.xdbml',
    slug:        '11-modules-remote',
    title:       'Module system: remote sources (v0.3)',
    domain:      'Sales data product',
    paradigm:    'Consumer file with remote (URL) imports',
    description: 'A v0.3 variant of the sales data product in [10-modules-consumer.xdbml](/examples/10-modules-consumer), in the same domain so the only difference is where modules come from. Instead of a local relative path, each `reuse` directive imports from the PUBLISHED library over HTTPS, with the URL pinned to the immutable `v0.2` git tag rather than a mutable branch (spec §27.14.2). It demonstrates the remote module-source feature (spec §27.14): a raw-content URL is recognized by its `https://` scheme, while a non-https scheme, a protocol-relative `//host/...` source, a bare host, or credentials embedded in the URL are rejected with a located error. Each directive keeps a clone block plus `cloned_at`, so the URL records the canonical source and the clone is the archived snapshot -- the file parses offline while documenting provenance. A purely live (reference-only) remote import is demonstrated interactively in the playground rather than here, to keep the hermetic example suite network-free.',
    generators:  [],
  },
  {
    file:        '12-conceptual-to-denormalized.xdbml',
    slug:        '12-conceptual-to-denormalized',
    title:       'Conceptual to denormalized (v0.4)',
    domain:      'Order management',
    paradigm:    'MongoDB document model',
    description: 'One model holding relationships at three stages of refinement, which is what the v0.4 relationship work is for. `customers - Campaign` is an entity-level relationship (spec \u00a711.16): both endpoints name entities, nothing has been decided about a campaign yet, and no cardinality is inferred from the operator. `orders.customerID > customers.customerID` is an ordinary foreign key carrying the documentation a conceptual or logical model needs -- roles and verbs reading it in both directions (\u00a711.14), explicit cardinality, and `constraint_type: non_identifying` recording that the foreign key is not part of the order\'s primary key (\u00a711.15). The remaining five relationships are foreign masters (\u00a711.10): `orders` keeps copies of the customer name and shipping address, and each line item keeps the product name as sold, so a read needs no join. Each copy is declared separately, since a foreign master takes one attribute on each side, and one of them crosses an array with the explicit `.[*]` form. None of the foreign masters reaches a generator; they record where each duplicated value is mastered.',
    generators:  [],
  },
  {
    file:        '13-foreign-master-denormalization.xdbml',
    slug:        '13-foreign-master-denormalization',
    title:       'Denormalization with foreign master (v0.4)',
    domain:      'Storefront orders',
    paradigm:    'MongoDB document model',
    description: 'A read-optimized order document that keeps copies of values mastered in `customers` and `products`, with every copy declared as a foreign master relationship (spec \u00a711.10). Eight of them: the customer name, the loyalty tier, three address fields, and three catalogue fields inside each line item. Both declaration forms appear, so the example shows they mean the same thing -- top-level `Ref:` statements for the customer copies, the inline `[ref: ..., foreign_master]` form for the line-item copies, one of which sits inside an array element. The example also draws the line that matters in practice: `unitPrice` is NOT a foreign master, because the price charged is a fact about the order rather than a copy of the catalogue price, and a value that may legitimately differ from its source is not replicated data. Contrast the foreign key at the end, which is generated and carries roles, verbs and a constraint type (\u00a711.14, \u00a711.15), with the eight foreign masters above it, which reach no generator at all.',
    generators:  [],
  },
  {
    file:        '14-supertype-groups.xdbml',
    slug:        '14-supertype-groups',
    title:       'Supertype groups (v0.5)',
    domain:      'Parties and roles',
    paradigm:    'Logical model',
    description: 'A logical model of parties with three supertype groups (spec \u00a712). Party is specialized along two independent axes: `legal_nature` (Person or Organization, total and disjoint) and `business_role` (Customer and Supplier, partial and overlapping), so one supertype anchors two groups. Person is specialized a second time by `person_role`, which makes a three-level hierarchy. Each subtype declares only its own attributes; the attributes of its supertypes apply to it without being declared again (\u00a712.5). The groups record the intended materialization for a later derivation (\u00a712.7): a flat roll-up with a `nature` discriminator, preserved hierarchy for the overlapping axis, and a per-subtype roll-down for Contractor. Organization declares a key of its own, which a truck owner points at; Employee declares none, so an assignment points at Employee as an entity-level endpoint (\u00a711.16).',
    generators:  [],
  },
];
