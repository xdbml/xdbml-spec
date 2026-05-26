/**
 * Sample xDBML documents shown in the playground.
 *
 * **Single source of truth.** These samples are not copies. They are
 * loaded directly from the canonical example files at /examples/ via
 * Vite's `?raw` import suffix, which inlines the file contents as a
 * string at build time. The same .xdbml files that drive the docs site
 * (xdbml.org/examples/...) drive the playground samples. Adding a new
 * example to /examples/ and updating scripts/examples-manifest.mjs
 * automatically makes it available here, modulo adding an import
 * statement.
 *
 * The default-startup sample is the blog example -- the simplest of
 * the official ones, with three entities and three Refs, suitable for
 * a first impression.
 */

// Vite resolves these to the raw .xdbml file contents as strings.
// The relative path walks out of /playground/src/services/ up to the
// repo root, then into /examples/.
import blogXdbml from '../../../examples/01-blog.xdbml?raw';
import ecommerceXdbml from '../../../examples/02-ecommerce.xdbml?raw';
import iotXdbml from '../../../examples/03-iot-telemetry.xdbml?raw';
import socialXdbml from '../../../examples/04-social-graph.xdbml?raw';
import healthcareXdbml from '../../../examples/05-healthcare-fhir.xdbml?raw';
import financeXdbml from '../../../examples/06-financial-services.xdbml?raw';

// The polyglot Oracle + MongoDB e-commerce schema is the default for
// new visitors. It exercises the features that distinguish xDBML from
// DBML -- containers with different targets, nested objects, arrays of
// objects, oneOf polymorphism, named types, BSON scalars, cross-container
// refs with array wildcards -- so first-time visitors see the unique
// value proposition immediately rather than a plain relational schema.
// Users with existing localStorage content keep what they had.
export const DEFAULT_SAMPLE_CONTENT = ecommerceXdbml;

export interface SampleCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

/**
 * The titles, slugs, and descriptions here mirror scripts/examples-manifest.mjs.
 * Future enhancement: have a build step that reads that manifest and
 * generates this list, so the two stay in sync without manual updates.
 */
export const SAMPLE_CATEGORIES: readonly SampleCategory[] = [
  {
    slug: '01-blog',
    name: 'Blog (relational)',
    description: 'An entry-level relational schema covering users, posts, and comments.',
    content: blogXdbml,
  },
  {
    slug: '02-ecommerce',
    name: 'E-commerce (polyglot)',
    description: 'Polyglot Oracle + MongoDB e-commerce with nested objects, polymorphism, and BSON types.',
    content: ecommerceXdbml,
  },
  {
    slug: '03-iot-telemetry',
    name: 'IoT telemetry',
    description: 'IoT telemetry with JSON-with-schema for device metadata and nested measurement arrays.',
    content: iotXdbml,
  },
  {
    slug: '04-social-graph',
    name: 'Social graph (LPG)',
    description: 'A labeled property graph for a social network. Demonstrates the Edge construct.',
    content: socialXdbml,
  },
  {
    slug: '05-healthcare-fhir',
    name: 'Healthcare (FHIR-style)',
    description: 'Healthcare records with named reusable types, recursive types, and clinical-vocabulary references.',
    content: healthcareXdbml,
  },
  {
    slug: '06-financial-services',
    name: 'Financial services',
    description: 'Retail banking with materialized views, transaction polymorphism, and regulatory compliance tags.',
    content: financeXdbml,
  },
] as const;
