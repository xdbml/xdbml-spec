/**
 * @xdbml/render -- a framework-free renderer for xDBML diagrams.
 *
 * Turns xDBML (source text, a parsed document, or a prebuilt diagram
 * model) into a self-contained SVG string. No DOM and no UI framework, so
 * the same code path serves a browser playground, a server-side rendering
 * API, and an MCP server.
 *
 * Public API:
 *
 *   renderToSVG(input, options?): string
 *     Render to an SVG string. `input` is one of:
 *       - a string of xDBML source (parsed and flattened internally),
 *       - a parsed `XDbmlDocument` (from `@xdbml/parse`),
 *       - a prebuilt `DiagramModel` (from `buildDiagram`).
 *     `options` may carry `collapsedPaths`, `userPositions`, `theme`, and
 *     a solid `background` color.
 *
 *   buildDiagram(doc, collapsedPaths?): DiagramModel
 *     The pure layout pass: an xDBML document in, a positioned diagram
 *     model out. Re-exported from the layout core.
 *
 *   applyUserPositions / autoArrange
 *     Position overlays (drag positions, auto-arrangement strategies),
 *     applied as transforms over a DiagramModel.
 *
 * The interactive browser mount (collapse/drag/pan-zoom, selection
 * events) lives in a separate optional entry, `@xdbml/render/interactive`,
 * so Node and server consumers never pull in DOM code.
 */
import { parse, flatten } from '@xdbml/parse';
import type { XDbmlDocument } from '@xdbml/parse';
// lz-string is CommonJS; a default import resolves to its exports object in
// Node-ESM, esbuild, and Vite alike, whereas a named import breaks under
// Node-ESM. Access the compressor as a property of the default export.
import lzString from 'lz-string';

import {
  applyUserPositions,
  buildDiagram,
  type CollapsedKey,
  type DiagramModel,
  type EdgeOffsets,
  type UserPositions,
} from './layout/layout.ts';
import { autoArrange, type ArrangeStrategy } from './layout/auto-arrange.ts';
import { serializeDiagram, type SerializeOptions } from './svg/serialize.ts';

export interface RenderOptions extends Omit<SerializeOptions, 'playgroundLink'> {
  /**
   * Automatic arrangement applied when no explicit `userPositions` are
   * given. Defaults to `'relational'`, matching the layout the playground
   * shows on first load. Pass `'star'` for a dimensional/star arrangement,
   * or `'none'` to keep the raw `buildDiagram` column layout.
   */
  arrange?: ArrangeStrategy | 'none';
  /** User-overridden entity positions to overlay before serializing. */
  userPositions?: UserPositions;
  /** Per-edge box offsets to overlay before serializing. */
  edgeOffsets?: EdgeOffsets;
  /**
   * When set, and the input is source text, the rendered SVG gains a small
   * "Open in xDBML playground" link in a footer band. Its target carries
   * the schema as a shared `#s=` hash (lz-string), the same format the
   * playground decodes, so a viewer can open the diagram and edit it.
   * Pass the playground base URL as a string, or `{ url, label }` to
   * override the link text. Ignored for a prebuilt document/model (there
   * is no source text to embed) and in `inner` mode.
   */
  playgroundLink?: string | { url: string; label?: string };
}

export type RenderInput = string | XDbmlDocument | DiagramModel;

/**
 * Render xDBML to an SVG string. Accepts source text, a parsed document,
 * or a prebuilt diagram model.
 */
export function renderToSVG (input: RenderInput, options: RenderOptions = {}): string {
  const model = toModel(input, options);

  const { playgroundLink, arrange: _a, userPositions: _u, edgeOffsets: _e, ...serialize } = options;
  const serializeOpts: SerializeOptions = { ...serialize };

  // The playground link can only be built when we hold the source text;
  // a prebuilt document or model has no text to embed in the share hash.
  if (playgroundLink && typeof input === 'string') {
    const url = typeof playgroundLink === 'string' ? playgroundLink : playgroundLink.url;
    const label = typeof playgroundLink === 'string'
      ? 'Open in xDBML playground'
      : (playgroundLink.label ?? 'Open in xDBML playground');
    serializeOpts.playgroundLink = { href: playgroundHref(url, input), label };
  }

  return serializeDiagram(model, serializeOpts);
}

/**
 * Build the playground deep link: the base URL plus a `#s=<compressed>`
 * share hash, matching the playground's own share format (lz-string
 * `compressToEncodedURIComponent`, decoded by its `decodeShareHash`).
 */
function playgroundHref (url: string, source: string): string {
  const sep = url.includes('#') ? '&' : '#';
  return `${url}${sep}s=${lzString.compressToEncodedURIComponent(source)}`;
}

function toModel (input: RenderInput, options: RenderOptions): DiagramModel {
  if (isModel(input)) return input;

  const doc: XDbmlDocument = typeof input === 'string'
    ? flatten(parse(input))
    : flatten(input);

  const collapsed = options.collapsedPaths as ReadonlySet<CollapsedKey> | undefined;
  const base = buildDiagram(doc, collapsed ?? new Set());

  // Explicit positions win, mirroring the playground's saved-layout path:
  // a caller (or a restored layout) that supplies coordinates takes
  // precedence over automatic arrangement.
  if (options.userPositions || options.edgeOffsets) {
    return applyUserPositions(base, options.userPositions ?? new Map(), options.edgeOffsets);
  }

  // Otherwise apply an automatic arrangement so a fresh render lands on a
  // sensible layout with zero configuration -- the same relational pass
  // the playground runs on first load. `applyUserPositions` then tightens
  // the canvas bounds to the arranged content (the "fit").
  const strategy = options.arrange ?? 'relational';
  if (strategy === 'none') return base;
  return applyUserPositions(base, autoArrange(base, strategy));
}

/**
 * Distinguish a prebuilt DiagramModel from an XDbmlDocument at runtime.
 * The model has positioned-output arrays and canvas dimensions; the
 * document has a `statements` list.
 */
function isModel (input: RenderInput): input is DiagramModel {
  if (typeof input === 'string' || input === null || typeof input !== 'object') return false;
  return 'entities' in input && 'containers' in input && 'width' in input && 'height' in input;
}

/* ----------------------------------------------------------- re-exports */

export {
  applyUserPositions,
  buildDiagram,
  makeCollapsedKey,
  readableInk,
  // layout constants, useful to consumers measuring or theming
  ENTITY_WIDTH,
  ENTITY_HEADER_HEIGHT,
  ROW_HEIGHT,
  ENTITY_GAP_Y,
  CONTAINER_PADDING,
  CONTAINER_HEADER_HEIGHT,
  CONTAINER_GAP_X,
  CANVAS_MARGIN,
  EDGE_HEADER_COLOR,
  EDGE_COLLAPSED_WIDTH,
} from './layout/layout.ts';

export type {
  DiagramModel,
  ContainerLayout,
  EntityLayout,
  EdgeLayout,
  FieldLayout,
  FieldFlags,
  RefLayout,
  FieldLocator,
  Rect,
  CollapsedKey,
  UserPositions,
  EdgeOffsets,
} from './layout/layout.ts';

export { autoArrange, type ArrangeStrategy } from './layout/auto-arrange.ts';

export { serializeDiagram, type SerializeOptions } from './svg/serialize.ts';
export { defaultTheme, darkTheme, resolveTheme, type Theme, type DeepPartial } from './style/theme.ts';
