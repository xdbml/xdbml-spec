// scripts/prepare-assets.mjs
//
// Populates /playground/public/ from canonical asset sources elsewhere
// in the repo. Single source of truth: the actual SVGs live in /logo/,
// and we copy them here at build time so Vite serves them at the right
// URLs without keeping duplicate committed copies in the playground.
//
// Mirrors the pattern of /scripts/prepare-examples.mjs at the repo root,
// which does the same thing for example .xdbml files going into
// /public/examples/.
//
// Runs before `vite dev` and `vite build` via the playground's
// package.json scripts. Generated files are gitignored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here       = path.dirname(fileURLToPath(import.meta.url));
const playground = path.resolve(here, '..');
const repoRoot   = path.resolve(playground, '..');

const logoSrc    = path.join(repoRoot, 'logo');
const publicDst  = path.join(playground, 'public');

// Mapping: canonical filename in /logo/ -> filename served from /playground/public/.
// Names are unchanged; the mapping exists as a single point to update if
// either side ever needs renaming.
const assets = [
  ['xdbml-logo.svg',      'xdbml-logo.svg'],
  ['xdbml-logo-dark.svg', 'xdbml-logo-dark.svg'],
  ['xdbml-mark.svg',      'xdbml-mark.svg'],
  ['xdbml-favicon.svg',   'xdbml-favicon.svg'],
];

if (!fs.existsSync(logoSrc)) {
  console.error(`prepare-assets: ${logoSrc} not found; skipping`);
  process.exit(0);
}

fs.mkdirSync(publicDst, { recursive: true });

let copied = 0;
for (const [srcName, dstName] of assets) {
  const srcPath = path.join(logoSrc, srcName);
  const dstPath = path.join(publicDst, dstName);
  if (!fs.existsSync(srcPath)) {
    console.warn(`prepare-assets: source ${srcName} not found in /logo/; skipping`);
    continue;
  }
  fs.copyFileSync(srcPath, dstPath);
  copied++;
}

console.log(`prepare-assets: copied ${copied} logo asset(s) from /logo/ into /playground/public/`);
