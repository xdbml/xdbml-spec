<template>
  <g v-if="path">
    <!-- Wide invisible hit-area over the path. Catches clicks even
         when the user doesn't land exactly on the 1.5 px stroke.
         Drawn BEFORE the visible path so SVG painter's order puts the
         visible line on top. -->
    <path
      :d="path.d"
      fill="none"
      stroke="transparent"
      stroke-width="14"
      style="cursor: pointer;"
      @click.stop="$emit('select')"
    />
    <!-- Visible line. Stroke thickens and turns blue when selected. -->
    <path
      :d="path.d"
      fill="none"
      :stroke="lineColor"
      :stroke-width="isSelected ? 2.5 : 1.5"
      style="pointer-events: none;"
    />

    <!-- Source endpoint: crow's-foot glyph + cardinality text. -->
    <g style="pointer-events: none;">
      <g :transform="glyphTransform(path.startSide, path.startX, path.startY)">
        <CrowFootGlyph
          :min="sourceCardinality.min"
          :max="sourceCardinality.max"
          :color="lineColor"
        />
      </g>
      <text
        v-if="sourceLabel"
        :x="labelX(path.startSide, path.startX)"
        :y="labelY(path.startSide, path.startY)"
        font-size="9"
        font-weight="500"
        :fill="textColor"
        :text-anchor="labelAnchor(path.startSide)"
      >{{ sourceLabel }}</text>
    </g>

    <!-- Target endpoint: same. -->
    <g style="pointer-events: none;">
      <g :transform="glyphTransform(path.endSide, path.endX, path.endY)">
        <CrowFootGlyph
          :min="targetCardinality.min"
          :max="targetCardinality.max"
          :color="lineColor"
        />
      </g>
      <text
        v-if="targetLabel"
        :x="labelX(path.endSide, path.endX)"
        :y="labelY(path.endSide, path.endY)"
        font-size="9"
        font-weight="500"
        :fill="textColor"
        :text-anchor="labelAnchor(path.endSide)"
      >{{ targetLabel }}</text>
    </g>
  </g>
</template>

<script setup lang="ts">
/**
 * One Ref line between two entity field rows.
 *
 * Path construction:
 *
 *   1. Pick an anchor edge on each entity based on the two entities'
 *      relative positions:
 *
 *        - If their X projections don't overlap (the entities sit
 *          side-by-side), use their left/right edges. The anchor's Y
 *          coordinate is the row of the named field, preserving the
 *          "which field connects" visual cue.
 *
 *        - If their X projections do overlap (the entities are
 *          stacked vertically), use their top/bottom edges. The
 *          anchor's X coordinate is the entity's horizontal center;
 *          a stacked layout doesn't expose individual field rows on
 *          a horizontal edge, so the field-level cue gracefully
 *          degrades to an entity-level cue.
 *
 *   2. Route the line orthogonally between the two anchors:
 *
 *        - Side-to-side (left/right edges): three segments,
 *          horizontal-vertical-horizontal, with the V segment at the
 *          midpoint X between the two anchors.
 *
 *        - Top/bottom edges: three segments, vertical-horizontal-
 *          vertical, with the H segment at the midpoint Y.
 *
 * Cardinality is encoded at each endpoint using the standard ER
 * "crow's foot" notation. The crow's-foot glyph orients automatically:
 * mirrored for left anchors and rotated 90 degrees for top/bottom
 * anchors, so the "opening" of the foot always faces the entity,
 * regardless of edge.
 *
 * Selection:
 *   - `is-selected` prop: when true, line + glyphs turn blue and the
 *     stroke thickens.
 *   - A transparent stroke-14 path sits over the visible line to
 *     catch clicks more easily.
 */
import { computed } from 'vue';

import type { EntityLayout, RefLayout } from './layout';
import { ENTITY_HEADER_HEIGHT, ROW_HEIGHT } from './layout';
import CrowFootGlyph from './CrowFootGlyph.vue';

const props = defineProps<{
  refLayout: RefLayout;
  entities: EntityLayout[];
  isSelected: boolean;
}>();

defineEmits<{
  select: [];
}>();

/* -------------------------------------------------------------------------
 * Anchor + path computation
 * ----------------------------------------------------------------------- */

type Side = 'left' | 'right' | 'top' | 'bottom';

interface Anchor {
  x: number;
  y: number;
  side: Side;
}

interface RefPath {
  d: string;
  startX: number;
  startY: number;
  startSide: Side;
  endX: number;
  endY: number;
  endSide: Side;
}

const sourceEntity = computed(() =>
  props.refLayout.source
    ? props.entities.find((e) => e.id === props.refLayout.source!.entityId)
    : undefined,
);
const targetEntity = computed(() =>
  props.refLayout.target
    ? props.entities.find((e) => e.id === props.refLayout.target!.entityId)
    : undefined,
);

const path = computed((): RefPath | undefined => {
  const src = sourceEntity.value;
  const tgt = targetEntity.value;
  if (!src || !tgt) return undefined;

  // Self-reference: source and target are the same entity. The
  // straight-through orthogonal path would draw a vertical line
  // through the entity, which is visually degenerate. Instead, loop
  // out the right side at the source field row, up over the entity,
  // and back down to the top edge. Standard ER notation for self-refs
  // (used by Erwin, ER/Studio, and similar tools).
  if (src.id === tgt.id) {
    return selfReferencePath(src, props.refLayout.source!.fieldName);
  }

  const { sourceSide, targetSide } = chooseSides(src, tgt);
  const srcAnchor = anchorOnSide(src, sourceSide, props.refLayout.source!.fieldName);
  const tgtAnchor = anchorOnSide(tgt, targetSide, props.refLayout.target!.fieldName);
  const d = orthogonalPath(srcAnchor, tgtAnchor);

  return {
    d,
    startX: srcAnchor.x,
    startY: srcAnchor.y,
    startSide: srcAnchor.side,
    endX: tgtAnchor.x,
    endY: tgtAnchor.y,
    endSide: tgtAnchor.side,
  };
});

/**
 * Build the loop path for a self-reference.
 *
 *     ┌──── ELBOW_TOP ──────────────┐    ↑
 *     │                             │   loop sits above the top edge
 *  ┌──┴──┐                          │    ↓
 *  │     │                          │
 *  │ ┌───────────────────────────┐  │
 *  │ │ entity                    │  │
 *  │ ├───────────────────────────┤  │
 *  │ │ id                       ─┘  │
 *  │ │ ...                          │
 *  │ │ source_field             ────┘  ← exits right at source row Y
 *  │ │ ...                          │
 *  │ └───────────────────────────┘
 *  │
 *
 * Five segments:
 *
 *   1. M (sx, sy)          start at right edge, source field row Y
 *   2. L (sx + EX, sy)     out to the right by ELBOW_X
 *   3. L (sx + EX, ty - EY) up to the loop height above the top edge
 *   4. L (tx, ty - EY)     across the top to the target X
 *   5. L (tx, ty)          drop down to the top edge
 *
 * The target X is the entity's horizontal center. The top edge has no
 * field-row structure (rows run horizontally inside the entity), so
 * we anchor at center instead of trying to project a row onto it.
 *
 * ELBOW_X and ELBOW_TOP are picked to fit inside CANVAS_MARGIN (32 px
 * in layout.ts), so a self-ref on an entity sitting at the right or
 * top edge of the auto-layout still draws within the canvas. Larger
 * values would look better visually but would risk clipping.
 */
function selfReferencePath (entity: EntityLayout, sourceFieldName: string | undefined): RefPath {
  const ELBOW_X = 24;
  const ELBOW_TOP = 24;

  // Source anchor: right edge, at source field's row Y. Falls back to
  // header midline if the field name can't be resolved (same fallback
  // as anchorOnSide).
  const sx = entity.bounds.x + entity.bounds.width;
  let sy = entity.bounds.y + ENTITY_HEADER_HEIGHT / 2;
  if (sourceFieldName) {
    const field = findFieldRow(entity, sourceFieldName);
    if (field) sy = entity.bounds.y + field.rowY + ROW_HEIGHT / 2;
  }

  // Target anchor: top edge, at entity center X.
  const tx = entity.bounds.x + entity.bounds.width / 2;
  const ty = entity.bounds.y;

  // Loop corner positions (the "outside" of the loop).
  const cornerX  = sx + ELBOW_X;       // right turn-up point
  const cornerY  = ty - ELBOW_TOP;     // top horizontal segment Y

  const d = `M ${sx} ${sy} ` +
            `L ${cornerX} ${sy} ` +
            `L ${cornerX} ${cornerY} ` +
            `L ${tx} ${cornerY} ` +
            `L ${tx} ${ty}`;

  return {
    d,
    startX: sx,
    startY: sy,
    startSide: 'right',
    endX: tx,
    endY: ty,
    endSide: 'top',
  };
}

/**
 * Decide which edge of each entity the line should attach to, based
 * on the entities' relative positions.
 *
 * Rule: if the entities' X projections do NOT overlap, attach to the
 * facing left/right edges (the classic side-by-side layout). If they
 * DO overlap horizontally, attach to facing top/bottom edges (the
 * stacked layout). For weird cases where entities overlap on both
 * axes (normally only possible if the user has dragged entities onto
 * each other), we still pick top/bottom and accept the line crossing
 * one box; the visible result is reasonable for the rare case.
 */
function chooseSides (src: EntityLayout, tgt: EntityLayout): { sourceSide: Side; targetSide: Side } {
  const srcL = src.bounds.x;
  const srcR = src.bounds.x + src.bounds.width;
  const tgtL = tgt.bounds.x;
  const tgtR = tgt.bounds.x + tgt.bounds.width;
  const xOverlap = srcR > tgtL && tgtR > srcL;

  if (xOverlap) {
    const srcCy = src.bounds.y + src.bounds.height / 2;
    const tgtCy = tgt.bounds.y + tgt.bounds.height / 2;
    if (srcCy <= tgtCy) return { sourceSide: 'bottom', targetSide: 'top' };
    return { sourceSide: 'top', targetSide: 'bottom' };
  }
  const srcCx = src.bounds.x + src.bounds.width / 2;
  const tgtCx = tgt.bounds.x + tgt.bounds.width / 2;
  if (srcCx <= tgtCx) return { sourceSide: 'right', targetSide: 'left' };
  return { sourceSide: 'left', targetSide: 'right' };
}

/**
 * Compute the (x, y) of an anchor on the given side of the entity.
 *
 * For left/right anchors, the Y coordinate is the row of the named
 * field (or the header midline if no field). For top/bottom anchors,
 * the X coordinate is the entity's horizontal center; top and bottom
 * edges don't expose field-row positions.
 *
 * The fieldName from a Ref can be a dotted path (e.g.
 * `line_items.sku` when the Ref targets a field inside an array).
 * The layout's row paths include synthetic intermediate segments
 * (e.g. `line_items.[line_item].sku` -- the `[line_item]` is the
 * synthesized array-element row). We strip those synthetic segments
 * before comparing, so the user-facing dotted path resolves to the
 * leaf row even when there's a structural intermediate between them.
 */
function anchorOnSide (entity: EntityLayout, side: Side, fieldName: string | undefined): Anchor {
  const left = entity.bounds.x;
  const right = entity.bounds.x + entity.bounds.width;
  const top = entity.bounds.y;
  const bottom = entity.bounds.y + entity.bounds.height;
  const centerX = entity.bounds.x + entity.bounds.width / 2;

  switch (side) {
    case 'left':
    case 'right': {
      let y = entity.bounds.y + ENTITY_HEADER_HEIGHT / 2;
      if (fieldName) {
        const field = findFieldRow(entity, fieldName);
        if (field) {
          y = entity.bounds.y + field.rowY + ROW_HEIGHT / 2;
        }
      }
      return { x: side === 'right' ? right : left, y, side };
    }
    case 'top':
      return { x: centerX, y: top, side };
    case 'bottom':
      return { x: centerX, y: bottom, side };
  }
}

/**
 * Find the layout row corresponding to a Ref's field path.
 *
 * Three resolution strategies, applied in order:
 *
 *   1. Exact match on the row's path. Handles all cases where the
 *      path the Ref author wrote matches the layout's path verbatim
 *      (e.g. simple top-level fields).
 *
 *   2. Match after stripping synthetic intermediate segments from
 *      the layout row's path. The layout emits synthetic rows for
 *      array elements (`[name]`), polymorphism alternatives
 *      (`{name}`), and map keys/values/items (`<key>`, `<value>`,
 *      `<item>`). The user-written Ref path skips these structural
 *      intermediaries. Comparing the stripped path catches that.
 *
 *   3. Fall back to leaf-name match for single-segment fieldNames
 *      (the common case of a top-level field). This is what the
 *      previous version always did.
 *
 * Returns the matched FieldLayout row, or undefined if no row matches.
 */
function findFieldRow (entity: EntityLayout, fieldName: string) {
  // Strategy 1: exact path match.
  const exact = entity.fields.find((f) => f.path === fieldName);
  if (exact) return exact;

  // Strategy 2: strip synthetic segments from each row's path and compare.
  // Synthetic segments are bracketed: [name], {name}, <name>.
  for (const f of entity.fields) {
    const stripped = f.path
      .split('.')
      .filter((seg) => !/^[\[\{<].*[\]\}>]$/.test(seg))
      .join('.');
    if (stripped === fieldName) return f;
  }

  // Strategy 3: single-segment leaf-name match.
  if (!fieldName.includes('.')) {
    const leaf = entity.fields.find((f) => f.name === fieldName);
    if (leaf) return leaf;
  }

  return undefined;
}

/**
 * Build the SVG path "d" attribute for an orthogonal route between
 * two anchors.
 *
 * Same-axis (both side or both top/bottom): a three-segment H-V-H or
 * V-H-V "Z" with the perpendicular middle segment at the midpoint
 * coordinate between the two anchors.
 *
 * Mixed-axis (one side, one top/bottom): not produced by chooseSides
 * under the current rule. We handle it defensively with a two-segment
 * "L" path in case a future selection rule introduces mixed cases.
 */
function orthogonalPath (a: Anchor, b: Anchor): string {
  const aHoriz = a.side === 'left' || a.side === 'right';
  const bHoriz = b.side === 'left' || b.side === 'right';

  if (aHoriz && bHoriz) {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
  }
  if (!aHoriz && !bHoriz) {
    const my = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} L ${a.x} ${my} L ${b.x} ${my} L ${b.x} ${b.y}`;
  }
  if (aHoriz) {
    return `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`;
  }
  return `M ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y}`;
}

/* -------------------------------------------------------------------------
 * Glyph + label placement helpers
 * ----------------------------------------------------------------------- */

/**
 * Transform that places the CrowFootGlyph at the anchor and orients
 * its "away from entity" axis correctly.
 *
 * The glyph is drawn with (0,0) at the anchor and positive X pointing
 * AWAY from the entity. To put that direction in the right place:
 *
 *   - right anchor:  positive X points right (no transform needed)
 *   - left anchor:   positive X points left  (mirror via scale(-1,1))
 *   - bottom anchor: positive X points down  (rotate 90 CW)
 *   - top anchor:    positive X points up    (rotate 90 CCW)
 */
function glyphTransform (side: Side, x: number, y: number): string {
  switch (side) {
    case 'right':  return `translate(${x} ${y})`;
    case 'left':   return `translate(${x} ${y}) scale(-1 1)`;
    case 'bottom': return `translate(${x} ${y}) rotate(90)`;
    case 'top':    return `translate(${x} ${y}) rotate(-90)`;
  }
}

/**
 * X coordinate for the cardinality text label. Offset away from the
 * anchor along the line direction for side anchors; offset to the
 * right of the anchor for top/bottom anchors (so the label sits
 * next to the glyph rather than overlapping the line).
 */
function labelX (side: Side, x: number): number {
  switch (side) {
    case 'right':  return x + 22;
    case 'left':   return x - 22;
    case 'bottom': return x + 6;
    case 'top':    return x + 6;
  }
}

function labelY (side: Side, y: number): number {
  switch (side) {
    case 'right':  return y - 6;
    case 'left':   return y - 6;
    case 'bottom': return y + 22;
    case 'top':    return y - 18;
  }
}

function labelAnchor (side: Side): 'start' | 'end' | 'middle' {
  return side === 'left' ? 'end' : 'start';
}

/* -------------------------------------------------------------------------
 * Cardinality parsing & operator inference (unchanged from prior version)
 * ----------------------------------------------------------------------- */

interface Cardinality {
  min: 0 | 1;
  max: 1 | '*';
}

const DEFAULT_CARDINALITY: Cardinality = { min: 1, max: 1 };

function parseCardinality (s: string | undefined): Cardinality {
  if (!s) return DEFAULT_CARDINALITY;
  const m = s.match(/^(\d+|\*)\.\.(\d+|\*)$/);
  if (!m) return DEFAULT_CARDINALITY;
  const [, minRaw, maxRaw] = m;
  const min: 0 | 1 = minRaw === '0' ? 0 : 1;
  const max: 1 | '*' = (maxRaw === '*' || (Number(maxRaw) > 1)) ? '*' : 1;
  return { min, max };
}

function cardinalityFromOperator (op: string, side: 'source' | 'target'): Cardinality {
  switch (op) {
    case '>':
      return side === 'source' ? { min: 1, max: '*' } : { min: 1, max: 1 };
    case '<':
      return side === 'source' ? { min: 1, max: 1 } : { min: 1, max: '*' };
    case '-':
      return { min: 1, max: 1 };
    case '<>':
      return { min: 1, max: '*' };
    default:
      return DEFAULT_CARDINALITY;
  }
}

const sourceCardinality = computed<Cardinality>(() => {
  if (props.refLayout.sourceCardinality) return parseCardinality(props.refLayout.sourceCardinality);
  return cardinalityFromOperator(props.refLayout.operator, 'source');
});
const targetCardinality = computed<Cardinality>(() => {
  if (props.refLayout.targetCardinality) return parseCardinality(props.refLayout.targetCardinality);
  return cardinalityFromOperator(props.refLayout.operator, 'target');
});

const sourceLabel = computed(() => formatCardinality(props.refLayout.sourceCardinality));
const targetLabel = computed(() => formatCardinality(props.refLayout.targetCardinality));

function formatCardinality (s?: string): string {
  if (!s) return '';
  return s;
}

const lineColor = computed(() => props.isSelected ? '#2563eb' : '#64748b');
const textColor = computed(() => props.isSelected ? '#2563eb' : '#94a3b8');
</script>
