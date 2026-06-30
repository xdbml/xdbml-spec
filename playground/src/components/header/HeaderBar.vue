<template>
  <header class="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 h-14 flex-shrink-0">
    <div class="h-full px-5 flex justify-between items-center">
      <!-- Brand: official xDBML wordmark (Apache-2.0) from the spec
           repo. The wordmark already includes the mark glyph and the
           "xDBML" lettering. We add "Playground" beside it as the
           section label so we don't redundantly repeat "xDBML". The
           filename slot (with optional dirty dot) sits to the right
           of the brand, separated by a thin divider. -->
      <div class="flex items-center gap-3">
        <a
          href="https://xdbml.org"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center"
          title="xDBML home"
        >
          <img
            src="/xdbml-logo.svg"
            alt="xDBML"
            class="h-7 w-auto"
          />
        </a>
        <span class="h-5 w-px bg-gray-300 dark:bg-slate-600" />
        <span class="text-sm font-medium text-gray-700 dark:text-slate-200">Playground</span>
        <span class="px-2 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full uppercase tracking-wide">
          Preview
        </span>

        <!-- Current filename slot. Shows the open filename in a small
             monospace font, with an amber dot to the right when there
             are unsaved changes. Italic "(untitled)" placeholder when
             no file is open. -->
        <span class="h-5 w-px bg-gray-300 dark:bg-slate-600" />
        <span
          class="text-xs font-mono text-gray-500 dark:text-slate-400 truncate max-w-[16rem]"
          :title="filenameTooltip"
        >
          <span v-if="filename">{{ filename }}</span>
          <span v-else class="italic">(untitled)</span>
          <span
            v-if="isDirty"
            class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle"
            aria-label="Unsaved changes"
            title="Unsaved changes"
          />
        </span>
      </div>

      <!-- Action buttons. Open and Save come first (file actions);
           Examples, Share, Help follow. -->
      <div class="flex items-center gap-1">
        <OpenFileButton />
        <SaveFileButton />
        <span class="h-5 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
        <ExamplesMenu />
        <ShareMenu />
        <HeaderButton
          label="Help"
          @click="onOpenHelp"
        />
        <span class="h-5 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
        <AppearanceToggle />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * The top header bar.
 *
 * Brand cluster (left): xDBML logo, Playground label, Preview badge,
 * then the current-filename slot with the dirty-indicator dot.
 *
 * Action buttons (right): Open, Save (with Save As dropdown), then
 * a divider, then Examples, Share, Help.
 *
 * Open/Save use the File System Access API on Chromium-based browsers
 * for direct file overwriting; Firefox and Safari fall back to a
 * hidden <input type="file"> for open and a download trigger for save.
 *
 * No login / account UI: the playground is intentionally accountless.
 * Persistence is via localStorage (auto, for editor content) plus the
 * new file-system integration (explicit, for durable file storage).
 */
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import HeaderButton from './HeaderButton.vue';
import ExamplesMenu from './ExamplesMenu.vue';
import ShareMenu from './ShareMenu.vue';
import OpenFileButton from './OpenFileButton.vue';
import SaveFileButton from './SaveFileButton.vue';
import AppearanceToggle from './AppearanceToggle.vue';

import { useFileSystem } from '@/composables/useFileSystem';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import logger from '@/utils/logger';

const fs = useFileSystemStore();
const { filename, isDirty } = storeToRefs(fs);
const { openFile, saveFile, saveFileAs } = useFileSystem();

const filenameTooltip = computed<string>(() => {
  const base = filename.value ?? 'No file open (changes saved to your browser only)';
  return isDirty.value ? `${base} -- unsaved changes` : base;
});

/**
 * Open the help section in a new tab.
 *
 * The URL uses the explicit `.html` suffix so the click bypasses the
 * playground's SPA routing AND VitePress's SPA shell.
 */
function onOpenHelp (): void {
  window.open('/playground/help/getting-started.html', '_blank', 'noopener,noreferrer');
}

/* -------------------------------------------------------------------------
 * Keyboard shortcuts
 *
 * Ctrl/Cmd + S       -> Save
 * Ctrl/Cmd + Shift+S -> Save As
 * Ctrl/Cmd + O       -> Open
 *
 * We listen at document level so the shortcuts work whether or not
 * the Monaco editor has focus. We preventDefault to suppress the
 * browser's default Save Page / Open File handling.
 * ----------------------------------------------------------------------- */

async function onKeyDown (e: KeyboardEvent): Promise<void> {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();

  if (key === 's' && e.shiftKey) {
    e.preventDefault();
    try {
      await saveFileAs();
    } catch (err) {
      logger.error('Save As (shortcut) failed', err);
    }
    return;
  }
  if (key === 's') {
    e.preventDefault();
    try {
      await saveFile();
    } catch (err) {
      logger.error('Save (shortcut) failed', err);
    }
    return;
  }
  if (key === 'o') {
    e.preventDefault();
    try {
      if (isDirty.value) {
        // Inline confirmation for the shortcut path; the full modal
        // is for click flow.
        const ok = confirm('You have unsaved changes. Open a new file anyway?');
        if (!ok) return;
      }
      await openFile();
    } catch (err) {
      logger.error('Open (shortcut) failed', err);
    }
  }
}

/* -------------------------------------------------------------------------
 * beforeunload warning
 *
 * Browsers show their native "are you sure you want to leave" prompt
 * when returnValue is set. Modern browsers ignore custom messages.
 * ----------------------------------------------------------------------- */

function onBeforeUnload (e: BeforeUnloadEvent): void {
  if (!isDirty.value) return;
  e.preventDefault();
  e.returnValue = '';
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('beforeunload', onBeforeUnload);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('beforeunload', onBeforeUnload);
});
</script>
