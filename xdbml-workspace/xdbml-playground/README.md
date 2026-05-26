# @xdbml/playground -- proof-of-concept

Browser playground for xDBML. Edit on the left, see the diagram on the right.

This is the visual companion to [@xdbml/parse](../xdbml-parse). The parser
is the foundation; the playground is what makes it tangible: paste in an
xDBML schema, watch the entities and foreign-key lines appear, edit
fields, see the diagram update live.

## Status

Proof of concept. **What works in this build:**

- **Editor pane** -- Monaco with full xDBML syntax highlighting (containers,
  entity keyword synonyms, structural type expressions, polymorphism
  keywords, BSON types, the `[*]` array wildcard, `~` partial injection,
  the `xdbml:` and `experimental:` directives, and the full settings
  vocabulary). Parse errors show as red squiggles via Monaco markers
  with line-and-column accuracy.

- **Diagram pane** -- SVG renderer driven by the parsed AST:
  - **Containers** as dashed rounded rectangles with a colored header band
    keyed to their `target` (Oracle red, MongoDB green, PostgreSQL blue,
    Snowflake cyan, Neo4j blue, and so on). Polyglot schemas read
    instantly.
  - **Entities** as cards with header, field rows, type labels, and small
    badge circles for PK (yellow `P`), FK (cyan `F`), unique (purple `U`),
    not-null (red `!`). Collection/Record entities (document-store
    synonyms) get a darker blue header so MongoDB-style entities are
    visually distinct from SQL-style ones even outside a container.
  - **Nested fields with indentation and collapsible parents.** Object,
    array, oneOf/anyOf/allOf, json-with-schema, map, set, and tuple
    types expand into deeper rows. Each parent row has a caret (▾ / ▸)
    that toggles its children. Synthetic intermediate rows (array
    element names like `[item]`, oneOf alternative names like `{card}`)
    are styled in italic gray with a lighter background so they read as
    structural scaffolding rather than user-named fields. Subtle vertical
    guide lines at each indent level help users trace which parent a
    deeply nested row belongs to. Collapse state persists in
    localStorage, scoped per `entityId::path` so two same-named
    structural fields in different entities collapse independently.
  - **Refs** as cubic Bezier curves between source and target field rows,
    with cardinality endpoints (`1`, `*`, `0..1`, `1..*`) rendered as
    labels near each terminus. Unresolved Refs (where the path doesn't
    match a declared entity) are counted in a small warning banner at the
    bottom of the canvas.

- **Resizable split** between editor and diagram, position persisted.

- **localStorage persistence** of the editor content -- reload preserves
  your work, plus your collapse choices.

- **Header bar** with the official xDBML wordmark (Apache-2.0 from
  `xdbml-spec/logo/xdbml-logo.svg`), a "Playground" section label, and
  placeholder buttons for Examples, Import, Export, Share, Help. Each
  button shows a "coming soon" toast for now; the visual footprint is
  stable so the buttons can be wired up later without re-jiggling the
  layout. Clicking the wordmark navigates to xdbml.org.

**What's not yet wired up:**

- Named Types panel (the side strip showing reusable types)
- Edges as labeled lines (currently only Refs render)
- Drag-to-reposition (positions are pure layout output for now)
- Pan/zoom (the canvas scrolls within its pane)
- Field-level inspector when clicking a row
- Examples menu, Import, Export to DBML/SVG/PNG, URL-share
- Diagnostics panel (errors only appear as Monaco squiggles)

All of the above are additive to this scaffold rather than rewrites.
The layout function is pure and easy to extend; the SVG renderer
already separates containers, entities, and refs into independent
component layers so adding edges or types is a sibling component.

## Running it

Requires Node.js 22+ (for the parser's strip-types-friendly source).

```bash
# From the workspace root:
cd xdbml-playground
npm install
npm run dev    # http://localhost:3001
```

For a production build:

```bash
npm run build  # output in dist/
npm run preview
```

The build emits ~3.4 MB of JS uncompressed (~890 KB gzipped). About 95%
of that is Monaco -- it ships every language's tokenizer by default. A
future build-size optimization will use Monaco's worker chunks or
filter the language list to just what we need. Not a blocker for the
PoC.

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

The diagram is recomputed on every AST or collapse-state change because
`buildDiagram` is pure and cheap (~kilobyte AST, microsecond layout).
No memoization yet because no measurements yet show it's worth the
complexity.

## Files

```
xdbml-playground/
├── public/
│   ├── xdbml-favicon.svg        (official, Apache-2.0)
│   ├── xdbml-logo.svg           (official wordmark, Apache-2.0)
│   ├── xdbml-logo-dark.svg      (dark-mode variant, Apache-2.0)
│   └── xdbml-mark.svg           (icon-only mark, Apache-2.0)
├── src/
│   ├── components/
│   │   ├── diagram/
│   │   │   ├── DiagramCanvas.vue       (right-pane SVG canvas + collapse state)
│   │   │   ├── EntityCard.vue          (one entity card with nested rows)
│   │   │   ├── RefLine.vue             (one Ref curve)
│   │   │   └── layout.ts               (pure AST -> positioned DiagramModel,
│   │   │                                recursively flattens nested types
│   │   │                                with indent/path/hasChildren rows)
│   │   ├── editor/
│   │   │   ├── XdbmlEditor.vue         (Monaco wrapper)
│   │   │   ├── xdbml_language.ts       (Monaco language + theme registration)
│   │   │   └── xdbml_markers.ts        (parser errors -> Monaco markers)
│   │   └── header/
│   │       ├── HeaderBar.vue           (top bar with xDBML wordmark + buttons)
│   │       └── HeaderButton.vue        (placeholder button)
│   ├── services/
│   │   └── sample-content.ts           (default startup document)
│   ├── stores/
│   │   └── parserStore.ts              (Pinia store, debounced parse)
│   ├── styles/main.css                 (Tailwind + small global rules)
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

The official xDBML logo assets are bundled with the playground under
`public/` and licensed Apache-2.0 (same as the rest of the project).
The wordmark in the header links back to xdbml.org.

`@xdbml/parse` is consumed through a Vite alias to `../xdbml-parse/src/index.ts`,
so changes to the parser are picked up by the dev server without
publishing or building. The same alias is mirrored in `tsconfig.json`
so `vue-tsc` resolves the same path during type-checking.

## Next steps (suggested order)

1. **Field-row anchors for refs.** Currently the line lands at the field
   row's y-coordinate, but doesn't visually attach to the field's
   left/right edge with a small connector stub. dbdiagram.io draws a
   short horizontal line out of the row before curving. Easy upgrade.
2. **Edges as a distinct line style** (dashed or thicker) with the edge
   name as a pill on the line. The AST already has EdgeDeclaration.
3. **Named Types side panel** -- a column on the right showing each
   declared Type as a small card, with a visual indicator on entity
   fields that reference them.
4. **Drag-to-reposition entities**, positions persisted to localStorage
   alongside the content.
5. **Pan + zoom on the canvas** -- a fairly small amount of code with
   mouse-wheel + drag.
6. **Inspector panel** opened by clicking a row, showing the full type
   expression, all settings (validation constraints, AI-readiness
   metadata, custom `x_*` properties), and the Note text if any. The
   inspector is where the rich per-field detail belongs -- the diagram
   should stay scannable.
7. **Wire up the Header buttons:** Examples menu (real picker),
   Import (paste-DBML modal), Export (download .xdbml, .svg, .png),
   Share (URL with content compressed into a query parameter).
8. **Diagnostics panel** at the bottom showing errors + warnings (when
   the semantic-analysis pass lands).
9. Monaco bundle size optimization (chunk just the language services
   we need).

## License

Apache License 2.0, matching `@xdbml/parse` and the xDBML spec.


## Running it

Requires Node.js 22+ (for the parser's strip-types-friendly source).

```bash
# From the workspace root:
cd xdbml-playground
npm install
npm run dev    # http://localhost:3001
```

For a production build:

```bash
npm run build  # output in dist/
npm run preview
```

The build emits ~3.4 MB of JS uncompressed (~890 KB gzipped). About 95%
of that is Monaco -- it ships every language's tokenizer by default. A
future build-size optimization will use Monaco's worker chunks or
filter the language list to just what we need. Not a blocker for the
PoC.

## How it's wired

```
┌──────────────────────────────────────────────────┐
│  App.vue                                         │
│  ┌────────────────────────────────────────────┐  │
│  │  HeaderBar  (logo, placeholder buttons)    │  │
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
  -> DiagramCanvas.computed(buildDiagram(ast)) -> SVG re-renders
```

The diagram is recomputed on every AST change because `buildDiagram` is
pure and cheap (~kilobyte AST, microsecond layout). No memoization yet
because no measurements yet show it's worth the complexity.

## Files

```
xdbml-playground/
├── public/
│   └── xdbml-favicon.svg
├── src/
│   ├── components/
│   │   ├── diagram/
│   │   │   ├── DiagramCanvas.vue       (right-pane SVG canvas)
│   │   │   ├── EntityCard.vue          (one entity card)
│   │   │   ├── RefLine.vue             (one Ref curve)
│   │   │   └── layout.ts               (pure AST -> positioned DiagramModel)
│   │   ├── editor/
│   │   │   ├── XdbmlEditor.vue         (Monaco wrapper)
│   │   │   ├── xdbml_language.ts       (Monaco language + theme registration)
│   │   │   └── xdbml_markers.ts        (parser errors -> Monaco markers)
│   │   └── header/
│   │       ├── HeaderBar.vue           (top bar with logo and buttons)
│   │       └── HeaderButton.vue        (placeholder button)
│   ├── services/
│   │   └── sample-content.ts           (default startup document)
│   ├── stores/
│   │   └── parserStore.ts              (Pinia store, debounced parse)
│   ├── styles/main.css                 (Tailwind + small global rules)
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

`@xdbml/parse` is consumed through a Vite alias to `../xdbml-parse/src/index.ts`,
so changes to the parser are picked up by the dev server without
publishing or building. The same alias is mirrored in `tsconfig.json`
so `vue-tsc` resolves the same path during type-checking.

## Next steps (suggested order)

1. **Field-row anchors for refs.** Currently the line lands at the field
   row's y-coordinate, but doesn't visually attach to the field's
   left/right edge with a small connector stub. dbdiagram.io draws a
   short horizontal line out of the row before curving. Easy upgrade.
2. **Edges as a distinct line style** (dashed or thicker) with the edge
   name as a pill on the line. The AST already has EdgeDeclaration.
3. **Named Types side panel** -- a column on the right showing each
   declared Type as a small card, with a visual indicator on entity
   fields that reference them.
4. **Drag-to-reposition entities**, positions persisted to localStorage
   alongside the content.
5. **Pan + zoom on the canvas** -- a fairly small amount of code with
   mouse-wheel + drag.
6. **Inspector panel** opened by clicking a row, showing the full type
   expression, all settings (validation constraints, AI-readiness
   metadata, custom `x_*` properties), and the Note text if any.
7. **Wire up the Header buttons:** Examples menu (real picker),
   Import (paste-DBML modal), Export (download .xdbml, .svg, .png),
   Share (URL with content compressed into a query parameter).
8. **oneOf / anyOf / allOf rendering** -- when a field's type is a
   polymorphism, render an expandable sub-card showing each
   alternative.
9. **Diagnostics panel** at the bottom showing errors + warnings (when
   the semantic-analysis pass lands).
10. Monaco bundle size optimization (chunk just the language services
    we need).

## License

Apache License 2.0, matching `@xdbml/parse` and the xDBML spec.
