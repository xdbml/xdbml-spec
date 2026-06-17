/**
 * Crow's-foot cardinality glyph at a relationship endpoint.
 *
 * Authored in local coordinates where (0,0) is the anchor point on the
 * entity edge and positive X extends AWAY from the entity along the line.
 * The caller supplies a transform (see `glyphTransform`) to orient the
 * glyph for left/top/bottom edges.
 *
 * Glyph layout (positive x = away from entity):
 *
 *     0    4     8         14
 *  ───●────║─────┤≻─────────○──── line
 *     anchor bar  crow's foot ring
 *
 *   - Bar at x=4: drawn when max=1 ("exactly one" cap).
 *   - Crow's foot, tips at x=1 and apex at x=8: drawn when max=*. The fan
 *     opens TOWARD the entity, per ER convention.
 *   - Ring at x=14: drawn when min=0 (optional participation).
 *
 * Constants match CrowFootGlyph.vue verbatim so the glyph is pixel-
 * identical to the playground's current rendering.
 */
import type { Cardinality } from './cardinality.ts';

const BAR_X = 4;
const BAR_HALF_HEIGHT = 5;

const FOOT_TIP_X = 1;   // tips touch the entity edge
const FOOT_APEX_X = 8;  // apex sits further along the line
const FOOT_SPREAD = 5;

const RING_CX = 14;
const RING_R = 2.5;

/**
 * Build the inner SVG primitives for a crow's-foot glyph (without the
 * wrapping <g>). Returns a string of <line>/<circle> elements positioned
 * in the glyph's local coordinate frame.
 */
export function crowFootPrimitives (card: Cardinality): string {
  const parts: string[] = [];

  // "Exactly one" perpendicular bar at BAR_X (closest to entity).
  if (card.max === 1) {
    parts.push(
      `<line x1="${BAR_X}" y1="${-BAR_HALF_HEIGHT}" x2="${BAR_X}" y2="${BAR_HALF_HEIGHT}" stroke-width="1.5" fill="none"/>`,
    );
  }

  // "Many" crow's foot: three lines fanning from an apex toward three
  // tips. The opening of the V faces the entity.
  if (card.max === '*') {
    parts.push(
      `<line x1="${FOOT_APEX_X}" y1="0" x2="${FOOT_TIP_X}" y2="${-FOOT_SPREAD}" stroke-width="1.5" fill="none"/>`,
      `<line x1="${FOOT_APEX_X}" y1="0" x2="${FOOT_TIP_X}" y2="0" stroke-width="1.5" fill="none"/>`,
      `<line x1="${FOOT_APEX_X}" y1="0" x2="${FOOT_TIP_X}" y2="${FOOT_SPREAD}" stroke-width="1.5" fill="none"/>`,
    );
  }

  // Optional-participation ring at RING_CX (further from entity). White
  // fill so it punches a hole through the line.
  if (card.min === 0) {
    parts.push(
      `<circle cx="${RING_CX}" cy="0" r="${RING_R}" fill="white" stroke-width="1.25"/>`,
    );
  }

  return parts.join('');
}

/**
 * Build a complete crow's-foot glyph group: the wrapping <g> (with stroke
 * color and the caller-supplied transform) around the primitives.
 */
export function crowFootGroup (card: Cardinality, color: string, transform: string): string {
  return (
    `<g stroke="${color}" fill="${color}" stroke-linecap="round" stroke-linejoin="round" transform="${transform}">` +
    crowFootPrimitives(card) +
    '</g>'
  );
}
