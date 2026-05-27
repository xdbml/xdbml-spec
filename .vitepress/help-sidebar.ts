/**
 * Help sidebar generator.
 *
 * Reads `playground/help/help-menu.toml` and converts it to the
 * VitePress sidebar schema. Called once at config-load time.
 *
 * The TOML manifest is the single source of truth for menu structure.
 * URLs are slug-driven and stable: a page's slug never changes once
 * published, so external links don't break when the menu is
 * reorganized. See the comments at the top of help-menu.toml for the
 * full rationale.
 *
 * This module also exports a validation function used by the
 * help-validate script and the VitePress config to catch:
 *   - slugs in the manifest with no corresponding <slug>.md file
 *   - <slug>.md files that aren't referenced anywhere in the manifest
 *
 * Both kinds of mismatch indicate either a typo or a forgotten
 * cleanup step; better to fail fast than to ship broken URLs.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';
import type { DefaultTheme } from 'vitepress';

/**
 * The raw shape of a node as it appears in the TOML file. Recursive
 * via the optional `children` array.
 */
interface TomlNode {
  title: string;
  slug?: string;
  children?: TomlNode[];
}

interface TomlManifest {
  nodes: TomlNode[];
}

/**
 * Path conventions. Help lives at /playground/help/<slug>, so the
 * URL prefix below maps the slug to the clean URL VitePress serves
 * when `cleanUrls: true` is set.
 */
const HELP_URL_PREFIX = '/playground/help/';
const HELP_SOURCE_DIR = 'playground/help';

/**
 * Load and parse the manifest from disk. Path is relative to the
 * repo root so this can be called from inside .vitepress/.
 */
function loadManifest (repoRoot: string): TomlManifest {
  const path = join(repoRoot, HELP_SOURCE_DIR, 'help-menu.toml');
  const text = readFileSync(path, 'utf-8');
  const parsed = TOML.parse(text) as unknown as TomlManifest;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error(`Help manifest at ${path} has no [[nodes]] entries.`);
  }
  return parsed;
}

/**
 * Convert one TomlNode to the VitePress SidebarItem shape. Recursive
 * via `children`. Returns the converted item.
 *
 * VitePress sidebar items have either:
 *   - text + link            (leaf, clickable)
 *   - text + items           (section header, expandable)
 *   - text + link + items    (mixed mode -- clickable AND expandable)
 *
 * We can produce all three by setting `link` only when the node has
 * a slug, and `items` only when the node has children.
 */
function nodeToSidebarItem (node: TomlNode): DefaultTheme.SidebarItem {
  const item: DefaultTheme.SidebarItem = {
    text: node.title,
  };
  if (node.slug) {
    item.link = HELP_URL_PREFIX + node.slug;
  }
  if (node.children && node.children.length > 0) {
    item.items = node.children.map(nodeToSidebarItem);
    // Mixed-mode and section-header nodes default to collapsed but
    // start expanded if the cursor is currently within their subtree.
    // VitePress handles this automatically via `collapsed: false` on
    // the active branch; we omit `collapsed` so it stays open by
    // default. Users can toggle by clicking the disclosure caret.
  }
  return item;
}

/**
 * Build the VitePress sidebar configuration for the help section.
 *
 * Returns an array of top-level groups. Each top-level TomlNode
 * becomes a group whose `text` is the node's title and whose `items`
 * are its children (or, for a leaf top-level node like "Keyboard
 * shortcuts", a one-item group with the leaf as its only entry).
 */
export function buildHelpSidebar (repoRoot: string): DefaultTheme.SidebarItem[] {
  const manifest = loadManifest(repoRoot);
  const sidebar: DefaultTheme.SidebarItem[] = [];

  for (const topNode of manifest.nodes) {
    const item = nodeToSidebarItem(topNode);
    // VitePress renders top-level sidebar entries as group headers.
    // A top-level leaf (e.g. "Keyboard shortcuts" with no children) is
    // displayed as a section header with one clickable item beneath it,
    // which looks awkward. Workaround: wrap top-level leaves so they
    // appear as their own group with an empty title -- VitePress then
    // renders them flat. But that hides the section visually. Better:
    // keep top-level leaves as standalone groups whose `text` is the
    // page name and the link IS the group header. The default theme
    // supports this when the group has a link itself.
    sidebar.push(item);
  }
  return sidebar;
}

/* -------------------------------------------------------------------------
 * Validation
 *
 * Cross-checks the manifest against the files in playground/help/ to
 * catch the two kinds of drift:
 *
 *   1. A slug appears in the manifest but no <slug>.md exists on
 *      disk. Means: someone added a menu entry but forgot to write
 *      the page (or the page was deleted without removing the menu
 *      entry). Build should fail.
 *
 *   2. A <slug>.md exists on disk but no manifest node references
 *      it. Means: orphaned content -- it'll render at its URL but
 *      won't appear in the sidebar. Build should warn (not fail) so
 *      drafts-in-progress aren't blocked.
 * ----------------------------------------------------------------------- */

export interface ValidationResult {
  missingPages: string[];      // slugs in manifest with no file
  orphanedPages: string[];     // files with no manifest reference
  manifestSlugs: string[];     // all slugs in the manifest (for reporting)
}

export function validateHelp (repoRoot: string): ValidationResult {
  const manifest = loadManifest(repoRoot);
  const manifestSlugs: string[] = [];
  function collect (nodes: TomlNode[]): void {
    for (const n of nodes) {
      if (n.slug) manifestSlugs.push(n.slug);
      if (n.children) collect(n.children);
    }
  }
  collect(manifest.nodes);

  const helpDir = join(repoRoot, HELP_SOURCE_DIR);
  const filesOnDisk = readdirSync(helpDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''));

  const fileSet = new Set(filesOnDisk);
  const slugSet = new Set(manifestSlugs);

  const missingPages = manifestSlugs.filter((slug) => !fileSet.has(slug));
  const orphanedPages = filesOnDisk.filter((file) => !slugSet.has(file));

  return { missingPages, orphanedPages, manifestSlugs };
}

/**
 * Throw if the manifest references slugs without on-disk pages.
 * Called from VitePress's config to fail the build early when the
 * help is structurally broken.
 *
 * Orphaned pages produce a console warning but don't fail the build,
 * since drafts in progress are a normal state.
 */
export function assertHelpIsConsistent (repoRoot: string): void {
  const { missingPages, orphanedPages } = validateHelp(repoRoot);

  if (orphanedPages.length > 0) {
    console.warn(
      '[help] Pages exist on disk but are not referenced in help-menu.toml:\n' +
      orphanedPages.map((p) => '  - ' + p + '.md').join('\n'),
    );
  }

  if (missingPages.length > 0) {
    throw new Error(
      '[help] Manifest references slugs without corresponding <slug>.md files:\n' +
      missingPages.map((s) => '  - ' + s).join('\n') +
      '\nEither create the page or remove the slug from help-menu.toml.',
    );
  }
}

/* -------------------------------------------------------------------------
 * URL utility
 *
 * Exposed for the validation script and for any other consumer that
 * wants to construct a help URL from a slug.
 * ----------------------------------------------------------------------- */

export function helpUrlForSlug (slug: string): string {
  return HELP_URL_PREFIX + slug;
}
