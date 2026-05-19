// scripts/prepare-examples.mjs
//
// Generates the example viewing infrastructure from the canonical .xdbml files
// in /examples/. Runs before every `vitepress dev` and `vitepress build`.
//
// Two outputs per example:
//
//   1. /public/examples/01-blog.xdbml — raw file served at xdbml.org/examples/01-blog.xdbml
//      for download. Identical content to the source file.
//
//   2. /examples/01-blog.md — a markdown wrapper rendered as a viewing page at
//      xdbml.org/examples/01-blog within the VitePress theme. Contains the .xdbml
//      content embedded in a syntax-highlighted code block, plus action links to
//      download and view-on-GitHub.
//
// Both outputs are git-ignored (see .gitignore) so they don't pollute the repo.
// The canonical source remains /examples/*.xdbml.
//
// When adding a new example: add the .xdbml file plus an entry in
// scripts/examples-manifest.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { examples } from './examples-manifest.mjs';

const repoRoot       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const examplesSrc    = path.join(repoRoot, 'examples');
const publicExamples = path.join(repoRoot, 'public', 'examples');

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
    console.warn(`prepare-examples: skipping ${ex.file} — source file not found`);
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

console.log(`prepare-examples: copied ${copied} raw .xdbml file(s) to public/examples/`);
console.log(`prepare-examples: generated ${generated} viewing page(s) in examples/`);


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
