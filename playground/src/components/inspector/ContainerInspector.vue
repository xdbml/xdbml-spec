<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500">Keyword</dt>
        <dd class="text-gray-900 font-mono">{{ container.keyword }}</dd>
        <dt class="font-medium text-gray-500">Name</dt>
        <dd class="text-gray-900 font-mono break-all">{{ container.name }}</dd>
        <dt class="font-medium text-gray-500">Members</dt>
        <dd class="text-gray-900">{{ entityCount }} entit{{ entityCount === 1 ? 'y' : 'ies' }}</dd>
      </dl>
    </InspectorSection>

    <InspectorSection title="Settings">
      <SettingsTable :settings="standardSettings" />
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
import type { ContainerDeclaration, NoteBlock, Span } from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  container: ContainerDeclaration;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

const entityCount = computed(() =>
  props.container.body.filter((b) => b.kind === 'EntityDeclaration').length,
);

// Settings table excludes the `note` setting because notes render
// below in their own Note section; showing them twice would be
// redundant. (Field- and entity-level Inspectors apply the same filter.)
const standardSettings = computed(() =>
  props.container.settings.filter((s) => s.name !== 'note'),
);

// Container-level notes can come from two sources: a `Note: '...'`
// block inside the container body (the canonical syntax) or a
// `[note: '...']` setting on the container declaration line. Prefer
// the body block when both exist; fall back to the setting otherwise.
const noteBody = computed(() => {
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
