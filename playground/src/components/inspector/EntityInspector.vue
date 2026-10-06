<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt class="font-medium text-gray-500 dark:text-slate-400">Keyword</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono">{{ keywordLabel }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
        <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ entity.name }}</dd>
        <dt v-if="container" class="font-medium text-gray-500 dark:text-slate-400">Container</dt>
        <dd v-if="container" class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ container.name }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Fields</dt>
        <dd class="text-gray-900 dark:text-slate-100">
          {{ fieldStats.total }} total
          <span v-if="fieldStats.pk"      class="text-yellow-700">· {{ fieldStats.pk }} PK</span>
          <span v-if="fieldStats.notNull" class="text-red-700 dark:text-red-300">· {{ fieldStats.notNull }} required</span>
          <span v-if="fieldStats.nested"  class="text-blue-700 dark:text-blue-300">· {{ fieldStats.nested }} nested</span>
        </dd>
      </dl>
    </InspectorSection>

    <!-- Supertype groups (spec §12): the groups this entity anchors, each
         with its subtypes, and the group it belongs to with its supertype. -->
    <InspectorSection v-if="groups.asSupertype.length > 0 || groups.asSubtype.length > 0" title="Supertype groups">
      <div v-for="g in groups.asSubtype" :key="`sub:${g.declaration.name}`" class="text-xs mb-2">
        <span class="text-gray-500 dark:text-slate-400">Subtype in </span>
        <button type="button" class="font-mono text-blue-700 dark:text-blue-300 hover:underline" @click="selectGroup(g.declaration.name)">{{ g.declaration.name }}</button>
        <span class="text-gray-500 dark:text-slate-400">, supertype </span>
        <button v-if="g.supertype" type="button" class="font-mono text-blue-700 dark:text-blue-300 hover:underline" @click="selectEntity(g.supertype)">{{ g.supertype }}</button>
        <span v-else class="font-mono text-gray-400 dark:text-slate-500">unresolved</span>
      </div>
      <div v-for="g in groups.asSupertype" :key="`sup:${g.declaration.name}`" class="text-xs mb-2">
        <span class="text-gray-500 dark:text-slate-400">Supertype of </span>
        <button type="button" class="font-mono text-blue-700 dark:text-blue-300 hover:underline" @click="selectGroup(g.declaration.name)">{{ g.declaration.name }}</button>
        <span class="text-gray-500 dark:text-slate-400">: </span>
        <template v-for="(s, i) in g.subtypes" :key="s.member.name">
          <span v-if="i > 0" class="text-gray-400 dark:text-slate-500">, </span>
          <button v-if="s.entity" type="button" class="font-mono text-blue-700 dark:text-blue-300 hover:underline" @click="selectEntity(s.entity)">{{ s.entity }}</button>
          <span v-else class="font-mono text-gray-400 dark:text-slate-500">{{ s.member.name }}</span>
        </template>
        <span v-if="g.subtypes.length === 0" class="text-gray-400 dark:text-slate-500">no subtype yet</span>
      </div>
    </InspectorSection>

    <!-- Keys and checks (spec §10), gathered from every form that declares
         them: the constraints block, inline [pk] / [unique], a DBML pk
         index entry, checks { }, and field-level check:. -->
    <InspectorSection v-if="constraints.length > 0" title="Constraints">
      <div v-for="(c, i) in constraints" :key="i" class="text-xs mb-1.5">
        <template v-if="c.kind === 'key'">
          <span :class="c.keyKind === 'primary' ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-700 dark:text-slate-300'" class="font-medium">
            {{ c.keyKind === 'primary' ? 'Primary key' : 'Unique' }}
          </span>
          <span class="font-mono text-gray-900 dark:text-slate-100 ml-1.5">({{ c.fields.join(', ') }})</span>
        </template>
        <template v-else>
          <span class="font-medium text-gray-700 dark:text-slate-300">Check</span>
          <span class="font-mono text-gray-900 dark:text-slate-100 break-all ml-1.5">{{ c.expression }}</span>
          <span v-if="c.field" class="text-gray-500 dark:text-slate-400"> on {{ c.field }}</span>
        </template>
        <span v-if="c.name" class="font-mono text-gray-500 dark:text-slate-400"> · {{ c.name }}</span>
        <span v-if="sourceLabel(c.source)" class="text-gray-400 dark:text-slate-500"> · {{ sourceLabel(c.source) }}</span>
      </div>
    </InspectorSection>

    <!-- Internal definitions (spec §15.8): the named types this entity
         declares for itself in its definitions block, visible only inside
         it. Fields typed by one expand in the diagram. -->
    <InspectorSection v-if="definitions.length > 0" title="Internal definitions">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <template v-for="d in definitions" :key="d.name">
          <dt class="font-mono text-gray-900 dark:text-slate-100 break-all">{{ d.name }}</dt>
          <dd class="text-gray-500 dark:text-slate-400">{{ d.shape }}</dd>
        </template>
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
      <pre class="sql-block text-[11px] leading-relaxed font-mono text-gray-800 dark:text-slate-100 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-2 py-1.5 overflow-x-auto whitespace-pre max-h-[40vh] overflow-y-auto"><code v-html="highlightedSourceQuery"></code></pre>
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
  EdgeDeclaration,
  EntityDeclaration,
  NoteBlock,
  Span,
  ViewDeclaration,
} from '@xdbml/parse';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';
import { highlightSql }   from './sqlHighlight';
import { supertypeGroupsOf } from './ast-lookup';
import type { Selection } from './selection';
import { useParserStore } from '@/stores/parserStore';
import { effectiveFieldList, effectiveFields, entityConstraints, entityDefinitions, tablePartials, viewSourceQuery } from '@xdbml/parse';
import type { Constraint, ConstraintSource } from '@xdbml/parse';

const props = defineProps<{
  entity: EntityDeclaration | ViewDeclaration | EdgeDeclaration;
  container: ContainerDeclaration | null;
}>();

const emit = defineEmits<{
  'edit-source': [span: Span];
  select: [selection: Selection];
}>();

const parser = useParserStore();

// Entity id as the diagram and the parser use it: container-qualified
// inside a Container, bare otherwise.
const entityId = computed(() => (props.container ? `${props.container.name}.${props.entity.name}` : props.entity.name));

const groups = computed(() => supertypeGroupsOf(parser.flatAst, entityId.value));

// The entries of the entity's definitions block (spec §15.8), each with a
// short description of its shape: the field count of the object form, or
// the base type of the scalar form.
const definitions = computed(() => {
  if (props.entity.kind !== 'EntityDeclaration') return [];
  return [...entityDefinitions(props.entity.body).values()].map((d) => {
    const doc = parser.flatAst;
    const fields = effectiveFieldList(d.body, doc ? tablePartials(doc) : new Map()).length;
    let shape: string;
    if (!d.scalarBase) shape = `object, ${fields} ${fields === 1 ? 'field' : 'fields'}`;
    else if (d.scalarBase.kind === 'ScalarType') shape = d.scalarBase.params?.length ? `${d.scalarBase.name}(${d.scalarBase.params.join(', ')})` : d.scalarBase.name;
    else shape = d.scalarBase.kind.replace(/Type$/, '').replace(/^./, (c) => c.toLowerCase());
    return { name: d.name, shape };
  });
});

// Every key and check of the entity (spec §28.6). Views declare none.
const constraints = computed<Constraint[]>(() => {
  const doc = parser.flatAst;
  if (!doc || props.entity.kind === 'ViewDeclaration') return [];
  return entityConstraints(props.entity, doc);
});

// The declaration form, shown only where it is not the constraints block.
function sourceLabel (source: ConstraintSource): string {
  switch (source) {
    case 'inline': return 'inline';
    case 'indexes': return 'indexes (DBML form)';
    case 'checks': return 'checks block';
    case 'field-check': return '';
    default: return '';
  }
}

function selectEntity (id: string): void {
  emit('select', { kind: 'entity', entityId: id });
}

function selectGroup (groupName: string): void {
  emit('select', { kind: 'supertypeGroup', groupName });
}

/**
 * Views and Edges don't have a `keyword` field in the AST (their kind
 * alone identifies them). Display "View" / "Edge" as the keyword label
 * for them so the Identification block reads consistently regardless of
 * whether we're showing an Entity (with its specific keyword like Table
 * or Collection), a View, or an Edge.
 */
const keywordLabel = computed(() => {
  if (props.entity.kind === 'ViewDeclaration') return 'View';
  if (props.entity.kind === 'EdgeDeclaration') return 'Edge';
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
 * The source query of a View (spec §14.3, §28.7): the first
 * `source_query:` element of its body, as `viewSourceQuery()` returns it.
 * Empty for Entities, Edges and Views without one. A second source query
 * and a `source_query` written in the brackets draw warnings in the
 * diagnostics panel (spec §14.7); neither shows here.
 */
const sourceQueryBody = computed(() => {
  if (props.entity.kind !== 'ViewDeclaration') return '';
  return (viewSourceQuery(props.entity)?.query ?? '').trim();
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
  let total = 0, notNull = 0, nested = 0;
  // Primary key fields from whichever form declares the key (spec §10.3).
  const key = constraints.value.find((c) => c.kind === 'key' && c.keyKind === 'primary');
  const pk = key && key.kind === 'key' ? key.fields.length : 0;
  // The fields the entity receives from TablePartials count as its own
  // (spec §17.1), as the diagram lists them.
  const doc = parser.flatAst;
  const partials = doc ? tablePartials(doc) : new Map();
  for (const { field: f } of effectiveFields(props.entity, partials)) {
    total += 1;
    for (const s of f.settings) {
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
