<template>
  <g :stroke="color" :fill="color" stroke-linecap="round" stroke-linejoin="round">
    <!-- Optional-participation ring (○). Drawn first because the bar
         lines sit just past it. -->
    <circle
      v-if="min === 0"
      :cx="RING_CX"
      cy="0"
      :r="RING_R"
      fill="white"
      stroke-width="1.25"
    />

    <!-- "Exactly one" perpendicular bar (║). Drawn at BAR_X. -->
    <line
      v-if="max === 1"
      :x1="BAR_X"
      :y1="-BAR_HALF_HEIGHT"
      :x2="BAR_X"
      :y2="BAR_HALF_HEIGHT"
      stroke-width="1.5"
      fill="none"
    />

    <!-- "Many" crow's foot (≺). Three lines fanning from a single
         apex on the curve OUT toward the entity. The apex sits
         farther from the entity (at FOOT_APEX_X), and the three tips
         spread out perpendicular on the entity-facing side (at
         FOOT_TIP_X, closer to the entity). The "opening" of the V
         faces the entity, the way ER convention requires. -->
    <template v-if="max === '*'">
      <!-- Top line of the foot -->
      <line
        :x1="FOOT_APEX_X"
        y1="0"
        :x2="FOOT_TIP_X"
        :y2="-FOOT_SPREAD"
        stroke-width="1.5"
        fill="none"
      />
      <!-- Middle line (straight ahead, on the line itself) -->
      <line
        :x1="FOOT_APEX_X"
        y1="0"
        :x2="FOOT_TIP_X"
        y2="0"
        stroke-width="1.5"
        fill="none"
      />
      <!-- Bottom line of the foot -->
      <line
        :x1="FOOT_APEX_X"
        y1="0"
        :x2="FOOT_TIP_X"
        :y2="FOOT_SPREAD"
        stroke-width="1.5"
        fill="none"
      />
    </template>
  </g>
</template>

<script setup lang="ts">
/**
 * Crow's foot cardinality glyph at a Ref-line endpoint.
 *
 * Drawn in local coordinates where (0,0) is the anchor point on the
 * entity edge and positive x extends AWAY from the entity along the
 * curve. The parent component applies a `scale(-1, 1)` transform when
 * the anchor is on the left side of an entity, so the glyph code only
 * has to handle the "right side" case.
 *
 * Glyph layout (positive x = away from entity):
 *
 *     0   3      8    11           18
 *     │   │      │    │             │
 *  ───●───○──────║────┤≻─────────── curve →
 *     │   ring   bar   crow's foot
 *     anchor    (max=1) (max=*, opens toward entity)
 *
 *   - Ring (○) at x=6 if min=0
 *   - Bar (║) at x=11 if max=1
 *   - Crow's foot: tips at x=11 (entity side), apex at x=18 (curve side)
 *     if max=*. The opening of the V faces the entity, per ER
 *     convention -- the "many" symbol points AT the entity it
 *     constrains, not away from it.
 *
 * Each piece is conditional, so the four standard cases produce:
 *
 *   exactly one   (1, 1):  ───────║───
 *   zero or one   (0, 1):  ───○───║───
 *   one or many   (1, *):  ─────┤≻──
 *   zero or many  (0, *):  ───○─┤≻──
 *
 * The component is intentionally minimal: no animations, no
 * interactivity (clicks are handled by the parent ref-line's hit
 * area). Stroke width and color come from the parent so the whole
 * line + glyph turns blue uniformly on selection.
 */

defineProps<{
  min: 0 | 1;
  max: 1 | '*';
  color: string;
}>();

/* -------------------------------------------------------------------------
 * Layout constants (in SVG units, which scale with diagram zoom).
 * ----------------------------------------------------------------------- */

const RING_CX = 6;
const RING_R  = 2.5;

const BAR_X            = 11;
const BAR_HALF_HEIGHT  = 5;

const FOOT_APEX_X = 18;  // apex sits farther from the entity (curve side)
const FOOT_TIP_X  = 11;  // tips fan out closer to the entity
const FOOT_SPREAD = 5;
</script>
