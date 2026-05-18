// scripts/prepare-examples.mjs
//
// Copies example .xdbml files from /examples/ into /public/examples/ so the
// VitePress build will deploy them as static assets served at xdbml.org/examples/.
//
// The canonical source for example files is /examples/ at the repo root —
// that's where contributors see them on GitHub and where pull requests
// target them. This script ensures they're also bundled into the deployed
// site without duplicating the source-of-truth.
//
// Runs automatically before `npm run docs:dev` and `npm run docs:build`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'examples');
const dst = path.join(repoRoot, 'public', 'examples');

if (!fs.existsSync(src)) {
  console.error(`prepare-examples: source directory ${src} does not exist; skipping`);
  process.exit(0);
}

fs.mkdirSync(dst, { recursive: true });

let copied = 0;
for (const entry of fs.readdirSync(src)) {
  if (entry.endsWith('.xdbml')) {
    fs.copyFileSync(path.join(src, entry), path.join(dst, entry));
    copied++;
  }
}

console.log(`prepare-examples: copied ${copied} .xdbml file(s) to public/examples/`);
