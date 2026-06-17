/**
 * Edge connector geometry (property-bearing relationships).
 *
 * Extracted verbatim from the playground's EdgeLine.vue. An Edge renders
 * as two orthogonal segments running from the source node to the edge box
 * and from the box to the target node, with a crow's-foot glyph + label
 * at the node ends only (the box is a pass-through). Self edges bias the
 * two anchors so the segments don't coincide.
 */
import type { EdgeLayout, EntityLayout, Rect } from '../layout/layout.ts';
import type { Side } from './placement.ts';
import { type Cardinality, DEFAULT_CARDINALITY, parseCardinality } from './cardinality.ts';

export interface EdgeConnector {
  d: string;
  x: number;
  y: number;
  side: Side;
  card: Cardinality;
  label: string;
}

export function edgeConnectors (edge: EdgeLayout, entities: EntityLayout[]): EdgeConnector[] {
  const src = entities.find((e) => e.id === edge.sourceEntityId);
  const tgt = entities.find((e) => e.id === edge.targetEntityId);
  const box = edge.box.bounds;
  if (!src || !tgt) return [];

  const self = src.id === tgt.id;
  return [
    connect(src.bounds, box, edge.sourceCardinality, self ? 0.32 : 0.5),
    connect(tgt.bounds, box, edge.targetCardinality, self ? 0.68 : 0.5),
  ];
}

function connect (node: Rect, box: Rect, cardStr: string | undefined, nodeBias: number): EdgeConnector {
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

function orthogonalPath (
  a: { x: number; y: number },
  b: { x: number; y: number },
  aSide: Side,
  bSide: Side,
): string {
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

/** Unused-but-kept for parity with the default cardinality semantics. */
export { DEFAULT_CARDINALITY };

export function edgeLabelX (side: Side, x: number): number {
  switch (side) {
    case 'right':  return x + 22;
    case 'left':   return x - 22;
    default:       return x + 6;
  }
}

export function edgeLabelY (side: Side, y: number): number {
  switch (side) {
    case 'bottom': return y + 22;
    case 'top':    return y - 18;
    default:       return y - 6;
  }
}
