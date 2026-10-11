<template>
  <div v-if="settings.length === 0" class="text-xs text-gray-400 dark:text-slate-500 italic">
    No settings
  </div>
  <table v-else class="w-full text-xs">
    <tbody>
      <tr
        v-for="(s, i) in settings"
        :key="`${s.name}:${i}`"
        class="border-b border-gray-50 dark:border-slate-800 last:border-b-0"
      >
        <td class="py-1.5 pr-2 font-medium text-gray-700 dark:text-slate-200 align-top w-2/5 break-words">
          {{ s.nameSource }}
          <span
            v-if="fromMetadata?.has(s)"
            class="ml-1 inline-block px-1 py-px text-[9px] font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded align-middle"
            title="Set by a Metadata block (spec §24.7)"
          >Metadata</span>
        </td>
        <td class="py-1.5 align-top">
          <span
            v-if="s.value === null"
            class="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded"
          >flag</span>
          <code
            v-else
            class="text-xs text-gray-600 dark:text-slate-300 font-mono break-all"
          >{{ renderValue(s.value) }}</code>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
/**
 * Settings as a two-column read-only key/value table.
 *
 * Flag settings (no value, like `pk` or `not null`) render as a small
 * "flag" badge. Other settings render their value as monospace text
 * with quoting matched to source:
 *   - StringValue   "..."
 *   - NumberValue   bare
 *   - BooleanValue  bare
 *   - IdentifierValue bare
 *   - ExpressionValue   `...`
 *   - ListValue     [..., ..., ...]
 *
 * A setting that a Metadata block sets (spec §24.7) carries a small
 * "Metadata" badge beside its name; `fromMetadata` holds those settings.
 *
 * For v1 the table is read-only. Editing would write back to source
 * via span-based replacement; that came up in the original plan but is
 * deferred until the read-only inspector is settled.
 */
import type { Setting, SettingValue } from '@xdbml/parse';

defineProps<{
  settings: readonly Setting[];
  /** The settings that a Metadata block sets, marked in the table (spec §24.7). */
  fromMetadata?: ReadonlySet<Setting>;
}>();

function renderValue (v: SettingValue): string {
  switch (v.kind) {
    case 'StringValue':     return `"${v.value}"`;
    case 'NumberValue':     return v.value;
    case 'BooleanValue':    return String(v.value);
    case 'IdentifierValue': return v.value;
    case 'NullValue':       return 'null';
    case 'ExpressionValue': return `\`${v.expression}\``;
    case 'ListValue':       return `[${v.items.map(renderValue).join(', ')}]`;
    case 'RefValue':        return '<ref>';
  }
}
</script>
