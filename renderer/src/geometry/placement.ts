/**
 * Shared endpoint-placement helpers used by both Ref lines and Edge
 * connectors. Extracted verbatim from the playground components so the
 * glyph orientation rule lives in exactly one place.
 */

export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Transform that places a crow's-foot glyph at the anchor and orients its
 * "away from entity" axis correctly. The glyph is authored with (0,0) at
 * the anchor and positive X pointing AWAY from the entity:
 *
 *   - right anchor:  positive X points right (no rotation)
 *   - left anchor:   positive X points left  (mirror via scale(-1,1))
 *   - bottom anchor: positive X points down  (rotate 90 CW)
 *   - top anchor:    positive X points up    (rotate 90 CCW)
 */
export function glyphTransform (side: Side, x: number, y: number): string {
  switch (side) {
    case 'right':  return `translate(${x} ${y})`;
    case 'left':   return `translate(${x} ${y}) scale(-1 1)`;
    case 'bottom': return `translate(${x} ${y}) rotate(90)`;
    case 'top':    return `translate(${x} ${y}) rotate(-90)`;
  }
}

export function labelAnchor (side: Side): 'start' | 'end' | 'middle' {
  return side === 'left' ? 'end' : 'start';
}
