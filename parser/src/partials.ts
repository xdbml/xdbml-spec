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
 * A TablePartial does not inject another one (§17.1): a `~name` line in
 * the body of a TablePartial, at any depth, is an error the resolver
 * reports. At the top level of a TablePartial it brings no field here.
 */

import type {
  FieldDeclaration,
  PartialInjection,
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
