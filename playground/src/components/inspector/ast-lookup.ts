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
  EntityDeclaration,
  FieldDeclaration,
  RefDeclaration,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from '@xdbml/parse';

import type { Selection } from './selection';

/**
 * The resolved nodes for a selection. The shape varies by selection
 * kind so the inspector can dispatch on it.
 */
export type ResolvedSelection =
  | { kind: 'container'; node: ContainerDeclaration }
  | { kind: 'entity';    node: EntityDeclaration; container: ContainerDeclaration | null }
  | {
      kind: 'field';
      node: FieldDeclaration;
      ancestors: readonly FieldDeclaration[];
      entity: EntityDeclaration;
      container: ContainerDeclaration | null;
    }
  | { kind: 'ref'; node: RefDeclaration; index: number }
  | null;

export function resolveSelection (doc: XDbmlDocument | undefined, sel: Selection): ResolvedSelection {
  if (!doc || !sel) return null;
  switch (sel.kind) {
    case 'container': return resolveContainer(doc, sel.containerName);
    case 'entity':    return resolveEntity(doc, sel.entityId);
    case 'field':     return resolveField(doc, sel.entityId, sel.path);
    case 'ref':       return resolveRef(doc, sel.refId);
  }
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
  const typeTable = collectTypeTable(doc);
  const segments = path.split('.');
  const traversal = traverseFieldPath(found.entity, segments, typeTable);
  if (!traversal) return null;
  return {
    kind: 'field',
    node: traversal.field,
    ancestors: traversal.ancestors,
    entity: found.entity,
    container: found.container,
  };
}

function resolveRef (doc: XDbmlDocument, refId: string): ResolvedSelection {
  // refId is `ref:<index>` from layout.
  const m = refId.match(/^ref:(\d+)$/);
  if (!m) return null;
  const wanted = Number(m[1]);
  let index = 0;
  for (const stmt of doc.statements) {
    if (stmt.kind === 'RefDeclaration') {
      if (index === wanted) return { kind: 'ref', node: stmt, index };
      index += 1;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */

interface EntityFinding {
  entity: EntityDeclaration;
  container: ContainerDeclaration | null;
}

function findEntity (doc: XDbmlDocument, entityId: string): EntityFinding | null {
  // entityId is either "containerName.entityName" (when in a container)
  // or just "entityName" (for top-level orphan entities). Split on the
  // last dot since neither name contains dots.
  const dotIdx = entityId.lastIndexOf('.');
  if (dotIdx > 0) {
    const cname = entityId.slice(0, dotIdx);
    const ename = entityId.slice(dotIdx + 1);
    for (const stmt of doc.statements) {
      if (stmt.kind !== 'ContainerDeclaration' || stmt.name !== cname) continue;
      for (const item of stmt.body) {
        if (item.kind === 'EntityDeclaration' && item.name === ename) {
          return { entity: item, container: stmt };
        }
      }
    }
  }
  for (const stmt of doc.statements) {
    if (stmt.kind === 'EntityDeclaration' && stmt.name === entityId) {
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
function traverseFieldPath (
  entity: EntityDeclaration,
  segments: readonly string[],
  typeTable: ReadonlyMap<string, TypeDeclaration>,
): { field: FieldDeclaration; ancestors: readonly FieldDeclaration[] } | null {
  if (segments.length === 0) return null;

  const top = entity.body.find(
    (b): b is FieldDeclaration => b.kind === 'FieldDeclaration' && b.name === segments[0],
  );
  if (!top) return null;

  let currentField: FieldDeclaration = top;
  let currentType: TypeExpression = top.type;
  const ancestors: FieldDeclaration[] = [];

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];

    if (isSyntheticSegment(seg)) {
      const next = traverseStructuralStep(currentType, seg);
      if (!next) return null;
      currentType = next;
      continue;
    }

    const childField = findNamedField(currentType, seg, typeTable);
    if (!childField) return null;
    ancestors.push(currentField);
    currentField = childField;
    currentType = childField.type;
  }

  return { field: currentField, ancestors };
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
  typeTable: ReadonlyMap<string, TypeDeclaration>,
): FieldDeclaration | null {
  switch (type.kind) {
    case 'ObjectType':
      return findFieldInBody(type.fields, name);
    case 'JsonType':
      return type.fields ? findFieldInBody(type.fields, name) : null;
    case 'ScalarType': {
      // A ScalarType whose name matches a top-level Type declaration is
      // a reference to a user-defined type. Step into that type's body
      // and look for the named field. Genuine scalars (int, varchar)
      // don't have fields and fall through to null. Same resolution
      // as the diagram's named-type expansion.
      const decl = typeTable.get(type.name);
      if (!decl) return null;
      return findFieldInBody(decl.body, name);
    }
    default:
      return null;
  }
}

function findFieldInBody (
  body: readonly { kind: string }[],
  name: string,
): FieldDeclaration | null {
  for (const item of body) {
    if (item.kind === 'FieldDeclaration' && (item as FieldDeclaration).name === name) {
      return item as FieldDeclaration;
    }
  }
  return null;
}
