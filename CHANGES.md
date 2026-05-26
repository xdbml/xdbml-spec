# Integration changes against `main`

This zip contains the spec repo (`xdbml-spec`) integrated with the
playground at `/playground/`, deploying to `xdbml.org/playground/` via
the existing GitHub Pages workflow.

**Baseline:** commit `dd724c7` ("rename xdbml-parse to parser") on `main`.

## New files

- `playground/` -- entire directory tree (Vue 3 + Vite + Monaco playground)
  - `playground/README.md`
  - `playground/package.json`
  - `playground/package-lock.json` (committed; required by `npm ci` in CI)
  - `playground/tsconfig.json`
  - `playground/vite.config.ts`
  - `playground/env.d.ts`
  - `playground/index.html`
  - `playground/.gitignore`
  - `playground/scripts/prepare-assets.mjs`
  - `playground/src/App.vue`
  - `playground/src/main.ts`
  - `playground/src/styles/main.css`
  - `playground/src/types/index.ts`
  - `playground/src/utils/logger.ts`
  - `playground/src/services/sample-content.ts`     (imports from `/examples/`)
  - `playground/src/stores/parserStore.ts`
  - `playground/src/components/header/HeaderBar.vue`     (uses /logo/ assets)
  - `playground/src/components/header/HeaderButton.vue`
  - `playground/src/components/editor/XdbmlEditor.vue`
  - `playground/src/components/editor/xdbml_language.ts`
  - `playground/src/components/editor/xdbml_markers.ts`
  - `playground/src/components/diagram/DiagramCanvas.vue`
  - `playground/src/components/diagram/EntityCard.vue`
  - `playground/src/components/diagram/RefLine.vue`
  - `playground/src/components/diagram/layout.ts`
- `scripts/prepare-playground.mjs` -- mirrors `prepare-examples.mjs`;
  builds the playground and stages its dist into `/public/playground/`.

## Modified files

- `.github/workflows/deploy.yml` -- adds an "Install playground deps"
  step and extends `cache-dependency-path` to include the playground's
  `package-lock.json`. The build step is unchanged (still
  `npm run docs:build`), which now invokes the playground build via the
  updated `package.json` script.
- `.gitignore` -- adds `/public/playground/`, `/playground/dist/`,
  `/playground/.vite/`, `/playground/public/xdbml-*.svg` (all
  build-time artifacts).
- `.vitepress/config.ts`:
  - Adds `Playground` to the top nav, linking to `/playground/`.
  - Adds `playground/**` and `parser/**` to `srcExclude` so VitePress
    doesn't try to render their READMEs and source files as docs
    pages.
- `package.json`:
  - Adds `build:playground` script (cd into playground, install, build).
  - Adds `prepare:playground` script (invokes `scripts/prepare-playground.mjs`).
  - `docs:build` now runs `prepare:examples` and `prepare:playground`
    before `vitepress build`.

## Removed files

- `xdbml-workspace/` -- the orphaned workspace tree accidentally
  committed in `b6a9066`. This was a duplicate of `parser/` (under its
  pre-rename name `xdbml-parse`) plus an old copy of the playground.
  All content is superseded by `parser/` and `playground/`. The
  zip does not contain this directory.

## No changes to

- `examples/*.xdbml` -- canonical sample sources, read directly by the
  playground via Vite's `?raw` imports.
- `logo/*.svg` -- canonical logo sources, copied into the playground's
  `public/` at build time by `playground/scripts/prepare-assets.mjs`.
- `parser/` -- the parser package is consumed via a Vite alias to
  `../parser/src/index.ts`; no copies, no publishing required.
- `spec/`, `grammar/`, `404.md`, all top-level markdown -- untouched.
- `public/CNAME` -- still `xdbml.org`. No DNS change needed for the
  subpath deployment.

## DNS / domains

No DNS change is required. The playground deploys as a subpath
(`xdbml.org/playground/`) of the existing GitHub Pages site, using the
same `xdbml.org` custom domain already configured in
`public/CNAME` and the GitHub Pages settings.

If you ever want to move the playground to a separate subdomain
(`playground.xdbml.org`), the Route 53 record would be:

```
Type:    CNAME
Name:    playground.xdbml.org
Value:   xdbml.github.io
TTL:     300
```

(And the playground would need to be hosted in a separate repo, since
GitHub Pages allows only one custom domain per repo.)

## Testing locally

```bash
# 1) Install root and playground deps (one-time)
npm install
cd playground && npm install && cd ..

# 2) Quick check: parser tests still pass
cd parser && node --experimental-strip-types test/run-tests.ts && cd ..
# Expected: "28 passed, 0 failed"

# 3) Run the playground standalone
cd playground && npm run dev
# Opens http://localhost:3001/playground/
# (note the /playground/ subpath -- mirrors production URL shape)

# 4) Build the integrated site
npm run docs:build

# 5) Preview the integrated site
npm run docs:preview
# Browse http://localhost:4173/ for docs, http://localhost:4173/playground/ for the app.
```

The deploy workflow (`.github/workflows/deploy.yml`) runs the same
`docs:build` command on push to main, then publishes to GitHub Pages.

## Verifying the integration

- `npm run docs:build` should produce:
  - `.vitepress/dist/index.html` (docs landing page, with "Playground"
    in the top nav)
  - `.vitepress/dist/playground/index.html` (the playground app)
  - `.vitepress/dist/playground/assets/*` (Monaco + Vue bundle)
  - `.vitepress/dist/playground/xdbml-*.svg` (the four logo variants
    copied from `/logo/`)
- The build pipeline order is:
  1. `prepare:examples` -- generates viewing pages and copies .xdbml
     downloads into `/public/examples/`.
  2. `prepare:playground` -- installs playground deps if needed,
     builds the playground, stages its dist into `/public/playground/`.
  3. `vitepress build` -- builds the docs site, which picks up
     everything under `/public/` as static assets.
