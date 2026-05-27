<template>
  <g v-if="path">
    <!-- Wide invisible hit-area over the curve. Catches clicks even
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
    <!-- Visible curve. Stroke thickens and turns blue when selected. -->
    <path
      :d="path.d"
      fill="none"
      :stroke="lineColor"
      :stroke-width="isSelected ? 2.5 : 1.5"
      style="pointer-events: none;"
    />

    <!-- Source endpoint: crow's-foot glyph + cardinality text. -->
    <g style="pointer-events: none;">
      <g
        :transform="`translate(${path.startX} ${path.startY}) scale(${path.startSide === 'right' ? 1 : -1} 1)`"
      >
        <CrowFootGlyph
          :min="sourceCardinality.min"
          :max="sourceCardinality.max"
          :color="lineColor"
        />
      </g>
      <text
        v-if="sourceLabel"
        :x="path.startX + (path.startSide === 'right' ? 22 : -22)"
        :y="path.startY - 6"
        font-size="9"
        font-weight="500"
        :fill="textColor"
        :text-anchor="path.startSide === 'right' ? 'start' : 'end'"
      >{{ sourceLabel }}</text>
    </g>

    <!-- Target endpoint: same. -->
    <g style="pointer-events: none;">
      <g
        :transform="`translate(${path.endX} ${path.endY}) scale(${path.endSide === 'right' ? 1 : -1} 1)`"
      >
        <CrowFootGlyph
          :min="targetCardinality.min"
          :max="targetCardinality.max"
          :color="lineColor"
        />
      </g>
      <text
        v-if="targetLabel"
        :x="path.endX + (path.endSide === 'right' ? 22 : -22)"
        :y="path.endY - 6"
        font-size="9"
        font-weight="500"
        :fill="textColor"
        :text-anchor="path.endSide === 'right' ? 'start' : 'end'"
      >{{ targetLabel }}</text>
    </g>
  </g>
</template>

<script setup lang="ts">
/**
 * One Ref line between two entity field rows.
 *
 * Path construction:
 *   - Anchor points are computed at the row's vertical center on either
 *     the left or right edge of the source/target entity card,
 *     whichever side is nearer to the other endpoint.
 *   - Control points are offset horizontally by half the gap between
 *     the two endpoints, producing a smooth horizontal-flowing curve.
 *
 * Cardinality is encoded at each endpoint using the standard ER
 * "crow's foot" notation:
 *
 *   ─║      exactly one         (min=1, max=1)
 *   ─○║     zero or one         (min=0, max=1)
 *   ─≺      one or many         (min=1, max=*)
 *   ─○≺     zero or many        (min=0, max=*)
 *
 * The ring (○) means "zero is allowed" (optional participation). The
 * bar (║) caps "exactly one." The crow's foot (≺) means "many." This
 * is the same notation Chen/Information Engineering tools have used
 * since the 1980s and the same notation dbdiagram.io, Lucidchart, and
 * DataGrip use today.
 *
 * Cardinality sources, in priority order:
 *   1. Explicit settings: `[source: '0..*', target: '1..1']`. UML-style
 *      "min..max" with `*` meaning unbounded.
 *   2. Operator inference: `<` `>` `-` `<>` shorthand from the Ref
 *      declaration. Less precise (no way to express optionality), so
 *      we infer mandatory ("1") for the min.
 *   3. Fallback if neither: treat as 1..1 on both ends.
 *
 * The cardinality text label (e.g. "0..*", "1..1") still renders
 * alongside the glyph for users who prefer reading the explicit value
 * or have non-standard cardinalities the glyph can't represent
 * exactly. It's smaller and lighter than before -- the glyph is the
 * primary signal now.
 *
 * Selection:
 *   - `is-selected` prop: when true, curve + glyphs turn blue and the
 *     stroke thickens.
 *   - A transparent stroke-14 path sits over the visible curve to
 *     catch clicks more easily -- the visible 1.5 px line is too thin
 *     to be a reliable click target on its own.
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

interface Anchor {
  x: number;
  y: number;
  side: 'left' | 'right';
}

interface RefPath {
  d: string;
  startX: number;
  startY: number;
  startSide: 'left' | 'right';
  endX: number;
  endY: number;
  endSide: 'left' | 'right';
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

  const srcAnchor = computeAnchor(src, props.refLayout.source!.fieldName, tgt);
  const tgtAnchor = computeAnchor(tgt, props.refLayout.target!.fieldName, src);

  // Control point offset: horizontal, half the gap between endpoints,
  // clamped to a sensible minimum so very-close endpoints still curve.
  const dx = Math.abs(tgtAnchor.x - srcAnchor.x);
  const offset = Math.max(40, dx * 0.4);

  const c1x = srcAnchor.x + (srcAnchor.side === 'right' ? offset : -offset);
  const c2x = tgtAnchor.x + (tgtAnchor.side === 'right' ? offset : -offset);

  const d = `M ${srcAnchor.x} ${srcAnchor.y} C ${c1x} ${srcAnchor.y}, ${c2x} ${tgtAnchor.y}, ${tgtAnchor.x} ${tgtAnchor.y}`;

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
 * Place an anchor on the side of `entity` nearest to `other`. The y
 * coordinate is the row of the named field, or the entity header if
 * the field is missing or the path didn't name one.
 */
function computeAnchor (
  entity: EntityLayout,
  fieldName: string | undefined,
  other: EntityLayout,
): Anchor {
  const entityCenterX = entity.bounds.x + entity.bounds.width / 2;
  const otherCenterX = other.bounds.x + other.bounds.width / 2;
  const side: 'left' | 'right' = otherCenterX >= entityCenterX ? 'right' : 'left';
  const x = side === 'right'
    ? entity.bounds.x + entity.bounds.width
    : entity.bounds.x;

  let y = entity.bounds.y + ENTITY_HEADER_HEIGHT / 2;
  if (fieldName) {
    const field = entity.fields.find((f) => f.name === fieldName);
    if (field) {
      y = entity.bounds.y + field.rowY + ROW_HEIGHT / 2;
    }
  }
  return { x, y, side };
}

/* -------------------------------------------------------------------------
 * Cardinality parsing & operator inference
 * ----------------------------------------------------------------------- */

interface Cardinality {
  /** Minimum participations: 0 or 1. */
  min: 0 | 1;
  /** Maximum participations: 1 or '*' (many). */
  max: 1 | '*';
}

const DEFAULT_CARDINALITY: Cardinality = { min: 1, max: 1 };

/**
 * Parse a `N..M` cardinality string into the glyph's two-value model.
 * Anything we can't classify falls into DEFAULT_CARDINALITY -- the user
 * still sees the original string via the text label, so no information
 * is lost.
 */
function parseCardinality (s: string | undefined): Cardinality {
  if (!s) return DEFAULT_CARDINALITY;
  const m = s.match(/^(\d+|\*)\.\.(\d+|\*)$/);
  if (!m) return DEFAULT_CARDINALITY;
  const [, minRaw, maxRaw] = m;
  const min: 0 | 1 = minRaw === '0' ? 0 : 1;
  const max: 1 | '*' = (maxRaw === '*' || (Number(maxRaw) > 1)) ? '*' : 1;
  return { min, max };
}

/**
 * Map the operator shorthand to default cardinalities. The operators
 * cannot express optionality, so min defaults to 1 (mandatory). The
 * 'side' tells us which endpoint we're computing for, since `<` is
 * "source is one, target is many" and `>` is the reverse.
 */
function cardinalityFromOperator (op: string, side: 'source' | 'target'): Cardinality {
  switch (op) {
    case '>': // source: many, target: one
      return side === 'source' ? { min: 1, max: '*' } : { min: 1, max: 1 };
    case '<': // source: one, target: many
      return side === 'source' ? { min: 1, max: 1 } : { min: 1, max: '*' };
    case '-': // one-to-one
      return { min: 1, max: 1 };
    case '<>': // many-to-many
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

/* -------------------------------------------------------------------------
 * Display strings (smaller, less prominent than before -- the glyph
 * carries the primary signal now). We still show the original
 * settings string verbatim so users with non-standard cardinalities
 * (e.g. "0..3", "2..5") see the exact value the glyph approximates.
 * ----------------------------------------------------------------------- */

const sourceLabel = computed(() => formatCardinality(props.refLayout.sourceCardinality));
const targetLabel = computed(() => formatCardinality(props.refLayout.targetCardinality));

function formatCardinality (s?: string): string {
  if (!s) return '';
  // Don't compact -- show the exact source value, since the glyph
  // already does the visual shorthand.
  return s;
}

/* -------------------------------------------------------------------------
 * Colors
 * ----------------------------------------------------------------------- */

const lineColor = computed(() => props.isSelected ? '#2563eb' : '#64748b');
const textColor = computed(() => props.isSelected ? '#2563eb' : '#94a3b8');
</script>
