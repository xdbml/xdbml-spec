#!/usr/bin/env node
/**
 * tools/textmate/scripts/build.mjs
 *
 * Generates xdbml.tmLanguage.json from the template
 * (xdbml.tmLanguage.template.json) by filling in keyword-alternation
 * placeholders with values from parser/src/keywords.ts.
 *
 * The placeholders are named like `__SCALAR_TYPES__` and appear inside
 * regex `(?i:...)` groups in the template. Each placeholder is replaced
 * with a `kw1|kw2|kw3` alternation, sorted longest-first so that
 * multi-word matchers don't shadow shorter prefixes.
 *
 * Usage:
 *   node tools/textmate/scripts/build.mjs
 *
 * Idempotent: running multiple times produces the same output.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const TEMPLATE_PATH = join(REPO_ROOT, 'tools', 'textmate', 'xdbml.tmLanguage.template.json');
const OUTPUT_PATH = join(REPO_ROOT, 'tools', 'textmate', 'xdbml.tmLanguage.json');
const KEYWORDS_PATH = join(REPO_ROOT, 'parser', 'src', 'keywords.ts');

/**
 * Extract a `string[]` declared in keywords.ts by reading the file
 * with regex. We avoid importing the module (which would require
 * a TypeScript runtime) and instead parse the source.
 *
 * Supports spreads: a literal `...OTHER_ARRAY_NAME` in the body is
 * resolved by recursively expanding that array's items.
 *
 * @param {string} source - the keywords.ts content
 * @param {string} name - the exported const name (e.g. SCALAR_TYPES)
 * @param {Set<string>=} seen - guards against cycles
 * @returns {string[]}
 */
function extractArray (source, name, seen = new Set()) {
  if (seen.has(name)) {
    throw new Error(`Cycle detected resolving ${name}`);
  }
  seen.add(name);

  // Match: export const NAME = [ ... ] as const;
  const pattern = new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`, 'm');
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find array ${name} in keywords.ts`);
  }
  const body = match[1];

  const items = [];

  // Strip line and block comments inside the body so we don't pick
  // up keyword-looking words inside comments.
  const stripped = body
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Walk tokens: either a quoted string literal, or a spread of
  // another array name.
  const tokenRe = /['"]([^'"]+)['"]|\.\.\.([A-Z_][A-Z0-9_]*)/g;
  let m;
  while ((m = tokenRe.exec(stripped)) !== null) {
    if (m[1] !== undefined) {
      // String literal
      items.push(m[1]);
    } else if (m[2] !== undefined) {
      // Spread of another array
      const expanded = extractArray(source, m[2], seen);
      items.push(...expanded);
    }
  }

  return items;
}

/**
 * Build a regex alternation that is safe to embed in a TextMate
 * pattern. Sorts longest-first so that e.g. `varchar2` matches before
 * `varchar`. Escapes any special regex characters (rare in keywords;
 * keyword identifiers don't normally contain regex metacharacters).
 *
 * @param {string[]} keywords
 * @returns {string}
 */
function buildAlternation (keywords) {
  // Sort longest-first to give multi-character keywords precedence over
  // their prefixes.
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  // Escape regex metacharacters (none expected, but safe).
  const escaped = sorted.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.join('|');
}

function main () {
  const keywordsSrc = readFileSync(KEYWORDS_PATH, 'utf-8');
  const templateText = readFileSync(TEMPLATE_PATH, 'utf-8');

  // The placeholders we recognize and the keyword arrays that fill them.
  // Order matters: shadow-prone replacements (e.g. longer prefixes)
  // happen first.
  const placeholders = {
    __DIRECTIVE_KEYWORDS__:        'DIRECTIVE_KEYWORDS',
    __MODULE_KEYWORDS__:           'MODULE_KEYWORDS',
    __DECLARATION_KEYWORDS__:      'DECLARATION_KEYWORDS',
    __CONTAINER_KEYWORDS__:        'CONTAINER_KEYWORDS',
    __ENTITY_KEYWORDS__:           'ENTITY_KEYWORDS',
    __STRUCTURAL_TYPE_KEYWORDS__:  'STRUCTURAL_TYPE_KEYWORDS',
    __POLYMORPHISM_KEYWORDS__:     'POLYMORPHISM_KEYWORDS',
    __SCALAR_TYPES__:              'SCALAR_TYPES',
    __BSON_TYPES__:                'BSON_TYPES',
    __SETTING_FLAGS__:             'SETTING_FLAGS',
    __SETTING_KEYS__:              'SETTING_KEYS',
    __GRANULARITY_VALUES__:        'GRANULARITY_VALUES',
  };

  let output = templateText;
  const stats = {};
  for (const [placeholder, arrayName] of Object.entries(placeholders)) {
    const items = extractArray(keywordsSrc, arrayName);
    const alternation = buildAlternation(items);
    // Replace every occurrence of the placeholder. Use a string replace
    // with a callback to avoid regex pitfalls (placeholders don't
    // contain $, so no concern about `$` substitution, but stay defensive).
    const count = output.split(placeholder).length - 1;
    if (count > 0) {
      output = output.split(placeholder).join(alternation);
    }
    stats[placeholder] = { items: items.length, occurrences: count };
  }

  // Parse the result to verify it's still valid JSON.
  try {
    JSON.parse(output);
  } catch (e) {
    console.error('ERROR: generated grammar is not valid JSON:', e.message);
    console.error('Output saved to xdbml.tmLanguage.json.broken for inspection.');
    writeFileSync(OUTPUT_PATH + '.broken', output);
    process.exit(1);
  }

  // Write the generated grammar with a clear "DO NOT EDIT" header
  // injected. We rewrite the __comment_top__ key while we're at it.
  const parsed = JSON.parse(output);
  delete parsed.__comment_top__;
  // Insert a top-level $comment field that's the standard JSON "comment"
  // convention used by various JSON tools.
  const ordered = {
    $schema: parsed.$schema,
    $comment: 'AUTO-GENERATED FROM xdbml.tmLanguage.template.json BY tools/textmate/scripts/build.mjs. Keyword vocabulary sourced from parser/src/keywords.ts. To modify: edit the template or keywords.ts, then re-run the build script.',
    name: parsed.name,
    displayName: parsed.displayName,
    scopeName: parsed.scopeName,
    fileTypes: parsed.fileTypes,
    patterns: parsed.patterns,
    repository: parsed.repository,
  };

  // Write pretty-printed for human readability and reviewable diffs.
  const final = JSON.stringify(ordered, null, 2) + '\n';
  writeFileSync(OUTPUT_PATH, final);

  console.log(`Built ${OUTPUT_PATH}`);
  console.log(`Source keywords from ${KEYWORDS_PATH}`);
  console.log('');
  console.log('Placeholder replacements:');
  for (const [placeholder, info] of Object.entries(stats)) {
    const status = info.occurrences > 0 ? `✓` : `(unused)`;
    console.log(`  ${status} ${placeholder.padEnd(34)} ${String(info.items).padStart(3)} keywords, ${info.occurrences} occurrence(s)`);
  }
  console.log('');
  const remaining = output.match(/__[A-Z_]+__/g);
  if (remaining) {
    console.error(`WARNING: unfilled placeholders remain in output: ${[...new Set(remaining)].join(', ')}`);
    process.exit(1);
  }
}

main();
