<template>
  <button
    type="button"
    class="inline-flex items-center justify-center w-8 h-8 text-gray-600 dark:text-slate-300 border border-transparent rounded transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
    :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggle"
  >
    <!-- Sun shown in dark mode (click goes light); moon shown in light
         mode (click goes dark). -->
    <svg v-if="isDark" viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
    <svg v-else viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
/**
 * Light/dark toggle for the header. Binary switch (no explicit "auto"):
 * the OS preference is only the initial fallback, resolved once by the
 * bootstrap in index.html. Once the user toggles, useAppearance persists
 * the choice, so a later visit -- including opening the playground
 * directly, not through xdbml.org -- restores it.
 */
import { useAppearance } from '@/composables/useAppearance';

const { isDark, toggle } = useAppearance();
</script>
