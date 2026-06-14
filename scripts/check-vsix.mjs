#!/usr/bin/env node
/**
 * scripts/check-vsix.mjs
 *
 * Compares the current `tools/vscode-extension/package.json` version against
 * the latest `.vsix` archive committed in `tools/vscode-extension/`. If they
 * differ -- or if no `.vsix` exists for the current version -- this prints
 * a clear warning telling the operator to rebuild.
 *
 * Wired into `npm test` at the repo root so the warning surfaces on every
 * sanity-check run. The script never fails the build: it exits 0 even when
 * the .vsix is stale, because the .vsix is a release artifact and not
 * strictly required for the parser/playground/docs to work. The exit code
 * is reserved for genuine errors (e.g., extension package.json missing).
 *
 * To rebuild the .vsix:
 *   cd tools/vscode-extension
 *   node scripts/prepare.mjs        # syncs grammar from tools/textmate/
 *   npx @vscode/vsce package        # produces xdbml-X.Y.Z.vsix
 *
 * To publish to the VS Code Marketplace from the command line:
 *   npx @vscode/vsce publish        # requires a Personal Access Token
 *
 * See https://code.visualstudio.com/api/working-with-extensions/publishing-extension
 * for marketplace publisher setup.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const EXT_DIR = join(REPO_ROOT, 'tools', 'vscode-extension');
const EXT_PACKAGE_JSON = join(EXT_DIR, 'package.json');

const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';

function readExtensionVersion () {
  let raw;
  try {
    raw = readFileSync(EXT_PACKAGE_JSON, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read ${EXT_PACKAGE_JSON}: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${EXT_PACKAGE_JSON} is not valid JSON: ${e.message}`);
  }
  if (typeof parsed.version !== 'string') {
    throw new Error(`${EXT_PACKAGE_JSON} is missing a "version" string`);
  }
  return parsed.version;
}

/**
 * Find all .vsix files in the extension directory and parse their versions
 * from the filename. We follow the standard `<name>-<version>.vsix`
 * convention emitted by `vsce package`.
 *
 * Returns the highest version found (lexicographically; vsce uses semver
 * and the SemVer ordering matches lexicographic for the X.Y.Z patterns
 * we use), or null when none exist.
 */
function findLatestVsixVersion () {
  let entries;
  try {
    entries = readdirSync(EXT_DIR);
  } catch (e) {
    throw new Error(`Cannot read ${EXT_DIR}: ${e.message}`);
  }
  const versions = [];
  for (const name of entries) {
    if (!name.endsWith('.vsix')) continue;
    // Match `xdbml-X.Y.Z.vsix` (capturing the version segment).
    const m = /^xdbml-(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\.vsix$/.exec(name);
    if (m) versions.push(m[1]);
  }
  if (versions.length === 0) return null;
  versions.sort(compareSemverDesc);
  return versions[0];
}

/**
 * Compare two version strings. Returns negative if a > b (so desc sort),
 * positive if b > a, 0 if equal. Handles the X.Y.Z and X.Y.Z-pre patterns
 * we use. Falls back to lexicographic comparison for unparseable values.
 */
function compareSemverDesc (a, b) {
  const parse = (v) => {
    const [main, pre] = v.split('-', 2);
    const [maj, min, pat] = main.split('.').map((s) => parseInt(s, 10));
    return { maj, min, pat, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (isNaN(pa.maj) || isNaN(pb.maj)) return b.localeCompare(a);
  if (pa.maj !== pb.maj) return pb.maj - pa.maj;
  if (pa.min !== pb.min) return pb.min - pa.min;
  if (pa.pat !== pb.pat) return pb.pat - pa.pat;
  // A prerelease tag is lower than no prerelease.
  if (pa.pre && !pb.pre) return 1;
  if (!pa.pre && pb.pre) return -1;
  if (pa.pre && pb.pre) return pb.pre.localeCompare(pa.pre);
  return 0;
}

function main () {
  let extVersion;
  try {
    extVersion = readExtensionVersion();
  } catch (e) {
    // Extension package.json missing or malformed -- genuine error.
    console.error(`check-vsix: ${e.message}`);
    process.exit(1);
  }

  const vsixVersion = findLatestVsixVersion();

  if (vsixVersion === null) {
    console.warn(
      `${YELLOW}check-vsix: WARNING${RESET} -- no .vsix archive found in tools/vscode-extension/.\n` +
      `  Extension declares version ${extVersion} in package.json, but no\n` +
      `  xdbml-${extVersion}.vsix exists. Rebuild with:\n` +
      `    ${DIM}cd tools/vscode-extension && node scripts/prepare.mjs && npx @vscode/vsce package${RESET}`,
    );
    process.exit(0);
  }

  if (vsixVersion === extVersion) {
    console.log(
      `${GREEN}check-vsix:${RESET} ${DIM}xdbml-${extVersion}.vsix is in sync with the extension version.${RESET}`,
    );
    process.exit(0);
  }

  console.warn(
    `${YELLOW}check-vsix: WARNING${RESET} -- extension .vsix is stale.\n` +
    `  Extension package.json: version ${extVersion}\n` +
    `  Latest .vsix found:     xdbml-${vsixVersion}.vsix\n` +
    `\n` +
    `  The .vsix archive is what users install. After bumping the extension\n` +
    `  version or changing the TextMate grammar, regenerate the .vsix:\n` +
    `    ${DIM}cd tools/vscode-extension && node scripts/prepare.mjs && npx @vscode/vsce package${RESET}\n` +
    `\n` +
    `  To publish directly to the Marketplace (requires a Personal Access\n` +
    `  Token; see VS Code extension publishing docs):\n` +
    `    ${DIM}cd tools/vscode-extension && npx @vscode/vsce publish${RESET}`,
  );
  process.exit(0);
}

main();
