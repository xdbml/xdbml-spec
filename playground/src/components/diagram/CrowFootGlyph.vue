<template>
  <g :stroke="color" :fill="color" stroke-linecap="round" stroke-linejoin="round">
    <!-- "Exactly one" perpendicular bar at BAR_X (closest to entity). -->
    <line
      v-if="max === 1"
      :x1="BAR_X"
      :y1="-BAR_HALF_HEIGHT"
      :x2="BAR_X"
      :y2="BAR_HALF_HEIGHT"
      stroke-width="1.5"
      fill="none"
    />

    <!-- "Many" crow's foot. Three lines fanning from an apex (at
         FOOT_APEX_X, further from the entity) toward three tips (at
         FOOT_TIP_X, closer to the entity). The opening of the V
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

    <!-- Optional-participation ring at RING_CX (further from entity).
         Drawn last so it sits on top of the line stroke. White fill
         so it visually punches a hole through the line. -->
    <circle
      v-if="min === 0"
      :cx="RING_CX"
      cy="0"
      :r="RING_R"
      fill="white"
      stroke-width="1.25"
    />
  </g>
</template>

<script setup lang="ts">
/**
 * Crow's foot cardinality glyph at a Ref-line endpoint.
 *
 * Drawn in local coordinates where (0,0) is the anchor point on the
 * entity edge and positive x extends AWAY from the entity along the
 * line. The parent component applies a transform when the anchor is
 * on a different edge (mirroring for left, rotation for top/bottom)
 * so the glyph code only has to handle the "right side" case.
 *
 * Glyph layout (positive x = away from entity):
 *
 *     0    4     8         14
 *     │    │     │          │
 *  ───●────║─────┤≻─────────○──── line →
 *     │    bar   crow's foot ring
 *     │    (max=1) (max=*)  (min=0)
 *     anchor
 *
 *   - Bar (║) at x=4: drawn if max=1 ("exactly one" cap)
 *   - Crow's-foot tips at x=1, apex at x=8: drawn if max=*. The fan
 *     opens TOWARD the entity (tips closer than apex), per the ER
 *     convention that "many" symbols point AT the entity.
 *   - Ring (○) at x=14: drawn if min=0 (optional participation)
 *
 * The four standard cardinalities produce:
 *
 *   exactly one   (1, 1):  ────║──────────
 *   zero or one   (0, 1):  ────║─────○───      (bar near entity, ring further)
 *   one or many   (1, *):  ─┤≻───────────      (foot near entity)
 *   zero or many  (0, *):  ─┤≻────────○──      (foot near entity, ring further)
 *
 * This follows the long-standing ER notation convention: the
 * "shape" of cardinality (one vs. many) sits adjacent to the
 * entity it constrains, while the optional-participation ring
 * stands further out along the line. Earlier versions of this
 * glyph had the ring closer than the bar/foot, which was visually
 * unusual; this layout matches Chen / Information Engineering
 * tools (Lucidchart, ERwin, dbdiagram.io, DataGrip).
 *
 * Stroke width and color come from the parent so the whole line +
 * glyph turns blue uniformly on selection.
 */

defineProps<{
  min: 0 | 1;
  max: 1 | '*';
  color: string;
}>();

/* -------------------------------------------------------------------------
 * Layout constants (in SVG units, which scale with diagram zoom).
 *
 * The convention here is: smaller x = closer to the entity. Larger x
 * = further from the entity along the line. The bar and crow's foot
 * sit at small x (closest to the entity); the optional-participation
 * ring sits at larger x (further away).
 * ----------------------------------------------------------------------- */

const BAR_X            = 4;
const BAR_HALF_HEIGHT  = 5;

const FOOT_TIP_X  = 1;   // tips touch the entity edge
const FOOT_APEX_X = 8;   // apex sits further along the line
const FOOT_SPREAD = 5;

const RING_CX = 14;
const RING_R  = 2.5;
</script>
