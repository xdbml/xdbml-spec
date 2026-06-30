<template>
  <div ref="rootEl" class="relative inline-flex items-stretch">
    <!-- Main Save action. Saves to the current file handle (Chrome) or
         triggers a download (Firefox/Safari) if no handle is set. -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 text-xs font-medium text-gray-700 dark:text-slate-200 border border-transparent rounded-l transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
      :class="{ 'text-blue-700 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100': isDirty }"
      :title="saveTitle"
      @click="onSave"
    >
      <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 2h8l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
        <path d="M5 2v4h6V2"/>
        <path d="M5 14v-5h6v5"/>
      </svg>
      Save
    </button>

    <!-- Chevron button that opens the Save As menu. Separate button so
         clicking the main "Save" area triggers save directly while the
         chevron explicitly opens additional options. -->
    <button
      type="button"
      class="inline-flex items-center pl-1 pr-1.5 py-1 text-xs font-medium text-gray-500 dark:text-slate-400 border border-transparent rounded-r transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200 hover:border-gray-200 dark:hover:border-slate-600"
      :class="{ 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100': isDirty }"
      title="More save options"
      @click="toggleOpen"
    >
      <svg viewBox="0 0 16 16" class="w-3 h-3" fill="currentColor" aria-hidden="true">
        <path d="M4 6l4 4 4-4z"/>
      </svg>
    </button>

    <!-- Dropdown panel: currently just "Save As..." but the structure
         supports adding more file actions (Export to PNG, etc.) later
         without rearranging the header. -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50"
        role="menu"
      >
        <button
          type="button"
          class="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 active:bg-gray-100 transition-colors rounded-t-lg flex items-center gap-2"
          role="menuitem"
          @click="onSaveAs"
        >
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 2h8l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>
            <path d="M5 2v4h6V2"/>
          </svg>
          <span class="flex-1">Save as&hellip;</span>
          <span class="text-[10px] text-gray-400 dark:text-slate-500 font-mono">Ctrl+Shift+S</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * Split Save button: a main Save action plus a dropdown chevron that
 * reveals additional file actions (currently just Save As).
 *
 * Visual state:
 *   - Default: gray text, transparent border
 *   - Dirty: blue text + light blue background, signals "you have
 *     unsaved changes here"
 *
 * Behavior:
 *   - Save (main button): saveFile() -- overwrites the open handle
 *     on Chrome, or triggers Save As if no handle exists.
 *   - Save as (dropdown item): always saveFileAs() -- prompts for a
 *     filename and replaces the open handle on Chrome, or triggers a
 *     download on Firefox/Safari.
 */
import {
  computed, onBeforeUnmount, onMounted, ref,
} from 'vue';
import { storeToRefs } from 'pinia';

import { useFileSystem } from '@/composables/useFileSystem';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import logger from '@/utils/logger';

const fs = useFileSystemStore();
const { isDirty, filename } = storeToRefs(fs);
const { saveFile, saveFileAs } = useFileSystem();

const isOpen = ref<boolean>(false);
const rootEl = ref<HTMLElement | null>(null);

const saveTitle = computed<string>(() => {
  if (filename.value) {
    return `Save changes to ${filename.value} (Ctrl+S)`;
  }
  return 'Save the schema to a file (Ctrl+S)';
});

function toggleOpen (): void {
  isOpen.value = !isOpen.value;
}

async function onSave (): Promise<void> {
  isOpen.value = false;
  try {
    await saveFile();
  } catch (err) {
    logger.error('Save failed', err);
  }
}

async function onSaveAs (): Promise<void> {
  isOpen.value = false;
  try {
    await saveFileAs();
  } catch (err) {
    logger.error('Save As failed', err);
  }
}

/* ---- Click-outside dismissal for the dropdown ----------------------- */

function onDocumentClick (event: MouseEvent): void {
  if (!isOpen.value) return;
  if (rootEl.value && !rootEl.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick));
</script>
