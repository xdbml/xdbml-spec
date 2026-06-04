// Type declarations for scripts/examples-manifest.mjs.
//
// The manifest itself is plain ECMAScript because it's consumed by
// both Node build scripts (prepare-examples.mjs, prepare-playground.mjs)
// and by TypeScript modules (.vitepress/config.ts, the playground's
// sample-content.ts). Keeping the manifest as JS avoids forcing every
// consumer through a TypeScript compilation step; this .d.ts gives
// TypeScript callers the type information they need without changing
// what the JS module exports.

export interface Example {
  /** The basename of the .xdbml file in /examples/, e.g. "01-blog.xdbml". */
  readonly file: string;
  /** URL slug used by VitePress routing (no extension), e.g. "01-blog". */
  readonly slug: string;
  /** Human-readable title shown in sidebars and dropdowns. */
  readonly title: string;
  /** The dominant target paradigm (e.g. "PostgreSQL relational"). */
  readonly paradigm: string;
  /** Long-form description rendered on the docs viewing page. */
  readonly description: string;
}

export const examples: readonly Example[];
