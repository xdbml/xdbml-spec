<template>
  <button
    type="button"
    class="inline-flex items-center px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-slate-300 border border-transparent rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
    @click="$emit('click', $event)"
  >
    {{ label }}
  </button>
</template>

<script setup lang="ts">
defineProps<{ label: string }>();
defineEmits<{ click: [event: MouseEvent] }>();
</script>
