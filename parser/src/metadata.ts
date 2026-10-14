/**
 * Metadata blocks (spec §24.7, v0.7; DBML 9.1 and later).
 *
 *   Metadata Table users {
 *     owner: 'scott'
 *     note: 'Accounts of the web shop'
 *   }
 *
 * A block sets settings on an element declared elsewhere: a note, the
 * element's color when it is drawn as a shape, and custom properties. It
 * declares nothing. This module resolves each block's target, applies the
 * blocks in their order of precedence (`metadataIndex`), and reports the
 * conditions of §24.7.6 (`checkMetadata`).
 *
 * Every function here takes a flattened document (`flatten()`), whose
 * statement list ends with the Metadata blocks in their order of
 * precedence: those of imported files first, a later import after an
 * earlier one, then the document's own blocks in source order (§24.7.4).
 */

import type {
  ContainerDeclaration,
  DiagramViewDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  MetadataDeclaration,
  MetadataTargetKind,
  NoteBlock,
  NoteDeclaration,
  Setting,
  SettingValue,
  TableGroupDeclaration,
  ViewDeclaration,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { joinName, lastNameSegment, quoteNameSegment, splitName } from './names.ts';
import { resolveStickyNote, stickyNotes } from './notes.ts';
import { effectiveFieldList, effectiveFields, effectiveHeaderColor, effectiveNote, tablePartials } from './partials.ts';
import type { PartialLookup } from './partials.ts';
import { pathToString, versionAtLeast } from './relationships.ts';

/* -------------------------------------------------------------------------
 * Kinds and the settings each one takes (§24.7.1, §24.7.3)
 * ----------------------------------------------------------------------- */

/** The kind words DBML defines, read in every document (Appendix D). */
const DBML_KIND_WORDS = new Set(['table', 'column', 'tablegroup', 'note']);

/**
 * The settings a Metadata block sets on each kind of element, beside
 * custom properties: a note, and a color on an element drawn as a shape.
 * DBML defines the first four rows; `note` on a sticky note is a custom
 * property, as in DBML, since the note's text is its body. The header
 * color of a Table or a View is `headercolor` here, whichever word the
 * block writes: the parser reads `color` in a `Metadata Table` or
 * `Metadata View` block of a document that declares a version as
 * `headercolor` (§7.5, v0.7.1).
 */
export const METADATA_SETTINGS: Readonly<Record<MetadataTargetKind, ReadonlyArray<string>>> = {
  Table: ['note', 'headercolor'],
  Column: ['note'],
  TableGroup: ['note', 'color'],
  Note: ['color'],
  Container: ['note', 'color'],
  View: ['note', 'headercolor'],
  DiagramView: ['note'],
};

/**
 * Settings xDBML defines elsewhere that a Metadata block does not set. Each
 * reads as a custom property of that name, as in DBML, and draws a warning.
 */
const MEANING_SETTINGS = new Set(['synonyms', 'business_term', 'granularity', 'tags']);
const FIELD_SETTINGS = new Set(['pk', 'primary', 'unique', 'null', 'required', 'increment', 'default', 'ref', 'check']);
const COLOR_SETTINGS = new Set(['color', 'headercolor']);

/* -------------------------------------------------------------------------
 * Target resolution (§24.7.2)
 * ----------------------------------------------------------------------- */

export interface ResolvedMetadataTarget {
  kind: MetadataTargetKind;
  /**
   * The key the index files the block's settings under: the kind and the
   * element's identity, a container-qualified name for an entity or a View
   * in a Container, and the field path for a Column.
   */
  key: string;
  /** The element, or for a Column the entity or View holding the field. */
  decl: EntityDeclaration | ViewDeclaration | TableGroupDeclaration | NoteDeclaration | ContainerDeclaration | DiagramViewDeclaration;
  /** The Container holding an entity or a View, when it sits in one. */
  container?: ContainerDeclaration;
  /** Column only: the field, and its path under the entity, in the form of names.ts. */
  field?: FieldDeclaration;
  fieldPath?: string;
}

/** Why a target did not resolve: no element, or an element of another kind. */
export type MetadataTargetProblem =
  | { problem: 'unresolved' }
  | { problem: 'other-kind'; found: string };

interface Placed<T> { decl: T; container?: ContainerDeclaration; id: string }

/** Entities and Views by identity, with bare names that are unique. */
function shapeIndex (doc: XDbmlDocument): Map<string, Placed<EntityDeclaration | ViewDeclaration>> {
  const byId = new Map<string, Placed<EntityDeclaration | ViewDeclaration>>();
  const bare = new Map<string, Placed<EntityDeclaration | ViewDeclaration>[]>();
  const add = (decl: EntityDeclaration | ViewDeclaration, container?: ContainerDeclaration) => {
    const id = container ? joinName([...splitName(container.name), ...splitName(decl.name)]) : decl.name;
    const p = { decl, container, id };
    byId.set(id, p);
    const b = quoteNameSegment(lastNameSegment(decl.name));
    bare.set(b, [...(bare.get(b) ?? []), p]);
  };
  for (const s of doc.statements) {
    if (s.kind === 'EntityDeclaration' || s.kind === 'ViewDeclaration') add(s);
    else if (s.kind === 'ContainerDeclaration') {
      for (const b of s.body) if (b.kind === 'EntityDeclaration' || b.kind === 'ViewDeclaration') add(b, s);
    }
  }
  for (const [b, list] of bare) if (list.length === 1 && !byId.has(b)) byId.set(b, list[0]);
  return byId;
}

/** The fields directly under a list of body items, those a `~name` line places included (§17.1). */
function fieldsOf (items: ReadonlyArray<{ kind: string }>, partials: PartialLookup): FieldDeclaration[] {
  return effectiveFieldList(items as never, partials).map((e) => e.field);
}

function findFieldPath (
  shape: EntityDeclaration | ViewDeclaration,
  names: string[],
  partials: PartialLookup,
): FieldDeclaration | undefined {
  let fields: FieldDeclaration[] = shape.kind === 'EntityDeclaration'
    ? effectiveFields(shape, partials).map((e) => e.field)
    : shape.body.filter((b): b is FieldDeclaration => b.kind === 'FieldDeclaration');
  let found: FieldDeclaration | undefined;
  for (const n of names) {
    found = fields.find((f) => f.name === n);
    if (!found) return undefined;
    fields = found.type.kind === 'ObjectType' ? fieldsOf(found.type.fields, partials) : [];
  }
  return found;
}

/** A DiagramView keeps its name as written; compare an unqualified target unquoted. */
function plainName (target: string): string {
  const parts = splitName(target);
  return parts.length === 1 ? parts[0] : target;
}

/**
 * The element a Metadata block targets (spec §24.7.2), or why it has none.
 * An entity or a View is named as elsewhere: by its name, qualified with
 * its Container, or by a bare name that only one of them carries. A Column
 * names an entity or a View, then a field under it, nested fields included:
 * the longest leading part of the path that names an entity or a View
 * holds the field.
 */
export function resolveMetadataTarget (
  doc: XDbmlDocument,
  block: MetadataDeclaration,
  shapes: Map<string, Placed<EntityDeclaration | ViewDeclaration>> = shapeIndex(doc),
  partials: PartialLookup = tablePartials(doc),
): ResolvedMetadataTarget | MetadataTargetProblem {
  const kind = block.targetKind;
  if (!kind) return { problem: 'unresolved' };
  const target = block.target;
  switch (kind) {
    case 'Table':
    case 'View': {
      const p = shapes.get(target);
      if (!p) return { problem: 'unresolved' };
      const isView = p.decl.kind === 'ViewDeclaration';
      if ((kind === 'View') !== isView) return { problem: 'other-kind', found: isView ? 'a View' : 'an entity' };
      return { kind, key: `${kind}:${p.id}`, decl: p.decl, container: p.container };
    }
    case 'Column': {
      const names = splitName(target);
      for (let i = names.length - 1; i >= 1; i--) {
        const p = shapes.get(joinName(names.slice(0, i)));
        if (!p) continue;
        const field = findFieldPath(p.decl, names.slice(i), partials);
        if (!field) return { problem: 'unresolved' };
        const fieldPath = joinName(names.slice(i));
        return { kind, key: `Column:${p.id}::${fieldPath}`, decl: p.decl, container: p.container, field, fieldPath };
      }
      return { problem: 'unresolved' };
    }
    case 'TableGroup': {
      const g = doc.statements.find((s): s is TableGroupDeclaration => s.kind === 'TableGroupDeclaration' && s.name === target);
      return g ? { kind, key: `TableGroup:${g.name}`, decl: g } : { problem: 'unresolved' };
    }
    case 'Note': {
      // A sticky note, named with its Container when it sits in one (§19.4).
      const r = resolveStickyNote(stickyNotes(doc), target);
      return r.ok
        ? { kind, key: `Note:${r.note.id}`, decl: r.note.decl, container: r.note.container }
        : { problem: 'unresolved' };
    }
    case 'DiagramView': {
      const v = doc.statements.find((s): s is DiagramViewDeclaration => s.kind === 'DiagramViewDeclaration' && s.name === plainName(target));
      return v ? { kind, key: `DiagramView:${v.name}`, decl: v } : { problem: 'unresolved' };
    }
    case 'Container': {
      const c = doc.statements.find((s): s is ContainerDeclaration => s.kind === 'ContainerDeclaration' && s.name === target);
      return c ? { kind, key: `Container:${c.name}`, decl: c } : { problem: 'unresolved' };
    }
  }
}

function isResolved (r: ResolvedMetadataTarget | MetadataTargetProblem): r is ResolvedMetadataTarget {
  return !('problem' in r);
}

/* -------------------------------------------------------------------------
 * Values
 * ----------------------------------------------------------------------- */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** A setting value as text, for comparing two sources and for messages. */
export function settingValueText (v: SettingValue | null): string {
  if (!v) return '(flag)';
  switch (v.kind) {
    case 'StringValue': return v.value;
    case 'NumberValue': return v.value;
    case 'BooleanValue': return String(v.value);
    case 'NullValue': return 'null';
    case 'IdentifierValue': return v.value;
    case 'ExpressionValue': return `\`${v.expression}\``;
    case 'ListValue': return `[${v.items.map(settingValueText).join(', ')}]`;
    case 'RefValue': return `${v.operator} ...`;
    case 'DepValue': return `${v.arrow} ${pathToString(v.target.path)}`;
  }
}

/** Whether a built-in setting of a Metadata block holds a value of its type (§24.7.3). */
function validBuiltinValue (kind: MetadataTargetKind, name: string, v: SettingValue | null): boolean {
  if (!v) return false;
  if (name === 'note') return v.kind === 'StringValue';
  // color, headercolor: '#rgb' or '#rrggbb', which the lexer reads as a
  // string with or without quotes; a sticky note also takes `none`.
  if (v.kind === 'StringValue' && HEX_COLOR.test(v.value)) return true;
  return kind === 'Note' && name === 'color' && v.kind === 'IdentifierValue' && v.value.toLowerCase() === 'none';
}

/* -------------------------------------------------------------------------
 * The index (§24.7.4)
 * ----------------------------------------------------------------------- */

/** A setting a Metadata block applies, with the block it comes from. */
export interface AppliedSetting {
  setting: Setting;
  block: MetadataDeclaration;
}

export interface MetadataIndex {
  /** The settings applied to an element, by the key of `resolveMetadataTarget`, one per name, the last source winning. */
  byKey (key: string): ReadonlyArray<AppliedSetting>;
  /** An entity's settings from its Metadata blocks. */
  entity (name: string, container?: string): ReadonlyArray<AppliedSetting>;
  /** A View's settings from its Metadata blocks. */
  view (name: string, container?: string): ReadonlyArray<AppliedSetting>;
  /** A field's settings, the field named by its path under the entity or View (`address.city`). */
  field (shapeName: string, container: string | undefined, fieldPath: string): ReadonlyArray<AppliedSetting>;
  tableGroup (name: string): ReadonlyArray<AppliedSetting>;
  /** A sticky note's settings, the note named by its id: `sales.order_states` in a Container (§19.4). */
  note (id: string): ReadonlyArray<AppliedSetting>;
  container (name: string): ReadonlyArray<AppliedSetting>;
  diagramView (name: string): ReadonlyArray<AppliedSetting>;
}

const shapeId = (name: string, container?: string): string =>
  (container ? joinName([...splitName(container), ...splitName(name)]) : name);

const indexCache = new WeakMap<XDbmlDocument, MetadataIndex>();

/** Whether a document may use this block's kind word: DBML's in every document, xDBML's from v0.7 (§24.7.1). */
function kindAllowed (doc: XDbmlDocument, block: MetadataDeclaration): boolean {
  return DBML_KIND_WORDS.has(block.targetKindSource.toLowerCase()) || versionAtLeast(doc, '0.7');
}

/** Whether a block applies this setting: a built-in with a valid value, or a custom property. */
function applies (kind: MetadataTargetKind, s: Setting): boolean {
  if (METADATA_SETTINGS[kind].includes(s.name)) return validBuiltinValue(kind, s.name, s.value);
  return true;
}

/**
 * The settings Metadata blocks apply to each element of a flattened
 * document (spec §24.7.4). Blocks apply in the order `flatten()` leaves
 * them, and for each setting name the last block that sets it wins. A
 * block that names no kind, a kind the document may not use, or nothing
 * that resolves, applies nothing; so does a built-in setting with a value
 * of the wrong type.
 */
export function metadataIndex (doc: XDbmlDocument): MetadataIndex {
  const cached = indexCache.get(doc);
  if (cached) return cached;
  const byKey = new Map<string, Map<string, AppliedSetting>>();
  const blocks = doc.statements.filter((s): s is MetadataDeclaration => s.kind === 'MetadataDeclaration');
  if (blocks.length > 0) {
    const shapes = shapeIndex(doc);
    const partials = tablePartials(doc);
    for (const block of blocks) {
      if (!block.targetKind || !kindAllowed(doc, block)) continue;
      const r = resolveMetadataTarget(doc, block, shapes, partials);
      if (!isResolved(r)) continue;
      const map = byKey.get(r.key) ?? new Map<string, AppliedSetting>();
      for (const setting of block.settings) {
        if (applies(r.kind, setting)) map.set(setting.name, { setting, block });
      }
      byKey.set(r.key, map);
    }
  }
  const get = (key: string): ReadonlyArray<AppliedSetting> => [...(byKey.get(key)?.values() ?? [])];
  const index: MetadataIndex = {
    byKey: get,
    entity: (name, container) => get(`Table:${shapeId(name, container)}`),
    view: (name, container) => get(`View:${shapeId(name, container)}`),
    field: (name, container, path) => get(`Column:${shapeId(name, container)}::${path}`),
    tableGroup: (name) => get(`TableGroup:${name}`),
    note: (name) => get(`Note:${name}`),
    container: (name) => get(`Container:${name}`),
    diagramView: (name) => get(`DiagramView:${name}`),
  };
  indexCache.set(doc, index);
  return index;
}

/**
 * An element's own settings with its Metadata blocks applied (spec
 * §24.7.4): a setting a block sets replaces the element's own setting of
 * that name, and the others follow in block order. `fromMetadata` holds
 * the settings that came from a block.
 */
export function withMetadata (
  own: ReadonlyArray<Setting>,
  applied: ReadonlyArray<AppliedSetting>,
): { settings: Setting[]; fromMetadata: Set<Setting> } {
  const fromMetadata = new Set<Setting>();
  // A setting that reads as a custom property of a reserved name, `pk` on
  // a field for instance, stands beside the element's own (§24.7.3).
  const beside = applied.filter((a) => a.block.targetKind && isMetadataCustomProperty(a.block.targetKind, a.setting.name));
  const byName = new Map(applied.filter((a) => !beside.includes(a)).map((a) => [a.setting.name, a.setting]));
  for (const a of beside) byName.set(`\u0000${a.setting.name}`, a.setting);
  const settings: Setting[] = [];
  for (const s of own) {
    const replaced = byName.get(s.name);
    if (replaced) {
      settings.push(replaced);
      fromMetadata.add(replaced);
      byName.delete(s.name);
    } else {
      settings.push(s);
    }
  }
  for (const s of byName.values()) {
    settings.push(s);
    fromMetadata.add(s);
  }
  return { settings, fromMetadata };
}

/** The text of a `note` a Metadata block applies, if one does. */
export function metadataNote (applied: ReadonlyArray<AppliedSetting>): string | undefined {
  const a = applied.find((x) => x.setting.name === 'note');
  return a?.setting.value?.kind === 'StringValue' ? a.setting.value.value : undefined;
}

/** The color a Metadata block applies under `name` (`color` or `headercolor`), if one does. */
export function metadataColor (applied: ReadonlyArray<AppliedSetting>, name: 'color' | 'headercolor'): string | undefined {
  const v = applied.find((x) => x.setting.name === name)?.setting.value;
  if (!v) return undefined;
  if (v.kind === 'StringValue') return v.value;
  return v.kind === 'IdentifierValue' ? v.value : undefined;
}

/* -------------------------------------------------------------------------
 * Checks (§24.7.6)
 * ----------------------------------------------------------------------- */

const KIND_LIST_DBML = 'Table, Column, TableGroup or Note';
const KIND_LIST = 'Entity (or Table, Collection, Record), Field (or Column), EntityGroup (or TableGroup), Note, ' +
  'Container (or one of its synonyms), View or DiagramView';

/** Where a block came from, for messages: its line, and its file when an import brought it. */
function where (block: MetadataDeclaration): string {
  const line = `line ${block.span.start.line}`;
  if (!block.imported) return line;
  return block.file ? `${line} of ${block.file}` : `${line} of an imported file`;
}

function noteOf (body: ReadonlyArray<{ kind: string }>): NoteBlock | undefined {
  return body.find((b): b is NoteBlock => b.kind === 'NoteBlock');
}

/** The settings an element declares itself, as name -> value text, for the override warning. */
function ownValues (r: ResolvedMetadataTarget, partials: PartialLookup): Map<string, string> {
  const out = new Map<string, string>();
  const put = (settings: ReadonlyArray<Setting>) => {
    for (const s of settings) if (!s.implied) out.set(s.name, settingValueText(s.value));
  };
  switch (r.kind) {
    case 'Table':
    case 'View': {
      const decl = r.decl as EntityDeclaration | ViewDeclaration;
      put(decl.settings);
      const note = decl.kind === 'EntityDeclaration' ? effectiveNote(decl, partials)?.body : (noteOf(decl.body)?.body ?? out.get('note'));
      if (note !== undefined) out.set('note', note);
      if (decl.kind === 'EntityDeclaration') {
        const color = effectiveHeaderColor(decl, partials);
        if (color) out.set('headercolor', settingValueText(color.value));
      }
      break;
    }
    case 'Column':
      put(r.field?.settings ?? []);
      break;
    case 'Container': {
      const c = r.decl as ContainerDeclaration;
      put(c.settings);
      const note = noteOf(c.body);
      if (note) out.set('note', note.body);
      break;
    }
    case 'DiagramView': {
      const v = r.decl as DiagramViewDeclaration;
      put(v.settings);
      if (v.notes.length > 0) out.set('note', v.notes[0].body);
      break;
    }
    case 'TableGroup':
      put((r.decl as TableGroupDeclaration).settings);
      break;
    case 'Note':
      put((r.decl as NoteDeclaration).settings);
      break;
  }
  return out;
}

function describeTarget (r: ResolvedMetadataTarget): string {
  switch (r.kind) {
    case 'Column': return `field '${r.fieldPath}' of '${(r.decl as EntityDeclaration).name}'`;
    case 'Table': return `entity '${(r.decl as EntityDeclaration).name}'`;
    case 'View': return `View '${(r.decl as ViewDeclaration).name}'`;
    case 'TableGroup': return `${(r.decl as TableGroupDeclaration).keyword} '${(r.decl as TableGroupDeclaration).name}'`;
    case 'Note': return `sticky note '${r.key.slice('Note:'.length)}'`;
    case 'Container': return `Container '${(r.decl as ContainerDeclaration).name}'`;
    case 'DiagramView': return `diagram view '${(r.decl as DiagramViewDeclaration).name}'`;
  }
}

/**
 * Whether a block's setting is one xDBML defines elsewhere that a Metadata
 * block does not set (§24.7.3). It reads as a custom property of that
 * name, as in DBML, beside the element's own setting rather than in place
 * of it.
 */
export function isMetadataCustomProperty (kind: MetadataTargetKind, name: string): boolean {
  if (METADATA_SETTINGS[kind].includes(name)) return false;
  return notSetReason(kind, name) !== undefined;
}

/** The warning for a setting a block does not set, which reads as a custom property; undefined for an ordinary custom property. */
function notSetReason (kind: MetadataTargetKind, name: string): string | undefined {
  if (MEANING_SETTINGS.has(name)) {
    return `'${name}' is a setting of the element itself (spec §24.1 to §24.4), written in its brackets`;
  }
  if (kind === 'Column' && FIELD_SETTINGS.has(name)) {
    return `'${name}' is a setting of the field itself, written in its brackets`;
  }
  if (COLOR_SETTINGS.has(name)) {
    const takes = METADATA_SETTINGS[kind].find((n) => COLOR_SETTINGS.has(n));
    if (takes === 'headercolor') {
      // Reached by `color` in a document without a version declaration,
      // where it is a custom property, as in DBML 10.3.1 (§7.5).
      return `a ${kind} takes its color as 'headercolor', or as 'color' in a document that declares a version`;
    }
    return takes
      ? `a ${kind} takes its color as '${takes}'`
      : `a ${kind} is not drawn as a shape and takes no color`;
  }
  return undefined;
}

/**
 * The conditions of spec §24.7.6, on a flattened document, for the blocks
 * the document writes itself. Duplicate settings in one settings list are
 * checked here too (§24.5).
 */
export function checkMetadata (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blocks = doc.statements.filter((s): s is MetadataDeclaration => s.kind === 'MetadataDeclaration');
  const shapes = blocks.length ? shapeIndex(doc) : new Map();
  const partials = tablePartials(doc);
  // The value each setting of an element holds so far, and where it was set.
  const current = new Map<string, Map<string, { text: string; from: string }>>();

  for (const block of blocks) {
    // A block an import brought is checked in its own file; here it only
    // takes its place in the order of precedence (§24.7.4).
    const report = (d: Diagnostic) => { if (!block.imported) diagnostics.push(d); };
    const kind = block.targetKind;
    if (!kind) {
      report({
        severity: 'error',
        code: 'unknown-metadata-kind',
        message: `'${block.targetKindSource}' names no kind of element. A Metadata block targets ` +
          `${versionAtLeast(doc, '0.7') ? KIND_LIST : KIND_LIST_DBML} (spec §24.7.1).`,
        span: block.span,
      });
      continue;
    }
    if (!kindAllowed(doc, block)) {
      report({
        severity: 'error',
        code: 'construct-requires-version',
        message: `'Metadata ${block.targetKindSource}' requires a document declaring 'xdbml: 0.7' or later. ` +
          `DBML targets ${KIND_LIST_DBML} (spec §24.7.1).`,
        span: block.span,
      });
      continue;
    }
    if (block.bracketSettings.length > 0) {
      report({
        severity: 'warning',
        code: 'metadata-brackets-ignored',
        message: 'The settings in brackets after a Metadata target apply nothing, as in DBML. ' +
          'Write them in the body of the block (spec §24.7.3).',
        span: block.bracketSettings[0].span,
      });
    }
    const r = resolveMetadataTarget(doc, block, shapes, partials);
    if (!isResolved(r)) {
      report({
        severity: 'error',
        code: 'unresolved-metadata-target',
        message: r.problem === 'other-kind'
          ? `'${block.targetSource}' names ${r.found}, not a ${kind}. Write 'Metadata ${r.found === 'a View' ? 'View' : 'Table'} ${block.targetSource}' (spec §24.7.2).`
          : `Metadata ${block.targetKindSource} '${block.targetSource}' names no ${kind === 'Column' ? 'field' : kind} of the document (spec §24.7.2).`,
        span: block.span,
      });
      continue;
    }

    const seen = new Map<string, Setting>();
    let state = current.get(r.key);
    if (!state) {
      // The element's own settings come first (§24.7.4).
      state = new Map();
      for (const [name, text] of ownValues(r, partials)) state.set(name, { text, from: 'its own declaration' });
      current.set(r.key, state);
    }

    for (const setting of block.settings) {
      const first = seen.get(setting.name);
      if (first) {
        report({
          severity: 'error',
          code: 'duplicate-metadata-setting',
          message: sameWord(first, setting)
            ? `The Metadata block sets '${setting.nameSource}' twice. A block sets each setting once, as in DBML (spec §24.7.3).`
            : `The Metadata block sets ${settingLabel(setting)} twice, as '${first.nameSource}' and as '${setting.nameSource}', ` +
              'two names of one setting. A block sets each setting once (spec §24.7.3).',
          span: setting.span,
        });
        continue;
      }
      seen.set(setting.name, setting);
      if (METADATA_SETTINGS[kind].includes(setting.name)) {
        if (!validBuiltinValue(kind, setting.name, setting.value)) {
          report({
            severity: 'error',
            code: 'invalid-metadata-value',
            message: setting.name === 'note'
              ? `'note' takes a string in single quotes (spec §24.7.3).`
              : `'${setting.nameSource}' takes a color, '#rgb' or '#rrggbb'${kind === 'Note' ? ', or none' : ''} (spec §24.7.3).`,
            span: setting.span,
          });
          continue;
        }
      } else {
        const reason = notSetReason(kind, setting.name);
        if (reason) {
          report({
            severity: 'warning',
            code: 'metadata-custom-property',
            message: `The Metadata block sets '${setting.nameSource}' on ${describeTarget(r)}, which reads as a custom ` +
              `property of that name, as in DBML: ${reason} (spec §24.7.3).`,
            span: setting.span,
          });
        }
      }
      // §24.7.4: a setting an earlier source gave another value. A setting
      // that reads as a custom property of a reserved name stands beside
      // the element's own and replaces nothing.
      if (isMetadataCustomProperty(kind, setting.name)) continue;
      const text = settingValueText(setting.value);
      const before = state.get(setting.name);
      if (before && before.text !== text) {
        report({
          severity: 'warning',
          code: 'metadata-override',
          message: `'${setting.nameSource}' of ${describeTarget(r)} is '${before.text}' in ${before.from}; ` +
            `the Metadata block at ${where(block)} sets '${text}', which applies (spec §24.7.4).`,
          span: setting.span,
        });
      }
      state.set(setting.name, { text, from: `the Metadata block at ${where(block)}` });
    }
  }

  diagnostics.push(...checkDuplicateSettings(doc));
  return diagnostics;
}

/* -------------------------------------------------------------------------
 * Duplicate settings in one list (§24.5)
 * ----------------------------------------------------------------------- */

/** Settings that repeat by design: several checks on a field, several inline refs. */
const REPEATABLE = new Set(['check', 'ref']);

/**
 * Whether two settings of one name are written with the same word: not so
 * for `color` and `headercolor` (§7.5), or `required` and `not null` (§8).
 */
function sameWord (a: Setting, b: Setting): boolean {
  return a.nameSource.toLowerCase() === b.nameSource.toLowerCase();
}

/** A setting named in a message about its two names. */
function settingLabel (s: Setting): string {
  return s.name === 'headercolor' ? 'the header color (spec §7.5)' : `'${s.name}'`;
}

/**
 * Spec §24.5 (v0.7): a setting written twice in one settings list draws a
 * warning; DBML rejects it. `check` and `ref` repeat by design.
 */
function checkDuplicateSettings (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(rec)) {
      if (key === 'span') continue;
      if ((key === 'settings' || key === 'bracketSettings') && Array.isArray(value)
        && rec.kind !== 'MetadataDeclaration' && value.every((v) => (v as { kind?: string })?.kind === 'Setting')) {
        const seen = new Map<string, Setting>();
        for (const s of value as Setting[]) {
          if (s.implied || REPEATABLE.has(s.name)) continue;
          const first = seen.get(s.name);
          if (first) {
            diagnostics.push({
              severity: 'warning',
              code: 'duplicate-setting',
              message: sameWord(first, s)
                ? `'${s.nameSource}' is written twice in one settings list; the first one applies. DBML rejects it (spec §24.5).`
                : `'${first.nameSource}' and '${s.nameSource}' both set ${settingLabel(s)} in one settings list; ` +
                  `the first one, '${first.nameSource}', applies (spec §24.5).`,
              span: s.span,
            });
          } else {
            seen.set(s.name, s);
          }
        }
      } else if (value && typeof value === 'object') {
        visit(value);
      }
    }
  };
  for (const s of doc.statements) {
    // A Metadata block's body is checked above, with an error (§24.7.3).
    if (s.kind === 'MetadataDeclaration') continue;
    visit(s);
  }
  return diagnostics;
}

/* -------------------------------------------------------------------------
 * Imports (§24.7.5)
 * ----------------------------------------------------------------------- */

/**
 * The Metadata blocks a selective import brings with the elements it
 * imports (spec §24.7.5): the blocks of the source file, in their order of
 * precedence, that target one of the elements, a field of one, or an
 * element inside an imported Container. Each block's target is rewritten
 * to the name the element takes in the importing file: its alias, or the
 * bare name an entity imported out of its Container takes.
 *
 * `flatSource` is the flattened source document; `imported` pairs each
 * imported declaration, as found in the source, with the name it lands
 * under.
 */
export function metadataForImport (
  flatSource: XDbmlDocument,
  imported: ReadonlyArray<{ decl: object; name: string }>,
): MetadataDeclaration[] {
  const out: MetadataDeclaration[] = [];
  const blocks = flatSource.statements.filter((s): s is MetadataDeclaration => s.kind === 'MetadataDeclaration');
  if (blocks.length === 0 || imported.length === 0) return out;
  const shapes = shapeIndex(flatSource);
  const partials = tablePartials(flatSource);
  const landing = new Map<object, string>(imported.map((i) => [i.decl, i.name]));
  const containerLanding = new Map<string, string>();
  for (const i of imported) {
    const d = i.decl as { kind?: string; name?: string };
    if (d.kind === 'ContainerDeclaration' && d.name) containerLanding.set(d.name, i.name);
  }
  for (const block of blocks) {
    const r = resolveMetadataTarget(flatSource, block, shapes, partials);
    if (!isResolved(r)) continue;
    let head: string | undefined;
    const own = landing.get(r.decl);
    if (own !== undefined) {
      head = own;
    } else if (r.container && containerLanding.has(r.container.name)) {
      head = joinName([...splitName(containerLanding.get(r.container.name)!), ...splitName((r.decl as { name: string }).name)]);
    } else if (r.kind === 'Container' && containerLanding.has((r.decl as ContainerDeclaration).name)) {
      head = containerLanding.get((r.decl as ContainerDeclaration).name);
    }
    if (head === undefined) continue;
    const target = r.kind === 'Column' && r.fieldPath ? joinName([...splitName(head), ...splitName(r.fieldPath)]) : head;
    out.push({ ...block, target, targetSource: target });
  }
  return out;
}

