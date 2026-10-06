/**
 * AST lookup: resolve a Selection to the corresponding AST nodes.
 *
 * The inspector renders metadata from the AST -- identification,
 * settings, Note bodies, type expressions, and spans for the
 * "Edit in source" navigation. This module walks the AST to find what
 * the user clicked on.
 *
 * Two reasons this lives in its own module rather than inside the
 * inspector component:
 *
 *   1. The lookup needs to traverse nested fields (an entity contains
 *      fields, fields can contain object/array/oneOf types or
 *      named-Type references with their own field children, recursively).
 *      Keeping the recursion in a separate function keeps the component
 *      render code clear.
 *
 *   2. Reuse: if "Edit in source" later grows variants (Reveal & select,
 *      Reveal & insert next-to, etc.), they all start with span lookup.
 *
 * Named-Type step-through: when a field is typed as a user-defined
 * `Type Foo { ... }`, the diagram expands its body inline, producing
 * clickable rows for fields inside the type. Clicking those rows
 * sends a path like `price.amount`; we step from `price` (a ScalarType
 * named `MonetaryAmount`) into the matching Type declaration's body
 * and find `amount` there. The Edit-in-source span on the resolved
 * field points to its definition site INSIDE the Type declaration,
 * which is correct -- that's where the field is actually written.
 */

import type {
  ContainerDeclaration,
  EdgeDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  RefDeclaration,
  TablePartialDeclaration,
  TypeDeclaration,
  TypeExpression,
  ViewDeclaration,
  XDbmlDocument,
} from '@xdbml/parse';
// Imported from the layout module by path rather than through the
// `@xdbml/render` alias: this file is loaded directly by the Node test
// runner, which resolves relative paths but not the Vite alias. The
// layout module only type-imports @xdbml/parse, so nothing else follows.
import { collectRefDeclarations } from '../../../../renderer/src/layout/layout.ts';
import { effectiveFieldList, effectiveFields, entityDefinitions, resolveSupertypeGroups, tablePartials, type ResolvedSupertypeGroup } from '@xdbml/parse';

import type { Selection } from './selection';

/**
 * Inspector treats Entity, View, and Edge declarations as the same kind
 * of thing for navigation purposes: each has a name, settings, a body
 * containing FieldDeclarations, and a span. The node types are
 * structurally close enough that a single union prop covers them, with
 * kind-specific UI (a View's source query) gated by a `kind` check.
 */
export type EntityOrView = EntityDeclaration | ViewDeclaration | EdgeDeclaration;

/**
 * The resolved nodes for a selection. The shape varies by selection
 * kind so the inspector can dispatch on it.
 */
export type ResolvedSelection =
  | { kind: 'container'; node: ContainerDeclaration }
  | { kind: 'entity';    node: EntityOrView; container: ContainerDeclaration | null }
  | {
      kind: 'field';
      node: FieldDeclaration;
      ancestors: readonly FieldDeclaration[];
      entity: EntityOrView;
      container: ContainerDeclaration | null;
      /**
       * The TablePartial that declares the field, when the entity receives
       * it through a `~name` line (spec §17.1); null for a field the entity
       * declares itself. `node.span` then points into the TablePartial.
       */
      partial: TablePartialDeclaration | null;
    }
  | { kind: 'ref'; node: RefDeclaration; index: number }
  | { kind: 'supertypeGroup'; group: ResolvedSupertypeGroup }
  | null;

export function resolveSelection (doc: XDbmlDocument | undefined, sel: Selection): ResolvedSelection {
  if (!doc || !sel) return null;
  switch (sel.kind) {
    case 'container': return resolveContainer(doc, sel.containerName);
    case 'entity':    return resolveEntity(doc, sel.entityId);
    case 'field':     return resolveField(doc, sel.entityId, sel.path);
    case 'ref':       return resolveRef(doc, sel.refId);
    case 'supertypeGroup': {
      const group = resolveSupertypeGroups(doc).find((g) => g.declaration.name === sel.groupName);
      return group ? { kind: 'supertypeGroup', group } : null;
    }
    // The diagram on display is not an AST node: Inspector.vue shows it
    // with DiagramInspector, from the Project or the diagram view.
    case 'diagram':
      return null;
  }
}

/**
 * The supertype groups an entity takes part in (spec §12): the groups it
 * anchors as supertype, and the group it belongs to as a subtype. Entity ids
 * are container-qualified for entities in a Container, as in the diagram.
 */
export function supertypeGroupsOf (
  doc: XDbmlDocument | undefined,
  entityId: string,
): { asSupertype: ResolvedSupertypeGroup[]; asSubtype: ResolvedSupertypeGroup[] } {
  const out = { asSupertype: [] as ResolvedSupertypeGroup[], asSubtype: [] as ResolvedSupertypeGroup[] };
  if (!doc) return out;
  for (const g of resolveSupertypeGroups(doc)) {
    if (g.supertype === entityId) out.asSupertype.push(g);
    if (g.subtypes.some((s) => s.entity === entityId)) out.asSubtype.push(g);
  }
  return out;
}

/**
 * Build a name -> TypeDeclaration map from the document's top-level
 * Type declarations. Used when resolving field paths that step into
 * a named-type reference, so the inspector can find the FieldDeclaration
 * inside a Type body. Same idea as the diagram's typeTable; we rebuild
 * it locally to keep ast-lookup self-contained.
 */
function collectTypeTable (doc: XDbmlDocument): Map<string, TypeDeclaration> {
  const table = new Map<string, TypeDeclaration>();
  for (const stmt of doc.statements) {
    if (stmt.kind === 'TypeDeclaration') table.set(stmt.name, stmt);
  }
  return table;
}

function resolveContainer (doc: XDbmlDocument, name: string): ResolvedSelection {
  for (const stmt of doc.statements) {
    if (stmt.kind === 'ContainerDeclaration' && stmt.name === name) {
      return { kind: 'container', node: stmt };
    }
  }
  return null;
}

function resolveEntity (doc: XDbmlDocument, entityId: string): ResolvedSelection {
  const found = findEntity(doc, entityId);
  if (!found) return null;
  return { kind: 'entity', node: found.entity, container: found.container };
}

function resolveField (doc: XDbmlDocument, entityId: string, path: string): ResolvedSelection {
  const found = findEntity(doc, entityId);
  if (!found) return null;
  // path may be "name", "name.child", "name.[item].child", "name.{alt}.child", etc.
  // Synthetic intermediate segments ([item], {alt}, <key>, <value>, <item>) point
  // into structural type expressions, not actual FieldDeclarations. Named-type
  // references (a ScalarType whose name matches a top-level Type declaration)
  // also need step-through: traversing into a field of type `MonetaryAmount`
  // resolves to a field inside the `Type MonetaryAmount { ... }` body.
  // Spec §15.8.2: inside the entity, its internal definitions come before
  // the project's Types; traverseFieldPath switches to the project table
  // when it steps into a project Type, as the diagram does.
  const typeTable = collectTypeTable(doc);
  const local = entityDefinitions(found.entity.body as EntityDeclaration['body']);
  const entityTable: ReadonlyMap<string, TypeDeclaration> =
    local.size > 0 ? new Map([...typeTable, ...local]) : typeTable;
  const segments = path.split('.');
  const traversal = traverseFieldPath(
    found.entity, segments,
    { entity: entityTable, project: typeTable, local: new Set(local.values()), partials: tablePartials(doc) },
  );
  if (!traversal) return null;
  return {
    kind: 'field',
    node: traversal.field,
    ancestors: traversal.ancestors,
    entity: found.entity,
    container: found.container,
    partial: traversal.partial,
  };
}

function resolveRef (doc: XDbmlDocument, refId: string): ResolvedSelection {
  // refId is `ref:<index>` from layout. The index covers top-level `Ref`
  // statements AND the inline `[ref: ...]` settings the diagram synthesizes
  // a declaration for, so it is resolved through the renderer's own
  // collector rather than by counting RefDeclaration statements here.
  // Counting statements missed every inline ref, which left the inspector
  // empty for any line that came from one.
  const m = refId.match(/^ref:(\d+)$/);
  if (!m) return null;
  const index = Number(m[1]);
  const node = collectRefDeclarations(doc)[index];
  return node ? { kind: 'ref', node, index } : null;
}

/* -------------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */

interface EntityFinding {
  entity: EntityOrView;
  container: ContainerDeclaration | null;
}

function findEntity (doc: XDbmlDocument, entityId: string): EntityFinding | null {
  // Edge boxes use an `edge:` prefix (then `containerName.edgeName` or
  // just `edgeName`). Resolve those to the EdgeDeclaration so the
  // inspector shows the edge's properties.
  if (entityId.startsWith('edge:')) {
    const rest = entityId.slice('edge:'.length);
    const dot = rest.lastIndexOf('.');
    if (dot > 0) {
      const cname = rest.slice(0, dot);
      const ename = rest.slice(dot + 1);
      for (const stmt of doc.statements) {
        if (stmt.kind !== 'ContainerDeclaration' || stmt.name !== cname) continue;
        for (const item of stmt.body) {
          if (item.kind === 'EdgeDeclaration' && item.name === ename) {
            return { entity: item, container: stmt };
          }
        }
      }
    }
    for (const stmt of doc.statements) {
      if (stmt.kind === 'EdgeDeclaration' && stmt.name === rest) {
        return { entity: stmt, container: null };
      }
    }
    return null;
  }

  // entityId is either "containerName.entityName" (when in a container)
  // or just "entityName" (for top-level orphan entities). Split on the
  // last dot since neither name contains dots.
  //
  // Both EntityDeclaration and ViewDeclaration are matched -- they're
  // treated as the same kind of thing for inspector navigation; the
  // EntityInspector renders both, with a Source-query section gated
  // on whether the node kind is ViewDeclaration.
  const dotIdx = entityId.lastIndexOf('.');
  if (dotIdx > 0) {
    const cname = entityId.slice(0, dotIdx);
    const ename = entityId.slice(dotIdx + 1);
    for (const stmt of doc.statements) {
      if (stmt.kind !== 'ContainerDeclaration' || stmt.name !== cname) continue;
      for (const item of stmt.body) {
        if ((item.kind === 'EntityDeclaration' || item.kind === 'ViewDeclaration') && item.name === ename) {
          return { entity: item, container: stmt };
        }
      }
    }
  }
  for (const stmt of doc.statements) {
    if ((stmt.kind === 'EntityDeclaration' || stmt.kind === 'ViewDeclaration') && stmt.name === entityId) {
      return { entity: stmt, container: null };
    }
  }
  return null;
}

/**
 * Walk a field path inside an entity, returning the deepest
 * FieldDeclaration and the chain of named ancestor fields above it.
 *
 * Path segments come in these forms (matching `layout.ts`'s synthetic-
 * row scheme):
 *   "name"        -- a named field at the current level
 *   "[item]"      -- the synthetic array-element row
 *   "[*]"         -- unnamed array element
 *   "{alt}"       -- a synthetic oneOf/anyOf/allOf alternative row
 *   "<key>",
 *   "<value>",
 *   "<item>"      -- synthetic rows for map keys/values and set elements
 *
 * Synthetic segments don't have their own FieldDeclaration; they
 * traverse INTO the parent's type expression. The function returns the
 * last actual FieldDeclaration encountered; `ancestors` carries the
 * chain of named FieldDeclarations above it so the inspector can show
 * the full dotted path.
 *
 * Selecting a synthetic-row path resolves to the same field as the
 * deepest named ancestor. That's intentional in v1: clicking
 * "{card}" in a oneOf shows the parent field's inspector. A future
 * version could open a sub-inspector for the alternative's type.
 */
/**
 * The type tables a field path resolves names in: the entity's scope
 * (its internal definitions over the project's Types), the project's
 * scope, and the entity's internal definitions themselves, so a step
 * into a declaration knows which scope its body uses (spec §15.8.2).
 */
interface TypeScopes {
  entity: ReadonlyMap<string, TypeDeclaration>;
  project: ReadonlyMap<string, TypeDeclaration>;
  local: ReadonlySet<TypeDeclaration>;
  /** The TablePartials of the document, for `~name` lines in nested bodies (spec §17.1). */
  partials: ReadonlyMap<string, TablePartialDeclaration>;
}

function traverseFieldPath (
  entity: EntityOrView,
  segments: readonly string[],
  scopes: TypeScopes,
): { field: FieldDeclaration; ancestors: readonly FieldDeclaration[]; partial: TablePartialDeclaration | null } | null {
  if (segments.length === 0) return null;

  // The top-level rows of the diagram are the entity's own fields and
  // those it receives from TablePartials (spec §17.1), so the first
  // segment is looked up among both, as the diagram lists them. A field
  // received from a partial resolves its type names at project scope
  // (spec §15.8.2).
  const found = effectiveFields(entity, scopes.partials).find((e) => e.field.name === segments[0]);
  if (!found) return null;
  const top = found.field;
  let partial = found.partial ?? null;

  let currentField: FieldDeclaration = top;
  let currentType: TypeExpression = top.type;
  let table = partial ? scopes.project : scopes.entity;
  const ancestors: FieldDeclaration[] = [];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    if (isSyntheticSegment(seg)) {
      const next = traverseStructuralStep(currentType, seg);
      if (!next) return null;
      currentType = next;
      continue;
    }

    const child = findNamedField(currentType, seg, table, scopes);
    if (!child) return null;
    ancestors.push(currentField);
    currentField = child.field;
    currentType = child.field.type;
    table = child.table;
    partial = child.partial;
  }

  return { field: currentField, ancestors, partial };
}

function isSyntheticSegment (seg: string): boolean {
  return /^(\[[^\]]*\]|\{[^}]*\}|<[^>]*>)$/.test(seg);
}

function traverseStructuralStep (type: TypeExpression, seg: string): TypeExpression | null {
  switch (type.kind) {
    case 'ArrayType':
      if (seg.startsWith('[') && seg.endsWith(']')) {
        return type.elementType ?? null;
      }
      return null;
    case 'OneOfType':
    case 'AnyOfType':
    case 'AllOfType': {
      const m = seg.match(/^\{(.*)\}$/);
      if (!m) return null;
      const alt = type.alternatives.find((a) => a.name === m[1]);
      return alt?.type ?? null;
    }
    case 'MapType':
      if (seg === '<key>')   return type.keyType;
      if (seg === '<value>') return type.valueType;
      return null;
    case 'SetType':
      if (seg === '<item>') return type.elementType;
      return null;
    case 'TupleType': {
      const m = seg.match(/^\[(.+)\]$/);
      if (!m) return null;
      const pos = m[1];
      const el = type.elements.find((e) => String(e.position) === pos);
      return el?.type ?? null;
    }
    default:
      return null;
  }
}

function findNamedField (
  type: TypeExpression,
  name: string,
  table: ReadonlyMap<string, TypeDeclaration>,
  scopes: TypeScopes,
): { field: FieldDeclaration; table: ReadonlyMap<string, TypeDeclaration>; partial: TablePartialDeclaration | null } | null {
  // A field a `~name` line places in the body is declared in the
  // TablePartial and resolves its type names at project scope.
  const inBody = (body: readonly { kind: string }[], next: ReadonlyMap<string, TypeDeclaration>) => {
    const hit = effectiveFieldList(body, scopes.partials).find((e) => e.field.name === name);
    if (!hit) return null;
    return { field: hit.field, table: hit.partial ? scopes.project : next, partial: hit.partial ?? null };
  };
  switch (type.kind) {
    case 'ObjectType':
      return inBody(type.fields, table);
    case 'JsonType':
      return type.fields ? inBody(type.fields, table) : null;
    case 'ScalarType': {
      // A ScalarType whose name matches a Type declaration, or an internal
      // definition of the entity, is a reference to a user-defined type.
      // Step into its body and look for the named field. Genuine scalars
      // (int, varchar) don't have fields and fall through to null. Same
      // resolution as the diagram's named-type expansion: an internal
      // definition's body stays in the entity's scope, a project Type's
      // body resolves at project scope (spec §15.8.2).
      const decl = table.get(type.name);
      if (!decl) return null;
      return inBody(decl.body, scopes.local.has(decl) ? table : scopes.project);
    }
    default:
      return null;
  }
}
