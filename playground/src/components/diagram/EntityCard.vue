<template>
  <g>
    <!-- Card background. Stroke thickens and turns blue when this
         entity is the current selection (entity itself or one of its
         fields). For Views, the border is dashed rather than solid, to
         signal at a glance that the rectangle is a derived/computed
         relation rather than an authoritative table. -->
    <rect
      :x="entity.bounds.x"
      :y="entity.bounds.y"
      :width="entity.bounds.width"
      :height="entity.bounds.height"
      rx="5"
      fill="white"
      :stroke="isSelected ? '#2563eb' : '#94a3b8'"
      :stroke-width="isSelected ? 2 : 1"
      :stroke-dasharray="entity.isView ? '6 3' : undefined"
      filter="url(#entity-shadow)"
    />

    <!-- Draggable header band. Mousedown on this group starts a drag;
         the parent canvas listens for drag-start and runs the rest of
         the drag interaction at document level (so the cursor can leave
         the card while the mouse button is held). Field rows are
         deliberately NOT part of the drag handle: a future field-
         inspector feature will use field-row clicks for selection,
         and a draggable field row would conflict with that. The
         convention in dbdiagram.io, Lucidchart, and similar tools is
         the same -- header-only drag. -->
    <g
      class="entity-header"
      style="cursor: move;"
      @mousedown.stop="onHeaderMouseDown"
    >
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

      <!-- Eye icon for Views. Sits at the left of the header band, just
           before the entity name. An outer ellipse + a small filled
           pupil. Same ink color as the header text (resolved for
           contrast against headerFill). The name's X position shifts
           to make room (see nameLeftX below). -->
      <g
        v-if="entity.isView"
        style="pointer-events: none;"
      >
        <ellipse
          :cx="entity.bounds.x + 18"
          :cy="entity.bounds.y + 16"
          rx="8"
          ry="5"
          fill="none"
          :stroke="headerInk"
          stroke-width="1.4"
        />
        <circle
          :cx="entity.bounds.x + 18"
          :cy="entity.bounds.y + 16"
          r="2"
          :fill="headerInk"
        />
      </g>

      <!-- Diamond marker for Edge boxes. Sits where the View eye would,
           signalling a property-bearing relationship rather than a node. -->
      <g
        v-if="entity.isEdge"
        style="pointer-events: none;"
      >
        <path
          :d="`M ${entity.bounds.x + 18} ${entity.bounds.y + 9} ` +
              `L ${entity.bounds.x + 25} ${entity.bounds.y + 16} ` +
              `L ${entity.bounds.x + 18} ${entity.bounds.y + 23} ` +
              `L ${entity.bounds.x + 11} ${entity.bounds.y + 16} Z`"
          fill="none"
          :stroke="headerInk"
          stroke-width="1.4"
          stroke-linejoin="round"
        />
        <circle
          :cx="entity.bounds.x + 18"
          :cy="entity.bounds.y + 16"
          r="1.8"
          :fill="headerInk"
        />
      </g>

      <text
        :x="nameLeftX"
        :y="entity.bounds.y + 20"
        :fill="headerInk"
        font-size="13"
        font-weight="600"
        style="pointer-events: none; user-select: none;"
      >{{ entity.name }}</text>
      <text
        :x="entity.bounds.x + entity.bounds.width - 12"
        :y="entity.bounds.y + 20"
        :fill="headerInk"
        font-size="10"
        text-anchor="end"
        opacity="0.85"
        style="pointer-events: none; user-select: none;"
      >{{ entity.keyword }}</text>
    </g>

    <!-- Field rows. Each row's wrapping <g> receives a `click` handler
         via its child hit-rect. The caret's @click.stop runs first so
         caret clicks don't trigger field selection. -->
    <g
      v-for="(field, i) in entity.fields"
      :key="field.path"
    >
      <!-- Row background tint: selected-field highlight wins; otherwise
           the layout's chosen tint (PK / zebra / synthetic-row). -->
      <rect
        v-if="isFieldSelected(field.path)"
        :x="entity.bounds.x + 1"
        :y="entity.bounds.y + field.rowY"
        :width="entity.bounds.width - 2"
        :height="field.rowHeight"
        fill="#dbeafe"
        style="pointer-events: none;"
      />
      <rect
        v-else-if="rowFill(field, i) !== undefined"
        :x="entity.bounds.x + 1"
        :y="entity.bounds.y + field.rowY"
        :width="entity.bounds.width - 2"
        :height="field.rowHeight"
        :fill="rowFill(field, i)"
        style="pointer-events: none;"
      />

      <!-- Selected-row left-edge accent strip. -->
      <rect
        v-if="isFieldSelected(field.path)"
        :x="entity.bounds.x + 1"
        :y="entity.bounds.y + field.rowY"
        width="3"
        :height="field.rowHeight"
        fill="#2563eb"
        style="pointer-events: none;"
      />

      <!-- Transparent hit-rect over the full row. Captures clicks so
           the user can select the field by clicking anywhere on the
           row (not just on the text). Drawn BEFORE the caret and
           text elements so they render on top visually; the caret's
           @click.stop prevents its clicks from bubbling here. -->
      <rect
        :x="entity.bounds.x + 1"
        :y="entity.bounds.y + field.rowY"
        :width="entity.bounds.width - 2"
        :height="field.rowHeight"
        fill="transparent"
        style="cursor: pointer;"
        @click="onFieldRowClick(field.path, $event)"
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
        style="pointer-events: none;"
      />

      <!-- Caret (▾ expanded, ▸ collapsed) when this row has children.
           @click.stop prevents the click from also reaching the row
           hit-rect underneath, so toggling collapse doesn't change
           the selection. -->
      <g
        v-if="field.hasChildren"
        class="cursor-pointer"
        @click.stop="$emit('toggle-path', field.path)"
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
          style="pointer-events: none; user-select: none;"
        >{{ isCollapsed(field.path) ? '▸' : '▾' }}</text>
      </g>

      <!-- Field name. Indented by indent * INDENT_PX, then offset by the
           reserved caret gutter so names align at every depth regardless
           of whether the row carries a caret. -->
      <text
        :x="entity.bounds.x + nameLeftEdge(field)"
        :y="entity.bounds.y + field.rowY + 16"
        font-size="12"
        :font-weight="field.flags.pk ? 600 : 400"
        :font-style="field.synthetic ? 'italic' : 'normal'"
        :fill="nameColor(field)"
        style="pointer-events: none; user-select: none;"
      >{{ field.name }}</text>

      <!-- Type label, right-aligned -->
      <text
        :x="entity.bounds.x + entity.bounds.width - 12"
        :y="entity.bounds.y + field.rowY + 16"
        font-size="11"
        font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        fill="#64748b"
        text-anchor="end"
        style="pointer-events: none; user-select: none;"
      >{{ truncate(field.typeLabel, 22) }}</text>

      <!-- Inline flag badges. Position is just after the field-name text. -->
      <g
        v-for="(badge, bi) in fieldBadges(field)"
        :key="bi"
        style="pointer-events: none;"
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
 * Selection:
 *   - `is-selected` prop: when true the card's outline highlights,
 *     because the entity is the current selection (or one of its
 *     fields is).
 *   - `selection` prop: when of kind 'field' for this entity, the
 *     matching field row also highlights (tint + left accent strip).
 *
 * Events:
 *   - `toggle-path`: caret clicked. The parent canvas owns the collapse
 *     state and decides what to do with the toggle.
 *   - `drag-start`: header mousedown. The parent canvas takes over,
 *     attaches document-level mousemove/mouseup listeners, and updates
 *     the entity's user-overridden position as the mouse moves. If no
 *     drag occurred (mouseup with movement < 2 px), the parent fires
 *     an entity-selection event instead.
 *   - `select-field`: a field row was clicked. The parent canvas
 *     forwards this to App.vue as a field selection. Carets stop
 *     propagation so caret clicks don't trigger this.
 */
import { computed } from 'vue';

import type { EntityLayout, FieldLayout } from './layout';
import { readableInk } from './layout';
import type { Selection } from '@/components/inspector/selection';

const props = defineProps<{
  entity: EntityLayout;
  collapsedPaths: ReadonlySet<string>;
  selection: Selection;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  'toggle-path': [path: string];
  'drag-start': [event: { entityId: string; clientX: number; clientY: number }];
  'select-field': [path: string];
}>();

function isFieldSelected (path: string): boolean {
  return props.selection?.kind === 'field' && props.selection.path === path;
}

function onFieldRowClick (path: string, e: MouseEvent): void {
  // Stop the click from bubbling to the SVG background-click handler
  // (which would clear the selection -- the opposite of what the user
  // wants when they click a row).
  e.stopPropagation();
  emit('select-field', path);
}

function onHeaderMouseDown (e: MouseEvent): void {
  // Only the primary (left) button starts a drag. Right-click and
  // middle-click are reserved for future use (context menu, pan).
  if (e.button !== 0) return;
  // The parent runs the rest at the document level so the mouse can
  // leave the card while the button is held.
  emit('drag-start', {
    entityId: props.entity.id,
    clientX: e.clientX,
    clientY: e.clientY,
  });
  e.preventDefault();
}

const headerHeight = 32;
const INDENT_PX = 14;

// Header band fill. Priority:
//   1. The entity's resolved `headerColor` from layout (entity's own
//      `[headercolor: '#...']` setting, or its TableGroup's `color`).
//   2. Keyword-based default (MongoDB-style Collection/Record get a
//      distinctive blue; others fall back to slate). This keeps the
//      polyglot read distinct when there's no explicit color.
const headerFill = ((): string => {
  if (props.entity.headerColor) return props.entity.headerColor;
  switch (props.entity.keyword) {
    case 'Collection':
    case 'Record':
      return '#1e3a8a';
    default:
      return '#334155';
  }
})();

// Header text color, picked for contrast against headerFill. Uses the
// shared `readableInk` helper from layout.ts so containers and entity
// headers apply the same contrast policy. Default headers (slate, deep
// blue) are dark, so white wins; user-defined light headerColor values
// (e.g., '#FFEB3B' yellow) automatically switch to dark ink.
const headerInk = readableInk(headerFill);

// X coordinate for the entity-name text in the header. Views render
// an eye icon at the left of the header, so the name shifts right to
// make room. Regular entities have the name at the standard 12-px
// inset.
const nameLeftX = computed(() => {
  return props.entity.bounds.x + (props.entity.isView || props.entity.isEdge ? 32 : 12);
});

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
 * left padding plus `indent * INDENT_PX`, then an additional 12px for
 * the caret gutter.
 *
 * The caret gutter is reserved unconditionally at every indent level,
 * whether or not the row actually has a caret. This keeps field names
 * vertically aligned with each other within the same indent level:
 * `name`, `price ▾`, and `inventory` all start at the same X regardless
 * of which one carries a caret. Without the reservation, caret rows
 * would push their name 12px to the right of non-caret siblings,
 * which made columns look jagged.
 */
function nameLeftEdge (field: FieldLayout): number {
  return 12 + field.indent * INDENT_PX + 12;
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
