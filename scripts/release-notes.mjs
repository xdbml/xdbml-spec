// scripts/release-notes.mjs
//
// Writes the release notes for one version to stdout, or to a file with
// --out. The CHANGELOG is the single source: notes that are retyped for the
// GitHub release drift from the ones in the repo, and then neither can be
// trusted.
//
//   node scripts/release-notes.mjs 0.4
//   node scripts/release-notes.mjs 0.4 --out RELEASE-NOTES-v0.4.md
//
// Used by tools\github-release.cmd. Exits non-zero when the version has no
// section, so a release cannot be created with empty notes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version> [--out <file>]');
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf8');

// Sections look like `## v0.4 -- 2026`. Match the heading for this version,
// then run to the next `## ` heading at the same level.
const heading = new RegExp(`^## v${version.replace(/\./g, '\\.')}\\b.*$`, 'm');
const m = heading.exec(changelog);
if (!m) {
  console.error(`No "## v${version}" section in CHANGELOG.md.`);
  console.error('Sections found:');
  for (const h of changelog.matchAll(/^## (v[\d.]+)\b/gm)) console.error(`  ${h[1]}`);
  process.exit(1);
}

const bodyStart = m.index + m[0].length;
const next = /^## v[\d.]+\b/m.exec(changelog.slice(bodyStart));
const body = (next ? changelog.slice(bodyStart, bodyStart + next.index) : changelog.slice(bodyStart)).trim();

// Strip the Status/Released lines: they describe the CHANGELOG entry, not the
// release, and GitHub shows its own status.
const cleaned = body
  .split('\n')
  .filter((line) => !/^\*\*(Status|Released)\*\*:/.test(line.trim()))
  .join('\n')
  .trim();

const notes = [
  cleaned,
  '',
  '---',
  '',
  `Specification: https://xdbml.org/spec/v${version}`,
  `Current draft: https://xdbml.org/spec/current`,
  `Full changelog: https://github.com/xdbml/xdbml-spec/blob/v${version}/CHANGELOG.md`,
  '',
].join('\n');

if (outPath) {
  fs.writeFileSync(path.resolve(repoRoot, outPath), notes, 'utf8');
  console.log(`release-notes: wrote ${outPath} (${notes.length} chars) for v${version}`);
} else {
  process.stdout.write(notes);
}
