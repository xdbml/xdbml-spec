<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500">Keyword</dt>
        <dd class="text-gray-900 font-mono">{{ entity.keyword }}</dd>
        <dt class="font-medium text-gray-500">Name</dt>
        <dd class="text-gray-900 font-mono break-all">{{ entity.name }}</dd>
        <dt v-if="container" class="font-medium text-gray-500">Container</dt>
        <dd v-if="container" class="text-gray-900 font-mono break-all">{{ container.name }}</dd>
        <dt class="font-medium text-gray-500">Fields</dt>
        <dd class="text-gray-900">
          {{ fieldStats.total }} total
          <span v-if="fieldStats.pk"      class="text-yellow-700">· {{ fieldStats.pk }} PK</span>
          <span v-if="fieldStats.notNull" class="text-red-700">· {{ fieldStats.notNull }} required</span>
          <span v-if="fieldStats.nested"  class="text-blue-700">· {{ fieldStats.nested }} nested</span>
        </dd>
      </dl>
    </InspectorSection>

    <InspectorSection title="Settings">
      <SettingsTable :settings="entity.settings" />
    </InspectorSection>

    <InspectorSection title="Note">
      <NoteDisplay :body="noteBody" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', entity.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  ContainerDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  NoteBlock,
  Span,
} from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  entity: EntityDeclaration;
  container: ContainerDeclaration | null;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

const noteBody = computed(() => {
  for (const item of props.entity.body) {
    if (item.kind === 'NoteBlock') return (item as NoteBlock).body;
  }
  return '';
});

const fieldStats = computed(() => {
  let total = 0, pk = 0, notNull = 0, nested = 0;
  for (const item of props.entity.body) {
    if (item.kind !== 'FieldDeclaration') continue;
    total += 1;
    const f = item as FieldDeclaration;
    for (const s of f.settings) {
      if (s.name === 'pk' || s.name === 'primary key') pk += 1;
      if (s.name === 'not null') notNull += 1;
    }
    if (
      f.type.kind === 'ObjectType'  || f.type.kind === 'ArrayType' ||
      f.type.kind === 'OneOfType'   || f.type.kind === 'AnyOfType' ||
      f.type.kind === 'AllOfType'   || f.type.kind === 'JsonType'  ||
      f.type.kind === 'MapType'     || f.type.kind === 'SetType'   ||
      f.type.kind === 'TupleType'
    ) {
      nested += 1;
    }
  }
  return { total, pk, notNull, nested };
});
</script>
