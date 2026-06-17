/**
 * Undo/redo stack for ERD layout changes (entity positions and edge
 * nudges). Pure, framework-free state transitions so the index math --
 * redo-tail truncation and depth capping -- can be unit-tested in
 * isolation; DiagramCanvas holds one of these in a ref and swaps it for
 * the value returned by each function.
 *
 * Each entry is a full snapshot of the position state. Full snapshots
 * (rather than deltas) keep bulk actions like Arrange and Reset as single
 * reversible steps and stay cheap, since the maps are small.
 */

export interface LayoutSnapshot {
  positions: Record<string, { x: number; y: number }>;
  offsets: Record<string, { dx: number; dy: number }>;
}

export interface LayoutHistory {
  readonly stack: readonly LayoutSnapshot[];
  readonly index: number;
}

/** An empty history -- nothing recorded yet. */
export function emptyHistory (): LayoutHistory {
  return { stack: [], index: -1 };
}

/** Start (or restart) history with a single baseline snapshot. */
export function seedHistory (snap: LayoutSnapshot): LayoutHistory {
  return { stack: [snap], index: 0 };
}

/**
 * Record a new snapshot as the current state. Any redo tail is dropped,
 * and the stack is capped to `cap` entries by discarding the oldest.
 */
export function commitHistory (h: LayoutHistory, snap: LayoutSnapshot, cap: number): LayoutHistory {
  let stack = h.index < h.stack.length - 1
    ? h.stack.slice(0, h.index + 1)
    : h.stack.slice();
  stack.push(snap);
  if (cap > 0 && stack.length > cap) stack = stack.slice(stack.length - cap);
  return { stack, index: stack.length - 1 };
}

export function canUndo (h: LayoutHistory): boolean {
  return h.index > 0;
}

export function canRedo (h: LayoutHistory): boolean {
  return h.index < h.stack.length - 1;
}

/** Move the cursor back one step (no-op at the baseline). */
export function undoHistory (h: LayoutHistory): LayoutHistory {
  return canUndo(h) ? { stack: h.stack, index: h.index - 1 } : h;
}

/** Move the cursor forward one step (no-op at the tip). */
export function redoHistory (h: LayoutHistory): LayoutHistory {
  return canRedo(h) ? { stack: h.stack, index: h.index + 1 } : h;
}

/** The snapshot at the current cursor, or null if history is empty. */
export function currentSnapshot (h: LayoutHistory): LayoutSnapshot | null {
  return h.index >= 0 && h.index < h.stack.length ? h.stack[h.index] : null;
}
