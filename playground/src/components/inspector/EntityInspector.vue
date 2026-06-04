<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500">Keyword</dt>
        <dd class="text-gray-900 font-mono">{{ keywordLabel }}</dd>
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
      <SettingsTable :settings="standardSettings" />
    </InspectorSection>

    <InspectorSection title="Note">
      <NoteDisplay :body="noteBody" />
    </InspectorSection>

    <!-- Views surface their source_query so users can see the SQL that
         defines the view without leaving the inspector. Tables don't
         have this section. The block is rendered through Prism for
         token-level syntax highlighting; the `.sql-block` parent
         class scopes the token styles defined in main.css. v-html is
         safe here: the SQL string comes from the parsed AST (the user
         wrote it themselves), Prism HTML-escapes non-token text, and
         the only emitted markup is `<span class="token …">…</span>`. -->
    <InspectorSection v-if="sourceQueryBody" title="Source query">
      <pre class="sql-block text-[11px] leading-relaxed font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1.5 overflow-x-auto whitespace-pre max-h-[40vh] overflow-y-auto"><code v-html="highlightedSourceQuery"></code></pre>
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
  ViewDeclaration,
} from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';
import { highlightSql }   from './sqlHighlight';

const props = defineProps<{
  entity: EntityDeclaration | ViewDeclaration;
  container: ContainerDeclaration | null;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

/**
 * Views don't have a `keyword` field in the AST (their kind alone
 * identifies them). Display "View" as the keyword label for them so
 * the Identification block reads consistently regardless of whether
 * we're showing an Entity (with its specific keyword like Table or
 * Collection) or a View.
 */
const keywordLabel = computed(() => {
  if (props.entity.kind === 'ViewDeclaration') return 'View';
  return (props.entity as EntityDeclaration).keyword;
});

// Settings table excludes the `note` setting because notes render
// below in their own Note section; showing them twice would be
// redundant. (Field-level Inspector applies the same filter.)
const standardSettings = computed(() =>
  props.entity.settings.filter((s) => s.name !== 'note'),
);

// Entity/View-level notes can come from two sources: a `Note: '...'`
// block inside the body (the canonical syntax) or a `[note: '...']`
// setting on the declaration line. Prefer the body block when both
// exist (since the body block can be triple-quoted and multi-line,
// it tends to carry the richer note); fall back to the setting
// otherwise.
const noteBody = computed(() => {
  for (const item of props.entity.body) {
    if (item.kind === 'NoteBlock') return (item as NoteBlock).body;
  }
  const noteSetting = props.entity.settings.find((s) => s.name === 'note');
  if (noteSetting && noteSetting.value && noteSetting.value.kind === 'StringValue') {
    return noteSetting.value.value;
  }
  return '';
});

/**
 * Concatenated source_query content for Views. Returns the empty
 * string for Entities and for Views without any SourceQueryItem in
 * their body. If a View happens to declare multiple source_query
 * blocks (the AST allows it), they're joined with a blank-line
 * separator so all of them remain visible.
 */
const sourceQueryBody = computed(() => {
  if (props.entity.kind !== 'ViewDeclaration') return '';
  const parts: string[] = [];
  for (const item of props.entity.body) {
    if (item.kind === 'SourceQueryItem') parts.push(item.query);
  }
  return parts.join('\n\n').trim();
});

/**
 * Pre-highlighted HTML for the source query. Re-runs whenever the view
 * (or its body) changes, which only happens when the user switches
 * selection or edits the underlying schema -- not on every render. The
 * cost of one tokenize pass per change is negligible. Result is fed
 * to `<code v-html>` to render the colored tokens.
 */
const highlightedSourceQuery = computed(() => highlightSql(sourceQueryBody.value));

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
