<template>
  <header class="bg-white border-b border-gray-200 h-14 flex-shrink-0">
    <div class="h-full px-5 flex justify-between items-center">
      <!-- Brand: official xDBML wordmark (Apache-2.0) from the spec
           repo. The wordmark already includes the mark glyph and the
           "xDBML" lettering. We add "Playground" beside it as the
           section label so we don't redundantly repeat "xDBML". -->
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
        <span class="h-5 w-px bg-gray-300" />
        <span class="text-sm font-medium text-gray-700">Playground</span>
        <span class="px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 rounded-full uppercase tracking-wide">
          Preview
        </span>
      </div>

      <!-- Action buttons. Examples is wired up; the others are still
           placeholders that show a 'coming soon' toast. Kept here so
           the visual footprint is stable as the other buttons get
           implemented in turn. -->
      <div class="flex items-center gap-1">
        <ExamplesMenu />
        <HeaderButton
          label="Import"
          @click="onPlaceholder('Import')"
        />
        <HeaderButton
          label="Export"
          @click="onPlaceholder('Export')"
        />
        <HeaderButton
          label="Share"
          @click="onPlaceholder('Share')"
        />
        <HeaderButton
          label="Help"
          @click="onPlaceholder('Help')"
        />
      </div>
    </div>

    <!-- Toast for placeholder actions -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="toast"
        class="fixed top-16 right-5 z-50 bg-gray-900 text-white text-sm px-3 py-2 rounded shadow-lg"
      >
        {{ toast }} — coming soon
      </div>
    </Transition>
  </header>
</template>

<script setup lang="ts">
/**
 * The top header bar.
 *
 * The Examples menu is wired up via the ExamplesMenu component (sibling
 * file). The remaining buttons (Import, Export, Share, Help) are still
 * placeholders that show a 'coming soon' toast on click. Visual
 * footprint is stable so the placeholders can be wired up to real
 * handlers later without re-jiggling layout.
 *
 * No login / account UI -- the playground is intentionally accountless;
 * persistence is localStorage and URL sharing (to come) is the same
 * compress-into-the-URL pattern dbdiagram.io uses for non-account
 * sharing.
 */
import { ref } from 'vue';

import HeaderButton from './HeaderButton.vue';
import ExamplesMenu from './ExamplesMenu.vue';

const toast = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function onPlaceholder (action: string): void {
  toast.value = action;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = null; }, 1800);
}
</script>
