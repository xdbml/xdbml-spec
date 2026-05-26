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
      :stroke="isSelected ? '#2563eb' : '#64748b'"
      :stroke-width="isSelected ? 2.5 : 1.5"
      style="pointer-events: none;"
    />
    <!-- Source endpoint marker -->
    <g v-if="sourceLabel" style="pointer-events: none;">
      <circle
        :cx="path.startX"
        :cy="path.startY"
        r="3.5"
        fill="white"
        :stroke="isSelected ? '#2563eb' : '#64748b'"
        stroke-width="1.5"
      />
      <text
        :x="path.startX + (path.startSide === 'right' ? 6 : -6)"
        :y="path.startY - 5"
        font-size="10"
        font-weight="600"
        :fill="isSelected ? '#2563eb' : '#475569'"
        :text-anchor="path.startSide === 'right' ? 'start' : 'end'"
      >{{ sourceLabel }}</text>
    </g>
    <!-- Target endpoint marker -->
    <g v-if="targetLabel" style="pointer-events: none;">
      <circle
        :cx="path.endX"
        :cy="path.endY"
        r="3.5"
        fill="white"
        :stroke="isSelected ? '#2563eb' : '#64748b'"
        stroke-width="1.5"
      />
      <text
        :x="path.endX + (path.endSide === 'right' ? 6 : -6)"
        :y="path.endY - 5"
        font-size="10"
        font-weight="600"
        :fill="isSelected ? '#2563eb' : '#475569'"
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
 * Cardinality labels come from the Ref's settings (`source: '0..*'`)
 * and render as small text near each endpoint. The cardinality operator
 * (`<` `>` `-` `<>`) is currently not visualized; the explicit
 * cardinality strings carry richer information and are preferred when
 * present.
 *
 * Selection:
 *   - `is-selected` prop: when true, the curve and its endpoint markers
 *     turn blue and the stroke thickens.
 *   - A transparent stroke-14 path sits over the visible curve to
 *     catch clicks more easily -- the visible 1.5 px line is too thin
 *     to be a reliable click target on its own.
 */
import { computed } from 'vue';

import type { EntityLayout, RefLayout } from './layout';
import { ENTITY_HEADER_HEIGHT, ROW_HEIGHT } from './layout';

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

const sourceLabel = computed(() => formatCardinality(props.refLayout.sourceCardinality));
const targetLabel = computed(() => formatCardinality(props.refLayout.targetCardinality));

function formatCardinality (s?: string): string {
  if (!s) return '';
  // The cardinality string is already in `N..M` form (e.g. '0..*', '1..1').
  // Compact common cases visually: 1..1 -> 1, 0..* -> *, etc.
  if (s === '1..1') return '1';
  if (s === '0..1') return '0..1';
  if (s === '0..*') return '*';
  if (s === '1..*') return '1..*';
  return s;
}
</script>
