# xDBML Playground

Browser playground for xDBML. Edit on the left, see the diagram on the right.

Live at **<https://xdbml.org/playground/>**.

This is the visual companion to the [`/parser/`](../parser) package. The
parser is the foundation; the playground is what makes it tangible:
paste in an xDBML schema, watch the entities and foreign-key lines
appear, edit fields, see the diagram update live.

## Status

Proof of concept. The playground reads the canonical example files
from [`/examples/`](../examples) and the canonical logo assets from
[`/logo/`](../logo) -- no duplication of source content lives inside
this directory.

**What works:**

- **Editor pane** -- Monaco with full xDBML syntax highlighting
  (containers, entity keyword synonyms, structural type expressions,
  polymorphism keywords, BSON types, the `[*]` array wildcard, `~`
  partial injection, the `xdbml:` and `experimental:` directives, and
  the full settings vocabulary). Parse errors show as red squiggles via
  Monaco markers with line-and-column accuracy.

- **Diagram pane** -- SVG renderer driven by the parsed AST:
  - **Containers** as dashed rounded rectangles with a colored header
    band keyed to their `target` (Oracle red, MongoDB green, PostgreSQL
    blue, Snowflake cyan, Neo4j blue, ...). Polyglot schemas read
    instantly.
  - **Entities** as cards with header, field rows, type labels, and
    small badge circles for PK, FK, unique, not-null.
    Collection/Record entities (document-store synonyms) get a darker
    blue header so MongoDB-style entities are visually distinct from
    SQL-style ones even outside a container.
  - **Nested fields with indentation and collapsible parents.** Object,
    array, oneOf/anyOf/allOf, json-with-schema, map, set, and tuple
    types expand into deeper rows with carets (▾ / ▸) that toggle
    children. Synthetic intermediate rows (array element names like
    `[item]`, oneOf alternative names like `{card}`) are styled in
    italic gray so they read as structural scaffolding. Collapse state
    persists in localStorage.
  - **Refs** as cubic Bezier curves between source and target field
    rows, with cardinality endpoints (`1`, `*`, `0..1`, `1..*`)
    rendered as labels near each terminus. Unresolved Refs are counted
    in a warning banner at the bottom.

- **Resizable split** between editor and diagram, position persisted.
- **localStorage persistence** of editor content and collapse choices.
- **Header bar** with the official xDBML wordmark linking back to
  xdbml.org, plus placeholder buttons for Examples, Import, Export,
  Share, Help (each shows a "coming soon" toast for now).

**Not yet wired up:**

- Examples menu (real picker, the buttons are placeholders for now)
- Edges as labeled lines (currently only Refs render)
- Named Types side panel
- Drag-to-reposition (positions are pure layout output)
- Pan/zoom (canvas scrolls within its pane)
- Field-level inspector when clicking a row
- Import, Export to DBML/SVG/PNG, URL-share
- Diagnostics panel

## Running it locally

Requires Node.js 22+ (the parser uses native strip-types support).

### Just the playground

```bash
cd playground
npm install
npm run dev     # http://localhost:3001/playground/
```

Vite serves the playground at `localhost:3001/playground/` (note the
subpath -- it mirrors the production URL shape `xdbml.org/playground/`).

### Whole site (docs + playground)

From the repo root:

```bash
npm install                # installs VitePress in the root
cd playground && npm install   # installs playground deps separately
cd ..
npm run docs:dev           # http://localhost:5173/
```

This serves the VitePress docs, but does *not* serve the playground
live -- the playground would be embedded as a static asset built into
`/public/playground/`. To see the integrated result, do a build first:

```bash
npm run docs:build         # builds playground, then docs (with playground inside)
npm run docs:preview       # http://localhost:4173/
# Visit http://localhost:4173/playground/ to see the playground.
```

The `docs:build` script runs the playground build first
(`cd playground && npm run build`), then copies `playground/dist/` into
`/public/playground/` so VitePress publishes it as a static asset,
then runs `vitepress build`.

## How asset deduplication works

The playground reads from canonical sources elsewhere in the repo:

- **Logos** (`xdbml-logo.svg` etc.) -- the four official SVGs live at
  [`/logo/`](../logo). The script
  [`scripts/prepare-assets.mjs`](./scripts/prepare-assets.mjs) copies
  them into `playground/public/` at build time. The copies are
  gitignored.

- **Example schemas** (`01-blog.xdbml` etc.) -- the canonical files
  live at [`/examples/`](../examples). The playground's
  [`src/services/sample-content.ts`](./src/services/sample-content.ts)
  imports them via Vite's `?raw` suffix, which inlines the file
  contents as TypeScript string constants at build time. No copies,
  no generated files.

Adding a new example: add the `.xdbml` file in `/examples/`, register
it in `/scripts/examples-manifest.mjs` (drives the docs site), and add
the matching import + entry in `playground/src/services/sample-content.ts`.
A future improvement is to have the playground read the manifest
directly so this last step happens automatically.

## How it's wired

```
┌──────────────────────────────────────────────────┐
│  App.vue                                         │
│  ┌────────────────────────────────────────────┐  │
│  │  HeaderBar  (xDBML wordmark, placeholders) │  │
│  └────────────────────────────────────────────┘  │
│  ┌─────────────────┬─────┬───────────────────┐   │
│  │                 │     │                   │   │
│  │  XdbmlEditor    │ ::: │   DiagramCanvas   │   │
│  │  (Monaco)       │     │   (SVG)           │   │
│  │                 │     │                   │   │
│  └─────────────────┴─────┴───────────────────┘   │
└──────────────────────────────────────────────────┘
```

State flows through Pinia's `parserStore`:

```
user types in Monaco
  -> XdbmlEditor v-models content into parserStore
  -> parserStore.content changes
  -> 250ms debounced reparse:
      - tokenize() produces tokens
      - parse() produces ast (or throws -> single ParserError diagnostic)
  -> reactive state updates: tokens, ast, errors
  -> XdbmlEditor.watch(errors) -> setMonacoMarkers (red squiggles)
  -> DiagramCanvas.computed(buildDiagram(ast, collapsedPaths)) -> SVG re-renders

user clicks a caret on a parent row
  -> EntityCard emits toggle-path(path)
  -> DiagramCanvas adds/removes the path in collapsedPaths
  -> persisted to localStorage
  -> buildDiagram recomputes -> SVG re-renders without the collapsed children
```

`@xdbml/parse` is consumed through a Vite alias to
`../parser/src/index.ts`, so changes to the parser are picked up by
the dev server without publishing or building. The same alias is
mirrored in `tsconfig.json` so `vue-tsc` resolves the same path during
type-checking.

## Files

```
playground/
├── public/                       (gitignored; populated by prepare-assets.mjs)
├── scripts/
│   └── prepare-assets.mjs        (copies /logo/*.svg into public/)
├── src/
│   ├── components/
│   │   ├── diagram/
│   │   │   ├── DiagramCanvas.vue       (right pane SVG canvas + collapse state)
│   │   │   ├── EntityCard.vue          (one entity card with nested rows)
│   │   │   ├── RefLine.vue             (one Ref curve)
│   │   │   └── layout.ts               (pure AST -> positioned DiagramModel)
│   │   ├── editor/
│   │   │   ├── XdbmlEditor.vue         (Monaco wrapper)
│   │   │   ├── xdbml_language.ts       (Monaco language + theme)
│   │   │   └── xdbml_markers.ts        (parser errors -> Monaco markers)
│   │   └── header/
│   │       ├── HeaderBar.vue           (top bar with wordmark + buttons)
│   │       └── HeaderButton.vue        (placeholder button)
│   ├── services/
│   │   └── sample-content.ts           (imports /examples/*.xdbml as ?raw)
│   ├── stores/
│   │   └── parserStore.ts              (Pinia store, debounced parse)
│   ├── styles/main.css
│   ├── types/index.ts
│   ├── utils/logger.ts
│   ├── App.vue
│   └── main.ts
├── env.d.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## License

Apache License 2.0, matching the rest of `xdbml-spec`.
