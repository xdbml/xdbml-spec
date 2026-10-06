/**
 * Constraints (spec §10, new in v0.6) and referenced keys (spec §11.17).
 *
 * Three jobs:
 *
 *   1. `bodyConstraints()` / `entityConstraints()` gather every key and
 *      check of an entity into one list, whatever form declared it: a line
 *      in `constraints { }` or `checks { }`, `[pk]` / `[unique]` on a
 *      field, a `pk` entry in `indexes`, a field-level `check:`. This is
 *      the Constraint node of spec §28.6, and what the renderer and the
 *      playground read, so a consumer finds the primary key in one place.
 *
 *   2. `markPrimaryKeyNotNull()` adds an implied `not null` to each
 *      primary key field of a v0.6 document (spec §10.4). The parser calls
 *      it once the document is built.
 *
 *   3. `checkConstraints()` reports the conditions of spec §10.10 and the
 *      referenced-key rule of spec §11.17. Conditions on constructs that
 *      earlier versions and DBML accept are errors in a document declaring
 *      0.6 or later and warnings otherwise, so a document stays valid under
 *      the version it declares.
 */

import type {
  CheckEntry,
  ContainerDeclaration,
  EdgeDeclaration,
  EntityBodyItem,
  EntityDeclaration,
  FieldDeclaration,
  NoteBlock,
  PartialInjection,
  PathSegment,
  RefDeclaration,
  RefEndpoint,
  Setting,
  SettingValue,
  Span,
  TablePartialDeclaration,
  TypeDeclaration,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { entityDefinitions } from './definitions.ts';
import type { LocalTypes } from './definitions.ts';
import { canonicalTarget, effectiveTarget, isRelationalTarget, projectTarget, projectTargets, settingValues } from './targets.ts';
import { hasForeignMasterFlag, isForeignMaster, versionAtLeast } from './relationships.ts';
import { effectiveFieldList, effectiveFields, tablePartials } from './partials.ts';

export { isRelationalTarget } from './targets.ts';

/* -------------------------------------------------------------------------
 * Normalized constraints (spec §28.6)
 * ----------------------------------------------------------------------- */

/** Where a constraint was declared. The raw AST keeps the form; this list does not. */
export type ConstraintSource = 'constraints' | 'checks' | 'inline' | 'indexes' | 'field-check';

export interface KeyConstraint {
  kind: 'key';
  keyKind: 'primary' | 'unique';
  /** Dotted field paths, in key order. */
  fields: string[];
  name?: string;
  note?: string;
  source: ConstraintSource;
  span: Span;
}

export interface CheckConstraint {
  kind: 'check';
  expression: string;
  name?: string;
  note?: string;
  /** For a field-level `check:`, the field it sits on. */
  field?: string;
  source: ConstraintSource;
  span: Span;
}

export type Constraint = KeyConstraint | CheckConstraint;

type Body = ReadonlyArray<EntityBodyItem>;
type FieldList = ReadonlyArray<FieldDeclaration | NoteBlock | PartialInjection>;

const hasFlag = (settings: ReadonlyArray<Setting>, ...names: string[]): boolean =>
  settings.some((s) => names.includes(s.name) && s.value === null);

const stringSetting = (settings: ReadonlyArray<Setting>, name: string): string | undefined => {
  const s = settings.find((x) => x.name === name);
  return s?.value?.kind === 'StringValue' ? s.value.value : undefined;
};

const isPk = (settings: ReadonlyArray<Setting>): boolean => hasFlag(settings, 'pk', 'primary key');

/** Dotted form of a key or index path; only field segments carry names. */
export function keyPathString (path: ReadonlyArray<PathSegment>): string {
  return path.map((seg) => (seg.kind === 'PathField' ? seg.name : '[]')).join('.');
}

const checkFromEntry = (e: CheckEntry, source: ConstraintSource): CheckConstraint => ({
  kind: 'check',
  expression: e.expression,
  name: stringSetting(e.settings, 'name'),
  note: stringSetting(e.settings, 'note'),
  source,
  span: e.span,
});

/**
 * The constraints one body declares itself, TablePartial injections left
 * out. `quotedFieldChecks` reads a quoted field-level `check:` as a check
 * (v0.6 §10.5); in earlier versions a quoted value there is a string.
 */
export function bodyConstraints (body: Body, quotedFieldChecks = true): Constraint[] {
  const out: Constraint[] = [];
  const inlinePk: FieldDeclaration[] = [];

  for (const item of body) {
    if (item.kind === 'FieldDeclaration') {
      if (isPk(item.settings)) inlinePk.push(item);
      if (hasFlag(item.settings, 'unique')) {
        out.push({ kind: 'key', keyKind: 'unique', fields: [item.name], source: 'inline', span: item.span });
      }
      for (const s of item.settings) {
        if (s.name !== 'check' || !s.value) continue;
        const expression = checkExpression(s.value, quotedFieldChecks);
        if (expression !== undefined) {
          out.push({ kind: 'check', expression, field: item.name, source: 'field-check', span: s.span });
        }
      }
    } else if (item.kind === 'ConstraintsBlock') {
      for (const e of item.entries) {
        if (e.kind === 'CheckEntry') {
          out.push(checkFromEntry(e, 'constraints'));
          continue;
        }
        const pk = isPk(e.settings);
        const unique = hasFlag(e.settings, 'unique');
        if (pk === unique) continue; // neither or both: reported by checkConstraints
        out.push({
          kind: 'key',
          keyKind: pk ? 'primary' : 'unique',
          fields: e.fields.map(keyPathString),
          name: stringSetting(e.settings, 'name'),
          note: stringSetting(e.settings, 'note'),
          source: 'constraints',
          span: e.span,
        });
      }
    } else if (item.kind === 'ChecksBlock') {
      for (const e of item.entries) out.push(checkFromEntry(e, 'checks'));
    } else if (item.kind === 'IndexesBlock') {
      for (const e of item.entries) {
        if (!isPk(e.settings)) continue;
        const fields = e.components.flatMap((c) => (c.kind === 'IndexPathComponent' ? [keyPathString(c.path)] : []));
        out.push({
          kind: 'key',
          keyKind: 'primary',
          fields,
          name: stringSetting(e.settings, 'name'),
          note: stringSetting(e.settings, 'note'),
          source: 'indexes',
          span: e.span,
        });
      }
    }
  }

  if (inlinePk.length > 0) {
    // Several inline [pk] fields form one composite key in field order (§10.3).
    out.unshift({
      kind: 'key',
      keyKind: 'primary',
      fields: inlinePk.map((f) => f.name),
      source: 'inline',
      span: inlinePk[0].span,
    });
  }
  return out;
}

function checkExpression (value: SettingValue, quoted: boolean): string | undefined {
  if (value.kind === 'ExpressionValue') return value.expression;
  if (quoted && value.kind === 'StringValue') return value.value;
  return undefined;
}

/**
 * Every constraint of an entity (or edge, or partial): its own, plus those
 * of the TablePartials it injects. One primary key results: the entity's
 * own when it declares one, otherwise the last injected partial's (§10.4,
 * following the conflict resolution of §17.1).
 */
export function entityConstraints (
  decl: { body: Body },
  doc: XDbmlDocument,
): Constraint[] {
  const quoted = versionAtLeast(doc, '0.6');
  const partials = tablePartials(doc);
  const own = bodyConstraints(decl.body, quoted);
  const injected: Constraint[] = [];
  let partialPk: KeyConstraint | undefined;
  for (const item of decl.body) {
    if (item.kind !== 'PartialInjection') continue;
    const p = partials.get(item.partialName);
    if (!p) continue;
    for (const c of bodyConstraints(p.body, quoted)) {
      if (c.kind === 'key' && c.keyKind === 'primary') partialPk = c;
      else injected.push(c);
    }
  }
  const ownPk = own.find((c) => c.kind === 'key' && c.keyKind === 'primary');
  const out = [...own, ...injected];
  if (!ownPk && partialPk) out.unshift(partialPk);
  return out;
}

/** The primary key of an entity, or undefined. */
export function primaryKey (decl: { body: Body }, doc: XDbmlDocument): KeyConstraint | undefined {
  return entityConstraints(decl, doc).find(
    (c): c is KeyConstraint => c.kind === 'key' && c.keyKind === 'primary',
  );
}

/* -------------------------------------------------------------------------
 * Document walking
 * ----------------------------------------------------------------------- */

type Declared = EntityDeclaration | EdgeDeclaration | TablePartialDeclaration;

interface Placed {
  decl: Declared;
  container?: ContainerDeclaration;
}

function bodies (doc: XDbmlDocument): Placed[] {
  const out: Placed[] = [];
  for (const s of doc.statements) {
    if (s.kind === 'EntityDeclaration' || s.kind === 'EdgeDeclaration' || s.kind === 'TablePartialDeclaration') {
      out.push({ decl: s });
    } else if (s.kind === 'ContainerDeclaration') {
      for (const b of s.body) {
        if (b.kind === 'EntityDeclaration' || b.kind === 'EdgeDeclaration') out.push({ decl: b, container: s });
      }
    }
  }
  return out;
}

function typeIndex (doc: XDbmlDocument): Map<string, TypeDeclaration> {
  const m = new Map<string, TypeDeclaration>();
  for (const s of doc.statements) if (s.kind === 'TypeDeclaration') m.set(s.name, s);
  return m;
}

/** Top-level fields of a body, including those of injected partials (§17.1). */
function topFields (body: Body, partials: Map<string, TablePartialDeclaration>): FieldDeclaration[] {
  return effectiveFields({ body }, partials).map((e) => e.field);
}

/**
 * The fields of an object-shaped type, or undefined for any other type,
 * with the scope their type names resolve in: an internal definition of
 * the entity keeps the entity's scope, a project Type does not (§15.8.2).
 */
function objectFields (
  t: TypeExpression,
  types: Map<string, TypeDeclaration>,
  local: LocalTypes | undefined,
): { fields: FieldList; local: LocalTypes | undefined } | undefined {
  if (t.kind === 'ObjectType') return { fields: t.fields, local };
  if (t.kind === 'ScalarType' || t.kind === 'NamedTypeReference') {
    const own = local?.get(t.name);
    const td = own ?? types.get(t.name);
    if (td && !td.scalarBase) return { fields: td.body, local: own ? local : undefined };
  }
  return undefined;
}

const COLLECTION_KINDS = new Set(['ArrayType', 'TupleType', 'MapType', 'SetType']);

type PathProblem = { kind: 'missing'; at: string } | { kind: 'collection'; at: string } | undefined;

/**
 * Follow a key path through object fields (§10.2). Reports the first field
 * that is missing, or the first step through an array, tuple or map.
 */
function walkKeyPath (
  path: ReadonlyArray<PathSegment>,
  fields: ReadonlyArray<FieldDeclaration>,
  types: Map<string, TypeDeclaration>,
  definitions?: { local: LocalTypes; own: ReadonlySet<FieldDeclaration> },
  partials: Map<string, TablePartialDeclaration> = new Map(),
): PathProblem {
  let current: ReadonlyArray<FieldDeclaration> = fields;
  // Fields a `~name` line places in a nested body (§17.1); like those of
  // the top level, they resolve their type names at project scope.
  let injected = new Set<FieldDeclaration>();
  // The entity's internal definitions apply to its own fields only; a field
  // received from a TablePartial resolves where the partial is declared.
  let scope: LocalTypes | undefined;
  const walked: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (seg.kind !== 'PathField') return { kind: 'collection', at: walked.join('.') || '(start)' };
    walked.push(seg.name);
    const f = current.find((x) => x.name === seg.name);
    if (!f) return { kind: 'missing', at: walked.join('.') };
    if (i === path.length - 1) return undefined;
    if (COLLECTION_KINDS.has(f.type.kind)) return { kind: 'collection', at: walked.join('.') };
    if (i === 0) scope = definitions?.own.has(f) ? definitions.local : undefined;
    else if (injected.has(f)) scope = undefined;
    const next = objectFields(f.type, types, scope);
    if (!next) return { kind: 'missing', at: `${walked.join('.')}.${(path[i + 1] as { name?: string }).name ?? ''}` };
    const effective = effectiveFieldList(next.fields, partials);
    current = effective.map((e) => e.field);
    injected = new Set(effective.filter((e) => e.partial).map((e) => e.field));
    scope = next.local;
  }
  return undefined;
}

/* -------------------------------------------------------------------------
 * Primary key fields are not null (§10.4)
 * ----------------------------------------------------------------------- */

const NULLABILITY = ['null', 'not null'];

/**
 * Add an implied `not null` to every field of the primary key of each
 * entity, edge and partial the document declares itself, unless the field
 * states its nullability. `null` on a primary key field is left in place
 * for checkConstraints to report. Keys naming a partial's field from the
 * injecting entity are not marked: the field belongs to the partial.
 */
export function markPrimaryKeyNotNull (doc: XDbmlDocument): void {
  if (!versionAtLeast(doc, '0.6')) return;
  for (const { decl } of bodies(doc)) {
    const pk = bodyConstraints(decl.body).find((c): c is KeyConstraint => c.kind === 'key' && c.keyKind === 'primary');
    if (!pk) continue;
    for (const dotted of pk.fields) {
      const field = findField(decl.body, dotted.split('.'));
      if (!field || field.settings.some((s) => NULLABILITY.includes(s.name))) continue;
      field.settings.push({ kind: 'Setting', name: 'not null', nameSource: 'not null', value: null, implied: true, span: field.span });
    }
  }
}

function findField (body: Body, names: string[]): FieldDeclaration | undefined {
  let current: ReadonlyArray<FieldDeclaration | NoteBlock | PartialInjection | EntityBodyItem> = body;
  let found: FieldDeclaration | undefined;
  for (const n of names) {
    found = current.find((x): x is FieldDeclaration => x.kind === 'FieldDeclaration' && x.name === n);
    if (!found) return undefined;
    current = found.type.kind === 'ObjectType' ? found.type.fields : [];
  }
  return found;
}

/**
 * Spec §5.2, rules 3 and 4: in a Project with several targets, every
 * Container declares its own; and a Container's target is one of the
 * Project's. Both apply to Containers written as such, only when the
 * Project declares `targets:`. An implicit container (`Table core.users`)
 * has no place for a target and is not checked. Before v0.6 the parser
 * accepted both, so an earlier version draws warnings.
 */
export function checkTargets (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declared = projectTargets(doc);
  if (!declared) return diagnostics;
  const severity: Diagnostic['severity'] = versionAtLeast(doc, '0.6') ? 'error' : 'warning';
  const canon = new Set(declared.map(canonicalTarget));
  for (const s of doc.statements) {
    if (s.kind !== 'ContainerDeclaration') continue;
    const own = settingValues(s.settings.find((x) => x.name === 'target')?.value ?? null).filter((x) => x !== '');
    if (own.length === 0 && declared.length > 1) {
      diagnostics.push({
        severity,
        code: 'container-target-missing',
        message: `Container '${s.name}' declares no target, and the Project declares several (${declared.join(', ')}). ` +
          `Write the target after its name: ${s.keyword} ${s.name} [target: ${declared[0]}] { ... } (spec §5.2).`,
        span: s.span,
      });
    } else if (own.length > 0 && !canon.has(canonicalTarget(own[0]))) {
      diagnostics.push({
        severity,
        code: 'container-target-not-in-project',
        message: `Container '${s.name}' targets ${own[0]}, which the Project's targets do not list (${declared.join(', ')}). ` +
          `Add it to the Project's targets, or change the Container's target (spec §5.2).`,
        span: s.span,
      });
    }
  }
  return diagnostics;
}

/* -------------------------------------------------------------------------
 * Checks (§10.10, §11.17)
 * ----------------------------------------------------------------------- */

export function checkConstraints (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const v06 = versionAtLeast(doc, '0.6');
  // Conditions on constructs that earlier versions accept (§10.10).
  const olderSeverity: Diagnostic['severity'] = v06 ? 'error' : 'warning';
  const partials = tablePartials(doc);
  const types = typeIndex(doc);
  const versionSpan = (fallback: Span): Span => (doc.version ? doc.version.span : fallback);

  for (const { decl } of bodies(doc)) {
    const fields = topFields(decl.body, partials);
    const blocks = decl.body.filter((b) => b.kind === 'ConstraintsBlock');
    const definitions = decl.kind === 'EntityDeclaration'
      ? {
          local: entityDefinitions(decl.body),
          own: new Set(decl.body.filter((b): b is FieldDeclaration => b.kind === 'FieldDeclaration')),
        }
      : undefined;

    for (const [i, block] of blocks.entries()) {
      if (block.kind !== 'ConstraintsBlock') continue;
      if (!v06) {
        diagnostics.push({
          severity: 'error',
          code: 'construct-requires-version',
          message: "The constraints block requires a document declaring 'xdbml: 0.6' or later.",
          span: versionSpan(block.span),
        });
      }
      if (i > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'duplicate-constraints-block',
          message: `'${decl.name}' declares a second constraints block; one body holds at most one.`,
          span: block.span,
        });
      }
      for (const e of block.entries) {
        if (e.kind === 'CheckEntry') continue;
        const pk = isPk(e.settings);
        const unique = hasFlag(e.settings, 'unique');
        if (pk === unique) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-key-flags',
            message: pk
              ? 'A key line carries both pk and unique; it takes exactly one.'
              : 'A key line needs pk or unique.',
            span: e.span,
          });
        }
        for (const path of e.fields) {
          const problem = walkKeyPath(path, fields, types, definitions, partials);
          if (problem?.kind === 'missing') {
            diagnostics.push({
              severity: 'error',
              code: 'unresolved-key-field',
              message: `Key field '${problem.at}' is not declared in '${decl.name}'.`,
              span: e.span,
            });
          } else if (problem?.kind === 'collection') {
            diagnostics.push({
              severity: 'error',
              code: 'key-path-crosses-collection',
              message: `Key path '${keyPathString(path)}' crosses an array, tuple or map at '${problem.at}'; a key path steps through object fields only.`,
              span: e.span,
            });
          }
        }
      }
    }

    // Quoted checks are v0.6 syntax (§10.5).
    if (!v06) {
      for (const item of decl.body) {
        if (item.kind !== 'ChecksBlock' && item.kind !== 'ConstraintsBlock') continue;
        for (const e of item.entries) {
          if (e.kind === 'CheckEntry' && e.delimiter === 'quote') {
            diagnostics.push({
              severity: 'error',
              code: 'construct-requires-version',
              message: "A check expression in quotes requires a document declaring 'xdbml: 0.6' or later; use backticks.",
              span: e.span,
            });
          }
        }
      }
    }

    // Index fields must be declared (§9, §10.10). Only the first segment is
    // checked: deeper segments may iterate arrays implicitly (§9.3).
    for (const item of decl.body) {
      if (item.kind !== 'IndexesBlock') continue;
      for (const e of item.entries) {
        for (const c of e.components) {
          if (c.kind !== 'IndexPathComponent') continue;
          const first = c.path[0];
          if (first?.kind === 'PathField' && !fields.some((f) => f.name === first.name)) {
            diagnostics.push({
              severity: olderSeverity,
              code: 'unresolved-index-field',
              message: `Index field '${first.name}' is not declared in '${decl.name}'.`,
              span: c.span,
            });
          }
        }
      }
    }

    // One primary key, declared in one place (§10.4). Inline [pk] fields
    // count as one declaration. When the second declaration restates the
    // same fields, say so: the fix is to delete one, not to look for
    // another key.
    const own = bodyConstraints(decl.body, v06);
    const pks = own.filter((c): c is KeyConstraint => c.kind === 'key' && c.keyKind === 'primary');
    for (const extra of pks.slice(1)) {
      const first = pks[0];
      diagnostics.push({
        severity: olderSeverity,
        code: 'duplicate-primary-key',
        message: sameKeyFields(first.fields, extra.fields)
          ? `'${decl.name}' declares its primary key (${first.fields.join(', ')}) twice: ` +
            `${twoForms(first, extra)}. Declare it in one place (spec §10.4).`
          : `'${decl.name}' declares a second primary key; an entity has one, declared in one place.`,
        span: extra.span,
      });
    }

    // Each unique key is declared once (§10.3, v0.6.1): a warning in every
    // version, since earlier documents accept the repetition.
    const uniques = own.filter((c): c is KeyConstraint => c.kind === 'key' && c.keyKind === 'unique');
    for (const [i, u] of uniques.entries()) {
      const first = uniques.slice(0, i).find((prev) => sameKeyFields(prev.fields, u.fields));
      if (!first) continue;
      diagnostics.push({
        severity: 'warning',
        code: 'duplicate-unique-key',
        message:
          `'${decl.name}' declares the unique key (${first.fields.join(', ')}) twice: ` +
          `${twoForms(first, u)}. Declare it in one place (spec §10.3).`,
        span: u.span,
      });
    }

    // `null` on a primary key field (§10.4).
    for (const pk of pks.slice(0, 1)) {
      for (const dotted of pk.fields) {
        const f = findField(decl.body, dotted.split('.'));
        const nullSetting = f?.settings.find((s) => s.name === 'null' && !s.implied);
        if (nullSetting) {
          diagnostics.push({
            severity: olderSeverity,
            code: 'null-in-primary-key',
            message: `'${decl.name}.${dotted}' is part of the primary key and cannot be null.`,
            span: nullSetting.span,
          });
        }
      }
    }
  }

  diagnostics.push(...checkReferencedKeys(doc, olderSeverity));
  return diagnostics;
}

/** Two keys on the same fields, in any order, are the same key. */
function sameKeyFields (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((f, i) => f === sb[i]);
}

/** How a key was written, for a message that names both declarations. */
function keyForm (k: KeyConstraint): string {
  const flag = k.keyKind === 'primary' ? 'pk' : 'unique';
  if (k.source === 'inline') return `[${flag}] on ${k.fields.join(', ')}`;
  if (k.source === 'indexes') return `a ${flag} entry in indexes`;
  return `a ${flag} line in constraints`;
}

/** Both declarations of a repeated key: "[pk] on id and a pk line in constraints". */
function twoForms (a: KeyConstraint, b: KeyConstraint): string {
  const fa = keyForm(a);
  const fb = keyForm(b);
  if (fa !== fb) return `${fa} and ${fb}`;
  const flag = a.keyKind === 'primary' ? 'pk' : 'unique';
  return a.source === 'indexes' ? `two ${flag} entries in indexes` : `two ${flag} lines in constraints`;
}

/* ---- §11.17 referenced keys ---- */

interface EntityEntry {
  placed: Placed;
  decl: EntityDeclaration;
}

function entityIndex (doc: XDbmlDocument): Map<string, EntityEntry> {
  const m = new Map<string, EntityEntry>();
  const bare = new Map<string, EntityEntry[]>();
  for (const p of bodies(doc)) {
    if (p.decl.kind !== 'EntityDeclaration') continue;
    const e: EntityEntry = { placed: p, decl: p.decl };
    const q = p.container ? `${p.container.name}.${p.decl.name}` : p.decl.name;
    m.set(q, e);
    const b = p.decl.name.split('.').pop() ?? p.decl.name;
    bare.set(b, [...(bare.get(b) ?? []), e]);
  }
  for (const [b, list] of bare) if (list.length === 1 && !m.has(b)) m.set(b, list[0]);
  return m;
}

interface ResolvedEnd {
  entity: EntityEntry;
  fields: string[];
}

/** Longest prefix naming an entity; the rest is a field path. Entity-level ends return undefined fields. */
function resolveEnd (ep: RefEndpoint, index: Map<string, EntityEntry>): ResolvedEnd | 'entity-level' | undefined {
  const names = ep.path.map((s) => (s.kind === 'PathField' ? s.name : '[]'));
  for (let i = names.length; i >= 1; i--) {
    const entity = index.get(names.slice(0, i).join('.'));
    if (!entity) continue;
    if (ep.compositeFields && ep.compositeFields.length > 0) return { entity, fields: [...ep.compositeFields] };
    const rest = names.slice(i).join('.');
    return rest ? { entity, fields: [rest] } : 'entity-level';
  }
  return undefined;
}

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

/** Keys a referenced end may match: keys, plus DBML unique indexes (§11.17). */
function referenceableKeys (decl: EntityDeclaration, doc: XDbmlDocument): string[][] {
  const keys = entityConstraints(decl, doc)
    .filter((c): c is KeyConstraint => c.kind === 'key')
    .map((k) => k.fields);
  for (const item of decl.body) {
    if (item.kind !== 'IndexesBlock') continue;
    for (const e of item.entries) {
      if (isPk(e.settings) || !hasFlag(e.settings, 'unique')) continue;
      keys.push(e.components.flatMap((c) => (c.kind === 'IndexPathComponent' ? [keyPathString(c.path)] : [])));
    }
  }
  return keys;
}

function checkReferencedKeys (doc: XDbmlDocument, severity: Diagnostic['severity']): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const index = entityIndex(doc);
  const project = projectTarget(doc);

  const exemptTarget = (e: EntityEntry): boolean => {
    const t = effectiveTarget(e.placed.container, project);
    return t !== undefined && !isRelationalTarget(t);
  };

  const check = (
    source: RefEndpoint,
    operator: string,
    target: RefEndpoint,
    span: Span,
  ): void => {
    if (operator === '<>') return;
    const s = resolveEnd(source, index);
    const t = resolveEnd(target, index);
    if (!s || !t || s === 'entity-level' || t === 'entity-level') return;
    if (exemptTarget(s.entity) || exemptTarget(t.entity)) return;
    const sides = operator === '>' ? [t] : operator === '<' ? [s] : [s, t];
    const withKeys = sides
      .map((side) => ({ side, keys: referenceableKeys(side.entity.decl, doc) }))
      .filter((x) => x.keys.length > 0);
    if (withKeys.length === 0) return; // no key declared: a tool MAY promote (§11.17)
    if (withKeys.some((x) => x.keys.some((k) => sameSet(k, x.side.fields)))) return;
    const first = withKeys[0];
    const pk = primaryKey(first.side.entity.decl, doc);
    const where = `${first.side.entity.decl.name}.${first.side.fields.length > 1 ? `(${first.side.fields.join(', ')})` : first.side.fields[0]}`;
    diagnostics.push({
      severity,
      code: 'ref-target-not-key',
      message:
        `Relationship references '${where}', which is not the primary key or a unique key of '${first.side.entity.decl.name}'` +
        (pk ? ` (primary key: ${pk.fields.join(', ')}).` : '.') +
        ' Declare those fields unique, or reference a key.',
      span,
    });
  };

  const visitRef = (ref: RefDeclaration): void => {
    if (isForeignMaster(ref)) return;
    check(ref.spec.source, ref.spec.operator, ref.spec.target, ref.span);
  };

  for (const s of doc.statements) {
    if (s.kind === 'RefDeclaration') visitRef(s);
  }

  // Inline refs on top-level fields, those received from a TablePartial
  // included: each entity that injects the partial holds the relationship
  // (§17.1). A partial injected into several entities reports once.
  const partials = tablePartials(doc);
  const reportedForPartial = new Map<Setting, Set<string>>();
  for (const p of bodies(doc)) {
    if (p.decl.kind !== 'EntityDeclaration') continue;
    const owner = p.container ? `${p.container.name}.${p.decl.name}` : p.decl.name;
    for (const { field: item, partial } of effectiveFields(p.decl, partials)) {
      if (hasForeignMasterFlag(item.settings)) continue;
      for (const st of item.settings) {
        if (st.name !== 'ref' || st.value?.kind !== 'RefValue') continue;
        const source: RefEndpoint = {
          kind: 'RefEndpoint',
          path: [...owner.split('.'), item.name].map((name) => ({ kind: 'PathField', name, span: item.span })),
          span: item.span,
        };
        const before = diagnostics.length;
        check(source, st.value.operator, st.value.target, st.span);
        if (!partial || diagnostics.length === before) continue;
        const seen = reportedForPartial.get(st) ?? new Set<string>();
        reportedForPartial.set(st, seen);
        const message = diagnostics[diagnostics.length - 1].message;
        if (seen.has(message)) diagnostics.pop();
        else seen.add(message);
      }
    }
  }
  return diagnostics;
}
