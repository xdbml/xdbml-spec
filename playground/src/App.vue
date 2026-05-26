<template>
  <div class="h-screen flex flex-col bg-gray-50">
    <HeaderBar />

    <!-- Thin parsing-progress strip so users see the system reacting. -->
    <div
      class="h-0.5 flex-shrink-0 transition-opacity duration-150"
      :class="parser.isLoading ? 'opacity-100' : 'opacity-0'"
    >
      <div class="h-full bg-blue-500 animate-pulse w-full" />
    </div>

    <main class="flex-1 min-h-0 flex">
      <!-- Editor pane -->
      <section
        class="flex flex-col bg-white border-r border-gray-200"
        :style="{ width: editorWidth + 'px' }"
      >
        <XdbmlEditor ref="editorRef" v-model="content" />
      </section>

      <!-- Drag handle: editor | diagram -->
      <div
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors flex-shrink-0"
        @mousedown="onEditorDragStart"
      />

      <!-- Diagram pane (flex-grow) -->
      <section class="flex-1 min-w-0 flex flex-col">
        <DiagramCanvas
          :selection="selection"
          @select="onSelect"
        />
      </section>

      <!-- Drag handle: diagram | inspector (only shown when inspector is open) -->
      <div
        v-if="inspectorVisible"
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors flex-shrink-0"
        @mousedown="onInspectorDragStart"
      />

      <!-- Inspector pane: visible when something is selected AND user
           hasn't explicitly closed it. -->
      <section
        v-if="inspectorVisible"
        class="flex-shrink-0"
        :style="{ width: inspectorWidth + 'px' }"
      >
        <Inspector
          :selection="selection"
          @close="onInspectorClose"
          @edit-source="onEditSource"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * App shell: header, then a three-pane main region.
 *
 *   [Editor]  ↔  [Diagram]  ↔  [Inspector]
 *
 * The Editor and Inspector widths are user-adjustable via drag handles
 * and persisted to localStorage. The Diagram is the flex-grow center
 * pane.
 *
 * The Inspector pane is hidden when nothing is selected. Clicking
 * anything in the diagram opens it. The X button on the inspector
 * header closes it (and clears the selection). Clicking the diagram
 * background also clears the selection.
 *
 * Selection state lives here because three children need to know it:
 *   - DiagramCanvas paints the highlight on whatever is selected
 *   - Inspector renders the right page based on it
 *   - XdbmlEditor's `revealPosition` is called from here when the user
 *     clicks the inspector's "Edit in source" button
 *
 * Selection is persisted across reloads. If the schema changes such
 * that the selection no longer points at anything (renamed entity,
 * deleted field), the Inspector silently shows the empty state.
 */
import { computed, ref, useTemplateRef, watch, onMounted, onBeforeUnmount } from 'vue';
import type { Span } from '@xdbml/parse';

import HeaderBar from '@/components/header/HeaderBar.vue';
import XdbmlEditor from '@/components/editor/XdbmlEditor.vue';
import DiagramCanvas from '@/components/diagram/DiagramCanvas.vue';
import Inspector from '@/components/inspector/Inspector.vue';
import { useParserStore } from '@/stores/parserStore';
import { selectionEquals, type Selection } from '@/components/inspector/selection';
import { spanStart } from '@/components/inspector/source-location';

const parser = useParserStore();

const content = computed({
  get: () => parser.content,
  set: (v: string) => parser.setContent(v),
});

// XdbmlEditor exposes revealPosition via defineExpose.
const editorRef = useTemplateRef<{
  revealPosition: (line: number, column: number) => void;
}>('editorRef');

/* -------------------------------------------------------------------------
 * Selection state
 * ----------------------------------------------------------------------- */

const SELECTION_STORAGE_KEY = 'xdbml-playground:selection';

function loadSelection (): Selection {
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Selection;
    return parsed;
  } catch {
    return null;
  }
}

const selection = ref<Selection>(loadSelection());

watch(selection, (s) => {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // best-effort
  }
});

function onSelect (s: Selection): void {
  if (selectionEquals(selection.value, s)) return;
  selection.value = s;
}

/* -------------------------------------------------------------------------
 * Inspector pane open / closed
 *
 * Combined state: user hasn't explicitly closed AND something is
 * selected. The close button sets the manual flag to false (and
 * clears the selection); making a new selection re-opens automatically.
 * ----------------------------------------------------------------------- */

const INSPECTOR_OPEN_KEY = 'xdbml-playground:inspector-open';

function loadInspectorOpen (): boolean {
  try {
    const v = localStorage.getItem(INSPECTOR_OPEN_KEY);
    if (v === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

const inspectorOpenManual = ref(loadInspectorOpen());

const inspectorVisible = computed(
  () => inspectorOpenManual.value && selection.value !== null,
);

watch(inspectorOpenManual, (v) => {
  try {
    localStorage.setItem(INSPECTOR_OPEN_KEY, String(v));
  } catch {
    // ignore
  }
});

function onInspectorClose (): void {
  inspectorOpenManual.value = false;
  selection.value = null;
}

// New selection re-opens the inspector if previously closed.
watch(selection, (s) => {
  if (s !== null && !inspectorOpenManual.value) {
    inspectorOpenManual.value = true;
  }
});

/* -------------------------------------------------------------------------
 * Edit-in-source: jump Monaco to an AST node's source position.
 * ----------------------------------------------------------------------- */

function onEditSource (span: Span): void {
  const pos = spanStart(span);
  editorRef.value?.revealPosition(pos.line, pos.column);
}

/* -------------------------------------------------------------------------
 * Pane splitter -- editor / diagram
 * ----------------------------------------------------------------------- */

const EDITOR_WIDTH_KEY = 'xdbml-playground:editor-width';
const EDITOR_DEFAULT = 520;
const EDITOR_MIN = 280;
const EDITOR_MAX_FRACTION = 0.7;

function loadEditorWidth (): number {
  try {
    const stored = localStorage.getItem(EDITOR_WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= EDITOR_MIN) return n;
    }
  } catch {
    // ignore
  }
  return EDITOR_DEFAULT;
}

const editorWidth = ref(loadEditorWidth());

let editorDragStartX = 0;
let editorDragStartWidth = 0;

function onEditorDragStart (e: MouseEvent): void {
  e.preventDefault();
  editorDragStartX = e.clientX;
  editorDragStartWidth = editorWidth.value;
  window.addEventListener('mousemove', onEditorDragMove);
  window.addEventListener('mouseup', onEditorDragEnd);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
}

function onEditorDragMove (e: MouseEvent): void {
  const delta = e.clientX - editorDragStartX;
  const max = window.innerWidth * EDITOR_MAX_FRACTION;
  editorWidth.value = Math.max(EDITOR_MIN, Math.min(max, editorDragStartWidth + delta));
}

function onEditorDragEnd (): void {
  window.removeEventListener('mousemove', onEditorDragMove);
  window.removeEventListener('mouseup', onEditorDragEnd);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  try {
    localStorage.setItem(EDITOR_WIDTH_KEY, String(editorWidth.value));
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------
 * Pane splitter -- diagram / inspector
 *
 * Symmetric to the editor splitter but with reversed direction: the
 * inspector grows when dragged LEFT (toward the diagram).
 * ----------------------------------------------------------------------- */

const INSPECTOR_WIDTH_KEY = 'xdbml-playground:inspector-width';
const INSPECTOR_DEFAULT = 320;
const INSPECTOR_MIN = 240;
const INSPECTOR_MAX = 600;

function loadInspectorWidth (): number {
  try {
    const stored = localStorage.getItem(INSPECTOR_WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= INSPECTOR_MIN) return n;
    }
  } catch {
    // ignore
  }
  return INSPECTOR_DEFAULT;
}

const inspectorWidth = ref(loadInspectorWidth());

let inspectorDragStartX = 0;
let inspectorDragStartWidth = 0;

function onInspectorDragStart (e: MouseEvent): void {
  e.preventDefault();
  inspectorDragStartX = e.clientX;
  inspectorDragStartWidth = inspectorWidth.value;
  window.addEventListener('mousemove', onInspectorDragMove);
  window.addEventListener('mouseup', onInspectorDragEnd);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
}

function onInspectorDragMove (e: MouseEvent): void {
  const delta = inspectorDragStartX - e.clientX; // reversed
  inspectorWidth.value = Math.max(INSPECTOR_MIN, Math.min(INSPECTOR_MAX, inspectorDragStartWidth + delta));
}

function onInspectorDragEnd (): void {
  window.removeEventListener('mousemove', onInspectorDragMove);
  window.removeEventListener('mouseup', onInspectorDragEnd);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  try {
    localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth.value));
  } catch {
    // ignore
  }
}

/* -------------------------------------------------------------------------
 * Resize clamp
 * ----------------------------------------------------------------------- */

onMounted(() => {
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});

function onResize (): void {
  const max = window.innerWidth * EDITOR_MAX_FRACTION;
  if (editorWidth.value > max) editorWidth.value = Math.max(EDITOR_MIN, max);
}
</script>
