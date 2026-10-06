/**
 * TablePartial injection (spec §17.1).
 *
 * The AST keeps a `~name` line as a `PartialInjection` node, where the
 * author wrote it, and leaves the partial's fields in the TablePartial
 * declaration. `effectiveFields()` returns the fields a body holds once its
 * injections are applied, which is what a diagram draws, what a
 * relationship endpoint names, and what a key or an index may list.
 *
 * Conflict resolution follows §17.1, and upstream DBML:
 *
 *   - a field the body declares itself overrides an injected field of the
 *     same name, and keeps its own position;
 *   - among injected fields of the same name, the one of the partial
 *     injected last applies, at the position of that injection;
 *   - the other injected fields sit where their `~name` line is written,
 *     in the order the partial declares them.
 *
 * A `~name` line is read in the body of an Entity or an Edge, and in a
 * body of fields at any depth: `object { }`, `json { }`, a Type, an entry
 * of a `definitions` block. `effectiveFieldList()` applies the same rules
 * to any such list.
 *
 * At the top level of an Entity or an Edge, a TablePartial brings more
 * than its fields, as in upstream DBML: its keys and checks (see
 * `entityConstraints()`), the entries of its `indexes` block
 * (`effectiveIndexes()`), and its header color and its note where the
 * entity declares none (`effectiveHeaderColor()`, `effectiveNote()`). In a
 * nested body only the fields are placed.
 *
 * A TablePartial does not inject another one (§17.1): a `~name` line in
 * the body of a TablePartial, at any depth, is an error the resolver
 * reports. At the top level of a TablePartial it brings no field here.
 */

import type {
  FieldDeclaration,
  IndexEntry,
  IndexesBlock,
  NoteBlock,
  PartialInjection,
  Setting,
  TablePartialDeclaration,
  XDbmlDocument,
} from './ast.ts';

/** A field of a body, with the TablePartial it comes from when it is injected. */
export interface EffectiveField {
  field: FieldDeclaration;
  /**
   * The TablePartial that declares the field. Undefined for a field the
   * body declares itself. The field's type names resolve where the partial
   * is declared (§15.8.2), not in the receiving entity.
   */
  partial?: TablePartialDeclaration;
  /** The `~name` line of the body through which the field arrives. */
  injection?: PartialInjection;
}

/** Anything that returns a TablePartial by name; a Map does. */
export interface PartialLookup {
  get (name: string): TablePartialDeclaration | undefined;
}

/**
 * The TablePartials of a document, by name. They are top-level
 * declarations (§17.1), so a flattened document lists them all.
 */
export function tablePartials (doc: XDbmlDocument): Map<string, TablePartialDeclaration> {
  const m = new Map<string, TablePartialDeclaration>();
  for (const s of doc.statements) {
    if (s.kind === 'TablePartialDeclaration' && !m.has(s.name)) m.set(s.name, s);
  }
  return m;
}

/**
 * The top-level fields of an Entity, an Edge or a TablePartial, injected
 * fields included, in the order a diagram lists them.
 */
export function effectiveFields (
  decl: { body: ReadonlyArray<{ kind: string }> },
  partials: PartialLookup,
): EffectiveField[] {
  return effectiveFieldList(decl.body, partials);
}

/**
 * The fields of any list that holds field declarations and `~name` lines:
 * the body of an Entity or an Edge, the fields of an `object { }` or a
 * `json { }` type, the body of a Type. Injected fields are in place.
 */
export function effectiveFieldList (
  items: ReadonlyArray<{ kind: string }>,
  partials: PartialLookup,
): EffectiveField[] {
  const slots: EffectiveField[] = [];
  for (const item of items) {
    if (item.kind === 'FieldDeclaration') {
      slots.push({ field: item as FieldDeclaration });
    } else if (item.kind === 'PartialInjection') {
      const injection = item as PartialInjection;
      const partial = partials.get(injection.partialName);
      if (!partial) continue;
      for (const f of partial.body) {
        if (f.kind === 'FieldDeclaration') slots.push({ field: f, partial, injection });
      }
    }
  }

  const own = new Set<string>();
  const lastInjected = new Map<string, number>();
  slots.forEach((s, i) => {
    if (s.partial) lastInjected.set(s.field.name, i);
    else own.add(s.field.name);
  });
  return slots.filter((s, i) =>
    !s.partial || (!own.has(s.field.name) && lastInjected.get(s.field.name) === i));
}

/** True when the body holds at least one `~name` line. */
export function hasPartialInjection (decl: { body: ReadonlyArray<{ kind: string }> }): boolean {
  return decl.body.some((b) => b.kind === 'PartialInjection');
}

/**
 * The TablePartials a body injects, each once, in the order of their
 * `~name` lines. Their constraints add to the body's own (§10.1).
 */
export function injectedPartials (
  decl: { body: ReadonlyArray<{ kind: string }> },
  partials: PartialLookup,
): TablePartialDeclaration[] {
  const out: TablePartialDeclaration[] = [];
  for (const item of decl.body) {
    if (item.kind !== 'PartialInjection') continue;
    const partial = partials.get((item as PartialInjection).partialName);
    if (partial && !out.includes(partial)) out.push(partial);
  }
  return out;
}

/* -------------------------------------------------------------------------
 * What a TablePartial brings besides its fields (§17.1, as upstream DBML)
 * ----------------------------------------------------------------------- */

type Declared = { body: ReadonlyArray<{ kind: string }>; settings?: ReadonlyArray<Setting> };

/** An index of an entity, with the TablePartial that declares it when it is injected. */
export interface EffectiveIndex {
  entry: IndexEntry;
  partial?: TablePartialDeclaration;
}

/**
 * The indexes of an Entity or an Edge: the entries of its own `indexes`
 * block, then those of the TablePartials it injects, in the order of the
 * `~name` lines. An entry of a partial names fields of the partial, which
 * the entity holds.
 */
export function effectiveIndexes (decl: Declared, partials: PartialLookup): EffectiveIndex[] {
  const out: EffectiveIndex[] = [];
  const read = (body: ReadonlyArray<{ kind: string }>, partial?: TablePartialDeclaration): void => {
    for (const item of body) {
      if (item.kind !== 'IndexesBlock') continue;
      for (const entry of (item as IndexesBlock).entries) out.push(partial ? { entry, partial } : { entry });
    }
  };
  read(decl.body);
  for (const partial of injectedPartials(decl, partials)) read(partial.body, partial);
  return out;
}

/**
 * The `headercolor` setting that applies to an Entity: its own, otherwise
 * that of the last TablePartial injected that declares one.
 */
export function effectiveHeaderColor (decl: Declared, partials: PartialLookup): Setting | undefined {
  const own = decl.settings?.find((s) => s.name === 'headercolor');
  if (own) return own;
  let found: Setting | undefined;
  for (const partial of injectedPartials(decl, partials)) {
    found = partial.settings.find((s) => s.name === 'headercolor') ?? found;
  }
  return found;
}

/** The note a body declares: `Note` in the body first, then `note:` in the brackets. */
function declaredNote (decl: Declared): string | undefined {
  const block = decl.body.find((b) => b.kind === 'NoteBlock') as NoteBlock | undefined;
  if (block) return block.body;
  const setting = decl.settings?.find((s) => s.name === 'note');
  return setting?.value?.kind === 'StringValue' ? setting.value.value : undefined;
}

/**
 * The note that applies to an Entity or an Edge: its own, otherwise that
 * of the last TablePartial injected that declares one, which `partial`
 * then names.
 */
export function effectiveNote (
  decl: Declared,
  partials: PartialLookup,
): { body: string; partial?: TablePartialDeclaration } | undefined {
  const own = declaredNote(decl);
  if (own !== undefined) return { body: own };
  let found: { body: string; partial: TablePartialDeclaration } | undefined;
  for (const partial of injectedPartials(decl, partials)) {
    const note = declaredNote(partial);
    if (note !== undefined) found = { body: note, partial };
  }
  return found;
}
