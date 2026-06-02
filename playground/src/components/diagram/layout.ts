/**
 * Diagram layout.
 *
 * Pure function: takes an xDBML AST and returns a DiagramModel -- a set
 * of positioned entity boxes, container groups, and ref lines that the
 * SVG renderer turns into pixels. The layout is deterministic and
 * idempotent, so a re-parse on every keystroke produces a stable diagram
 * (no jitter as the user types).
 *
 * Strategy for v1 (intentionally simple):
 *
 *   - Containers are laid out horizontally, left to right, in the order
 *     they appear in the source.
 *   - Within a container, entities are stacked vertically in source order.
 *   - Entities outside any container are placed in a virtual "(no
 *     container)" column to the right.
 *   - Each entity's height is computed from its field count.
 *   - Refs become curves drawn between entity edges at the row of the
 *     source/target field.
 *
 * What's deliberately not yet here:
 *   - Drag-to-reposition (positions are pure layout output, no user
 *     override yet).
 *   - Pan/zoom (the SVG is fixed-size and the canvas scrolls).
 *   - Named Types in a side panel.
 *   - Edges as labeled lines.
 *   - oneOf/anyOf rendering.
 *   - Cross-container ref wildcards (.[*]) -- the line is drawn the same
 *     as any other ref for now; visual treatment lands later.
 *
 * Adding any of those is additive to this module rather than a rewrite.
 */

import type {
  ContainerDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  RefDeclaration,
  ScalarType,
  Setting,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from '@xdbml/parse';

/* -------------------------------------------------------------------------
 * Output shape
 * ----------------------------------------------------------------------- */

export interface DiagramModel {
  containers: ContainerLayout[];
  entities: EntityLayout[];
  refs: RefLayout[];
  /** Overall canvas size needed to hold the laid-out content. */
  width: number;
  height: number;
}

export interface ContainerLayout {
  id: string;
  name: string;
  /** e.g. 'Container' | 'Schema' | 'Database' | ... */
  keyword: string;
  /** Resolved target string from settings (Oracle, MongoDB, PostgreSQL, ...); '' if absent. */
  target: string;
  /** Color used for the container header band, derived from target. */
  accentColor: string;
  bounds: Rect;
}

export interface EntityLayout {
  id: string;
  name: string;
  /** e.g. 'Entity' | 'Table' | 'Collection' | 'Record' */
  keyword: string;
  /** Container name this entity belongs to, or undefined if free-floating. */
  containerName?: string;
  fields: FieldLayout[];
  bounds: Rect;
}

export interface FieldLayout {
  /** The owning entity's id, for line endpoint resolution. */
  entityId: string;
  /** The field's source name. */
  name: string;
  /** A human-friendly type label, e.g. 'int', 'varchar(255)', 'object', 'array [item: object]'. */
  typeLabel: string;
  /** Flags computed from the field's settings: pk, fk, unique, not null, ... */
  flags: FieldFlags;
  /** y-offset within the entity card where this field's row sits. */
  rowY: number;
  /** Computed row height (constant in v1). */
  rowHeight: number;
  /**
   * Nesting depth. 0 for top-level fields, 1 for fields one level inside
   * an object/array/oneOf, 2 for two levels deep, etc. Rendered as
   * horizontal indentation in the entity card.
   */
  indent: number;
  /**
   * Unique path identifying this row within its entity, used as a key
   * for collapse state. For top-level field `bill_to_address` containing
   * an object with `street`, the rows are:
   *   path = "bill_to_address"          (the parent)
   *   path = "bill_to_address.street"   (a child)
   *
   * For an array of named objects `line_items array [item object { sku ... }]`
   * the rows are:
   *   path = "line_items"
   *   path = "line_items.[item]"        (the array's element label)
   *   path = "line_items.[item].sku"    (a leaf inside the element)
   *
   * For polymorphism `payment_method oneOf { card object {...}, bank object {...} }`:
   *   path = "payment_method"
   *   path = "payment_method.{card}"
   *   path = "payment_method.{card}.last4"
   *   path = "payment_method.{bank}"
   *   path = "payment_method.{bank}.iban"
   */
  path: string;
  /**
   * True if this row introduces children that can be collapsed. The
   * caret (▾ / ▸) is only rendered on rows where this is true.
   */
  hasChildren: boolean;
  /**
   * What kind of structural type the children come from. Drives the
   * subtle visual hint on the row (e.g. an "{}" suffix for object,
   * "[]" for array, etc.) and could later drive child-row styling.
   */
  childKind?: 'object' | 'array' | 'oneOf' | 'anyOf' | 'allOf' | 'json' | 'union' | 'map' | 'set' | 'tuple';
  /**
   * Synthetic intermediate rows (the array element name like `[item]`,
   * or a polymorphism alternative name like `{card}`) are flagged so the
   * card can render them in a slightly muted style; the user didn't
   * name them as fields, they're structural scaffolding.
   */
  synthetic?: boolean;
}

export interface FieldFlags {
  pk: boolean;
  fk: boolean;
  unique: boolean;
  notNull: boolean;
  hasDefault: boolean;
  increment: boolean;
}

export interface RefLayout {
  id: string;
  /** Cardinality operator: '<' '>' '-' '<>' */
  operator: string;
  /** Resolved entity+field locator. May be undefined if resolution failed. */
  source?: FieldLocator;
  target?: FieldLocator;
  /** Cardinality endpoint strings, '1..1' / '0..*' etc., if provided in settings. */
  sourceCardinality?: string;
  targetCardinality?: string;
  /** True when either endpoint couldn't be resolved against current entities. */
  unresolved: boolean;
}

export interface FieldLocator {
  entityId: string;
  /** May be undefined for paths that target an entity (no specific field). */
  fieldName?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* -------------------------------------------------------------------------
 * Layout constants
 *
 * Kept here rather than as inline magic numbers so the SVG renderer can
 * import them when it needs to know e.g. how tall a row is. The numbers
 * are tuned for a Tailwind-base font stack at the playground's default
 * 13-14px sizes; visual designers can later promote these to CSS vars.
 * ----------------------------------------------------------------------- */

export const ENTITY_WIDTH = 280;
export const ENTITY_HEADER_HEIGHT = 32;
export const ROW_HEIGHT = 24;
export const ENTITY_GAP_Y = 32; // gap between entities within a container
export const CONTAINER_PADDING = 24;
export const CONTAINER_HEADER_HEIGHT = 32;
export const CONTAINER_GAP_X = 56; // gap between adjacent containers
export const CANVAS_MARGIN = 32; // outer margin around the whole diagram

/* -------------------------------------------------------------------------
 * Target -> accent color
 *
 * Containers in xDBML can target different database engines. Coloring
 * the container header by target makes polyglot schemas visually
 * distinct at a glance. We keep this mapping deliberately conservative:
 * known engines get a vendor-ish tint, anything else gets a neutral
 * slate. Hex values are mid-saturation so the header readable against
 * the entity cards below.
 * ----------------------------------------------------------------------- */

const TARGET_COLORS: Record<string, string> = {
  postgresql: '#336791',
  postgres: '#336791',
  oracle: '#c74634',
  mysql: '#4479a1',
  sqlserver: '#a91d22',
  mssql: '#a91d22',
  mongodb: '#47a248',
  mongo: '#47a248',
  cassandra: '#1287b1',
  neo4j: '#018bff',
  redis: '#dc382d',
  snowflake: '#29b5e8',
  bigquery: '#669df6',
  databricks: '#ff3621',
  redshift: '#8c4fff',
  cosmosdb: '#0078d4',
  cosmos: '#0078d4',
  dynamodb: '#4053d6',
  couchbase: '#ea2328',
  elasticsearch: '#005571',
};

function colorForTarget (target: string): string {
  if (!target) return '#475569'; // slate-600
  return TARGET_COLORS[target.toLowerCase().replace(/\s+/g, '')] ?? '#475569';
}

/**
 * Identifier for a collapsed row: `${entityId}::${path}`.
 *
 * The path-within-entity is namespaced under the entity id so two
 * entities with same-named structural fields don't share collapse state
 * (e.g. both `orders.shipping_address` and `invoices.shipping_address`
 * can be collapsed independently).
 */
export type CollapsedKey = string;

export function makeCollapsedKey (entityId: string, path: string): CollapsedKey {
  return `${entityId}::${path}`;
}

/* -------------------------------------------------------------------------
 * Main entry
 * ----------------------------------------------------------------------- */

export function buildDiagram (
  doc: XDbmlDocument | undefined,
  collapsedPaths: ReadonlySet<CollapsedKey> = new Set(),
): DiagramModel {
  if (!doc) return emptyDiagram();

  // Collect entities, grouped by container.
  const entitiesByContainer = new Map<string | undefined, EntityDeclaration[]>();
  const containers: ContainerDeclaration[] = [];

  for (const stmt of doc.statements) {
    if (stmt.kind === 'ContainerDeclaration') {
      containers.push(stmt);
      const list: EntityDeclaration[] = [];
      for (const item of stmt.body) {
        if (item.kind === 'EntityDeclaration') list.push(item);
      }
      entitiesByContainer.set(stmt.name, list);
    } else if (stmt.kind === 'EntityDeclaration') {
      const existing = entitiesByContainer.get(undefined) ?? [];
      existing.push(stmt);
      entitiesByContainer.set(undefined, existing);
    }
  }

  // Collect top-level Type declarations into a name->declaration map.
  // Used to resolve `NamedTypeReference` occurrences inside entity fields:
  // a field typed as a named Type expands inline to show that type's
  // structure, the same way a field typed as `object {...}` does.
  //
  // Per spec §10, Type declarations are top-level only -- they cannot be
  // declared inside containers. So a single pass over doc.statements
  // covers the entire visible namespace. Lookups are by name; later
  // declarations with the same name silently shadow earlier ones.
  const typeTable = new Map<string, TypeDeclaration>();
  for (const stmt of doc.statements) {
    if (stmt.kind === 'TypeDeclaration') {
      typeTable.set(stmt.name, stmt);
    }
  }

  // Place each container's entities in a vertical column.
  const entityLayouts: EntityLayout[] = [];
  const containerLayouts: ContainerLayout[] = [];
  let cursorX = CANVAS_MARGIN;
  let maxBottom = CANVAS_MARGIN;

  for (const container of containers) {
    const containerEntities = entitiesByContainer.get(container.name) ?? [];
    const target = settingValueAsString(container.settings, 'target') ?? '';
    const accentColor = colorForTarget(target);

    const innerLeft = cursorX + CONTAINER_PADDING;
    const innerTop = CANVAS_MARGIN + CONTAINER_HEADER_HEIGHT + CONTAINER_PADDING;
    let entityCursorY = innerTop;

    for (const entity of containerEntities) {
      const layout = buildEntityLayout(entity, innerLeft, entityCursorY, container.name, collapsedPaths, typeTable);
      entityLayouts.push(layout);
      entityCursorY = layout.bounds.y + layout.bounds.height + ENTITY_GAP_Y;
    }

    const containerHeight = (entityCursorY - innerTop) + CONTAINER_PADDING + CONTAINER_HEADER_HEIGHT
      - (containerEntities.length > 0 ? ENTITY_GAP_Y : 0);

    const containerLayout: ContainerLayout = {
      id: `container:${container.name}`,
      name: container.name,
      keyword: container.keyword,
      target,
      accentColor,
      bounds: {
        x: cursorX,
        y: CANVAS_MARGIN,
        width: ENTITY_WIDTH + CONTAINER_PADDING * 2,
        height: Math.max(containerHeight, CONTAINER_HEADER_HEIGHT + CONTAINER_PADDING * 2),
      },
    };
    containerLayouts.push(containerLayout);
    maxBottom = Math.max(maxBottom, containerLayout.bounds.y + containerLayout.bounds.height);
    cursorX += containerLayout.bounds.width + CONTAINER_GAP_X;
  }

  // Free-floating entities (no container). Stack them in their own column.
  const orphans = entitiesByContainer.get(undefined) ?? [];
  if (orphans.length > 0) {
    let entityCursorY = CANVAS_MARGIN;
    for (const entity of orphans) {
      const layout = buildEntityLayout(entity, cursorX, entityCursorY, undefined, collapsedPaths, typeTable);
      entityLayouts.push(layout);
      entityCursorY = layout.bounds.y + layout.bounds.height + ENTITY_GAP_Y;
    }
    maxBottom = Math.max(maxBottom, entityCursorY);
    cursorX += ENTITY_WIDTH + CONTAINER_GAP_X;
  }

  // Resolve refs against the entities we just placed.
  const entityByName = new Map<string, EntityLayout>();
  for (const e of entityLayouts) {
    entityByName.set(e.name, e);
    if (e.containerName) {
      entityByName.set(`${e.containerName}.${e.name}`, e);
    }
  }

  const refLayouts: RefLayout[] = [];
  let refIndex = 0;
  for (const stmt of doc.statements) {
    if (stmt.kind === 'RefDeclaration') {
      refLayouts.push(buildRefLayout(stmt, entityByName, refIndex));
      refIndex += 1;
    }
  }

  // Mark fk flags on fields that appear as a source in any resolved Ref.
  // We try to match the deepest visible field row by name; if the source
  // path includes a nested segment (e.g. `line_items.[item].sku`), and
  // that row is currently expanded, the badge appears on the leaf. If
  // the row is collapsed, we mark the nearest visible ancestor so the
  // user still sees an FK indicator at the collapsed parent.
  for (const ref of refLayouts) {
    if (!ref.source || !ref.source.fieldName) continue;
    const entity = entityLayouts.find((e) => e.id === ref.source!.entityId);
    if (!entity) continue;
    // First try exact name match at any indent (matches dbdiagram.io's
    // intuition that the "source field" is whatever has that leaf name).
    let target = entity.fields.find((f) => f.name === ref.source!.fieldName);
    // Fallback: match by leaf segment of a nested path. Source path
    // strings here are just the field name; the field name carries no
    // path info, so this only fires for refs with explicit composite
    // form. For now, the simple name match is sufficient.
    if (!target) {
      target = entity.fields.find((f) => f.path.endsWith(`.${ref.source!.fieldName}`));
    }
    if (target) target.flags.fk = true;
  }

  const width = Math.max(cursorX, CANVAS_MARGIN * 2 + 200);
  const height = maxBottom + CANVAS_MARGIN;

  return {
    containers: containerLayouts,
    entities: entityLayouts,
    refs: refLayouts,
    width,
    height,
  };
}

function emptyDiagram (): DiagramModel {
  return {
    containers: [],
    entities: [],
    refs: [],
    width: 400,
    height: 200,
  };
}

/* -------------------------------------------------------------------------
 * Entity layout
 * ----------------------------------------------------------------------- */

function buildEntityLayout (
  entity: EntityDeclaration,
  x: number,
  y: number,
  containerName: string | undefined,
  collapsedPaths: ReadonlySet<CollapsedKey>,
  typeTable: ReadonlyMap<string, TypeDeclaration>,
): EntityLayout {
  const entityId = containerName ? `${containerName}.${entity.name}` : entity.name;
  const fields: FieldLayout[] = [];
  let rowY = ENTITY_HEADER_HEIGHT;

  // Helper that walks one FieldDeclaration -- emits its own row and
  // optionally recurses into nested children. Returns the next rowY.
  //
  // `namedTypeAncestors` tracks the named-Type names we're currently
  // inside (during recursive expansion of NamedTypeReference). When a
  // field's type references a Type that's already in the ancestry,
  // recursion stops and the row renders without a caret -- a self-
  // contained signal to the user that they've hit a cycle. The user
  // can still see the type name; they just can't drill into it again
  // on the same path.
  const emitField = (
    field: FieldDeclaration,
    indent: number,
    parentPath: string,
    namedTypeAncestors: ReadonlySet<string>,
  ): void => {
    const path = parentPath ? `${parentPath}.${field.name}` : field.name;
    const flags = computeFieldFlags(field);
    const nested = describeNested(field.type, typeTable);
    let hasChildren = nested !== undefined;

    // Recursion guard: if this field's type is a user-defined Type
    // (parsed as a ScalarType whose name matches a top-level
    // TypeDeclaration) and that type name is already in our expansion
    // ancestry, suppress the caret so the user sees a leaf row instead
    // of a clickable affordance that would just re-render the same name.
    // Inline objects nested inside the same named type are unaffected --
    // only named-type cycles trigger the guard, since inline objects
    // can't be cyclic.
    if (hasChildren
        && field.type.kind === 'ScalarType'
        && typeTable.has(field.type.name)
        && namedTypeAncestors.has(field.type.name)) {
      hasChildren = false;
    }

    fields.push({
      entityId,
      name: field.name,
      typeLabel: renderTypeLabel(field.type),
      flags,
      rowY,
      rowHeight: ROW_HEIGHT,
      indent,
      path,
      hasChildren,
      childKind: nested?.childKind,
    });
    rowY += ROW_HEIGHT;

    if (hasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, path))) {
      emitNestedChildren(field.type, indent + 1, path, namedTypeAncestors);
    }
  };

  // Walks a type expression, emitting child rows (and recursing further
  // if a child is itself a structural type).
  const emitNestedChildren = (
    type: TypeExpression,
    indent: number,
    parentPath: string,
    namedTypeAncestors: ReadonlySet<string>,
  ): void => {
    switch (type.kind) {
      case 'ObjectType': {
        for (const item of type.fields) {
          if (item.kind === 'FieldDeclaration') emitField(item, indent, parentPath, namedTypeAncestors);
          // Note/PartialInjection inside object bodies aren't visualized
          // as rows -- they belong to the inspector/details panel later.
        }
        return;
      }
      case 'JsonType': {
        if (!type.fields) return;
        for (const item of type.fields) {
          if (item.kind === 'FieldDeclaration') emitField(item, indent, parentPath, namedTypeAncestors);
        }
        return;
      }
      case 'ArrayType': {
        if (!type.elementType) return;
        // The array introduces a synthetic intermediate row carrying the
        // element name (if named) or a literal '[*]' label, so the user
        // sees that they're stepping into the element type.
        const elementLabel = type.elementName ?? '[*]';
        const elementSegment = type.elementName ? `[${type.elementName}]` : '[*]';
        const elementPath = `${parentPath}.${elementSegment}`;
        const elementHasChildren = describeNested(type.elementType, typeTable) !== undefined;
        fields.push({
          entityId,
          name: elementLabel,
          typeLabel: renderTypeLabel(type.elementType),
          flags: emptyFlags(),
          rowY,
          rowHeight: ROW_HEIGHT,
          indent,
          path: elementPath,
          hasChildren: elementHasChildren,
          childKind: describeNested(type.elementType, typeTable)?.childKind,
          synthetic: true,
        });
        rowY += ROW_HEIGHT;
        if (elementHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, elementPath))) {
          emitNestedChildren(type.elementType, indent + 1, elementPath, namedTypeAncestors);
        }
        return;
      }
      case 'TupleType': {
        for (const elem of type.elements) {
          const tuplePath = `${parentPath}.[${elem.position}]`;
          const elemHasChildren = describeNested(elem.type, typeTable) !== undefined;
          fields.push({
            entityId,
            name: `[${elem.position}] ${elem.name}`,
            typeLabel: renderTypeLabel(elem.type),
            flags: emptyFlags(),
            rowY,
            rowHeight: ROW_HEIGHT,
            indent,
            path: tuplePath,
            hasChildren: elemHasChildren,
            childKind: describeNested(elem.type, typeTable)?.childKind,
            synthetic: true,
          });
          rowY += ROW_HEIGHT;
          if (elemHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, tuplePath))) {
            emitNestedChildren(elem.type, indent + 1, tuplePath, namedTypeAncestors);
          }
        }
        return;
      }
      case 'OneOfType':
      case 'AnyOfType':
      case 'AllOfType': {
        // Each polymorphic alternative becomes a synthetic intermediate
        // row carrying the alternative's name, with the alternative's
        // type's fields recursing one further indent below.
        for (const alt of type.alternatives) {
          const altPath = `${parentPath}.{${alt.name}}`;
          const altHasChildren = describeNested(alt.type, typeTable) !== undefined;
          fields.push({
            entityId,
            name: `{${alt.name}}`,
            typeLabel: renderTypeLabel(alt.type),
            flags: emptyFlags(),
            rowY,
            rowHeight: ROW_HEIGHT,
            indent,
            path: altPath,
            hasChildren: altHasChildren,
            childKind: describeNested(alt.type, typeTable)?.childKind,
            synthetic: true,
          });
          rowY += ROW_HEIGHT;
          if (altHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, altPath))) {
            emitNestedChildren(alt.type, indent + 1, altPath, namedTypeAncestors);
          }
        }
        return;
      }
      case 'MapType': {
        // Two synthetic rows: key and value. Each may recurse.
        const keyPath = `${parentPath}.<key>`;
        const valPath = `${parentPath}.<value>`;
        const keyHasChildren = describeNested(type.keyType, typeTable) !== undefined;
        const valHasChildren = describeNested(type.valueType, typeTable) !== undefined;
        fields.push({
          entityId,
          name: '<key>',
          typeLabel: renderTypeLabel(type.keyType),
          flags: emptyFlags(),
          rowY,
          rowHeight: ROW_HEIGHT,
          indent,
          path: keyPath,
          hasChildren: keyHasChildren,
          childKind: describeNested(type.keyType, typeTable)?.childKind,
          synthetic: true,
        });
        rowY += ROW_HEIGHT;
        if (keyHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, keyPath))) {
          emitNestedChildren(type.keyType, indent + 1, keyPath, namedTypeAncestors);
        }
        fields.push({
          entityId,
          name: '<value>',
          typeLabel: renderTypeLabel(type.valueType),
          flags: emptyFlags(),
          rowY,
          rowHeight: ROW_HEIGHT,
          indent,
          path: valPath,
          hasChildren: valHasChildren,
          childKind: describeNested(type.valueType, typeTable)?.childKind,
          synthetic: true,
        });
        rowY += ROW_HEIGHT;
        if (valHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, valPath))) {
          emitNestedChildren(type.valueType, indent + 1, valPath, namedTypeAncestors);
        }
        return;
      }
      case 'SetType': {
        const elemPath = `${parentPath}.<item>`;
        const elemHasChildren = describeNested(type.elementType, typeTable) !== undefined;
        fields.push({
          entityId,
          name: '<item>',
          typeLabel: renderTypeLabel(type.elementType),
          flags: emptyFlags(),
          rowY,
          rowHeight: ROW_HEIGHT,
          indent,
          path: elemPath,
          hasChildren: elemHasChildren,
          childKind: describeNested(type.elementType, typeTable)?.childKind,
          synthetic: true,
        });
        rowY += ROW_HEIGHT;
        if (elemHasChildren && !collapsedPaths.has(makeCollapsedKey(entityId, elemPath))) {
          emitNestedChildren(type.elementType, indent + 1, elemPath, namedTypeAncestors);
        }
        return;
      }
      case 'ScalarType': {
        // Expand a reference to a top-level `Type Foo { ... }` declaration
        // inline. The parser produces a ScalarType node for any type-position
        // identifier; we resolve here whether the identifier names a
        // user-defined Type. If it does, we walk its body. If not, this is
        // a genuine scalar (int, varchar, etc.) with no further structure.
        //
        // Recursion is bounded by the ancestry guard in emitField: if the
        // type name is already in the ancestry, that field's caret is
        // suppressed and the recursion stops before reaching here.
        const typeDecl = typeTable.get(type.name);
        if (!typeDecl) return;
        const childAncestors = new Set(namedTypeAncestors);
        childAncestors.add(type.name);
        for (const item of typeDecl.body) {
          if (item.kind === 'FieldDeclaration') emitField(item, indent, parentPath, childAncestors);
        }
        return;
      }
      // UnionType members are scalars/null only -- no children to expand.
      default:
        return;
    }
  };

  for (const item of entity.body) {
    if (item.kind !== 'FieldDeclaration') continue;
    emitField(item, 0, '', new Set<string>());
  }

  const height = ENTITY_HEADER_HEIGHT + (fields.length * ROW_HEIGHT) + 4;
  return {
    id: entityId,
    name: entity.name,
    keyword: entity.keyword,
    containerName,
    fields,
    bounds: { x, y, width: ENTITY_WIDTH, height },
  };
}

/**
 * Returns metadata about a type's child structure, or undefined if the
 * type has no expandable children. Used to decide whether to render a
 * caret on a row.
 */
function describeNested (
  type: TypeExpression,
  typeTable: ReadonlyMap<string, TypeDeclaration>,
): { childKind: NonNullable<FieldLayout['childKind']> } | undefined {
  switch (type.kind) {
    case 'ObjectType':
      return { childKind: 'object' };
    case 'JsonType':
      return type.fields && type.fields.length > 0 ? { childKind: 'json' } : undefined;
    case 'ArrayType':
      // Array is expandable iff its element type is structural -- a
      // plain `array [varchar]` doesn't need a caret since there's
      // nothing to show below.
      return type.elementType && describeNested(type.elementType, typeTable) !== undefined
        ? { childKind: 'array' }
        : undefined;
    case 'TupleType':
      return type.elements.length > 0 ? { childKind: 'tuple' } : undefined;
    case 'OneOfType':
      return { childKind: 'oneOf' };
    case 'AnyOfType':
      return { childKind: 'anyOf' };
    case 'AllOfType':
      return { childKind: 'allOf' };
    case 'MapType':
      return { childKind: 'map' };
    case 'SetType':
      return describeNested(type.elementType, typeTable) !== undefined ? { childKind: 'set' } : undefined;
    case 'ScalarType': {
      // A field with a "scalar" type whose name matches a top-level
      // TypeDeclaration is a reference to a user-defined Type. The
      // parser doesn't distinguish user-defined types from built-in
      // scalars at parse time, so we resolve here at the diagram
      // layer.
      //
      // childKind 'object' because the Type's body is an object shape.
      // A scalar with no matching Type and no further structure is a
      // genuine scalar -- no caret.
      const decl = typeTable.get(type.name);
      if (!decl) return undefined;
      const hasFields = decl.body.some((b) => b.kind === 'FieldDeclaration');
      return hasFields ? { childKind: 'object' } : undefined;
    }
    // Union members are scalars/null -- no children to expand.
    default:
      return undefined;
  }
}

function emptyFlags (): FieldFlags {
  return {
    pk: false,
    fk: false,
    unique: false,
    notNull: false,
    hasDefault: false,
    increment: false,
  };
}

function computeFieldFlags (field: FieldDeclaration): FieldFlags {
  const flags: FieldFlags = {
    pk: false,
    fk: false, // set during ref resolution
    unique: false,
    notNull: false,
    hasDefault: false,
    increment: false,
  };
  for (const s of field.settings) {
    switch (s.name) {
      case 'pk':
      case 'primary key':
        flags.pk = true;
        break;
      case 'unique':
        flags.unique = true;
        break;
      case 'not null':
        flags.notNull = true;
        break;
      case 'default':
        flags.hasDefault = true;
        break;
      case 'increment':
        flags.increment = true;
        break;
    }
  }
  return flags;
}

/* -------------------------------------------------------------------------
 * Type expression -> short label
 *
 * Compact display for the column 'type' cell. The full type expression
 * may be elaborate (nested objects, polymorphism, etc.); we summarize
 * to a single line. The Inspector panel (future) can show the full
 * detail.
 * ----------------------------------------------------------------------- */

function renderTypeLabel (type: TypeExpression): string {
  switch (type.kind) {
    case 'ScalarType':
      return renderScalarLabel(type);
    case 'NamedTypeReference':
      return type.name;
    case 'ObjectType':
      // Short label -- children below carry leaf detail.
      return type.keyword;
    case 'ArrayType': {
      // Children show the element. Label conveys the array-of shape.
      if (!type.elementType) return type.keyword;
      const inner = renderTypeLabel(type.elementType);
      return `${type.keyword} of ${inner}`;
    }
    case 'TupleType':
      return `tuple (${type.elements.length})`;
    case 'MapType':
      return type.keyword;
    case 'SetType':
      return 'set';
    case 'UnionType':
      return `union [${type.members.map((m) => m.kind === 'NullTypeLiteral' ? 'null' : renderTypeLabel(m as ScalarType)).join(', ')}]`;
    case 'OneOfType':
      return `oneOf (${type.alternatives.length})`;
    case 'AnyOfType':
      return `anyOf (${type.alternatives.length})`;
    case 'AllOfType':
      return `allOf (${type.alternatives.length})`;
    case 'JsonType':
      return type.fields ? `${type.keyword} {…}` : type.keyword;
    default:
      return '';
  }
}

function renderScalarLabel (s: ScalarType): string {
  if (s.params && s.params.length > 0) {
    return `${s.name}(${s.params.join(', ')})`;
  }
  return s.name;
}

/* -------------------------------------------------------------------------
 * Refs
 * ----------------------------------------------------------------------- */

function buildRefLayout (
  ref: RefDeclaration,
  entityByName: Map<string, EntityLayout>,
  index: number,
): RefLayout {
  const source = locateRefEndpoint(ref.spec.source, entityByName);
  const target = locateRefEndpoint(ref.spec.target, entityByName);
  const sourceCardinality = settingValueAsString(ref.settings, 'source');
  const targetCardinality = settingValueAsString(ref.settings, 'target');
  return {
    id: `ref:${index}`,
    operator: ref.spec.operator,
    source,
    target,
    sourceCardinality,
    targetCardinality,
    unresolved: !source || !target,
  };
}

/**
 * Resolve a RefEndpoint to an entity (and optionally a field).
 *
 * The endpoint's `path` is a sequence of PathSegment. The first one or
 * two PathField segments name the entity (with optional container
 * prefix); the remaining segments name the field inside the entity.
 * Composite FK form `entity.(a, b)` carries fields in `compositeFields`
 * and we report only the first as the visual anchor.
 *
 * This is structural resolution, not semantic. Cross-container references
 * via `.[*]` array wildcards aren't dereferenced; we still anchor the
 * line at the entity that owns the source/target field.
 */
function locateRefEndpoint (
  endpoint: { path: { kind: string; name?: string }[]; compositeFields?: string[] },
  entityByName: Map<string, EntityLayout>,
): FieldLocator | undefined {
  if (endpoint.path.length === 0) return undefined;

  const fieldSegments = endpoint.path.filter((s) => s.kind === 'PathField') as { name: string }[];
  if (fieldSegments.length === 0) return undefined;

  // Try increasingly long prefixes against the entity name index.
  // E.g. for `blog_app.posts.author_id`, try `blog_app.posts.author_id`
  // (won't match), then `blog_app.posts` (matches), leaving `author_id`
  // as the field name.
  for (let prefixLen = fieldSegments.length - 1; prefixLen >= 1; prefixLen -= 1) {
    const entityKey = fieldSegments.slice(0, prefixLen).map((s) => s.name).join('.');
    const entity = entityByName.get(entityKey);
    if (entity) {
      const fieldName = endpoint.compositeFields?.[0]
        ?? fieldSegments.slice(prefixLen).map((s) => s.name).join('.');
      return {
        entityId: entity.id,
        fieldName: fieldName || undefined,
      };
    }
  }
  return undefined;
}

/* -------------------------------------------------------------------------
 * Settings helpers
 * ----------------------------------------------------------------------- */

function settingValueAsString (settings: Setting[], name: string): string | undefined {
  const s = settings.find((x) => x.name === name);
  if (!s || !s.value) return undefined;
  switch (s.value.kind) {
    case 'StringValue':
    case 'IdentifierValue':
      return s.value.value;
    case 'NumberValue':
      return s.value.value;
    default:
      return undefined;
  }
}

/* =========================================================================
 * User-overridden positions (drag-to-reposition)
 * ----------------------------------------------------------------------- */

/**
 * Per-entity position override. Keyed by `EntityLayout.id` (which is
 * `containerName.entityName` or just `entityName` for orphans).
 *
 * Positions are in SVG coordinates -- same coordinate system the layout
 * function produces. Storing in SVG units rather than viewport pixels
 * means zoom doesn't affect the stored value: drag at 50% zoom and the
 * stored position is in canvas units, so reloading at 200% zoom still
 * shows the entity at the same canvas point.
 */
export type UserPositions = ReadonlyMap<string, { x: number; y: number }>;

/**
 * Apply user-overridden positions to a freshly built DiagramModel.
 *
 * Returns a new DiagramModel with:
 *   - Entity bounds updated to user-chosen coordinates where overrides
 *     exist. Width/height are kept (they depend on field count and
 *     collapse state, not user choice).
 *   - Container bounds recomputed as the bounding box of the
 *     entities they contain, plus padding for the container's own
 *     header band. So when a user drags an entity inside a container,
 *     the container grows or shifts to stay wrapping its members.
 *   - Top-level diagram width/height recomputed to the union of all
 *     placed elements plus a margin.
 *   - Refs are untouched here -- `RefLine.vue` reads entity bounds at
 *     render time, so refs follow whatever positions the entities end
 *     up at.
 *
 * Pure function: doesn't mutate the input. Cheap enough to call on
 * every drag tick.
 */
export function applyUserPositions (
  diagram: DiagramModel,
  userPositions: UserPositions,
): DiagramModel {
  // Fast path: no overrides at all.
  if (userPositions.size === 0) return diagram;

  // First pass: relocate entities that have an override.
  const newEntities: EntityLayout[] = diagram.entities.map((entity) => {
    const override = userPositions.get(entity.id);
    if (!override) return entity;
    return {
      ...entity,
      bounds: {
        x: override.x,
        y: override.y,
        width: entity.bounds.width,
        height: entity.bounds.height,
      },
    };
  });

  // Index entities by their containerName for the container-recomputation pass.
  const byContainer = new Map<string, EntityLayout[]>();
  for (const e of newEntities) {
    if (!e.containerName) continue;
    const list = byContainer.get(e.containerName) ?? [];
    list.push(e);
    byContainer.set(e.containerName, list);
  }

  // Second pass: recompute container bounds as the bounding box of their
  // members, padded for the header band and inset.
  const newContainers: ContainerLayout[] = diagram.containers.map((container) => {
    const members = byContainer.get(container.name) ?? [];
    if (members.length === 0) {
      // No members -- container keeps original bounds. Could shrink to
      // a minimum, but the natural layout already gave it a sensible
      // header-only size, so we don't disturb it.
      return container;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const m of members) {
      if (m.bounds.x < minX) minX = m.bounds.x;
      if (m.bounds.y < minY) minY = m.bounds.y;
      if (m.bounds.x + m.bounds.width > maxX) maxX = m.bounds.x + m.bounds.width;
      if (m.bounds.y + m.bounds.height > maxY) maxY = m.bounds.y + m.bounds.height;
    }

    // Wrap in padding. The top padding has to include the container's
    // own header band height; the others are uniform.
    const newBounds = {
      x: minX - CONTAINER_PADDING,
      y: minY - CONTAINER_PADDING - CONTAINER_HEADER_HEIGHT,
      width: (maxX - minX) + CONTAINER_PADDING * 2,
      height: (maxY - minY) + CONTAINER_PADDING * 2 + CONTAINER_HEADER_HEIGHT,
    };

    return { ...container, bounds: newBounds };
  });

  // Recompute the overall canvas size as the union of everything placed,
  // plus the outer margin. This grows the scrollable area when the user
  // drags entities beyond the original bounds.
  let canvasMaxX = 0;
  let canvasMaxY = 0;
  for (const c of newContainers) {
    if (c.bounds.x + c.bounds.width > canvasMaxX) canvasMaxX = c.bounds.x + c.bounds.width;
    if (c.bounds.y + c.bounds.height > canvasMaxY) canvasMaxY = c.bounds.y + c.bounds.height;
  }
  for (const e of newEntities) {
    if (e.bounds.x + e.bounds.width > canvasMaxX) canvasMaxX = e.bounds.x + e.bounds.width;
    if (e.bounds.y + e.bounds.height > canvasMaxY) canvasMaxY = e.bounds.y + e.bounds.height;
  }

  return {
    containers: newContainers,
    entities: newEntities,
    refs: diagram.refs,
    width: Math.max(diagram.width, canvasMaxX + CANVAS_MARGIN),
    height: Math.max(diagram.height, canvasMaxY + CANVAS_MARGIN),
  };
}
