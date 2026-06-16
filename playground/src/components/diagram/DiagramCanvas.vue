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
          <div>See the diagnostics panel below for the parse error</div>
        </div>
      </div>
      <svg
        v-else
        :width="diagram.width * zoom"
        :height="diagram.height * zoom"
        :viewBox="`0 0 ${diagram.width} ${diagram.height}`"
        class="block"
        @click="onBackgroundClick"
      >
        <defs>
          <!-- Entity card drop-shadow. Subtle -- the diagram already has
               a grid background that provides depth. -->
          <filter id="entity-shadow" x="-5%" y="-5%" width="110%" height="115%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.12" />
          </filter>
        </defs>

        <!-- Containers (drawn first so entities render on top).
             Clicking the body (dashed border area) selects the
             container. Mousedown on the title bar starts a drag that
             translates the container and all its member entities
             together; if no movement occurs (< 2 px), the drag ends as
             a selection click instead. Selection thickens the outline. -->
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
            :stroke="isContainerSelected(container.name) ? '#2563eb' : '#cbd5e1'"
            :stroke-width="isContainerSelected(container.name) ? 2.5 : 1.5"
            stroke-dasharray="4 3"
            style="cursor: pointer;"
            @click.stop="onContainerClick(container.name, $event)"
          />
          <rect
            :x="container.bounds.x"
            :y="container.bounds.y"
            :width="container.bounds.width"
            :height="32"
            :fill="container.accentColor"
            rx="6"
            style="cursor: grab;"
            @mousedown.stop="onContainerDragStart(container.name, $event)"
          />
          <rect
            :x="container.bounds.x"
            :y="container.bounds.y + 16"
            :width="container.bounds.width"
            height="16"
            :fill="container.accentColor"
            style="cursor: grab;"
            @mousedown.stop="onContainerDragStart(container.name, $event)"
          />
          <text
            :x="container.bounds.x + 12"
            :y="container.bounds.y + 21"
            :fill="container.headerInk"
            font-size="13"
            font-weight="600"
            style="pointer-events: none; user-select: none;"
          >{{ container.keyword }} · {{ container.name }}</text>
          <text
            v-if="container.target"
            :x="container.bounds.x + container.bounds.width - 12"
            :y="container.bounds.y + 21"
            :fill="container.headerInk"
            font-size="11"
            text-anchor="end"
            opacity="0.85"
            style="pointer-events: none; user-select: none;"
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
            :containers="diagram.containers"
            :is-selected="isRefSelected(ref.id)"
            @select="onRefClick(ref.id)"
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
            :selection="selectionForEntity(entity.id)"
            :is-selected="isEntitySelected(entity.id)"
            @toggle-path="(path) => togglePath(entity.id, path)"
            @drag-start="onEntityDragStart"
            @select-field="(path) => onFieldClick(entity.id, path)"
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

      <div class="w-px h-5 bg-gray-200 mx-0.5" />

      <!-- Auto-arrange. A small menu of layout strategies; applying one
           writes positions for every entity (revertible via Reset). -->
      <div ref="arrangeWrap" class="relative">
        <button
          type="button"
          class="h-7 px-2 flex items-center gap-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
          @click="arrangeMenuOpen = !arrangeMenuOpen"
          title="Auto-arrange the diagram"
        >
          Arrange
          <svg viewBox="0 0 16 16" class="w-2.5 h-2.5"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div
          v-if="arrangeMenuOpen"
          class="absolute bottom-full right-0 mb-1 w-40 py-1 bg-white border border-gray-200 rounded-lg shadow-lg"
        >
          <button
            type="button"
            class="w-full px-3 py-1.5 flex items-center text-left text-xs text-gray-700 hover:bg-gray-100"
            @click="arrange('relational')"
          >Relational</button>
          <button
            type="button"
            class="w-full px-3 py-1.5 flex items-center text-left text-xs text-gray-700 hover:bg-gray-100"
            @click="arrange('star')"
          >Star schema</button>
        </div>
      </div>

      <!-- Reset entity positions to layout default. Only shown when at
           least one position has been overridden, otherwise the button
           would be confusing (nothing to reset). -->
      <template v-if="userPositions.size > 0">
        <div class="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          type="button"
          class="h-7 px-2 flex items-center text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
          @click="resetPositions"
          :title="`Reset ${userPositions.size} repositioned entit${userPositions.size === 1 ? 'y' : 'ies'} to layout default`"
        >Reset positions</button>
      </template>
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
import { buildDiagram, makeCollapsedKey, applyUserPositions } from './layout';
import type { UserPositions } from './layout';
import { autoArrange } from './auto-arrange';
import type { ArrangeStrategy } from './auto-arrange';
import type { Selection } from '@/components/inspector/selection';

const parser = useParserStore();

/* -------------------------------------------------------------------------
 * Selection plumbing
 *
 * Selection state lives in App.vue (shared between this canvas and the
 * Inspector). We receive it as a prop, paint the highlight, and emit
 * `select` events when the user clicks something. The parent decides
 * what to store and how to react.
 *
 * Click sources:
 *   - Container body/header rect: explicit @click handler below
 *   - Entity header: drag handler's mouseup-with-no-movement fires
 *     `select` instead of persisting a drag
 *   - Field row: EntityCard's `select-field` event
 *   - Ref line: RefLine's `select` event
 *   - SVG background (didn't hit anything else): clears the selection
 * ----------------------------------------------------------------------- */

const props = defineProps<{
  selection: Selection;
}>();

const emit = defineEmits<{
  select: [selection: Selection];
}>();

function onContainerClick (containerName: string, e: MouseEvent): void {
  e.stopPropagation();
  emit('select', { kind: 'container', containerName });
}

function onEntityHeaderClick (entityId: string): void {
  // Called by the drag handler on mouseup when no movement occurred.
  emit('select', { kind: 'entity', entityId });
}

function onFieldClick (entityId: string, path: string): void {
  emit('select', { kind: 'field', entityId, path });
}

function onRefClick (refId: string): void {
  emit('select', { kind: 'ref', refId });
}

function onBackgroundClick (e: MouseEvent): void {
  // Only fire when the click target is the SVG element itself, not a
  // descendant. Click events bubble from inside the SVG to the outer
  // SVG, so we filter by target identity to detect actual-background
  // clicks vs clicks that landed on a card/ref/container.
  if (e.target === e.currentTarget) {
    emit('select', null);
  }
}

function isContainerSelected (name: string): boolean {
  return props.selection?.kind === 'container' && props.selection.containerName === name;
}

function isEntitySelected (entityId: string): boolean {
  // An entity highlights when:
  //   - it's directly selected
  //   - one of its fields is selected (the card outline still tints,
  //     and EntityCard handles the row-level highlight internally)
  if (props.selection?.kind === 'entity' && props.selection.entityId === entityId) return true;
  if (props.selection?.kind === 'field'  && props.selection.entityId === entityId) return true;
  return false;
}

function isRefSelected (refId: string): boolean {
  return props.selection?.kind === 'ref' && props.selection.refId === refId;
}

/** What to pass to EntityCard so it can also highlight a selected field row. */
function selectionForEntity (entityId: string): Selection {
  if (props.selection?.kind === 'field' && props.selection.entityId === entityId) {
    return props.selection;
  }
  return null;
}

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
 * Compute the zoom level that makes the diagram fit nicely within the
 * viewport, then center-scroll. Used by the Fit button.
 *
 * "Nicely" is shape-dependent:
 *
 *   - For roughly square or wider-than-tall diagrams, use strict fit:
 *     min(viewportWidth / contentWidth, viewportHeight / contentHeight),
 *     with a 5% margin. This makes the whole diagram visible at the
 *     largest zoom that doesn't overflow.
 *
 *   - For tall diagrams (where strict fit would zoom below 50%), use
 *     fit-to-width instead: the diagram fills the viewport horizontally
 *     and the user scrolls vertically. This keeps text readable rather
 *     than shrinking it to illegibility just to fit a tall column of
 *     entities on one screen.
 *
 * The 50% threshold is the practical floor for readable text. Below
 * that, the schema becomes a thumbnail rather than a working view, and
 * the user has to manually zoom in anyway. Fit-to-width gives a usable
 * starting zoom while preserving the option to scroll.
 *
 * The fit-to-width branch caps at 75% (not 100%) so the diagram has
 * generous side margins rather than filling the viewport edge-to-edge.
 * At 75% of 1:1, an 800-pixel-wide schema renders 600 pixels wide,
 * with the remaining viewport width as comfortable margin. Capping at
 * 100% would feel "too zoomed in" -- technically correct but visually
 * cramped, especially on monitors where the playground occupies most
 * of the screen width. Also clamps to the global ZOOM_MIN/MAX range.
 *
 * Important: Fit uses the ACTUAL CONTENT bounding box (the smallest
 * rectangle enclosing all entities and containers), NOT `diagram.width`
 * and `diagram.height`. The canvas dimensions stored on the diagram
 * are sticky in `applyUserPositions` -- they grow as the user drags
 * entities into new territory but never shrink back when the user
 * compacts the layout. So the canvas can be much larger than the
 * actual content footprint. Fit needs the live content extent or it
 * zooms against phantom empty space.
 */
function zoomToFit (): void {
  const vp = viewportEl.value;
  if (!vp) return;

  // Compute the bounding box of every visible piece of content. We
  // include containers (which wrap their entities) and free-floating
  // entities (those without containers). Refs aren't included --
  // their endpoints already sit on entity boundaries, so the entity
  // bounds cover them.
  const d = diagram.value;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of d.containers) {
    if (c.bounds.x < minX) minX = c.bounds.x;
    if (c.bounds.y < minY) minY = c.bounds.y;
    if (c.bounds.x + c.bounds.width > maxX) maxX = c.bounds.x + c.bounds.width;
    if (c.bounds.y + c.bounds.height > maxY) maxY = c.bounds.y + c.bounds.height;
  }
  for (const e of d.entities) {
    if (e.bounds.x < minX) minX = e.bounds.x;
    if (e.bounds.y < minY) minY = e.bounds.y;
    if (e.bounds.x + e.bounds.width > maxX) maxX = e.bounds.x + e.bounds.width;
    if (e.bounds.y + e.bounds.height > maxY) maxY = e.bounds.y + e.bounds.height;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW === 0 || contentH === 0) return;

  // 5% margin so the diagram doesn't touch the scrollbar/edge.
  const margin = 0.95;
  const strict = Math.min(vp.clientWidth / contentW, vp.clientHeight / contentH) * margin;

  let fitZoom: number;
  if (strict >= 0.5) {
    // Strict fit gives a readable zoom; use it as-is.
    fitZoom = strict;
  } else {
    // Diagram is too tall (relative to the viewport) for strict fit to
    // produce a readable zoom. Switch to fit-to-width with generous
    // breathing room; the user scrolls vertically. Cap at 75% so the
    // diagram doesn't fill the viewport edge-to-edge.
    fitZoom = Math.min((vp.clientWidth / contentW) * margin, 0.75);
  }

  const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitZoom));
  zoom.value = clamped;

  // Scroll so the content is centered (or top-anchored for tall content
  // that exceeds the viewport vertically). The (minX, minY) offset
  // accounts for content that starts away from origin -- after user
  // drags or in the original layout's canvas-margin region.
  nextTick(() => {
    if (!vp) return;
    const scaledContentLeft = minX * clamped;
    const scaledContentTop  = minY * clamped;
    const scaledW = contentW * clamped;
    const scaledH = contentH * clamped;

    vp.scrollLeft = Math.max(0, scaledContentLeft - (vp.clientWidth - scaledW) / 2);
    vp.scrollTop  = scaledH > vp.clientHeight
      ? Math.max(0, scaledContentTop - 20)
      : Math.max(0, scaledContentTop - (vp.clientHeight - scaledH) / 2);
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
 * User-overridden entity positions (drag-to-reposition)
 *
 * Stored as a Map<entityId, {x, y}> in SVG coordinates. Storing in SVG
 * units (not viewport pixels) means zoom doesn't affect persistence:
 * drag at 50% zoom, reload at 200% zoom, and the entity is still at
 * the same canvas point.
 *
 * Keyed by `EntityLayout.id` which is `containerName.entityName` or
 * just `entityName` for orphans. So if a user renames an entity in
 * source, its position override is dropped (the key no longer matches)
 * and the entity reverts to layout-default. That's the intended
 * behavior -- renaming is a structural change.
 * ----------------------------------------------------------------------- */

const POSITIONS_STORAGE_KEY = 'xdbml-playground:entity-positions';

function loadUserPositions (): Map<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(POSITIONS_STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return new Map();
    const out = new Map<string, { x: number; y: number }>();
    for (const [k, v] of Object.entries(obj)) {
      if (
        v && typeof v === 'object' &&
        typeof (v as { x?: unknown }).x === 'number' &&
        typeof (v as { y?: unknown }).y === 'number'
      ) {
        out.set(k, { x: (v as { x: number }).x, y: (v as { y: number }).y });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

const userPositions = ref<Map<string, { x: number; y: number }>>(loadUserPositions());

function persistUserPositions (): void {
  try {
    const obj: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of userPositions.value) obj[k] = v;
    localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // best-effort
  }
}

function resetPositions (): void {
  if (userPositions.value.size === 0) return;
  userPositions.value = new Map();
  persistUserPositions();
}

/* -------------------------------------------------------------------------
 * Auto-arrange
 *
 * Computes a position for every entity using a layout strategy and writes
 * the result into the same `userPositions` map that dragging uses. So an
 * applied arrangement persists (localStorage) and is reverted by the
 * existing "Reset positions" button; manual drags afterwards just edit
 * individual entries. Pressing Arrange again recomputes from the base
 * auto-layout, overwriting any manual nudges.
 *
 * Arrange runs off the *base* diagram (buildDiagram, pre-overlay) so the
 * strategy sees the natural sizes and refs, not a previously arranged set.
 * ----------------------------------------------------------------------- */

const GRID_SNAP = 20; // matches the canvas CSS grid pitch (background-size)
const snapToGrid = (v: number): number => Math.round(v / GRID_SNAP) * GRID_SNAP;

const arrangeMenuOpen = ref(false);
const arrangeWrap = ref<HTMLElement | null>(null);

function arrange (strategy: ArrangeStrategy): void {
  const base = buildDiagram(parser.flatAst, collapsedPaths.value);
  userPositions.value = new Map(autoArrange(base, strategy));
  persistUserPositions();
  arrangeMenuOpen.value = false;
}

// Close the Arrange menu on any click outside its wrapper.
function onArrangeOutside (e: MouseEvent): void {
  if (!arrangeMenuOpen.value) return;
  const el = arrangeWrap.value;
  if (el && !el.contains(e.target as Node)) arrangeMenuOpen.value = false;
}

/* -------------------------------------------------------------------------
 * Drag interaction
 *
 * EntityCard emits `drag-start` on header mousedown. We then attach
 * document-level mousemove and mouseup listeners so the cursor can
 * leave the card while the button is held. Math:
 *
 *   pixel delta in viewport      = clientX - dragStartClientX
 *   SVG-units delta              = pixelDelta / zoom
 *   new entity position          = dragStartEntityPos + svgDelta
 *
 * The drag updates `userPositions` reactively so the entity follows
 * the cursor in real time; the resulting diagram model is recomputed
 * by `applyUserPositions`, which also recomputes container bounds and
 * the overall canvas size.
 *
 * On mouseup, we persist to localStorage.
 * ----------------------------------------------------------------------- */

interface DragState {
  entityId: string;
  startEntityX: number;
  startEntityY: number;
  startClientX: number;
  startClientY: number;
  startZoom: number;
  moved: boolean; // gate persistence on actual movement
}

let dragState: DragState | null = null;

function onEntityDragStart (e: { entityId: string; clientX: number; clientY: number }): void {
  const entity = diagram.value.entities.find((x) => x.id === e.entityId);
  if (!entity) return;
  dragState = {
    entityId: e.entityId,
    startEntityX: entity.bounds.x,
    startEntityY: entity.bounds.y,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startZoom: zoom.value,
    moved: false,
  };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  // Suppress text selection during drag.
  document.body.style.userSelect = 'none';
}

function onDragMove (e: MouseEvent): void {
  if (!dragState) return;
  const dxPx = e.clientX - dragState.startClientX;
  const dyPx = e.clientY - dragState.startClientY;
  // Tiny movements (under 2px) shouldn't trigger a position write --
  // accidental wiggles when the user actually meant to click. Once
  // we've crossed the threshold once, all subsequent moves count.
  if (!dragState.moved && Math.abs(dxPx) < 2 && Math.abs(dyPx) < 2) return;
  dragState.moved = true;

  // Convert pixel delta to SVG-unit delta via the zoom at drag start.
  // (Using current zoom would cause weird behavior if the user
  // somehow zoomed mid-drag via keyboard; using start-zoom is stable.)
  const dxSvg = dxPx / dragState.startZoom;
  const dySvg = dyPx / dragState.startZoom;
  const newX = dragState.startEntityX + dxSvg;
  const newY = dragState.startEntityY + dySvg;

  // Clamp to non-negative coordinates -- entities shouldn't go into
  // negative canvas space (it would be unreachable by scroll).
  const clampedX = Math.max(0, newX);
  const clampedY = Math.max(0, newY);

  const next = new Map(userPositions.value);
  next.set(dragState.entityId, { x: clampedX, y: clampedY });
  userPositions.value = next;
}

function onDragEnd (): void {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.body.style.userSelect = '';
  const final = dragState;
  dragState = null;
  if (final?.moved) {
    // Snap the dropped entity to the grid so orthogonal edges line up.
    const cur = userPositions.value.get(final.entityId);
    if (cur) {
      const next = new Map(userPositions.value);
      next.set(final.entityId, { x: snapToGrid(cur.x), y: snapToGrid(cur.y) });
      userPositions.value = next;
    }
    persistUserPositions();
  } else if (final) {
    // No drag actually happened (< 2px movement): treat as a click on
    // the entity header and emit a selection event.
    onEntityHeaderClick(final.entityId);
  }
}

/* -------------------------------------------------------------------------
 * Container drag interaction
 *
 * Mousedown on a container's title bar starts a drag that translates
 * the container AND all its member entities together. The container's
 * own bounds aren't stored anywhere -- in `applyUserPositions`, the
 * container's rectangle is recomputed as the bounding box of its
 * members. So a container drag just means: apply the same (dx, dy) to
 * every member's userPositions entry. The container's visible position
 * follows automatically.
 *
 * Math:
 *   dxPx        = clientX - startClientX
 *   dxSvg       = dxPx / startZoom
 *   for each member entity:
 *     newPos.x  = startMemberPos.x + clampedDxSvg
 *     newPos.y  = startMemberPos.y + clampedDySvg
 *
 * Clamping keeps the container rigid: rather than clamping each
 * member's coordinate to non-negative independently (which would let
 * some members stop while others kept moving, warping the container),
 * we clamp the DELTA based on the member nearest the origin at drag
 * start. Once any member would hit x=0 (or y=0), the entire container
 * stops moving in that axis.
 *
 * Click vs drag: same 2 px threshold as entity drag. Mouseup without
 * movement fires container selection instead of persisting.
 *
 * Empty containers (zero members) are a no-op: there's nothing to
 * translate. Selection still works via the no-movement branch.
 * ----------------------------------------------------------------------- */

interface ContainerDragState {
  containerName: string;
  /** Each member entity's position at drag start, keyed by entity id. */
  startMemberPositions: Map<string, { x: number; y: number }>;
  /** Smallest X and Y across members; used to clamp the delta so the
   *  container can't extend into negative canvas space. */
  minMemberX: number;
  minMemberY: number;
  startClientX: number;
  startClientY: number;
  startZoom: number;
  moved: boolean;
}

let containerDragState: ContainerDragState | null = null;

function onContainerDragStart (containerName: string, e: MouseEvent): void {
  // Only respond to primary-button presses.
  if (e.button !== 0) return;
  const members = diagram.value.entities.filter((ent) => ent.containerName === containerName);
  const startMemberPositions = new Map<string, { x: number; y: number }>();
  let minMemberX = Infinity;
  let minMemberY = Infinity;
  for (const m of members) {
    startMemberPositions.set(m.id, { x: m.bounds.x, y: m.bounds.y });
    if (m.bounds.x < minMemberX) minMemberX = m.bounds.x;
    if (m.bounds.y < minMemberY) minMemberY = m.bounds.y;
  }
  // If the container has no members, there's nothing to translate.
  // We still set up the state so a no-movement mouseup fires the
  // selection click, but skip the document-level move listener.
  containerDragState = {
    containerName,
    startMemberPositions,
    minMemberX: members.length > 0 ? minMemberX : 0,
    minMemberY: members.length > 0 ? minMemberY : 0,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startZoom: zoom.value,
    moved: false,
  };
  document.addEventListener('mousemove', onContainerDragMove);
  document.addEventListener('mouseup', onContainerDragEnd);
  // Cursor + text-selection suppression for the duration of the drag.
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
}

function onContainerDragMove (e: MouseEvent): void {
  if (!containerDragState) return;
  const dxPx = e.clientX - containerDragState.startClientX;
  const dyPx = e.clientY - containerDragState.startClientY;
  if (!containerDragState.moved && Math.abs(dxPx) < 2 && Math.abs(dyPx) < 2) return;
  containerDragState.moved = true;

  const requestedDx = dxPx / containerDragState.startZoom;
  const requestedDy = dyPx / containerDragState.startZoom;
  // Don't let the container extend into negative canvas space: clamp
  // the delta so the nearest-to-origin member never crosses 0. If
  // requestedDx is positive (moving right), no clamping needed; if
  // negative (moving left), clamp to at most -minMemberX (i.e., the
  // amount that puts the leftmost member exactly at x=0).
  const clampedDx = Math.max(-containerDragState.minMemberX, requestedDx);
  const clampedDy = Math.max(-containerDragState.minMemberY, requestedDy);

  // Update every member entity's position in a single Map mutation so
  // the reactive recompute fires once and the container's bounds (and
  // visual position) follow as one rigid block.
  const next = new Map(userPositions.value);
  for (const [entityId, startPos] of containerDragState.startMemberPositions) {
    next.set(entityId, {
      x: startPos.x + clampedDx,
      y: startPos.y + clampedDy,
    });
  }
  userPositions.value = next;
}

function onContainerDragEnd (): void {
  document.removeEventListener('mousemove', onContainerDragMove);
  document.removeEventListener('mouseup', onContainerDragEnd);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  const final = containerDragState;
  containerDragState = null;
  if (final?.moved) {
    // Snap the whole container as a rigid block: align its top-left-most
    // member to the grid, then shift every member by the same correction
    // so relative offsets within the container are preserved.
    const next = new Map(userPositions.value);
    let anchor: { x: number; y: number } | null = null;
    for (const id of final.startMemberPositions.keys()) {
      const cur = next.get(id);
      if (!cur) continue;
      if (!anchor || cur.x + cur.y < anchor.x + anchor.y) anchor = cur;
    }
    if (anchor) {
      const corrX = snapToGrid(anchor.x) - anchor.x;
      const corrY = snapToGrid(anchor.y) - anchor.y;
      if (corrX !== 0 || corrY !== 0) {
        for (const id of final.startMemberPositions.keys()) {
          const cur = next.get(id);
          if (cur) next.set(id, { x: cur.x + corrX, y: cur.y + corrY });
        }
        userPositions.value = next;
      }
    }
    persistUserPositions();
  } else if (final) {
    // No drag actually happened: treat as a click and select the
    // container, same as the body-rect click handler does.
    emit('select', { kind: 'container', containerName: final.containerName });
  }
}

/* -------------------------------------------------------------------------
 * Diagram model -- recomputed reactively from AST, collapsed state,
 * and user-overridden positions.
 *
 * The pipeline is:
 *   1. buildDiagram(ast, collapsedPaths) -- pure layout from source
 *   2. applyUserPositions(diagram, userPositions) -- overlay user moves,
 *      recompute container bounds + canvas size
 * ----------------------------------------------------------------------- */

const diagram = computed(() => {
  const base = buildDiagram(parser.flatAst, collapsedPaths.value);
  return applyUserPositions(base, userPositions.value as UserPositions);
});

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
  document.addEventListener('mousedown', onArrangeOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('wheel', preventBrowserZoom);
  document.removeEventListener('mousedown', onArrangeOutside);
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
