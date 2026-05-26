<template>
  <g>
    <!-- Card background -->
    <rect
      :x="entity.bounds.x"
      :y="entity.bounds.y"
      :width="entity.bounds.width"
      :height="entity.bounds.height"
      rx="5"
      fill="white"
      stroke="#94a3b8"
      stroke-width="1"
      filter="url(#entity-shadow)"
    />

    <!-- Header band -->
    <rect
      :x="entity.bounds.x"
      :y="entity.bounds.y"
      :width="entity.bounds.width"
      :height="headerHeight"
      :fill="headerFill"
      rx="5"
    />
    <rect
      :x="entity.bounds.x"
      :y="entity.bounds.y + headerHeight - 6"
      :width="entity.bounds.width"
      height="6"
      :fill="headerFill"
    />

    <text
      :x="entity.bounds.x + 12"
      :y="entity.bounds.y + 20"
      fill="white"
      font-size="13"
      font-weight="600"
    >{{ entity.name }}</text>
    <text
      :x="entity.bounds.x + entity.bounds.width - 12"
      :y="entity.bounds.y + 20"
      fill="white"
      font-size="10"
      text-anchor="end"
      opacity="0.85"
    >{{ entity.keyword }}</text>

    <!-- Field rows -->
    <g
      v-for="(field, i) in entity.fields"
      :key="field.path"
    >
      <!-- Row background: PK highlight, zebra, or synthetic-row tint. -->
      <rect
        v-if="rowFill(field, i) !== undefined"
        :x="entity.bounds.x + 1"
        :y="entity.bounds.y + field.rowY"
        :width="entity.bounds.width - 2"
        :height="field.rowHeight"
        :fill="rowFill(field, i)"
      />

      <!-- Indent guide line at each parent indent level (subtle vertical
           ruler so users can follow which parent a deeply nested row
           belongs to). -->
      <line
        v-for="g in indentGuides(field.indent)"
        :key="g"
        :x1="entity.bounds.x + 12 + g * INDENT_PX + 4"
        :y1="entity.bounds.y + field.rowY"
        :x2="entity.bounds.x + 12 + g * INDENT_PX + 4"
        :y2="entity.bounds.y + field.rowY + field.rowHeight"
        stroke="#e2e8f0"
        stroke-width="1"
      />

      <!-- Caret (▾ expanded, ▸ collapsed) when this row has children.
           Clicking emits toggle-path so the canvas can update collapse
           state. Wrapped in a generous transparent hitbox so mobile/
           imprecise clicks still register. -->
      <g
        v-if="field.hasChildren"
        class="cursor-pointer"
        @click="$emit('toggle-path', field.path)"
      >
        <rect
          :x="entity.bounds.x + 12 + field.indent * INDENT_PX - 2"
          :y="entity.bounds.y + field.rowY + 4"
          width="14"
          height="16"
          fill="transparent"
        />
        <text
          :x="entity.bounds.x + 12 + field.indent * INDENT_PX + 4"
          :y="entity.bounds.y + field.rowY + 16"
          font-size="9"
          fill="#475569"
          text-anchor="middle"
        >{{ isCollapsed(field.path) ? '▸' : '▾' }}</text>
      </g>

      <!-- Field name. Indented by indent * INDENT_PX. When hasChildren,
           leave space for the caret on the left. -->
      <text
        :x="entity.bounds.x + nameLeftEdge(field)"
        :y="entity.bounds.y + field.rowY + 16"
        font-size="12"
        :font-weight="field.flags.pk ? 600 : 400"
        :font-style="field.synthetic ? 'italic' : 'normal'"
        :fill="nameColor(field)"
      >{{ field.name }}</text>

      <!-- Type label, right-aligned -->
      <text
        :x="entity.bounds.x + entity.bounds.width - 12"
        :y="entity.bounds.y + field.rowY + 16"
        font-size="11"
        font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill="#64748b"
        text-anchor="end"
      >{{ truncate(field.typeLabel, 22) }}</text>

      <!-- Inline flag badges. Position is just after the field-name text. -->
      <g
        v-for="(badge, bi) in fieldBadges(field)"
        :key="bi"
      >
        <circle
          :cx="entity.bounds.x + badgeX(field) + bi * 14"
          :cy="entity.bounds.y + field.rowY + 12"
          r="6"
          :fill="badge.color"
        />
        <text
          :x="entity.bounds.x + badgeX(field) + bi * 14"
          :y="entity.bounds.y + field.rowY + 15"
          fill="white"
          font-size="8"
          font-weight="700"
          text-anchor="middle"
        >{{ badge.label }}</text>
      </g>
    </g>
  </g>
</template>

<script setup lang="ts">
/**
 * One entity card in the diagram.
 *
 * Renders the entity's header band and one row per FieldLayout produced
 * by `buildDiagram`. The layout flattens nested objects, arrays, and
 * polymorphism alternatives into a single stream of indented rows; this
 * component renders that stream with indentation, carets on parent rows
 * (clickable to collapse/expand), and visual cues for synthetic
 * intermediate rows (array element labels, polymorphism alternative
 * labels) that don't correspond to user-written field names.
 *
 * Emits `toggle-path` when a caret is clicked. The parent canvas owns
 * the collapse-state set and decides what to do with the toggle.
 */
import type { EntityLayout, FieldLayout } from './layout';

const props = defineProps<{
  entity: EntityLayout;
  collapsedPaths: ReadonlySet<string>;
}>();

defineEmits<{
  'toggle-path': [path: string];
}>();

const headerHeight = 32;
const INDENT_PX = 14;

// MongoDB-style entities get a different header tint so polyglot
// schemas read distinctly even when not inside a container.
const headerFill = ((): string => {
  switch (props.entity.keyword) {
    case 'Collection':
    case 'Record':
      return '#1e3a8a';
    default:
      return '#334155';
  }
})();

interface Badge { label: string; color: string }

function fieldBadges (field: FieldLayout): Badge[] {
  const badges: Badge[] = [];
  if (field.flags.pk) badges.push({ label: 'P', color: '#ca8a04' });
  if (field.flags.fk) badges.push({ label: 'F', color: '#0891b2' });
  if (field.flags.unique && !field.flags.pk) badges.push({ label: 'U', color: '#7c3aed' });
  if (field.flags.notNull) badges.push({ label: '!', color: '#dc2626' });
  return badges;
}

function rowFill (field: FieldLayout, index: number): string | undefined {
  if (field.flags.pk) return '#fef9c3';
  if (field.synthetic) return '#f1f5f9';
  if (index % 2 === 1) return '#f8fafc';
  return undefined;
}

function nameColor (field: FieldLayout): string {
  if (field.flags.pk) return '#854d0e';
  if (field.synthetic) return '#64748b';
  return '#0f172a';
}

/**
 * X-offset where the field name text starts. Indent baseline is 12px
 * left padding plus `indent * INDENT_PX`. Rows with carets reserve an
 * extra 12px so the caret has room to its left.
 */
function nameLeftEdge (field: FieldLayout): number {
  const indentX = 12 + field.indent * INDENT_PX;
  return field.hasChildren ? indentX + 12 : indentX;
}

/**
 * X-position of the first badge circle's center. Just after the field
 * name with a small gap.
 */
function badgeX (field: FieldLayout): number {
  const nameStart = nameLeftEdge(field);
  // Rough monospace-ish width estimate, same as before.
  const nameWidth = field.name.length * 6.5;
  return nameStart + nameWidth + 8;
}

/**
 * Returns the indent levels (0..indent-1) at which a vertical guide
 * line should be drawn for this row. Helps users visually track
 * which parent each deeply nested row belongs to.
 */
function indentGuides (indent: number): number[] {
  if (indent === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < indent; i += 1) out.push(i);
  return out;
}

function isCollapsed (path: string): boolean {
  return props.collapsedPaths.has(`${props.entity.id}::${path}`);
}

function truncate (s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
</script>
