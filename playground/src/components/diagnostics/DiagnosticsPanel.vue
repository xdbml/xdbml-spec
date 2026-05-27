<template>
  <!-- Always-visible header bar. The body collapses out when there's
       nothing to show OR the user manually collapsed it. -->
  <section class="bg-white border-t border-gray-200 flex-shrink-0 flex flex-col">
    <!-- Header bar: status + toggle -->
    <button
      type="button"
      class="h-8 px-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors flex-shrink-0"
      :class="{ 'cursor-pointer': errorCount > 0, 'cursor-default': errorCount === 0 }"
      :disabled="errorCount === 0"
      @click="toggle"
    >
      <div class="flex items-center gap-2">
        <!-- Caret only shown when there's something to expand into. -->
        <svg
          v-if="errorCount > 0"
          viewBox="0 0 12 12"
          class="w-3 h-3 text-gray-500 transition-transform"
          :class="{ 'rotate-90': bodyVisible }"
        >
          <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
        <span class="text-[11px] uppercase font-semibold tracking-wide text-gray-600">
          Diagnostics
        </span>
        <!-- Count badges (errors / warnings separately). -->
        <template v-if="errorCount > 0">
          <span class="flex items-center gap-1 text-xs text-red-700">
            <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-100">
              <svg viewBox="0 0 8 8" class="w-2 h-2">
                <path d="M2 2l4 4M6 2l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </span>
            {{ errorCount }} {{ errorCount === 1 ? 'error' : 'errors' }}
          </span>
        </template>
        <template v-if="warningCount > 0">
          <span class="flex items-center gap-1 text-xs text-amber-700">
            <span class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-100">
              <svg viewBox="0 0 8 8" class="w-2 h-2">
                <path d="M4 1v3.5M4 6v0.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </span>
            {{ warningCount }} {{ warningCount === 1 ? 'warning' : 'warnings' }}
          </span>
        </template>
        <span v-if="errorCount === 0 && warningCount === 0" class="text-xs text-gray-400">
          No issues
        </span>
      </div>
      <span v-if="errorCount > 0" class="text-[10px] text-gray-400">
        {{ bodyVisible ? 'Click to collapse' : 'Click to expand' }}
      </span>
    </button>

    <!-- Body: list of diagnostics. Scrollable internally so a wall of
         errors doesn't push the diagram off-screen. -->
    <div
      v-if="bodyVisible && errorCount > 0"
      class="border-t border-gray-100 overflow-y-auto"
      :style="{ maxHeight: BODY_MAX_HEIGHT_PX + 'px' }"
    >
      <ul class="divide-y divide-gray-50">
        <li
          v-for="(err, i) in sortedErrors"
          :key="i"
          class="flex items-start gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
          @click="onErrorClick(err)"
        >
          <!-- Severity icon. All diagnostics today are errors; warnings
               will arrive with the semantic-analysis pass and the panel
               is shaped to handle them already. -->
          <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-700 flex-shrink-0 mt-0.5">
            <svg viewBox="0 0 8 8" class="w-2.5 h-2.5">
              <path d="M2 2l4 4M6 2l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </span>

          <div class="flex-1 min-w-0">
            <div class="text-xs text-gray-900 leading-snug break-words">
              {{ err.message }}
            </div>
            <div class="text-[10px] text-gray-500 mt-0.5 font-mono">
              Line {{ err.location.line }}, column {{ err.location.column }}
            </div>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Diagnostics panel: a bottom strip that lists all parse / lex errors
 * (and, in future, semantic warnings) with click-to-jump-to-source.
 *
 * Behavior:
 *   - Header bar is always visible -- shows the count and serves as
 *     a stable indicator of state. Even "No issues" is informative.
 *   - Body expands when there are diagnostics. When zero, the header
 *     stays but the body has nothing to show (caret hidden, click
 *     disabled).
 *   - User can collapse manually; that choice persists. The default
 *     is "expanded when there are diagnostics" so first-time users
 *     don't miss obvious errors.
 *   - Clicking a diagnostic emits `goto` with line/column. App.vue
 *     forwards to the editor's exposed revealPosition method.
 *
 * The parser today emits only errors (severity is implicit). The
 * shape is ready for explicit severity once the semantic-analysis
 * pass lands -- it'll attach `severity: 'warning'` and the panel
 * will pick it up via the count split and badge color.
 */
import { computed } from 'vue';

import { useParserStore } from '@/stores/parserStore';
import type { ParserError } from '@/types';

const props = defineProps<{
  /** External signal for whether the body is shown. Two-way via update event. */
  bodyVisible: boolean;
}>();

const emit = defineEmits<{
  goto: [position: { line: number; column: number }];
  'update:bodyVisible': [v: boolean];
}>();

const parser = useParserStore();

const BODY_MAX_HEIGHT_PX = 200;

const sortedErrors = computed<readonly ParserError[]>(() => {
  // Sort by line then column. The parser usually emits them in source
  // order already, but defensively sort here in case future error
  // sources add to the list out of order.
  return [...parser.errors].sort((a, b) => {
    if (a.location.line !== b.location.line) return a.location.line - b.location.line;
    return a.location.column - b.location.column;
  });
});

const errorCount = computed(() => sortedErrors.value.length);

// Warnings are split out for future semantic-analysis output. Today all
// diagnostics arrive as errors. The shape is here so the UI doesn't
// have to change when warnings land.
const warningCount = computed(() => 0);

function toggle (): void {
  if (errorCount.value === 0) return;
  emit('update:bodyVisible', !props.bodyVisible);
}

function onErrorClick (err: ParserError): void {
  emit('goto', { line: err.location.line, column: err.location.column });
}
</script>
