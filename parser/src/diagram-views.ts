/**
 * Diagram views (spec §18, defined in v0.6.3).
 *
 * A diagram view is a named subset of the model's diagram. Its body lists
 * categories of elements; `diagramViewMembers()` turns those lists into the
 * members of §18.2, and `checkDiagramViews()` reports the conditions of
 * §18.6. Both take a document and flatten it, so elements imported from
 * other files count like the ones declared in place (§18.3).
 *
 * Element ids follow the renderer and the supertype group resolver: an
 * entity or database view inside a Container is `container.name`, one at
 * the top level is its name as declared, which for the DBML form
 * `Table core.users` is `core.users` in the implicit Container `core`.
 */

import type {
  ContainerDeclaration,
  DiagramViewCategory,
  DiagramViewCategoryName,
  DiagramViewDeclaration,
  DiagramViewItem,
  EntityDeclaration,
  ViewDeclaration,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { flatten } from './module-resolver.ts';
import { resolveSupertypeGroups } from './supertypes.ts';

/** The members of a diagram view (spec §18.2) and what a renderer draws with them (§18.4). */
export interface DiagramViewMembers {
  /** The diagram view these members belong to. */
  declaration: DiagramViewDeclaration;
  /** Ids of the member entities, in declaration order. */
  entities: string[];
  /** Ids of the member database views, in declaration order. */
  views: string[];
  /** Names of the member sticky notes, in declaration order. */
  notes: string[];
  /** Containers holding at least one member: their frames surround those members only. */
  containers: string[];
  /** TableGroups with at least one member entity, named in the diagram view or not. */
  tableGroups: string[];
  /** Supertype groups whose supertype and at least one subtype are members (§12.9). */
  supertypeGroups: string[];
}

/** Every DiagramView of a document, in declaration order, after module resolution. */
export function diagramViews (doc: XDbmlDocument): DiagramViewDeclaration[] {
  return flatten(doc).statements.filter(
    (s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration',
  );
}

/**
 * The members of the diagram view named `name`, or undefined when the
 * document declares none of that name. With two of one name (an error),
 * the first one counts.
 */
export function diagramViewMembers (doc: XDbmlDocument, name: string): DiagramViewMembers | undefined {
  const flat = flatten(doc);
  const decl = flat.statements.find(
    (s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration' && s.name === name,
  );
  if (!decl) return undefined;
  return computeMembers(decl, buildIndex(flat), flat);
}

/* -------------------------------------------------------------- index */

type ElementKind = 'entity' | 'view' | 'container' | 'tablegroup' | 'supertypegroup' | 'note' | 'edge';

interface Element {
  kind: ElementKind;
  /** `container.name`, or the declared name at the top level. */
  id: string;
  /** Bare name: the last segment of the id for entities and database views. */
  name: string;
  /** Container, explicit or implied by a qualified top-level name. */
  container?: string;
  /** True when declared outside any Container, under its bare name (§18.3). */
  topLevel: boolean;
}

interface Index {
  elements: Element[];
  byKindId: Map<string, Element>;
  /** Container name to the ids of its entities and database views, in order. */
  entitiesOf: Map<string, string[]>;
  viewsOf: Map<string, string[]>;
  /** Alias to entity id, for the aliases that name something (§7.4). */
  aliases: Map<string, string>;
  /** TableGroup name to its member names as written. */
  tableGroupMembers: Map<string, string[]>;
}

const key = (kind: ElementKind, id: string): string => `${kind}:${id}`;

function buildIndex (doc: XDbmlDocument): Index {
  const elements: Element[] = [];
  const byKindId = new Map<string, Element>();
  const entitiesOf = new Map<string, string[]>();
  const viewsOf = new Map<string, string[]>();
  const tableGroupMembers = new Map<string, string[]>();
  const aliasCandidates = new Map<string, string | null>();
  const takenNames = new Set<string>();

  const add = (kind: ElementKind, id: string, name: string, container: string | undefined, topLevel: boolean): void => {
    if (byKindId.has(key(kind, id))) return;
    const el: Element = { kind, id, name, container, topLevel };
    elements.push(el);
    byKindId.set(key(kind, id), el);
    if (container && (kind === 'entity' || kind === 'view')) {
      const map = kind === 'entity' ? entitiesOf : viewsOf;
      const list = map.get(container) ?? [];
      list.push(id);
      map.set(container, list);
      if (!byKindId.has(key('container', container))) {
        add('container', container, container, undefined, true);
      }
    }
  };
  const addBoxed = (kind: 'entity' | 'view', decl: EntityDeclaration | ViewDeclaration, container?: string): void => {
    let id: string;
    let bare: string;
    let owner = container;
    if (container) {
      id = `${container}.${decl.name}`;
      bare = decl.name;
    } else {
      id = decl.name;
      const dot = decl.name.lastIndexOf('.');
      bare = dot > 0 ? decl.name.slice(dot + 1) : decl.name;
      owner = dot > 0 ? decl.name.slice(0, dot) : undefined;
    }
    add(kind, id, bare, owner, owner === undefined);
    takenNames.add(bare);
    if (kind === 'entity') {
      const alias = (decl as EntityDeclaration).alias;
      if (alias) aliasCandidates.set(alias, aliasCandidates.has(alias) ? null : id);
    }
  };

  for (const stmt of doc.statements) {
    switch (stmt.kind) {
      case 'ContainerDeclaration': {
        const c = stmt as ContainerDeclaration;
        add('container', c.name, c.name, undefined, true);
        takenNames.add(c.name);
        for (const item of c.body) {
          if (item.kind === 'EntityDeclaration') addBoxed('entity', item, c.name);
          else if (item.kind === 'ViewDeclaration') addBoxed('view', item, c.name);
          else if (item.kind === 'EdgeDeclaration') add('edge', `${c.name}.${item.name}`, item.name, c.name, false);
        }
        break;
      }
      case 'EntityDeclaration': addBoxed('entity', stmt); break;
      case 'ViewDeclaration': addBoxed('view', stmt); break;
      case 'EdgeDeclaration': add('edge', stmt.name, stmt.name, undefined, true); break;
      case 'TableGroupDeclaration':
        add('tablegroup', stmt.name, stmt.name, undefined, true);
        if (!tableGroupMembers.has(stmt.name)) tableGroupMembers.set(stmt.name, stmt.members);
        break;
      case 'SupertypeGroupDeclaration': add('supertypegroup', stmt.name, stmt.name, undefined, true); break;
      case 'NoteDeclaration': if (stmt.name) add('note', stmt.name, stmt.name, undefined, true); break;
      default: break;
    }
  }
  // An alias that repeats the name of an entity or a Container, or that two
  // entities declare, names nothing (§7.4).
  const aliases = new Map<string, string>();
  for (const [alias, id] of aliasCandidates) {
    if (id !== null && !takenNames.has(alias)) aliases.set(alias, id);
  }
  return { elements, byKindId, entitiesOf, viewsOf, aliases, tableGroupMembers };
}

/* --------------------------------------------------------- resolution */

const CATEGORY_KIND: Record<DiagramViewCategoryName, ElementKind> = {
  Tables: 'entity',
  Views: 'view',
  Containers: 'container',
  TableGroups: 'tablegroup',
  SupertypeGroups: 'supertypegroup',
  Notes: 'note',
};

const KIND_CATEGORY: Partial<Record<ElementKind, DiagramViewCategoryName>> = {
  entity: 'Tables',
  view: 'Views',
  container: 'Containers',
  tablegroup: 'TableGroups',
  supertypegroup: 'SupertypeGroups',
  note: 'Notes',
};

const KIND_LABEL: Record<ElementKind, string> = {
  entity: 'an entity',
  view: 'a database view',
  container: 'a Container',
  tablegroup: 'a TableGroup',
  supertypegroup: 'a supertype group',
  note: 'a sticky note',
  edge: 'an Edge',
};

type Resolution =
  | { ok: true; id: string }
  | { ok: false; reason: 'unresolved' }
  | { ok: false; reason: 'ambiguous'; candidates: string[] }
  | { ok: false; reason: 'other-kind'; kind: ElementKind };

/**
 * Resolve a name of one kind (spec §18.3). A qualified name names the
 * element with that id. An unqualified name names the element declared
 * outside any Container under that name, if any, and otherwise the one
 * element of that name inside a Container. Under Tables, an alias names
 * its entity.
 */
function resolveName (name: string, kind: ElementKind, index: Index): Resolution {
  const direct = index.byKindId.get(key(kind, name));
  if (direct) return { ok: true, id: direct.id };
  if (!name.includes('.') && (kind === 'entity' || kind === 'view')) {
    const top = index.elements.find((e) => e.kind === kind && e.topLevel && e.name === name);
    if (top) return { ok: true, id: top.id };
    const inside = index.elements.filter((e) => e.kind === kind && e.name === name);
    if (inside.length === 1) return { ok: true, id: inside[0].id };
    if (inside.length > 1) return { ok: false, reason: 'ambiguous', candidates: inside.map((e) => e.id) };
  }
  if (kind === 'entity') {
    const aliased = index.aliases.get(name);
    if (aliased) return { ok: true, id: aliased };
  }
  for (const other of ['entity', 'view', 'container', 'tablegroup', 'supertypegroup', 'note', 'edge'] as ElementKind[]) {
    if (other === kind) continue;
    if (resolveSimple(name, other, index)) return { ok: false, reason: 'other-kind', kind: other };
  }
  return { ok: false, reason: 'unresolved' };
}

function resolveSimple (name: string, kind: ElementKind, index: Index): boolean {
  if (index.byKindId.has(key(kind, name))) return true;
  if (!name.includes('.')) return index.elements.some((e) => e.kind === kind && e.name === name);
  return false;
}

/** The categories of a diagram view, with a body-level `*` read as `*` in every category (§28.8). */
function effectiveCategories (decl: DiagramViewDeclaration): Map<DiagramViewCategoryName, { wildcard: boolean; items: DiagramViewItem[] }> {
  const out = new Map<DiagramViewCategoryName, { wildcard: boolean; items: DiagramViewItem[] }>();
  if (decl.wildcardBody) {
    for (const name of Object.keys(CATEGORY_KIND) as DiagramViewCategoryName[]) {
      out.set(name, { wildcard: true, items: [] });
    }
    return out;
  }
  // A category written twice is reported by checkDiagramViews(); its lists combine.
  for (const c of decl.categories) {
    const prev = out.get(c.category);
    out.set(c.category, {
      wildcard: (prev?.wildcard ?? false) || c.wildcard,
      items: [...(prev?.items ?? []), ...c.items],
    });
  }
  return out;
}

function computeMembers (decl: DiagramViewDeclaration, index: Index, doc: XDbmlDocument): DiagramViewMembers {
  const cats = effectiveCategories(decl);
  const all = (kind: ElementKind): string[] => index.elements.filter((e) => e.kind === kind).map((e) => e.id);
  const named = (category: DiagramViewCategoryName): Set<string> => {
    const c = cats.get(category);
    if (!c) return new Set();
    if (c.wildcard) return new Set(all(CATEGORY_KIND[category]));
    const ids = new Set<string>();
    for (const item of c.items) {
      const r = resolveName(item.name, CATEGORY_KIND[category], index);
      if (r.ok) ids.add(r.id);
    }
    return ids;
  };

  const entities = named('Tables');
  const views = named('Views');

  // Rule 2: a listed Container contributes its entities and its database
  // views, each list narrowed separately to the names under Tables or Views
  // when they name at least one of the Container's own.
  for (const container of named('Containers')) {
    const ownEntities = index.entitiesOf.get(container) ?? [];
    if (!ownEntities.some((id) => entities.has(id))) ownEntities.forEach((id) => entities.add(id));
    const ownViews = index.viewsOf.get(container) ?? [];
    if (!ownViews.some((id) => views.has(id))) ownViews.forEach((id) => views.add(id));
  }

  // Rule 3: each named TableGroup contributes all of its members.
  for (const group of named('TableGroups')) {
    for (const member of index.tableGroupMembers.get(group) ?? []) {
      const r = resolveName(member, 'entity', index);
      if (r.ok) entities.add(r.id);
    }
  }

  // Rule 4: each named supertype group contributes its supertype and subtypes.
  const groups = resolveSupertypeGroups(doc);
  const namedGroups = named('SupertypeGroups');
  for (const g of groups) {
    if (!namedGroups.has(g.declaration.name)) continue;
    if (g.supertype) entities.add(g.supertype);
    for (const s of g.subtypes) if (s.entity) entities.add(s.entity);
  }

  const notes = named('Notes');

  const ordered = (kind: ElementKind, set: Set<string>): string[] => all(kind).filter((id) => set.has(id));
  const memberEntities = ordered('entity', entities);
  const memberViews = ordered('view', views);
  const boxed = new Set([...memberEntities, ...memberViews]);

  const containers = all('container').filter((c) =>
    [...(index.entitiesOf.get(c) ?? []), ...(index.viewsOf.get(c) ?? [])].some((id) => boxed.has(id)),
  );
  const tableGroups = all('tablegroup').filter((g) =>
    (index.tableGroupMembers.get(g) ?? []).some((m) => {
      const r = resolveName(m, 'entity', index);
      return r.ok && entities.has(r.id);
    }),
  );
  const supertypeGroups = groups
    .filter((g) => g.supertype && entities.has(g.supertype) && g.subtypes.some((s) => s.entity && entities.has(s.entity)))
    .map((g) => g.declaration.name);

  return {
    declaration: decl,
    entities: memberEntities,
    views: memberViews,
    notes: ordered('note', notes),
    containers,
    tableGroups,
    supertypeGroups: [...new Set(supertypeGroups)],
  };
}

/* --------------------------------------------------------- diagnostics */

/** The conditions of spec §18.6 that a parse leaves to name resolution. */
export function checkDiagramViews (doc: XDbmlDocument): Diagnostic[] {
  const views = doc.statements.filter(
    (s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration',
  );
  if (views.length === 0) return [];
  const index = buildIndex(doc);
  const diagnostics: Diagnostic[] = [];
  const declared = !!doc.version;
  const seen = new Set<string>();

  for (const view of views) {
    if (seen.has(view.name)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-diagram-view',
        message: `A diagram view named '${view.name}' is already declared. Diagram view names are unique (spec §18.1).`,
        span: view.span,
      });
    }
    seen.add(view.name);

    const written = new Map<DiagramViewCategoryName, DiagramViewCategory>();
    for (const c of view.categories) {
      const first = written.get(c.category);
      if (first) {
        const same = first.keyword.toLowerCase() === c.keyword.toLowerCase();
        diagnostics.push({
          severity: declared ? 'error' : 'warning',
          code: 'duplicate-diagram-view-category',
          message: same
            ? `Diagram view '${view.name}' writes ${c.keyword} twice. Write each category once (spec §18.1).`
            : `Diagram view '${view.name}' writes both ${first.keyword} and ${c.keyword}, which are one ` +
              'category: Schemas is the DBML name of Containers (spec §18.1).',
          span: c.span,
        });
      } else {
        written.set(c.category, c);
      }

      // §18.5: Containers, Views and SupertypeGroups are xDBML extensions.
      if (!declared && c.keyword.toLowerCase() !== 'schemas'
        && (c.category === 'Containers' || c.category === 'Views' || c.category === 'SupertypeGroups')) {
        diagnostics.push({
          severity: 'error',
          code: 'construct-requires-version',
          message: `The ${c.keyword} category of a diagram view is an xDBML extension and needs a version ` +
            'declaration such as xdbml: 0.6 at the top of the document' +
            (c.category === 'Containers' ? ', or the DBML name Schemas' : '') + ' (spec §18.5).',
          span: c.span,
        });
      }

      if (c.wildcard) continue;
      for (const item of c.items) {
        const r = resolveName(item.name, CATEGORY_KIND[c.category], index);
        if (r.ok) continue;
        if (r.reason === 'ambiguous') {
          diagnostics.push({
            severity: 'error',
            code: 'ambiguous-diagram-view-name',
            message: `'${item.name}' under ${c.keyword} matches ${r.candidates.map((x) => `'${x}'`).join(' and ')}, ` +
              'and none is declared outside a Container: write the qualified name (spec §18.3).',
            span: item.span,
          });
        } else if (r.reason === 'other-kind') {
          const right = KIND_CATEGORY[r.kind];
          diagnostics.push({
            severity: 'error',
            code: 'diagram-view-wrong-category',
            message: `'${item.name}' under ${c.keyword} is ${KIND_LABEL[r.kind]}` +
              (right
                ? `: list it under ${right} (spec §18.3).`
                : ', which appears in a diagram view when both of its ends do and is never listed (spec §18.1, §18.4).'),
            span: item.span,
          });
        } else {
          diagnostics.push({
            severity: 'error',
            code: 'unresolved-diagram-view-name',
            message: `'${item.name}' under ${c.keyword} matches no ${KIND_LABEL[CATEGORY_KIND[c.category]].replace(/^an? /, '')} ` +
              'in the project (spec §18.3).',
            span: item.span,
          });
        }
      }
    }
  }
  return diagnostics;
}
