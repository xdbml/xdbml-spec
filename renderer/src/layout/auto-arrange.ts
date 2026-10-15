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
 *     The sources of data lineage (spec §27) stand on the left: an entity
 *     sits to the right of the entities it is computed from, where the grid
 *     allows. A
 *     block whose entities are mostly linked by lineage is laid out in
 *     layers instead, as a pipeline reads: sources in the first column,
 *     each entity in the column after those it is computed from.
 *   - 'star': dimensional. The most-referencing entity is treated as the
 *     fact and its dimensions are placed on the four sides around it
 *     (so most fact->dim edges are straight under orthogonal routing).
 *     Several facts that share dimensions (a constellation, e.g. conformed
 *     dimensions) put the shared dims in a band between the facts.
 *
 * Container membership is respected: each container's members are arranged
 * as one block and the blocks are packed in rows sized for a landscape view,
 * so the auto-derived container boxes stay tight and non-overlapping. When
 * data lineage runs between blocks, the blocks it connects stand in columns
 * instead, sources on the left, and the others are packed below them.
 * Output is snapped to the canvas grid pitch so orthogonal edges run in
 * clean channels.
 *
 * Sticky notes (spec §19) join no graph: a Container's notes sit in rows
 * below its entities, inside its frame, and the notes outside any Container
 * form a block of their own, packed with the others.
 */
import type { DiagramModel, EntityLayout, NoteLayout, UserPositions } from './layout.ts';
import { CANVAS_MARGIN, CONTAINER_HEADER_HEIGHT, CONTAINER_PADDING } from './layout.ts';

export type ArrangeStrategy = 'relational' | 'star';

const GRID = 20;        // canvas grid pitch (CSS background-size: 20px 20px)
const GUTTER_X = 64;    // horizontal gap between entity columns
// The gap between entity columns when a dependency carries a kind of
// transformation, whose pill needs room between the boxes (spec §27.10.6).
const GUTTER_X_PILLS = 120;
const GUTTER_Y = 56;    // vertical gap between entity rows
const BLOCK_GAP = 96;   // gap between packed container / component blocks
const SWEEPS = 3;        // barycentre refinement passes (relational)
// Width-to-height ratio of the view a fresh arrangement should fill: the
// diagram pane of the playground, and most screens, are landscape.
const ASPECT = 1.6;
// Extra row spacing in a component that holds a supertype hierarchy: room
// between a supertype and its subtypes for the stem, the symbol and the
// buses of several groups (spec 12.9).
const HIERARCHY_GAP = 36;
// Gap between two sticky notes, and between the entities of a block and the
// notes below them.
const NOTE_GAP = 40;
// A row of notes outside any Container wraps past this width.
const NOTE_ROW_WIDTH = 820;
// Key of the block of notes outside any Container; no Container is named so.
const FREE_NOTES = '\u0000notes';

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
  const notes: NoteLayout[] = diagram.notes ?? [];
  if (diagram.entities.length === 0 && notes.length === 0) return new Map();

  const sizeOf = new Map<string, { w: number; h: number }>();
  let laneW = 0;
  let laneH = 0;
  for (const e of diagram.entities) {
    sizeOf.set(e.id, { w: e.bounds.width, h: e.bounds.height });
    laneW = Math.max(laneW, e.bounds.width);
    laneH = Math.max(laneH, e.bounds.height);
  }
  laneW += (diagram.deps ?? []).some((d) => d.dependencies.some((x) => x.transformation)) ? GUTTER_X_PILLS : GUTTER_X;
  laneH += GUTTER_Y;
  for (const n of notes) sizeOf.set(n.id, { w: n.bounds.width, h: n.bounds.height });

  // Group by container so each container's members stay contiguous.
  const groups = new Map<string, EntityLayout[]>();
  for (const e of diagram.entities) {
    const key = e.containerName ?? '';
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }
  const noteGroups = new Map<string, NoteLayout[]>();
  for (const n of notes) {
    const key = n.containerName ?? FREE_NOTES;
    noteGroups.set(key, [...(noteGroups.get(key) ?? []), n]);
    // A Container that holds notes only still gets a block.
    if (n.containerName && !groups.has(n.containerName)) groups.set(n.containerName, []);
  }
  if (noteGroups.has(FREE_NOTES)) groups.set(FREE_NOTES, []);

  const blocks: Block[] = [];
  const blockKeys: string[] = [];
  for (const [containerName, members] of groups) {
    blockKeys.push(containerName);
    let pos = members.length === 0
      ? new Map<string, XY>()
      : strategy === 'star'
        ? layoutStar(members, diagram, sizeOf, laneW, laneH)
        : layoutRelational(members, diagram, sizeOf, laneW, laneH);
    const groupNotes = noteGroups.get(containerName) ?? [];
    if (groupNotes.length > 0) pos = placeNotesBelow(pos, groupNotes, sizeOf, containerName === FREE_NOTES ? NOTE_ROW_WIDTH : 0);
    // Reserve the container chrome (header band on top, inset on all
    // sides) for grouped entities so the box applyUserPositions derives
    // upward from these members never extends above or left of the canvas
    // origin -- which would put the title bar out of scroll reach -- and
    // so adjacent containers don't overlap.
    blocks.push(groupBlock(pos, sizeOf, containerName !== '' && containerName !== FREE_NOTES));
  }

  const out = new Map<string, XY>();
  for (const { block, ox, oy } of packLineageBlocks(blocks, blockKeys, diagram)) {
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
  flow: Flow;                               // upstream -> downstream (spec §27)
}

/** The dependencies of data lineage between two boxes: upstream -> downstream, with their count. */
type Flow = Map<string, Map<string, number>>;

/**
 * Where lineage puts `node` relative to `other`: +1 when `node` is computed
 * from `other` (it belongs on its right), -1 when `other` is computed from
 * `node`, 0 when neither or both.
 */
function flowSide (node: string, other: string, flow: Flow): number {
  const fromOther = flow.get(other)?.get(node) ?? 0;
  const toOther = flow.get(node)?.get(other) ?? 0;
  return Math.sign(fromOther - toOther);
}

function buildGraph (members: EntityLayout[], diagram: DiagramModel): Graph {
  const ids = members.map((m) => m.id);
  const idSet = new Set(ids);
  const adj = new Map<string, Map<string, number>>();
  const refsOut = new Map<string, Set<string>>();
  const flow: Flow = new Map();
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
  // A dependency of data lineage (spec §27) links its two boxes as well,
  // and `flow` keeps its direction, upstream to downstream.
  for (const dep of diagram.deps ?? []) {
    for (const d of dep.dependencies) {
      const s = d.upstream?.entityId;
      const t = d.downstream?.entityId;
      if (!s || !t || s === t || !idSet.has(s) || !idSet.has(t)) continue;
      bump(s, t);
      bump(t, s);
      const out = flow.get(s) ?? new Map<string, number>();
      out.set(t, (out.get(t) ?? 0) + 1);
      flow.set(s, out);
    }
  }
  // A supertype and its subtypes belong together (spec 12): each pair
  // counts as a link, so a hierarchy with no relationship lines still
  // forms one component.
  for (const g of diagram.supertypeGroups ?? []) {
    if (g.unresolved || !idSet.has(g.supertypeId)) continue;
    for (const s of g.subtypeIds) {
      if (s === g.supertypeId || !idSet.has(s)) continue;
      bump(g.supertypeId, s);
      bump(s, g.supertypeId);
    }
  }
  return { ids, adj, refsOut, flow };
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
  if (lineageLed(members, diagram)) return layoutLayers(members, diagram, sizeOf, laneW);
  const g = buildGraph(members, diagram);
  const comps = connectedComponents(g.ids, g.adj);

  // Lay out each connected component on its own cell grid, then pack the
  // component blocks side by side.
  const compBlocks: Block[] = [];
  for (const comp of comps) {
    const fixed = hierarchyCells(comp, diagram);
    const cells = orientFlow(gridPlace(comp, g.adj, fixed, g.flow), g.flow, fixed.size > 0);
    const pos = cellsToPixels(cells, laneW, fixed.size > 0 ? laneH + HIERARCHY_GAP : laneH);
    compBlocks.push(toBlock(pos, sizeOf));
  }
  // When data lineage leaves or enters the block, its components stack in
  // one column, so that the curves to the blocks beside it cross none of
  // them (spec §27.7).
  const pos = new Map<string, XY>();
  const placed = crossesBlock(members, diagram) ? stackBlocks(compBlocks) : packBlocks(compBlocks);
  for (const { block, ox, oy } of placed) {
    for (const [id, p] of block.pos) pos.set(id, { x: p.x + ox, y: p.y + oy });
  }
  return pos;
}

/**
 * True when data lineage (spec §27) touches at least half of the members of
 * a block, and no supertype group, which has a layout of its own, does.
 */
function lineageLed (members: EntityLayout[], diagram: DiagramModel): boolean {
  if (members.length < 2) return false;
  const ids = new Set(members.map((m) => m.id));
  const grouped = (diagram.supertypeGroups ?? [])
    .some((g) => ids.has(g.supertypeId) || g.subtypeIds.some((s) => ids.has(s)));
  if (grouped) return false;
  const touched = new Set<string>();
  for (const dep of diagram.deps ?? []) {
    for (const d of dep.dependencies) {
      for (const id of [d.upstream?.entityId, d.downstream?.entityId]) if (id && ids.has(id)) touched.add(id);
    }
  }
  return touched.size * 2 >= members.length;
}

/** Entities in one column of a layered block, at most; a longer column wraps into the next. */
const LAYER_MAX = 8;

/**
 * Layers for a block led by data lineage (spec §27.7), as a pipeline reads:
 * an entity stands in the column after the entities of the block it is
 * computed from, by the longest chain, so that an entity with no source in
 * the block stands in the first column. In a column, the entities that
 * relationships link stand next to each other, a chain from one end, and
 * these runs follow the order of the entities they are computed from, then
 * the order of the document. A cycle is broken where the walk meets it.
 * The entities a block receives lineage from stand in earlier blocks, in
 * the order of the document, so that order also sorts the entities they
 * feed.
 */
function layoutLayers (
  members: EntityLayout[],
  diagram: DiagramModel,
  sizeOf: Map<string, { w: number; h: number }>,
  laneW: number,
): Map<string, XY> {
  const ids = members.map((m) => m.id);
  const inBlock = new Set(ids);
  const docIndex = new Map(ids.map((id, i) => [id, i]));
  const ups = new Map<string, Set<string>>();
  const globalIndex = new Map(diagram.entities.map((e, i) => [e.id, i]));
  const outer = new Map<string, number[]>();
  for (const dep of diagram.deps ?? []) {
    for (const d of dep.dependencies) {
      const a = d.upstream?.entityId;
      const b = d.downstream?.entityId;
      if (!a || !b || a === b || !inBlock.has(b)) continue;
      if (!inBlock.has(a)) {
        const at = globalIndex.get(a);
        if (at !== undefined) outer.set(b, [...(outer.get(b) ?? []), at]);
        continue;
      }
      ups.set(b, (ups.get(b) ?? new Set<string>()).add(a));
    }
  }
  const linked = new Map<string, Set<string>>();
  for (const r of diagram.refs) {
    const a = r.source?.entityId;
    const b = r.target?.entityId;
    if (!a || !b || a === b || !inBlock.has(a) || !inBlock.has(b)) continue;
    linked.set(a, (linked.get(a) ?? new Set<string>()).add(b));
    linked.set(b, (linked.get(b) ?? new Set<string>()).add(a));
  }

  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = rank.get(id);
    if (known !== undefined) return known;
    visiting.add(id);
    let r = 0;
    for (const a of ups.get(id) ?? []) if (!visiting.has(a)) r = Math.max(r, depth(a) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };
  for (const id of ids) depth(id);

  const layers: string[][] = [];
  for (const id of ids) (layers[rank.get(id) as number] ??= []).push(id);

  const slot = new Map<string, number>();
  const pos = new Map<string, XY>();
  let col = 0;
  for (const layer of layers) {
    if (!layer || layer.length === 0) continue;
    const ordered = orderLayer(layer, linked, ups, outer, slot, docIndex);
    ordered.forEach((id, k) => slot.set(id, k));
    for (let start = 0; start < ordered.length; start += LAYER_MAX) {
      let y = 0;
      for (const id of ordered.slice(start, start + LAYER_MAX)) {
        pos.set(id, { x: col * laneW, y });
        y += (sizeOf.get(id)?.h ?? 0) + GUTTER_Y;
      }
      col += 1;
    }
  }
  return normalize(pos);
}

/**
 * The order of one layer: runs of entities that relationships link, each
 * walked from the end computed from the earliest entities, sorted by the
 * mean slot of the entities they are computed from in the earlier layers,
 * or else by the mean position in the document of those in other blocks,
 * then by the order of the document.
 */
function orderLayer (
  layer: string[],
  linked: Map<string, Set<string>>,
  ups: Map<string, Set<string>>,
  outer: Map<string, number[]>,
  slot: Map<string, number>,
  docIndex: Map<string, number>,
): string[] {
  const mean = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : Infinity);
  const keyOf = (ids: string[]): number => {
    const inner = ids.flatMap((id) => [...(ups.get(id) ?? [])]).filter((u) => slot.has(u)).map((u) => slot.get(u) as number);
    return inner.length > 0 ? mean(inner) : mean(ids.flatMap((id) => outer.get(id) ?? []));
  };
  const inLayer = new Set(layer);
  const near = (id: string): string[] => [...(linked.get(id) ?? [])]
    .filter((n) => inLayer.has(n))
    .sort((a, b) => (docIndex.get(a) as number) - (docIndex.get(b) as number));
  const seen = new Set<string>();
  const runs: string[][] = [];
  for (const id of layer) {
    if (seen.has(id)) continue;
    // The run of `id`, then a walk from its member with the fewest links.
    const members: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const n = stack.pop() as string;
      members.push(n);
      for (const m of near(n)) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    const fewest = Math.min(...members.map((m) => near(m).length));
    const start = members
      .filter((m) => near(m).length === fewest)
      .reduce((best, m) => (keyOf([m]) < keyOf([best]) ? m : best));
    const run: string[] = [];
    const done = new Set<string>();
    const walk = (n: string): void => {
      done.add(n);
      run.push(n);
      for (const m of near(n)) if (!done.has(m)) walk(m);
    };
    walk(start);
    runs.push(run);
  }
  const first = (run: string[]): number => Math.min(...run.map((id) => docIndex.get(id) as number));
  return runs
    .map((run) => ({ run, k: keyOf(run), d: first(run) }))
    .sort((a, b) => (a.k === b.k ? a.d - b.d : a.k === Infinity ? 1 : b.k === Infinity ? -1 : a.k - b.k))
    .flatMap((x) => x.run);
}

/** True when a dependency of data lineage links one of `members` with an entity outside them. */
function crossesBlock (members: EntityLayout[], diagram: DiagramModel): boolean {
  const ids = new Set(members.map((m) => m.id));
  return (diagram.deps ?? []).some((dep) => dep.dependencies.some((d) => {
    const a = d.upstream?.entityId;
    const b = d.downstream?.entityId;
    return !!a && !!b && ids.has(a) !== ids.has(b);
  }));
}

/** Blocks one below the other, in order. */
function stackBlocks (blocks: Block[]): Array<{ block: Block; ox: number; oy: number }> {
  const out: Array<{ block: Block; ox: number; oy: number }> = [];
  let y = 0;
  for (const b of blocks) {
    out.push({ block: b, ox: 0, oy: y });
    y += b.height + GUTTER_Y;
  }
  return out;
}

/**
 * Cells for the supertype hierarchies inside a component (spec 12.9, first
 * phase): each supertype sits one row above its subtypes and is centred over
 * them; the subtypes of all its groups sit side by side in declaration
 * order, so each group's symbol ends up above its own subtypes; deeper
 * levels stack below. Hierarchies are placed side by side with a free
 * column between them. Empty when the component holds no group.
 */
function hierarchyCells (comp: string[], diagram: DiagramModel): Map<string, Cell> {
  const inComp = new Set(comp);
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const g of diagram.supertypeGroups ?? []) {
    if (g.unresolved || !inComp.has(g.supertypeId)) continue;
    for (const s of g.subtypeIds) {
      if (s === g.supertypeId || !inComp.has(s) || hasParent.has(s)) continue;
      hasParent.add(s);
      const list = children.get(g.supertypeId) ?? [];
      list.push(s);
      children.set(g.supertypeId, list);
    }
  }
  const cells = new Map<string, Cell>();
  if (children.size === 0) return cells;
  const roots = comp.filter((id) => children.has(id) && !hasParent.has(id));
  let nextCol = 0;
  const visiting = new Set<string>();
  const place = (id: string, row: number): number => {
    const done = cells.get(id);
    if (done) return done.col;
    visiting.add(id);
    const kids = (children.get(id) ?? []).filter((k) => !cells.has(k) && !visiting.has(k));
    let col: number;
    if (kids.length === 0) {
      col = nextCol++;
    } else {
      const cols = kids.map((k) => place(k, row + 1));
      col = Math.floor(((cols[0] as number) + (cols[cols.length - 1] as number)) / 2);
    }
    cells.set(id, { col, row });
    return col;
  };
  for (const root of roots) {
    place(root, 0);
    nextCol += 1;
  }
  return cells;
}

/**
 * Mirror a component left to right when more of its dependencies of data
 * lineage run right to left than left to right. Lengths and crossings stay
 * as they are. A supertype hierarchy keeps its order.
 */
function orientFlow (cells: Map<string, Cell>, flow: Flow, hierarchy: boolean): Map<string, Cell> {
  if (hierarchy || flow.size === 0) return cells;
  let balance = 0;
  for (const [up, downs] of flow) {
    const a = cells.get(up);
    for (const [down, n] of downs) {
      const b = cells.get(down);
      if (a && b) balance += n * Math.sign(b.col - a.col);
    }
  }
  if (balance >= 0) return cells;
  const out = new Map<string, Cell>();
  for (const [id, c] of cells) out.set(id, { col: -c.col, row: c.row });
  return out;
}

function gridPlace (
  comp: string[],
  adj: Map<string, Map<string, number>>,
  fixed: Map<string, Cell> = new Map(),
  flow: Flow = new Map(),
): Map<string, Cell> {
  const cell = new Map<string, Cell>();
  if (comp.length === 1 && fixed.size === 0) {
    cell.set(comp[0] as string, { col: 0, row: 0 });
    return cell;
  }
  const occupied = new Set<string>();
  const key = (c: Cell): string => `${c.col},${c.row}`;
  // Preplaced cells (a supertype hierarchy) stay where they are; the rest
  // of the component is placed around them.
  for (const [id, c] of fixed) {
    cell.set(id, c);
    occupied.add(key(c));
  }
  const order = bfsOrder(comp, adj).filter((n) => !fixed.has(n));

  for (const node of order) {
    const placed = neighbors(node, adj).filter((n) => cell.has(n));
    const target = placed.length === 0
      ? { col: 0, row: 0 }
      : barycentre(node, placed, cell, adj, flow);
    const c = nearestFree(target, occupied);
    cell.set(node, c);
    occupied.add(key(c));
  }

  for (let s = 0; s < SWEEPS; s++) {
    for (const node of order) {
      const placed = neighbors(node, adj).filter((n) => cell.has(n) && n !== node);
      if (placed.length === 0) continue;
      const cur = cell.get(node) as Cell;
      const target = barycentre(node, placed, cell, adj, flow);
      occupied.delete(key(cur));
      const cand = nearestFree(target, occupied);
      if (cost(node, cand, cell, adj, flow) < cost(node, cur, cell, adj, flow)) {
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
  flow: Flow = new Map(),
): Cell {
  let sc = 0; let sr = 0; let sw = 0;
  for (const n of placed) {
    const c = cell.get(n);
    if (!c) continue;
    const w = weight(node, n, adj) || 1;
    // A neighbor linked by lineage pulls the node to its side of that
    // neighbor: right of what it is computed from.
    sc += (c.col + flowSide(node, n, flow)) * w; sr += c.row * w; sw += w;
  }
  if (sw === 0) return { col: 0, row: 0 };
  return { col: Math.round(sc / sw), row: Math.round(sr / sw) };
}

function cost (
  node: string,
  c: Cell,
  cell: Map<string, Cell>,
  adj: Map<string, Map<string, number>>,
  flow: Flow = new Map(),
): number {
  let total = 0;
  for (const n of neighbors(node, adj)) {
    const nc = cell.get(n);
    if (!nc || n === node) continue;
    const w = weight(node, n, adj) || 1;
    total += w * (Math.abs(c.col - nc.col) + Math.abs(c.row - nc.row));
    // A dependency that runs right to left, or straight up or down, costs
    // as much as two more columns.
    const side = flowSide(node, n, flow);
    if (side !== 0 && Math.sign(c.col - nc.col) !== side) total += w * 2;
  }
  return total;
}

// Ring offsets in the order nearestFree tries them: by distance in steps
// (a cell beside, above or below before a cell across a corner), then on
// the same row before the same column, then left before right and below
// before above. Trying the corner cells first put the second entity of a
// pair diagonally, a row lower: with rows as tall as the tallest entity of
// the diagram, it landed far below its neighbour, and the edge between
// them took a bend that a side-by-side pair does not need.
const RING_OFFSETS: Array<Array<{ dc: number; dr: number }>> = [];
function ringOffsets (r: number): Array<{ dc: number; dr: number }> {
  let ring = RING_OFFSETS[r];
  if (ring) return ring;
  ring = [];
  for (let dc = -r; dc <= r; dc++) {
    for (let dr = -r; dr <= r; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) === r) ring.push({ dc, dr }); // ring only
    }
  }
  ring.sort((a, b) =>
    (Math.abs(a.dc) + Math.abs(a.dr)) - (Math.abs(b.dc) + Math.abs(b.dr))
    || Math.abs(a.dr) - Math.abs(b.dr)
    || a.dc - b.dc
    || b.dr - a.dr);
  RING_OFFSETS[r] = ring;
  return ring;
}

// Spiral outward from the rounded target to the first unoccupied cell.
function nearestFree (target: Cell, occupied: Set<string>): Cell {
  const key = (col: number, row: number): string => `${col},${row}`;
  if (!occupied.has(key(target.col, target.row))) return { ...target };
  for (let r = 1; r < 256; r++) {
    for (const { dc, dr } of ringOffsets(r)) {
      const col = target.col + dc;
      const row = target.row + dr;
      if (!occupied.has(key(col, row))) return { col, row };
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

/**
 * Place notes in rows below the positioned entities of a block, from its
 * left edge. A row wraps past the block's width, or past `minRow` when that
 * is wider, and holds at least one note.
 */
function placeNotesBelow (
  pos: Map<string, XY>,
  notes: NoteLayout[],
  sizeOf: Map<string, { w: number; h: number }>,
  minRow: number,
): Map<string, XY> {
  const out = new Map(pos);
  let minX = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [id, p] of pos) {
    const s = sizeOf.get(id) ?? { w: 0, h: 0 };
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + s.w);
    maxY = Math.max(maxY, p.y + s.h);
  }
  const left = Number.isFinite(minX) ? minX : 0;
  const rowWidth = Math.max(minRow, Number.isFinite(maxX) ? maxX - left : 0);
  let x = left;
  let y = Number.isFinite(maxY) ? maxY + NOTE_GAP : 0;
  let rowH = 0;
  for (const n of notes) {
    const w = n.bounds.width;
    if (x > left && x + w - left > rowWidth) {
      x = left;
      y += rowH + NOTE_GAP;
      rowH = 0;
    }
    out.set(n.id, { x, y });
    x += w + NOTE_GAP;
    rowH = Math.max(rowH, n.bounds.height);
  }
  return out;
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

// Like toBlock, but reserves the container chrome when the group is a
// container: members are shifted inward by the inset (and the header band
// on top) and the block grows to match. This keeps the box that
// applyUserPositions derives upward from the members inside the canvas
// (never above/left of the origin) and clear of neighbouring blocks.
function groupBlock (
  pos: Map<string, XY>,
  sizeOf: Map<string, { w: number; h: number }>,
  isContainer: boolean,
): Block {
  if (pos.size === 0) return { pos, width: 0, height: 0 };
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [id, p] of pos) {
    const s = sizeOf.get(id) ?? { w: 0, h: 0 };
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + s.w);
    maxY = Math.max(maxY, p.y + s.h);
  }
  const padL = isContainer ? CONTAINER_PADDING : 0;
  const padTop = isContainer ? CONTAINER_HEADER_HEIGHT + CONTAINER_PADDING : 0;
  const padR = isContainer ? CONTAINER_PADDING : 0;
  const padBottom = isContainer ? CONTAINER_PADDING : 0;
  const norm = new Map<string, XY>();
  for (const [id, p] of pos) norm.set(id, { x: p.x - minX + padL, y: p.y - minY + padTop });
  return { pos: norm, width: (maxX - minX) + padL + padR, height: (maxY - minY) + padTop + padBottom };
}

// Shelf packing: place blocks left to right and wrap to a new row past a
// target width. The target is the one, among the widths at which a row can
// break, whose arrangement a landscape view (ASPECT) shows at the largest
// zoom: the smallest max(width / ASPECT, height), and the smaller area on a
// tie. A single target derived from the total area wrapped a short block
// under a tall one, leaving the space beside the tall one empty and the
// whole arrangement taller than the view.
interface Shelf {
  out: Array<{ block: Block; ox: number; oy: number }>;
  width: number;
  height: number;
}

function shelfPack (blocks: Block[], target: number): Shelf {
  const out: Array<{ block: Block; ox: number; oy: number }> = [];
  let x = 0; let y = 0; let rowH = 0; let width = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > target) { x = 0; y += rowH + BLOCK_GAP; rowH = 0; }
    out.push({ block: b, ox: x, oy: y });
    width = Math.max(width, x + b.width);
    x += b.width + BLOCK_GAP;
    rowH = Math.max(rowH, b.height);
  }
  return { out, width, height: y + rowH };
}

/**
 * Pack the blocks of the Containers (and of the entities outside any) so
 * that the sources of data lineage between them stand on the left (spec
 * §27.7): a block
 * stands in the column after the blocks it is computed from, by the longest
 * chain, and the blocks of one column stack top to bottom. A cycle
 * between blocks is broken where the walk meets it. Blocks no dependency
 * connects to another are packed as usual, below. Without lineage between
 * blocks, this is `packBlocks`.
 */
function packLineageBlocks (
  blocks: Block[],
  keys: string[],
  diagram: DiagramModel,
): Array<{ block: Block; ox: number; oy: number }> {
  const groupOf = new Map<string, string>();
  for (const e of diagram.entities) groupOf.set(e.id, e.containerName ?? '');
  const next = new Map<string, Set<string>>();
  for (const dep of diagram.deps ?? []) {
    for (const d of dep.dependencies) {
      const a = d.upstream ? groupOf.get(d.upstream.entityId) : undefined;
      const b = d.downstream ? groupOf.get(d.downstream.entityId) : undefined;
      if (a === undefined || b === undefined || a === b) continue;
      const set = next.get(a) ?? new Set<string>();
      set.add(b);
      next.set(a, set);
    }
  }
  if (next.size === 0) return packBlocks(blocks);

  // Longest path from a source, over the lineage between blocks.
  const linked = new Set<string>();
  for (const [a, bs] of next) {
    linked.add(a);
    for (const b of bs) linked.add(b);
  }
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (k: string): number => {
    const known = rank.get(k);
    if (known !== undefined) return known;
    visiting.add(k);
    let r = 0;
    for (const [a, bs] of next) {
      if (bs.has(k) && !visiting.has(a)) r = Math.max(r, depth(a) + 1);
    }
    visiting.delete(k);
    rank.set(k, r);
    return r;
  };
  for (const k of keys) if (linked.has(k)) depth(k);

  const columns: Block[][] = [];
  const rest: Block[] = [];
  keys.forEach((k, i) => {
    const b = blocks[i] as Block;
    const r = rank.get(k);
    if (r === undefined || b.width === 0) {
      if (b.width > 0 || b.height > 0) rest.push(b);
      return;
    }
    (columns[r] ??= []).push(b);
  });

  const out: Array<{ block: Block; ox: number; oy: number }> = [];
  let x = 0;
  let bottom = 0;
  for (const column of columns) {
    if (!column || column.length === 0) continue;
    let y = 0;
    let w = 0;
    for (const b of column) {
      out.push({ block: b, ox: x, oy: y });
      y += b.height + BLOCK_GAP;
      w = Math.max(w, b.width);
    }
    bottom = Math.max(bottom, y - BLOCK_GAP);
    x += w + BLOCK_GAP;
  }
  if (rest.length > 0) {
    const top = bottom + BLOCK_GAP;
    for (const p of packBlocks(rest)) out.push({ block: p.block, ox: p.ox, oy: p.oy + top });
  }
  return out;
}

function packBlocks (blocks: Block[]): Array<{ block: Block; ox: number; oy: number }> {
  if (blocks.length === 1) return [{ block: blocks[0] as Block, ox: 0, oy: 0 }];
  let area = 0; let widest = 0;
  for (const b of blocks) { area += b.width * b.height; widest = Math.max(widest, b.width); }
  // Candidate targets: the width of each row prefix, the widest block, and
  // the former area-derived target, so a layout it found stays available.
  const targets = new Set<number>([widest, Math.max(widest, Math.sqrt(area) * 1.4)]);
  let run = 0;
  for (const b of blocks) {
    run += b.width;
    targets.add(Math.max(widest, run));
    run += BLOCK_GAP;
  }
  let best: Shelf | undefined;
  let bestScore = Infinity;
  for (const t of [...targets].sort((a, b) => a - b)) {
    const shelf = shelfPack(blocks, t);
    const score = Math.max(shelf.width / ASPECT, shelf.height);
    if (score < bestScore || (score === bestScore && best && shelf.width * shelf.height < best.width * best.height)) {
      best = shelf;
      bestScore = score;
    }
  }
  return (best as Shelf).out;
}
