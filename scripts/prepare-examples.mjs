// scripts/prepare-examples.mjs
//
// Generates the example viewing infrastructure from the canonical .xdbml files
// in /examples/. Runs before every `vitepress dev` and `vitepress build`.
//
// Outputs:
//
//   1. /public/examples/01-blog.xdbml -- raw file served at xdbml.org/examples/01-blog.xdbml
//      for download. Identical content to the source file.
//
//   2. /examples/01-blog.md -- a markdown wrapper rendered as a viewing page at
//      xdbml.org/examples/01-blog within the VitePress theme. Contains the .xdbml
//      content embedded in a syntax-highlighted code block, plus action links to
//      download and view-on-GitHub.
//
//   3. /examples/README.md -- the auto-managed regions (the examples table and the
//      generator-targets code block) are rewritten in place from the manifest.
//      Everything outside the <!-- ...:start --> / <!-- ...:end --> markers is
//      preserved verbatim. README.md IS committed to git, so this rewrite is
//      idempotent: if the manifest hasn't changed, the file isn't touched.
//
// The two .md outputs (#2) are gitignored; the README rewrite (#3) is committed.
// The canonical source remains /examples/*.xdbml plus /scripts/examples-manifest.mjs.
//
// When adding a new example: add the .xdbml file plus an entry in
// scripts/examples-manifest.mjs, then run `npm run prepare:examples`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { examples } from './examples-manifest.mjs';

const repoRoot       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplesSrc    = path.join(repoRoot, 'examples');
const publicExamples = path.join(repoRoot, 'public', 'examples');
const readmePath     = path.join(examplesSrc, 'README.md');

const githubRepoBlobBase = 'https://github.com/xdbml/xdbml-spec/blob/main/examples';

if (!fs.existsSync(examplesSrc)) {
  console.error(`prepare-examples: source directory ${examplesSrc} does not exist; skipping`);
  process.exit(0);
}

// Ensure target directories exist
fs.mkdirSync(publicExamples, { recursive: true });

let copied = 0;
let generated = 0;

for (const ex of examples) {
  const srcPath = path.join(examplesSrc, ex.file);

  if (!fs.existsSync(srcPath)) {
    console.warn(`prepare-examples: skipping ${ex.file} -- source file not found`);
    continue;
  }

  // 1. Copy raw .xdbml file into public/examples/ for download.
  fs.copyFileSync(srcPath, path.join(publicExamples, ex.file));
  copied++;

  // 2. Generate a viewing-page markdown wrapper at /examples/<slug>.md.
  const content = fs.readFileSync(srcPath, 'utf8');
  const md = renderViewingPage(ex, content);
  fs.writeFileSync(path.join(examplesSrc, `${ex.slug}.md`), md, 'utf8');
  generated++;
}

// 3. Rewrite the auto-managed regions of README.md.
const readmeUpdated = updateReadme();

console.log(`prepare-examples: copied ${copied} raw .xdbml file(s) to public/examples/`);
console.log(`prepare-examples: generated ${generated} viewing page(s) in examples/`);
console.log(`prepare-examples: README.md ${readmeUpdated ? 'rewritten' : 'already in sync'}`);


// ============================================================
// Rendering
// ============================================================

function renderViewingPage(ex, content) {
  // Escape the closing code fence sequence in the content, just in case
  // an example contains a literal "```" (unlikely but defensive).
  const safe = content.replace(/```/g, '`\u200b``');

  return `---
title: ${ex.title}
description: ${ex.description.replace(/\n/g, ' ').slice(0, 200)}
---

# ${ex.title}

**File:** \`${ex.file}\` &nbsp;·&nbsp; **Target:** ${ex.paradigm}

${ex.description}

<div style="display: flex; gap: 12px; margin: 24px 0; flex-wrap: wrap;">
  <a href="/examples/${ex.file}" download="${ex.file}"
     style="display: inline-block; padding: 8px 16px; background: var(--vp-c-brand-1); color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
    ⬇ Download ${ex.file}
  </a>
  <a href="${githubRepoBlobBase}/${ex.file}" target="_blank" rel="noopener"
     style="display: inline-block; padding: 8px 16px; border: 1px solid var(--vp-c-divider); color: var(--vp-c-text-1); text-decoration: none; border-radius: 8px; font-weight: 500;">
    View on GitHub ↗
  </a>
</div>

## Source

\`\`\`xdbml
${safe}
\`\`\`

---

[← Back to all examples](/examples/)
`;
}


// ============================================================
// README rewriter
// ============================================================

/**
 * Rewrite the auto-managed regions of /examples/README.md from the manifest.
 *
 * Two regions are managed:
 *
 *   - <!-- examples-table:start --> ... <!-- examples-table:end -->
 *     A markdown table with one row per manifest entry.
 *
 *   - <!-- generators:start --> ... <!-- generators:end -->
 *     A bash code block with one `xdbml generate --target X file.xdbml` line
 *     per (example, generator-target) pair, target column padded to align.
 *
 * Both regions are idempotent: regenerating with an unchanged manifest produces
 * byte-identical content. The function returns true if README.md was modified,
 * false if it was already in sync.
 *
 * Everything outside the markers is preserved verbatim. If a marker is missing,
 * the function logs a warning and leaves the file alone -- failing safely is
 * better than mangling a hand-edited README.
 */
function updateReadme () {
  if (!fs.existsSync(readmePath)) {
    console.warn(`prepare-examples: README.md not found at ${readmePath}; skipping`);
    return false;
  }
  const original = fs.readFileSync(readmePath, 'utf8');

  const tableBlock     = renderExamplesTable();
  const generatorBlock = renderGeneratorBlock();

  let updated = replaceMarkedRegion(original, 'examples-table', tableBlock);
  updated     = replaceMarkedRegion(updated,  'generators',     generatorBlock);

  if (updated === original) return false;
  fs.writeFileSync(readmePath, updated, 'utf8');
  return true;
}

/**
 * Replace the content between <!-- name:start --> and <!-- name:end --> markers
 * with the given new content. The marker lines themselves (including the
 * informational comment text between `name:start` and the closing `-->`) are
 * preserved. If either marker is missing, returns the input unchanged and logs
 * a warning -- safer than rewriting blind.
 */
function replaceMarkedRegion (source, name, newContent) {
  // Matches the opening marker (with any informational text inside), the
  // existing region content, and the closing marker.
  const re = new RegExp(
    `(<!--\\s*${name}:start[\\s\\S]*?-->)([\\s\\S]*?)(<!--\\s*${name}:end\\s*-->)`,
    'm',
  );
  if (!re.test(source)) {
    console.warn(`prepare-examples: marker pair "${name}:start"/"${name}:end" not found in README; leaving region alone`);
    return source;
  }
  return source.replace(re, (_match, open, _body, close) => `${open}\n${newContent}\n${close}`);
}

/**
 * Render the examples table as a markdown block. Columns are aligned by padding
 * each cell to the maximum width of that column across all rows (including the
 * header). The result reads cleanly as plain markdown in any viewer, including
 * GitHub and IDE preview.
 */
function renderExamplesTable () {
  const header = ['Example', 'Domain', 'Paradigm', 'View / Download'];
  const rows = examples.map((ex) => [
    ex.title,
    ex.domain,
    ex.paradigm,
    `[View](./${ex.slug}) · <a href="/examples/${ex.file}" download="${ex.file}">Download</a>`,
  ]);
  return renderMarkdownTable(header, rows);
}

/**
 * Render the bash code block listing one `xdbml generate ...` line per
 * (example, generator-target) pair. The --target column is padded so all
 * filenames line up, matching the visual style of the previous hand-maintained
 * block.
 */
function renderGeneratorBlock () {
  const pairs = [];
  for (const ex of examples) {
    if (!Array.isArray(ex.generators)) continue;
    for (const gen of ex.generators) {
      pairs.push({ target: gen.target, file: ex.file });
    }
  }
  if (pairs.length === 0) {
    return '```bash\n# No generator targets are declared in the manifest.\n```';
  }
  const maxTargetLen = pairs.reduce((max, p) => Math.max(max, p.target.length), 0);
  const lines = pairs.map((p) => `xdbml generate --target ${p.target.padEnd(maxTargetLen)} ${p.file}`);
  return '```bash\n' + lines.join('\n') + '\n```';
}

/**
 * Build a column-aligned markdown table. Each column is padded to its widest
 * cell so the source markdown reads neatly. The separator row uses `---`
 * sized to match each column's width.
 */
function renderMarkdownTable (header, rows) {
  const allRows = [header, ...rows];
  const widths = header.map((_, colIndex) =>
    allRows.reduce((max, row) => Math.max(max, row[colIndex].length), 0),
  );
  const renderRow = (row) =>
    '| ' + row.map((cell, i) => cell.padEnd(widths[i])).join(' | ') + ' |';
  const separator =
    '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|';
  return [renderRow(header), separator, ...rows.map(renderRow)].join('\n');
}
