<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Keyword</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono">{{ container.keyword }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ container.name }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Members</dt>
        <dd class="text-gray-900 dark:text-slate-100">
          {{ entityCount }} {{ entityCount === 1 ? 'member' : 'members' }}
          <span v-if="memberBreakdown" class="text-gray-500 dark:text-slate-400">({{ memberBreakdown }})</span>
        </dd>
        <template v-if="stickyNoteNames.length > 0">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Sticky notes</dt>
          <dd class="font-mono break-all">
            <template v-for="(n, i) in stickyNoteNames" :key="n">
              <span v-if="i > 0" class="text-gray-400 dark:text-slate-500">, </span>
              <button
                type="button"
                class="text-blue-700 dark:text-blue-300 hover:underline text-left"
                @click="$emit('select', { kind: 'note', noteName: `${container.name}.${n}` })"
              >{{ n }}</button>
            </template>
          </dd>
        </template>
      </dl>
    </InspectorSection>

    <InspectorSection title="Settings">
      <SettingsTable :settings="standardSettings" :from-metadata="mergedSettings.fromMetadata" />
    </InspectorSection>

    <InspectorSection title="Note">
      <NoteDisplay :body="noteBody" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', container.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { metadataIndex, metadataNote, withMetadata } from '@xdbml/parse';
import type { AppliedSetting, ContainerDeclaration, NoteBlock, Span } from '@xdbml/parse';
import { useParserStore } from '@/stores/parserStore';
import type { Selection } from './selection';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  container: ContainerDeclaration;
}>();

defineEmits<{
  'edit-source': [span: Span];
  /** A sticky note the Container carries (spec §19.4). */
  select: [selection: Selection];
}>();

/** The sticky notes attached to the Container (spec §19.4), by name. */
const stickyNoteNames = computed(() =>
  props.container.body.flatMap((b) => (b.kind === 'NoteDeclaration' && b.name !== undefined ? [b.name] : [])));

const entityCount = computed(() =>
  props.container.body.filter(
    (b) => b.kind === 'EntityDeclaration' || b.kind === 'ViewDeclaration',
  ).length,
);

/**
 * If a container has both entity and view members, surface the split:
 * "3 members (2 tables, 1 view)". When all members are the same kind,
 * suppress the breakdown to avoid clutter.
 */
const memberBreakdown = computed(() => {
  let entities = 0;
  let views = 0;
  for (const b of props.container.body) {
    if (b.kind === 'EntityDeclaration') entities += 1;
    else if (b.kind === 'ViewDeclaration') views += 1;
  }
  if (entities > 0 && views > 0) {
    const e = `${entities} ${entities === 1 ? 'table' : 'tables'}`;
    const v = `${views} ${views === 1 ? 'view' : 'views'}`;
    return `${e}, ${v}`;
  }
  if (entities === 0 && views > 0) return `${views} ${views === 1 ? 'view' : 'views'}`;
  return '';
});

// Settings table excludes the `note` setting because notes render
// below in their own Note section; showing them twice would be
// redundant. (Field- and entity-level Inspectors apply the same filter.)
// The settings the Metadata blocks of the document set on this Container
// (spec §24.7). A block's setting replaces the Container's own and is
// marked in the table; a block's note shows in the Note section.
const parser = useParserStore();
const metadataSettings = computed<readonly AppliedSetting[]>(() =>
  (parser.flatAst ? metadataIndex(parser.flatAst).container(props.container.name) : []));
const mergedSettings = computed(() =>
  withMetadata(props.container.settings.filter((s) => s.name !== 'note'),
    metadataSettings.value.filter((a) => a.setting.name !== 'note')));
const standardSettings = computed(() => mergedSettings.value.settings);

// Container-level notes can come from two sources: a `Note: '...'`
// block inside the container body (the canonical syntax) or a
// `[note: '...']` setting on the container declaration line. Prefer
// the body block when both exist; fall back to the setting otherwise.
const noteBody = computed(() => {
  const fromBlock = metadataNote(metadataSettings.value);
  if (fromBlock !== undefined) return fromBlock;
  for (const item of props.container.body) {
    if (item.kind === 'NoteBlock') return (item as NoteBlock).body;
  }
  const noteSetting = props.container.settings.find((s) => s.name === 'note');
  if (noteSetting && noteSetting.value && noteSetting.value.kind === 'StringValue') {
    return noteSetting.value.value;
  }
  return '';
});
</script>
