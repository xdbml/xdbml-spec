<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ field.name }}</dd>
        <dt v-if="ancestors.length > 0" class="font-medium text-gray-500 dark:text-slate-400">Path</dt>
        <dd v-if="ancestors.length > 0" class="text-gray-900 dark:text-slate-100 font-mono break-all">
          {{ ancestorPath }}.<span class="font-semibold">{{ field.name }}</span>
        </dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Entity</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ entity.name }}</dd>
        <dt v-if="container" class="font-medium text-gray-500 dark:text-slate-400">Container</dt>
        <dd v-if="container" class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ container.name }}</dd>
      </dl>
    </InspectorSection>

    <InspectorSection title="Type">
      <div class="text-xs font-mono text-gray-900 dark:text-slate-100 break-all">
        {{ shortTypeLabel }}
      </div>
      <div v-if="isStructuralType" class="mt-2">
        <button
          type="button"
          class="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
          @click="showFullType = !showFullType"
        >
          {{ showFullType ? '▾ Hide' : '▸ Show' }} structural details
        </button>
        <pre
          v-if="showFullType"
          class="mt-2 text-[11px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded p-2 overflow-x-auto leading-relaxed"
        >{{ fullTypeBreakdown }}</pre>
      </div>
    </InspectorSection>

    <InspectorSection v-if="flagBadges.length > 0" title="Flags">
      <div class="flex flex-wrap gap-1.5">
        <span
          v-for="b in flagBadges"
          :key="b.label"
          :class="b.class"
          class="px-1.5 py-0.5 text-[10px] font-semibold rounded"
        >{{ b.label }}</span>
      </div>
    </InspectorSection>

    <InspectorSection v-if="standardSettings.length > 0" title="Settings">
      <SettingsTable :settings="standardSettings" />
    </InspectorSection>

    <InspectorSection v-if="customSettings.length > 0" title="Custom properties (x_*)">
      <SettingsTable :settings="customSettings" />
    </InspectorSection>

    <InspectorSection title="Note">
      <NoteDisplay :body="noteBody" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', field.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  ContainerDeclaration,
  EdgeDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  Span,
  TypeExpression,
  UnionType,
  ViewDeclaration,
} from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  field: FieldDeclaration;
  ancestors: readonly FieldDeclaration[];
  entity: EntityDeclaration | ViewDeclaration | EdgeDeclaration;
  container: ContainerDeclaration | null;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

const showFullType = ref(false);

const ancestorPath = computed(() => props.ancestors.map((a) => a.name).join('.'));

const shortTypeLabel = computed(() => renderShortType(props.field.type));

const isStructuralType = computed(() => {
  const t = props.field.type;
  return t.kind === 'ObjectType' || t.kind === 'ArrayType'  ||
         t.kind === 'OneOfType'  || t.kind === 'AnyOfType'  ||
         t.kind === 'AllOfType'  || t.kind === 'JsonType'   ||
         t.kind === 'MapType'    || t.kind === 'SetType'    ||
         t.kind === 'TupleType';
  // UnionType is deliberately absent: its members are always simple
  // (scalar / named type / null), so the short label above lists them in
  // full and a structural-details toggle would add nothing.
});

const fullTypeBreakdown = computed(() => renderTypeBreakdown(props.field.type, 0));

const flagBadges = computed(() => {
  const badges: { label: string; class: string }[] = [];
  for (const s of props.field.settings) {
    switch (s.name) {
      case 'pk':
      case 'primary key':
        badges.push({ label: 'PRIMARY KEY',    class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' });
        break;
      case 'unique':
        badges.push({ label: 'UNIQUE',         class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' });
        break;
      case 'not null':
        badges.push({ label: 'REQUIRED',       class: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' });
        break;
      case 'increment':
        badges.push({ label: 'AUTO-INCREMENT', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' });
        break;
    }
  }
  return badges;
});

// Split settings into "standard" and "AI-readiness / custom" buckets.
// Flag-only settings (rendered as badges above) are excluded from both
// tables to avoid redundancy. The `note` setting is also excluded
// from `standardSettings` because it renders below in its own Note
// section (via `noteBody` -> NoteDisplay); duplicating it in the
// Settings table would surface the same content twice.
const FLAG_SETTING_NAMES = new Set(['pk', 'primary key', 'unique', 'not null', 'increment', 'null']);

const standardSettings = computed(() =>
  props.field.settings.filter(
    (s) => s.name !== 'note'
      && !FLAG_SETTING_NAMES.has(s.name)
      && !s.name.startsWith('x_'),
  ),
);

const customSettings = computed(() =>
  props.field.settings.filter((s) => s.name.startsWith('x_')),
);

// Field-level note can be a Note: '...' setting OR a separate NoteBlock
// (the grammar accepts both). Surface the first non-empty source.
const noteBody = computed(() => {
  const noteSetting = props.field.settings.find((s) => s.name === 'note');
  if (noteSetting && noteSetting.value && noteSetting.value.kind === 'StringValue') {
    return noteSetting.value.value;
  }
  return '';
});

/* -------------------------------------------------------------------------
 * Type rendering helpers (display only)
 * ----------------------------------------------------------------------- */

/**
 * Union members are a narrower set than TypeExpression (ScalarType |
 * NamedTypeReference | NullTypeLiteral); NullTypeLiteral exists only inside
 * unions, so it is handled here rather than in renderShortType.
 */
function renderUnionMember (m: UnionType['members'][number]): string {
  if (m.kind === 'NullTypeLiteral') return 'null';
  return renderShortType(m);
}

function renderShortType (t: TypeExpression): string {
  switch (t.kind) {
    case 'ScalarType':
      return t.params && t.params.length > 0
        ? `${t.name}(${t.params.join(', ')})`
        : t.name;
    case 'NamedTypeReference':
      return t.name;
    case 'ObjectType':
      return `${t.keyword} {…}`;
    case 'ArrayType': {
      const inner = t.elementType ? renderShortType(t.elementType) : '?';
      return `${t.keyword} of ${inner}`;
    }
    case 'TupleType':
      return `tuple (${t.elements.length})`;
    case 'MapType':
      return `${t.keyword} [${renderShortType(t.keyType)} → ${renderShortType(t.valueType)}]`;
    case 'SetType':
      return `set [${renderShortType(t.elementType)}]`;
    case 'UnionType':
      return `union [${t.members.map(renderUnionMember).join(', ')}]`;
    case 'OneOfType': return `oneOf (${t.alternatives.length})`;
    case 'AnyOfType': return `anyOf (${t.alternatives.length})`;
    case 'AllOfType': return `allOf (${t.alternatives.length})`;
    case 'JsonType':  return t.fields ? `${t.keyword} {…}` : t.keyword;
  }
}

function renderTypeBreakdown (t: TypeExpression, indent: number): string {
  const pad = '  '.repeat(indent);
  switch (t.kind) {
    case 'ObjectType': {
      const lines = [`${pad}${t.keyword} {`];
      for (const f of t.fields) {
        if (f.kind === 'FieldDeclaration') {
          lines.push(`${pad}  ${f.name}: ${renderTypeBreakdown(f.type, indent + 2).trimStart()}`);
        }
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }
    case 'ArrayType': {
      if (!t.elementType) return `${pad}${t.keyword} [?]`;
      const inner = renderTypeBreakdown(t.elementType, indent + 1).trimStart();
      const label = t.elementName ? `${t.elementName}: ${inner}` : inner;
      return `${pad}${t.keyword} [\n${pad}  ${label}\n${pad}]`;
    }
    case 'OneOfType':
    case 'AnyOfType':
    case 'AllOfType': {
      const kw = t.kind === 'OneOfType' ? 'oneOf'
              : t.kind === 'AnyOfType'  ? 'anyOf'
              :                            'allOf';
      const lines = [`${pad}${kw} {`];
      for (const alt of t.alternatives) {
        const inner = renderTypeBreakdown(alt.type, indent + 1).trimStart();
        lines.push(`${pad}  ${alt.name}: ${inner}`);
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }
    case 'JsonType': {
      if (!t.fields) return `${pad}${t.keyword}`;
      const lines = [`${pad}${t.keyword} {`];
      for (const f of t.fields) {
        if (f.kind === 'FieldDeclaration') {
          lines.push(`${pad}  ${f.name}: ${renderTypeBreakdown(f.type, indent + 2).trimStart()}`);
        }
      }
      lines.push(`${pad}}`);
      return lines.join('\n');
    }
    default:
      return `${pad}${renderShortType(t)}`;
  }
}
</script>
