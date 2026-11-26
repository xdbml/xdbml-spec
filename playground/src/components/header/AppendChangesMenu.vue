<template>
  <div ref="rootEl" class="relative">
    <HeaderButton
      label="Append changes"
      title="Add change blocks at the end of the document"
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
        class="absolute top-full right-0 mt-1 w-[28rem] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 p-3"
        role="dialog"
        aria-label="Append changes"
      >
        <div class="text-[11px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          Append changes
        </div>
        <div class="text-[11px] text-gray-400 dark:text-slate-500 mb-2 leading-snug">
          Paste change blocks, or choose a file that holds them. They are added
          at the end of the editor, and the diagram shows the model after them.
          Ctrl+Z in the editor takes them back.
        </div>

        <textarea
          ref="textEl"
          v-model="changes"
          rows="9"
          spellcheck="false"
          placeholder="Changes &quot;Full name&quot; {&#10;  alter Table customers rename Field name to full_name&#10;}"
          class="w-full px-2 py-1.5 text-[11px] font-mono text-gray-700 dark:text-slate-200 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded resize-y focus:outline-none focus:border-blue-400"
        />

        <div
          v-if="notice"
          class="mt-1.5 text-[11px] text-gray-500 dark:text-slate-400 leading-snug"
        >
          {{ notice }}
        </div>
        <div
          v-if="refusal"
          class="mt-1.5 text-[11px] text-red-600 dark:text-red-400 leading-snug"
          role="alert"
        >
          {{ refusal }}
        </div>

        <div class="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            class="px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-colors"
            @click="onChooseFile"
          >
            Choose a file...
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="changes.trim() === ''"
            @click="onAppend"
          >
            Append
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
/**
 * Append changes, in the header.
 *
 * A change set, such as one an AI assistant proposes in a chat, is pasted
 * into the dropdown or read from a file, then appended at the end of the
 * open document (spec §29.12). `planAppendChanges` checks that the text
 * holds change blocks only and computes the edits; the editor applies them
 * as one step of its undo history, so Ctrl+Z takes the changes back.
 *
 * The file is read into the text box rather than appended at once, so the
 * person sees what is about to be added.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useParserStore } from '@/stores/parserStore';

import HeaderButton from './HeaderButton.vue';
import { planAppendChanges, versionNotice, type AppendChangesPlan } from './append-changes';

const emit = defineEmits<{ append: [plan: AppendChangesPlan] }>();

const parser = useParserStore();

const isOpen = ref(false);
const rootEl = ref<HTMLDivElement | null>(null);
const textEl = ref<HTMLTextAreaElement | null>(null);
const changes = ref('');
const refusal = ref('');

const notice = computed(() => (isOpen.value ? versionNotice(parser.content) : undefined));

watch(changes, () => {
  refusal.value = '';
});

function toggleOpen (): void {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    refusal.value = '';
    nextTick(() => textEl.value?.focus());
  }
}

function onAppend (): void {
  const plan = planAppendChanges({ source: parser.content, changes: changes.value });
  if (!plan.ok) {
    refusal.value = plan.message;
    return;
  }
  emit('append', plan);
  changes.value = '';
  isOpen.value = false;
}

function onChooseFile (): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xdbml,.dbml,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    changes.value = await file.text();
    nextTick(() => textEl.value?.focus());
  });
  input.click();
}

/* -------------------------------------------------------------------------
 * Dismiss on outside click / Escape
 * ----------------------------------------------------------------------- */

function onDocumentClick (e: MouseEvent): void {
  if (!isOpen.value) return;
  const root = rootEl.value;
  if (!root || root.contains(e.target as Node)) return;
  isOpen.value = false;
}

function onDocumentKeydown (e: KeyboardEvent): void {
  if (!isOpen.value || e.key !== 'Escape') return;
  e.stopPropagation();
  isOpen.value = false;
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
