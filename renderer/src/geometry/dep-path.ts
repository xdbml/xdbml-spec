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
 * From v0.7.2 a dependency may carry a kind of transformation (§27.10.6).
 * The direct kinds keep the solid curve and the junction; the indirect
 * kinds (join, lookup, filter, group by, conditional) draw dashed, the
 * ends of one line meeting at a junction of their own. A pill names the
 * kind at the junction, or at the middle of the curve when there is none;
 * `identity` shows none, except between two entities, where it marks a
 * copy. Several groups that end at one row or one header spread their
 * arrowheads a little, so each stays visible.
 *
 * Pure: computed from the boxes' current bounds, at draw time, by the
 * serializer and by the interaction overlay alike.
 */
import type { DepLayout, EntityLayout, FieldLayout, FieldLocator } from '../layout/layout.ts';
import { ENTITY_HEADER_HEIGHT, ROW_HEIGHT, isIndirectDependency } from '../layout/layout.ts';
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
/** Vertical step between the arrowheads of groups that end at one row or one header. */
const TIP_SPREAD = 6;

/** The text of a pill for a kind of transformation: `group_by` reads `group by`. */
export function transformationLabel (kind: string): string {
  return kind.replace(/_/g, ' ');
}

/** Width of a pill for its text: about 5.4 px a character in 9 px type, plus padding. */
export function pillWidth (text: string): number {
  return Math.round(text.length * 5.4 + 10);
}
export const PILL_HEIGHT = 13;

/** Whether a pill stands at a junction: the pill then marks it, and no dot is drawn. */
export function pillAt (g: DepGeometry, j: Point): boolean {
  return g.pills.some((p) => p.x === j.x && p.y === j.y);
}

export interface DepCurve {
  /** Index of the dependency in `DepLayout.dependencies`. */
  index: number;
  d: string;
  /** The dependency's own color, or undefined for the Dep's. */
  color?: string;
  /** An indirect kind of transformation: drawn dashed (§27.10.6). */
  dashed?: boolean;
}

/** A pill that names a kind of transformation (§27.10.6). */
export interface DepPill extends Point {
  text: string;
  /** The color of the curves it names, or undefined for the Dep's. */
  color?: string;
  /** It names an indirect kind: its border is dashed, as its curves are. */
  dashed?: boolean;
}

export interface DepGeometry {
  dep: DepLayout;
  /** One curve for each dependency whose two ends are on the canvas. */
  curves: DepCurve[];
  /** The straight trunk from each junction to its arrowhead. */
  trunks: string[];
  /** For each trunk, whether its group is indirect, so that it draws dashed. */
  trunkDashed: boolean[];
  junctions: Point[];
  /** The kinds of transformation, at a junction or at the middle of a curve (v0.7.2). */
  pills: DepPill[];
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

type Member = { index: number; up: EntityLayout; upField?: string; color?: string };

interface Group {
  members: Member[];
  box: EntityLayout;
  field?: string;
  /** The indirect line it draws, or undefined for the direct group of its end. */
  indirect: boolean;
  /** The kind the group's pill names, if any. */
  kind?: string;
  side: HSide;
}

export function layoutDep (dep: DepLayout, boxes: ReadonlyMap<string, EntityLayout>): DepGeometry {
  const out: DepGeometry = { dep, curves: [], trunks: [], trunkDashed: [], junctions: [], pills: [], arrows: [] };

  // Group the dependencies by their downstream end: the direct ones of an
  // end together, and the indirect ones by the line that states them.
  const groups = new Map<string, Group>();
  const kinds = new Map<string, Set<string | undefined>>();
  const onCurve: Array<{ d: string; text: string; color?: string; dashed?: boolean }> = [];
  dep.dependencies.forEach((d, index) => {
    const up = box(d.upstream, boxes);
    const down = box(d.downstream, boxes);
    if (!up || !down) return;
    const indirect = isIndirectDependency(d);
    const key = `${down.id}\u0000${d.downstream!.fieldName ?? ''}\u0000${indirect ? `i${d.line ?? index}` : 'd'}`;
    if (!groups.has(key)) {
      groups.set(key, { members: [], box: down, field: d.downstream!.fieldName, indirect, side: 'right' });
      kinds.set(key, new Set());
    }
    groups.get(key)!.members.push({ index, up, upField: d.upstream!.fieldName, ...(d.color ? { color: d.color } : {}) });
    kinds.get(key)!.add(d.transformation);
  });

  for (const [key, g] of groups) {
    // The downstream side faces the upstream boxes that stand apart from it;
    // when every upstream box shares its column, the curves loop on the right.
    const apart = g.members.filter((m) => !sameColumn(m.up, g.box));
    g.side = apart.length > 0 && mean(apart.map((m) => centerX(m.up))) < centerX(g.box) ? 'left' : 'right';
    // A pill names the kind its members share; mixed kinds name none.
    const ks = [...kinds.get(key)!];
    const kind = ks.length === 1 ? ks[0] : undefined;
    const copy = !g.field && g.members.every((m) => !m.upField);
    if (kind && (kind !== 'identity' || copy)) g.kind = kind;
  }

  // Groups that end at one row or one header, on one side, spread their
  // arrowheads, in the order of their upstream ends, top to bottom.
  const atTip = new Map<string, Group[]>();
  for (const g of groups.values()) {
    const k = `${g.box.id}\u0000${g.field ?? ''}\u0000${g.side}`;
    if (!atTip.has(k)) atTip.set(k, []);
    atTip.get(k)!.push(g);
  }
  const shiftOf = new Map<Group, number>();
  for (const list of atTip.values()) {
    if (list.length < 2) continue;
    const upY = (g: Group) => mean(g.members.map((m) => anchor(m.up, 'left', m.upField).y));
    list.sort((a, b) => upY(a) - upY(b));
    const room = (list[0].field ? ROW_HEIGHT : ENTITY_HEADER_HEIGHT) / 2 - 3;
    // Pills at junctions stand one above the other: they need a pill's height.
    const pills = list.some((g) => g.kind && g.members.length >= 2);
    const step = Math.min(pills ? PILL_HEIGHT + 2 : TIP_SPREAD, (2 * room) / (list.length - 1));
    list.forEach((g, i) => shiftOf.set(g, (i - (list.length - 1) / 2) * step));
  }

  for (const g of groups.values()) {
    const { members, side } = g;
    const B = g.box;
    const out1 = side === 'left' ? -1 : 1;
    const self = members.length === 1 && members[0].up.id === B.id && !members[0].upField && !g.field;
    const tip = anchor(B, side, g.field, (self ? SELF_SPREAD : 0) + (shiftOf.get(g) ?? 0));
    const base: Point = { x: tip.x + out1 * ARROW_LENGTH, y: tip.y };
    out.arrows.push(arrowPoints(tip, side));
    const pillColor = members.length > 0 && members.every((m) => m.color && m.color === members[0].color) ? members[0].color : undefined;

    if (members.length >= 2) {
      const reach = Math.min(...members.map((m) => {
        const a = anchor(m.up, sameColumn(m.up, B) ? side : (centerX(m.up) < tip.x ? 'right' : 'left'), m.upField);
        return out1 * (a.x - tip.x) > 0 ? out1 * (a.x - tip.x) : Infinity;
      }));
      // A pill at the junction needs room beside the arrowhead.
      const wanted = g.kind ? Math.max(JUNCTION_GAP, pillWidth(transformationLabel(g.kind)) / 2 + ARROW_LENGTH + 6) : JUNCTION_GAP;
      const gap = Math.max(JUNCTION_MIN_GAP, Math.min(wanted, reach / (g.kind ? 2 : 3)));
      const j: Point = { x: tip.x + out1 * gap, y: tip.y };
      out.junctions.push(j);
      out.trunks.push(`M ${r(j.x)} ${r(j.y)} L ${r(base.x)} ${r(base.y)}`);
      out.trunkDashed.push(g.indirect);
      for (const m of members) out.curves.push({ ...curveTo(m, j, side, B, false), ...(g.indirect ? { dashed: true } : {}) });
      if (g.kind) out.pills.push({ x: j.x, y: j.y, text: transformationLabel(g.kind), ...(pillColor ? { color: pillColor } : {}), ...(g.indirect ? { dashed: true } : {}) });
    } else {
      const c = { ...curveTo(members[0], base, side, B, self), ...(g.indirect ? { dashed: true } : {}) };
      out.curves.push(c);
      if (g.kind) onCurve.push({ d: c.d, text: transformationLabel(g.kind), ...(pillColor ? { color: pillColor } : {}), ...(g.indirect ? { dashed: true } : {}) });
    }
  }

  // A pill on a curve goes at its middle, or, when another pill of the Dep
  // stands there, a little toward one end.
  for (const p of onCurve) {
    const w = pillWidth(p.text);
    for (const t of [0.5, 0.36, 0.64, 0.25, 0.75]) {
      const at = curvePoint(p.d, t);
      if (!at) break;
      const free = out.pills.every((q) =>
        Math.abs(q.x - at.x) * 2 >= w + pillWidth(q.text) + 4 || Math.abs(q.y - at.y) >= PILL_HEIGHT + 2);
      if (free || t === 0.75) {
        out.pills.push({ x: r(at.x), y: r(at.y), text: p.text, ...(p.color ? { color: p.color } : {}), ...(p.dashed ? { dashed: true } : {}) });
        break;
      }
    }
  }

  out.curves.sort((a, b) => a.index - b.index);
  const name = dep.name;
  if (name !== undefined) {
    const j = out.junctions[0];
    // A pill where the name goes pushes the name above it.
    const lift = (p: Point): number => (out.pills.some((x) => Math.abs(x.x - p.x) < 1 && Math.abs(x.y - p.y) < 1) ? PILL_HEIGHT / 2 + 2 : 0);
    if (j) {
      out.label = { x: j.x, y: j.y - 7 - lift(j), anchor: 'middle' };
    } else if (out.curves[0]) {
      const mid = curveMidpoint(out.curves[0].d);
      // A loop bows out to one side: its name goes beside it, not on it.
      const loop = out.curves[0].d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      if (mid && loop && Math.abs(loop[0] - loop[6]) < ARROW_LENGTH + 1) {
        out.label = mid.x > loop[0]
          ? { x: mid.x + 5, y: mid.y + 3, anchor: 'start' }
          : { x: mid.x - 5, y: mid.y + 3, anchor: 'end' };
      } else if (mid) {
        out.label = { x: mid.x, y: mid.y - 5 - lift({ x: r(mid.x), y: r(mid.y) }), anchor: 'middle' };
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

/** The point at `t` of a path `M x y C x1 y1 x2 y2 x y`. */
function curvePoint (d: string, t: number): Point | undefined {
  const n = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!n || n.length < 8) return undefined;
  const [x0, y0, x1, y1, x2, y2, x3, y3] = n;
  const u = 1 - t;
  return {
    x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
    y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
  };
}

function r (n: number): number {
  return Math.round(n * 10) / 10;
}
