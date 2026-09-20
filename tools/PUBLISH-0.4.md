# Releasing xDBML v0.4

The site, the npm packages, and the two Workers services ship separately.
This is the order to do them in, and what each one needs.

The repo is left in a buildable state by the delivery: package versions are
still 0.3.x and every dependency range still resolves against what is on npm
today, so `npm ci` and CI pass before any of this is done. The version bumps
below are part of publishing, not part of the delivery, because bumping a
range to a version that is not yet on npm breaks `npm ci` for everyone until
the publish lands.

## 0. Prerequisites

```sh
npm whoami        # publish rights on the @xdbml scope; else npm login
wrangler whoami   # Cloudflare account with the xdbml-mcp and api Workers
```

With 2FA-on-publish, append `--otp=<code>` to each `npm publish`.

## 1. Push the site

The site deploys from `main` through `.github/workflows/deploy.yml`, so a
push is the whole step.

```sh
npm test
cd playground && npm run type-check && cd ..
npm run docs:build
git add -A && git commit -m "spec v0.4 draft: relationships" && git push
```

Check afterwards:

- https://xdbml.org/spec/current serves v0.4
- https://xdbml.org/spec/v0.3 still serves v0.3
- the sitemap lists the versioned pages and not `/spec/current`
- https://xdbml.org/llms.txt shows the v0.4 cheatsheet

The site is independent of the packages below. It aliases the parser and
renderer source directly, so it carries the v0.4 behaviour as soon as it is
pushed, whatever is on npm.

## 2. Publish @xdbml/parse 0.4.0

New exports (`constraintType`, `isUndirected`, `entityNames`,
`isEntityLevelEndpoint`, `checkRelationships` and friends), new diagnostic
codes, no removals. A minor bump under 0.x.

```sh
cd parser
```

Edit `package.json`: `"version": "0.3.2"` -> `"0.4.0"`.

```sh
npm install        # refreshes package-lock.json with the new version
npm test           # expect 183 passed, 0 failed
npm publish        # prepublishOnly builds dist/
npm view @xdbml/parse dist-tags    # expect latest: 0.4.0
```

## 3. Publish @xdbml/render 0.4.0

New exports (`collectRefDeclarations`, `RelationshipVisibility`,
`ALL_RELATIONSHIPS_VISIBLE`), new `RefLayout` fields, new theme tokens. Also
a visible change: the relationship role markers render as two-letter pills
(`fk`, `fm`, `dk`, `dm`) where `fk` used to be a single `F` circle, so any
consumer with its own SVG snapshots will see diffs.

```sh
cd ../renderer
```

Edit `package.json`: `"version": "0.3.1"` -> `"0.4.0"`, and the
`@xdbml/parse` dependency `"^0.3.0"` -> `"^0.4.0"`.

```sh
npm install        # now pulls @xdbml/parse 0.4.0 from npm
npm run test:all   # expect 150 + 14 + 38, 0 failed
npm publish
npm view @xdbml/render dependencies   # expect @xdbml/parse: ^0.4.0
```

## 4. Deploy the MCP server

The MCP server is a Cloudflare Worker. Two things to know before deploying.

`mcp/src/reference.ts` is GENERATED from `public/llms.txt` and is what the
`xdbml_reference` tool returns. `npm run predeploy` regenerates it, so a hand
edit to the generated file is silently undone at deploy time. Edit
`public/llms.txt` instead and commit the regenerated file. CI now fails on
drift (`cd mcp && npm run check:reference`).

The server bundles from its lockfile, so the lockfile has to be committed
after any dependency change or the deployed bundle will not match the repo.

```sh
cd ../mcp
```

Edit `package.json`: `@xdbml/parse` -> `"^0.4.0"`, `@xdbml/render` ->
`"^0.4.0"`, and `"version": "0.2.0"` -> `"0.3.0"`.
Edit `src/index.ts`: `SERVER_VERSION = '0.2.0'` -> `'0.3.0'`.

```sh
npm install                 # updates package-lock.json -- commit it
npm run check:reference     # must say in sync
npm run type-check
npm test                    # expect 9 passed, 0 failed
npm run deploy              # predeploy regenerates the reference, then wrangler deploy
```

Check afterwards: call `xdbml_reference` and confirm it returns the v0.4
cheatsheet, then `validate_xdbml` on a document using `foreign_master` and
confirm it validates rather than reporting an unknown setting.

## 5. Deploy the rendering API

```sh
cd ../api
```

Edit `package.json`: `@xdbml/render` -> `"^0.4.0"`.

```sh
npm install        # commit the refreshed lockfile
npm run deploy
```

Check afterwards: render a document containing a `foreign_master`
relationship and confirm the line comes back dotted.

## 6. Commit the release state

```sh
cd ..
git add -A
git commit -m "release: @xdbml/parse 0.4.0, @xdbml/render 0.4.0, mcp 0.3.0"
git push
```

## Notes

- Staying on 0.x is deliberate. Under semver, 0.x still allows breaking
  changes in a minor bump while the spec evolves; 1.0.0 is reserved for the
  API-stability commitment alongside spec v1.0.
- The playground has no npm dependency to bump. It aliases the parser and
  renderer source through its Vite config, so it always tracks the repo.
- `@xdbml/render-api` and `@xdbml/mcp` are private and unpublished. Only
  their dependency ranges and their deployed bundles change.
