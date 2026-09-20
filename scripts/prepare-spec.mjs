// scripts/prepare-spec.mjs
//
// Generates /spec/current.md from the highest-numbered /spec/vN.M.md file.
// Runs before every `vitepress dev` and `vitepress build`, alongside
// prepare-examples.mjs and prepare-playground.mjs.
//
// Why a generated copy rather than a redirect: the site is served by GitHub
// Pages, which supports neither server-side redirects nor _redirects files.
// A generated page gives https://xdbml.org/spec/current a real document, so
// the bookmarked URL keeps its place in the address bar instead of bouncing.
//
// Output:
//
//   /spec/current.md -- the newest specification, served at
//   xdbml.org/spec/current. Identical body to the versioned file, with two
//   additions: a `canonical:` frontmatter key pointing at the versioned URL
//   (search engines index /spec/vN.M, not this copy), and a short banner
//   naming the version being served.
//
// The output is gitignored. The canonical source remains /spec/vN.M.md.
//
// Releasing a new version needs no edit here: add /spec/vN.M.md, and the
// next build picks it up. The nav entry in .vitepress/config.ts and the
// version table in /spec/index.md are still maintained by hand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specDir = path.join(repoRoot, 'spec');
const outPath = path.join(specDir, 'current.md');

if (!fs.existsSync(specDir)) {
  console.error(`prepare-spec: no spec directory at ${specDir}`);
  process.exit(1);
}

// ---------------------------------------------------------------- discovery
//
// Match vN.M.md and vN.M.P.md. Sort numerically on each component so v0.10
// sorts above v0.9, which a lexical sort would get wrong.

const versionFile = /^v(\d+)\.(\d+)(?:\.(\d+))?\.md$/;

const versions = fs
  .readdirSync(specDir)
  .map((name) => {
    const m = versionFile.exec(name);
    if (!m) return null;
    return {
      name,
      slug: name.replace(/\.md$/, ''),
      parts: [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)],
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
    }
    return 0;
  });

if (versions.length === 0) {
  console.error('prepare-spec: no spec/vN.M.md files found');
  process.exit(1);
}

const latest = versions[versions.length - 1];
const label = latest.slug; // e.g. 'v0.4'
const source = fs.readFileSync(path.join(specDir, latest.name), 'utf8');

// ------------------------------------------------------------- frontmatter
//
// Split the leading --- ... --- block off the body, add the canonical key,
// and put the two back together. The spec files all carry frontmatter; bail
// loudly rather than silently emitting a page with none.

const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
if (!fm) {
  console.error(`prepare-spec: ${latest.name} has no frontmatter block`);
  process.exit(1);
}

const frontmatter = fm[1];
const body = source.slice(fm[0].length);

if (/^canonical:/m.test(frontmatter)) {
  console.error(`prepare-spec: ${latest.name} already sets canonical; refusing to override`);
  process.exit(1);
}

// The banner tells a reader which version this stable URL is serving, and
// gives them the permanent link for the version they are reading.
const banner = [
  '::: tip Current draft',
  `This page always serves the current specification draft, at present **${label}**.`,
  `The permanent link for this version is [/spec/${label}](/spec/${label}).`,
  ':::',
  '',
].join('\n');

const out = [
  '---',
  frontmatter,
  `canonical: /spec/${label}`,
  'specVersion: ' + label.slice(1),
  '---',
  '',
  banner,
  body.replace(/^\n+/, ''),
].join('\n');

const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
if (existing === out) {
  console.log(`prepare-spec: spec/current.md already up to date (${label})`);
} else {
  fs.writeFileSync(outPath, out, 'utf8');
  console.log(`prepare-spec: wrote spec/current.md from spec/${latest.name} (${label})`);
}
