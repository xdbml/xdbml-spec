/**
 * Ref-line geometry.
 *
 * Extracted verbatim from the playground's RefLine.vue. Pure functions
 * that turn a RefLayout plus the positioned entities/containers into an
 * orthogonal (or self-reference loop) path and the two endpoint
 * descriptors the serializer needs to place crow's-foot glyphs and
 * cardinality labels.
 */
import type { ContainerLayout, EntityLayout, FieldLayout, RefLayout } from '../layout/layout.ts';
import { CONTAINER_HEADER_HEIGHT, ENTITY_HEADER_HEIGHT, ROW_HEIGHT } from '../layout/layout.ts';
import type { Side } from './placement.ts';
import {
  type Cardinality,
  cardinalityFromOperator,
  parseCardinality,
} from './cardinality.ts';

interface Anchor {
  x: number;
  y: number;
  side: Side;
}

export interface RefPath {
  d: string;
  startX: number;
  startY: number;
  startSide: Side;
  endX: number;
  endY: number;
  endSide: Side;
}

export interface RefEndpoint {
  x: number;
  y: number;
  side: Side;
  card: Cardinality;
  /** Explicit cardinality string to render as a small label, or '' for none. */
  label: string;
}

export interface ResolvedRef {
  path: RefPath;
  source: RefEndpoint;
  target: RefEndpoint;
}

/**
 * Resolve a RefLayout into a renderable path + endpoints, or undefined if
 * either endpoint entity can't be found among the positioned entities
 * (an unresolved ref -- the serializer counts these for the banner).
 */
export function resolveRef (
  ref: RefLayout,
  entities: EntityLayout[],
  containers: ContainerLayout[],
): ResolvedRef | undefined {
  const src = ref.source ? entities.find((e) => e.id === ref.source!.entityId) : undefined;
  const tgt = ref.target ? entities.find((e) => e.id === ref.target!.entityId) : undefined;
  if (!src || !tgt) return undefined;

  let path: RefPath;
  if (src.id === tgt.id) {
    const container = src.containerName
      ? containers.find((c) => c.name === src.containerName)
      : undefined;
    path = selfReferencePath(src, ref.source!.fieldName, container);
  } else {
    const { sourceSide, targetSide } = chooseSides(src, tgt);
    const srcAnchor = anchorOnSide(src, sourceSide, ref.source!.fieldName);
    const tgtAnchor = anchorOnSide(tgt, targetSide, ref.target!.fieldName);
    path = {
      d: orthogonalPath(srcAnchor, tgtAnchor),
      startX: srcAnchor.x,
      startY: srcAnchor.y,
      startSide: srcAnchor.side,
      endX: tgtAnchor.x,
      endY: tgtAnchor.y,
      endSide: tgtAnchor.side,
    };
  }

  const sourceCard = ref.sourceCardinality
    ? parseCardinality(ref.sourceCardinality)
    : cardinalityFromOperator(ref.operator, 'source');
  const targetCard = ref.targetCardinality
    ? parseCardinality(ref.targetCardinality)
    : cardinalityFromOperator(ref.operator, 'target');

  return {
    path,
    source: {
      x: path.startX,
      y: path.startY,
      side: path.startSide,
      card: sourceCard,
      label: ref.sourceCardinality ?? '',
    },
    target: {
      x: path.endX,
      y: path.endY,
      side: path.endSide,
      card: targetCard,
      label: ref.targetCardinality ?? '',
    },
  };
}

/**
 * Self-reference loop: exit the right edge at the source field row, run
 * out and up, across the top, and down to the top edge at entity center.
 * Clamped to stay clear of an enclosing container's borders.
 */
function selfReferencePath (
  entity: EntityLayout,
  sourceFieldName: string | undefined,
  container: ContainerLayout | undefined,
): RefPath {
  const ELBOW_X = 24;
  const ELBOW_TOP = 24;
  const SELF_REF_CLEARANCE = 8;

  const sx = entity.bounds.x + entity.bounds.width;
  let sy = entity.bounds.y + ENTITY_HEADER_HEIGHT / 2;
  if (sourceFieldName) {
    const field = findFieldRow(entity, sourceFieldName);
    if (field) sy = entity.bounds.y + field.rowY + ROW_HEIGHT / 2;
  }

  const tx = entity.bounds.x + entity.bounds.width / 2;
  const ty = entity.bounds.y;

  let cornerX = sx + ELBOW_X;
  let cornerY = ty - ELBOW_TOP;

  if (container) {
    const containerRight = container.bounds.x + container.bounds.width;
    const maxCornerX = containerRight - SELF_REF_CLEARANCE;
    if (cornerX > maxCornerX) cornerX = maxCornerX;

    const containerInnerTop = container.bounds.y + CONTAINER_HEADER_HEIGHT;
    const minCornerY = containerInnerTop + SELF_REF_CLEARANCE;
    if (cornerY < minCornerY) cornerY = minCornerY;
  }

  const d = `M ${sx} ${sy} ` +
            `L ${cornerX} ${sy} ` +
            `L ${cornerX} ${cornerY} ` +
            `L ${tx} ${cornerY} ` +
            `L ${tx} ${ty}`;

  return { d, startX: sx, startY: sy, startSide: 'right', endX: tx, endY: ty, endSide: 'top' };
}

/**
 * Decide which edges the line attaches to from the entities' relative
 * positions: facing left/right edges when X projections don't overlap
 * (side-by-side), otherwise top/bottom edges (stacked).
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
        if (field) y = entity.bounds.y + field.rowY + ROW_HEIGHT / 2;
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
 * Resolve a Ref's (possibly dotted) field path to a layout row. Tries an
 * exact path match, then a match after stripping synthetic intermediate
 * segments ([name], {name}, <name>), then a single-segment leaf-name
 * match.
 */
function findFieldRow (entity: EntityLayout, fieldName: string): FieldLayout | undefined {
  const exact = entity.fields.find((f) => f.path === fieldName);
  if (exact) return exact;

  for (const f of entity.fields) {
    const stripped = f.path
      .split('.')
      .filter((seg) => !/^[\[\{<].*[\]\}>]$/.test(seg))
      .join('.');
    if (stripped === fieldName) return f;
  }

  if (!fieldName.includes('.')) {
    const leaf = entity.fields.find((f) => f.name === fieldName);
    if (leaf) return leaf;
  }

  return undefined;
}

/**
 * Orthogonal route between two anchors: H-V-H when both are on side
 * edges, V-H-V when both are on top/bottom edges, with a defensive
 * two-segment fallback for mixed-axis pairs.
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

/** Cardinality-label X, offset away from the anchor along the line. */
export function refLabelX (side: Side, x: number): number {
  switch (side) {
    case 'right':  return x + 22;
    case 'left':   return x - 22;
    case 'bottom': return x + 6;
    case 'top':    return x + 6;
  }
}

export function refLabelY (side: Side, y: number): number {
  switch (side) {
    case 'right':  return y - 6;
    case 'left':   return y - 6;
    case 'bottom': return y + 22;
    case 'top':    return y - 18;
  }
}
