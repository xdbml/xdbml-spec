/**
 * Supertype groups (spec §12, new in v0.5).
 *
 * Three things live here:
 *
 *   - Setting normalization. `completeness`, `exclusivity`, `strategy` and
 *     `merge` accept a canonical value and a set of aliases (spec §12.2).
 *     The AST keeps what was written; `supertypeGroupSettings()` returns
 *     the canonical values.
 *   - Member resolution. The supertype and every subtype name an entity by
 *     path, bare (`Person`) or container-qualified (`crm.Person`), with the
 *     same reading as an entity-level `Ref` endpoint (spec §11.16.3).
 *   - The validation rules summarized in spec §12.8, run by `resolveNames()`
 *     on the flattened document so imported and cloned groups are checked
 *     like local ones.
 *
 * Nothing here computes the attributes or keys a subtype would hold in a
 * physical model. A subtype declares its own attributes only; placing the
 * supertype's attributes in stored structures is derivation output (spec
 * §12.5, §12.7). Supertype chains are computed for the structural checks
 * and for tools that display the hierarchy.
 */

import type {
  Diagnostic,
} from './name-resolver.ts';
import type {
  ContainerDeclaration,
  EntityDeclaration,
  Setting,
  Span,
  SupertypeGroupDeclaration,
  SupertypeGroupMember,
  TablePartialDeclaration,
  XDbmlDocument,
} from './ast.ts';
import { versionAtLeast } from './relationships.ts';

/* -------------------------------------------------------------------------
 * Values and aliases (spec §12.2)
 * ----------------------------------------------------------------------- */

export type Completeness = 'total' | 'partial';
export type Exclusivity = 'disjoint' | 'overlapping';
export type MaterializationStrategy = 'preserved_hierarchy' | 'roll_up' | 'roll_down';
export type MergeOption = 'flat' | 'nested';

/**
 * Accepted spellings, keyed by lowercase spelling, mapped to the canonical
 * value. Canonical values map to themselves.
 */
export const SUPERTYPE_GROUP_VALUES = {
  completeness: {
    total: 'total',
    complete: 'total',
    partial: 'partial',
    incomplete: 'partial',
  },
  exclusivity: {
    disjoint: 'disjoint',
    exclusive: 'disjoint',
    overlapping: 'overlapping',
    non_exclusive: 'overlapping',
  },
  strategy: {
    preserved_hierarchy: 'preserved_hierarchy',
    class_table: 'preserved_hierarchy',
    joined: 'preserved_hierarchy',
    roll_up: 'roll_up',
    single_table: 'roll_up',
    roll_down: 'roll_down',
    concrete_table: 'roll_down',
    table_per_class: 'roll_down',
  },
  merge: {
    flat: 'flat',
    flat_with_discriminator: 'flat',
    nested: 'nested',
  },
} as const;

export type SupertypeGroupValueSetting = keyof typeof SUPERTYPE_GROUP_VALUES;

const CANONICAL_VALUES: Record<SupertypeGroupValueSetting, string[]> = {
  completeness: ['total', 'partial'],
  exclusivity: ['disjoint', 'overlapping'],
  strategy: ['preserved_hierarchy', 'roll_up', 'roll_down'],
  merge: ['flat', 'nested'],
};

/** The canonical value for a spelling, or undefined when it is not recognized. */
export function canonicalSupertypeGroupValue (
  setting: SupertypeGroupValueSetting,
  raw: string,
): string | undefined {
  const table = SUPERTYPE_GROUP_VALUES[setting] as Record<string, string>;
  const key = raw.toLowerCase();
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/** The text of an identifier or string setting value. */
function settingText (s: Setting | undefined): string | undefined {
  if (!s || !s.value) return undefined;
  if (s.value.kind === 'IdentifierValue' || s.value.kind === 'StringValue') return s.value.value;
  return undefined;
}

function findSetting (settings: ReadonlyArray<Setting>, name: string): Setting | undefined {
  return settings.find((s) => s.name === name);
}

/** A group's settings with canonical values. Unrecognized values are left out. */
export interface SupertypeGroupSettings {
  supertype?: string;
  completeness?: Completeness;
  exclusivity?: Exclusivity;
  strategy?: MaterializationStrategy;
  merge?: MergeOption;
  discriminator?: string;
  note?: string;
}

export function supertypeGroupSettings (decl: SupertypeGroupDeclaration): SupertypeGroupSettings {
  const out: SupertypeGroupSettings = {};
  const supertype = settingText(findSetting(decl.settings, 'supertype'));
  if (supertype) out.supertype = supertype;
  for (const key of ['completeness', 'exclusivity', 'strategy', 'merge'] as const) {
    const raw = settingText(findSetting(decl.settings, key));
    const value = raw === undefined ? undefined : canonicalSupertypeGroupValue(key, raw);
    if (value) (out as Record<string, string>)[key] = value;
  }
  const discriminator = settingText(findSetting(decl.settings, 'discriminator'));
  if (discriminator) out.discriminator = discriminator;
  const note = settingText(findSetting(decl.settings, 'note'));
  if (note !== undefined) out.note = note;
  return out;
}

/** A subtype member's own `strategy` (spec §12.7.4), canonical, or undefined. */
export function subtypeStrategy (member: SupertypeGroupMember): MaterializationStrategy | undefined {
  const raw = settingText(findSetting(member.settings, 'strategy'));
  if (raw === undefined) return undefined;
  return canonicalSupertypeGroupValue('strategy', raw) as MaterializationStrategy | undefined;
}

/* -------------------------------------------------------------------------
 * Entity index and member resolution
 * ----------------------------------------------------------------------- */

interface EntityIndex {
  /** Entity id (container-qualified where declared in a container) -> declaration. */
  byId: Map<string, EntityDeclaration>;
  /** Bare entity name -> ids of every entity with that name. */
  byBare: Map<string, string[]>;
  /** Names of non-entity constructs, for a helpful message. */
  otherKinds: Map<string, string>;
  /** TablePartial declarations by name, for attribute collection. */
  partials: Map<string, TablePartialDeclaration>;
}

function buildIndex (doc: XDbmlDocument): EntityIndex {
  const byId = new Map<string, EntityDeclaration>();
  const byBare = new Map<string, string[]>();
  const otherKinds = new Map<string, string>();
  const partials = new Map<string, TablePartialDeclaration>();
  const addEntity = (e: EntityDeclaration, container?: string): void => {
    const id = container ? `${container}.${e.name}` : e.name;
    if (byId.has(id)) return;
    byId.set(id, e);
    const list = byBare.get(e.name) ?? [];
    list.push(id);
    byBare.set(e.name, list);
  };
  const addOther = (name: string, kind: string): void => {
    if (!otherKinds.has(name)) otherKinds.set(name, kind);
  };
  for (const stmt of doc.statements) {
    switch (stmt.kind) {
      case 'EntityDeclaration':
        addEntity(stmt);
        break;
      case 'ContainerDeclaration': {
        const c = stmt as ContainerDeclaration;
        addOther(c.name, 'Container');
        for (const item of c.body) {
          if (item.kind === 'EntityDeclaration') addEntity(item, c.name);
          else if (item.kind === 'ViewDeclaration') addOther(`${c.name}.${item.name}`, 'View');
          else if (item.kind === 'EdgeDeclaration') addOther(`${c.name}.${item.name}`, 'Edge');
          else if (item.kind === 'EnumDeclaration') addOther(`${c.name}.${item.name}`, 'Enum');
        }
        break;
      }
      case 'ViewDeclaration': addOther(stmt.name, 'View'); break;
      case 'EdgeDeclaration': addOther(stmt.name, 'Edge'); break;
      case 'TypeDeclaration': addOther(stmt.name, 'Type'); break;
      case 'EnumDeclaration': addOther(stmt.name, 'Enum'); break;
      case 'TableGroupDeclaration': addOther(stmt.name, 'TableGroup'); break;
      case 'TablePartialDeclaration':
        addOther(stmt.name, 'TablePartial');
        if (!partials.has(stmt.name)) partials.set(stmt.name, stmt);
        break;
      default:
        break;
    }
  }
  return { byId, byBare, otherKinds, partials };
}

type Resolution =
  | { ok: true; id: string }
  | { ok: false; reason: 'unresolved' }
  | { ok: false; reason: 'ambiguous'; candidates: string[] }
  | { ok: false; reason: 'not-entity'; kind: string };

function resolveEntityPath (path: string, index: EntityIndex): Resolution {
  if (index.byId.has(path)) return { ok: true, id: path };
  if (!path.includes('.')) {
    const ids = index.byBare.get(path) ?? [];
    if (ids.length === 1) return { ok: true, id: ids[0] };
    if (ids.length > 1) return { ok: false, reason: 'ambiguous', candidates: ids };
  }
  const kind = index.otherKinds.get(path);
  if (kind) return { ok: false, reason: 'not-entity', kind };
  return { ok: false, reason: 'unresolved' };
}

/** One group with its members resolved to entity ids where they resolve. */
export interface ResolvedSupertypeGroup {
  declaration: SupertypeGroupDeclaration;
  settings: SupertypeGroupSettings;
  /** Entity id of the supertype, when it resolves. */
  supertype?: string;
  subtypes: Array<{
    member: SupertypeGroupMember;
    /** Entity id of the subtype, when it resolves. */
    entity?: string;
    /** The member's own strategy, canonical, when stated and recognized. */
    strategy?: MaterializationStrategy;
  }>;
}

function groupsOf (doc: XDbmlDocument): SupertypeGroupDeclaration[] {
  return doc.statements.filter(
    (s): s is SupertypeGroupDeclaration => s.kind === 'SupertypeGroupDeclaration',
  );
}

function resolveWith (doc: XDbmlDocument, index: EntityIndex): ResolvedSupertypeGroup[] {
  return groupsOf(doc).map((decl) => {
    const settings = supertypeGroupSettings(decl);
    const sup = settings.supertype ? resolveEntityPath(settings.supertype, index) : undefined;
    return {
      declaration: decl,
      settings,
      supertype: sup && sup.ok ? sup.id : undefined,
      subtypes: decl.members.map((member) => {
        const r = resolveEntityPath(member.name, index);
        return {
          member,
          entity: r.ok ? r.id : undefined,
          strategy: subtypeStrategy(member),
        };
      }),
    };
  });
}

/**
 * Every SupertypeGroup of a document with its members resolved. Pass the
 * flattened document (see `flatten()`) so imported and cloned declarations
 * are visible. Entity ids are container-qualified for entities declared in
 * a Container, bare otherwise.
 */
export function resolveSupertypeGroups (doc: XDbmlDocument): ResolvedSupertypeGroup[] {
  return resolveWith(doc, buildIndex(doc));
}

/**
 * For each entity that is a subtype, its chain of supertypes, nearest
 * first: `Employee -> [Person, Party]`. When an entity is listed as a
 * subtype in several groups (an error), the first group wins; a chain that
 * loops stops before repeating an entity.
 */
export function supertypeChains (doc: XDbmlDocument): Map<string, string[]> {
  return chainsFrom(parentMap(resolveSupertypeGroups(doc)));
}

function parentMap (groups: ReadonlyArray<ResolvedSupertypeGroup>): Map<string, string> {
  const parent = new Map<string, string>();
  for (const g of groups) {
    if (!g.supertype) continue;
    for (const s of g.subtypes) {
      if (!s.entity || s.entity === g.supertype) continue;
      if (!parent.has(s.entity)) parent.set(s.entity, g.supertype);
    }
  }
  return parent;
}

function chainsFrom (parent: Map<string, string>): Map<string, string[]> {
  const chains = new Map<string, string[]>();
  for (const start of parent.keys()) {
    const chain: string[] = [];
    const seen = new Set<string>([start]);
    let cur = parent.get(start);
    while (cur !== undefined && !seen.has(cur)) {
      chain.push(cur);
      seen.add(cur);
      cur = parent.get(cur);
    }
    chains.set(start, chain);
  }
  return chains;
}

/* -------------------------------------------------------------------------
 * Attributes an entity declares (for the redeclaration rule, spec §12.5)
 * ----------------------------------------------------------------------- */

interface DeclaredAttribute {
  name: string;
  span: Span;
  /** Set when the attribute arrives through a TablePartial injection. */
  viaPartial?: string;
}

function declaredAttributes (entity: EntityDeclaration, index: EntityIndex): DeclaredAttribute[] {
  const out: DeclaredAttribute[] = [];
  for (const item of entity.body) {
    if (item.kind === 'FieldDeclaration') {
      out.push({ name: item.name, span: item.span });
    } else if (item.kind === 'PartialInjection') {
      const partial = index.partials.get(item.partialName);
      if (!partial) continue;
      for (const p of partial.body) {
        if (p.kind === 'FieldDeclaration') {
          out.push({ name: p.name, span: item.span, viaPartial: item.partialName });
        }
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Validation (spec §12.8)
 * ----------------------------------------------------------------------- */

function listValues (setting: SupertypeGroupValueSetting): string {
  const canonical = CANONICAL_VALUES[setting];
  const aliases = Object.keys(SUPERTYPE_GROUP_VALUES[setting]).filter((k) => !canonical.includes(k));
  const main = canonical.length === 2 ? `${canonical[0]} or ${canonical[1]}` : `${canonical.slice(0, -1).join(', ')} or ${canonical[canonical.length - 1]}`;
  return aliases.length > 0 ? `${main} (aliases: ${aliases.join(', ')})` : main;
}

function describeFailure (what: string, path: string, r: Resolution): string {
  if (r.ok) return '';
  switch (r.reason) {
    case 'ambiguous':
      return `${what} '${path}' matches entities in several containers (${r.candidates.join(', ')}); qualify it with its container.`;
    case 'not-entity':
      return `${what} '${path}' names a ${r.kind}. A supertype group relates entities only (spec §12.1).`;
    default:
      return `${what} '${path}' does not resolve to an entity.`;
  }
}

/**
 * The rules of spec §12.8. Run by `resolveNames()` on the flattened
 * document; exported for callers that check groups on their own.
 */
export function checkSupertypeGroups (doc: XDbmlDocument): Diagnostic[] {
  const groups = groupsOf(doc);
  if (groups.length === 0) return [];
  const diagnostics: Diagnostic[] = [];
  const index = buildIndex(doc);
  const resolved = resolveWith(doc, index);

  // Section 4: the construct requires a document declaring 0.5 or later.
  if (!versionAtLeast(doc, '0.5')) {
    diagnostics.push({
      severity: 'error',
      code: 'construct-requires-version',
      message: "SupertypeGroup requires a document declaring 'xdbml: 0.5' or later.",
      span: doc.version ? doc.version.span : groups[0].span,
    });
  }

  // Group names are unique among supertype groups (spec §12.1).
  const names = new Set<string>();
  for (const g of groups) {
    if (names.has(g.name)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-declaration',
        message: `Duplicate SupertypeGroup declaration '${g.name}'. Each supertype group must have a unique name.`,
        span: g.span,
      });
    }
    names.add(g.name);
  }

  for (const r of resolved) {
    const g = r.declaration;

    // Values of the group's settings (spec §12.2).
    for (const key of ['completeness', 'exclusivity', 'strategy', 'merge'] as const) {
      const s = findSetting(g.settings, key);
      if (!s) continue;
      const raw = settingText(s);
      if (raw === undefined || !canonicalSupertypeGroupValue(key, raw)) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-supertype-group-value',
          message: `Invalid ${key} ${raw === undefined ? 'value' : `'${raw}'`} on SupertypeGroup '${g.name}'. Expected ${listValues(key)}.`,
          span: s.span,
        });
      }
    }

    // The supertype (spec §12.1).
    const supSetting = findSetting(g.settings, 'supertype');
    const supPath = settingText(supSetting);
    if (!supSetting || supPath === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-supertype',
        message: `SupertypeGroup '${g.name}' names no supertype. Add a 'supertype:' setting naming an entity.`,
        span: supSetting ? supSetting.span : g.span,
      });
    } else {
      const res = resolveEntityPath(supPath, index);
      if (!res.ok) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-supertype-group-member',
          message: describeFailure('Supertype', supPath, res),
          span: supSetting.span,
        });
      }
    }

    // Discriminator on an overlapping group (spec §12.7.3).
    const disc = findSetting(g.settings, 'discriminator');
    if (disc && r.settings.exclusivity === 'overlapping') {
      diagnostics.push({
        severity: 'error',
        code: 'discriminator-on-overlapping-group',
        message: `SupertypeGroup '${g.name}' is overlapping, so one instance may belong to several subtypes and a single discriminator attribute cannot record its membership (spec §12.7.3).`,
        span: disc.span,
      });
    }

    // Empty group (spec §12.1): valid, reported as a warning.
    if (g.members.length === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'empty-supertype-group',
        message: `SupertypeGroup '${g.name}' lists no subtype yet.`,
        span: g.span,
      });
    }

    // Members.
    const seenInGroup = new Set<string>();
    for (const s of r.subtypes) {
      const m = s.member;
      const stratSetting = findSetting(m.settings, 'strategy');
      if (stratSetting) {
        const raw = settingText(stratSetting);
        if (raw === undefined || !canonicalSupertypeGroupValue('strategy', raw)) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-supertype-group-value',
            message: `Invalid strategy ${raw === undefined ? 'value' : `'${raw}'`} on subtype '${m.name}' of SupertypeGroup '${g.name}'. Expected ${listValues('strategy')}.`,
            span: stratSetting.span,
          });
        }
      }
      const res = resolveEntityPath(m.name, index);
      if (!res.ok) {
        diagnostics.push({
          severity: 'error',
          code: 'unresolved-supertype-group-member',
          message: describeFailure('Subtype', m.name, res),
          span: m.span,
        });
        continue;
      }
      if (seenInGroup.has(res.id)) {
        diagnostics.push({
          severity: 'error',
          code: 'duplicate-subtype',
          message: `'${m.name}' is listed twice in SupertypeGroup '${g.name}'.`,
          span: m.span,
        });
        continue;
      }
      seenInGroup.add(res.id);
      if (r.supertype && res.id === r.supertype) {
        diagnostics.push({
          severity: 'error',
          code: 'supertype-is-subtype',
          message: `'${m.name}' is the supertype of SupertypeGroup '${g.name}' and cannot also be one of its subtypes.`,
          span: m.span,
        });
      }
    }

    // Merge with nothing to apply to (spec §12.7.2).
    const merge = findSetting(g.settings, 'merge');
    if (merge && r.settings.merge) {
      const rollUp = r.settings.strategy === 'roll_up' || r.subtypes.some((s) => s.strategy === 'roll_up');
      if (!rollUp) {
        diagnostics.push({
          severity: 'warning',
          code: 'merge-without-roll-up',
          message: `'merge' on SupertypeGroup '${g.name}' applies to roll-up, but neither the group nor any subtype uses 'strategy: roll_up'.`,
          span: merge.span,
        });
      }
    }
  }

  // Single inheritance: an entity is a subtype in one group only (spec §12.4.3).
  const subtypeHome = new Map<string, string>();
  for (const r of resolved) {
    for (const s of r.subtypes) {
      if (!s.entity || s.entity === r.supertype) continue;
      const home = subtypeHome.get(s.entity);
      if (home === undefined) {
        subtypeHome.set(s.entity, r.declaration.name);
      } else if (home !== r.declaration.name) {
        diagnostics.push({
          severity: 'error',
          code: 'subtype-in-multiple-groups',
          message: `'${s.member.name}' is already a subtype in SupertypeGroup '${home}'. An entity is a subtype in one group only (spec §12.4.3).`,
          span: s.member.span,
        });
      }
    }
  }

  // Cycles across levels (spec §12.4.4).
  const parent = parentMap(resolved);
  const memberSpan = new Map<string, Span>();
  for (const r of resolved) {
    for (const s of r.subtypes) {
      if (s.entity && !memberSpan.has(s.entity)) memberSpan.set(s.entity, s.member.span);
    }
  }
  const reported = new Set<string>();
  for (const start of parent.keys()) {
    const path: string[] = [start];
    const seen = new Set<string>([start]);
    let cur = parent.get(start);
    while (cur !== undefined && !seen.has(cur)) {
      path.push(cur);
      seen.add(cur);
      cur = parent.get(cur);
    }
    if (cur !== start) continue;
    const key = [...path].sort().join('|');
    if (reported.has(key)) continue;
    reported.add(key);
    diagnostics.push({
      severity: 'error',
      code: 'supertype-cycle',
      message: `Supertype groups form a cycle: ${[...path, start].join(' -> ')}. An entity cannot be its own supertype (spec §12.4.4).`,
      span: memberSpan.get(start) ?? resolved[0].declaration.span,
    });
  }

  // Redeclaration of a supertype's attribute (spec §12.5).
  const chains = chainsFrom(parent);
  for (const [entityId, chain] of chains) {
    const entity = index.byId.get(entityId);
    if (!entity || chain.length === 0) continue;
    const inherited = new Map<string, string>();
    for (const ancestorId of chain) {
      const ancestor = index.byId.get(ancestorId);
      if (!ancestor) continue;
      for (const a of declaredAttributes(ancestor, index)) {
        if (!inherited.has(a.name)) inherited.set(a.name, ancestorId);
      }
    }
    for (const a of declaredAttributes(entity, index)) {
      const owner = inherited.get(a.name);
      if (owner === undefined) continue;
      const via = a.viaPartial ? ` (through TablePartial '${a.viaPartial}')` : '';
      diagnostics.push({
        severity: 'error',
        code: 'supertype-attribute-redeclared',
        message: `'${entityId}' declares '${a.name}'${via}, which its supertype '${owner}' already declares. A subtype declares only its own attributes (spec §12.5).`,
        span: a.span,
      });
    }
  }

  return diagnostics;
}
