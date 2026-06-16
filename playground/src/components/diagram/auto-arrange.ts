/**
 * Auto-arrange: compute entity positions according to a named strategy and
 * return a `UserPositions` map that the canvas overlays through
 * `applyUserPositions`, exactly like dragged positions. So an applied
 * arrangement persists and is reversible via the existing "Reset positions".
 *
 * Strategies:
 *   - 'relational': a general FK web. Each connected component is placed on
 *     a lane grid, hubs first, then refined by a few barycentre sweeps to
 *     shorten edges and cut crossings. Suits normalized / OLTP schemas.
 *   - 'star': dimensional. The most-referencing entity is treated as the
 *     fact and its dimensions are placed on the four sides around it
 *     (so most fact->dim edges are straight under orthogonal routing).
 *     Several facts that share dimensions (a constellation, e.g. conformed
 *     dimensions) put the shared dims in a band between the facts.
 *
 * Container membership is respected: each container's members are arranged
 * as one block and the blocks are packed, so the auto-derived container
 * boxes stay tight and non-overlapping. Output is snapped to the canvas
 * grid pitch so orthogonal edges run in clean channels.
 */
import type { DiagramModel, EntityLayout, UserPositions } from './layout.ts';
import { CANVAS_MARGIN } from './layout.ts';

export type ArrangeStrategy = 'relational' | 'star';

const GRID = 20;        // canvas grid pitch (CSS background-size: 20px 20px)
const GUTTER_X = 64;    // horizontal gap between entity columns
const GUTTER_Y = 56;    // vertical gap between entity rows
const BLOCK_GAP = 96;   // gap between packed container / component blocks
const SWEEPS = 3;       // barycentre refinement passes (relational)

interface XY { x: number; y: number; }
interface Cell { col: number; row: number; }
interface Block { pos: Map<string, XY>; width: number; height: number; }

const snap = (v: number): number => Math.round(v / GRID) * GRID;

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export function autoArrange (
  diagram: DiagramModel,
  strategy: ArrangeStrategy,
): UserPositions {
  if (diagram.entities.length === 0) return new Map();

  const sizeOf = new Map<string, { w: number; h: number }>();
  let laneW = 0;
  let laneH = 0;
  for (const e of diagram.entities) {
    sizeOf.set(e.id, { w: e.bounds.width, h: e.bounds.height });
    laneW = Math.max(laneW, e.bounds.width);
    laneH = Math.max(laneH, e.bounds.height);
  }
  laneW += GUTTER_X;
  laneH += GUTTER_Y;

  // Group by container so each container's members stay contiguous.
  const groups = new Map<string, EntityLayout[]>();
  for (const e of diagram.entities) {
    const key = e.containerName ?? '';
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const blocks: Block[] = [];
  for (const members of groups.values()) {
    const pos = strategy === 'star'
      ? layoutStar(members, diagram, sizeOf, laneW, laneH)
      : layoutRelational(members, diagram, sizeOf, laneW, laneH);
    blocks.push(toBlock(pos, sizeOf));
  }

  const out = new Map<string, XY>();
  for (const { block, ox, oy } of packBlocks(blocks)) {
    for (const [id, p] of block.pos) {
      out.set(id, { x: snap(p.x + ox + CANVAS_MARGIN), y: snap(p.y + oy + CANVAS_MARGIN) });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Graph extraction                                                    */
/* ------------------------------------------------------------------ */

interface Graph {
  ids: string[];
  adj: Map<string, Map<string, number>>;   // undirected, weighted
  refsOut: Map<string, Set<string>>;        // FK holder -> referenced
}

function buildGraph (members: EntityLayout[], diagram: DiagramModel): Graph {
  const ids = members.map((m) => m.id);
  const idSet = new Set(ids);
  const adj = new Map<string, Map<string, number>>();
  const refsOut = new Map<string, Set<string>>();
  for (const id of ids) {
    adj.set(id, new Map());
    refsOut.set(id, new Set());
  }
  const bump = (a: string, b: string): void => {
    const m = adj.get(a);
    if (m) m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (const ref of diagram.refs) {
    if (ref.unresolved || !ref.source || !ref.target) continue;
    const s = ref.source.entityId;
    const t = ref.target.entityId;
    if (s === t || !idSet.has(s) || !idSet.has(t)) continue;
    bump(s, t);
    bump(t, s);
    // Orient FK direction by cardinality operator: '>' => source holds the
    // FK and references target; '<' => the reverse. '-' / '<>' carry no
    // clear direction and are left out of the directed view.
    if (ref.operator === '>') refsOut.get(s)?.add(t);
    else if (ref.operator === '<') refsOut.get(t)?.add(s);
  }
  return { ids, adj, refsOut };
}

function neighbors (id: string, adj: Map<string, Map<string, number>>): string[] {
  return [...(adj.get(id)?.keys() ?? [])];
}

function weight (a: string, b: string, adj: Map<string, Map<string, number>>): number {
  return adj.get(a)?.get(b) ?? 0;
}

function degree (id: string, adj: Map<string, Map<string, number>>): number {
  let d = 0;
  for (const w of adj.get(id)?.values() ?? []) d += w;
  return d;
}

/* ------------------------------------------------------------------ */
/* Relational strategy                                                 */
/* ------------------------------------------------------------------ */

function layoutRelational (
  members: EntityLayout[],
  diagram: DiagramModel,
  sizeOf: Map<string, { w: number; h: number }>,
  laneW: number,
  laneH: number,
): Map<string, XY> {
  const g = buildGraph(members, diagram);
  const comps = connectedComponents(g.ids, g.adj);

  // Lay out each connected component on its own cell grid, then pack the
  // component blocks side by side.
  const compBlocks: Block[] = [];
  for (const comp of comps) {
    const cells = gridPlace(comp, g.adj);
    const pos = cellsToPixels(cells, laneW, laneH);
    compBlocks.push(toBlock(pos, sizeOf));
  }
  const pos = new Map<string, XY>();
  for (const { block, ox, oy } of packBlocks(compBlocks)) {
    for (const [id, p] of block.pos) pos.set(id, { x: p.x + ox, y: p.y + oy });
  }
  return pos;
}

function gridPlace (comp: string[], adj: Map<string, Map<string, number>>): Map<string, Cell> {
  const cell = new Map<string, Cell>();
  if (comp.length === 1) {
    cell.set(comp[0] as string, { col: 0, row: 0 });
    return cell;
  }
  const occupied = new Set<string>();
  const key = (c: Cell): string => `${c.col},${c.row}`;
  const order = bfsOrder(comp, adj);

  for (const node of order) {
    const placed = neighbors(node, adj).filter((n) => cell.has(n));
    const target = placed.length === 0
      ? { col: 0, row: 0 }
      : barycentre(node, placed, cell, adj);
    const c = nearestFree(target, occupied);
    cell.set(node, c);
    occupied.add(key(c));
  }

  for (let s = 0; s < SWEEPS; s++) {
    for (const node of order) {
      const placed = neighbors(node, adj).filter((n) => cell.has(n) && n !== node);
      if (placed.length === 0) continue;
      const cur = cell.get(node) as Cell;
      const target = barycentre(node, placed, cell, adj);
      occupied.delete(key(cur));
      const cand = nearestFree(target, occupied);
      if (cost(node, cand, cell, adj) < cost(node, cur, cell, adj)) {
        cell.set(node, cand);
        occupied.add(key(cand));
      } else {
        occupied.add(key(cur));
      }
    }
  }
  return cell;
}

function barycentre (
  node: string,
  placed: string[],
  cell: Map<string, Cell>,
  adj: Map<string, Map<string, number>>,
): Cell {
  let sc = 0; let sr = 0; let sw = 0;
  for (const n of placed) {
    const c = cell.get(n);
    if (!c) continue;
    const w = weight(node, n, adj) || 1;
    sc += c.col * w; sr += c.row * w; sw += w;
  }
  if (sw === 0) return { col: 0, row: 0 };
  return { col: Math.round(sc / sw), row: Math.round(sr / sw) };
}

function cost (
  node: string,
  c: Cell,
  cell: Map<string, Cell>,
  adj: Map<string, Map<string, number>>,
): number {
  let total = 0;
  for (const n of neighbors(node, adj)) {
    const nc = cell.get(n);
    if (!nc || n === node) continue;
    total += (weight(node, n, adj) || 1) * (Math.abs(c.col - nc.col) + Math.abs(c.row - nc.row));
  }
  return total;
}

// Spiral outward from the rounded target to the first unoccupied cell.
function nearestFree (target: Cell, occupied: Set<string>): Cell {
  const key = (col: number, row: number): string => `${col},${row}`;
  if (!occupied.has(key(target.col, target.row))) return { ...target };
  for (let r = 1; r < 256; r++) {
    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue; // ring only
        const col = target.col + dc;
        const row = target.row + dr;
        if (!occupied.has(key(col, row))) return { col, row };
      }
    }
  }
  return { ...target };
}

/* ------------------------------------------------------------------ */
/* Star / constellation strategy                                       */
/* ------------------------------------------------------------------ */

function layoutStar (
  members: EntityLayout[],
  diagram: DiagramModel,
  sizeOf: Map<string, { w: number; h: number }>,
  laneW: number,
  laneH: number,
): Map<string, XY> {
  const g = buildGraph(members, diagram);
  if (g.ids.length <= 2) return layoutRelational(members, diagram, sizeOf, laneW, laneH);

  const fanOut = (id: string): number => g.refsOut.get(id)?.size ?? 0;
  let maxFan = 0;
  for (const id of g.ids) maxFan = Math.max(maxFan, fanOut(id));
  if (maxFan === 0) return layoutRelational(members, diagram, sizeOf, laneW, laneH);

  let facts = g.ids.filter((id) => fanOut(id) >= 2 && fanOut(id) >= maxFan - 1);
  if (facts.length === 0) facts = [g.ids.reduce((a, b) => (fanOut(b) > fanOut(a) ? b : a))];

  return facts.length === 1
    ? starSingle(facts[0] as string, g, sizeOf, laneW, laneH)
    : starConstellation(facts, g, sizeOf, laneW, laneH);
}

function starSingle (
  fact: string,
  g: Graph,
  sizeOf: Map<string, { w: number; h: number }>,
  laneW: number,
  laneH: number,
): Map<string, XY> {
  const referenced = g.refsOut.get(fact) ?? new Set<string>();
  const dims = g.ids.filter((id) => id !== fact && referenced.has(id));
  const leftovers = g.ids.filter((id) => id !== fact && !referenced.has(id));
  const all = [...dims, ...leftovers]; // satellites share the ring

  // Fill sides in an order that yields straight edges first: right, left,
  // bottom, top, round-robin so the four sides stay balanced.
  const sides: Record<'right' | 'left' | 'top' | 'bottom', string[]> =
    { right: [], left: [], top: [], bottom: [] };
  const seq: Array<'right' | 'left' | 'bottom' | 'top'> = ['right', 'left', 'bottom', 'top'];
  all.forEach((id, i) => { sides[seq[i % 4] as keyof typeof sides].push(id); });

  // Coordinate frame: fact centre at (0,0); normalize at the end.
  const pos = new Map<string, XY>();
  const place = (id: string, cx: number, cy: number): void => {
    const s = sizeOf.get(id) ?? { w: 0, h: 0 };
    pos.set(id, { x: cx - s.w / 2, y: cy - s.h / 2 });
  };
  place(fact, 0, 0);

  const spread = (n: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2));
    return out;
  };

  spread(sides.right.length).forEach((k, i) => place(sides.right[i] as string, laneW, k * laneH));
  spread(sides.left.length).forEach((k, i) => place(sides.left[i] as string, -laneW, k * laneH));
  spread(sides.top.length).forEach((k, i) => place(sides.top[i] as string, k * laneW, -laneH));
  spread(sides.bottom.length).forEach((k, i) => place(sides.bottom[i] as string, k * laneW, laneH));

  return normalize(pos);
}

function starConstellation (
  facts: string[],
  g: Graph,
  sizeOf: Map<string, { w: number; h: number }>,
  laneW: number,
  laneH: number,
): Map<string, XY> {
  // Which facts reference each dim.
  const usersOf = new Map<string, string[]>();
  for (const f of facts) {
    for (const d of g.refsOut.get(f) ?? []) {
      if (facts.includes(d)) continue;
      const u = usersOf.get(d) ?? [];
      u.push(f);
      usersOf.set(d, u);
    }
  }
  const shared: string[] = [];
  const exclusive = new Map<string, string[]>(); // fact -> its private dims
  for (const f of facts) exclusive.set(f, []);
  for (const [dim, users] of usersOf) {
    if (users.length >= 2) shared.push(dim);
    else exclusive.get(users[0] as string)?.push(dim);
  }

  const pos = new Map<string, XY>();
  const place = (id: string, cx: number, cy: number): void => {
    const s = sizeOf.get(id) ?? { w: 0, h: 0 };
    pos.set(id, { x: cx - s.w / 2, y: cy - s.h / 2 });
  };

  // Facts in a centred row at y = 0.
  const factX = new Map<string, number>();
  facts.forEach((f, i) => {
    const cx = (i - (facts.length - 1) / 2) * laneW * 1.6;
    factX.set(f, cx);
    place(f, cx, 0);
  });

  // Shared (conformed) dims in a band above, centred over the facts.
  shared.forEach((d, i) => {
    const cx = (i - (shared.length - 1) / 2) * laneW;
    place(d, cx, -laneH * 1.4);
  });

  // Each fact's exclusive dims in a column below it.
  for (const f of facts) {
    const priv = exclusive.get(f) ?? [];
    const cx = factX.get(f) ?? 0;
    priv.forEach((d, i) => place(d, cx, laneH * (1.4 + i)));
  }

  // Any entity not yet placed (unreferenced satellite): drop to a tail row.
  let tail = 0;
  for (const id of g.ids) {
    if (pos.has(id)) continue;
    place(id, (tail - 0) * laneW, laneH * 3);
    tail++;
  }

  return normalize(pos);
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

function connectedComponents (
  ids: string[],
  adj: Map<string, Map<string, number>>,
): string[][] {
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop() as string;
      comp.push(n);
      for (const m of neighbors(n, adj)) {
        if (!seen.has(m)) { seen.add(m); stack.push(m); }
      }
    }
    comps.push(comp);
  }
  // Largest components first so they anchor the packing.
  comps.sort((a, b) => b.length - a.length);
  return comps;
}

function bfsOrder (comp: string[], adj: Map<string, Map<string, number>>): string[] {
  const inComp = new Set(comp);
  const seed = comp.reduce((a, b) => (degree(b, adj) > degree(a, adj) ? b : a));
  const order: string[] = [];
  const seen = new Set<string>([seed]);
  const queue = [seed];
  while (queue.length) {
    const n = queue.shift() as string;
    order.push(n);
    // visit higher-weight neighbours first so tightly-coupled nodes cluster
    const nbs = neighbors(n, adj)
      .filter((m) => inComp.has(m) && !seen.has(m))
      .sort((x, y) => weight(n, y, adj) - weight(n, x, adj));
    for (const m of nbs) { seen.add(m); queue.push(m); }
  }
  // any stragglers (shouldn't happen within a component)
  for (const n of comp) if (!seen.has(n)) order.push(n);
  return order;
}

function cellsToPixels (cells: Map<string, Cell>, laneW: number, laneH: number): Map<string, XY> {
  const pos = new Map<string, XY>();
  for (const [id, c] of cells) pos.set(id, { x: c.col * laneW, y: c.row * laneH });
  return pos;
}

function normalize (pos: Map<string, XY>): Map<string, XY> {
  let minX = Infinity; let minY = Infinity;
  for (const p of pos.values()) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
  if (!isFinite(minX)) return pos;
  const out = new Map<string, XY>();
  for (const [id, p] of pos) out.set(id, { x: p.x - minX, y: p.y - minY });
  return out;
}

function toBlock (pos: Map<string, XY>, sizeOf: Map<string, { w: number; h: number }>): Block {
  if (pos.size === 0) return { pos, width: 0, height: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [id, p] of pos) {
    const s = sizeOf.get(id) ?? { w: 0, h: 0 };
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.w);
    maxY = Math.max(maxY, p.y + s.h);
  }
  const norm = new Map<string, XY>();
  for (const [id, p] of pos) norm.set(id, { x: p.x - minX, y: p.y - minY });
  return { pos: norm, width: maxX - minX, height: maxY - minY };
}

// Shelf packing: place blocks left to right, wrap to a new row past a
// target width chosen to keep the whole arrangement roughly square.
function packBlocks (blocks: Block[]): Array<{ block: Block; ox: number; oy: number }> {
  if (blocks.length === 1) return [{ block: blocks[0] as Block, ox: 0, oy: 0 }];
  let area = 0; let widest = 0;
  for (const b of blocks) { area += b.width * b.height; widest = Math.max(widest, b.width); }
  const target = Math.max(widest, Math.sqrt(area) * 1.4);

  const out: Array<{ block: Block; ox: number; oy: number }> = [];
  let x = 0; let y = 0; let rowH = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > target) { x = 0; y += rowH + BLOCK_GAP; rowH = 0; }
    out.push({ block: b, ox: x, oy: y });
    x += b.width + BLOCK_GAP;
    rowH = Math.max(rowH, b.height);
  }
  return out;
}
