/**
 * @xdbml/render/interactive -- the browser interactive mount.
 *
 * Kept separate from the package root so Node and server consumers (the
 * rendering API, the MCP server) never pull in DOM-touching code. Import
 * this entry only in a browser context.
 */
export { mount } from './mount.ts';
export type {
  MountInput,
  MountOptions,
  DiagramHandle,
  LayoutState,
} from './mount.ts';
export type { Selection } from './overlay.ts';
export {
  ZOOM_LEVELS,
  ZOOM_MIN,
  ZOOM_MAX,
  clampZoom,
  computeFit,
  contentBox,
  anchoredScroll,
} from './viewport.ts';
