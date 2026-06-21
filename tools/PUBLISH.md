# Publishing @xdbml/parse and @xdbml/render as 0.3.0 (production)

Apply the files in this delivery to your checkout, commit, and push first. The
versions are already set to 0.3.0, so a plain `npm publish` sets the `latest`
dist-tag automatically and overwrites the current prerelease `latest`.

## What changed in this delivery

- `parser/package.json` -- version 0.1.0-poc.1 -> 0.3.0; production description;
  added repository / homepage / bugs / keywords / author; README added to `files`.
- `parser/README.md` -- NEW (the npm landing page for the package).
- `parser/LICENSE` -- NEW (Apache-2.0, copied from the repo root).
- `renderer/package.json` -- version 0.1.0-poc.2 -> 0.3.0; production description;
  added repository / homepage / bugs / author; dependency `@xdbml/parse` bumped
  from `^0.1.0-poc.1` to `^0.3.0`.
- `renderer/LICENSE` -- NEW (Apache-2.0).
- `api/package.json` -- dependency `@xdbml/render` -> `^0.3.0`.
- `mcp/package.json` -- dependencies `@xdbml/parse` and `@xdbml/render` -> `^0.3.0`.

The playground is unchanged: it aliases the renderer/parser source directly, so
it has no npm dependency range to bump.

## 0. Prerequisites

```sh
npm whoami        # must be logged in with publish rights to the @xdbml scope; else: npm login
```

If you have 2FA-on-publish enabled, append `--otp=<code>` to each `npm publish`.

## 1. Publish @xdbml/parse first

The renderer depends on the parser, so the parser must be on npm at 0.3.0 before
the renderer's `^0.3.0` range can resolve.

```sh
cd parser
npm install
npm test
npm publish        # no --tag -> latest = 0.3.0; prepublishOnly builds dist/
npm view @xdbml/parse dist-tags     # expect: latest: 0.3.0, poc: 0.1.0-poc.1
```

## 2. Then @xdbml/render

```sh
cd ../renderer
npm install        # now pulls @xdbml/parse 0.3.0 from npm
npm run test:all
npm publish
npm view @xdbml/render dist-tags      # expect: latest: 0.3.0
npm view @xdbml/render dependencies   # expect: @xdbml/parse: ^0.3.0
```

## 3. (Optional) Deprecate the poc prereleases

```sh
npm deprecate "@xdbml/parse@0.1.0-poc.1"  "superseded by 0.3.0"
npm deprecate "@xdbml/render@0.1.0-poc.1" "superseded by 0.3.0"
npm deprecate "@xdbml/render@0.1.0-poc.2" "superseded by 0.3.0"
```

## 4. Redeploy the services so they pick up the prod packages

```sh
cd ../api && npm install && npm run deploy
cd ../mcp && npm install && npm run deploy
```

## Notes

- `author` is set to "Hackolade" in both package.json files. Change it before
  publishing if you prefer "xDBML contributors" or your own name.
- The api and mcp services keep their own (private, unpublished) version numbers;
  only their dependency ranges changed. If you want them aligned to 0.3.0 too,
  say so -- that also touches `SERVER_VERSION` in `mcp/src/index.ts`.
- Going to 0.x (not 1.0.0) is deliberate: under semver, 0.x still lets you make
  breaking changes in a minor bump while the spec evolves. Reserve 1.0.0 for the
  API-stability commitment alongside spec v1.0.
