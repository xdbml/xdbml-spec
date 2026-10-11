<template>
  <MarkdownView
    v-if="body"
    :text="body"
    class="text-xs text-gray-700 dark:text-slate-200 leading-relaxed"
  />
  <p v-else class="text-xs text-gray-400 dark:text-slate-500 italic">
    No note
  </p>
</template>

<script setup lang="ts">
/**
 * Read-only note display. The text of a note may use Markdown (spec
 * §19.1), which renders here as it does in a sticky note on the canvas;
 * text without Markdown reads as paragraphs, a blank line between two.
 */
import MarkdownView from './MarkdownView';

defineProps<{
  body: string;
}>();
</script>
