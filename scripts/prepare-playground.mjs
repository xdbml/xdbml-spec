// scripts/prepare-playground.mjs
//
// Builds /playground/ and copies the output into /public/playground/ so
// VitePress publishes it as static assets at xdbml.org/playground/.
//
// Mirrors the pattern of scripts/prepare-examples.mjs: a small node
// script that runs before VitePress, producing files that are
// gitignored.
//
// Runs as part of `npm run docs:build`. Idempotent.
//
// The playground has its own package.json and node_modules. We install
// its dependencies and run its build (`npm run build` inside
// /playground/), which produces /playground/dist/. We then copy that
// dist into /public/playground/ where VitePress picks it up.
//
// Skips quietly if /playground/ doesn't exist (e.g. when this script
// runs against an older repo state).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot       = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playgroundDir  = path.join(repoRoot, 'playground');
const playgroundDist = path.join(playgroundDir, 'dist');
const targetDir      = path.join(repoRoot, 'public', 'playground');

if (!fs.existsSync(playgroundDir)) {
  console.log(`prepare-playground: ${playgroundDir} not found; skipping (no playground in this repo state)`);
  process.exit(0);
}

// 1. Install playground deps if node_modules isn't there yet.
//
// We don't use npm workspaces (the root package.json is VitePress-only
// and the playground is a separate Vue/Vite project with very different
// devDependencies; mixing them creates resolution headaches). Instead
// we install each independently. This step is a no-op if the
// playground was already npm-installed.
const playgroundModules = path.join(playgroundDir, 'node_modules');
if (!fs.existsSync(playgroundModules)) {
  console.log('prepare-playground: installing playground dependencies (one-time, this can take a minute)...');
  execSync('npm install --no-audit --no-fund', {
    cwd: playgroundDir,
    stdio: 'inherit',
  });
}

// 2. Build the playground. Its build script runs prepare-assets first
// (copying logos from /logo/), then vue-tsc, then vite build.
console.log('prepare-playground: building playground...');
execSync('npm run build', {
  cwd: playgroundDir,
  stdio: 'inherit',
});

if (!fs.existsSync(playgroundDist)) {
  console.error(`prepare-playground: build did not produce ${playgroundDist}`);
  process.exit(1);
}

// 3. Stage the build into /public/playground/. We remove the target
// first to drop stale files from previous builds.
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

copyRecursive(playgroundDist, targetDir);

const fileCount = countFiles(targetDir);
console.log(`prepare-playground: staged ${fileCount} file(s) into public/playground/`);

function copyRecursive (src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

function countFiles (dir) {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(path.join(dir, entry.name));
    else n += 1;
  }
  return n;
}
