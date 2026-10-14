/**
 * Data lineage (spec §27, v0.7).
 *
 * A `Dep` declaration (`DepDeclaration`) and an inline `dep` setting (a
 * `DepValue` in the settings of an entity, a View or a field) both state
 * that one element is computed from another. `collectLineage()` gathers
 * them into one list, in the order a diagram numbers them, so the renderer,
 * the playground and any generator agree on what `dep:<n>` names.
 *
 * From v0.7.2, in a document that declares a version, a dependency line
 * may name several upstream ends; `collectLineage()` expands it into one
 * pair per upstream end, which share the line (§27.2). A `Dep` may carry
 * the statement that loads its target, `source_query`, in the language
 * `source_database` names, and each dependency a `transformation` (§27.3,
 * §27.10).
 *
 * `checkLineage()` holds the rules of §27.4 and the validation summary of
 * §27.12 that the grammar cannot express. It takes the endpoint resolver as
 * an argument: name resolution owns the symbol table and the walk into
 * nested types, and calls this module from `resolveNames()`.
 */

import type {
  DepDeclaration,
  DepDependency,
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
  /**
   * The statement that loads the downstream element: the first
   * `source_query` of a block's body (§27.3, v0.7.2). One written in the
   * brackets is not the Dep's statement. Set only in a document that
   * declares a version; no parser reads its text (§14.3).
   */
  sourceQuery?: string;
  /**
   * The language of `sourceQuery`: `source_database`, or its alias
   * `dialect`, lowercased, as written in any casing (§27.3, v0.7.2). Set
   * only in a document that declares a version.
   */
  sourceDatabase?: string;
  span: Span;
}

/**
 * One dependency: one upstream end and one downstream end (§27.1). A line
 * that names several upstream ends gives one per end, which share `line`,
 * `settings` and `span` (§27.2, v0.7.2).
 */
export interface LineageDependency {
  upstream: RefEndpoint;
  downstream: RefEndpoint;
  /** Settings of this dependency alone: the brackets after it in a block (§27.2). */
  settings: Setting[];
  /**
   * The kind of transformation (§27.10.1), lowercased, as written in any
   * casing: in the brackets after the dependency, or, in the short form,
   * after the one dependency. Undefined when none is written, when the
   * value is no kind, or in a document without a version declaration,
   * where `transformation` is a custom property (§27.3).
   */
  transformation?: Transformation;
  /** The line of a `Dep` that states this dependency; undefined for an inline `dep`. */
  line?: DepDependency;
  span: Span;
}

/** The kinds of transformation, in the order of §27.10.1 (v0.7.2). */
export const TRANSFORMATIONS = [
  'identity',
  'derivation',
  'aggregation',
  'join',
  'lookup',
  'filter',
  'group_by',
  'conditional',
] as const;

export type Transformation = typeof TRANSFORMATIONS[number];

/** The kinds that give the value of a field, and `conditional`, which tests it: a field is downstream (§27.10.1). */
const FIELD_KINDS: ReadonlySet<string> = new Set(['identity', 'derivation', 'aggregation', 'conditional']);
/** The kinds that steer the rows or a branch without giving the value (§27.10.1). */
const INDIRECT_KINDS: ReadonlySet<string> = new Set(['join', 'lookup', 'filter', 'group_by', 'conditional']);

/** A word a setting holds, bare or quoted, lowercased. */
function settingWord (v: SettingValue | null | undefined): string | undefined {
  return v && (v.kind === 'StringValue' || v.kind === 'IdentifierValue') ? v.value.toLowerCase() : undefined;
}

/** The `transformation` setting of one line: its own brackets, or, in the short form, the Dep's (§27.3). */
function transformationSetting (line: DepDependency, decl: DepDeclaration, merged: ReadonlyArray<Setting>): Setting | undefined {
  return line.settings.find((s) => s.name === 'transformation')
    ?? (decl.form === 'short' ? merged.find((s) => s.name === 'transformation') : undefined);
}

function transformationOf (setting: Setting | undefined): Transformation | undefined {
  const word = settingWord(setting?.value);
  return word && (TRANSFORMATIONS as readonly string[]).includes(word) ? word as Transformation : undefined;
}

/** The first `source_query` of a block's body, and the Dep's `source_database` (§27.3). */
function statementOf (decl: DepDeclaration, merged: ReadonlyArray<Setting>): { sourceQuery?: string; sourceDatabase?: string } {
  const q = decl.form === 'block' ? (decl.bodySettings ?? []).find((s) => s.name === 'source_query') : undefined;
  const sourceQuery = q?.value?.kind === 'StringValue' ? q.value.value : undefined;
  const sourceDatabase = settingWord(merged.find((s) => s.name === 'source_database')?.value);
  return {
    ...(sourceQuery !== undefined ? { sourceQuery } : {}),
    ...(sourceDatabase !== undefined ? { sourceDatabase } : {}),
  };
}

/**
 * The `grain` of an entity or a View: what one row represents, as written
 * (§7.5, v0.7.2). Undefined when it has none.
 */
export function grainOf (decl: { settings: ReadonlyArray<Setting> }): string | undefined {
  const v = decl.settings.find((s) => s.name === 'grain')?.value;
  return v && (v.kind === 'StringValue' || v.kind === 'IdentifierValue') ? v.value : undefined;
}

/**
 * Every Dep of a document: the `Dep` declarations in document order, then
 * the inline `dep` settings, element by element, each element's own
 * setting before those of its fields, and a field's before those of the
 * fields nested in it. Pass a flattened document to include what imports
 * bring.
 */
export function collectLineage (doc: XDbmlDocument): Lineage[] {
  const versioned = !!doc.version;
  const out: Lineage[] = [];
  for (const stmt of doc.statements) {
    if (stmt.kind !== 'DepDeclaration') continue;
    const settings = depSettings(stmt);
    out.push({
      id: `dep:${out.length}`,
      ...(stmt.name !== undefined ? { name: stmt.name } : {}),
      settings,
      dependencies: stmt.dependencies.flatMap((line) => {
        const transformation = versioned ? transformationOf(transformationSetting(line, stmt, settings)) : undefined;
        return (line.upstreams ?? [line.upstream]).map((upstream) => ({
          upstream,
          downstream: line.downstream,
          settings: line.settings,
          ...(transformation ? { transformation } : {}),
          line,
          span: line.span,
        }));
      }),
      decl: stmt,
      ...(versioned ? statementOf(stmt, settings) : {}),
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
  const versioned = !!doc.version;
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

    if (l.decl && versioned) {
      checkTransformations(l, ends, diagnostics);
      checkStatementPlace(l, diagnostics);
    }

    if (l.decl?.form === 'block') {
      if (l.dependencies.length === 0) {
        diagnostics.push({
          severity: 'warning',
          code: 'empty-dep',
          message: `Dep${l.name !== undefined ? ` '${l.name}'` : ''} holds no dependency, so it declares nothing (spec §27.2).`,
          span: l.span,
        });
      }
      checkBlock(l, ends, versioned, diagnostics);
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

/**
 * One downstream element for every dependency of a block, and, in a
 * document without a version declaration, one level, as DBML requires
 * (§27.2). From v0.7.2 a document that declares a version may mix levels.
 */
function checkBlock (
  l: Lineage,
  ends: ReadonlyArray<{ up: DepEnd; down: DepEnd; span: Span } | undefined>,
  versioned: boolean,
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
  const mixed = versioned ? undefined : resolved.find((e) => fieldLevel(e) !== fieldLevel(first));
  if (mixed) {
    diagnostics.push({
      severity: 'error',
      code: 'dep-mixed-level',
      message: `${label} mixes a dependency between entities with a dependency naming a field. Without a version ` +
        'declaration, as in DBML, the dependencies of a block are all between entities or Views, or all name a field. ' +
        'Write a block for each, or declare a version, such as xdbml: 0.7 (spec §27.2).',
      span: mixed.span,
    });
  }
}

/** What an end names, for a message: `an entity` or `a View`. */
function elementNoun (end: DepEnd): string {
  return end.elementKind === 'view' ? 'a View' : 'an entity';
}

/**
 * The checks of §27.10.5 on the `transformation` of each line of a Dep, in
 * a document that declares a version. A line is checked once, whatever the
 * number of its upstream ends.
 */
function checkTransformations (
  l: Lineage,
  ends: ReadonlyArray<{ up: DepEnd; down: DepEnd; span: Span } | undefined>,
  diagnostics: Diagnostic[],
): void {
  const decl = l.decl;
  if (!decl) return;
  const byLine = new Map<DepDependency, Array<{ up: DepEnd; down: DepEnd; span: Span }>>();
  l.dependencies.forEach((d, i) => {
    if (!d.line) return;
    const list = byLine.get(d.line) ?? [];
    const e = ends[i];
    if (e) list.push(e);
    byLine.set(d.line, list);
  });
  for (const line of decl.dependencies) {
    const setting = transformationSetting(line, decl, l.settings);
    if (!setting) continue;
    const word = settingWord(setting.value);
    if (!word || !(TRANSFORMATIONS as readonly string[]).includes(word)) {
      const written = setting.value?.kind === 'StringValue' || setting.value?.kind === 'IdentifierValue'
        ? `'${setting.value.value}' is not a kind of transformation`
        : 'A transformation takes one of eight words';
      diagnostics.push({
        severity: 'error',
        code: 'unknown-transformation',
        message: `${written}. Write identity, derivation, aggregation, join, lookup, filter, group_by or ` +
          'conditional (spec §27.10.1).',
        span: setting.span,
      });
      continue;
    }
    const resolved = byLine.get(line) ?? [];
    if (resolved.length === 0) continue;
    const between = resolved.find((e) => e.up.field === undefined && e.down.field === undefined);
    if (between) {
      diagnostics.push({
        severity: 'error',
        code: 'transformation-between-entities',
        message: `The dependency ${describe(between.up)} -> ${describe(between.down)} names no field, so it takes no ` +
          'transformation: a transformation applies to fields. Name the field that takes part, or remove the ' +
          'transformation (spec §27.10.1).',
        span: setting.span,
      });
      continue;
    }
    const down = resolved[0].down;
    if (FIELD_KINDS.has(word) && down.field === undefined) {
      diagnostics.push({
        severity: 'error',
        code: 'transformation-target-mismatch',
        message: `'${word}' concerns the value of one field, and this dependency ends at ${down.element}, ` +
          `${elementNoun(down)}. End it at the field, ${down.element}.<field> (spec §27.10.1).`,
        span: setting.span,
      });
      continue;
    }
    const upstreams = (line.upstreams ?? [line.upstream]).length;
    if (word === 'identity' && upstreams > 1) {
      diagnostics.push({
        severity: 'warning',
        code: 'transformation-mismatch',
        message: `'identity' copies one field, and this dependency names ${upstreams} upstream ends. ` +
          "Write 'derivation' instead (spec §27.10.5).",
        span: setting.span,
      });
    }
    const fromElement = resolved.find((e) => e.up.field === undefined);
    if (INDIRECT_KINDS.has(word) && fromElement) {
      diagnostics.push({
        severity: 'warning',
        code: 'indirect-from-entity',
        message: `'${word}' starts from ${fromElement.up.element}, ${elementNoun(fromElement.up)} as a whole, so it ` +
          `does not say which field takes part. Name the field, ${fromElement.up.element}.<field> (spec §27.10.5).`,
        span: setting.span,
      });
    }
  }
}

/**
 * `source_query` in the brackets of a Dep or of one of its dependencies,
 * in a document that declares a version: it is not the Dep's statement,
 * which a block writes in its body (§27.3, v0.7.2).
 */
function checkStatementPlace (l: Lineage, diagnostics: Diagnostic[]): void {
  const decl = l.decl;
  if (!decl) return;
  const brackets = [
    ...decl.settings,
    ...(decl.headerSettings ?? []),
    ...decl.dependencies.flatMap((d) => d.settings),
  ];
  for (const s of brackets) {
    if (s.name !== 'source_query') continue;
    diagnostics.push({
      severity: 'warning',
      code: 'source-query-in-settings',
      message: `${l.name !== undefined ? `Dep '${l.name}'` : 'This Dep'} writes source_query in brackets, where it is ` +
        "not the Dep's statement. Write it in the body of a block: Dep name { a -> b  source_query: '...' } " +
        '(spec §27.3).',
      span: s.span,
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
