<template>
  <div v-if="settings.length === 0" class="text-xs text-gray-400 italic">
    No settings
  </div>
  <table v-else class="w-full text-xs">
    <tbody>
      <tr
        v-for="(s, i) in settings"
        :key="`${s.name}:${i}`"
        class="border-b border-gray-50 last:border-b-0"
      >
        <td class="py-1.5 pr-2 font-medium text-gray-700 align-top w-2/5 break-words">
          {{ s.nameSource }}
        </td>
        <td class="py-1.5 align-top">
          <span
            v-if="s.value === null"
            class="inline-block px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded"
          >flag</span>
          <code
            v-else
            class="text-xs text-gray-600 font-mono break-all"
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
 * For v1 the table is read-only. Editing would write back to source
 * via span-based replacement; that came up in the original plan but is
 * deferred until the read-only inspector is settled.
 */
import type { Setting, SettingValue } from '@xdbml/parse';

defineProps<{
  settings: readonly Setting[];
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
