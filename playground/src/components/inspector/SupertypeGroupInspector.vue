<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ group.declaration.name }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Supertype</dt>
        <dd class="font-mono break-all">
          <button
            v-if="group.supertype"
            type="button"
            class="text-blue-700 dark:text-blue-300 hover:underline text-left"
            @click="selectEntity(group.supertype)"
          >{{ group.supertype }}</button>
          <span v-else class="text-gray-400 dark:text-slate-500">{{ group.settings.supertype ?? '(none)' }} · unresolved</span>
        </dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Completeness</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ completenessLabel }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Exclusivity</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ exclusivityLabel }}</dd>
      </dl>
      <p class="mt-2 text-xs italic text-gray-500 dark:text-slate-400">{{ reading }}</p>
    </InspectorSection>

    <InspectorSection :title="`Subtypes (${group.subtypes.length})`">
      <p v-if="group.subtypes.length === 0" class="text-xs text-gray-400 dark:text-slate-500">No subtype listed yet.</p>
      <ul v-else class="text-xs space-y-1">
        <li v-for="s in group.subtypes" :key="s.member.name" class="flex items-baseline gap-2">
          <button
            v-if="s.entity"
            type="button"
            class="font-mono text-blue-700 dark:text-blue-300 hover:underline text-left break-all"
            @click="selectEntity(s.entity)"
          >{{ s.entity }}</button>
          <span v-else class="font-mono text-gray-400 dark:text-slate-500 break-all">{{ s.member.name }} · unresolved</span>
          <span class="text-gray-500 dark:text-slate-400">{{ subtypeStrategyLabel(s.strategy) }}</span>
        </li>
      </ul>
    </InspectorSection>

    <InspectorSection title="Materialization">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Strategy</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ strategyLabel(group.settings.strategy) }}</dd>
        <template v-if="group.settings.merge">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Merge</dt>
          <dd class="text-gray-900 dark:text-slate-100">{{ group.settings.merge === 'flat' ? 'Flat, with a discriminator' : 'Nested' }}</dd>
        </template>
        <template v-if="group.settings.discriminator">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Discriminator</dt>
          <dd class="text-gray-900 dark:text-slate-100 font-mono">{{ group.settings.discriminator }}</dd>
        </template>
      </dl>
      <p class="mt-2 text-[11px] text-gray-400 dark:text-slate-500">
        Intent for a physical derivation (spec §12.7). Nothing in the model changes because of it.
      </p>
    </InspectorSection>

    <InspectorSection title="Settings">
      <SettingsTable :settings="standardSettings" />
    </InspectorSection>

    <InspectorSection title="Note">
      <NoteDisplay :body="group.settings.note ?? ''" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', group.declaration.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Inspector pane for a supertype group (spec §12): the supertype and the
 * subtypes as links, completeness and exclusivity read back as a sentence,
 * and the materialization intent. Links emit `select`, which the Inspector
 * forwards to App.vue so the diagram selection follows.
 */
import { computed } from 'vue';
import type { MaterializationStrategy, ResolvedSupertypeGroup, Span } from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';
import type { Selection } from './selection';

const props = defineProps<{
  group: ResolvedSupertypeGroup;
}>();

const emit = defineEmits<{
  'edit-source': [span: Span];
  select: [selection: Selection];
}>();

function selectEntity (entityId: string): void {
  emit('select', { kind: 'entity', entityId });
}

const completenessLabel = computed(() => {
  switch (props.group.settings.completeness) {
    case 'total':   return 'Total';
    case 'partial': return 'Partial';
    default:        return 'Unstated';
  }
});

const exclusivityLabel = computed(() => {
  switch (props.group.settings.exclusivity) {
    case 'disjoint':    return 'Disjoint';
    case 'overlapping': return 'Overlapping';
    default:            return 'Unstated';
  }
});

/** Completeness and exclusivity read back as one sentence (spec §12.3). */
const reading = computed(() => {
  const sup = props.group.supertype ?? props.group.settings.supertype ?? 'supertype';
  const names = props.group.subtypes.map((s) => s.entity ?? s.member.name);
  if (names.length === 0) return `No subtype of ${sup} is listed yet.`;
  const list = names.join(', ');
  const c = props.group.settings.completeness;
  const e = props.group.settings.exclusivity;
  if (c === 'total' && e === 'disjoint')       return `Every ${sup} is exactly one of: ${list}.`;
  if (c === 'total' && e === 'overlapping')    return `Every ${sup} is at least one of: ${list}, possibly several.`;
  if (c === 'partial' && e === 'disjoint')     return `A ${sup} is at most one of: ${list}, or none of them.`;
  if (c === 'partial' && e === 'overlapping')  return `A ${sup} may be any of: ${list}, several, or none of them.`;
  if (c === 'total')       return `Every ${sup} is at least one of: ${list}. Whether it may be several is unstated.`;
  if (c === 'partial')     return `A ${sup} may be none of: ${list}. Whether it may be several is unstated.`;
  if (e === 'disjoint')    return `A ${sup} is at most one of: ${list}. Whether every ${sup} is one of them is unstated.`;
  if (e === 'overlapping') return `A ${sup} may be several of: ${list}. Whether every ${sup} is one of them is unstated.`;
  return `Subtypes of ${sup}: ${list}. Completeness and exclusivity are unstated.`;
});

function strategyLabel (s: MaterializationStrategy | undefined): string {
  switch (s) {
    case 'preserved_hierarchy': return 'Preserved hierarchy';
    case 'roll_up':             return 'Roll-up';
    case 'roll_down':           return 'Roll-down';
    default:                    return 'Unstated (the derivation tool applies its default)';
  }
}

function subtypeStrategyLabel (s: MaterializationStrategy | undefined): string {
  return s ? `${strategyLabel(s)} (own)` : 'follows the group';
}

// The recognized settings are shown above; the table keeps the rest
// (custom `x_` properties and anything unrecognized).
const RECOGNIZED = new Set(['supertype', 'completeness', 'exclusivity', 'strategy', 'merge', 'discriminator', 'note']);
const standardSettings = computed(() =>
  props.group.declaration.settings.filter((s) => !RECOGNIZED.has(s.name)),
);
</script>
