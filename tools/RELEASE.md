# Releasing xDBML

One script does the whole release. It edits no files by hand, stops at the
first failure, and waits for the npm registry rather than assuming.

    tools\release-preflight.cmd 0.4.0     check everything first, changes nothing
    tools\release.cmd 0.4.0               publish and deploy
    tools\github-release.cmd 0.4          tag and publish the GitHub release

Run both from the repo root. Preflight is the important habit: it is the only
moment where stopping is free, because a published npm version can never be
republished.

## What the scripts do

`release-preflight.cmd` verifies, and changes nothing:

- npm login and readable `@xdbml` scope
- the version is not already published, for both packages
- wrangler is installed locally and authenticated
- dev tooling is actually present (`tsc` in `node_modules\.bin`)
- `NODE_ENV` is not forcing production, which silently drops devDependencies
- `mcp/src/reference.ts` is in sync with `public/llms.txt`
- every test suite passes
- the git tree is clean

`release.cmd` then, halting on any failure:

1. `parser`   bumps, installs, tests, publishes, waits for the registry
2. `renderer` bumps, repoints its `@xdbml/parse` range, tests, publishes, waits
3. `mcp`      repoints both ranges, bumps, installs, checks, tests, deploys
4. `api`      repoints its range, installs, checks, deploys
5. prints the live dist-tags so you can see what landed

Every version and range change goes through `npm version` and `npm pkg set`,
which update `package.json` and `package-lock.json` together. Hand-editing
updates only one of them, and the Workers bundle from the lockfile.

## Doing it by hand

If the script fails partway, or you would rather drive it yourself, this is
exactly what it runs. Replace `0.4.0` throughout.

### 1. Publish @xdbml/parse

    cd parser
    npm version 0.4.0 --no-git-tag-version
    npm install
    npm test
    npm publish
    npm view @xdbml/parse@0.4.0 version --prefer-online

The last line is the one that matters. `npm publish` printing `+ @xdbml/parse@0.4.0`
means the registry accepted it, but it takes a few minutes to serve, and
`npm view` without `--prefer-online` answers from your local cache. Repeat that
command until it prints the version. Only then continue: the renderer's install
resolves `@xdbml/parse@^0.4.0` from the registry and fails confusingly if it is
not yet visible.

### 2. Publish @xdbml/render

    cd ..\renderer
    npm version 0.4.0 --no-git-tag-version
    npm pkg set dependencies.@xdbml/parse=^0.4.0
    npm install
    npm run test:all
    npm publish
    npm view @xdbml/render@0.4.0 version --prefer-online

Both edits are needed. Under 0.x semver `^0.3.0` means `>=0.3.0 <0.4.0`, so
without the range bump the renderer keeps resolving the old parser.

### 3. Deploy the MCP server

    cd ..\mcp
    npm pkg set dependencies.@xdbml/parse=^0.4.0
    npm pkg set dependencies.@xdbml/render=^0.4.0
    npm version 0.4.0 --no-git-tag-version
    npm install --include=dev
    npm run check:reference
    npm run type-check
    npm test
    npx wrangler deploy

### 4. Deploy the rendering API

    cd ..\api
    npm pkg set dependencies.@xdbml/render=^0.4.0
    npm install --include=dev
    npm run type-check
    npx wrangler deploy

### 5. Commit

    cd ..
    git add -A
    git commit -m "release 0.4.0"
    git push

### 6. Tag and publish the GitHub release

    tools\github-release.cmd 0.4

Notes are generated from the `## v0.4` section of `CHANGELOG.md`, so nothing
is retyped and the release cannot drift from the repo. The script refuses to
tag a dirty tree or a `HEAD` that differs from `origin/main`, creates the tag
with those notes as its message, pushes it, and creates the release through
the GitHub CLI. Add `--prerelease` for a draft version:

    tools\github-release.cmd 0.4 --prerelease

Rerunning is safe: an existing tag is left alone and an existing release has
its notes updated rather than duplicated.

Without the GitHub CLI the script still tags and pushes, writes
`RELEASE-NOTES-v0.4.md`, and prints the URL and the file to paste. Install it
once to avoid that:

    winget install GitHub.cli
    gh auth login

To see the notes without doing anything else:

    node scripts\release-notes.mjs 0.4

The site is not in this sequence. It aliases the parser and renderer source
through its Vite config, so pushing to `main` ships it whatever is on npm.

## Things that will happen, and are fine

**`npm install` reports vulnerabilities.** Expect a dev-only chain:
`wrangler` to `miniflare` to `sharp` and `undici`. That is the local Worker
emulator and is never bundled into a deployment. The number that matters is:

    npm audit --omit=dev

which should report 0 in both `mcp` and `api`. If it does not, fix that one:

    npm audit fix --omit=dev
    npm install --include=dev

Scoping to `--omit=dev` matters. A plain `npm audit fix` tries to move wrangler
past the advisory range into a version whose optional peer is
`@cloudflare/workers-types@^5`, while `agents` to `partyserver` pins a `^4`
peer. Those cannot both hold, which is the ERESOLVE you get. Never reach for
`--force` or `--legacy-peer-deps` here: both write a tree npm itself calls
potentially broken, on the tool that builds and uploads the Worker.

**`wrangler` is not a recognized command.** It is a local devDependency, not a
global install. `npm run deploy` works because npm puts `node_modules\.bin` on
PATH for the duration of a script; typing `wrangler` at the prompt does not get
that. Use `npx wrangler` from inside `mcp` or `api`.

**`tsc` is not a recognized command.** `node_modules` has no dev dependencies.
Usually `npm audit fix --omit=dev` pruned them, or `NODE_ENV=production` is set
in the shell. Fix with `set NODE_ENV=` then `npm install --include=dev`, or
`rmdir /s /q node_modules` followed by `npm ci`.

## Things that are genuinely wrong

**`You cannot publish over the previously published versions`.** The version in
`package.json` did not change. Check with `npm pkg get version` and set it with
`npm version`, not by editing the file.

**`dist-tags` shows the old version after a successful publish.** Propagation,
plus a cached `npm view`. Add `--prefer-online` and retry. If `latest` is still
behind ten minutes after the version appears in `npm view <pkg> versions`, set
it directly: `npm dist-tag add @xdbml/parse@0.4.0 latest`.

**`reference.ts is OUT OF SYNC`.** `mcp/src/reference.ts` is generated from
`public/llms.txt`, and `predeploy` regenerates it, so a hand edit to the
generated file is silently undone at deploy time. Edit the cheatsheet, run
`npm run generate:reference`, and commit both. CI checks this.

## After deploying

Two checks worth doing, because they exercise the thing that changed rather
than the thing that built:

- call `xdbml_reference` on the MCP server and confirm it returns the current
  cheatsheet version, not the previous one
- render a document containing a `foreign_master` relationship through the API
  and confirm the line comes back dotted

## A note on the scripts

The command sequence was verified here against a copy of the repo: every
`npm version` and `npm pkg set` was run and the resulting `package.json`
values checked. The cmd.exe control flow around it was not executed on
Windows. If the script misbehaves, the manual sequence above is the same
commands in the same order and is the reliable fallback.
