<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500">Operator</dt>
        <dd class="text-gray-900 font-mono">{{ refDecl.spec.operator }}</dd>
        <dt class="font-medium text-gray-500">Source</dt>
        <dd class="text-gray-900 font-mono break-all">{{ renderEndpoint(refDecl.spec.source) }}</dd>
        <dt class="font-medium text-gray-500">Target</dt>
        <dd class="text-gray-900 font-mono break-all">{{ renderEndpoint(refDecl.spec.target) }}</dd>
        <dt v-if="refDecl.name" class="font-medium text-gray-500">Name</dt>
        <dd v-if="refDecl.name" class="text-gray-900 font-mono">{{ refDecl.name }}</dd>
      </dl>
    </InspectorSection>

    <InspectorSection title="Settings">
      <SettingsTable :settings="refDecl.settings" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', refDecl.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RefDeclaration, RefEndpoint, Span } from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import EditInSourceButton from './EditInSourceButton.vue';

defineProps<{
  refDecl: RefDeclaration;
  index: number;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

function renderEndpoint (ep: RefEndpoint): string {
  const segs = ep.path.map((p) => {
    if (p.kind === 'PathField')         return p.name;
    if (p.kind === 'PathArrayWildcard') return '[*]';
    return '?';
  });
  let result = segs.join('.');
  if (ep.compositeFields && ep.compositeFields.length > 0) {
    result += `.(${ep.compositeFields.join(', ')})`;
  }
  return result;
}
</script>
