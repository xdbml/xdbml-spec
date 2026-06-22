// Generate mcp/src/reference.ts from public/llms.txt.
//
// public/llms.txt is the single source of truth for the xDBML cheatsheet. This
// script inlines it into a committed TypeScript module so the xdbml_reference
// MCP tool (and any non-wrangler consumer) can import it as a normal value.
//
// Usage:
//   node scripts/generate-reference.mjs           write mcp/src/reference.ts
//   node scripts/generate-reference.mjs --check    verify it is in sync (exit 1 if not)
//
// It runs automatically on `npm run predeploy` and `npm run predev`. After
// editing public/llms.txt, run `npm run generate:reference` and commit the
// regenerated mcp/src/reference.ts. CI can run `npm run check:reference` to
// fail the build if the committed file ever drifts from public/llms.txt.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LLMS = new URL('../../public/llms.txt', import.meta.url);
const REF  = new URL('../src/reference.ts', import.meta.url);

const cheatsheet = readFileSync(LLMS, 'utf8');

const header =
`/**
 * GENERATED FILE -- DO NOT EDIT BY HAND.
 *
 * The compact xDBML reference returned by the xdbml_reference MCP tool, inlined
 * from public/llms.txt (the single source of truth). Regenerate after editing
 * the cheatsheet with \`npm run generate:reference\` (runs automatically on
 * predeploy / predev), then commit this file.
 */

`;

const output = header + `export const XDBML_REFERENCE = ${JSON.stringify(cheatsheet)};\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(REF, 'utf8'); } catch { /* missing -> drift */ }
  if (current !== output) {
    console.error('reference.ts is OUT OF SYNC with public/llms.txt.');
    console.error('Run `npm run generate:reference` and commit mcp/src/reference.ts.');
    process.exit(1);
  }
  console.log('reference.ts is in sync with public/llms.txt.');
} else {
  writeFileSync(REF, output);
  console.log(`Wrote ${fileURLToPath(REF)} (${cheatsheet.length} chars from public/llms.txt).`);
}
