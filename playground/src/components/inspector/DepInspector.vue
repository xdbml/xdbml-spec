<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <template v-if="lineage.name !== undefined">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
          <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ lineage.name }}</dd>
        </template>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Form</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ formLabel }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Color</dt>
        <dd class="flex items-center gap-1.5 text-gray-900 dark:text-slate-100">
          <span
            class="inline-block w-3 h-3 rounded-sm border border-black/15"
            :style="{ backgroundColor: color ?? defaultColor }"
          />
          <span>{{ color ?? 'Default' }}</span>
        </dd>
      </dl>
    </InspectorSection>

    <InspectorSection :title="lineage.dependencies.length === 1 ? 'Dependency' : `Dependencies (${lineage.dependencies.length})`">
      <p v-if="lineage.dependencies.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic">
        No dependency: the block declares nothing (spec §27.2).
      </p>
      <ul v-else class="space-y-2">
        <li v-for="(g, k) in groups" :key="k" class="text-xs text-gray-700 dark:text-slate-200 leading-relaxed">
          <p class="break-words">
            <template v-for="(part, n) in g.sentence" :key="n">
              <code
                v-if="part.code"
                class="font-mono text-[0.92em] px-1 rounded bg-black/5 dark:bg-white/10 text-gray-900 dark:text-slate-100"
              >{{ part.text }}</code>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <div
            v-for="d in g.withSettings"
            :key="d.index"
            class="mt-1 pl-3 border-l-2 border-amber-200 dark:border-amber-800"
          >
            <p v-if="g.size > 1" class="text-[11px] text-gray-500 dark:text-slate-400">
              From <code class="font-mono">{{ d.upstream }}</code>
            </p>
            <NoteDisplay v-if="noteOf(d.settings)" :body="noteOf(d.settings)" />
            <SettingsTable v-if="d.settings.some((s) => s.name !== 'note')" :settings="d.settings.filter((s) => s.name !== 'note')" />
          </div>
        </li>
      </ul>
    </InspectorSection>

    <InspectorSection v-if="lineage.inline === undefined" title="Transformation">
      <NoteDisplay :body="noteOf(lineage.settings)" />
    </InspectorSection>

    <InspectorSection v-if="customSettings.length > 0" title="Custom properties">
      <SettingsTable :settings="customSettings" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', lineage.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A Dep (spec §27): its name and form, its dependencies read back as
 * sentences that name the elements (dep-narrative.ts), each with the
 * settings written after it in a block, the transformation its note
 * describes, rendered as Markdown, and its custom properties. An inline
 * `dep` is one dependency with no name and no settings, carried by an
 * entity, a View or a field.
 */
import { computed } from 'vue';
import { depColor, resolveLineage } from '@xdbml/parse';
import type { Lineage, Setting, Span } from '@xdbml/parse';
import { darkTheme, defaultTheme } from '@xdbml/render';
import { useAppearance } from '@/composables/useAppearance';
import { useParserStore } from '@/stores/parserStore';
import { depNarrative } from './dep-narrative';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  lineage: Lineage;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

const { isDark } = useAppearance();
const parser = useParserStore();

/** One sentence per downstream element, with the names as written. */
const groups = computed(() => {
  const resolved = parser.flatAst ? resolveLineage(parser.flatAst).get(props.lineage.id) : undefined;
  return depNarrative(props.lineage, resolved ?? []);
});

const formLabel = computed(() => {
  const l = props.lineage;
  if (l.inline) {
    const kind = l.inline.carrierKind === 'field' ? 'field' : l.inline.carrierKind === 'view' ? 'View' : 'entity';
    return `Inline, on ${kind} ${l.inline.carrier}`;
  }
  return l.decl?.form === 'block' ? 'Block' : 'Short';
});

const color = computed(() => depColor(props.lineage.settings));
const defaultColor = computed(() => (isDark.value ? darkTheme.lineage.line : defaultTheme.lineage.line));

function noteOf (settings: readonly Setting[]): string {
  const s = settings.find((x) => x.name === 'note');
  return s?.value?.kind === 'StringValue' ? s.value.value : '';
}

const customSettings = computed(() => props.lineage.settings.filter((s) => s.name !== 'note' && s.name !== 'color'));
</script>
