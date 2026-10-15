<template>
  <div>
    <InspectorSection title="Identification">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <template v-if="lineage.name !== undefined">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Name</dt>
          <dd class="text-gray-900 dark:text-slate-100 font-mono break-all">{{ lineage.name }}</dd>
        </template>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Form</dt>
        <dd class="text-gray-900 dark:text-slate-100">{{ formLabel }}</dd>
        <dt class="font-medium text-gray-500 dark:text-slate-400">Color</dt>
        <dd class="flex items-center gap-1.5 text-gray-900 dark:text-slate-100">
          <span
            class="inline-block w-3 h-3 rounded-sm border border-black/15"
            :style="{ backgroundColor: color ?? defaultColor }"
          />
          <span>{{ color ?? 'Default' }}</span>
        </dd>
        <template v-if="lineage.sourceDatabase">
          <dt class="font-medium text-gray-500 dark:text-slate-400">Language</dt>
          <dd class="text-gray-900 dark:text-slate-100 font-mono">{{ lineage.sourceDatabase }}</dd>
        </template>
      </dl>
    </InspectorSection>

    <!-- A Dep whose dependencies carry kinds of transformation reads as a
         source-to-target mapping (spec §27.10): one row per line into a
         field, then the lines that steer the rows of the target. -->
    <InspectorSection v-if="mapping" :title="`Source-to-target mapping into ${mapping.element}`">
      <table v-if="mapping.fields.length > 0" class="w-full text-xs border-collapse">
        <thead>
          <tr class="text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-slate-500">
            <th class="font-semibold pb-1 pr-2">Field</th>
            <th class="font-semibold pb-1 pr-2">From</th>
            <th class="font-semibold pb-1">Kind</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(r, k) in mapping.fields" :key="`f${k}`">
            <tr class="align-top border-t border-gray-100 dark:border-slate-700/60">
              <td class="py-1 pr-2 font-mono text-gray-900 dark:text-slate-100 break-words">
                <template v-for="(seg, n) in segments(r.target)" :key="n">{{ seg }}<wbr></template>
              </td>
              <td class="py-1 pr-2 font-mono text-gray-700 dark:text-slate-300 break-words">
                <div v-for="src in r.sources" :key="src"><template v-for="(seg, n) in segments(src)" :key="n">{{ seg }}<wbr></template></div>
              </td>
              <td class="py-1 whitespace-nowrap" :class="kindClass(r.kind)">{{ kindLabel(r.kind) }}</td>
            </tr>
            <tr v-if="r.note || r.settings.length > 0">
              <td colspan="3" class="pb-1.5 pl-3">
                <NoteDisplay v-if="r.note" :body="r.note" />
                <SettingsTable v-if="r.settings.length > 0" :settings="r.settings" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <template v-if="mapping.rows.length > 0">
        <p class="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">Rows</p>
        <ul class="space-y-1 text-xs">
          <li v-for="(r, k) in mapping.rows" :key="`r${k}`" class="leading-relaxed">
            <span :class="kindClass(r.kind)">{{ kindLabel(r.kind) }}</span>
            <span class="text-gray-500 dark:text-slate-400"> on </span>
            <template v-for="(src, n) in r.sources" :key="src">
              <span v-if="n > 0" class="text-gray-500 dark:text-slate-400">, </span>
              <code class="font-mono text-[0.92em] px-1 rounded bg-black/5 dark:bg-white/10 text-gray-900 dark:text-slate-100">{{ src }}</code>
            </template>
            <NoteDisplay v-if="r.note" :body="r.note" />
            <SettingsTable v-if="r.settings.length > 0" :settings="r.settings" />
          </li>
        </ul>
      </template>
    </InspectorSection>

    <InspectorSection v-if="!mapping" :title="lineage.dependencies.length === 1 ? 'Dependency' : `Dependencies (${lineage.dependencies.length})`">
      <p v-if="lineage.dependencies.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic">
        No dependency: the block declares nothing (spec §27.2).
      </p>
      <ul v-else class="space-y-2">
        <li v-for="(g, k) in groups" :key="k" class="text-xs text-gray-700 dark:text-slate-200 leading-relaxed">
          <p class="break-words">
            <template v-for="(part, n) in g.sentence" :key="n">
              <code
                v-if="part.code"
                class="font-mono text-[0.92em] px-1 rounded bg-black/5 dark:bg-white/10 text-gray-900 dark:text-slate-100"
              >{{ part.text }}</code>
              <template v-else>{{ part.text }}</template>
            </template>
          </p>
          <div
            v-for="d in g.withSettings"
            :key="d.index"
            class="mt-1 pl-3 border-l-2 border-amber-200 dark:border-amber-800"
          >
            <p v-if="g.size > 1" class="text-[11px] text-gray-500 dark:text-slate-400">
              From <code class="font-mono">{{ d.upstream }}</code>
            </p>
            <NoteDisplay v-if="noteOf(d.settings)" :body="noteOf(d.settings)" />
            <SettingsTable v-if="d.settings.some((s) => s.name !== 'note')" :settings="d.settings.filter((s) => s.name !== 'note')" />
          </div>
        </li>
      </ul>
    </InspectorSection>

    <InspectorSection v-if="lineage.inline === undefined" title="Transformation">
      <NoteDisplay :body="noteOf(lineage.settings)" />
    </InspectorSection>

    <!-- The statement that loads the target (spec §27.3), highlighted as SQL
         and checked by nothing (§14.3), as for a View. -->
    <InspectorSection v-if="sourceQueryBody" title="Source query">
      <pre class="sql-block text-[11px] leading-relaxed font-mono text-gray-800 dark:text-slate-100 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded px-2 py-1.5 overflow-x-auto whitespace-pre max-h-[40vh] overflow-y-auto"><code v-html="highlightedSourceQuery"></code></pre>
    </InspectorSection>

    <InspectorSection v-if="customSettings.length > 0" title="Custom properties">
      <SettingsTable :settings="customSettings" />
    </InspectorSection>

    <div class="px-3 pb-3">
      <EditInSourceButton @click="$emit('edit-source', lineage.span)" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A Dep (spec §27): its name and form, its dependencies read back as
 * sentences that name the elements (dep-narrative.ts), each with the
 * settings written after it in a block, the transformation its note
 * describes, rendered as Markdown, and its custom properties. An inline
 * `dep` is one dependency with no name and no settings, carried by an
 * entity, a View or a field.
 *
 * A Dep whose dependencies carry kinds of transformation reads as a
 * source-to-target mapping instead (dep-mapping.ts, spec §27.10), with
 * its statement, `source_query`, highlighted as SQL below (v0.7.2).
 */
import { computed } from 'vue';
import { depColor, resolveLineage } from '@xdbml/parse';
import type { Lineage, Setting, Span } from '@xdbml/parse';
import { darkTheme, defaultTheme } from '@xdbml/render';
import { useAppearance } from '@/composables/useAppearance';
import { useParserStore } from '@/stores/parserStore';
import { depNarrative } from './dep-narrative';
import { depMapping, isMapping } from './dep-mapping';
import { highlightSql } from './sqlHighlight';

import InspectorSection   from './InspectorSection.vue';
import SettingsTable      from './SettingsTable.vue';
import NoteDisplay        from './NoteDisplay.vue';
import EditInSourceButton from './EditInSourceButton.vue';

const props = defineProps<{
  lineage: Lineage;
}>();

defineEmits<{
  'edit-source': [span: Span];
}>();

const { isDark } = useAppearance();
const parser = useParserStore();

/** One sentence per downstream element, with the names as written. */
const groups = computed(() => {
  const resolved = parser.flatAst ? resolveLineage(parser.flatAst).get(props.lineage.id) : undefined;
  return depNarrative(props.lineage, resolved ?? []);
});

const formLabel = computed(() => {
  const l = props.lineage;
  if (l.inline) {
    const kind = l.inline.carrierKind === 'field' ? 'field' : l.inline.carrierKind === 'view' ? 'View' : 'entity';
    return `Inline, on ${kind} ${l.inline.carrier}`;
  }
  return l.decl?.form === 'block' ? 'Block' : 'Short';
});

const color = computed(() => depColor(props.lineage.settings));
const defaultColor = computed(() => (isDark.value ? darkTheme.lineage.line : defaultTheme.lineage.line));

function noteOf (settings: readonly Setting[]): string {
  const s = settings.find((x) => x.name === 'note');
  return s?.value?.kind === 'StringValue' ? s.value.value : '';
}

/** The mapping, for a Dep with kinds of transformation (spec §27.10). */
const mapping = computed(() => {
  if (!isMapping(props.lineage)) return undefined;
  const resolved = parser.flatAst ? resolveLineage(parser.flatAst).get(props.lineage.id) : undefined;
  return depMapping(props.lineage, resolved ?? []);
});

/** A name cut after each dot, so that a long path wraps between its parts. */
function segments (name: string): string[] {
  return name.split(/(?<=\.)/);
}

function kindLabel (kind: string | undefined): string {
  return kind ? kind.replace(/_/g, ' ') : '--';
}

/** The indirect kinds read in the lineage color, as their dashed curves do. */
function kindClass (kind: string | undefined): string {
  if (!kind) return 'text-gray-400 dark:text-slate-500';
  return ['join', 'lookup', 'filter', 'group_by', 'conditional'].includes(kind)
    ? 'italic text-amber-700 dark:text-amber-300'
    : 'text-amber-700 dark:text-amber-300';
}

const sourceQueryBody = computed(() => (props.lineage.sourceQuery ?? '').trim());
const highlightedSourceQuery = computed(() => highlightSql(sourceQueryBody.value));

/**
 * The settings shown as custom properties: neither the note nor the color,
 * nor the settings this inspector shows elsewhere -- the statement, its
 * language, and, in the short form, the kind of the one dependency.
 */
const customSettings = computed(() => {
  const l = props.lineage;
  const shown = new Set(['note', 'color']);
  if (l.sourceQuery !== undefined) shown.add('source_query');
  if (l.sourceDatabase !== undefined) shown.add('source_database');
  if (l.decl?.form === 'short' && l.dependencies.some((d) => d.transformation)) shown.add('transformation');
  return l.settings.filter((s) => !shown.has(s.name));
});
</script>
