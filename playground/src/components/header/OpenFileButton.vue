<template>
  <div class="relative">
    <!-- Open button: triggers the file picker. On unsaved-content,
         shows a confirmation modal first. -->
    <button
      type="button"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-slate-200 border border-transparent rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
      :title="canUseFsAccess ? 'Open an .xdbml file from your computer' : 'Open an .xdbml file from your computer (download mode)'"
      @click="onOpenClick"
    >
      <svg viewBox="0 0 16 16" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/>
      </svg>
      Open
    </button>

    <!-- Unsaved-changes confirmation modal. Shown when the user clicks
         Open while the editor has unsaved changes. Three actions:
         Cancel (dismiss), Discard (open anyway, lose changes), or
         Save first (save then open). Save first works on all browsers
         (Chrome saves to handle/picker, Firefox/Safari trigger a
         download). -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showConfirm"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
        role="dialog"
        aria-modal="true"
        @click.self="onCancel"
      >
        <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 max-w-sm w-full mx-4 p-5">
          <h2 class="text-sm font-semibold text-gray-900 dark:text-slate-100">
            You have unsaved changes
          </h2>
          <p class="mt-1.5 text-xs text-gray-600 dark:text-slate-300">
            Opening a new file will discard your current edits unless you save them first.
          </p>
          <div class="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors cursor-pointer"
              @click="onCancel"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 rounded transition-colors cursor-pointer"
              @click="onDiscard"
            >
              Discard and open
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors cursor-pointer"
              @click="onSaveFirst"
            >
              Save first
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * Open button + the unsaved-changes confirmation modal.
 *
 * Click flow:
 *   1. Click triggers onOpenClick().
 *   2. If isDirty, show the modal. User picks Cancel / Discard / Save first.
 *   3. After Discard or successful Save first, proceed to openFile().
 *   4. openFile() shows the OS file picker (Chrome) or triggers a hidden
 *      input element (Firefox/Safari).
 *
 * No "are you sure" prompt when there are no unsaved changes. The user
 * explicitly clicked Open knowing it would replace the editor content.
 */
import { ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useFileSystem } from '@/composables/useFileSystem';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import logger from '@/utils/logger';

const fs = useFileSystemStore();
const { isDirty } = storeToRefs(fs);
const { canUseFsAccess, openFile, saveFile } = useFileSystem();

const showConfirm = ref<boolean>(false);

async function onOpenClick (): Promise<void> {
  if (isDirty.value) {
    showConfirm.value = true;
    return;
  }
  await safelyOpen();
}

function onCancel (): void {
  showConfirm.value = false;
}

async function onDiscard (): Promise<void> {
  showConfirm.value = false;
  await safelyOpen();
}

async function onSaveFirst (): Promise<void> {
  showConfirm.value = false;
  try {
    await saveFile();
  } catch (err) {
    logger.error('Save before open failed', err);
    // If save fails, don't proceed with open -- the user wanted to
    // protect their work and we couldn't. Re-show the modal so they
    // can pick a different option (Cancel, Discard).
    showConfirm.value = true;
    return;
  }
  await safelyOpen();
}

async function safelyOpen (): Promise<void> {
  try {
    await openFile();
  } catch (err) {
    logger.error('Open file failed', err);
  }
}
</script>
