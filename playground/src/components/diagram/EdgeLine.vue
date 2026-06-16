<template>
  <g v-if="connectors.length" style="pointer-events: none;">
    <template v-for="(c, i) in connectors" :key="i">
      <!-- Segment from a node to the edge box. -->
      <path :d="c.d" fill="none" :stroke="LINE_COLOR" stroke-width="1.5" />
      <!-- Crow's-foot + cardinality at the NODE end only. The box end
           carries no cardinality: the box is a pass-through. -->
      <g :transform="glyphTransform(c.side, c.x, c.y)">
        <CrowFootGlyph :min="c.card.min" :max="c.card.max" :color="LINE_COLOR" />
      </g>
      <text
        v-if="c.label"
        :x="labelX(c.side, c.x)"
        :y="labelY(c.side, c.y)"
        font-size="9"
        font-weight="500"
        :fill="TEXT_COLOR"
        :text-anchor="labelAnchor(c.side)"
      >{{ c.label }}</text>
    </template>
  </g>
</template>

<script setup lang="ts">
/**
 * Renders a property-bearing Edge: two orthogonal segments running from
 * the source node to the edge box and from the box to the target node.
 * The box itself is drawn by EntityCard (it's an isEdge EntityLayout);
 * this component only draws the connecting lines and the cardinality.
 *
 * Cardinality is shown ONLY at the node ends (source_cardinality by the
 * source node, target_cardinality by the target node). The box ends are
 * plain -- the box is a reified relationship, not an endpoint.
 *
 * Self edges (source === target) draw both segments to the same node, at
 * biased anchor points so the two lines don't coincide.
 */
import { computed } from 'vue';

import type { EntityLayout, EdgeLayout, Rect } from './layout';
import CrowFootGlyph from './CrowFootGlyph.vue';

const props = defineProps<{
  edge: EdgeLayout;
  entities: EntityLayout[];
}>();

const LINE_COLOR = '#7c3aed';
const TEXT_COLOR = '#8b5cf6';

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Cardinality { min: 0 | 1; max: 1 | '*'; }
interface Connector { d: string; x: number; y: number; side: Side; card: Cardinality; label: string; }

const sourceNode = computed(() => props.entities.find((e) => e.id === props.edge.sourceEntityId));
const targetNode = computed(() => props.entities.find((e) => e.id === props.edge.targetEntityId));

const connectors = computed((): Connector[] => {
  const src = sourceNode.value;
  const tgt = targetNode.value;
  const box = props.edge.box.bounds;
  if (!src || !tgt) return [];

  const self = src.id === tgt.id;
  const out: Connector[] = [];
  out.push(connect(src.bounds, box, props.edge.sourceCardinality, self ? 0.32 : 0.5));
  out.push(connect(tgt.bounds, box, props.edge.targetCardinality, self ? 0.68 : 0.5));
  return out;
});

// Build one segment from a node rect to the box rect, with the glyph at
// the node end.
function connect (node: Rect, box: Rect, cardStr: string | undefined, nodeBias: number): Connector {
  const { nodeSide, boxSide } = chooseSides(node, box);
  const a = anchor(node, nodeSide, nodeBias);
  const b = anchor(box, boxSide, 0.5);
  return {
    d: orthogonalPath(a, b, nodeSide, boxSide),
    x: a.x,
    y: a.y,
    side: nodeSide,
    card: parseCardinality(cardStr),
    label: cardStr ?? '',
  };
}

// Pick facing sides between two rects: left/right if their X spans don't
// overlap, otherwise top/bottom.
function chooseSides (node: Rect, box: Rect): { nodeSide: Side; boxSide: Side } {
  const nL = node.x; const nR = node.x + node.width;
  const bL = box.x; const bR = box.x + box.width;
  const xOverlap = nR > bL && bR > nL;
  if (!xOverlap) {
    const nCx = node.x + node.width / 2;
    const bCx = box.x + box.width / 2;
    return nCx <= bCx ? { nodeSide: 'right', boxSide: 'left' } : { nodeSide: 'left', boxSide: 'right' };
  }
  const nCy = node.y + node.height / 2;
  const bCy = box.y + box.height / 2;
  return nCy <= bCy ? { nodeSide: 'bottom', boxSide: 'top' } : { nodeSide: 'top', boxSide: 'bottom' };
}

function anchor (r: Rect, side: Side, bias: number): { x: number; y: number } {
  switch (side) {
    case 'left':   return { x: r.x, y: r.y + r.height * bias };
    case 'right':  return { x: r.x + r.width, y: r.y + r.height * bias };
    case 'top':    return { x: r.x + r.width * bias, y: r.y };
    case 'bottom': return { x: r.x + r.width * bias, y: r.y + r.height };
  }
}

function orthogonalPath (a: { x: number; y: number }, b: { x: number; y: number }, aSide: Side, bSide: Side): string {
  const aHoriz = aSide === 'left' || aSide === 'right';
  const bHoriz = bSide === 'left' || bSide === 'right';
  if (aHoriz && bHoriz) {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
  }
  if (!aHoriz && !bHoriz) {
    const my = (a.y + b.y) / 2;
    return `M ${a.x} ${a.y} L ${a.x} ${my} L ${b.x} ${my} L ${b.x} ${b.y}`;
  }
  if (aHoriz) return `M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}`;
  return `M ${a.x} ${a.y} L ${a.x} ${b.y} L ${b.x} ${b.y}`;
}

function glyphTransform (side: Side, x: number, y: number): string {
  switch (side) {
    case 'right':  return `translate(${x} ${y})`;
    case 'left':   return `translate(${x} ${y}) scale(-1 1)`;
    case 'bottom': return `translate(${x} ${y}) rotate(90)`;
    case 'top':    return `translate(${x} ${y}) rotate(-90)`;
  }
}

function labelX (side: Side, x: number): number {
  switch (side) {
    case 'right':  return x + 22;
    case 'left':   return x - 22;
    default:       return x + 6;
  }
}

function labelY (side: Side, y: number): number {
  switch (side) {
    case 'bottom': return y + 22;
    case 'top':    return y - 18;
    default:       return y - 6;
  }
}

function labelAnchor (side: Side): 'start' | 'end' | 'middle' {
  return side === 'left' ? 'end' : 'start';
}

const DEFAULT_CARDINALITY: Cardinality = { min: 1, max: 1 };

function parseCardinality (s: string | undefined): Cardinality {
  if (!s) return DEFAULT_CARDINALITY;
  const m = s.match(/^(\d+|\*)\.\.(\d+|\*)$/);
  if (!m) return DEFAULT_CARDINALITY;
  const [, minRaw, maxRaw] = m;
  const min: 0 | 1 = minRaw === '0' ? 0 : 1;
  const max: 1 | '*' = (maxRaw === '*' || Number(maxRaw) > 1) ? '*' : 1;
  return { min, max };
}
</script>
