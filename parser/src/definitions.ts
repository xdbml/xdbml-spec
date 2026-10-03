/**
 * Internal definitions (spec §15.8, v0.6.5).
 *
 * An entity declares, in a `definitions { }` block, named types visible
 * only inside it. Each entry is a Type declaration written without the
 * `Type` keyword. This module holds what the other passes share:
 *
 *   - `entityDefinitions()`: the entries of a body, by name, as the name
 *     resolver, the key-path walker and the module resolver look them up.
 *   - `checkDefinitions()`: the conditions of §15.8.6, with the targets
 *     of §15.8.4 from targets.ts. The shadowing warning needs the symbol
 *     table, so the caller passes a predicate.
 *   - `inlineInternalDefinitions()`: the shape a field imported on its own
 *     takes when its type names internal definitions (§15.8.3).
 *
 * A type name resolves where it is written (§15.8.2): inside the entity,
 * among its entries first; inside the body of a project Type, among the
 * project's declarations only, even when that Type is used in an entity
 * with an entry of the same name. The walkers that follow a path through
 * types therefore carry the scope of each step, as a `LocalTypes` map or
 * `undefined` for the project scope.
 */

import type {
  ContainerBodyItem,
  ContainerDeclaration,
  EntityBodyItem,
  FieldDeclaration,
  NoteBlock,
  PartialInjection,
  Setting,
  TypeDeclaration,
  TopLevelStatement,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic } from './name-resolver.ts';
import { SCALAR_TYPES, BSON_TYPES } from './keywords.ts';
import { declarationTarget, isDefinitionsExcludedTarget } from './targets.ts';

/** The internal definitions visible in one entity, by name. */
export type LocalTypes = ReadonlyMap<string, TypeDeclaration>;

const BUILTIN = new Set<string>([...SCALAR_TYPES, ...BSON_TYPES].map((t) => t.toLowerCase()));

/**
 * The entries of the `definitions` blocks of a body, by name. The first
 * entry of a name is kept; an entry under the name of a built-in type is
 * left out, since built-in types take precedence (§15.2). A second block
 * and a repeated name are errors that `checkDefinitions` reports; their
 * entries still resolve here, so one mistake does not cascade.
 */
export function entityDefinitions (body: ReadonlyArray<EntityBodyItem>): Map<string, TypeDeclaration> {
  const out = new Map<string, TypeDeclaration>();
  for (const item of body) {
    if (item.kind !== 'DefinitionsBlock') continue;
    for (const entry of item.entries) {
      if (!out.has(entry.name) && !BUILTIN.has(entry.name.toLowerCase())) out.set(entry.name, entry);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Conditions (§15.8.6)
 * ----------------------------------------------------------------------- */

/**
 * Report the conditions of §15.8.6 for every body of the document. Each is
 * an error whatever version the document declares, since no parser read a
 * `definitions` block before 0.6.5; the shadowing warning is a warning.
 *
 * `isDeclaredOutside(name)` tells whether a type name resolves to a Type or
 * an Enum declared outside the entity. Without it, no shadowing warning is
 * reported. A `definitions` block in a View is a parse error (§15.8.1).
 */
export function checkDefinitions (
  doc: XDbmlDocument,
  isDeclaredOutside?: (name: string) => boolean,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const checkBody = (decl: TopLevelStatement | ContainerBodyItem, container: ContainerDeclaration | undefined): void => {
    if (decl.kind !== 'EntityDeclaration' && decl.kind !== 'TablePartialDeclaration' && decl.kind !== 'EdgeDeclaration') return;
    const blocks = decl.body.filter((b) => b.kind === 'DefinitionsBlock');
    if (blocks.length === 0) return;

    if (decl.kind !== 'EntityDeclaration') {
      const what = decl.kind === 'EdgeDeclaration' ? 'Edge' : 'TablePartial';
      for (const block of blocks) {
        diagnostics.push({
          severity: 'error',
          code: 'definitions-outside-entity',
          message: `${what} '${decl.name}' holds a definitions block: internal definitions belong to an entity, ` +
            'and a shape reused here is declared as a Type (spec §15.8.1).',
          span: block.span,
        });
      }
      return;
    }

    const target = declarationTarget(doc, container);
    if (target !== undefined && isDefinitionsExcludedTarget(target)) {
      diagnostics.push({
        severity: 'error',
        code: 'definitions-unsupported-target',
        message: `'${decl.name}' declares internal definitions, but its target, ${target}, takes none. ` +
          'Declare each shape as a Type at the top of the document (spec §15.8.4).',
        span: blocks[0].span,
      });
    }

    for (const block of blocks.slice(1)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-definitions-block',
        message: `'${decl.name}' declares a second definitions block; an entity body holds at most one (spec §15.8.1).`,
        span: block.span,
      });
    }

    const seen = new Set<string>();
    for (const block of blocks) {
      if (block.kind !== 'DefinitionsBlock') continue;
      for (const entry of block.entries) {
        if (BUILTIN.has(entry.name.toLowerCase())) {
          diagnostics.push({
            severity: 'error',
            code: 'named-type-shadows-builtin',
            message: `The internal definition '${entry.name}' of '${decl.name}' takes the name of a built-in type. ` +
              `Built-in types take precedence, so a field typed ${entry.name.toLowerCase()} keeps the built-in type: ` +
              'rename the definition (spec §15.8.2).',
            span: entry.span,
          });
          continue;
        }
        if (seen.has(entry.name)) {
          diagnostics.push({
            severity: 'error',
            code: 'duplicate-definition',
            message: `'${entry.name}' is declared twice in the definitions of '${decl.name}' (spec §15.8.2).`,
            span: entry.span,
          });
          continue;
        }
        seen.add(entry.name);
        if (isDeclaredOutside?.(entry.name)) {
          diagnostics.push({
            severity: 'warning',
            code: 'definition-shadows-type',
            message: `The internal definition '${entry.name}' of '${decl.name}' takes the name of a Type or an Enum ` +
              `declared outside the entity; within '${decl.name}' the definition takes precedence (spec §15.8.2).`,
            span: entry.span,
          });
        }
      }
    }
  };

  for (const s of doc.statements) {
    if (s.kind === 'ContainerDeclaration') {
      for (const b of s.body) checkBody(b, s);
    } else {
      checkBody(s, undefined);
    }
  }
  return diagnostics;
}

/* -------------------------------------------------------------------------
 * Field-level imports (§15.8.3)
 * ----------------------------------------------------------------------- */

type BodyField = FieldDeclaration | NoteBlock | PartialInjection;

/**
 * A copy of `field` in which every type name that resolves among `local`
 * is replaced with the shape of that definition, entries it names
 * included. The settings of a scalar definition move to the field, the
 * array element, the tuple element or the alternative it types, under
 * that place's own settings, which take precedence. A name inside the
 * body of a project Type is left alone: it resolves at project scope.
 *
 * A definition reached again while its own shape is being copied has no
 * finite shape, so the copy stops with an Error naming it. `context`
 * opens that message, e.g. "Field import 'crm.customers.billing'".
 */
export function inlineInternalDefinitions (field: FieldDeclaration, local: LocalTypes, context: string): FieldDeclaration {
  return inlineField(field, local, [], context);
}

function inlineField (f: FieldDeclaration, local: LocalTypes, stack: string[], context: string): FieldDeclaration {
  const r = inlineType(f.type, local, stack, context);
  return { ...f, type: r.type, settings: mergeSettings(r.settings, f.settings) };
}

function inlineBody (fields: ReadonlyArray<BodyField>, local: LocalTypes, stack: string[], context: string): BodyField[] {
  return fields.map((x) => (x.kind === 'FieldDeclaration' ? inlineField(x, local, stack, context) : x));
}

function inlineType (
  t: TypeExpression,
  local: LocalTypes,
  stack: string[],
  context: string,
): { type: TypeExpression; settings: Setting[] } {
  switch (t.kind) {
    case 'ScalarType':
    case 'NamedTypeReference': {
      const td = BUILTIN.has(t.name.toLowerCase()) ? undefined : local.get(t.name);
      if (!td) return { type: t, settings: [] };
      if (stack.includes(td.name)) {
        throw new Error(
          `${context} reaches the recursive internal definition '${td.name}': a recursive definition has no ` +
          'finite shape to copy, so the field cannot be imported on its own (spec §15.8.3).',
        );
      }
      const next = [...stack, td.name];
      if (td.scalarBase) {
        const r = inlineType(td.scalarBase, local, next, context);
        return { type: r.type, settings: mergeSettings(r.settings, td.settings) };
      }
      return {
        type: { kind: 'ObjectType', keyword: 'object', fields: inlineBody(td.body, local, next, context), span: td.span },
        settings: td.settings,
      };
    }
    case 'ObjectType':
      return { type: { ...t, fields: inlineBody(t.fields, local, stack, context) }, settings: [] };
    case 'JsonType':
      return { type: t.fields ? { ...t, fields: inlineBody(t.fields, local, stack, context) } : t, settings: [] };
    case 'ArrayType': {
      if (!t.elementType) return { type: t, settings: [] };
      const r = inlineType(t.elementType, local, stack, context);
      const elementSettings = r.settings.length > 0 ? mergeSettings(r.settings, t.elementSettings ?? []) : t.elementSettings;
      return { type: { ...t, elementType: r.type, ...(elementSettings ? { elementSettings } : {}) }, settings: [] };
    }
    case 'SetType':
      return { type: { ...t, elementType: inlineType(t.elementType, local, stack, context).type }, settings: [] };
    case 'MapType':
      return {
        type: {
          ...t,
          keyType: inlineType(t.keyType, local, stack, context).type,
          valueType: inlineType(t.valueType, local, stack, context).type,
        },
        settings: [],
      };
    case 'TupleType':
      return {
        type: {
          ...t,
          elements: t.elements.map((e) => {
            const r = inlineType(e.type, local, stack, context);
            return { ...e, type: r.type, settings: mergeSettings(r.settings, e.settings) };
          }),
        },
        settings: [],
      };
    case 'OneOfType':
    case 'AnyOfType':
    case 'AllOfType':
      return {
        type: {
          ...t,
          alternatives: t.alternatives.map((a) => {
            const r = inlineType(a.type, local, stack, context);
            return { ...a, type: r.type, settings: mergeSettings(r.settings, a.settings) };
          }),
        },
        settings: [],
      };
    case 'UnionType':
      // A union holds scalar and named types only (§21.1), so a member that
      // names a scalar definition becomes its base when that base is a
      // scalar or named type; any other member keeps its name.
      return {
        type: {
          ...t,
          members: t.members.map((m) => {
            if (m.kind === 'NullTypeLiteral') return m;
            const r = inlineType(m, local, stack, context);
            return r.type.kind === 'ScalarType' || r.type.kind === 'NamedTypeReference' ? r.type : m;
          }),
        },
        settings: [],
      };
    default:
      return { type: t, settings: [] };
  }
}

/** `base` overlaid with `override`; `null` and `not null` count as one setting. */
function mergeSettings (base: ReadonlyArray<Setting>, override: ReadonlyArray<Setting>): Setting[] {
  if (base.length === 0) return [...override];
  const key = (s: Setting): string => {
    const n = s.name.toLowerCase();
    return n === 'null' || n === 'not null' ? '#nullability' : n;
  };
  const overridden = new Set(override.map(key));
  return [...base.filter((s) => !overridden.has(key(s))), ...override];
}
