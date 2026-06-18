/**
 * Pure pan/zoom math for the interactive mount.
 *
 * The model matches the playground exactly: a scrolling viewport
 * (overflow:auto) whose inner <svg> is sized width*zoom by height*zoom,
 * with viewBox fixed at the diagram's natural dimensions. Panning is
 * native scroll; zooming rescales the <svg> and adjusts scroll so a chosen
 * anchor point stays put. These functions are framework-free and DOM-free
 * so they can be unit-tested directly.
 */

export const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export const ZOOM_MIN = ZOOM_LEVELS[0];
export const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

export function clampZoom (z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Next discrete level strictly above `z`, or null if already at the top. */
export function nextZoomLevel (z: number): number | null {
  for (const lvl of ZOOM_LEVELS) {
    if (lvl > z + 1e-6) return lvl;
  }
  return null;
}

/** Previous discrete level strictly below `z`, or null if at the bottom. */
export function prevZoomLevel (z: number): number | null {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_LEVELS[i] < z - 1e-6) return ZOOM_LEVELS[i];
  }
  return null;
}

export interface Scroll { scrollLeft: number; scrollTop: number; }

/**
 * Scroll positions that keep the canvas point currently under
 * (anchorX, anchorY) -- in viewport pixels -- fixed after zooming from
 * `oldZoom` to `newZoom`.
 *
 *   canvas point  cx = (anchorX + oldScrollLeft) / oldZoom
 *   after zoom we want  anchorX = cx * newZoom - newScrollLeft
 *   =>  newScrollLeft = cx * newZoom - anchorX
 */
export function anchoredScroll (
  oldZoom: number,
  newZoom: number,
  anchorX: number,
  anchorY: number,
  oldScrollLeft: number,
  oldScrollTop: number,
): Scroll {
  const cx = (anchorX + oldScrollLeft) / oldZoom;
  const cy = (anchorY + oldScrollTop) / oldZoom;
  return {
    scrollLeft: Math.max(0, cx * newZoom - anchorX),
    scrollTop: Math.max(0, cy * newZoom - anchorY),
  };
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number; }

/**
 * Bounding box of all containers and entities in a diagram. Refs are
 * excluded: their endpoints sit on entity edges, already covered.
 */
export function contentBox (
  containers: { bounds: { x: number; y: number; width: number; height: number } }[],
  entities: { bounds: { x: number; y: number; width: number; height: number } }[],
): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const fold = (b: { x: number; y: number; width: number; height: number }) => {
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.width > maxX) maxX = b.x + b.width;
    if (b.y + b.height > maxY) maxY = b.y + b.height;
  };
  for (const c of containers) fold(c.bounds);
  for (const e of entities) fold(e.bounds);
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { minX, minY, maxX, maxY };
}

export interface FitResult { zoom: number; scrollLeft: number; scrollTop: number; }

/**
 * Shape-dependent fit, ported from the playground:
 *
 *   - Strict fit (min of width/height ratios, 5% margin) when that yields
 *     a readable zoom (>= 50%).
 *   - Otherwise fit-to-width capped at 75%, with vertical scrolling, so
 *     tall schemas stay legible.
 *
 * Returns the clamped zoom and the scroll offsets that center the content
 * (top-anchored vertically when the content is taller than the viewport).
 */
export function computeFit (box: Box, viewportW: number, viewportH: number): FitResult | null {
  const contentW = box.maxX - box.minX;
  const contentH = box.maxY - box.minY;
  if (contentW === 0 || contentH === 0) return null;

  const margin = 0.95;
  const strict = Math.min(viewportW / contentW, viewportH / contentH) * margin;
  const fitZoom = strict >= 0.5
    ? strict
    : Math.min((viewportW / contentW) * margin, 0.75);
  const zoom = clampZoom(fitZoom);

  const scaledLeft = box.minX * zoom;
  const scaledTop = box.minY * zoom;
  const scaledW = contentW * zoom;
  const scaledH = contentH * zoom;

  return {
    zoom,
    scrollLeft: Math.max(0, scaledLeft - (viewportW - scaledW) / 2),
    scrollTop: scaledH > viewportH
      ? Math.max(0, scaledTop - 20)
      : Math.max(0, scaledTop - (viewportH - scaledH) / 2),
  };
}

/** Grid pitch for drop-snapping, matching auto-arrange's GRID. */
export const GRID = 20;
export const snapToGrid = (v: number): number => Math.round(v / GRID) * GRID;
