/**
 * Relationship helpers and checks (spec 11.10 through 11.12, new in v0.4).
 *
 * A `Ref` carries its relationship type in its settings block. The
 * `foreign_master` flag marks denormalized replication: the parent endpoint
 * holds the master value for a copy held at the child endpoint. Absence of
 * the flag marks a referential relationship, the foreign key.
 *
 * This module holds three things:
 *
 *   1. `relationshipType()` and `isForeignMaster()` -- one definition of the
 *      type test, so the renderer, the MCP server, and any generator agree
 *      rather than each re-reading the settings array.
 *
 *   2. `refChildEndpoint()` / `refParentEndpoint()` -- which side of a Ref is
 *      the child. The cardinality operator decides: `>` and `-` put the child
 *      on the left, `<` puts it on the right. `<>` has no single child.
 *
 *   3. `checkRelationships()` -- the semantic rules of spec 11.11 that the
 *      grammar cannot express. Called from `resolveNames()`, so every
 *      consumer of the resolver's diagnostics gets them without opting in.
 */

import type {
  Diagnostic,
} from './name-resolver.ts';
import type {
  ContainerDeclaration,
  EntityDeclaration,
  FieldDeclaration,
  PathSegment,
  RefDeclaration,
  RefEndpoint,
  RefValue,
  Setting,
  Span,
  XDbmlDocument,
} from './ast.ts';

/* -------------------------------------------------------------------------
 * Relationship type
 * ----------------------------------------------------------------------- */

export type RelationshipType = 'referential' | 'foreign_master';

/** The flag name, spelled once. */
export const FOREIGN_MASTER_FLAG = 'foreign_master';

/** Accepted values of the `constraint_type` setting (spec 11.15). */
export const CONSTRAINT_TYPES = ['identifying', 'non_identifying'] as const;
export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/**
 * Relationship settings introduced in v0.4 alongside the foreign master
 * flag. Gated on the declared version like the flag itself, so a document
 * declaring an earlier version does not quietly carry v0.4 semantics.
 */
export const V04_RELATIONSHIP_SETTINGS = [
  'source_role',
  'target_role',
  'source_verb',
  'target_verb',
  'constraint_type',
] as const;

/** The `constraint_type` a Ref declares, or undefined when unstated. */
export function constraintType (ref: RefDeclaration): ConstraintType | undefined {
  const s = ref.settings.find((x) => x.name === 'constraint_type');
  if (!s || !s.value) return undefined;
  const raw = settingText(s);
  return (CONSTRAINT_TYPES as ReadonlyArray<string>).includes(raw)
    ? raw as ConstraintType
    : undefined;
}

/** True when the Ref is marked `undirected: true` (spec 11.16.2). */
export function isUndirected (ref: RefDeclaration): boolean {
  const s = ref.settings.find((x) => x.name === 'undirected');
  return !!s && !!s.value && settingText(s) === 'true';
}

/** The text of a setting value, for the string-ish value kinds. */
function settingText (s: Setting): string {
  const v = s.value;
  if (!v) return '';
  switch (v.kind) {
    case 'StringValue':
    case 'IdentifierValue':
    case 'NumberValue':
      return String((v as { value: string }).value);
    case 'BooleanValue':
      return String((v as unknown as { value: boolean }).value);
    default:
      return '';
  }
}

/**
 * True when a settings array carries the `foreign_master` flag. The flag
 * takes no value, so presence is the whole test; a `foreign_master: true`
 * spelling is accepted as well rather than silently ignored, since a user
 * reaching for the more explicit form means the same thing.
 */
export function hasForeignMasterFlag (settings: ReadonlyArray<Setting>): boolean {
  return settings.some((s) => s.name === FOREIGN_MASTER_FLAG);
}

/** The relationship type a Ref declares. */
export function relationshipType (ref: RefDeclaration): RelationshipType {
  return hasForeignMasterFlag(ref.settings) ? 'foreign_master' : 'referential';
}

/** Convenience wrapper over `relationshipType`. */
export function isForeignMaster (ref: RefDeclaration): boolean {
  return relationshipType(ref) === 'foreign_master';
}

/* -------------------------------------------------------------------------
 * Which end is the child
 * ----------------------------------------------------------------------- */

/**
 * The child endpoint of a Ref, i.e. the side holding the copy (for a foreign
 * master) or the foreign key (for a referential relationship).
 *
 *   a.x > b.y    many a to one b     -> a.x is the child
 *   a.x < b.y    one a to many b     -> b.y is the child
 *   a.x - b.y    one to one          -> a.x is the child, by convention
 *   a.x <> b.y   many to many        -> no single child; returns undefined
 */
export function refChildEndpoint (ref: RefDeclaration): RefEndpoint | undefined {
  switch (ref.spec.operator) {
    case '>':
    case '-':
      return ref.spec.source;
    case '<':
      return ref.spec.target;
    default:
      return undefined;
  }
}

/** The parent endpoint of a Ref, i.e. the opposite side of the child. */
export function refParentEndpoint (ref: RefDeclaration): RefEndpoint | undefined {
  switch (ref.spec.operator) {
    case '>':
    case '-':
      return ref.spec.target;
    case '<':
      return ref.spec.source;
    default:
      return undefined;
  }
}

/**
 * Every name an entity answers to in a document: its own name, and its
 * container-qualified name where it sits inside one. Mirrors the index the
 * renderer builds, so both agree on what an entity-level path looks like.
 */
export function entityNames (doc: XDbmlDocument): Set<string> {
  const names = new Set<string>();
  const add = (name: string, container?: string): void => {
    names.add(name);
    if (container) names.add(`${container}.${name}`);
  };
  for (const stmt of doc.statements) {
    if (stmt.kind === 'EntityDeclaration') add(stmt.name);
    else if (stmt.kind === 'ContainerDeclaration') {
      for (const item of stmt.body) {
        if (item.kind === 'EntityDeclaration') add((item as EntityDeclaration).name, stmt.name);
      }
    }
  }
  return names;
}

/**
 * True when an endpoint names an entity and stops there (spec 11.16), as in
 * `Customer` or `shop.orders`. A structural test is not enough: `b.aid` has
 * the same shape and names a field, so the whole path is checked against the
 * entities the document declares.
 */
export function isEntityLevelEndpoint (endpoint: RefEndpoint, names: Set<string>): boolean {
  if (endpoint.compositeFields && endpoint.compositeFields.length > 0) return false;
  if (!endpoint.path.every((seg) => seg.kind === 'PathField')) return false;
  return names.has(pathToString(endpoint.path));
}

/** Render a path as a dotted string, for messages and for identity keys. */
export function pathToString (path: ReadonlyArray<PathSegment>): string {
  return path
    .map((seg) => {
      switch (seg.kind) {
        case 'PathField':       return seg.name;
        case 'PathArrayIndex':  return `[${seg.index}]`;
        case 'PathArrayWildcard': return '[*]';
        case 'PathMapKey':      return `[${seg.key}]`;
        default:                return '?';
      }
    })
    .join('.');
}

/* -------------------------------------------------------------------------
 * Version gating
 * ----------------------------------------------------------------------- */

/**
 * True when the document declares at least `min`. A document with no version
 * declaration is plain DBML and supports no xDBML construct, so it fails
 * every gate.
 *
 * Kept general rather than special-cased to the foreign master flag: the
 * module-system gates described in the grammar notes are not implemented yet
 * and can adopt this helper when they are.
 */
export function versionAtLeast (doc: XDbmlDocument, min: string): boolean {
  if (!doc.version) return false;
  const parse = (v: string) => v.split('.').map((n) => Number(n) || 0);
  const have = parse(doc.version.version);
  const want = parse(min);
  for (let i = 0; i < Math.max(have.length, want.length); i++) {
    const a = have[i] ?? 0;
    const b = want[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/* -------------------------------------------------------------------------
 * Checks
 * ----------------------------------------------------------------------- */

/**
 * Semantic checks for foreign master relationships (spec 11.11), plus the
 * inline-form rule of 11.10.2 and the version gate of section 4.
 *
 * The composite rule is checked here rather than in the grammar so the error
 * can name the flag that makes the composite invalid, instead of failing on
 * a form that is perfectly legal for a referential relationship.
 */
export function checkRelationships (doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Child endpoints already claimed by a foreign master, so a second one
  // into the same attribute can be reported. Keyed by the dotted path.
  const claimedChildren = new Map<string, Span>();

  let sawForeignMaster = false;

  const noteForeignMaster = () => { sawForeignMaster = true; };

  /* ---- top-level and container-level Ref declarations ---- */

  const declaredEntities = entityNames(doc);

  // Any v0.4 relationship setting present anywhere in the document, so the
  // version gate below covers the documentation settings as well as the flag.
  let sawV04Setting = false;

  const checkRelationshipSettings = (ref: RefDeclaration): void => {
    const entityLevel = isEntityLevelEndpoint(ref.spec.source, declaredEntities)
      && isEntityLevelEndpoint(ref.spec.target, declaredEntities);

    for (const setting of ref.settings) {
      if ((V04_RELATIONSHIP_SETTINGS as ReadonlyArray<string>).includes(setting.name)) {
        sawV04Setting = true;
      }

      // 11.15: the value vocabulary is closed, so a typo is an error rather
      // than a silently ignored setting.
      if (setting.name === 'constraint_type') {
        const raw = settingText(setting);
        if (!(CONSTRAINT_TYPES as ReadonlyArray<string>).includes(raw)) {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-constraint-type',
            message:
              `'${raw || '(no value)'}' is not a constraint type. ` +
              `Use ${CONSTRAINT_TYPES.map((v) => `'${v}'`).join(' or ')}.`,
            span: setting.span,
          });
        } else if (isForeignMaster(ref)) {
          // 11.15: a foreign master carries no key dependency, so there is
          // nothing for identifying or non-identifying to describe.
          diagnostics.push({
            severity: 'error',
            code: 'constraint-type-on-foreign-master',
            message:
              "'constraint_type' does not apply to a foreign master relationship, which carries no key dependency.",
            span: setting.span,
          });
        }
      }

      if (setting.name === 'undirected') {
        const raw = settingText(setting);
        if (raw !== 'true' && raw !== 'false') {
          diagnostics.push({
            severity: 'error',
            code: 'invalid-undirected',
            message: `'undirected' takes true or false, not '${raw || '(no value)'}'.`,
            span: setting.span,
          });
        }
      }
    }

    // 11.16.2: many-to-many states a cardinality, and an entity-level
    // relationship states none. A many-to-many that carries its own
    // attributes is an Edge.
    if (entityLevel && ref.spec.operator === '<>') {
      diagnostics.push({
        severity: 'error',
        code: 'entity-level-many-to-many',
        message:
          "'<>' is not available on a relationship between entities: many-to-many states a cardinality, " +
          'which an entity-level relationship leaves unstated. Declare an Edge if the relationship carries its own attributes.',
        span: ref.spec.span ?? ref.span,
      });
    }
  };

  const checkRefDeclaration = (ref: RefDeclaration): void => {
    checkRelationshipSettings(ref);
    if (!isForeignMaster(ref)) return;
    noteForeignMaster();

    // 11.11: neither endpoint may be composite.
    for (const [label, endpoint] of [
      ['source', ref.spec.source],
      ['target', ref.spec.target],
    ] as const) {
      if (endpoint.compositeFields && endpoint.compositeFields.length > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'foreign-master-composite',
          message:
            `A foreign master relationship takes a single attribute on each side; the ${label} endpoint is composite. ` +
            'Write one foreign master relationship per duplicated attribute.',
          span: endpoint.span,
        });
      }
    }

    // 11.11: at most one master per child attribute.
    const child = refChildEndpoint(ref);
    if (child) {
      const key = pathToString(child.path);
      const previous = claimedChildren.get(key);
      if (previous) {
        diagnostics.push({
          severity: 'error',
          code: 'foreign-master-duplicate-child',
          message:
            `'${key}' already has a foreign master. A copied attribute has one master, ` +
            'so a child attribute is the child of at most one foreign master relationship.',
          span: child.span,
        });
      } else {
        claimedChildren.set(key, child.span);
      }
    }
  };

  /* ---- inline refs on fields ---- */

  const checkField = (
    field: FieldDeclaration,
    ownerPath: string,
  ): void => {
    const flag = field.settings.find((s) => s.name === FOREIGN_MASTER_FLAG);
    if (!flag) return;
    noteForeignMaster();

    const inlineRef = field.settings.find(
      (s) => s.value && s.value.kind === 'RefValue',
    );

    // 11.10.2: the flag qualifies an inline ref: and is an error without one.
    if (!inlineRef) {
      diagnostics.push({
        severity: 'error',
        code: 'foreign-master-without-ref',
        message:
          "The 'foreign_master' flag qualifies an inline 'ref:' in the same settings block; " +
          'this field declares no inline ref.',
        span: flag.span,
      });
      return;
    }

    // 11.11: at most one master per child attribute. For an inline ref the
    // child is always the field carrying the setting, whatever the operator.
    const key = `${ownerPath}.${field.name}`;
    const previous = claimedChildren.get(key);
    if (previous) {
      diagnostics.push({
        severity: 'error',
        code: 'foreign-master-duplicate-child',
        message:
          `'${key}' already has a foreign master. A copied attribute has one master, ` +
          'so a child attribute is the child of at most one foreign master relationship.',
        span: field.span,
      });
    } else {
      claimedChildren.set(key, field.span);
    }

    // 11.11: an inline foreign master cannot be composite, because the
    // grammar gives an inline ref a single target; nothing to check here.
  };

  /* ---- walk ---- */

  const walkFields = (
    items: ReadonlyArray<{ kind: string }>,
    ownerPath: string,
  ): void => {
    for (const item of items) {
      if (item.kind !== 'FieldDeclaration') continue;
      const field = item as unknown as FieldDeclaration;
      checkField(field, ownerPath);
      // Descend into nested object/array bodies so a flag on a nested field
      // is checked too. Nested field containers vary by type expression;
      // `nestedFields` below normalizes the shapes the AST uses.
      for (const nested of nestedFields(field)) {
        walkFields([nested], `${ownerPath}.${field.name}`);
      }
    }
  };

  const walkEntity = (entity: EntityDeclaration, containerName?: string): void => {
    const ownerPath = containerName ? `${containerName}.${entity.name}` : entity.name;
    walkFields(entity.body as ReadonlyArray<{ kind: string }>, ownerPath);
  };

  for (const stmt of doc.statements) {
    switch (stmt.kind) {
      case 'RefDeclaration':
        checkRefDeclaration(stmt);
        break;
      case 'EntityDeclaration':
        walkEntity(stmt);
        break;
      case 'ContainerDeclaration': {
        // Ref declarations are top-level only (spec 11.2), so a container
        // body holds entities, views, edges, enums and notes but no refs.
        const container = stmt as ContainerDeclaration;
        for (const item of container.body) {
          if (item.kind === 'EntityDeclaration') walkEntity(item as EntityDeclaration, container.name);
        }
        break;
      }
      default:
        break;
    }
  }

  // Section 4: the construct requires a document declaring 0.4 or later.
  if ((sawForeignMaster || sawV04Setting) && !versionAtLeast(doc, '0.4')) {
    const what = sawForeignMaster
      ? "The 'foreign_master' relationship flag"
      : 'Relationship roles, verbs and constraint type';
    diagnostics.push({
      severity: 'error',
      code: 'construct-requires-version',
      message: `${what} requires a document declaring 'xdbml: 0.4' or later.`,
      span: doc.version ? doc.version.span : doc.span,
    });
  }

  return diagnostics;
}

/* -------------------------------------------------------------------------
 * Helpers
 * ----------------------------------------------------------------------- */

/**
 * The field declarations nested inside a field's type expression, for the
 * object and array shapes the AST produces. Returns an empty array for
 * scalar fields and for type expressions with no inner field list.
 */
function nestedFields (field: FieldDeclaration): FieldDeclaration[] {
  const out: FieldDeclaration[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    if (rec.kind === 'FieldDeclaration') {
      out.push(rec as unknown as FieldDeclaration);
      return; // walkFields recurses into this one itself
    }
    for (const value of Object.values(rec)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit((field as unknown as Record<string, unknown>).type);
  return out;
}

/** Re-exported for consumers that only need the inline ref value shape. */
export type { RefValue };
