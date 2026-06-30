<template>
  <div class="relative w-full h-full">
    <!-- Mount host. @xdbml/render/interactive appends its own scrolling,
         zoomable viewport here and owns all canvas interaction (select,
         collapse, drag, pan, zoom). This shell keeps only policy:
         persistence, undo/redo, document-switch layout resolution, and
         the floating controls. -->
    <div ref="viewportEl" class="w-full h-full" />

    <div
      v-if="!hasAst"
      class="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-slate-500 text-sm pointer-events-none"
    >
      <div class="text-center">
        <div class="font-medium text-gray-600 dark:text-slate-300 mb-1">Diagram unavailable</div>
        <div>See the diagnostics panel below for the parse error</div>
      </div>
    </div>

    <!-- Floating controls, bottom-right, outside the scrolling viewport. -->
    <div
      v-if="hasAst"
      class="absolute bottom-3 right-3 flex items-center gap-0.5 px-1 py-0.5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border border-gray-200 dark:border-slate-700 rounded-lg shadow-sm select-none"
    >
      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="zoomIndex === 0"
        @click="zoomOut"
        title="Zoom out (Ctrl + scroll down)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M3 8h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>
      </button>

      <input
        :value="zoomPercentDisplay"
        @change="onZoomInputChange"
        @keydown.enter.prevent="onZoomInputEnter"
        @focus="onZoomInputFocus"
        class="w-14 h-7 text-center text-xs font-medium tabular-nums text-gray-700 dark:text-slate-200 bg-transparent border-none focus:outline-none focus:bg-gray-50 dark:focus:bg-slate-700 rounded"
        type="text"
        :title="`Zoom level. Range: ${zoomPercent(ZOOM_LEVELS[0])}% to ${zoomPercent(ZOOM_LEVELS[ZOOM_LEVELS.length-1])}%`"
      />

      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="zoomIndex === ZOOM_LEVELS.length - 1"
        @click="zoomIn"
        title="Zoom in (Ctrl + scroll up)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>
      </button>

      <div class="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-0.5" />

      <button
        type="button"
        class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
        @click="zoomToFit"
        title="Fit diagram to viewport"
      >Fit</button>

      <button
        type="button"
        class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
        @click="zoomTo(1)"
        title="Reset to 100%"
      >1:1</button>

      <div class="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-0.5" />

      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canUndo"
        @click="undoLayout"
        title="Undo layout change (Ctrl+Z)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M6.5 4.5 3 8l3.5 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8h6.5a3.5 3.5 0 1 1 0 7H6" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canRedo"
        @click="redoLayout"
        title="Redo layout change (Ctrl+Shift+Z)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M9.5 4.5 13 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 8H6.5a3.5 3.5 0 1 0 0 7H10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <div class="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-0.5" />

      <div ref="arrangeWrap" class="relative">
        <button
          type="button"
          class="h-7 px-2 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
          @click="arrangeMenuOpen = !arrangeMenuOpen"
          title="Auto-arrange the diagram"
        >
          Arrange
          <svg viewBox="0 0 16 16" class="w-2.5 h-2.5"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div
          v-if="arrangeMenuOpen"
          class="absolute bottom-full right-0 mb-1 w-40 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg"
        >
          <button type="button" class="w-full px-3 py-1.5 flex items-center text-left text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700" @click="arrange('relational')">Relational</button>
          <button type="button" class="w-full px-3 py-1.5 flex items-center text-left text-xs text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700" @click="arrange('star')">Star schema</button>
        </div>
      </div>

      <template v-if="userPositions.size > 0 || edgeOffsets.size > 0">
        <div class="w-px h-5 bg-gray-200 dark:bg-slate-700 mx-0.5" />
        <button
          type="button"
          class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
          @click="resetPositions"
          title="Reset repositioned entities and edges to the layout default"
        >Reset positions</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The right-pane diagram canvas.
 *
 * Rendering and all canvas interaction (select, collapse, drag, pan,
 * zoom) are delegated to the framework-free `@xdbml/render/interactive`
 * mount, which is the single source of visual truth shared with the
 * rendering API and MCP server. This component is the playground shell
 * around it: it owns policy the mount deliberately does not -- per-document
 * layout persistence, undo/redo, document-switch resolution -- and the
 * floating controls. State flows two ways: the shell pushes authoritative
 * layout to the mount via setState; the mount reports user drags, collapse
 * toggles, zoom, and selection back through events.
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';

import { useParserStore } from '@/stores/parserStore';
import { useFileSystemStore } from '@/stores/fileSystemStore';

import { buildDiagram, autoArrange, darkTheme } from '@xdbml/render';
import type { ArrangeStrategy } from '@xdbml/render';
import { mount, ZOOM_LEVELS } from '@xdbml/render/interactive';
import type { DiagramHandle, Selection as MountSelection } from '@xdbml/render/interactive';

import type { Selection } from '@/components/inspector/selection';
import {
  emptyHistory,
  seedHistory as seedH,
  commitHistory as commitH,
  undoHistory as undoH,
  redoHistory as redoH,
  canUndo as canUndoH,
  canRedo as canRedoH,
  currentSnapshot,
} from './layout-history';
import type { LayoutHistory } from './layout-history';
import { useAppearance } from '@/composables/useAppearance';

const { isDark } = useAppearance();

const parser = useParserStore();
const fileSystem = useFileSystemStore();

const props = defineProps<{ selection: Selection }>();
const emit = defineEmits<{ select: [selection: Selection] }>();

const hasAst = computed(() => parser.hasAst);
const viewportEl = ref<HTMLDivElement | null>(null);

/* ------------------------------------------------------------------ keys */

const POSITIONS_STORAGE_KEY = 'xdbml-playground:entity-positions';
const EDGE_OFFSETS_STORAGE_KEY = 'xdbml-playground:edge-offsets';
const COLLAPSE_STORAGE_KEY = 'xdbml-playground:collapsed-paths';
const ZOOM_STORAGE_KEY = 'xdbml-playground:zoom';
const WORKING_DOC_KEY = '__working__';

type EntityPos = { x: number; y: number };
type PosMap = Map<string, EntityPos>;
type EdgeOff = { dx: number; dy: number };
type OffMap = Map<string, EdgeOff>;

function currentDocKey (): string {
  return fileSystem.filename ? `file:${fileSystem.filename}` : WORKING_DOC_KEY;
}

function isEntityPos (v: unknown): v is EntityPos {
  return !!v && typeof v === 'object'
    && typeof (v as EntityPos).x === 'number' && typeof (v as EntityPos).y === 'number';
}
function isEdgeOff (v: unknown): v is EdgeOff {
  return !!v && typeof v === 'object'
    && typeof (v as EdgeOff).dx === 'number' && typeof (v as EdgeOff).dy === 'number';
}

function loadAllPositions (): Record<string, Record<string, EntityPos>> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return {};
    const values = Object.values(obj as Record<string, unknown>);
    if (values.length > 0 && values.every(isEntityPos)) {
      return { [WORKING_DOC_KEY]: obj as Record<string, EntityPos> };
    }
    const out: Record<string, Record<string, EntityPos>> = {};
    for (const [docKey, docPos] of Object.entries(obj as Record<string, unknown>)) {
      if (!docPos || typeof docPos !== 'object') continue;
      const inner: Record<string, EntityPos> = {};
      for (const [id, p] of Object.entries(docPos as Record<string, unknown>)) {
        if (isEntityPos(p)) inner[id] = { x: p.x, y: p.y };
      }
      out[docKey] = inner;
    }
    return out;
  } catch { return {}; }
}
function loadPositionsFor (docKey: string): PosMap {
  const rec = loadAllPositions()[docKey];
  const map: PosMap = new Map();
  if (rec) for (const [id, p] of Object.entries(rec)) map.set(id, p);
  return map;
}
function loadAllOffsets (): Record<string, Record<string, EdgeOff>> {
  try {
    const raw = localStorage.getItem(EDGE_OFFSETS_STORAGE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return {};
    const out: Record<string, Record<string, EdgeOff>> = {};
    for (const [docKey, docOff] of Object.entries(obj as Record<string, unknown>)) {
      if (!docOff || typeof docOff !== 'object') continue;
      const inner: Record<string, EdgeOff> = {};
      for (const [id, o] of Object.entries(docOff as Record<string, unknown>)) {
        if (isEdgeOff(o)) inner[id] = { dx: o.dx, dy: o.dy };
      }
      out[docKey] = inner;
    }
    return out;
  } catch { return {}; }
}
function loadOffsetsFor (docKey: string): OffMap {
  const rec = loadAllOffsets()[docKey];
  const map: OffMap = new Map();
  if (rec) for (const [id, o] of Object.entries(rec)) map.set(id, o);
  return map;
}

/* -------------------------------------------------------- collapse state */

function loadCollapsed (): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch { /* ignore */ }
  return new Set();
}
const collapsedPaths = ref<Set<string>>(loadCollapsed());
watch(collapsedPaths, (set) => {
  try { localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set])); } catch { /* best-effort */ }
}, { deep: true });

/* ------------------------------------------------------------ zoom state */

const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

function loadZoom (): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return 1;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n;
  } catch { /* ignore */ }
  return 1;
}
const zoom = ref<number>(loadZoom());
watch(zoom, (z) => {
  try { localStorage.setItem(ZOOM_STORAGE_KEY, String(z)); } catch { /* best-effort */ }
});

function zoomPercent (z: number): number { return Math.round(z * 100); }
const zoomPercentDisplay = computed(() => `${zoomPercent(zoom.value)}%`);
const zoomIndex = computed(() => {
  // Nearest discrete level to the current zoom (for +/- disabled state).
  let best = 0;
  let bestDiff = Infinity;
  ZOOM_LEVELS.forEach((lvl, i) => {
    const d = Math.abs(lvl - zoom.value);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
});

function parseZoomInput (raw: string): number | null {
  const cleaned = raw.trim().replace('%', '');
  if (cleaned === '') return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct)) return null;
  const z = pct / 100;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}
function onZoomInputChange (e: Event): void { applyZoomInput((e.target as HTMLInputElement).value); }
function onZoomInputEnter (e: KeyboardEvent): void {
  const input = e.target as HTMLInputElement;
  applyZoomInput(input.value);
  input.blur();
}
function onZoomInputFocus (e: FocusEvent): void {
  const input = e.target as HTMLInputElement;
  setTimeout(() => input.select(), 0);
}
function applyZoomInput (raw: string): void {
  const parsed = parseZoomInput(raw);
  if (parsed === null) { zoom.value = zoom.value; return; } // force re-render to revert
  zoomTo(parsed);
}
function zoomTo (z: number): void { handle?.setZoom(z); }
function zoomToFit (): void { handle?.zoomToFit(); }
function zoomIn (): void { handle?.zoomIn(); }
function zoomOut (): void { handle?.zoomOut(); }

/* ----------------------------------------------- positions / edge offsets */

const userPositions = ref<PosMap>(
  parser.initialRestore ? loadPositionsFor(WORKING_DOC_KEY) : new Map(),
);
const edgeOffsets = ref<OffMap>(
  parser.initialRestore ? loadOffsetsFor(WORKING_DOC_KEY) : new Map(),
);

function persistUserPositions (): void {
  try {
    const all = loadAllPositions();
    const rec: Record<string, EntityPos> = {};
    for (const [id, p] of userPositions.value) rec[id] = p;
    all[currentDocKey()] = rec;
    all[WORKING_DOC_KEY] = rec;
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(all));
  } catch { /* best-effort */ }
}
function persistEdgeOffsets (): void {
  try {
    const all = loadAllOffsets();
    const rec: Record<string, EdgeOff> = {};
    for (const [id, o] of edgeOffsets.value) rec[id] = o;
    all[currentDocKey()] = rec;
    all[WORKING_DOC_KEY] = rec;
    localStorage.setItem(EDGE_OFFSETS_STORAGE_KEY, JSON.stringify(all));
  } catch { /* best-effort */ }
}

function resetPositions (): void {
  if (userPositions.value.size === 0 && edgeOffsets.value.size === 0) return;
  userPositions.value = new Map();
  edgeOffsets.value = new Map();
  persistUserPositions();
  persistEdgeOffsets();
  pushLayout();
  commitHistory();
}

/* ------------------------------------------------------------- history */

interface LayoutSnapshotMaps {
  positions: Record<string, EntityPos>;
  offsets: Record<string, EdgeOff>;
}
const HISTORY_CAP = 100;
const history = ref<LayoutHistory>(emptyHistory());
const canUndo = computed(() => canUndoH(history.value));
const canRedo = computed(() => canRedoH(history.value));

function snapshotLayout (): LayoutSnapshotMaps {
  const positions: Record<string, EntityPos> = {};
  for (const [id, p] of userPositions.value) positions[id] = { x: p.x, y: p.y };
  const offsets: Record<string, EdgeOff> = {};
  for (const [id, o] of edgeOffsets.value) offsets[id] = { dx: o.dx, dy: o.dy };
  return { positions, offsets };
}
function seedHistory (): void { history.value = seedH(snapshotLayout()); }
function commitHistory (): void { history.value = commitH(history.value, snapshotLayout(), HISTORY_CAP); }
function restoreSnapshot (snap: LayoutSnapshotMaps): void {
  const pos: PosMap = new Map();
  for (const [id, p] of Object.entries(snap.positions)) pos.set(id, { x: p.x, y: p.y });
  const off: OffMap = new Map();
  for (const [id, o] of Object.entries(snap.offsets)) off.set(id, { dx: o.dx, dy: o.dy });
  userPositions.value = pos;
  edgeOffsets.value = off;
  persistUserPositions();
  persistEdgeOffsets();
  pushLayout();
}
function undoLayout (): void {
  if (!canUndo.value) return;
  history.value = undoH(history.value);
  const snap = currentSnapshot(history.value);
  if (snap) restoreSnapshot(snap as LayoutSnapshotMaps);
}
function redoLayout (): void {
  if (!canRedo.value) return;
  history.value = redoH(history.value);
  const snap = currentSnapshot(history.value);
  if (snap) restoreSnapshot(snap as LayoutSnapshotMaps);
}
defineExpose({ undo: undoLayout, redo: redoLayout, canUndo, canRedo });

/* ------------------------------------------------------------ arrange */

const arrangeMenuOpen = ref(false);
const arrangeWrap = ref<HTMLElement | null>(null);

function applyStrategy (strategy: ArrangeStrategy): void {
  if (!parser.flatAst) return;
  const base = buildDiagram(parser.flatAst, collapsedPaths.value);
  userPositions.value = new Map(autoArrange(base, strategy));
  persistUserPositions();
  pushLayout();
  zoomToFit();
}
function arrange (strategy: ArrangeStrategy): void {
  applyStrategy(strategy);
  commitHistory();
  arrangeMenuOpen.value = false;
}
function onArrangeOutside (e: MouseEvent): void {
  if (!arrangeMenuOpen.value) return;
  const el = arrangeWrap.value;
  if (el && !el.contains(e.target as Node)) arrangeMenuOpen.value = false;
}

/* ------------------------------------------------- mount + state bridge */

let handle: DiagramHandle | null = null;

function posObj (): Record<string, EntityPos> {
  const o: Record<string, EntityPos> = {};
  for (const [id, p] of userPositions.value) o[id] = { x: p.x, y: p.y };
  return o;
}
function offObj (): Record<string, EdgeOff> {
  const o: Record<string, EdgeOff> = {};
  for (const [id, off] of edgeOffsets.value) o[id] = { dx: off.dx, dy: off.dy };
  return o;
}

/** Push the shell's authoritative layout into the mount (no event echo). */
function pushLayout (): void {
  handle?.setState({
    positions: posObj(),
    offsets: offObj(),
    collapsed: [...collapsedPaths.value],
    zoom: zoom.value,
  });
}

function toInspector (s: MountSelection): Selection {
  if (!s) return null;
  if (s.kind === 'entity') return { kind: 'entity', entityId: s.id };
  if (s.kind === 'field') return { kind: 'field', entityId: s.id, path: s.path };
  if (s.kind === 'ref') return { kind: 'ref', refId: s.id };
  return { kind: 'container', containerName: s.name };
}
function toMount (s: Selection): MountSelection {
  if (!s) return null;
  if (s.kind === 'entity') return { kind: 'entity', id: s.entityId };
  if (s.kind === 'field') return { kind: 'field', id: s.entityId, path: s.path };
  if (s.kind === 'ref') return { kind: 'ref', id: s.refId };
  return { kind: 'container', name: s.containerName };
}

function ensureMount (): void {
  if (handle || !viewportEl.value || !parser.flatAst) return;
  handle = mount(viewportEl.value, parser.flatAst, {
    // In dark mode, hand the renderer its dark palette. The palette also
    // carries the canvas backdrop, so the mount's viewport grid matches.
    // Light mode passes no override and uses the renderer defaults.
    theme: isDark.value ? darkTheme : undefined,
    onSelect: (s) => emit('select', toInspector(s)),
    onChange: (st) => {
      // A user drag (entity/container/edge) settled. Mirror into the
      // shell's refs for persistence + the Reset button + undo history.
      const pos: PosMap = new Map();
      for (const [id, p] of Object.entries(st.positions)) pos.set(id, { x: p.x, y: p.y });
      const off: OffMap = new Map();
      for (const [id, o] of Object.entries(st.offsets)) off.set(id, { dx: o.dx, dy: o.dy });
      userPositions.value = pos;
      edgeOffsets.value = off;
      persistUserPositions();
      persistEdgeOffsets();
      commitHistory();
    },
    onCollapseChange: (c) => { collapsedPaths.value = new Set(c); },
    onZoom: (z) => { zoom.value = z; },
  });
  pushLayout();
  if (props.selection) handle.select(toMount(props.selection));
}

/* ---------------------------------------------- document-switch policy */

let appliedEpoch = -1;

function resolveLayoutForDocument (): void {
  handle?.setInput(parser.flatAst!);

  const saved = loadPositionsFor(currentDocKey());
  const savedOff = loadOffsetsFor(currentDocKey());
  const firstResolve = appliedEpoch === -1;
  const isRestore = firstResolve && parser.documentEpoch === 0 && parser.initialRestore;

  if (isRestore) {
    if (saved.size > 0) {
      userPositions.value = saved;
      edgeOffsets.value = savedOff;
      persistUserPositions();
      persistEdgeOffsets();
      pushLayout();
    } else {
      edgeOffsets.value = new Map();
      applyStrategy('relational');
    }
  } else if (fileSystem.filename && saved.size > 0) {
    userPositions.value = saved;
    edgeOffsets.value = savedOff;
    persistUserPositions();
    persistEdgeOffsets();
    pushLayout();
  } else {
    edgeOffsets.value = new Map();
    applyStrategy('relational');
  }
  seedHistory();
  appliedEpoch = parser.documentEpoch;
}

const ready = ref(false);

function syncDocument (): void {
  if (!ready.value || !parser.hasAst || !viewportEl.value) return;
  ensureMount();
  if (parser.documentEpoch !== appliedEpoch) {
    resolveLayoutForDocument();
  } else {
    // Live edit of the current document: update content, preserve layout.
    handle?.setInput(parser.flatAst!);
  }
}

watch(() => [parser.flatAst, parser.documentEpoch] as const, syncDocument);
watch(() => props.selection, (s) => { handle?.select(toMount(s)); });

/* ---------------------------------------------------------- theme switch */

// The renderer bakes theme colors into the SVG at mount time and has no
// live re-theme entry, so an appearance change tears the mount down and
// rebuilds it with the new palette. Layout is safe across this: the
// authoritative positions/offsets/collapsed/zoom live in this shell's
// refs, and ensureMount's pushLayout restores them; selection is restored
// from props. destroy() removes the old viewport, so no DOM leaks.
watch(isDark, () => {
  if (!handle || !viewportEl.value) return;
  handle.destroy();
  handle = null;
  ensureMount();
});

/* ------------------------------------------------------------ lifecycle */

onMounted(() => {
  ready.value = true;
  syncDocument();
  document.addEventListener('mousedown', onArrangeOutside);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onArrangeOutside);
  handle?.destroy();
  handle = null;
});
</script>
