<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Operator</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono">{{ refDecl.spec.operator }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Source</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ renderEndpoint(refDecl.spec.source) }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Target</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ renderEndpoint(refDecl.spec.target) }}</dd>
        <dt v-if="refDecl.name" class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd v-if="refDecl.name" class="text-gray-900 dark:text-slate-100 font-mono">{{ refDecl.name }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Type</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ typeLabel }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Direction</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ directionLabel }}</dd>
        <template v-if="constraint">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Constraint</dt>
          <dd class="text-gray-900 dark:text-slate-100">{{ constraint }}</dd>
        </template>
      </dl>
    </InspectorSection>

    <InspectorSection v-if="hasReading" title="Reading">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <template v-for="row in readingRows" :key="row.label">
          <dt class="font-medium text-gray-500 dark:text-slate-400">{{ row.label }}</dt>
          <dd class="text-gray-900 dark:text-slate-100">{{ row.value }}</dd>
        </template>
      </dl>
      <p
        v-for="line in sentences"
        :key="line"
        class="mt-2 text-xs italic text-gray-500 dark:text-slate-400"
      >{{ line }}</p>
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
import { computed } from 'vue';
import type { RefDeclaration, RefEndpoint, Setting, Span } from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  refDecl: RefDeclaration;
  index: number;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

/* --------------------------------------------------- relationship facts */
//
// The relationship type (spec 11.10), direction (11.16.2), constraint type
// (11.15) and the roles and verbs (11.14) all live in the settings block.
// They are read out here rather than left to the raw settings table below,
// because the point of roles and verbs is to be read as a sentence.

function settingText (settings: readonly Setting[], name: string): string {
  const s = settings.find((x) => x.name === name);
  if (!s || !s.value) return '';
  const v = s.value as { value?: unknown };
  return v.value === undefined ? '' : String(v.value);
}

const isForeignMaster = computed(
  () => props.refDecl.settings.some((s) => s.name === 'foreign_master'),
);

const typeLabel = computed(
  () => (isForeignMaster.value ? 'Foreign master (denormalized replication)' : 'Foreign key (referential)'),
);

const constraint = computed(() => {
  const raw = settingText(props.refDecl.settings, 'constraint_type');
  if (raw === 'identifying')     return 'Identifying';
  if (raw === 'non_identifying') return 'Non-identifying';
  return '';
});

const directionLabel = computed(() => {
  if (settingText(props.refDecl.settings, 'undirected') === 'true') return 'Both ways';
  switch (props.refDecl.spec.operator) {
    case '>':  return 'Source to target';
    case '<':  return 'Target to source';
    case '<>': return 'Many to many';
    default:   return 'Not stated';
  }
});

const readingRows = computed(() => {
  const s = props.refDecl.settings;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, name: string) => {
    const v = settingText(s, name);
    if (v) rows.push({ label, value: v });
  };
  add('Source role', 'source_role');
  add('Source verb', 'source_verb');
  add('Source cardinality', 'source');
  add('Target role', 'target_role');
  add('Target verb', 'target_verb');
  add('Target cardinality', 'target');
  return rows;
});

const hasReading = computed(() => readingRows.value.length > 0);

/**
 * The relationship read back as sentences, one per direction, when enough of
 * it is stated to make them. This is what roles and verbs are for: reading
 * the relationship aloud is how a modeler checks the intent.
 *
 * Each sentence pairs the verb with the end it reads FROM (spec 11.14):
 * `source_verb` reads from the source toward the target, so the source is
 * its subject and the target's cardinality qualifies its object. Pairing a
 * verb with the opposite end produces a sentence that is grammatical and
 * wrong, which is worse than no sentence at all.
 */
const sentences = computed(() => {
  const s = props.refDecl.settings;
  const src = renderEndpoint(props.refDecl.spec.source).split('.')[0];
  const tgt = renderEndpoint(props.refDecl.spec.target).split('.')[0];

  const read = (
    subject: string,
    roleKey: string,
    verbKey: string,
    objectCardKey: string,
    object: string,
  ): string => {
    const verb = settingText(s, verbKey);
    if (!verb) return '';
    const role = settingText(s, roleKey);
    const card = settingText(s, objectCardKey);
    const head = role ? `${subject}, as ${role},` : subject;
    return `${head} ${verb} ${card ? `${card} ` : ''}${object}.`;
  };

  return [
    read(src, 'source_role', 'source_verb', 'target', tgt),
    read(tgt, 'target_role', 'target_verb', 'source', src),
  ].filter(Boolean);
});

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
