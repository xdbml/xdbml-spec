/**
 * Data lineage (spec §27, v0.7).
 *
 * A `Dep` declaration (`DepDeclaration`) and an inline `dep` setting (a
 * `DepValue` in the settings of an entity, a View or a field) both state
 * that one element is computed from another. `collectLineage()` gathers
 * them into one list, in the order a diagram numbers them, so the renderer,
 * the playground and any generator agree on what `dep:<n>` names.
 *
 * `checkLineage()` holds the rules of §27.4 and the validation summary of
 * §27.12 that the grammar cannot express. It takes the endpoint resolver as
 * an argument: name resolution owns the symbol table and the walk into
 * nested types, and calls this module from `resolveNames()`.
 */

import type {
  DepDeclaration,
  DepValue,
  EntityDeclaration,
  FieldDeclaration,
  PathSegment,
  RefEndpoint,
  Setting,
  SettingValue,
  Span,
  TopLevelStatement,
  TypeExpression,
  ViewDeclaration,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { splitName } from './names.ts';
import { pathToString, versionAtLeast } from './relationships.ts';

/* -------------------------------------------------------------------------
 * Gathering
 * ----------------------------------------------------------------------- */

/** One Dep: a declaration, or an inline `dep` setting. */
export interface Lineage {
  /** `dep:<n>`: the declarations in document order, then the inline settings. */
  id: string;
  /** The Dep's name; an inline `dep` has none. */
  name?: string;
  /**
   * The Dep's settings with their precedence applied (§27.2, §27.3): the
   * brackets, then the body of a block, which takes precedence. An inline
   * `dep` has none.
   */
  settings: Setting[];
  dependencies: LineageDependency[];
  /** The declaration; undefined for an inline `dep`. */
  decl?: DepDeclaration;
  /** For an inline `dep`: the setting, and the path of the element that carries it. */
  inline?: { setting: Setting; carrier: string; carrierKind: 'entity' | 'view' | 'field' };
  span: Span;
}

export interface LineageDependency {
  upstream: RefEndpoint;
  downstream: RefEndpoint;
  /** Settings of this dependency alone: the brackets after it in a block (§27.2). */
  settings: Setting[];
  span: Span;
}

/**
 * Every Dep of a document: the `Dep` declarations in document order, then
 * the inline `dep` settings, element by element, each element's own
 * setting before those of its fields, and a field's before those of the
 * fields nested in it. Pass a flattened document to include what imports
 * bring.
 */
export function collectLineage (doc: XDbmlDocument): Lineage[] {
  const out: Lineage[] = [];
  for (const stmt of doc.statements) {
    if (stmt.kind !== 'DepDeclaration') continue;
    out.push({
      id: `dep:${out.length}`,
      ...(stmt.name !== undefined ? { name: stmt.name } : {}),
      settings: depSettings(stmt),
      dependencies: stmt.dependencies.map((d) => ({
        upstream: d.upstream,
        downstream: d.downstream,
        settings: d.settings,
        span: d.span,
      })),
      decl: stmt,
      span: stmt.span,
    });
  }
  for (const carrier of lineageCarriers(doc)) {
    for (const setting of carrier.settings) {
      if (setting.name !== 'dep' || setting.value?.kind !== 'DepValue') continue;
      const v = setting.value;
      const self: RefEndpoint = {
        kind: 'RefEndpoint',
        path: carrier.path.map((seg) => ({ ...seg, span: v.span })),
        span: v.span,
      };
      // `<-` makes the named element upstream of the carrier, `->` downstream.
      const [upstream, downstream] = v.arrow === '<-' ? [v.target, self] : [self, v.target];
      out.push({
        id: `dep:${out.length}`,
        settings: [],
        dependencies: [{ upstream, downstream, settings: [], span: v.span }],
        inline: { setting, carrier: pathToString(carrier.path), carrierKind: carrier.kind },
        span: setting.span,
      });
    }
  }
  return out;
}

/** The Dep with the given id, `dep:<n>`. */
export function lineageById (doc: XDbmlDocument, id: string): Lineage | undefined {
  return collectLineage(doc).find((l) => l.id === id);
}

/**
 * The settings of a Dep declaration with their precedence applied. In a
 * block, a setting of the body takes precedence over the same setting in
 * the brackets (§27.2); in the short form, the brackets after the
 * dependency over those before the colon. Within one list, the first of
 * two settings of one name applies (§24.5).
 */
export function depSettings (decl: DepDeclaration): Setting[] {
  return decl.form === 'block'
    ? mergeSettings(decl.settings, decl.bodySettings ?? [])
    : mergeSettings(decl.headerSettings ?? [], decl.settings);
}

function mergeSettings (...lists: ReadonlyArray<ReadonlyArray<Setting>>): Setting[] {
  const out = new Map<string, Setting>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const s of list) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.set(s.name, s);
    }
  }
  return [...out.values()];
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether a value is a color of a dependency: `#rgb` or `#rrggbb` (§27.3). */
export function isDepColor (v: SettingValue | null): boolean {
  return !!v && v.kind === 'StringValue' && HEX_COLOR.test(v.value);
}

/** The color a Dep's settings give its lines, or undefined (§27.3). */
export function depColor (settings: ReadonlyArray<Setting>): string | undefined {
  const s = settings.find((x) => x.name === 'color');
  return s && isDepColor(s.value) && s.value?.kind === 'StringValue' ? s.value.value : undefined;
}

/* -------------------------------------------------------------------------
 * The elements that may carry an inline `dep`
 * ----------------------------------------------------------------------- */

interface Carrier {
  kind: 'entity' | 'view' | 'field';
  /** The path that names the element, as a dependency endpoint would. */
  path: PathSegment[];
  settings: ReadonlyArray<Setting>;
}

const NO_SPAN: Span = { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };

function nameSegments (container: string | undefined, name: string): PathSegment[] {
  return [...(container ? splitName(container) : []), ...splitName(name)]
    .map((n) => ({ kind: 'PathField' as const, name: n, span: NO_SPAN }));
}

/**
 * The entities and Views of a document, and their fields at any depth a
 * path can name (§11.5): the fields of an object, the elements of an array
 * or a set through `[*]`, and the positions of a tuple through `[N]`.
 */
function lineageCarriers (doc: XDbmlDocument): Carrier[] {
  const out: Carrier[] = [];
  const visit = (decl: TopLevelStatement, container: string | undefined): void => {
    if (decl.kind !== 'EntityDeclaration' && decl.kind !== 'ViewDeclaration') return;
    const path = nameSegments(container, decl.name);
    out.push({ kind: decl.kind === 'EntityDeclaration' ? 'entity' : 'view', path, settings: decl.settings });
    for (const item of (decl as EntityDeclaration | ViewDeclaration).body) {
      if (item.kind === 'FieldDeclaration') fieldCarriers(item, path, out);
    }
  };
  for (const stmt of doc.statements) {
    if (stmt.kind === 'ContainerDeclaration') {
      for (const item of stmt.body) visit(item as TopLevelStatement, stmt.name);
    } else {
      visit(stmt, undefined);
    }
  }
  return out;
}

function fieldCarriers (field: FieldDeclaration, parent: PathSegment[], out: Carrier[]): void {
  const path: PathSegment[] = [...parent, { kind: 'PathField', name: field.name, span: NO_SPAN }];
  out.push({ kind: 'field', path, settings: field.settings });
  nestedCarriers(field.type, path, out);
}

function nestedCarriers (type: TypeExpression, path: PathSegment[], out: Carrier[]): void {
  switch (type.kind) {
    case 'ObjectType':
      for (const f of type.fields) if (f.kind === 'FieldDeclaration') fieldCarriers(f, path, out);
      return;
    case 'ArrayType':
      if (type.elementType) nestedCarriers(type.elementType, [...path, { kind: 'PathArrayWildcard', span: NO_SPAN }], out);
      return;
    case 'SetType':
      nestedCarriers(type.elementType, [...path, { kind: 'PathArrayWildcard', span: NO_SPAN }], out);
      return;
    case 'TupleType':
      for (const e of type.elements) {
        const at: PathSegment[] = [...path, { kind: 'PathArrayIndex', index: e.position, span: NO_SPAN }];
        out.push({ kind: 'field', path: at, settings: e.settings });
        nestedCarriers(e.type, at, out);
      }
      return;
    default:
      return;
  }
}

/* -------------------------------------------------------------------------
 * Checks
 * ----------------------------------------------------------------------- */

/** An endpoint resolved: the entity or View it names, and the field in it. */
export interface DepEnd {
  /** The qualified name of the entity or the View. */
  element: string;
  elementKind: 'entity' | 'view';
  /** The path of the field inside the element, as `pathToString` writes it; undefined at the element level. */
  field?: string;
}

/**
 * Resolves an endpoint, reporting into `diagnostics` when it names no
 * entity, View or field, or names an Edge. Supplied by name resolution.
 */
export type DepEndResolver = (endpoint: RefEndpoint, diagnostics: Diagnostic[]) => DepEnd | undefined;

/**
 * The rules of §27 that the grammar does not express (§27.12). A `Dep`
 * outside the top level, an operator other than an arrow, and a dependency
 * with more than two ends are parse errors.
 */
export function checkLineage (doc: XDbmlDocument, resolve: DepEndResolver): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lineage = collectLineage(doc);
  const seen = new Map<string, Span>();
  const key = (up: DepEnd, down: DepEnd): string =>
    JSON.stringify([up.element, up.field ?? null, down.element, down.field ?? null]);

  for (const l of lineage) {
    const ends: Array<{ up: DepEnd; down: DepEnd; span: Span } | undefined> = [];
    for (const d of l.dependencies) {
      const up = resolveEnd(d.upstream, resolve, diagnostics);
      const down = resolveEnd(d.downstream, resolve, diagnostics);
      ends.push(up && down ? { up, down, span: d.span } : undefined);
      checkColor(d.settings, diagnostics);
    }
    checkColor(l.settings, diagnostics);

    if (l.inline) checkInlineKind(l, ends[0], diagnostics);

    if (l.decl?.form === 'block') {
      if (l.dependencies.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'empty-dep',
          message: `Dep${l.name !== undefined ? ` '${l.name}'` : ''} holds no dependency, so it declares nothing (spec §27.2).`,
          span: l.span,
        });
      }
      checkBlock(l, ends, diagnostics);
    }

    for (const e of ends) {
      if (!e) continue;
      if (e.up.field !== undefined && e.up.element === e.down.element && e.up.field === e.down.field) {
        diagnostics.push({
          severity: 'error',
          code: 'dep-self-loop',
          message: `Field '${e.up.element}.${e.up.field}' depends on itself: a field is not computed from itself ` +
            '(spec §27.4). An entity may depend on itself.',
          span: e.span,
        });
        continue;
      }
      const k = key(e.up, e.down);
      if (seen.has(k)) {
        diagnostics.push({
          severity: 'error',
          code: 'duplicate-dep',
          message: `The dependency ${describe(e.up)} -> ${describe(e.down)} is stated twice: state each dependency once ` +
            '(spec §27.4).',
          span: e.span,
        });
      } else {
        seen.set(k, e.span);
      }
    }
  }

  diagnostics.push(...checkDepSettings(doc, lineage));
  return diagnostics;
}

function describe (end: DepEnd): string {
  return end.field !== undefined ? `${end.element}.${end.field}` : end.element;
}

function resolveEnd (endpoint: RefEndpoint, resolve: DepEndResolver, diagnostics: Diagnostic[]): DepEnd | undefined {
  if (endpoint.compositeFields && endpoint.compositeFields.length > 0) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-dep-endpoint',
      message: `'${pathToString(endpoint.path)}.(${endpoint.compositeFields.join(', ')})' names several fields: an endpoint ` +
        'of a dependency names one element, so write one dependency for each field, gathered in a block if need be ' +
        '(spec §27.1).',
      span: endpoint.span,
    });
    return undefined;
  }
  return resolve(endpoint, diagnostics);
}

function checkColor (settings: ReadonlyArray<Setting>, diagnostics: Diagnostic[]): void {
  for (const s of settings) {
    if (s.name !== 'color' || isDepColor(s.value)) continue;
    diagnostics.push({
      severity: 'error',
      code: 'invalid-dep-color',
      message: 'The color of a dependency is #rgb or #rrggbb (spec §27.3).',
      span: s.span,
    });
  }
}

/** An inline `dep` on an entity or a View names one; on a field, a field (§27.2). */
function checkInlineKind (
  l: Lineage,
  e: { up: DepEnd; down: DepEnd } | undefined,
  diagnostics: Diagnostic[],
): void {
  if (!l.inline || !e || l.inline.setting.value?.kind !== 'DepValue') return;
  const other = l.inline.setting.value.arrow === '<-' ? e.up : e.down;
  const onField = l.inline.carrierKind === 'field';
  if (onField === (other.field !== undefined)) return;
  const v = l.inline.setting.value as DepValue;
  diagnostics.push({
    severity: 'error',
    code: 'dep-wrong-kind',
    message: onField
      ? `A dep on field '${l.inline.carrier}' names a field, qualified with its entity, and '${pathToString(v.target.path)}' ` +
        `names ${other.elementKind === 'view' ? 'a View' : 'an entity'}: write the dependency between the entities ` +
        "in the entity's brackets, or as a Dep (spec §27.2)."
      : `A dep on ${l.inline.carrierKind === 'view' ? 'View' : 'entity'} '${l.inline.carrier}' names an entity or a View, ` +
        `and '${pathToString(v.target.path)}' names a field: write the dependency in the field's brackets, ` +
        'or as a Dep (spec §27.2).',
    span: v.target.span,
  });
}

/** One downstream element, and one level, for every dependency of a block (§27.2). */
function checkBlock (
  l: Lineage,
  ends: ReadonlyArray<{ up: DepEnd; down: DepEnd; span: Span } | undefined>,
  diagnostics: Diagnostic[],
): void {
  const resolved = ends.filter((e): e is { up: DepEnd; down: DepEnd; span: Span } => !!e);
  const first = resolved[0];
  if (!first) return;
  const label = l.name !== undefined ? `Dep '${l.name}'` : 'This Dep';
  const other = resolved.find((e) => e.down.element !== first.down.element);
  if (other) {
    diagnostics.push({
      severity: 'error',
      code: 'dep-mixed-downstream',
      message: `${label} feeds both '${first.down.element}' and '${other.down.element}': the dependencies of a block ` +
        'have one downstream entity or View, the element itself or its fields. Write a block for each (spec §27.2).',
      span: other.span,
    });
  }
  const fieldLevel = (e: { up: DepEnd; down: DepEnd }): boolean => e.up.field !== undefined || e.down.field !== undefined;
  const mixed = resolved.find((e) => fieldLevel(e) !== fieldLevel(first));
  if (mixed) {
    diagnostics.push({
      severity: 'error',
      code: 'dep-mixed-level',
      message: `${label} mixes a dependency between entities with a dependency naming a field: the dependencies of ` +
        'a block are all between entities or Views, or all name a field at one end at least. Write a block for each ' +
        '(spec §27.2).',
      span: mixed.span,
    });
  }
}

/* -------------------------------------------------------------------------
 * `dep` settings the gathering does not take
 * ----------------------------------------------------------------------- */

/**
 * A `dep` whose value is no arrow, on an element that may carry one: an
 * error, or, in a document declaring v0.6 or earlier, a custom property
 * that draws a warning (§27.9). A `dep` on a TablePartial or its fields
 * (§27.2), and an arrow anywhere else, such as on an Edge (§27.1): errors.
 */
function checkDepSettings (doc: XDbmlDocument, lineage: ReadonlyArray<Lineage>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const taken = new Set<Setting>(lineage.flatMap((l) => (l.inline ? [l.inline.setting] : [])));
  const before07 = !!doc.version && !versionAtLeast(doc, '0.7');
  const reported = new Set<Setting>();

  const noArrow = (s: Setting): void => {
    reported.add(s);
    diagnostics.push(before07
      ? {
          severity: 'warning',
          code: 'invalid-dep-value',
          message: "'dep' is a custom property here, as it was before v0.7. From v0.7, 'dep' states a dependency, " +
            "'<- source' or '-> target' (spec §27.9): rename the property, or declare xdbml: 0.7 and write an arrow.",
          span: s.span,
        }
      : {
          severity: 'error',
          code: 'invalid-dep-value',
          message: "'dep' takes '<- source' or '-> target' (spec §27.2).",
          span: s.span,
        });
  };

  for (const carrier of lineageCarriers(doc)) {
    for (const s of carrier.settings) if (s.name === 'dep' && s.value?.kind !== 'DepValue') noArrow(s);
  }

  for (const stmt of doc.statements) {
    if (stmt.kind !== 'TablePartialDeclaration') continue;
    for (const s of settingsUnder(stmt)) {
      if (s.name !== 'dep') continue;
      if (s.value?.kind !== 'DepValue') {
        noArrow(s);
        continue;
      }
      reported.add(s);
      diagnostics.push({
        severity: 'error',
        code: 'dep-in-partial',
        message: `${stmt.keyword} '${stmt.name}' carries a dep: a partial carries no dependency (spec §27.2). ` +
          'Write it on the entity that injects the partial, or as a Dep.',
        span: s.span,
      });
    }
  }

  const walk = (node: unknown, top: TopLevelStatement): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, top);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'Setting') {
      const s = rec as unknown as Setting;
      if (s.value?.kind === 'DepValue' && !taken.has(s) && !reported.has(s)) {
        reported.add(s);
        diagnostics.push({
          severity: 'error',
          code: 'misplaced-dep',
          message: top.kind === 'EdgeDeclaration'
            ? `Edge '${top.name}' carries a dep: an Edge and its fields are no endpoints of a dependency (spec §27.1).`
            : 'This dep is in the settings of no element a dependency connects: a dep stands in the settings of an ' +
              'entity, a View or one of their fields that a path can name (spec §27.1, §27.2).',
          span: s.span,
        });
      }
      return;
    }
    for (const [k, value] of Object.entries(rec)) {
      if (k !== 'span' && value && typeof value === 'object') walk(value, top);
    }
  };
  for (const stmt of doc.statements) {
    if (stmt.kind === 'ContainerDeclaration') {
      walk(stmt.settings, stmt);
      for (const item of stmt.body) walk(item, item as TopLevelStatement);
    } else {
      walk(stmt, stmt);
    }
  }
  return diagnostics;
}

/** Every setting in a declaration, at any depth. */
function settingsUnder (node: unknown, out: Setting[] = []): Setting[] {
  if (Array.isArray(node)) {
    for (const n of node) settingsUnder(n, out);
  } else if (node && typeof node === 'object') {
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'Setting') {
      out.push(rec as unknown as Setting);
    } else {
      for (const [k, value] of Object.entries(rec)) {
        if (k !== 'span' && value && typeof value === 'object') settingsUnder(value, out);
      }
    }
  }
  return out;
}
