<template>
  <section class="border-b border-gray-100 dark:border-slate-800 last:border-b-0">
    <div class="px-3 py-2 bg-gray-50 dark:bg-slate-800 text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-slate-400">
      {{ title }}
    </div>
    <div class="px-3 py-2">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Visual section grouping in the inspector. Pale title bar above,
 * content below. Keeps each inspector page rhythmically structured.
 */
defineProps<{
  title: string;
}>();
</script>
