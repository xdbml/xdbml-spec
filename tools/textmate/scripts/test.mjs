#!/usr/bin/env node
/**
 * tools/textmate/scripts/test.mjs
 *
 * Smoke test for the generated TextMate grammar. Tokenizes each
 * bundled example file and verifies that:
 *
 *   1. The grammar loads without error
 *   2. Every line of every example produces tokens (no crash mid-file)
 *   3. Key tokens are scoped as expected (smoke checks for specific
 *      keywords and patterns we'd want highlighted)
 *
 * Exit code 0 = clean, 1 = failures. Prints per-example token
 * summaries and any unexpected results.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import vsctmPkg from 'vscode-textmate';
import onigurumaPkg from 'vscode-oniguruma';
const vsctm = vsctmPkg;
const oniguruma = onigurumaPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const GRAMMAR_PATH  = join(REPO_ROOT, 'tools', 'textmate', 'xdbml.tmLanguage.json');
const EXAMPLES_DIR  = join(REPO_ROOT, 'parser', 'test', 'examples');

const isTTY = process.stdout.isTTY;
const RED   = isTTY ? '\x1b[31m' : '';
const GREEN = isTTY ? '\x1b[32m' : '';
const YELLOW= isTTY ? '\x1b[33m' : '';
const CYAN  = isTTY ? '\x1b[36m' : '';
const DIM   = isTTY ? '\x1b[2m'  : '';
const RESET = isTTY ? '\x1b[0m'  : '';

async function loadGrammarRegistry () {
  // vscode-oniguruma needs its WASM binary loaded first.
  const wasmBin = readFileSync(
    join(REPO_ROOT, 'node_modules', 'vscode-oniguruma', 'release', 'onig.wasm'),
  );
  await oniguruma.loadWASM(wasmBin.buffer);

  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString:  (str)     => new oniguruma.OnigString(str),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName === 'source.xdbml') {
        return vsctm.parseRawGrammar(readFileSync(GRAMMAR_PATH, 'utf-8'), GRAMMAR_PATH);
      }
      return null;
    },
  });
  return registry;
}

/**
 * Tokenize one file and return summary stats.
 *
 * @param {ReturnType<vsctm.Registry["prototype"]>} registry
 * @param {string} text
 * @returns {Promise<{lines: number, tokens: number, scopes: Map<string,number>, errors: string[]}>}
 */
async function tokenizeFile (registry, text) {
  const grammar = await registry.loadGrammar('source.xdbml');
  if (!grammar) {
    throw new Error('Failed to load source.xdbml grammar');
  }
  const lines = text.split(/\r?\n/);
  const scopes = new Map();
  const errors = [];
  let ruleStack = vsctm.INITIAL;
  let tokens = 0;
  for (let i = 0; i < lines.length; i++) {
    try {
      const lineTokens = grammar.tokenizeLine(lines[i], ruleStack);
      ruleStack = lineTokens.ruleStack;
      for (const t of lineTokens.tokens) {
        tokens++;
        for (const s of t.scopes) {
          scopes.set(s, (scopes.get(s) ?? 0) + 1);
        }
      }
    } catch (e) {
      errors.push(`Line ${i+1}: ${e.message}`);
    }
  }
  return { lines: lines.length, tokens, scopes, errors };
}

/**
 * Verify a specific assertion: that some scope appears at all in
 * the tokenized output.
 */
function expectScope (scopes, scopeName, minCount = 1) {
  const count = scopes.get(scopeName) ?? 0;
  return count >= minCount ? null : `expected at least ${minCount} occurrence of scope '${scopeName}', got ${count}`;
}

async function main () {
  const registry = await loadGrammarRegistry();
  const files = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.xdbml')).sort();
  if (files.length === 0) {
    console.error('No example files found in', EXAMPLES_DIR);
    process.exit(1);
  }

  let totalFailed = 0;
  console.log(`${CYAN}xDBML TextMate grammar smoke test${RESET}`);
  console.log(`${DIM}grammar: ${GRAMMAR_PATH}${RESET}`);
  console.log(`${DIM}examples: ${EXAMPLES_DIR}${RESET}\n`);

  for (const f of files) {
    const text = readFileSync(join(EXAMPLES_DIR, f), 'utf-8');
    const result = await tokenizeFile(registry, text);
    const hasErrors = result.errors.length > 0;
    const status = hasErrors ? `${RED}✗${RESET}` : `${GREEN}✓${RESET}`;
    console.log(`  ${status} ${f}  ${DIM}(${result.lines} lines, ${result.tokens} tokens, ${result.scopes.size} unique scopes)${RESET}`);
    if (hasErrors) {
      totalFailed++;
      for (const err of result.errors) {
        console.log(`      ${YELLOW}${err}${RESET}`);
      }
    }
  }

  // Check that the first example exercises a broad set of scopes.
  // The blog example has the most variety per-keyword.
  const blogText = readFileSync(join(EXAMPLES_DIR, '01-blog.xdbml'), 'utf-8');
  const blog = await tokenizeFile(registry, blogText);

  console.log(`\n${CYAN}Scope coverage in 01-blog.xdbml${RESET}`);
  const expectedScopes = [
    'comment.line.double-slash.xdbml',
    'keyword.control.directive.xdbml',
    'keyword.declaration.xdbml',
    'entity.name.type.xdbml',
    'storage.type.xdbml',
    'support.constant.flag.xdbml',
    'string.quoted.single.xdbml',
    'punctuation.section.brackets.begin.xdbml',
    'punctuation.section.brackets.end.xdbml',
  ];
  for (const s of expectedScopes) {
    const err = expectScope(blog.scopes, s);
    if (err === null) {
      console.log(`  ${GREEN}✓${RESET} ${s} (${blog.scopes.get(s)} occurrences)`);
    } else {
      console.log(`  ${RED}✗${RESET} ${err}`);
      totalFailed++;
    }
  }

  console.log(`\n${CYAN}== Summary ==${RESET}`);
  if (totalFailed === 0) {
    console.log(`  ${GREEN}All checks passed${RESET}`);
  } else {
    console.log(`  ${RED}${totalFailed} failures${RESET}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
