<template>
  <div class="w-full h-full overflow-auto diagram-canvas">
    <div
      v-if="!hasAst"
      class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none"
    >
      <div class="text-center">
        <div class="font-medium text-gray-600 mb-1">Diagram unavailable</div>
        <div>Fix the parse error to see the diagram</div>
      </div>
    </div>
    <svg
      v-else
      :width="diagram.width"
      :height="diagram.height"
      :viewBox="`0 0 ${diagram.width} ${diagram.height}`"
      class="block"
    >
      <defs>
        <!-- Entity card drop-shadow. Subtle -- the diagram already has
             a grid background that provides depth. -->
        <filter id="entity-shadow" x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#0f172a" flood-opacity="0.12" />
        </filter>
      </defs>

      <!-- Containers (drawn first so entities render on top) -->
      <g
        v-for="container in diagram.containers"
        :key="container.id"
        class="container-group"
      >
        <rect
          :x="container.bounds.x"
          :y="container.bounds.y"
          :width="container.bounds.width"
          :height="container.bounds.height"
          rx="6"
          fill="white"
          stroke="#cbd5e1"
          stroke-width="1.5"
          stroke-dasharray="4 3"
        />
        <rect
          :x="container.bounds.x"
          :y="container.bounds.y"
          :width="container.bounds.width"
          :height="32"
          :fill="container.accentColor"
          rx="6"
        />
        <!-- The header band's bottom corners should be square to flush
             with the container body; overlay a rect to clip the rounding. -->
        <rect
          :x="container.bounds.x"
          :y="container.bounds.y + 16"
          :width="container.bounds.width"
          height="16"
          :fill="container.accentColor"
        />
        <text
          :x="container.bounds.x + 12"
          :y="container.bounds.y + 21"
          fill="white"
          font-size="13"
          font-weight="600"
        >{{ container.keyword }} · {{ container.name }}</text>
        <text
          v-if="container.target"
          :x="container.bounds.x + container.bounds.width - 12"
          :y="container.bounds.y + 21"
          fill="white"
          font-size="11"
          text-anchor="end"
          opacity="0.85"
        >→ {{ container.target }}</text>
      </g>

      <!-- Ref lines (drawn before entities so the cards visually
           overlap any line that crosses them) -->
      <g class="ref-lines">
        <RefLine
          v-for="ref in resolvedRefs"
          :key="ref.id"
          :ref-layout="ref"
          :entities="diagram.entities"
        />
      </g>

      <!-- Entities -->
      <g
        v-for="entity in diagram.entities"
        :key="entity.id"
        class="entity-card"
      >
        <EntityCard
          :entity="entity"
          :collapsed-paths="collapsedPaths"
          @toggle-path="(path) => togglePath(entity.id, path)"
        />
      </g>

      <!-- Unresolved-ref indicator -->
      <g
        v-if="unresolvedRefCount > 0"
        class="warning-banner"
      >
        <rect
          x="12"
          :y="diagram.height - 36"
          width="280"
          height="24"
          rx="4"
          fill="#fef3c7"
          stroke="#f59e0b"
          stroke-width="1"
        />
        <text
          x="22"
          :y="diagram.height - 19"
          fill="#92400e"
          font-size="11"
        >{{ unresolvedRefCount }} Ref{{ unresolvedRefCount === 1 ? '' : 's' }} couldn't be resolved</text>
      </g>
    </svg>
  </div>
</template>

<script setup lang="ts">
/**
 * The right-pane diagram canvas.
 *
 * Subscribes to the parser store's AST and recomputes the diagram layout
 * on every change. The layout function is pure, so the result is stable
 * across edits and across toggles of the collapse state.
 *
 * Owns the `collapsedPaths` set -- one entry per `entityId::path` pair
 * that the user has collapsed. EntityCard emits `toggle-path` events
 * when a caret is clicked; we update the set and persist to
 * localStorage so the user's collapse choices survive reload.
 *
 * Renders:
 *
 *   - Container groups: dashed rounded rectangles with a colored header
 *     band keyed to the container's target (Oracle red, MongoDB green,
 *     Postgres blue, ...). The visual cue makes polyglot schemas
 *     instantly legible.
 *
 *   - Entity cards: header + indented field rows. Nested structural
 *     types (object/array/oneOf/json/map/set/tuple) expand into deeper
 *     rows with carets that can be clicked to collapse. Each row shows
 *     the field name, a compact type label, and inline flags
 *     (PK, FK, U, !).
 *
 *   - Ref lines: cubic Bezier curves from source field row to target
 *     field row, with cardinality endpoints (1, *, 0..1, etc.) rendered
 *     as small labels near each terminus. Unresolved refs (path doesn't
 *     match a declared entity) are excluded from rendering and counted
 *     in a small warning banner at the bottom of the canvas.
 */
import { computed, ref, watch } from 'vue';

import { useParserStore } from '@/stores/parserStore';

import EntityCard from './EntityCard.vue';
import RefLine from './RefLine.vue';
import { buildDiagram, makeCollapsedKey } from './layout';

const parser = useParserStore();

/* -------------------------------------------------------------------------
 * Collapse state
 *
 * Stored as a Set of `${entityId}::${path}` keys. Persistence to
 * localStorage is best-effort -- on serialization failure we keep the
 * in-memory set and don't crash the diagram.
 * ----------------------------------------------------------------------- */

const COLLAPSE_STORAGE_KEY = 'xdbml-playground:collapsed-paths';

function loadCollapsed (): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    // ignore, fall through to empty set
  }
  return new Set();
}

const collapsedPaths = ref<Set<string>>(loadCollapsed());

watch(collapsedPaths, (set) => {
  try {
    localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // best-effort persistence
  }
}, { deep: true });

function togglePath (entityId: string, path: string): void {
  const key = makeCollapsedKey(entityId, path);
  const next = new Set(collapsedPaths.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedPaths.value = next;
}

/* -------------------------------------------------------------------------
 * Diagram model -- recomputed reactively from AST + collapsed state.
 * ----------------------------------------------------------------------- */

const diagram = computed(() => buildDiagram(parser.ast, collapsedPaths.value));

const hasAst = computed(() => parser.hasAst);

const resolvedRefs = computed(() => diagram.value.refs.filter((r) => !r.unresolved));
const unresolvedRefCount = computed(() => diagram.value.refs.filter((r) => r.unresolved).length);
</script>
