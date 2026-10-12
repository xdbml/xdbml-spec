/**
 * Text metrics for the serializer and the layout.
 *
 * SVG offers no measurement at serialization time, and the renderer runs in
 * Node as well as in the browser, so widths are estimated from character
 * class. The layout uses the same estimate to wrap the text of a sticky
 * note (spec §19.6), so the lines it breaks fit the box the serializer
 * draws.
 */

/** Font size of a field name in an entity box, in px. */
export const FIELD_FONT_SIZE = 12;
/** Font size of an entity's name in its header band, in px. */
export const ENTITY_NAME_FONT_SIZE = 13;

/**
 * Approximate advance width of one character at 12px in the sans stack.
 *
 * A flat per-character average is not good enough here: it
 * over-spaces narrow words like `street` and under-spaces wide ones like
 * `customerName`, and a badge placed from an under-estimate lands on top of
 * the name. Grouping by class keeps the error inside a couple of pixels for
 * ordinary identifiers.
 */
export function charWidth12 (ch: string): number {
  if (ch === ' ') return 3.4;
  if ('ijlI|!.,:;\'`'.includes(ch)) return 3.0;
  if ('ftr()[]{}/\\-'.includes(ch)) return 4.2;
  if (ch === 'm' || ch === 'M') return 10.0;
  if (ch === 'w' || ch === 'W') return 9.3;
  if (ch >= 'A' && ch <= 'Z') return 8.0;
  return 6.7;
}

/** Estimated width of a string in the sans stack at the given size/weight. */
export function measureText (s: string, size = 12, weight = 400): number {
  let w = 0;
  for (const ch of s) w += charWidth12(ch);
  return w * (size / 12) * (weight >= 600 ? 1.05 : 1);
}

/**
 * Estimated width of a string in the monospace stack. Monospace glyphs
 * advance about 0.6 em.
 */
export function measureMono (s: string, size = 12): number {
  return [...s].length * size * 0.6;
}
