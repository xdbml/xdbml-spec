#!/usr/bin/env node
/**
 * tools/vscode-extension/scripts/prepare.mjs
 *
 * Copies the canonical TextMate grammar from tools/textmate/ into the
 * extension's syntaxes/ directory. The VS Code extension format
 * requires the grammar inside the extension folder, but we keep the
 * single source of truth in tools/textmate/ so it can be regenerated
 * from parser/src/keywords.ts.
 *
 * Run this before packaging or publishing:
 *   cd tools/vscode-extension
 *   node scripts/prepare.mjs
 *   vsce package          # produces .vsix
 *   vsce publish          # pushes to the Marketplace
 *
 * Also hooked up as the `prepare` npm script in package.json, so
 * `npm install` and `npm pack` automatically run it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const EXT_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(EXT_ROOT, '..', '..');

const SOURCE = join(REPO_ROOT, 'tools', 'textmate', 'xdbml.tmLanguage.json');
const TARGET_DIR = join(EXT_ROOT, 'syntaxes');
const TARGET = join(TARGET_DIR, 'xdbml.tmLanguage.json');

function main () {
  // Verify the source exists and looks like the right grammar.
  const sourceText = readFileSync(SOURCE, 'utf-8');
  let parsed;
  try {
    parsed = JSON.parse(sourceText);
  } catch (e) {
    throw new Error(`Source grammar at ${SOURCE} is not valid JSON: ${e.message}`);
  }
  if (parsed.scopeName !== 'source.xdbml') {
    throw new Error(`Source grammar has unexpected scopeName: ${parsed.scopeName} (expected source.xdbml)`);
  }
  if (parsed.name !== 'xdbml') {
    throw new Error(`Source grammar has unexpected name: ${parsed.name} (expected xdbml)`);
  }

  // Copy to the extension's syntaxes folder. Pretty-printed for human
  // diff readability (since the file is committed).
  mkdirSync(TARGET_DIR, { recursive: true });
  writeFileSync(TARGET, sourceText);

  console.log(`Copied grammar:`);
  console.log(`  from: ${SOURCE}`);
  console.log(`  to:   ${TARGET}`);
  console.log(`  size: ${sourceText.length} bytes`);
}

main();
