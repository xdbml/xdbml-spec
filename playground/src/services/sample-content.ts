/**
 * Sample xDBML documents shown in the playground.
 *
 * **Single source of truth.** These samples are not copies. They are
 * loaded directly from the canonical example files at /examples/ via
 * Vite's `import.meta.glob` with the `?raw` query, which inlines the
 * file contents as strings at build time. The same .xdbml files that
 * drive the docs site (xdbml.org/examples/...) drive the playground
 * samples.
 *
 * **Single source of metadata.** Titles, slugs, and descriptions come
 * from scripts/examples-manifest.mjs -- the same manifest that drives
 * the docs sidebar and viewing-page generation. Adding a new example
 * requires:
 *
 *   1. Drop the .xdbml file in /examples/
 *   2. Add an entry to scripts/examples-manifest.mjs
 *
 * Both this list and the docs sidebar pick it up automatically.
 *
 * The default-startup sample is the e-commerce example -- the polyglot
 * one that demonstrates the features distinguishing xDBML from DBML.
 * Users with existing localStorage content keep what they had.
 */

import { examples as exampleManifest } from '../../../scripts/examples-manifest.mjs';

// Vite's import.meta.glob resolves these to a map of path -> raw file
// contents, materialized at build time. The `eager: true` option makes
// the contents available synchronously without a Promise wrapper. We
// then look up each manifest entry's file by name in the resulting
// map to assemble the typed SAMPLE_CATEGORIES list.
const rawXdbmlFiles = import.meta.glob('../../../examples/*.xdbml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function lookupRaw (filename: string): string {
  // Vite's glob keys are the full resolved paths from this module's
  // location. Match by suffix on the filename to be robust against
  // path-separator differences across operating systems.
  for (const [key, content] of Object.entries(rawXdbmlFiles)) {
    if (key.endsWith(`/examples/${filename}`)) return content;
  }
  throw new Error(`sample-content: cannot find raw xdbml for ${filename}; is the file in /examples/?`);
}

export interface SampleCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly content: string;
}

export const SAMPLE_CATEGORIES: readonly SampleCategory[] = exampleManifest.map((ex) => ({
  slug: ex.slug,
  name: ex.title,
  // Use the first sentence of the manifest description as the short
  // tagline shown in the playground dropdown. This avoids duplicating
  // descriptions between the manifest (which carries the long form
  // for the docs viewing page) and the dropdown.
  description: firstSentence(ex.description),
  content: lookupRaw(ex.file),
}));

/**
 * Returns the first sentence of a description (up to and including the
 * first ". "), or the whole string if no sentence boundary is found.
 * Falls back to the trimmed input for empty / edge-case strings.
 */
function firstSentence (text: string): string {
  const idx = text.indexOf('. ');
  if (idx === -1) return text.trim();
  return text.slice(0, idx + 1).trim();
}

// The polyglot Oracle + MongoDB e-commerce schema is the default for
// new visitors. It exercises the features that distinguish xDBML from
// DBML -- containers with different targets, nested objects, arrays of
// objects, oneOf polymorphism, named types, BSON scalars, cross-container
// refs with array wildcards -- so first-time visitors see the unique
// value proposition immediately rather than a plain relational schema.
//
// We resolve "default" by slug rather than by hard-coded import to
// keep the entire module data-driven from the manifest.
const DEFAULT_SAMPLE_SLUG = '02-ecommerce';

export const DEFAULT_SAMPLE_CONTENT: string =
  SAMPLE_CATEGORIES.find((s) => s.slug === DEFAULT_SAMPLE_SLUG)?.content
  ?? SAMPLE_CATEGORIES[0]?.content
  ?? '';

/**
 * Look up an example's content by its manifest slug. Returns null when no
 * example with that slug exists. Used by the "View in playground" deep link
 * (`?example=<slug>`) so an example viewing page can open directly here.
 */
export function getSampleContentBySlug (slug: string): string | null {
  return SAMPLE_CATEGORIES.find((s) => s.slug === slug)?.content ?? null;
}
