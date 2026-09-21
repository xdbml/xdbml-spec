// Keep the specification's "View in playground" buttons in step with the
// snippets they open.
//
// A button is an anchor placed on its own line just before an ```xdbml
// block:
//
//   <a class="playground-launch" href="https://xdbml.org/playground/index.html#s=..." target="_blank" rel="noopener">View in playground</a>
//
//   ```xdbml
//   ...snippet...
//   ```
//
// The `#s=` hash is the playground's share format (lz-string
// `compressToEncodedURIComponent`), so the button opens the snippet itself.
// A snippet that names entities it does not declare, as the §12 examples
// do, opens with two additions so the diagram has something to draw: an
// `xdbml:` line when the snippet has none, and empty declarations for the
// entities its supertype groups name, after a marker comment. The snippet
// shown in the spec is never changed.
//
// Usage (run with --experimental-strip-types; the script reads the parser
// source to find undeclared entities):
//
//   node --experimental-strip-types scripts/spec-playground-links.mjs
//       Check every spec/vN.M.md. Exit 1 if any button no longer opens the
//       snippet below it.
//
//   node --experimental-strip-types scripts/spec-playground-links.mjs --write [file ...]
//       Rewrite the href of every button that does not match (including a
//       new button written with an empty `#s=`). Default files: all
//       spec/vN.M.md. For a file not named vN.M.md, pass --version N.M.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse, flatten, resolveSupertypeGroups } from '../parser/src/index.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// lz-string is a renderer dependency; the site root does not install it.
const lz = createRequire(path.join(repoRoot, 'renderer', 'package.json'))('lz-string');

const BASE = 'https://xdbml.org/playground/index.html#s=';
const STUB_MARKER = '// Declarations added so this snippet opens in the playground';
const BUTTON_RE = /<a class="playground-launch" href="https:\/\/xdbml\.org\/playground\/index\.html#s=([^"]*)"([^>]*)>View in playground<\/a>(\s*\n\s*\n?)```xdbml\n([\s\S]*?)```/g;

/** The document a button opens for a snippet. */
export function launchSource (snippet, version) {
  const body = snippet.replace(/\s+$/, '');
  const hasVersion = /^\s*xdbml\s*:/.test(body);
  let doc = hasVersion ? body : `xdbml: ${version}\n\n${body}`;
  const stubs = undeclaredGroupEntities(doc);
  if (stubs.length > 0) {
    doc += `\n\n${STUB_MARKER}\n${stubs.map((n) => `Entity ${n} { }`).join('\n')}`;
  }
  if (!hasVersion || stubs.length > 0) return `${doc}\n`;
  // A complete snippet opens exactly as written, which is what every button
  // up to v0.4 does.
  return snippet;
}

/** Entities named by supertype groups but declared nowhere in the document. */
function undeclaredGroupEntities (doc) {
  let groups;
  try {
    groups = resolveSupertypeGroups(flatten(parse(doc)));
  } catch {
    return [];
  }
  const names = [];
  const add = (n) => {
    if (n && !n.includes('.') && !names.includes(n)) names.push(n);
  };
  for (const g of groups) {
    if (!g.supertype) add(g.settings.supertype);
    for (const s of g.subtypes) if (!s.entity) add(s.member.name);
  }
  return names;
}

function matches (decoded, snippet, version) {
  if (decoded === null || decoded === undefined) return false;
  if (decoded.trim() === snippet.trim()) return true;
  return decoded === launchSource(snippet, version);
}

function versionOf (file, explicit) {
  if (explicit) return explicit;
  const m = /v(\d+\.\d+(?:\.\d+)?)\.md$/.exec(file);
  if (!m) throw new Error(`${file}: cannot tell the spec version from the name; pass --version N.M`);
  return m[1];
}

function processFile (file, version, write) {
  const text = readFileSync(file, 'utf8');
  const problems = [];
  let count = 0;
  let changed = 0;
  const out = text.replace(BUTTON_RE, (whole, hash, rest, gap, snippet, offset) => {
    count += 1;
    const decoded = hash ? lz.decompressFromEncodedURIComponent(hash) : null;
    if (matches(decoded, snippet, version)) return whole;
    const line = text.slice(0, offset).split('\n').length;
    if (!write) {
      problems.push(`${path.relative(repoRoot, file)}:${line}: the button does not open the snippet below it`);
      return whole;
    }
    changed += 1;
    const href = BASE + lz.compressToEncodedURIComponent(launchSource(snippet, version));
    return `<a class="playground-launch" href="${href}"${rest}>View in playground</a>${gap}\`\`\`xdbml\n${snippet}\`\`\``;
  });
  const stray = (text.match(/class="playground-launch"/g) ?? []).length - count;
  if (stray > 0) problems.push(`${path.relative(repoRoot, file)}: ${stray} button(s) not followed by an \`\`\`xdbml block`);
  if (write && changed > 0) writeFileSync(file, out, 'utf8');
  return { count, changed, problems };
}

function main () {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const vIdx = args.indexOf('--version');
  const explicitVersion = vIdx >= 0 ? args[vIdx + 1] : undefined;
  // Only `.md` arguments name files. Anything else is ignored: `npm test`
  // appends its own extra arguments to the last script in its chain, which
  // is this one, and cmd.exe does not treat `#` as a comment, so a line such
  // as `npm test # runs the suites` would otherwise arrive here as file names.
  const positional = args.filter((a, i) => !a.startsWith('--') && !(vIdx >= 0 && i === vIdx + 1));
  const fileArgs = positional.filter((a) => a.toLowerCase().endsWith('.md'));
  const ignored = positional.filter((a) => !a.toLowerCase().endsWith('.md'));
  if (ignored.length > 0) {
    console.warn(`spec-playground-links: ignoring ${ignored.length} argument(s) that are not .md files: ${ignored.join(' ')}`);
  }
  const specDir = path.join(repoRoot, 'spec');
  const files = fileArgs.length > 0
    ? fileArgs.map((f) => path.resolve(f))
    : readdirSync(specDir).filter((f) => /^v\d+\.\d+(\.\d+)?\.md$/.test(f)).sort().map((f) => path.join(specDir, f));

  let total = 0;
  let changed = 0;
  const problems = [];
  for (const file of files) {
    const r = processFile(file, versionOf(file, explicitVersion), write);
    total += r.count;
    changed += r.changed;
    problems.push(...r.problems);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`spec-playground-links: ${p}`);
    if (!write) console.error('spec-playground-links: run `node --experimental-strip-types scripts/spec-playground-links.mjs --write` to regenerate.');
    process.exit(1);
  }
  console.log(write
    ? `spec-playground-links: ${total} button(s), ${changed} rewritten`
    : `spec-playground-links: ${total} button(s) open the snippet below them`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
