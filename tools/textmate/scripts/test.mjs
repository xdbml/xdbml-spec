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

  const grammar = await registry.loadGrammar('source.xdbml');
  const nativeLine = '  a number(11)  b CLOB  c serial  d uniqueidentifier  e point';
  const nativeTokens = grammar.tokenizeLine(nativeLine, vsctm.INITIAL).tokens;
  const scopesOf = (word) => {
    const at = nativeLine.indexOf(word);
    const tok = nativeTokens.find((t) => t.startIndex <= at && at < t.endIndex);
    return tok ? tok.scopes : [];
  };
  // Block keywords are colored before '{' only (a field may take the name).
  console.log(`\n${CYAN}Block keywords${RESET}`);
  for (const [line, word, expected] of [
    ['  constraints {', 'constraints', true], ['  indexes {', 'indexes', true], ['  checks {', 'checks', true],
    ['  records {', 'records', true], ['  constraints varchar', 'constraints', false],
    // v0.6.5 (spec 15.8): the internal definitions of an entity.
    ['  definitions {', 'definitions', true], ['  Definitions{', 'Definitions', true],
    ['  definitions varchar', 'definitions', false], ['  definitions object {', 'definitions', false],
  ]) {
    const toks = grammar.tokenizeLine(line, vsctm.INITIAL).tokens;
    const at = line.indexOf(word);
    const tok = toks.find((t) => t.startIndex <= at && at < t.endIndex);
    const isBlock = (tok?.scopes ?? []).includes('keyword.other.block.xdbml');
    if (isBlock === expected) {
      console.log(`  ${GREEN}✓${RESET} '${line.trim()}': ${word} ${expected ? 'is' : 'is not'} a block keyword`);
    } else {
      console.log(`  ${RED}✗${RESET} '${line.trim()}': expected ${expected ? '' : 'no '}keyword.other.block.xdbml`);
      totalFailed++;
    }
  }
  // Spec 3.10 (v0.6.1): `Note` is a declaration keyword before ':' or '{',
  // or before a name and '{'; a field named `note` is not, and the type
  // after it is not taken for a declared name.
  console.log(`\n${CYAN}Note as a keyword and as a field name${RESET}`);
  for (const [line, expected] of [
    ["  Note: 'One row per order'", true], ["  Note { 'text' }", true], ['Note schema_notes {', true],
    ["NOTE: 'x'", true], ['  note varchar', false], ['  Note varchar [not null]', false], ['  notes varchar', false],
  ]) {
    const toks = grammar.tokenizeLine(line, vsctm.INITIAL).tokens;
    const at = line.search(/\S/);
    const tok = toks.find((t) => t.startIndex <= at && at < t.endIndex);
    const isDecl = (tok?.scopes ?? []).includes('keyword.declaration.xdbml');
    const typeAsName = !expected && toks.some((t) => t.scopes.includes('entity.name.type.xdbml'));
    if (isDecl === expected && !typeAsName) {
      console.log(`  ${GREEN}✓${RESET} '${line.trim()}': ${expected ? 'a declaration keyword' : 'a field name'}`);
    } else {
      console.log(`  ${RED}✗${RESET} '${line.trim()}': expected ${expected ? 'keyword.declaration.xdbml' : 'no declaration scope'}`);
      totalFailed++;
    }
  }
  // DiagramView categories (spec 18.1) are colored before '{' only.
  console.log(`\n${CYAN}DiagramView categories${RESET}`);
  for (const [line, word, expected] of [
    ['  Tables {', 'Tables', true], ['  Schemas { core }', 'Schemas', true], ['  SupertypeGroups {', 'SupertypeGroups', true],
    ['  Notes { * }', 'Notes', true], ['  tables varchar', 'tables', false], ['  notes int', 'notes', false],
  ]) {
    const toks = grammar.tokenizeLine(line, vsctm.INITIAL).tokens;
    const at = line.indexOf(word);
    const tok = toks.find((t) => t.startIndex <= at && at < t.endIndex);
    const isCategory = (tok?.scopes ?? []).includes('keyword.declaration.category.xdbml');
    if (isCategory === expected) {
      console.log(`  ${GREEN}✓${RESET} '${line.trim()}': ${word} ${expected ? 'is' : 'is not'} a category keyword`);
    } else {
      console.log(`  ${RED}✗${RESET} '${line.trim()}': expected ${expected ? '' : 'no '}keyword.declaration.category.xdbml`);
      totalFailed++;
    }
  }
  // Target-native type names are colored like scalar types, and a
  // generic word left out of TARGET_NATIVE_TYPES is not.
  console.log(`\n${CYAN}Target-native type names${RESET}`);
  for (const [word, expectType] of [['number', true], ['CLOB', true], ['serial', true], ['uniqueidentifier', true], ['point', false]]) {
    const isType = scopesOf(word).includes('storage.type.xdbml');
    if (isType === expectType) {
      console.log(`  ${GREEN}✓${RESET} ${word} ${expectType ? 'is' : 'is not'} storage.type.xdbml`);
    } else {
      console.log(`  ${RED}✗${RESET} ${word}: expected ${expectType ? '' : 'no '}storage.type.xdbml, got ${scopesOf(word).join(' ')}`);
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
