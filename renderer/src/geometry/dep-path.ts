/**
 * Geometry of data lineage (spec §27.7).
 *
 * A dependency draws as a curve from its upstream end to its downstream
 * end, with an arrowhead at the downstream end, so that it never reads as
 * a relationship, whose lines turn at right angles. Both ends attach at
 * the side of a box: at the row of a field, or at the header for an
 * entity or a View.
 *
 * The dependencies of one Dep that share a downstream end meet at a
 * junction shortly before it, and one trunk continues from the junction
 * to the arrowhead, so several fields combined into one read as one
 * derivation.
 *
 * Pure: computed from the boxes' current bounds, at draw time, by the
 * serializer and by the interaction overlay alike.
 */
import type { DepLayout, EntityLayout, FieldLayout, FieldLocator } from '../layout/layout.ts';
import { ENTITY_HEADER_HEIGHT, ROW_HEIGHT } from '../layout/layout.ts';
import { isQualifiedName, joinName, splitName } from '@xdbml/parse';
import { findFieldRow } from './ref-path.ts';

type HSide = 'left' | 'right';

interface Point {
  x: number;
  y: number;
}

/**
 * How far a junction stands out from the side of the downstream box, at
 * most: a third of the way to the nearest upstream end, so the curves
 * still have room to meet when the boxes stand close.
 */
export const JUNCTION_GAP = 36;
const JUNCTION_MIN_GAP = 14;
/** Length of an arrowhead along the line, and half its width. */
export const ARROW_LENGTH = 8;
export const ARROW_HALF_WIDTH = 4;
/** How far a curve between two ends on one side of the canvas bows out. */
const LOOP_REACH = 44;
/** An entity that depends on itself: the two ends of its loop, apart by twice this. */
const SELF_SPREAD = 7;
/** A loop on the left stays this far inside the canvas, whose left edge is at 0. */
const LEFT_LIMIT = 4;

export interface DepCurve {
  /** Index of the dependency in `DepLayout.dependencies`. */
  index: number;
  d: string;
  /** The dependency's own color, or undefined for the Dep's. */
  color?: string;
}

export interface DepGeometry {
  dep: DepLayout;
  /** One curve for each dependency whose two ends are on the canvas. */
  curves: DepCurve[];
  /** The straight trunk from each junction to its arrowhead. */
  trunks: string[];
  junctions: Point[];
  /** Arrowheads, as polygon points, one per downstream end. */
  arrows: string[];
  /** Where the Dep's name goes: above its first junction, or at the middle of its first curve. */
  label?: Point & { anchor: 'middle' | 'start' | 'end' };
}

/** The geometry of every Dep, against the boxes in `entities`. */
export function layoutDeps (deps: ReadonlyArray<DepLayout>, entities: ReadonlyArray<EntityLayout>): DepGeometry[] {
  const byId = new Map(entities.map((e) => [e.id, e]));
  return deps.map((d) => layoutDep(d, byId)).filter((g) => g.curves.length > 0);
}

export function layoutDep (dep: DepLayout, boxes: ReadonlyMap<string, EntityLayout>): DepGeometry {
  const out: DepGeometry = { dep, curves: [], trunks: [], junctions: [], arrows: [] };

  // Group the dependencies by their downstream end.
  const groups = new Map<string, Array<{ index: number; up: EntityLayout; upField?: string; color?: string }>>();
  const downOf = new Map<string, { box: EntityLayout; field?: string }>();
  dep.dependencies.forEach((d, index) => {
    const up = box(d.upstream, boxes);
    const down = box(d.downstream, boxes);
    if (!up || !down) return;
    const key = `${down.id}\u0000${d.downstream!.fieldName ?? ''}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      downOf.set(key, { box: down, field: d.downstream!.fieldName });
    }
    groups.get(key)!.push({ index, up, upField: d.upstream!.fieldName, ...(d.color ? { color: d.color } : {}) });
  });

  for (const [key, members] of groups) {
    const down = downOf.get(key)!;
    const B = down.box;
    // The downstream side faces the upstream boxes that stand apart from it;
    // when every upstream box shares its column, the curves loop on the right.
    const apart = members.filter((m) => !sameColumn(m.up, B));
    const side: HSide = apart.length > 0 && mean(apart.map((m) => centerX(m.up))) < centerX(B) ? 'left' : 'right';
    const out1 = side === 'left' ? -1 : 1;
    const self = members.length === 1 && members[0].up.id === B.id && !members[0].upField && !down.field;
    const tip = anchor(B, side, down.field, self ? SELF_SPREAD : 0);
    const base: Point = { x: tip.x + out1 * ARROW_LENGTH, y: tip.y };
    out.arrows.push(arrowPoints(tip, side));

    if (members.length >= 2) {
      const reach = Math.min(...members.map((m) => {
        const a = anchor(m.up, sameColumn(m.up, B) ? side : (centerX(m.up) < tip.x ? 'right' : 'left'), m.upField);
        return out1 * (a.x - tip.x) > 0 ? out1 * (a.x - tip.x) : Infinity;
      }));
      const gap = Math.max(JUNCTION_MIN_GAP, Math.min(JUNCTION_GAP, reach / 3));
      const j: Point = { x: tip.x + out1 * gap, y: tip.y };
      out.junctions.push(j);
      out.trunks.push(`M ${r(j.x)} ${r(j.y)} L ${r(base.x)} ${r(base.y)}`);
      for (const m of members) out.curves.push(curveTo(m, j, side, B, false));
    } else {
      out.curves.push(curveTo(members[0], base, side, B, self));
    }
  }

  out.curves.sort((a, b) => a.index - b.index);
  const name = dep.name;
  if (name !== undefined) {
    const j = out.junctions[0];
    if (j) {
      out.label = { x: j.x, y: j.y - 7, anchor: 'middle' };
    } else if (out.curves[0]) {
      const mid = curveMidpoint(out.curves[0].d);
      // A loop bows out to one side: its name goes beside it, not on it.
      const loop = out.curves[0].d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (mid && loop && Math.abs(loop[0] - loop[6]) < ARROW_LENGTH + 1) {
        out.label = mid.x > loop[0]
          ? { x: mid.x + 5, y: mid.y + 3, anchor: 'start' }
          : { x: mid.x - 5, y: mid.y + 3, anchor: 'end' };
      } else if (mid) {
        out.label = { x: mid.x, y: mid.y - 5, anchor: 'middle' };
      }
    }
  }
  return out;
}

function box (loc: FieldLocator | undefined, boxes: ReadonlyMap<string, EntityLayout>): EntityLayout | undefined {
  return loc ? boxes.get(loc.entityId) : undefined;
}

function centerX (e: EntityLayout): number {
  return e.bounds.x + e.bounds.width / 2;
}

function mean (xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** True when two boxes overlap horizontally, so no side of one faces the other. */
function sameColumn (a: EntityLayout, b: EntityLayout): boolean {
  if (a.id === b.id) return true;
  return a.bounds.x < b.bounds.x + b.bounds.width && b.bounds.x < a.bounds.x + a.bounds.width;
}

/** The point on a side of a box: the row of the field, or the middle of the header. */
function anchor (e: EntityLayout, side: HSide, field: string | undefined, shift = 0): Point {
  let y = e.bounds.y + ENTITY_HEADER_HEIGHT / 2;
  if (field) {
    const row = endRow(e, field);
    if (row) y = e.bounds.y + row.rowY + ROW_HEIGHT / 2;
  }
  return { x: side === 'right' ? e.bounds.x + e.bounds.width : e.bounds.x, y: y + shift };
}

/**
 * The row an end that names a field attaches to: the field's own row, or,
 * when a collapsed parent hides it, the nearest visible ancestor.
 */
export function endRow (e: EntityLayout, field: string): FieldLayout | undefined {
  const row = findFieldRow(e, field);
  if (row || !isQualifiedName(field)) return row;
  const segments = splitName(field);
  for (let cut = segments.length - 1; cut >= 1; cut -= 1) {
    const up = findFieldRow(e, joinName(segments.slice(0, cut)));
    if (up) return up;
  }
  return undefined;
}

/**
 * The ends of a Dep on the canvas, for highlighting it as a whole: the rows
 * of the fields it names, and the boxes it names with no field.
 */
export function depEnds (
  dep: DepLayout,
  entities: ReadonlyArray<EntityLayout>,
): { fields: Array<{ entityId: string; path: string }>; entities: string[] } {
  const byId = new Map(entities.map((e) => [e.id, e]));
  const fields = new Map<string, { entityId: string; path: string }>();
  const boxes = new Set<string>();
  for (const d of dep.dependencies) {
    for (const loc of [d.upstream, d.downstream]) {
      const e = loc ? byId.get(loc.entityId) : undefined;
      if (!e || !loc) continue;
      const row = loc.fieldName ? endRow(e, loc.fieldName) : undefined;
      if (row) fields.set(`${e.id}\u0000${row.path}`, { entityId: e.id, path: row.path });
      else boxes.add(e.id);
    }
  }
  return { fields: [...fields.values()], entities: [...boxes] };
}

/**
 * The rightmost and lowest points the curves of the Deps reach, so
 * the canvas grows to hold a loop that bows out past the boxes.
 */
export function depExtent (geometry: ReadonlyArray<DepGeometry>): { right: number; bottom: number } {
  let right = 0;
  let bottom = 0;
  for (const g of geometry) {
    for (const d of [...g.curves.map((c) => c.d), ...g.trunks]) {
      const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      if (n.length >= 8) {
        const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const u = 1 - t;
          const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
          const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      } else {
        for (let i = 0; i + 1 < n.length; i += 2) {
          right = Math.max(right, n[i]);
          bottom = Math.max(bottom, n[i + 1]);
        }
      }
    }
    // The name, when shown, at about 6 px a character in 10 px italics.
    if (g.label && g.dep.name !== undefined) {
      const w = g.dep.name.length * 6;
      right = Math.max(right, g.label.x + (g.label.anchor === 'start' ? w : g.label.anchor === 'middle' ? w / 2 : 0));
    }
  }
  return { right, bottom };
}

/**
 * A cubic curve from the upstream end to `to`, which it reaches heading
 * into the downstream box: from the right when the downstream side is
 * left, from the left when it is right.
 */
function curveTo (
  m: { index: number; up: EntityLayout; upField?: string; color?: string },
  to: Point,
  downSide: HSide,
  down: EntityLayout,
  self: boolean,
): DepCurve {
  const outTo = downSide === 'left' ? -1 : 1;
  let upSide: HSide;
  if (sameColumn(m.up, down)) upSide = downSide;
  else upSide = centerX(m.up) < to.x ? 'right' : 'left';
  const a = anchor(m.up, upSide, m.upField, self ? -SELF_SPREAD : 0);
  const outA = upSide === 'right' ? 1 : -1;

  let c1: Point;
  let c2: Point;
  if (upSide === downSide) {
    // Both ends on one side: the curve bows out past the further of the two.
    const reach = LOOP_REACH + Math.abs(a.y - to.y) * 0.15;
    const x = outA > 0 ? Math.max(a.x, to.x) + reach : Math.max(LEFT_LIMIT, Math.min(a.x, to.x) - reach);
    c1 = { x, y: a.y };
    c2 = { x, y: to.y };
  } else {
    const k = Math.max(30, Math.abs(to.x - a.x) * 0.5);
    c1 = { x: a.x + outA * k, y: a.y };
    c2 = { x: to.x + outTo * k, y: to.y };
  }
  return {
    index: m.index,
    d: `M ${r(a.x)} ${r(a.y)} C ${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(to.x)} ${r(to.y)}`,
    ...(m.color ? { color: m.color } : {}),
  };
}

/** An arrowhead with its tip on the side of the box, pointing into it. */
function arrowPoints (tip: Point, side: HSide): string {
  const back = side === 'left' ? -ARROW_LENGTH : ARROW_LENGTH;
  return `${r(tip.x)},${r(tip.y)} ${r(tip.x + back)},${r(tip.y - ARROW_HALF_WIDTH)} ${r(tip.x + back)},${r(tip.y + ARROW_HALF_WIDTH)}`;
}

/** The point at t = 0.5 of a path `M x y C x1 y1 x2 y2 x y`. */
export function curveMidpoint (d: string): Point | undefined {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!n || n.length < 8) return undefined;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  return { x: (x0 + 3 * x1 + 3 * x2 + x3) / 8, y: (y0 + 3 * y1 + 3 * y2 + y3) / 8 };
}

function r (n: number): number {
  return Math.round(n * 10) / 10;
}
