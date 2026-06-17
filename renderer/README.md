# @xdbml/render

A framework-free renderer for xDBML diagrams. It turns xDBML (source text,
a parsed document, or a prebuilt diagram model) into a self-contained SVG
string, with no DOM and no UI framework. The same code path is meant to
serve three consumers: the browser playground, a server-side rendering API,
and an MCP server.

This package is the single source of visual truth for xDBML diagrams. The
playground stops defining diagram shapes in its Vue components and renders
through this package instead, so the two cannot drift.

## Relationship to `@xdbml/parse`

`@xdbml/render` depends on `@xdbml/parse` for parsing. Only the type imports
are needed by the layout core (they are erased at runtime); the public
`renderToSVG` entry calls `parse`/`flatten` at runtime when given a source
string.

Because `tsc` and Node resolve real packages rather than Vite aliases, the
parser must be available as a built package (a `dist` with `index.js` and
`index.d.ts`), not only as source. During local development this package
resolves the dependency through `file:../parser`; the parser therefore needs
a real emit step before this package can build or test against it.

## Public API

```ts
import { renderToSVG } from '@xdbml/render';

// From source text (parsed and flattened internally):
const svg = renderToSVG(`
  xdbml: 0.3
  Table users { id int [pk]  name varchar }
  Table posts { id int [pk]  author int [ref: > users.id] }
`);

// From a parsed document or a prebuilt model:
import { parse, flatten } from '@xdbml/parse';
import { buildDiagram, serializeDiagram } from '@xdbml/render';
const doc = flatten(parse(source));
const svg2 = renderToSVG(doc);
const model = buildDiagram(doc);          // pure layout pass
const svg3 = serializeDiagram(model);     // model -> SVG string
```

`renderToSVG(input, options?)` accepts a source string, an `XDbmlDocument`,
or a `DiagramModel`, and returns an SVG string. Options:

- `collapsedPaths`: a set of `` `${entityId}::${path}` `` keys, the same
  shape `buildDiagram` consumes, controlling which nested rows are collapsed.
- `userPositions` / `edgeOffsets`: drag/auto-arrange position overlays,
  applied before serializing.
- `theme`: a partial override merged over the default theme.
- `background`: a solid background color (default transparent, matching the
  playground where the grid is a CSS backdrop).

Also re-exported: `buildDiagram`, `applyUserPositions`, `autoArrange`,
`serializeDiagram`, `defaultTheme`/`resolveTheme`, the layout constants, and
all model types (`DiagramModel`, `EntityLayout`, `RefLayout`, ...).

## Package layout

```
src/
  layout/      pure AST -> DiagramModel core (relocated from the playground)
    layout.ts        buildDiagram, applyUserPositions, model types, constants
    auto-arrange.ts  positioning strategies (relational, star)
  geometry/    pure path/glyph math, extracted from the .vue components
    cardinality.ts   operator + min..max -> Cardinality
    placement.ts     glyph transform, label anchor
    crowfoot.ts      crow's-foot glyph primitives
    ref-path.ts      anchor selection, self-reference loop, orthogonal routing
    edge-path.ts     property-bearing-edge connectors
  style/
    theme.ts         theme tokens; defaults reproduce the playground look
  svg/
    serialize.ts     DiagramModel -> SVG string (the serializer)
    util.ts          XML escaping
  index.ts     public API
```

The interactive browser mount (collapse/drag/pan-zoom and selection events)
will live in a separate optional entry, `@xdbml/render/interactive`, so Node
and server consumers never pull in DOM code. That is Phase 2, together with
swapping the playground's diagram pane onto this package.

## Using it from an AI assistant artifact

The package is plain ESM with no build-step-only features, so it can be
imported at runtime from a CDN inside an artifact iframe:

```html
<div id="diagram"></div>
<script type="module">
  import { renderToSVG } from 'https://esm.sh/@xdbml/render';
  document.getElementById('diagram').innerHTML = renderToSVG(`
    xdbml: 0.3
    Table users { id int [pk]  email varchar [unique] }
  `);
</script>
```

## Build and test

```
npm install        # resolves @xdbml/parse via file:../parser
npm run build       # tsc -> dist (js + d.ts)
npm run type-check  # tsc --noEmit
npm test            # render every example, assert invariants, manage goldens
```

The test harness (`test/run-tests.ts`) renders every file in `../examples`
to SVG, checks structural invariants (well-formedness, balanced tags, no
`NaN`, source/document/model output parity), asserts the self-reference loop
in example 07 and the composite PK/FK in example 08, and verifies collapse
removes child rows. It writes one golden SVG per example to `test/goldens/`;
open those in a browser to diff the rendering. Set `UPDATE_GOLDENS=1` to
accept output changes.

## License

Apache-2.0.
