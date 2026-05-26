<template>
  <div class="relative w-full h-full">
    <!-- Scrolling viewport. The SVG inside grows with the zoom factor, and
         this div's overflow:auto provides native scrollbars + scroll
         behavior. Wheel = vertical scroll, Shift+wheel = horizontal scroll
         are browser-native. Ctrl+wheel is intercepted and turned into
         zoom (with cursor-anchored re-positioning so the canvas point
         under the mouse stays under the mouse). -->
    <div
      ref="viewportEl"
      class="w-full h-full overflow-auto diagram-canvas"
      @wheel="onWheel"
    >
      <div
        v-if="!hasAst"
        class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none"
      >
        <div class="text-center">
          <div class="font-medium text-gray-600 mb-1">Diagram unavailable</div>
          <div>Fix the parse error to see the diagram</div>
        </div>
      </div>
      <svg
        v-else
        :width="diagram.width * zoom"
        :height="diagram.height * zoom"
        :viewBox="`0 0 ${diagram.width} ${diagram.height}`"
        class="block"
      >
        <defs>
          <!-- Entity card drop-shadow. Subtle -- the diagram already has
               a grid background that provides depth. -->
          <filter id="entity-shadow" x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.12" />
          </filter>
        </defs>

        <!-- Containers (drawn first so entities render on top) -->
        <g
          v-for="container in diagram.containers"
          :key="container.id"
          class="container-group"
        >
          <rect
            :x="container.bounds.x"
            :y="container.bounds.y"
            :width="container.bounds.width"
            :height="container.bounds.height"
            rx="6"
            fill="white"
            stroke="#cbd5e1"
            stroke-width="1.5"
            stroke-dasharray="4 3"
          />
          <rect
            :x="container.bounds.x"
            :y="container.bounds.y"
            :width="container.bounds.width"
            :height="32"
            :fill="container.accentColor"
            rx="6"
          />
          <!-- Square off the bottom of the container's header band so it
               flushes with the container body below. -->
          <rect
            :x="container.bounds.x"
            :y="container.bounds.y + 16"
            :width="container.bounds.width"
            height="16"
            :fill="container.accentColor"
          />
          <text
            :x="container.bounds.x + 12"
            :y="container.bounds.y + 21"
            fill="white"
            font-size="13"
            font-weight="600"
          >{{ container.keyword }} · {{ container.name }}</text>
          <text
            v-if="container.target"
            :x="container.bounds.x + container.bounds.width - 12"
            :y="container.bounds.y + 21"
            fill="white"
            font-size="11"
            text-anchor="end"
            opacity="0.85"
          >→ {{ container.target }}</text>
        </g>

        <!-- Ref lines (drawn before entities so the cards visually
             overlap any line that crosses them) -->
        <g class="ref-lines">
          <RefLine
            v-for="ref in resolvedRefs"
            :key="ref.id"
            :ref-layout="ref"
            :entities="diagram.entities"
          />
        </g>

        <!-- Entities -->
        <g
          v-for="entity in diagram.entities"
          :key="entity.id"
          class="entity-card"
        >
          <EntityCard
            :entity="entity"
            :collapsed-paths="collapsedPaths"
            @toggle-path="(path) => togglePath(entity.id, path)"
          />
        </g>

        <!-- Unresolved-ref indicator -->
        <g
          v-if="unresolvedRefCount > 0"
          class="warning-banner"
        >
          <rect
            x="12"
            :y="diagram.height - 36"
            width="280"
            height="24"
            rx="4"
            fill="#fef3c7"
            stroke="#f59e0b"
            stroke-width="1"
          />
          <text
            x="22"
            :y="diagram.height - 19"
            fill="#92400e"
            font-size="11"
          >{{ unresolvedRefCount }} Ref{{ unresolvedRefCount === 1 ? '' : 's' }} couldn't be resolved</text>
        </g>
      </svg>
    </div>

    <!-- Floating zoom controls, bottom-right of the diagram pane.
         Always visible (no auto-hide); positioned outside the scrolling
         viewport so they don't move with scroll. Compact size, low
         contrast so they don't fight the diagram for attention. -->
    <div
      v-if="hasAst"
      class="absolute bottom-3 right-3 flex items-center gap-0.5 px-1 py-0.5 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm select-none"
    >
      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="zoomIndex === 0"
        @click="zoomOut"
        title="Zoom out (Ctrl + scroll down)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M3 8h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>
      </button>

      <!-- Editable % field. Submits on blur or Enter. -->
      <input
        :value="zoomPercentDisplay"
        @change="onZoomInputChange"
        @keydown.enter.prevent="onZoomInputEnter"
        @focus="onZoomInputFocus"
        class="w-14 h-7 text-center text-xs font-medium tabular-nums text-gray-700 bg-transparent border-none focus:outline-none focus:bg-gray-50 rounded"
        type="text"
        :title="`Zoom level. Range: ${zoomPercent(ZOOM_LEVELS[0])}% to ${zoomPercent(ZOOM_LEVELS[ZOOM_LEVELS.length-1])}%`"
      />

      <button
        type="button"
        class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="zoomIndex === ZOOM_LEVELS.length - 1"
        @click="zoomIn"
        title="Zoom in (Ctrl + scroll up)"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/></svg>
      </button>

      <div class="w-px h-5 bg-gray-200 mx-0.5" />

      <button
        type="button"
        class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
        @click="zoomToFit"
        title="Fit diagram to viewport"
      >Fit</button>

      <button
        type="button"
        class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
        @click="zoomTo(1)"
        title="Reset to 100%"
      >1:1</button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The right-pane diagram canvas.
 *
 * Subscribes to the parser store's AST and recomputes the diagram layout
 * on every change. The layout function is pure, so the result is stable
 * across edits and across toggles of the collapse state.
 *
 * Owns two pieces of interactive state on top of the layout:
 *
 *   - `collapsedPaths`: which nested-field rows the user has collapsed
 *     (paths are keyed by `entityId::path`, persisted to localStorage).
 *     EntityCard emits toggle-path events when a caret is clicked.
 *
 *   - `zoom`: the canvas zoom multiplier (1.0 = 100%, range 0.25 to 4.0).
 *     Discrete stops (25/33/50/67/75/100/125/150/200/300/400 percent) for
 *     the +/- buttons, but the % input field accepts arbitrary values
 *     within range. Cursor-anchored zoom on Ctrl+wheel so the canvas
 *     point under the cursor stays under the cursor across zoom changes.
 *     Persisted to localStorage.
 *
 * Wheel behavior (browser-native on the overflow-auto wrapper):
 *   - Wheel:        vertical scroll
 *   - Shift+wheel:  horizontal scroll (browser default)
 *   - Ctrl+wheel:   intercepted -> zoom (we preventDefault so the page
 *                   doesn't browser-zoom)
 *
 * The viewBox stays at the natural layout size; we scale via the SVG's
 * width/height attributes. The browser's overflow handles all the
 * scroll math, which is far simpler than maintaining a transform on
 * inner content and a viewport-rect calculation.
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

import { useParserStore } from '@/stores/parserStore';

import EntityCard from './EntityCard.vue';
import RefLine from './RefLine.vue';
import { buildDiagram, makeCollapsedKey } from './layout';

const parser = useParserStore();

/* -------------------------------------------------------------------------
 * Collapse state
 * ----------------------------------------------------------------------- */

const COLLAPSE_STORAGE_KEY = 'xdbml-playground:collapsed-paths';

function loadCollapsed (): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    // ignore
  }
  return new Set();
}

const collapsedPaths = ref<Set<string>>(loadCollapsed());

watch(collapsedPaths, (set) => {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // best-effort persistence
  }
}, { deep: true });

function togglePath (entityId: string, path: string): void {
  const key = makeCollapsedKey(entityId, path);
  const next = new Set(collapsedPaths.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedPaths.value = next;
}

/* -------------------------------------------------------------------------
 * Zoom state
 *
 * The +/- buttons step through ZOOM_LEVELS. The % input field accepts
 * any value in [ZOOM_MIN, ZOOM_MAX]; on submit we clamp and apply.
 * Ctrl+wheel uses a finer step (sqrt of the discrete-step ratio) so the
 * wheel feels smooth rather than chunky.
 * ----------------------------------------------------------------------- */

const ZOOM_STORAGE_KEY = 'xdbml-playground:zoom';
const ZOOM_LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const ZOOM_MIN = ZOOM_LEVELS[0];
const ZOOM_MAX = ZOOM_LEVELS[ZOOM_LEVELS.length - 1];

function loadZoom (): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return 1;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= ZOOM_MIN && n <= ZOOM_MAX) return n;
  } catch {
    // ignore
  }
  return 1;
}

const zoom = ref<number>(loadZoom());

watch(zoom, (z) => {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(z));
  } catch {
    // best-effort
  }
});

const viewportEl = ref<HTMLDivElement | null>(null);

/** Helper to format zoom as a 0-decimal percentage. */
function zoomPercent (z: number): number {
  return Math.round(z * 100);
}

const zoomPercentDisplay = computed(() => `${zoomPercent(zoom.value)}%`);

/**
 * Find the index of the nearest discrete zoom level that's <= current.
 * Used by zoomIn/zoomOut so a hand-typed value like 110% snaps to the
 * next discrete stop in the requested direction.
 */
const zoomIndex = computed(() => {
  let idx = 0;
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    if (ZOOM_LEVELS[i] <= zoom.value + 1e-6) idx = i;
  }
  return idx;
});

function zoomIn (): void {
  const cur = zoom.value;
  // Step to next discrete level above current.
  for (let i = 0; i < ZOOM_LEVELS.length; i++) {
    if (ZOOM_LEVELS[i] > cur + 1e-6) {
      zoomToAnchored(ZOOM_LEVELS[i]);
      return;
    }
  }
}

function zoomOut (): void {
  const cur = zoom.value;
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < cur - 1e-6) {
      zoomToAnchored(ZOOM_LEVELS[i]);
      return;
    }
  }
}

/**
 * Set absolute zoom, anchored to the viewport center. Used by + and -
 * buttons and by the % input field. The Ctrl+wheel handler uses
 * `zoomToAnchored` with the cursor position instead.
 */
function zoomTo (target: number): void {
  zoomToAnchored(target);
}

/**
 * Set zoom to `target`, keeping the point at viewport coordinates
 * (anchorX, anchorY) fixed under the cursor (or, if no anchor given,
 * the viewport center). Math:
 *
 *   Canvas-coord of the anchor point before zoom:
 *     cx = (anchorX + scrollLeft) / oldZoom
 *     cy = (anchorY + scrollTop) / oldZoom
 *
 *   After zoom, we want that same canvas point to render at
 *   (anchorX, anchorY). So:
 *     anchorX = cx * newZoom - newScrollLeft
 *   =>
 *     newScrollLeft = cx * newZoom - anchorX
 *     newScrollTop  = cy * newZoom - anchorY
 *
 * We need to apply the new SVG size BEFORE assigning scroll positions,
 * because scroll can't exceed scrollWidth/scrollHeight. nextTick() lets
 * Vue update the SVG width/height attributes first.
 */
function zoomToAnchored (target: number, anchorX?: number, anchorY?: number): void {
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, target));
  const vp = viewportEl.value;
  if (!vp) {
    zoom.value = clamped;
    return;
  }
  const rect = vp.getBoundingClientRect();
  const ax = anchorX !== undefined ? anchorX : rect.width / 2;
  const ay = anchorY !== undefined ? anchorY : rect.height / 2;

  const oldZoom = zoom.value;
  const oldScrollLeft = vp.scrollLeft;
  const oldScrollTop = vp.scrollTop;

  // Canvas coordinates of the anchor point at the old zoom.
  const cx = (ax + oldScrollLeft) / oldZoom;
  const cy = (ay + oldScrollTop) / oldZoom;

  zoom.value = clamped;

  // Wait for Vue to update the SVG's width/height so the scrollable
  // area is large enough to hold the new scroll position.
  nextTick(() => {
    if (!vp) return;
    vp.scrollLeft = Math.max(0, cx * clamped - ax);
    vp.scrollTop  = Math.max(0, cy * clamped - ay);
  });
}

/**
 * Compute the zoom level that makes the entire diagram fit within the
 * viewport (with a 5% margin), then center-scroll. Used by the Fit
 * button.
 */
function zoomToFit (): void {
  const vp = viewportEl.value;
  if (!vp) return;
  const w = diagram.value.width;
  const h = diagram.value.height;
  if (w === 0 || h === 0) return;
  // 5% margin so the diagram doesn't touch the scrollbar/edge.
  const margin = 0.95;
  const fitZoom = Math.min(vp.clientWidth / w, vp.clientHeight / h) * margin;
  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
  zoom.value = clamped;
  // Center the diagram in the viewport after the next render.
  nextTick(() => {
    if (!vp) return;
    vp.scrollLeft = Math.max(0, (w * clamped - vp.clientWidth) / 2);
    vp.scrollTop  = Math.max(0, (h * clamped - vp.clientHeight) / 2);
  });
}

/* -------------------------------------------------------------------------
 * Zoom input field
 *
 * Accepts: '125', '125%', ' 125 % ', '1.5x' all parsed identically.
 * Empty / invalid input reverts to the current zoom on blur.
 * Enter commits the value (the @change handler also fires on blur).
 * ----------------------------------------------------------------------- */

function parseZoomInput (raw: string): number | null {
  const cleaned = raw.replace(/[%x\s]/gi, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  // If the user typed "1.5" we assume they meant a multiplier; if "125"
  // we assume percent. Threshold at 8 (i.e. 800%) -- above that we treat
  // as a percent regardless. Below 8 with a decimal point: multiplier.
  // Plain integer below 8: also multiplier (interpret '4' as 400%).
  // This is the convention dbdiagram/Figma use.
  return n >= 8 ? n / 100 : n;
}

function onZoomInputChange (e: Event): void {
  applyZoomInput((e.target as HTMLInputElement).value);
}

function onZoomInputEnter (e: KeyboardEvent): void {
  const input = e.target as HTMLInputElement;
  applyZoomInput(input.value);
  input.blur();
}

/**
 * Select the contents on focus so the user can type a new value
 * without having to clear the field first.
 */
function onZoomInputFocus (e: FocusEvent): void {
  const input = e.target as HTMLInputElement;
  // Defer to next frame: Chrome/Safari fight the selection inside a
  // synchronous focus handler.
  setTimeout(() => input.select(), 0);
}

function applyZoomInput (raw: string): void {
  const parsed = parseZoomInput(raw);
  if (parsed === null) {
    // Revert: force the display to re-render from the current zoom.
    zoom.value = zoom.value;
    return;
  }
  zoomTo(parsed);
}

/* -------------------------------------------------------------------------
 * Wheel handling
 *
 * Ctrl+wheel (and pinch-zoom on trackpads, which arrives as wheel with
 * ctrlKey:true): intercepted for zoom. Anchored on the cursor position
 * relative to the viewport.
 *
 * Other wheel events fall through to the browser, which does the right
 * thing on an overflow-auto container: vertical wheel scrolls vertical,
 * shift+wheel scrolls horizontal.
 * ----------------------------------------------------------------------- */

const WHEEL_ZOOM_SENSITIVITY = 0.0015; // tuned for typical wheel notches

function onWheel (e: WheelEvent): void {
  if (!e.ctrlKey && !e.metaKey) return; // let browser handle normal scroll
  e.preventDefault();
  const vp = viewportEl.value;
  if (!vp) return;
  const rect = vp.getBoundingClientRect();
  const anchorX = e.clientX - rect.left;
  const anchorY = e.clientY - rect.top;
  // deltaY > 0 means wheel scrolled DOWN -> zoom OUT.
  // Use multiplicative steps so zoom feels uniform across scales.
  const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
  zoomToAnchored(zoom.value * factor, anchorX, anchorY);
}

/* -------------------------------------------------------------------------
 * Diagram model -- recomputed reactively from AST + collapsed state.
 * ----------------------------------------------------------------------- */

const diagram = computed(() => buildDiagram(parser.ast, collapsedPaths.value));

const hasAst = computed(() => parser.hasAst);

const resolvedRefs = computed(() => diagram.value.refs.filter((r) => !r.unresolved));
const unresolvedRefCount = computed(() => diagram.value.refs.filter((r) => r.unresolved).length);

/* -------------------------------------------------------------------------
 * Lifecycle
 * ----------------------------------------------------------------------- */

onMounted(() => {
  // Some browsers (notably older Safari) fire Ctrl+wheel as a non-
  // preventable gesture when the listener is "passive". We registered
  // via @wheel which makes Vue use non-passive by default, but as a
  // belt-and-braces, also disable browser ctrl-wheel-zoom on the
  // document while the playground is mounted. Without this, Ctrl+wheel
  // can occasionally zoom the whole page instead of the canvas.
  document.addEventListener('wheel', preventBrowserZoom, { passive: false });
});

onBeforeUnmount(() => {
  document.removeEventListener('wheel', preventBrowserZoom);
});

function preventBrowserZoom (e: WheelEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return;
  // Only suppress when the event target is inside our viewport; let the
  // rest of the page behave normally.
  const vp = viewportEl.value;
  if (vp && vp.contains(e.target as Node)) {
    e.preventDefault();
  }
}
</script>

<style scoped>
.diagram-canvas {
  /* Grid background. Subtle dotted pattern at canvas zoom level keeps
     proportion with the diagram content; we render the grid in CSS
     rather than inside the SVG so it doesn't scale with zoom. */
  background-image: radial-gradient(circle, rgba(15, 23, 42, 0.06) 1px, transparent 1px);
  background-size: 20px 20px;
}
</style>
