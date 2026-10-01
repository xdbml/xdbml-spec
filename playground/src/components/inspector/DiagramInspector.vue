<template>
  <div>
    <!-- Main ERD: the whole model and its Project (spec §5). -->
    <template v-if="!view">
      <InspectorSection title="Identification">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Diagram</dt>
          <dd class="text-gray-900 dark:text-slate-100">Main ERD, the whole model</dd>
          <dt class="font-medium text-gray-500 dark:text-slate-400">Project</dt>
          <dd v-if="project" class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ project.name }}</dd>
          <dd v-else class="text-gray-400 dark:text-slate-500 italic">None declared</dd>
          <template v-if="targets.length > 0">
            <dt class="font-medium text-gray-500 dark:text-slate-400">Targets</dt>
            <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ targets.join(', ') }}</dd>
          </template>
        </dl>
      </InspectorSection>
      <InspectorSection title="Contents">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in modelCounts" :key="row.label">
            <dt class="font-medium text-gray-500 dark:text-slate-400">{{ row.label }}</dt>
            <dd class="text-gray-900 dark:text-slate-100 tabular-nums">{{ row.count }}</dd>
          </template>
        </dl>
      </InspectorSection>
      <InspectorSection v-if="diagramViewNames.length > 0" title="Diagram views">
        <p class="text-xs text-gray-700 dark:text-slate-300 font-mono break-all">{{ diagramViewNames.join(', ') }}</p>
      </InspectorSection>
      <InspectorSection title="Note">
        <NoteDisplay :body="projectNote" />
      </InspectorSection>
      <div v-if="project" class="px-3 pb-3">
        <EditInSourceButton @click="$emit('edit-source', project.span)" />
      </div>
    </template>

    <!-- A diagram view (spec §18). -->
    <template v-else>
      <InspectorSection title="Members">
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-for="row in memberCounts" :key="row.label">
            <dt class="font-medium text-gray-500 dark:text-slate-400">{{ row.label }}</dt>
            <dd class="text-gray-900 dark:text-slate-100 tabular-nums">{{ row.count }}</dd>
          </template>
          <template v-if="members && members.containers.length > 0">
            <dt class="font-medium text-gray-500 dark:text-slate-400">Frames</dt>
            <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ members.containers.join(', ') }}</dd>
          </template>
        </dl>
      </InspectorSection>
      <InspectorSection title="Categories">
        <p v-if="view.wildcardBody" class="text-xs text-gray-700 dark:text-slate-300">
          <span class="font-mono">*</span>: every element of every category
        </p>
        <p v-else-if="view.categories.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic">
          None: an empty diagram view
        </p>
        <dl v-else class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <template v-for="(c, i) in view.categories" :key="i">
            <dt class="font-medium text-gray-500 dark:text-slate-400 font-mono">{{ c.keyword }}</dt>
            <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">
              {{ [...(c.wildcard ? ['*'] : []), ...c.items.map((item) => item.name)].join(', ') || '(empty)' }}
            </dd>
          </template>
        </dl>
      </InspectorSection>
      <InspectorSection v-if="customSettings.length > 0" title="Settings">
        <SettingsTable :settings="customSettings" />
      </InspectorSection>
      <InspectorSection title="Note">
        <NoteDisplay :body="viewNote" />
      </InspectorSection>
      <div class="px-3 pb-3">
        <EditInSourceButton @click="$emit('edit-source', view.span)" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The diagram on display, shown when the empty canvas is clicked.
 *
 * On Main ERD: the Project (name, targets, note) and counts of the whole
 * model. On a diagram view (spec §18): its members, its categories as
 * written, its custom properties and its note (§18.1). Read-only, like the
 * other panes; "Edit in source" jumps to the declaration.
 */
import { computed } from 'vue';
import type {
  DiagramViewDeclaration,
  ProjectDeclaration,
  Setting,
  Span,
  XDbmlDocument,
} from '@xdbml/parse';
import { diagramViewMembers, diagramViewNote } from '@xdbml/parse';
import { collectRefDeclarations } from '@xdbml/render';

import InspectorSection   from './InspectorSection.vue';
import NoteDisplay        from './NoteDisplay.vue';
import SettingsTable      from './SettingsTable.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  doc: XDbmlDocument;
  /** The diagram view on display, or null for Main ERD. */
  diagramView: string | null;
}>();

defineEmits<{ 'edit-source': [span: Span] }>();

const project = computed<ProjectDeclaration | undefined>(() =>
  props.doc.statements.find((s): s is ProjectDeclaration => s.kind === 'ProjectDeclaration'));

const projectNote = computed(() => {
  for (const item of project.value?.body ?? []) {
    if (item.kind === 'NoteBlock') return item.body;
  }
  return '';
});

const targets = computed<string[]>(() => {
  const setting = project.value?.body.find((b): b is Setting => b.kind === 'Setting' && b.name === 'targets');
  const v = setting?.value;
  if (!v) return [];
  if (v.kind === 'ListValue') {
    return v.items.map((item) => ('value' in item ? String(item.value) : '')).filter(Boolean);
  }
  return 'value' in v ? [String(v.value)] : [];
});

const diagramViewNames = computed<string[]>(() => {
  const names: string[] = [];
  for (const s of props.doc.statements) {
    if (s.kind === 'DiagramViewDeclaration' && !names.includes(s.name)) names.push(s.name);
  }
  return names;
});

const modelCounts = computed(() => {
  let entities = 0;
  let views = 0;
  let edges = 0;
  let containers = 0;
  for (const s of props.doc.statements) {
    if (s.kind === 'EntityDeclaration') entities++;
    else if (s.kind === 'ViewDeclaration') views++;
    else if (s.kind === 'EdgeDeclaration') edges++;
    else if (s.kind === 'ContainerDeclaration') {
      containers++;
      for (const b of s.body) {
        if (b.kind === 'EntityDeclaration') entities++;
        else if (b.kind === 'ViewDeclaration') views++;
        else if (b.kind === 'EdgeDeclaration') edges++;
      }
    }
  }
  const rows = [
    { label: 'Entities', count: entities },
    { label: 'Database views', count: views },
    { label: 'Containers', count: containers },
    { label: 'Relationships', count: collectRefDeclarations(props.doc).length },
    { label: 'Edges', count: edges },
  ];
  return rows.filter((r, i) => i === 0 || r.count > 0);
});

const view = computed<DiagramViewDeclaration | undefined>(() =>
  props.diagramView === null
    ? undefined
    : props.doc.statements.find(
      (s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration' && s.name === props.diagramView,
    ));

const members = computed(() => (props.diagramView ? diagramViewMembers(props.doc, props.diagramView) : undefined));

const memberCounts = computed(() => {
  const m = members.value;
  if (!m) return [];
  return [
    { label: 'Entities', count: m.entities.length },
    { label: 'Database views', count: m.views.length },
    { label: 'Sticky notes', count: m.notes.length },
  ].filter((r, i) => i === 0 || r.count > 0);
});

const customSettings = computed<Setting[]>(() => (view.value?.settings ?? []).filter((s) => s.name !== 'note'));

const viewNote = computed(() => (view.value ? diagramViewNote(view.value) ?? '' : ''));
</script>
