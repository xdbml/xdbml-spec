/**
 * Supertype group geometry (spec §12.9).
 *
 * A group is drawn as a half-circle below its supertype: the rounded side
 * faces the supertype, the flat base faces the subtypes. One line runs from
 * the supertype's bottom edge to the top of the curve; one line leaves the
 * middle of the base, reaches a horizontal bus, and drops orthogonally to
 * each subtype. Marks inside the symbol show the settings of §12.3: a cross
 * for `exclusivity: disjoint`, a bar just above the base for
 * `completeness: total`, each drawn dashed when the setting is unstated.
 *
 * When one supertype anchors several groups, their lines leave its bottom
 * edge at evenly spaced points, in declaration order. Geometry is computed
 * from the entities' current bounds at draw time, like relationship lines,
 * so it follows a drag without a rebuild.
 *
 * First phase: subtypes are expected below the supertype. A subtype dragged
 * above still gets an orthogonal drop, to its bottom edge.
 */

import type { DiagramModel, EntityLayout, SupertypeGroupLayout } from '../layout/layout.ts';

export const SYMBOL_RADIUS = 11;
/** Supertype bottom edge to the top of the curve. */
export const SYMBOL_STEM = 16;
/** Distance of the total-completeness bar above the base. */
const BAR_INSET = 3.5;
/** Minimum run from the base down to the bus. */
const BUS_MIN = 12;
/** Bus distance above the nearest subtype below it. */
const BUS_GAP = 16;
/**
 * Vertical offset between the buses of groups that share a supertype, so two
 * buses at the same height never read as one line.
 */
const BUS_STAGGER = 9;

export interface SupertypeGroupGeometry {
  group: SupertypeGroupLayout;
  /** X of the symbol's axis, which is also where the stem leaves the supertype. */
  cx: number;
  /** Y of the top of the curve. */
  topY: number;
  /** Y of the flat base. */
  baseY: number;
  r: number;
  /** The half-circle outline, closed along the base. */
  shape: string;
  /** Supertype bottom edge to the top of the curve. */
  stem: string;
  /** Base to the bus, then one orthogonal drop per subtype. */
  branches: string;
  cross?: { d: string; dashed: boolean };
  bar?: { d: string; dashed: boolean };
  /**
   * Where a group-name label sits. Groups in the left half of a supertype's
   * bottom edge put their label on the left of the symbol, the others on the
   * right, so a label never runs into the next group's symbol.
   */
  label: { x: number; y: number; anchor: 'start' | 'end' };
}

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** X at which the `index`-th of `count` groups leaves the supertype's bottom edge. */
export function supertypeGroupAnchorX (supertype: EntityLayout, index: number, count: number): number {
  return r1(supertype.bounds.x + (supertype.bounds.width * (index + 1)) / (count + 1));
}

/**
 * Geometry for every drawable group of a model: the supertype and at least
 * one subtype resolve to entities on the canvas.
 */
export function layoutSupertypeGroups (model: DiagramModel): SupertypeGroupGeometry[] {
  const byId = new Map<string, EntityLayout>();
  for (const e of model.entities) byId.set(e.id, e);

  const perSupertype = new Map<string, SupertypeGroupLayout[]>();
  for (const g of model.supertypeGroups) {
    if (g.unresolved || !byId.has(g.supertypeId)) continue;
    const list = perSupertype.get(g.supertypeId) ?? [];
    list.push(g);
    perSupertype.set(g.supertypeId, list);
  }

  const out: SupertypeGroupGeometry[] = [];
  const r = SYMBOL_RADIUS;
  for (const [supId, groups] of perSupertype) {
    const sup = byId.get(supId) as EntityLayout;
    groups.forEach((g, i) => {
      const subs = g.subtypeIds
        .map((id) => byId.get(id))
        .filter((e): e is EntityLayout => e !== undefined);
      if (subs.length === 0) return;

      const cx = supertypeGroupAnchorX(sup, i, groups.length);
      const y0 = sup.bounds.y + sup.bounds.height;
      const topY = y0 + SYMBOL_STEM;
      const baseY = topY + r;

      const below = subs.filter((s) => s.bounds.y >= baseY + BUS_MIN + 4);
      const stagger = i * BUS_STAGGER;
      const busY = r1(below.length > 0
        ? Math.max(baseY + BUS_MIN, Math.min(...below.map((s) => s.bounds.y)) - BUS_GAP - stagger)
        : baseY + BUS_MIN);

      let branches = `M ${cx} ${baseY} L ${cx} ${busY}`;
      for (const s of subs) {
        const tx = r1(s.bounds.x + s.bounds.width / 2);
        const ty = s.bounds.y >= busY ? s.bounds.y : s.bounds.y + s.bounds.height;
        branches += ` M ${cx} ${busY} L ${tx} ${busY} L ${tx} ${r1(ty)}`;
      }

      const markY = r1(baseY - BAR_INSET);
      const ux = 0.7 * r;
      const uy = Math.sqrt(r * r - ux * ux);
      const lx = 0.45 * r;
      const crossD =
        `M ${r1(cx - ux)} ${r1(baseY - uy)} L ${r1(cx + lx)} ${markY} ` +
        `M ${r1(cx + ux)} ${r1(baseY - uy)} L ${r1(cx - lx)} ${markY}`;
      const bw = Math.sqrt(r * r - BAR_INSET * BAR_INSET);
      const barD = `M ${r1(cx - bw)} ${markY} L ${r1(cx + bw)} ${markY}`;

      out.push({
        group: g,
        cx,
        topY,
        baseY,
        r,
        shape: `M ${cx - r} ${baseY} A ${r} ${r} 0 0 1 ${cx + r} ${baseY} Z`,
        stem: `M ${cx} ${y0} L ${cx} ${topY}`,
        branches,
        cross: g.exclusivity === 'overlapping' ? undefined : { d: crossD, dashed: g.exclusivity === undefined },
        bar: g.completeness === 'partial' ? undefined : { d: barD, dashed: g.completeness === undefined },
        label: i < (groups.length - 1) / 2
          ? { x: r1(cx - r - 5), y: r1(topY + r * 0.45), anchor: 'end' }
          : { x: r1(cx + r + 5), y: r1(topY + r * 0.45), anchor: 'start' },
      });
    });
  }
  return out;
}

/**
 * Midpoint of the longest segment of an orthogonal `M x y L x y ...` path,
 * with the segment's orientation. Used to seat a relationship-name label.
 */
export function longestSegmentMidpoint (d: string): { x: number; y: number; horizontal: boolean } | undefined {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) return undefined;
  let best: { x: number; y: number; horizontal: boolean; len: number } | undefined;
  for (let i = 0; i + 3 < nums.length; i += 2) {
    const [x1, y1, x2, y2] = [nums[i], nums[i + 1], nums[i + 2], nums[i + 3]] as [number, number, number, number];
    const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
    if (!best || len > best.len) {
      best = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, horizontal: Math.abs(x2 - x1) >= Math.abs(y2 - y1), len };
    }
  }
  return best ? { x: r1(best.x), y: r1(best.y), horizontal: best.horizontal } : undefined;
}
