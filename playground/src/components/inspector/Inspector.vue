<template>
  <aside class="h-full bg-white border-l border-gray-200 flex flex-col">
    <!-- Header: kind badge + title + close. Always present so the
         empty state has visual symmetry with the populated state. -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-gray-200">
      <div class="flex items-center gap-2 min-w-0">
        <template v-if="resolved">
          <span
            class="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded"
            :class="kindBadgeClass"
          >{{ kindLabel }}</span>
          <span class="text-sm font-medium text-gray-900 truncate" :title="titleLabel">
            {{ titleLabel }}
          </span>
        </template>
        <span v-else class="text-xs text-gray-400">
          Inspector
        </span>
      </div>
      <button
        type="button"
        class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
        @click="$emit('close')"
        title="Close inspector"
      >
        <svg viewBox="0 0 16 16" class="w-3.5 h-3.5">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none"/>
        </svg>
      </button>
    </div>

    <!-- Body -->
    <div v-if="resolved" class="flex-1 overflow-y-auto">
      <ContainerInspector
        v-if="resolved.kind === 'container'"
        :container="resolved.node"
        @edit-source="onEditSource"
      />
      <EntityInspector
        v-else-if="resolved.kind === 'entity'"
        :entity="resolved.node"
        :container="resolved.container"
        @edit-source="onEditSource"
      />
      <FieldInspector
        v-else-if="resolved.kind === 'field'"
        :field="resolved.node"
        :ancestors="resolved.ancestors"
        :entity="resolved.entity"
        :container="resolved.container"
        @edit-source="onEditSource"
      />
      <RefInspector
        v-else-if="resolved.kind === 'ref'"
        :ref-decl="resolved.node"
        :index="resolved.index"
        @edit-source="onEditSource"
      />
    </div>
    <div v-else class="flex-1 flex items-center justify-center text-gray-400 text-xs px-4 text-center">
      Click anything in the diagram to inspect it
    </div>
  </aside>
</template>

<script setup lang="ts">
/**
 * Inspector panel: read-only display of the currently selected
 * construct's metadata.
 *
 * Resolves the current `selection` to its AST node(s) and dispatches
 * to the appropriate kind-specific sub-component (container, entity,
 * field, ref). Sub-components are pure display -- they read AST
 * properties and emit a single `edit-source` event when the user
 * clicks the "Edit in source" button. That event bubbles up to App.vue,
 * which converts the span to a line/column and calls the editor's
 * exposed `revealPosition` method.
 *
 * The inspector itself never modifies source. Editing is what the
 * Monaco editor on the left is for; this panel is a window into the
 * AST that helps users find what they're looking at.
 *
 * Visual states:
 *   - Selection points at a resolvable construct -> render its details
 *   - Selection is null OR stale (refers to something the schema no
 *     longer contains) -> show the empty state
 *
 * The empty state can happen when:
 *   - The user has never clicked anything
 *   - The user explicitly closed the inspector then it was re-opened
 *     with a stale selection from localStorage
 *   - The user edited the schema such that the selected construct's
 *     identifier no longer matches anything in the AST (e.g. renamed
 *     a field, deleted an entity)
 */
import { computed } from 'vue';
import type { Span } from '@xdbml/parse';

import { useParserStore } from '@/stores/parserStore';
import { resolveSelection, type ResolvedSelection } from './ast-lookup';
import type { Selection } from './selection';

import ContainerInspector from './ContainerInspector.vue';
import EntityInspector    from './EntityInspector.vue';
import FieldInspector     from './FieldInspector.vue';
import RefInspector       from './RefInspector.vue';

const props = defineProps<{
  selection: Selection;
}>();

const emit = defineEmits<{
  close: [];
  'edit-source': [span: Span];
}>();

const parser = useParserStore();

const resolved = computed<ResolvedSelection>(() =>
  resolveSelection(parser.flatAst, props.selection),
);

const kindLabel = computed(() => {
  if (!resolved.value) return '';
  switch (resolved.value.kind) {
    case 'container': return resolved.value.node.keyword;
    case 'entity':    return resolved.value.node.kind === 'ViewDeclaration'
      ? 'View'
      : resolved.value.node.kind === 'EdgeDeclaration'
        ? 'Edge'
        : resolved.value.node.keyword;
    case 'field':     return 'Field';
    case 'ref':       return 'Ref';
  }
});

const kindBadgeClass = computed(() => {
  if (!resolved.value) return 'bg-gray-100 text-gray-700';
  switch (resolved.value.kind) {
    case 'container': return 'bg-purple-100 text-purple-800';
    case 'entity':    return resolved.value.node.kind === 'ViewDeclaration'
      ? 'bg-indigo-100 text-indigo-800'
      : resolved.value.node.kind === 'EdgeDeclaration'
        ? 'bg-violet-100 text-violet-800'
        : 'bg-blue-100 text-blue-800';
    case 'field':     return 'bg-green-100 text-green-800';
    case 'ref':       return 'bg-amber-100 text-amber-800';
  }
});

const titleLabel = computed(() => {
  if (!resolved.value) return '';
  switch (resolved.value.kind) {
    case 'container': return resolved.value.node.name;
    case 'entity':    return resolved.value.node.name;
    case 'field':     return resolved.value.node.name;
    case 'ref':       return `Ref #${resolved.value.index + 1}`;
  }
});

function onEditSource (span: Span): void {
  emit('edit-source', span);
}
</script>
