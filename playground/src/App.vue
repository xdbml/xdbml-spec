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
      <section class="flex flex-col bg-white border-r border-gray-200" :style="{ width: editorWidth + 'px' }">
        <XdbmlEditor v-model="content" />
      </section>

      <!-- Drag handle for resizing -->
      <div
        class="w-1 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors flex-shrink-0"
        @mousedown="onDragStart"
      />

      <!-- Diagram pane -->
      <section class="flex-1 min-w-0 flex flex-col">
        <DiagramCanvas />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * App shell: header bar, then a two-pane main region (editor | diagram).
 *
 * Pane widths are user-adjustable via the vertical drag handle between
 * them, persisted to localStorage so users get the same layout on
 * reload. The diagram pane is the flex-grow child; the editor's width
 * is bound to a ref the drag handle updates.
 */
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';

import HeaderBar from '@/components/header/HeaderBar.vue';
import XdbmlEditor from '@/components/editor/XdbmlEditor.vue';
import DiagramCanvas from '@/components/diagram/DiagramCanvas.vue';
import { useParserStore } from '@/stores/parserStore';

const parser = useParserStore();

const content = computed({
  get: () => parser.content,
  set: (v: string) => parser.setContent(v),
});

/* -------------------------------------------------------------------------
 * Pane splitter
 * ----------------------------------------------------------------------- */

const WIDTH_KEY = 'xdbml-playground:editor-width';
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 280;
const MAX_WIDTH_FRACTION = 0.7;

function loadEditorWidth (): number {
  try {
    const stored = localStorage.getItem(WIDTH_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n) && n >= MIN_WIDTH) return n;
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIDTH;
}

const editorWidth = ref(loadEditorWidth());

let dragStartX = 0;
let dragStartWidth = 0;

function onDragStart (e: MouseEvent): void {
  e.preventDefault();
  dragStartX = e.clientX;
  dragStartWidth = editorWidth.value;
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup', onDragEnd);
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';
}

function onDragMove (e: MouseEvent): void {
  const delta = e.clientX - dragStartX;
  const max = window.innerWidth * MAX_WIDTH_FRACTION;
  const next = Math.max(MIN_WIDTH, Math.min(max, dragStartWidth + delta));
  editorWidth.value = next;
}

function onDragEnd (): void {
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup', onDragEnd);
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  try {
    localStorage.setItem(WIDTH_KEY, String(editorWidth.value));
  } catch {
    // ignore
  }
}

onMounted(() => {
  // Re-clamp on window resize so the editor doesn't escape the viewport
  // when a user resizes their browser narrower than the saved width.
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
});

function onResize (): void {
  const max = window.innerWidth * MAX_WIDTH_FRACTION;
  if (editorWidth.value > max) editorWidth.value = Math.max(MIN_WIDTH, max);
}
</script>
