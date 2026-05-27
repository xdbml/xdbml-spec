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

      <!-- Action buttons. Examples, Share, and Help are wired up.
           Import and Export were removed (file I/O is not in scope
           for the playground; users paste content in and copy it out).
           -->
      <div class="flex items-center gap-1">
        <ExamplesMenu />
        <ShareMenu />
        <HeaderButton
          label="Help"
          @click="onOpenHelp"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
/**
 * The top header bar.
 *
 * Action buttons: Examples (dropdown), Share (dropdown), Help (opens
 * the help section in a new tab).
 *
 * No login / account UI: the playground is intentionally accountless.
 * Persistence is localStorage and URL sharing uses the same
 * compress-into-the-URL pattern dbdiagram.io uses for non-account
 * sharing.
 */
import HeaderButton from './HeaderButton.vue';
import ExamplesMenu from './ExamplesMenu.vue';
import ShareMenu from './ShareMenu.vue';

/**
 * Open the help section in a new tab.
 *
 * The URL uses the explicit `.html` suffix so the click bypasses the
 * playground's SPA routing AND VitePress's SPA shell. Without the
 * suffix, navigating from inside the playground to /playground/help/...
 * would be caught by the SPA's client-side router (which would 404
 * because the playground SPA doesn't know about /help routes). The
 * explicit .html ensures the browser does a full document load to
 * the static HTML file VitePress emits.
 *
 * `target="_blank"` + `noopener,noreferrer` keep the user's playground
 * state intact in the original tab and avoid window.opener leaking.
 */
function onOpenHelp (): void {
  window.open('/playground/help/getting-started.html', '_blank', 'noopener,noreferrer');
}
</script>
