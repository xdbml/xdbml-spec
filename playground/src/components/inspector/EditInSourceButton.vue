<template>
  <button
    type="button"
    class="mt-3 w-full px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded transition-colors flex items-center justify-center gap-1.5"
    @click="$emit('click')"
    title="Reveal this construct in the editor"
  >
    <svg viewBox="0 0 16 16" class="w-3 h-3">
      <path d="M2 12L8 6l4 4-6 6H2v-4z M11 3l2 2-1 1-2-2z" fill="currentColor"/>
    </svg>
    Edit in source
  </button>
</template>

<script setup lang="ts">
/**
 * "Reveal in editor" button. The read-only inspector displays metadata;
 * actual editing happens in Monaco. This button jumps the editor cursor
 * to the AST node's source position, scrolls it into view, and focuses
 * the editor.
 */
defineEmits<{
  click: [];
}>();
</script>
