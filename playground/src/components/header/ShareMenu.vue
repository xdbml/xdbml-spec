<template>
  <div ref="rootEl" class="relative">
    <HeaderButton
      label="Share"
      title="Copy a shareable URL"
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
        class="absolute top-full right-0 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3"
        role="menu"
      >
        <div class="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Share this schema
        </div>
        <div class="text-[11px] text-gray-400 mb-2 leading-snug">
          The entire schema is encoded into the URL. Anyone who opens this
          link sees your current schema. No server, no account.
        </div>

        <!-- URL field. Read-only; users select+copy or click the Copy
             button. Wraps the URL in a horizontally scrolling code
             element so long URLs don't blow up the layout. -->
        <div class="flex items-stretch gap-1.5">
          <input
            ref="urlInputEl"
            :value="shareUrl"
            readonly
            class="flex-1 min-w-0 px-2 py-1.5 text-[11px] font-mono text-gray-700 bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-blue-400 focus:bg-white"
            @focus="onUrlFocus"
            @click="onUrlFocus"
          />
          <button
            type="button"
            class="flex-shrink-0 px-2.5 py-1.5 text-xs font-medium rounded transition-colors"
            :class="copyState === 'idle'
              ? 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              : 'text-white bg-green-600'"
            @click="onCopy"
          >
            {{ copyState === 'idle' ? 'Copy' : 'Copied!' }}
          </button>
        </div>

        <div class="mt-2 flex items-center justify-between text-[10px] text-gray-400">
          <span>{{ urlSizeLabel }}</span>
          <span v-if="urlIsLong" class="text-amber-600">
            ⚠ Long URLs may be truncated by some chat apps
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * Share menu in the header.
 *
 * Click "Share" -> dropdown opens showing the encoded URL for the
 * current schema, with a Copy button. Click Copy -> URL goes to
 * clipboard, button briefly turns green to confirm. Clicking outside
 * or pressing Escape closes the dropdown.
 *
 * URL encoding lives in services/share.ts: lz-string compression +
 * URL-safe base64 in the hash fragment. The parser store reads the
 * hash on init and falls back to localStorage if none.
 *
 * No "share via..." integration (email/twitter/etc.) -- the URL is
 * universal, users paste it wherever they want.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useParserStore } from '@/stores/parserStore';
import { buildShareUrl, formatUrlSize } from '@/services/share';

import HeaderButton from './HeaderButton.vue';

const parser = useParserStore();

const isOpen = ref(false);
const rootEl = ref<HTMLDivElement | null>(null);
const urlInputEl = ref<HTMLInputElement | null>(null);
const copyState = ref<'idle' | 'copied'>('idle');

// Rebuild the URL only when actually needed: when the dropdown opens,
// and reactively any time content changes while open. We don't want
// to be running lz-string compression on every keystroke when the
// dropdown isn't even visible.
const shareUrl = computed(() => {
  if (!isOpen.value) return '';
  return buildShareUrl(parser.content);
});

const urlSizeLabel = computed(() => formatUrlSize(shareUrl.value));
const urlIsLong = computed(() => shareUrl.value.length > 4000);

function toggleOpen (): void {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    copyState.value = 'idle';
    // After Vue renders the input, select its contents so a quick
    // Ctrl+C also works without needing the Copy button.
    setTimeout(() => urlInputEl.value?.select(), 0);
  }
}

function onUrlFocus (): void {
  // Convenience: tapping the URL field auto-selects all of it so the
  // user can copy with the keyboard.
  urlInputEl.value?.select();
}

async function onCopy (): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copyState.value = 'copied';
    // Revert to "Copy" after 2 seconds so the user can copy again later.
    setTimeout(() => {
      copyState.value = 'idle';
    }, 2000);
  } catch {
    // Clipboard API can fail (no permission, insecure context, etc.).
    // Fallback: select the input and let the user Ctrl+C manually.
    urlInputEl.value?.select();
  }
}

// Reset the "Copied!" indicator if the user reopens the dropdown after
// the schema changed -- they probably want to copy the new URL.
watch(() => parser.content, () => {
  copyState.value = 'idle';
});

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
