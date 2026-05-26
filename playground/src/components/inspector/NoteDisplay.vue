<template>
  <p
    v-if="body"
    class="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap break-words"
  >{{ body }}</p>
  <p v-else class="text-xs text-gray-400 italic">
    No note
  </p>
</template>

<script setup lang="ts">
/**
 * Read-only note display. Preserves line breaks and whitespace for
 * triple-quoted multi-line notes; breaks long words/URLs gracefully
 * via break-words rather than overflowing the panel.
 */
defineProps<{
  body: string;
}>();
</script>
