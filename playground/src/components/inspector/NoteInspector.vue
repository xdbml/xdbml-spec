<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ note.name }}</dd>
        <template v-if="note.containerName">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Container</dt>
          <dd class="font-mono break-all">
            <button
              v-if="note.container"
              type="button"
              class="text-blue-700 dark:text-blue-300 hover:underline text-left"
              title="The Container carries the note on the canvas (spec §19.4)"
              @click="$emit('select', { kind: 'container', containerName: note.container.name })"
            >{{ note.containerName }}</button>
            <span v-else class="text-gray-900 dark:text-slate-100" title="Implied by the qualified name (spec §19.2)">{{ note.containerName }}</span>
          </dd>
        </template>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Color</dt>
        <dd class="flex items-center gap-1.5 text-gray-900 dark:text-slate-100">
          <span
            v-if="color.swatch"
            class="inline-block w-3 h-3 rounded-sm border border-black/15"
            :style="{ backgroundColor: color.swatch }"
          />
          <span>{{ color.label }}</span>
          <span
            v-if="color.fromMetadata"
            class="inline-block px-1 py-px text-[9px] font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded"
            title="Set by a Metadata block (spec §24.7)"
          >Metadata</span>
        </dd>
      </dl>
    </InspectorSection>

    <InspectorSection v-if="customSettings.length > 0" title="Custom properties">
      <SettingsTable :settings="customSettings" :from-metadata="merged.fromMetadata" />
    </InspectorSection>

    <InspectorSection title="Text">
      <NoteDisplay :body="note.decl.body" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', note.decl.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A sticky note (spec §19): its name, the Container that carries it, its
 * color, its custom properties, and its text rendered as Markdown. The
 * Metadata blocks of the document apply over the note's own brackets
 * (§24.7.4), and a setting a block sets carries a badge.
 */
import { computed } from 'vue';
import { isStickyNoteColor, metadataIndex, withMetadata } from '@xdbml/parse';
import type { AppliedSetting, PlacedStickyNote, Span } from '@xdbml/parse';
import { defaultTheme } from '@xdbml/render';
import { useParserStore } from '@/stores/parserStore';
import type { Selection } from './selection';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  note: PlacedStickyNote;
}>();

defineEmits<{
  'edit-source': [span: Span];
  select: [selection: Selection];
}>();

const parser = useParserStore();

const applied = computed<readonly AppliedSetting[]>(() =>
  (parser.flatAst ? metadataIndex(parser.flatAst).note(props.note.id) : []));

const merged = computed(() => withMetadata(props.note.decl.settings, applied.value));

const customSettings = computed(() => merged.value.settings.filter((s) => s.name !== 'color'));

const color = computed(() => {
  const s = merged.value.settings.find((x) => x.name === 'color');
  const fromMetadata = !!s && merged.value.fromMetadata.has(s);
  const v = s?.value ?? null;
  if (!s || !isStickyNoteColor(v)) {
    return { label: s ? 'Default (the value is no color)' : 'Default', swatch: defaultTheme.note.fill, fromMetadata };
  }
  const text = v && 'value' in v ? String(v.value) : '';
  if (text.toLowerCase() === 'none') return { label: 'none: the text alone, no box', swatch: '', fromMetadata };
  return { label: text, swatch: text, fromMetadata };
});
</script>
