<template>
  <!-- Wrapping div is the click-outside boundary. The button toggles the
       dropdown; the dropdown lists samples and dismisses on selection
       or outside click. -->
  <div ref="rootEl" class="relative">
    <HeaderButton
      label="Examples"
      :title="`Load one of ${SAMPLE_CATEGORIES.length} example schemas`"
      @click="toggleOpen"
    />

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
        class="absolute top-full right-0 mt-1 w-80 max-h-[28rem] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50"
        role="menu"
      >
        <div class="px-3 py-2 border-b border-gray-100">
          <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            Example schemas
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5">
            Loading replaces your current schema. Ctrl + Z in the editor restores.
          </div>
        </div>

        <button
          v-for="sample in SAMPLE_CATEGORIES"
          :key="sample.slug"
          type="button"
          class="w-full text-left px-3 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-start gap-2 border-b border-gray-50 last:border-b-0"
          role="menuitem"
          @click="onPick(sample)"
        >
          <!-- Checkmark slot. Reserved width keeps text columns aligned
               whether or not the item is current. -->
          <div class="w-4 flex-shrink-0 pt-0.5">
            <svg
              v-if="isCurrent(sample)"
              viewBox="0 0 16 16"
              class="w-4 h-4 text-blue-600"
              aria-label="Current sample"
            >
              <path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 leading-tight">
              {{ sample.name }}
            </div>
            <div class="text-[11px] text-gray-500 mt-0.5 leading-snug">
              {{ sample.description }}
            </div>
          </div>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * Examples menu in the header.
 *
 * Click the "Examples" button -> dropdown opens listing the six canonical
 * sample schemas (sourced from /examples/ at build time via Vite's
 * ?raw imports; see services/sample-content.ts).
 *
 * Click a sample -> `parserStore.setContent(sample.content)`, dropdown
 * closes. The store handles the rest (debounced reparse, diagram update,
 * localStorage persistence).
 *
 * No "are you sure?" prompt before replacing the current content. The
 * undo argument is real -- Monaco's Ctrl+Z restores -- and the user
 * explicitly clicked a menu item labeled with a different sample's name,
 * so they've opted into the destruction. The menu header text mentions
 * Ctrl+Z as a safety net.
 *
 * The currently-loaded sample (if any) gets a checkmark, computed via
 * exact content-string equality. After the user starts editing, the
 * checkmark disappears -- the content no longer matches a sample
 * verbatim.
 *
 * Dropdown dismisses on:
 *   - Selecting an item
 *   - Clicking outside the menu (document-level listener)
 *   - Pressing Escape (document-level listener)
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { useParserStore } from '@/stores/parserStore';
import { SAMPLE_CATEGORIES, type SampleCategory } from '@/services/sample-content';

import HeaderButton from './HeaderButton.vue';

const parser = useParserStore();

const isOpen = ref(false);
const rootEl = ref<HTMLDivElement | null>(null);

function toggleOpen (): void {
  isOpen.value = !isOpen.value;
}

function isCurrent (sample: SampleCategory): boolean {
  return parser.content === sample.content;
}

function onPick (sample: SampleCategory): void {
  parser.setContent(sample.content);
  isOpen.value = false;
}

/* -------------------------------------------------------------------------
 * Dismiss on outside click / Escape
 * ----------------------------------------------------------------------- */

function onDocumentClick (e: MouseEvent): void {
  if (!isOpen.value) return;
  const root = rootEl.value;
  if (!root) return;
  if (root.contains(e.target as Node)) return;
  isOpen.value = false;
}

function onDocumentKeydown (e: KeyboardEvent): void {
  if (!isOpen.value) return;
  if (e.key === 'Escape') {
    e.stopPropagation();
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>
