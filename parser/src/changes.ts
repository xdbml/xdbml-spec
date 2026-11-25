/**
 * Change blocks (spec §29, v0.8).
 *
 * `applyChanges()` reads the statements of a flattened document in order
 * and builds the model they describe at the end (§29.2): declarations add
 * elements, and each change block changes the model declared above it. The
 * result holds no ChangesDeclaration, so every pass after `flatten()` reads
 * the model as if it had been declared that way.
 *
 * A reference follows the element it names: a rename or a move rewrites
 * every name and path that leads to the element, wherever it is written
 * (relationships, dependencies, Metadata blocks, groups, diagram views,
 * field types, indexes, keys, records). The raw AST is never changed; the
 * statements are copied before they are applied.
 */

import type {
  AddPartAction,
  AlterStatement,
  ChangeElementKind,
  ChangePartTarget,
  ChangesDeclaration,
  ConstraintsBlock,
  ContainerBodyItem,
  ContainerDeclaration,
  DepDependency,
  DropStatement,
  EntityBodyItem,
  EnumDeclaration,
  EnumValue,
  FieldDeclaration,
  IndexComponent,
  IndexesBlock,
  MetadataDeclaration,
  ModifyElementAction,
  ModifyPartAction,
  NoteBlock,
  PartialInjection,
  PathSegment,
  RefEndpoint,
  RefSpec,
  Setting,
  SettingValue,
  Span,
  TopLevelStatement,
  TypeExpression,
  XDbmlDocument,
} from './ast.ts';
import type { Diagnostic, DiagnosticCode } from './name-resolver.ts';
import { joinName, splitName } from './names.ts';
import { pathToString } from './relationships.ts';

/* -------------------------------------------------------------------------
 * Public API
 * ----------------------------------------------------------------------- */

export interface ChangeResult {
  /** The model at the end of the document, without change blocks. */
  statements: TopLevelStatement[];
  /** The Metadata blocks, with their targets following renamed and moved elements. */
  metadata: MetadataDeclaration[];
  diagnostics: Diagnostic[];
}

/** Whether a list of statements holds a change block. */
export function hasChanges (statements: ReadonlyArray<TopLevelStatement>): boolean {
  return statements.some((s) => s.kind === 'ChangesDeclaration');
}

/**
 * Apply the change blocks among `statements` in order (§29.2). `metadata`
 * holds the Metadata blocks of the document, which `flatten()` lists apart;
 * their targets follow the elements they name.
 */
export function applyChanges (
  statements: ReadonlyArray<TopLevelStatement>,
  metadata: ReadonlyArray<MetadataDeclaration> = [],
): ChangeResult {
  const model: Model = {
    statements: [],
    metadata: metadata.map((m) => structuredClone(m)),
    diagnostics: [],
  };
  let seenChanges = false;
  const blocks = statements.filter((s) => s.kind === 'ChangesDeclaration');
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.kind === 'ChangesDeclaration') {
      checkForwardReferences(model, statements.slice(i + 1), stmt);
      applyBlock(model, stmt);
      seenChanges = true;
      continue;
    }
    const copy = structuredClone(stmt);
    if (seenChanges && copy.kind === 'ContainerDeclaration' && mergeContainer(model, copy)) continue;
    model.statements.push(copy);
  }
  if (blocks.length === 0) model.statements = [...statements];
  return { statements: model.statements, metadata: model.metadata, diagnostics: model.diagnostics };
}

/**
 * The diagnostics of the change blocks of a document (§29.16), and of its
 * `uid` settings (§29.15). `resolveNames()` reports them with the others.
 */
export function checkChanges (flatStatements: ReadonlyArray<TopLevelStatement>, doc: XDbmlDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declares08 = doc.version !== undefined && compareVersion(doc.version.version, '0.8') >= 0;
  if (hasChanges(flatStatements)) diagnostics.push(...applyChanges(flatStatements).diagnostics);
  if (declares08) {
    const model = hasChanges(flatStatements) ? applyChanges(flatStatements).statements : [...flatStatements];
    diagnostics.push(...checkUids(model));
  }
  return diagnostics;
}

/* -------------------------------------------------------------------------
 * The model being built
 * ----------------------------------------------------------------------- */

interface Model {
  statements: TopLevelStatement[];
  metadata: MetadataDeclaration[];
  diagnostics: Diagnostic[];
}

type Declaration = TopLevelStatement | ContainerBodyItem;

/** An element of the model, where it sits and the segments of its qualified name. */
interface Located {
  decl: Declaration;
  owner: Declaration[];
  container?: ContainerDeclaration;
  segments: string[];
}

const DECLARATION_KIND: Record<ChangeElementKind, Declaration['kind']> = {
  Container: 'ContainerDeclaration',
  Entity: 'EntityDeclaration',
  View: 'ViewDeclaration',
  Edge: 'EdgeDeclaration',
  Type: 'TypeDeclaration',
  Enum: 'EnumDeclaration',
  Ref: 'RefDeclaration',
  EntityPartial: 'TablePartialDeclaration',
  EntityGroup: 'TableGroupDeclaration',
  SupertypeGroup: 'SupertypeGroupDeclaration',
  DiagramView: 'DiagramViewDeclaration',
  Note: 'NoteDeclaration',
  Dep: 'DepDeclaration',
};

/** The kinds that share the namespace of entities (§15.5), which a bare name may reach inside a Container. */
const CONTAINED_KINDS = new Set<Declaration['kind']>(['EntityDeclaration', 'ViewDeclaration', 'EdgeDeclaration', 'EnumDeclaration', 'NoteDeclaration']);

function declName (decl: Declaration): string | undefined {
  return 'name' in decl && typeof decl.name === 'string' ? decl.name : undefined;
}

/** Every named element of the model, Containers and what they hold included. */
function elements (model: Model): Located[] {
  const out: Located[] = [];
  for (const stmt of model.statements) {
    const name = declName(stmt);
    if (name !== undefined) out.push({ decl: stmt, owner: model.statements, segments: splitName(name) });
    if (stmt.kind !== 'ContainerDeclaration') continue;
    for (const item of stmt.body) {
      const inner = declName(item);
      if (inner !== undefined) out.push({ decl: item, owner: stmt.body, container: stmt, segments: [stmt.name, ...splitName(inner)] });
    }
  }
  return out;
}

/** The names of the Containers of the model, declared or implied by a qualified declaration (§7.3). */
function containerNames (model: Model): Set<string> {
  const names = new Set<string>();
  for (const el of elements(model)) {
    if (el.decl.kind === 'ContainerDeclaration') names.add(el.segments[0]);
    else if (el.segments.length > 1 && CONTAINED_KINDS.has(el.decl.kind)) names.add(el.segments[0]);
  }
  return names;
}

function sameSegments (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

function startsWith (a: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
  return prefix.length <= a.length && prefix.every((s, i) => s === a[i]);
}

/** The element of a kind that a statement names: by its qualified name, or by a bare name only one element carries (§29.4). */
function findElement (model: Model, kind: ChangeElementKind, name: string): Located | undefined {
  const target = splitName(name);
  const candidates = elements(model).filter((el) => el.decl.kind === DECLARATION_KIND[kind]);
  const exact = candidates.find((el) => sameSegments(el.segments, target));
  if (exact) return exact;
  if (target.length !== 1) return undefined;
  const bare = candidates.filter((el) => el.segments[el.segments.length - 1] === target[0]);
  return bare.length === 1 ? bare[0] : undefined;
}

/* -------------------------------------------------------------------------
 * Diagnostics
 * ----------------------------------------------------------------------- */

function report (model: Model, severity: Diagnostic['severity'], code: DiagnosticCode, message: string, span: Span): void {
  model.diagnostics.push({ severity, code, message, span });
}

function error (model: Model, code: DiagnosticCode, message: string, span: Span): void {
  report(model, 'error', code, message, span);
}

/** A statement that `if exists` or `if not exists` skips, reported at the information level (§29.10). */
function skipped (model: Model, message: string, span: Span): void {
  report(model, 'info', 'change-skipped', `${message}, so the statement is skipped (spec §29.10).`, span);
}

function describe (kind: string, name: string): string {
  return `${kind} '${name}'`;
}

/* -------------------------------------------------------------------------
 * Names and paths that lead to elements
 *
 * Every place that names an element is collected as a NameUse: its
 * segments, qualified with the Container when the place wrote an entity's
 * bare name, and a way to rewrite them. A rename or a move rewrites the
 * uses that lead to the element; a drop looks for the uses that would be
 * left naming nothing (§29.6).
 * ----------------------------------------------------------------------- */

type UseRole =
  | 'endpoint'   // a relationship or a dependency, an Edge or a supertype group: a drop is refused
  | 'type'       // the type of a field: a drop is refused
  | 'partial'    // an EntityPartial injection: a drop is refused
  | 'key'        // an index or a key of the entity itself: a drop of the field is refused
  | 'member'     // a member of a group or a diagram view: goes with a dropped element
  | 'metadata'   // the target of a Metadata block: goes with a dropped element
  | 'records'    // a records block or one of its columns: goes with a dropped element
  | 'decl';      // the qualified name of a declaration, rewritten when its Container is renamed

interface NameUse {
  segments: string[];
  role: UseRole;
  /** The elements that hold the use, outermost first; a use held by a dropped element goes with it. */
  holders: unknown[];
  span: Span;
  /** Replace the first `count` segments with `prefix`. */
  replace (count: number, prefix: ReadonlyArray<string>): void;
  remove?: () => void;
}

interface NameContext {
  containers: Set<string>;
  /** An entity, View or Edge in a Container, by its bare name, when only one element carries the name. */
  bare: Map<string, string[]>;
}

function nameContext (model: Model): NameContext {
  const containers = containerNames(model);
  const byBare = new Map<string, string[][]>();
  for (const el of elements(model)) {
    if (!CONTAINED_KINDS.has(el.decl.kind)) continue;
    const last = el.segments[el.segments.length - 1];
    byBare.set(last, [...(byBare.get(last) ?? []), el.segments]);
  }
  const bare = new Map<string, string[]>();
  for (const [name, list] of byBare) if (list.length === 1 && list[0].length > 1) bare.set(name, list[0]);
  return { containers, bare };
}

/** The segments a name or a path leads to, and how many leading segments it left out (§29.2). */
function canonical (written: string[], ctx: NameContext): { segments: string[]; omitted: number } {
  if (written.length > 0 && !ctx.containers.has(written[0])) {
    const full = ctx.bare.get(written[0]);
    if (full) return { segments: [...full.slice(0, -1), ...written], omitted: full.length - 1 };
  }
  return { segments: written, omitted: 0 };
}

function segmentKey (seg: PathSegment): string {
  switch (seg.kind) {
    case 'PathField': return seg.name;
    case 'PathArrayIndex': return `[${seg.index}]`;
    case 'PathArrayWildcard': return '[*]';
    case 'PathMapKey': return `["${seg.key}"]`;
    default: return '?';
  }
}

/**
 * A use of a path, such as the endpoint of a relationship, rewritten in
 * place. `base` holds the segments the use leaves to its context, such as
 * the entity of a key written in the entity's body; a change that lies in
 * the base, or in the Container that a bare entity name leaves out, leaves
 * the use as written.
 */
function pathUse (
  holder: { path: PathSegment[] },
  base: string[],
  role: UseRole,
  holders: unknown[],
  ctx: NameContext,
  span: Span,
): NameUse {
  const { segments, omitted } = canonical([...base, ...holder.path.map(segmentKey)], ctx);
  return {
    segments,
    role,
    holders,
    span,
    replace (count, prefix) {
      const hidden = omitted + base.length;
      if (count <= hidden) return;
      const original = holder.path;
      const keys = [...prefix, ...segments.slice(count)].slice(hidden);
      const changed = prefix.length - hidden;
      const kept = count - hidden;
      holder.path = keys.map((name, i): PathSegment => {
        if (i >= changed) return original[i - changed + kept];
        if (prefix.length === count && segmentKey(original[i]) === name) return original[i];
        return { kind: 'PathField', name, span: original[0]?.span ?? span };
      });
    },
  };
}

/** A use of a name held as a string, such as a group member or a field type; `base` as for `pathUse`. */
function stringUse (
  get: () => string,
  set: (name: string) => void,
  role: UseRole,
  holders: unknown[],
  ctx: NameContext | undefined,
  span: Span,
  remove?: () => void,
  base: string[] = [],
): NameUse {
  const written = [...base, ...splitName(get())];
  const { segments, omitted } = ctx ? canonical(written, ctx) : { segments: written, omitted: 0 };
  const use: NameUse = {
    segments,
    role,
    holders,
    span,
    replace (count, prefix) {
      const hidden = omitted + base.length;
      if (count <= hidden) return;
      set(joinName([...prefix, ...segments.slice(count)].slice(hidden)));
    },
  };
  if (remove) use.remove = remove;
  return use;
}

/** The fields of a body, nested ones included, with their paths. */
function eachField (
  items: ReadonlyArray<{ kind: string }>,
  visit: (field: FieldDeclaration, path: string[], parents: FieldDeclaration[]) => void,
  path: string[] = [],
  parents: FieldDeclaration[] = [],
): void {
  for (const item of items) {
    if (item.kind !== 'FieldDeclaration') continue;
    const field = item as FieldDeclaration;
    visit(field, [...path, field.name], parents);
    const nested = nestedFields(field.type);
    if (nested) eachField(nested.items, visit, [...path, field.name, ...nested.via], [...parents, field]);
  }
}

/** The fields a type holds, and the path segments between the field and them (`[*]` for an array). */
function nestedFields (type: TypeExpression): { items: Array<FieldDeclaration | NoteBlock | PartialInjection>; via: string[] } | undefined {
  if (type.kind === 'ObjectType') return { items: type.fields, via: [] };
  if (type.kind === 'JsonType' && type.fields) return { items: type.fields, via: [] };
  if (type.kind === 'ArrayType' && type.elementType) {
    const inner = nestedFields(type.elementType);
    return inner ? { items: inner.items, via: ['[*]', ...inner.via] } : undefined;
  }
  return undefined;
}

/** The type names a type expression writes, as settable uses. */
function typeUses (type: TypeExpression, holders: unknown[], out: NameUse[]): void {
  if (type.kind === 'ScalarType' || type.kind === 'NamedTypeReference') {
    out.push(stringUse(() => type.name, (n) => { type.name = n; }, 'type', holders, undefined, type.span));
    return;
  }
  if (type.kind === 'ArrayType' && type.elementType) typeUses(type.elementType, holders, out);
  if (type.kind === 'SetType' && type.elementType) typeUses(type.elementType, holders, out);
  if (type.kind === 'MapType') {
    typeUses(type.keyType, holders, out);
    typeUses(type.valueType, holders, out);
  }
  if (type.kind === 'UnionType') for (const m of type.members) if (m.kind !== 'NullTypeLiteral') typeUses(m, holders, out);
}

/** The uses an entity-like body holds: field types, inline relationships, indexes, keys, records, injections. */
function bodyUses (
  body: ReadonlyArray<EntityBodyItem | { kind: string }>,
  owner: string[],
  holders: unknown[],
  ctx: NameContext,
  out: NameUse[],
): void {
  eachField(body, (field, _path, parents) => {
    const fieldHolders = [...holders, ...parents, field];
    typeUses(field.type, fieldHolders, out);
    for (const s of field.settings) {
      if (s.value?.kind === 'RefValue') out.push(pathUse(s.value.target, [], 'endpoint', fieldHolders, ctx, s.span));
    }
  });
  for (const item of body) {
    if (item.kind === 'IndexesBlock') {
      for (const entry of (item as IndexesBlock).entries) {
        for (const c of entry.components) {
          if (c.kind === 'IndexPathComponent') out.push(pathUse(c, owner, 'key', holders, ctx, c.span));
        }
      }
    } else if (item.kind === 'ConstraintsBlock') {
      for (const entry of (item as ConstraintsBlock).entries) {
        if (entry.kind !== 'KeyConstraintEntry') continue;
        entry.fields.forEach((_, i) => {
          const holder = { get path () { return entry.fields[i]; }, set path (p: PathSegment[]) { entry.fields[i] = p; } };
          out.push(pathUse(holder, owner, 'key', holders, ctx, entry.span));
        });
      }
    } else if (item.kind === 'RecordsBlock') {
      const block = item as { columns?: string[]; span: Span };
      for (const column of block.columns ?? []) {
        out.push(stringUse(
          () => column,
          (n) => { block.columns = block.columns!.map((c) => (c === column ? n : c)); },
          'records', holders, undefined, block.span,
          () => { block.columns = block.columns!.filter((c) => c !== column); },
          owner,
        ));
      }
    } else if (item.kind === 'PartialInjection') {
      const inj = item as PartialInjection;
      out.push(stringUse(() => inj.partialName, (n) => { inj.partialName = n; }, 'partial', holders, undefined, inj.span));
    }
  }
}

function endpointUses (ep: RefEndpoint, role: UseRole, holders: unknown[], ctx: NameContext, out: NameUse[]): void {
  out.push(pathUse(ep, [], role, holders, ctx, ep.span));
  const entity = canonical(ep.path.map(segmentKey), ctx).segments;
  for (const field of ep.compositeFields ?? []) {
    out.push(stringUse(
      () => field,
      (n) => { ep.compositeFields = ep.compositeFields!.map((f) => (f === field ? n : f)); },
      role, holders, undefined, ep.span, undefined, entity,
    ));
  }
}

function dependencyUses (dep: DepDependency, holders: unknown[], ctx: NameContext, out: NameUse[]): void {
  for (const up of dep.upstreams) endpointUses(up, 'endpoint', holders, ctx, out);
  if (!dep.upstreams.includes(dep.upstream)) endpointUses(dep.upstream, 'endpoint', holders, ctx, out);
  endpointUses(dep.downstream, 'endpoint', holders, ctx, out);
}

function settingNameUse (s: Setting, role: UseRole, holders: unknown[], ctx: NameContext, out: NameUse[]): void {
  const v = s.value;
  if (!v || (v.kind !== 'StringValue' && v.kind !== 'IdentifierValue')) return;
  out.push(stringUse(() => v.value, (n) => { v.value = n; }, role, holders, ctx, s.span));
}

/** Every use of a name or a path in the model. */
function collectUses (model: Model): NameUse[] {
  const ctx = nameContext(model);
  const out: NameUse[] = [];
  const visit = (decl: Declaration, owner: Declaration[], container?: ContainerDeclaration) => {
    const holders: unknown[] = container ? [container, decl] : [decl];
    const segments = container ? [container.name, ...splitName(declName(decl) ?? '')] : splitName(declName(decl) ?? '');
    switch (decl.kind) {
      case 'EntityDeclaration':
      case 'EdgeDeclaration':
      case 'TablePartialDeclaration':
        bodyUses(decl.body, segments, holders, ctx, out);
        if (decl.kind === 'EdgeDeclaration') {
          for (const s of decl.settings) if (s.name === 'source' || s.name === 'target') settingNameUse(s, 'endpoint', holders, ctx, out);
        }
        break;
      case 'ViewDeclaration':
      case 'TypeDeclaration':
        bodyUses(decl.body, segments, holders, ctx, out);
        if (decl.kind === 'TypeDeclaration' && decl.scalarBase) typeUses(decl.scalarBase, holders, out);
        break;
      case 'RefDeclaration':
        endpointUses(decl.spec.source, 'endpoint', holders, ctx, out);
        endpointUses(decl.spec.target, 'endpoint', holders, ctx, out);
        break;
      case 'DepDeclaration':
        for (const d of decl.dependencies) dependencyUses(d, [...holders, d], ctx, out);
        break;
      case 'TableGroupDeclaration':
        decl.members.forEach((_, i) => {
          out.push(stringUse(() => decl.members[i], (n) => { decl.members[i] = n; }, 'member', holders, ctx, decl.span,
            () => { decl.members = decl.members.filter((_, j) => j !== i); }));
        });
        break;
      case 'SupertypeGroupDeclaration':
        for (const s of decl.settings) if (s.name === 'supertype') settingNameUse(s, 'endpoint', holders, ctx, out);
        for (const m of decl.members) {
          out.push(stringUse(() => m.name, (n) => { m.name = n; }, 'endpoint', holders, ctx, m.span));
        }
        break;
      case 'DiagramViewDeclaration':
        for (const cat of decl.categories) {
          cat.items.forEach((item) => {
            out.push(stringUse(() => item.name, (n) => { item.name = n; }, 'member', holders, ctx, item.span,
              () => { cat.items = cat.items.filter((x) => x !== item); }));
          });
        }
        break;
      case 'TopLevelRecordsDeclaration': {
        out.push(stringUse(() => decl.entityRef, (n) => { decl.entityRef = n; }, 'records', holders, ctx, decl.span,
          () => { removeFrom(owner, decl); }));
        const entity = canonical(splitName(decl.entityRef), ctx).segments;
        for (const column of decl.columns) {
          out.push(stringUse(() => column, (n) => { decl.columns = decl.columns.map((c) => (c === column ? n : c)); }, 'records', holders,
            undefined, decl.span, () => { decl.columns = decl.columns.filter((c) => c !== column); }, entity));
        }
        break;
      }
      default:
        break;
    }
    // A top-level qualified declaration, `Table core.users`, names its Container.
    if (!container && CONTAINED_KINDS.has(decl.kind) && segments.length > 1 && 'name' in decl) {
      const named = decl as { name: string };
      out.push(stringUse(() => named.name, (n) => { named.name = n; }, 'decl', holders, undefined, decl.span));
    }
  };
  for (const stmt of model.statements) {
    visit(stmt, model.statements);
    if (stmt.kind === 'ContainerDeclaration') for (const item of stmt.body) visit(item, stmt.body, stmt);
  }
  for (const block of model.metadata) {
    out.push(stringUse(() => block.target, (n) => { block.target = n; }, 'metadata', [block], ctx, block.span,
      () => { model.metadata = model.metadata.filter((m) => m !== block); }));
  }
  return out;
}

function removeFrom<T> (list: T[], item: T): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Rewrite every use that leads to `from` so that it leads to `to` (§29.2,
 * §29.9). The uses are collected before the element changes, while a bare
 * name still leads to it.
 */
function rewriteUses (uses: ReadonlyArray<NameUse>, from: ReadonlyArray<string>, to: ReadonlyArray<string>, roles?: (role: UseRole) => boolean): void {
  for (const use of uses) {
    if (roles && !roles(use.role)) continue;
    if (startsWith(use.segments, from)) use.replace(from.length, to);
  }
}

/** The uses that lead to `target` and that `drop` would leave naming nothing (§29.6). */
function blockingUses (model: Model, target: ReadonlyArray<string>, dropped: unknown, roles: ReadonlySet<UseRole>): NameUse[] {
  return collectUses(model).filter((use) => roles.has(use.role) && startsWith(use.segments, target) && !use.holders.includes(dropped));
}

/** Remove the uses that go with a dropped element: memberships, Metadata blocks, records (§29.6). */
function removeFollowers (model: Model, target: ReadonlyArray<string>): void {
  for (const use of collectUses(model)) {
    if ((use.role === 'member' || use.role === 'metadata' || use.role === 'records') && startsWith(use.segments, target)) use.remove?.();
  }
}

function lineOf (span: Span): number {
  return span.start.line;
}

/* -------------------------------------------------------------------------
 * Order of the document (§29.2)
 * ----------------------------------------------------------------------- */

/**
 * A declaration above a change block never names an element declared below
 * it. Before a block applies, every relationship, dependency and field type
 * of the model must lead to an element of the model; one that leads to an
 * element declared further down is an error.
 */
function checkForwardReferences (model: Model, later: ReadonlyArray<TopLevelStatement>, block: ChangesDeclaration): void {
  const laterModel: Model = { statements: later.filter((s) => s.kind !== 'ChangesDeclaration'), metadata: [], diagnostics: [] };
  const laterNames = elements(laterModel).map((el) => el.segments);
  if (laterNames.length === 0) return;
  const known = elements(model).map((el) => el.segments);
  for (const use of collectUses(model)) {
    if (use.role !== 'endpoint' && use.role !== 'type') continue;
    if (known.some((k) => startsWith(use.segments, k))) continue;
    const target = laterNames.find((k) => startsWith(use.segments, k) || (k.length > 1 && startsWith(use.segments, k.slice(1))));
    if (!target) continue;
    error(model, 'forward-reference-across-changes',
      `'${joinName(use.segments)}' names ${joinName(target)}, which is declared below the change block of line ${lineOf(block.span)}. ` +
      'A declaration never names an element declared below a change block between the two (spec §29.2).', use.span);
  }
}

/**
 * Below a change block, a Container declared again adds the elements of its
 * body to the Container (§29.11). Returns false when no such Container
 * exists, and the declaration is then an ordinary one.
 */
function mergeContainer (model: Model, decl: ContainerDeclaration): boolean {
  const existing = model.statements.find((s): s is ContainerDeclaration => s.kind === 'ContainerDeclaration' && s.name === decl.name);
  if (!existing) return false;
  if (decl.settings.length > 0) {
    error(model, 'container-redeclared',
      `Container '${decl.name}' is declared again below a change block with settings. A second declaration only adds elements; ` +
      `'alter Container ${decl.name} modify [...]' changes its settings (spec §29.11).`, decl.span);
  }
  for (const item of decl.body) {
    const name = declName(item);
    if (name !== undefined && existing.body.some((x) => x.kind === item.kind && declName(x) === name)) {
      error(model, 'container-redeclared',
        `Container '${decl.name}' already holds ${name}; a second declaration of the Container only adds new elements (spec §29.11).`, item.span);
      continue;
    }
    if (item.kind !== 'NoteBlock') existing.body.push(item);
  }
  return true;
}

/* -------------------------------------------------------------------------
 * Statements
 * ----------------------------------------------------------------------- */

function applyBlock (model: Model, block: ChangesDeclaration): void {
  for (const stmt of block.statements) {
    switch (stmt.kind) {
      case 'CreateStatement': applyCreate(model, stmt.declaration, stmt.ifNotExists, stmt.span); break;
      case 'DropStatement': applyDrop(model, stmt); break;
      case 'AlterStatement': applyAlter(model, stmt); break;
    }
  }
}

function kindOfDeclaration (decl: TopLevelStatement): ChangeElementKind | undefined {
  const entry = Object.entries(DECLARATION_KIND).find(([, k]) => k === decl.kind);
  return entry ? (entry[0] as ChangeElementKind) : undefined;
}

function applyCreate (model: Model, declaration: TopLevelStatement, ifNotExists: boolean, span: Span): void {
  const copy = structuredClone(declaration);
  const kind = kindOfDeclaration(copy);
  const name = declName(copy);
  let existing = false;
  if (copy.kind === 'RefDeclaration' && name === undefined) {
    existing = findRefByEndpoints(model, copy.spec) !== undefined;
  } else if (kind !== undefined && name !== undefined) {
    const segments = splitName(name);
    existing = elements(model).some((el) => el.decl.kind === DECLARATION_KIND[kind] && sameSegments(el.segments, segments));
  }
  if (existing) {
    const what = describe(kind ?? 'element', name ?? 'with these endpoints');
    if (ifNotExists) skipped(model, `${what} already exists`, span);
    else error(model, 'change-element-exists', `${what} already exists; 'create' adds a new element (spec §29.5).`, span);
    return;
  }
  if (copy.kind === 'ContainerDeclaration' && mergeContainer(model, copy)) return;
  // `create Table core.x { ... }` puts the entity in Container `core` when the document declares it (§7.3).
  const segments = name !== undefined ? splitName(name) : [];
  const container = segments.length === 2 && CONTAINED_KINDS.has(copy.kind)
    ? model.statements.find((s): s is ContainerDeclaration => s.kind === 'ContainerDeclaration' && s.name === segments[0])
    : undefined;
  if (container) {
    (copy as ContainerBodyItem & { name: string }).name = segments[1];
    container.body.push(copy as ContainerBodyItem);
    return;
  }
  model.statements.push(copy);
}

/** Find the element a statement names, reporting it when it does not exist and `if exists` does not apply. */
function locate (model: Model, kind: ChangeElementKind, name: string, ifExists: boolean, verb: string, span: Span, keyword: string = kind): Located | undefined {
  const found = findElement(model, kind, name);
  if (found) return found;
  if (ifExists) skipped(model, `${describe(keyword, name)} does not exist`, span);
  else error(model, 'change-target-not-found', `'${verb}' names ${describe(keyword, name)}, which does not exist at this point of the document (spec §29.4).`, span);
  return undefined;
}

/** The `uid` a statement writes, in the brackets that name its target or in those of a `modify`. */
function uidOf (...lists: ReadonlyArray<ReadonlyArray<Setting>>): string | undefined {
  for (const list of lists) {
    const s = list.find((x) => x.name === 'uid');
    if (s) return valueText(s.value);
  }
  return undefined;
}

function carriesUid (node: unknown, uid: string): boolean {
  const settings = (node as { settings?: Setting[] }).settings;
  return Array.isArray(settings) && settings.some((s) => s.name === 'uid' && valueText(s.value) === uid);
}

function uidNotFound (model: Model, what: string, uid: string, ifExists: boolean, verb: string, span: Span): void {
  if (ifExists) skipped(model, `No ${what} carries uid '${uid}'`, span);
  else error(model, 'change-target-not-found', `'${verb}' names uid '${uid}', which no ${what} carries at this point of the document (spec §29.4).`, span);
}

/** A name written beside a `uid` that no longer leads to the element carrying it: the `uid` decides (§29.4). */
function nameMismatch (model: Model, verb: string, written: string, actual: string, uid: string, span: Span): void {
  report(model, 'warning', 'change-name-mismatch',
    `'${verb}' names ${written}, but uid '${uid}' is carried by ${actual}, which the statement changes; it was renamed or moved after the statement was written (spec §29.4).`, span);
}

/**
 * The element a `drop` or an `alter` names (§29.4). A `uid` decides which
 * element it is; a name beside it that leads elsewhere draws a warning.
 * Without a `uid`, the name finds the element.
 */
function locateTarget (model: Model, stmt: DropStatement | AlterStatement, verb: string): Located | undefined {
  const { target } = stmt;
  const uid = uidOf(stmt.settings);
  if (uid !== undefined) {
    const found = elements(model).find((el) => el.decl.kind === DECLARATION_KIND[target.kind] && carriesUid(el.decl, uid));
    if (!found) {
      uidNotFound(model, target.keyword, uid, stmt.ifExists, verb, stmt.span);
      return undefined;
    }
    if (target.name !== undefined && findElement(model, target.kind, target.name)?.decl !== found.decl) {
      nameMismatch(model, verb, describe(target.keyword, target.name), describe(target.keyword, joinName(found.segments)), uid, stmt.span);
    }
    return found;
  }
  if (target.name === undefined) {
    error(model, 'change-target-not-found', `'${verb}' names no element; write its name, or its uid in brackets (spec §29.4).`, stmt.span);
    return undefined;
  }
  return locate(model, target.kind, target.name, stmt.ifExists, verb, stmt.span, target.keyword);
}

/** A relationship by its uid, its name or its endpoints (§29.4). */
function findRef (model: Model, stmt: DropStatement | AlterStatement, verb: string): Extract<Declaration, { kind: 'RefDeclaration' }> | 'none' | 'inline' {
  const { target } = stmt;
  const refs = model.statements.filter((s): s is Extract<Declaration, { kind: 'RefDeclaration' }> => s.kind === 'RefDeclaration');
  const ctx = nameContext(model);
  const byName = target.name !== undefined ? refs.find((r) => r.name === target.name)
    : target.ref ? refs.find((r) => sameEndpoints(target.ref!, r.spec, ctx)) : undefined;
  const uid = uidOf(stmt.settings);
  if (uid === undefined) return byName ?? 'none';
  const byUid = refs.find((r) => carriesUid(r, uid));
  if (!byUid) return 'none';
  if ((target.name !== undefined || target.ref) && byName !== byUid) {
    nameMismatch(model, verb, target.name !== undefined ? describe('relationship', target.name) : 'a relationship by its endpoints',
      byUid.name !== undefined ? describe('relationship', byUid.name) : 'another relationship', uid, stmt.span);
  }
  return byUid;
}

function applyDrop (model: Model, stmt: DropStatement): void {
  const { target } = stmt;
  if (target.kind === 'Ref') {
    dropRef(model, stmt);
    return;
  }
  if (target.kind === 'Dep') {
    dropDependency(model, stmt);
    return;
  }
  const found = locateTarget(model, stmt, 'drop');
  if (!found) return;
  const roles = new Set<UseRole>(['endpoint', 'type', 'partial']);
  const blocking = blockingUses(model, found.segments, found.decl, roles)
    .filter((use) => !(found.decl.kind === 'ContainerDeclaration' && use.holders.includes(found.decl)));
  if (blocking.length > 0) {
    error(model, 'change-element-referenced',
      `${describe(target.kind, joinName(found.segments))} cannot be dropped: ${blocking.length === 1 ? 'an element still refers' : `${blocking.length} elements still refer`} to it, ` +
      `first at line ${lineOf(blocking[0].span)}. Drop those references first (spec §29.6).`, stmt.span);
    return;
  }
  removeFollowers(model, found.segments);
  removeFrom(found.owner, found.decl);
}

function endpointText (ep: RefEndpoint, ctx: NameContext): string[] {
  const base = canonical(ep.path.map(segmentKey), ctx).segments;
  return ep.compositeFields ? [...base, `(${ep.compositeFields.join(',')})`] : base;
}

function sameEndpoints (a: RefSpec, b: { source: RefEndpoint; target: RefEndpoint }, ctx: NameContext): boolean {
  const [as, at] = [endpointText(a.source, ctx), endpointText(a.target, ctx)];
  const [bs, bt] = [endpointText(b.source, ctx), endpointText(b.target, ctx)];
  return (sameSegments(as, bs) && sameSegments(at, bt)) || (sameSegments(as, bt) && sameSegments(at, bs));
}

interface FoundRef {
  remove (): void;
  settings: Setting[];
}

function findRefByEndpoints (model: Model, spec: RefSpec): FoundRef | undefined {
  const ctx = nameContext(model);
  for (const stmt of model.statements) {
    if (stmt.kind === 'RefDeclaration' && sameEndpoints(spec, stmt.spec, ctx)) {
      return { remove: () => removeFrom(model.statements, stmt), settings: stmt.settings };
    }
  }
  // An inline relationship, `[ref: > core.customers.id]` on a field (§11.2).
  for (const el of elements(model)) {
    if (el.decl.kind !== 'EntityDeclaration') continue;
    let found: FoundRef | undefined;
    eachField(el.decl.body, (field, path) => {
      if (found) return;
      for (const s of field.settings) {
        if (s.value?.kind !== 'RefValue') continue;
        const source: RefEndpoint = { kind: 'RefEndpoint', path: [...el.segments, ...path].map((name) => ({ kind: 'PathField', name, span: s.span })), span: s.span };
        if (sameEndpoints(spec, { source, target: s.value.target }, ctx)) {
          found = { remove: () => { field.settings = field.settings.filter((x) => x !== s); }, settings: [] };
        }
      }
    });
    if (found) return found;
  }
  return undefined;
}

function dropRef (model: Model, stmt: DropStatement): void {
  const { target } = stmt;
  const uid = uidOf(stmt.settings);
  const what = uid !== undefined ? `the relationship with uid '${uid}'`
    : target.name !== undefined ? describe('relationship', target.name) : 'the relationship with these endpoints';
  let found: FoundRef | undefined;
  const ref = findRef(model, stmt, 'drop');
  if (ref !== 'none' && ref !== 'inline') {
    found = { remove: () => removeFrom(model.statements, ref), settings: ref.settings };
  } else if (uid === undefined && target.ref) {
    found = findRefByEndpoints(model, target.ref);
  }
  if (!found) {
    if (stmt.ifExists) skipped(model, `${what} does not exist`, stmt.span);
    else error(model, 'change-target-not-found', `'drop' names ${what}, which does not exist at this point of the document (spec §29.4).`, stmt.span);
    return;
  }
  found.remove();
}

function dropDependency (model: Model, stmt: DropStatement): void {
  const wanted = stmt.target.dependency;
  if (!wanted) return;
  const ctx = nameContext(model);
  const key = (d: DepDependency) =>
    [...d.upstreams.map((u) => joinName(endpointText(u, ctx))).sort(), '->', joinName(endpointText(d.downstream, ctx))].join(' ');
  for (const dep of model.statements) {
    if (dep.kind !== 'DepDeclaration') continue;
    const match = dep.dependencies.find((d) => key(d) === key(wanted));
    if (!match) continue;
    dep.dependencies = dep.dependencies.filter((d) => d !== match);
    if (dep.dependencies.length === 0) removeFrom(model.statements, dep);
    return;
  }
  if (stmt.ifExists) skipped(model, 'The dependency does not exist', stmt.span);
  else error(model, 'change-target-not-found', "'drop' names a dependency that does not exist at this point of the document (spec §29.4).", stmt.span);
}

/* -------------------------------------------------------------------------
 * alter
 * ----------------------------------------------------------------------- */

function applyAlter (model: Model, stmt: AlterStatement): void {
  const { target } = stmt;
  if (target.kind === 'Ref' || target.kind === 'Dep') {
    alterRef(model, stmt);
    return;
  }
  const found = locateTarget(model, stmt, 'alter');
  if (!found) return;
  let current = found;
  for (const action of stmt.actions) {
    switch (action.kind) {
      case 'RenameElementAction': current = renameElement(model, current, action.newName, action.span) ?? current; break;
      case 'MoveElementAction': current = moveElement(model, current, action.container, action.span) ?? current; break;
      case 'ModifyElementAction': modifyElement(model, current, action); break;
      case 'AddPartAction': addPart(model, current, action); break;
      case 'ModifyPartAction': modifyPart(model, current, action); break;
      case 'RenamePartAction': renamePart(model, current, action.target, action.newName, action.span); break;
      case 'DropPartAction': dropPart(model, current, action.target, action.ifExists, action.span); break;
    }
  }
}

/** `alter Ref name modify [...]` and `alter Ref name rename to ...`: the settings and the name of a relationship. */
function alterRef (model: Model, stmt: AlterStatement): void {
  const { target } = stmt;
  if (target.kind !== 'Ref') {
    error(model, 'change-invalid-action', "A dependency is not altered; drop it and declare the new one (spec §29.7).", stmt.span);
    return;
  }
  const found = findRef(model, stmt, 'alter');
  const decl = found === 'none' || found === 'inline' ? undefined : found;
  if (!decl) {
    if (stmt.ifExists) skipped(model, 'The relationship does not exist', stmt.span);
    else error(model, 'change-target-not-found', "'alter' names a relationship that does not exist at this point of the document (spec §29.4).", stmt.span);
    return;
  }
  for (const action of stmt.actions) {
    if (action.kind === 'RenameElementAction') decl.name = action.newName;
    else if (action.kind === 'ModifyElementAction') decl.settings = modifiedSettings(decl.settings, action.settings, action.drop);
    else error(model, 'change-invalid-action', 'A relationship takes rename and modify; its endpoints change by dropping it and creating another (spec §29.7).', action.span);
  }
}

function renameElement (model: Model, el: Located, newName: string, span: Span): Located | undefined {
  const kind = kindOfDeclaration(el.decl as TopLevelStatement) ?? 'Entity';
  const next = [...el.segments.slice(0, -1), newName];
  const taken = elements(model).some((other) => other !== el && sameSegments(other.segments, next) &&
    (other.decl.kind === el.decl.kind || (CONTAINED_KINDS.has(other.decl.kind) && CONTAINED_KINDS.has(el.decl.kind))));
  if (taken) {
    error(model, 'change-name-taken', `${describe(kind, joinName(next))} already exists; a rename never takes a name in use (spec §29.9).`, span);
    return undefined;
  }
  const decl = el.decl as { name: string };
  const own = splitName(decl.name);
  const uses = collectUses(model);
  decl.name = joinName([...own.slice(0, -1), newName]);
  // The element's own name is set above; a top-level qualified declaration
  // names its Container (§7.3), so a Container's rename reaches those too.
  rewriteUses(uses, el.segments, next, (role) => role !== 'decl' || el.decl.kind === 'ContainerDeclaration');
  return { ...el, segments: next };
}

function moveElement (model: Model, el: Located, container: string, span: Span): Located | undefined {
  if (!CONTAINED_KINDS.has(el.decl.kind)) {
    error(model, 'change-invalid-action', `'move' applies to an element that a Container holds (spec §29.9).`, span);
    return undefined;
  }
  const containers = containerNames(model);
  if (!containers.has(container)) {
    error(model, 'change-target-not-found', `'move to' names Container '${container}', which does not exist at this point of the document (spec §29.9).`, span);
    return undefined;
  }
  const bare = el.segments[el.segments.length - 1];
  const next = [container, bare];
  if (elements(model).some((other) => other !== el && sameSegments(other.segments, next) && CONTAINED_KINDS.has(other.decl.kind))) {
    error(model, 'change-name-taken', `Container '${container}' already holds an element named '${bare}' (spec §29.9).`, span);
    return undefined;
  }
  const before = el.segments;
  const uses = collectUses(model);
  const decl = el.decl as ContainerBodyItem & { name: string };
  removeFrom(el.owner, el.decl);
  const target = model.statements.find((s): s is ContainerDeclaration => s.kind === 'ContainerDeclaration' && s.name === container);
  let located: Located;
  if (target) {
    decl.name = bare;
    target.body.push(decl);
    located = { decl, owner: target.body, container: target, segments: next };
  } else {
    decl.name = joinName(next);
    model.statements.push(decl as TopLevelStatement);
    located = { decl, owner: model.statements, segments: next };
  }
  rewriteUses(uses, before, next, (role) => role !== 'decl');
  return located;
}

/* ----- settings (§29.8) ----- */

function valueText (v: SettingValue | null): string {
  if (!v) return '';
  switch (v.kind) {
    case 'StringValue': return v.value;
    case 'NumberValue': return v.value;
    case 'BooleanValue': return String(v.value);
    case 'NullValue': return 'null';
    case 'IdentifierValue': return v.value;
    case 'ExpressionValue': return `\`${v.expression}\``;
    case 'ListValue': return `[${v.items.map(valueText).join(',')}]`;
    case 'RefValue': return `${v.operator}${pathToString(v.target.path)}`;
    case 'DepValue': return `${v.arrow}${pathToString(v.target.path)}`;
  }
}

const IDENTIFYING = new Set(['uid', 'was']);

/** The flags that replace each other: setting one drops the others (§8.8). */
const NULLABILITY = new Set(['null', 'not null', 'required']);

function normalizedName (name: string): string {
  const lower = name.toLowerCase().replace(/\s+/g, ' ');
  return lower === 'required' ? 'not null' : lower === 'primary key' ? 'pk' : lower;
}

function modifiedSettings (current: ReadonlyArray<Setting>, changes: ReadonlyArray<Setting>, drop: ReadonlyArray<string>): Setting[] {
  const dropped = new Set(drop.map(normalizedName));
  const setting = changes.filter((s) => !IDENTIFYING.has(s.name));
  const replaced = new Set(setting.map((s) => normalizedName(s.name)));
  const nullability = setting.some((s) => NULLABILITY.has(normalizedName(s.name)));
  const kept = current.filter((s) => {
    const n = normalizedName(s.name);
    if (dropped.has(n) || replaced.has(n)) return false;
    return !(nullability && NULLABILITY.has(n));
  });
  return [...kept, ...setting.map((s) => structuredClone(s))];
}

function typeText (type: TypeExpression): string {
  if (type.kind === 'ScalarType') return `${type.name}${type.params ? `(${type.params.join(',')})` : ''}`;
  if (type.kind === 'NamedTypeReference') return type.name;
  return type.kind;
}

/** The type and settings of an element as `was` writes them, normalized for comparison (§29.8). */
function wasKey (type: string | undefined, settings: ReadonlyArray<string>): string {
  const norm = (s: string) => s.replace(/['"\s]/g, '').toLowerCase();
  return [type ? norm(type) : '', ...settings.map(norm).filter((s) => s !== '').sort()].join('|');
}

function splitTopLevel (text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let current = '';
  for (const c of text) {
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

function parseWas (text: string): string {
  const open = text.indexOf('[');
  const type = (open >= 0 ? text.slice(0, open) : text).trim();
  const settings = open >= 0 ? splitTopLevel(text.slice(open + 1, text.lastIndexOf(']'))) : [];
  return wasKey(type || undefined, settings.map((s) => s.replace(/^required$/i, 'not null').replace(/^primary key$/i, 'pk')));
}

function currentKey (type: TypeExpression | undefined, settings: ReadonlyArray<Setting>): string {
  const texts = settings
    .filter((s) => !s.implied && !IDENTIFYING.has(s.name))
    .map((s) => (s.value === null ? normalizedName(s.name) : `${s.name}:${valueText(s.value)}`));
  return wasKey(type ? typeText(type) : undefined, texts);
}

/** Whether `was` matches the element, reporting it when it does not (§29.8). */
function checkWas (model: Model, settings: ReadonlyArray<Setting>, type: TypeExpression | undefined, current: ReadonlyArray<Setting>, what: string, span: Span): boolean {
  const was = settings.find((s) => s.name === 'was');
  if (!was || was.value?.kind !== 'StringValue') return true;
  if (parseWas(was.value.value) === currentKey(type, current)) return true;
  error(model, 'change-was-mismatch',
    `${what} no longer matches was: '${was.value.value}'; the model changed after the statement was written (spec §29.8).`, span);
  return false;
}

function modifyElement (model: Model, el: Located, action: ModifyElementAction): void {
  const decl = el.decl as Declaration & { settings?: Setting[] };
  const what = describe(kindOfDeclaration(el.decl as TopLevelStatement) ?? 'element', joinName(el.segments));
  if (action.sourceQuery !== undefined) {
    if (el.decl.kind !== 'ViewDeclaration') {
      error(model, 'change-invalid-action', 'Only a View has a source query (spec §14.3, §29.7).', action.span);
      return;
    }
    const view = el.decl;
    const item = view.body.find((b) => b.kind === 'SourceQueryItem');
    if (item && item.kind === 'SourceQueryItem') item.query = action.sourceQuery;
    else view.body.push({ kind: 'SourceQueryItem', query: action.sourceQuery, span: action.span });
    return;
  }
  if (action.type) {
    if (el.decl.kind !== 'TypeDeclaration' || !el.decl.scalarBase) {
      error(model, 'change-invalid-action', `${what} has no type of its own; only a scalar Type does (spec §29.8).`, action.span);
      return;
    }
  }
  if (!checkWas(model, action.settings, el.decl.kind === 'TypeDeclaration' ? el.decl.scalarBase : undefined, decl.settings ?? [], what, action.span)) return;
  if (action.type && el.decl.kind === 'TypeDeclaration') el.decl.scalarBase = structuredClone(action.type);
  if (!decl.settings) {
    if (action.settings.length > 0 || action.drop.length > 0) {
      error(model, 'change-invalid-action', `${what} takes no settings (spec §29.8).`, action.span);
    }
    return;
  }
  decl.settings = modifiedSettings(decl.settings, action.settings, action.drop);
}

/* ----- parts (§29.7) ----- */

/** The body that holds fields, indexes and constraints, for the elements that have one. */
function partBody (el: Located): EntityBodyItem[] | undefined {
  const d = el.decl;
  if (d.kind === 'EntityDeclaration' || d.kind === 'EdgeDeclaration' || d.kind === 'TablePartialDeclaration') return d.body;
  if (d.kind === 'ViewDeclaration' || d.kind === 'TypeDeclaration') return d.body as EntityBodyItem[];
  return undefined;
}

interface FoundField {
  field: FieldDeclaration;
  list: Array<{ kind: string }>;
  path: string[];
}

/** The field a path names, from the body of an element (§20). */
function findField (body: Array<{ kind: string }>, path: ReadonlyArray<string>): FoundField | undefined {
  let list = body;
  const walked: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const field = list.find((x): x is FieldDeclaration => x.kind === 'FieldDeclaration' && (x as FieldDeclaration).name === key);
    if (!field) return undefined;
    walked.push(key);
    if (i === path.length - 1) return { field, list, path: walked };
    const nested = nestedFields(field.type);
    if (!nested) return undefined;
    for (const via of nested.via) {
      if (path[i + 1] !== via) return undefined;
      i++;
      walked.push(via);
    }
    list = nested.items;
  }
  return undefined;
}

function partError (model: Model, el: Located, what: string, span: Span): void {
  error(model, 'change-invalid-action',
    `${describe(kindOfDeclaration(el.decl as TopLevelStatement) ?? 'element', joinName(el.segments))} holds no ${what} (spec §29.7).`, span);
}

function addPart (model: Model, el: Located, action: AddPartAction): void {
  const where = joinName(el.segments);
  if (action.part === 'Value') {
    if (el.decl.kind !== 'EnumDeclaration' || !action.value) return partError(model, el, 'values', action.span);
    const value = action.value;
    if (el.decl.values.some((v) => v.name === value.name)) return partExists(model, `Value '${value.name}' of ${where}`, action.ifNotExists, action.span);
    el.decl.values.push(structuredClone(value));
    return;
  }
  if (action.part === 'Member') {
    addMember(model, el, action);
    return;
  }
  const body = partBody(el);
  if (!body) return partError(model, el, 'fields, indexes or constraints', action.span);
  if (action.part === 'Field' && action.field) {
    const field = action.field;
    let list: Array<{ kind: string }> = body;
    if (action.parentPath && action.parentPath.length > 0) {
      const parentPath = action.parentPath.map(segmentKey);
      const fieldPath = parentPath[parentPath.length - 1] === '[*]' ? parentPath.slice(0, -1) : parentPath;
      const parent = findField(body, fieldPath);
      const nested = parent ? nestedFields(parent.field.type) : undefined;
      if (!nested) {
        error(model, 'change-target-not-found', `'add Field' names '${pathText(parentPath)}' in ${where}, which holds no fields (spec §29.7).`, action.span);
        return;
      }
      list = nested.items;
    }
    if (list.some((x) => x.kind === 'FieldDeclaration' && (x as FieldDeclaration).name === field.name)) {
      return partExists(model, `Field '${field.name}' of ${where}`, action.ifNotExists, action.span);
    }
    insertField(list, structuredClone(field));
    return;
  }
  if (action.part === 'Index' && action.index) {
    const index = action.index;
    let block = body.find((b): b is IndexesBlock => b.kind === 'IndexesBlock');
    if (block?.entries.some((e) => sameComponents(e.components, index.components))) {
      return partExists(model, `the index on ${componentsText(index.components)} of ${where}`, action.ifNotExists, action.span);
    }
    if (!block) {
      block = { kind: 'IndexesBlock', entries: [], span: action.span };
      body.push(block);
    }
    block.entries.push(structuredClone(index));
    return;
  }
  if (action.part === 'Constraint' && action.constraint) {
    let block = body.find((b): b is ConstraintsBlock => b.kind === 'ConstraintsBlock');
    if (!block) {
      block = { kind: 'ConstraintsBlock', entries: [], span: action.span };
      body.push(block);
    }
    block.entries.push(structuredClone(action.constraint));
  }
}

/** Put a new field after the last field of its list (§29.7). */
function insertField (list: Array<{ kind: string }>, field: FieldDeclaration): void {
  let last = -1;
  list.forEach((x, i) => { if (x.kind === 'FieldDeclaration') last = i; });
  list.splice(last + 1, 0, field);
}

function partExists (model: Model, what: string, ifNotExists: boolean, span: Span): void {
  if (ifNotExists) skipped(model, `${what} already exists`, span);
  else error(model, 'change-part-exists', `${what} already exists; 'add' adds a new part (spec §29.7).`, span);
}

function addMember (model: Model, el: Located, action: AddPartAction): void {
  const member = action.member ?? '';
  const d = el.decl;
  if (d.kind === 'TableGroupDeclaration') {
    if (d.members.includes(member)) return partExists(model, `Member '${member}'`, action.ifNotExists, action.span);
    d.members.push(member);
  } else if (d.kind === 'SupertypeGroupDeclaration') {
    if (d.members.some((m) => m.name === member)) return partExists(model, `Subtype '${member}'`, action.ifNotExists, action.span);
    d.members.push({ kind: 'SupertypeGroupMember', name: member, settings: [], span: action.span });
  } else if (d.kind === 'DiagramViewDeclaration') {
    const category = diagramCategory(action.keyword);
    let cat = d.categories.find((c) => c.category === category);
    if (!cat) {
      cat = { kind: 'DiagramViewCategory', category, keyword: category, wildcard: false, items: [], span: action.span };
      d.categories.push(cat);
    }
    if (cat.items.some((i) => i.name === member)) return partExists(model, `Member '${member}'`, action.ifNotExists, action.span);
    cat.items.push({ kind: 'DiagramViewItem', name: member, span: action.span });
  } else {
    partError(model, el, 'members', action.span);
  }
}

function diagramCategory (keyword: string): 'Tables' | 'Views' | 'Containers' | 'TableGroups' | 'SupertypeGroups' | 'Notes' {
  const k = keyword.toLowerCase();
  if (k === 'view') return 'Views';
  if (k === 'entitygroup' || k === 'tablegroup') return 'TableGroups';
  if (k === 'supertypegroup') return 'SupertypeGroups';
  if (k === 'note') return 'Notes';
  if (['container', 'schema', 'database', 'keyspace', 'namespace', 'dataset', 'bucket'].includes(k)) return 'Containers';
  return 'Tables';
}

function pathText (path: ReadonlyArray<string>): string {
  return path.join('.');
}

function componentsText (components: ReadonlyArray<IndexComponent>): string {
  const parts = components.map((c) => (c.kind === 'IndexPathComponent' ? pathToString(c.path) : `\`${c.expression}\``));
  return parts.length === 1 ? parts[0] : `(${parts.join(', ')})`;
}

function sameComponents (a: ReadonlyArray<IndexComponent>, b: ReadonlyArray<IndexComponent>): boolean {
  return componentsText(a) === componentsText(b);
}

function nameSetting (settings: ReadonlyArray<Setting>): string | undefined {
  const s = settings.find((x) => x.name === 'name');
  return s ? valueText(s.value) : undefined;
}

/** The part a statement names, and how to remove it (§29.4). */
interface FoundPart {
  settings: Setting[];
  setSettings (s: Setting[]): void;
  type?: TypeExpression;
  setType? (t: TypeExpression): void;
  remove (): void;
  /** The canonical path of a field, for the references that lead to it. */
  segments?: string[];
  field?: FieldDeclaration;
  value?: EnumValue;
  label: string;
}

type ConstraintLike = { kind: string; settings: Setting[]; expression?: string; fields?: PathSegment[][] };

function valuePart (enumDecl: EnumDeclaration, value: EnumValue, where: string): FoundPart {
  return {
    settings: value.settings,
    setSettings: (s) => { value.settings = s; },
    remove: () => { enumDecl.values = enumDecl.values.filter((v) => v !== value); },
    value,
    label: `Value '${value.name}' of ${where}`,
  };
}

function fieldPart (el: Located, found: FoundField): FoundPart {
  const { field, list, path } = found;
  return {
    settings: field.settings,
    setSettings: (s) => { field.settings = s; },
    type: field.type,
    setType: (t) => { field.type = t; },
    remove: () => removeFrom(list, field),
    segments: [...el.segments, ...path],
    field,
    label: `Field '${pathText(path)}' of ${joinName(el.segments)}`,
  };
}

function indexPart (block: IndexesBlock, entry: IndexesBlock['entries'][number], where: string): FoundPart {
  return {
    settings: entry.settings,
    setSettings: (s) => { entry.settings = s; },
    remove: () => { block.entries = block.entries.filter((e) => e !== entry); },
    label: `the index ${componentsText(entry.components)} of ${where}`,
  };
}

function constraintPart (block: { entries: unknown[] }, entry: ConstraintLike, where: string): FoundPart {
  return {
    settings: entry.settings,
    setSettings: (s) => { entry.settings = s; },
    remove: () => { block.entries = block.entries.filter((e) => e !== entry); },
    label: `the constraint ${entry.expression !== undefined ? `'${entry.expression}'` : (entry.fields ?? []).map((f) => pathToString(f)).join(', ')} of ${where}`,
  };
}

/** The field that carries a `uid`, at any depth of a body. */
function findFieldByUid (items: ReadonlyArray<{ kind: string }>, uid: string, path: string[] = []): FoundField | undefined {
  for (const item of items) {
    if (item.kind !== 'FieldDeclaration') continue;
    const field = item as FieldDeclaration;
    if (carriesUid(field, uid)) return { field, list: items as Array<{ kind: string }>, path: [...path, field.name] };
    const nested = nestedFields(field.type);
    const inner = nested ? findFieldByUid(nested.items, uid, [...path, field.name, ...nested.via]) : undefined;
    if (inner) return inner;
  }
  return undefined;
}

/** The part of a kind that carries a `uid` (§29.4). */
function findPartByUid (el: Located, kind: ChangePartTarget['kind'], uid: string): FoundPart | undefined {
  const where = joinName(el.segments);
  const d = el.decl;
  if (kind === 'Value') {
    const value = d.kind === 'EnumDeclaration' ? d.values.find((v) => carriesUid(v, uid)) : undefined;
    return value && d.kind === 'EnumDeclaration' ? valuePart(d, value, where) : undefined;
  }
  if (kind === 'Member') {
    const m = d.kind === 'SupertypeGroupDeclaration' ? d.members.find((x) => carriesUid(x, uid)) : undefined;
    if (!m || d.kind !== 'SupertypeGroupDeclaration') return undefined;
    return { settings: m.settings, setSettings: (s) => { m.settings = s; }, remove: () => { d.members = d.members.filter((x) => x !== m); }, label: `subtype '${m.name}'` };
  }
  const body = partBody(el);
  if (!body) return undefined;
  if (kind === 'Field') {
    const found = findFieldByUid(body, uid);
    return found ? fieldPart(el, found) : undefined;
  }
  for (const block of body) {
    if (kind === 'Index' && block.kind === 'IndexesBlock') {
      const entry = block.entries.find((e) => carriesUid(e, uid));
      if (entry) return indexPart(block, entry, where);
    }
    if (kind === 'Constraint' && (block.kind === 'ConstraintsBlock' || block.kind === 'ChecksBlock')) {
      const entry = (block.entries as ConstraintLike[]).find((e) => carriesUid(e, uid));
      if (entry) return constraintPart(block as { entries: unknown[] }, entry, where);
    }
  }
  return undefined;
}

function findPart (el: Located, target: ChangePartTarget): FoundPart | undefined {
  const where = joinName(el.segments);
  if (target.kind === 'Value') {
    if (el.decl.kind !== 'EnumDeclaration') return undefined;
    const value = el.decl.values.find((v) => v.name === target.name);
    return value ? valuePart(el.decl, value, where) : undefined;
  }
  if (target.kind === 'Member') return findMember(el, target);
  const body = partBody(el);
  if (!body) return undefined;
  if (target.kind === 'Field') {
    const found = target.path ? findField(body, target.path.map(segmentKey)) : undefined;
    return found ? fieldPart(el, found) : undefined;
  }
  const byName = nameSetting(target.settings);
  if (target.kind === 'Index') {
    for (const block of body) {
      if (block.kind !== 'IndexesBlock') continue;
      const entry = block.entries.find((e) =>
        (byName !== undefined && !target.components ? nameSetting(e.settings) === byName : target.components !== undefined && sameComponents(e.components, target.components)));
      if (entry) return indexPart(block, entry, where);
    }
    return undefined;
  }
  // Constraint: a key by its fields, a check by its expression, either by its name.
  for (const block of body) {
    if (block.kind !== 'ConstraintsBlock' && block.kind !== 'ChecksBlock') continue;
    const entry = (block.entries as ConstraintLike[]).find((e) => {
      if (byName !== undefined && !target.components && target.expression === undefined) return nameSetting(e.settings) === byName;
      if (target.expression !== undefined) return e.kind === 'CheckEntry' && e.expression === target.expression;
      if (target.components && e.kind === 'KeyConstraintEntry' && e.fields) {
        const keys = e.fields.map((f) => pathToString(f)).join(',');
        return keys === target.components.map((c) => (c.kind === 'IndexPathComponent' ? pathToString(c.path) : '')).join(',');
      }
      return false;
    });
    if (entry) return constraintPart(block as { entries: unknown[] }, entry, where);
  }
  // A key written inline on its field, `[pk]` or `[unique]` (§10.3).
  if (target.components?.length === 1 && target.components[0].kind === 'IndexPathComponent') {
    const found = findField(body, target.components[0].path.map(segmentKey));
    const flag = found?.field.settings.find((s) => s.value === null && (normalizedName(s.name) === 'pk' || s.name === 'unique'));
    if (found && flag) {
      const field = found.field;
      return {
        settings: [],
        setSettings: () => undefined,
        remove: () => { field.settings = field.settings.filter((s) => s !== flag); },
        label: `the key on ${field.name} of ${where}`,
      };
    }
  }
  return undefined;
}

function findMember (el: Located, target: ChangePartTarget): FoundPart | undefined {
  const d = el.decl;
  const name = target.name ?? '';
  if (d.kind === 'TableGroupDeclaration' && d.members.includes(name)) {
    return { settings: [], setSettings: () => undefined, remove: () => { d.members = d.members.filter((m) => m !== name); }, label: `member '${name}'` };
  }
  if (d.kind === 'SupertypeGroupDeclaration') {
    const m = d.members.find((x) => x.name === name);
    if (m) return { settings: m.settings, setSettings: (s) => { m.settings = s; }, remove: () => { d.members = d.members.filter((x) => x !== m); }, label: `subtype '${name}'` };
  }
  if (d.kind === 'DiagramViewDeclaration') {
    for (const cat of d.categories) {
      const item = cat.items.find((i) => i.name === name);
      if (item) return { settings: [], setSettings: () => undefined, remove: () => { cat.items = cat.items.filter((i) => i !== item); }, label: `member '${name}'` };
    }
  }
  return undefined;
}

function partTargetText (target: ChangePartTarget): string {
  if (target.path) return `${target.keyword} '${pathToString(target.path)}'`;
  if (target.name !== undefined) return `${target.keyword} '${target.name}'`;
  if (target.expression !== undefined) return `${target.keyword} '${target.expression}'`;
  if (target.components) return `${target.keyword} ${componentsText(target.components)}`;
  const byName = nameSetting(target.settings);
  return byName !== undefined ? `${target.keyword} named '${byName}'` : target.keyword;
}

/** Whether a statement names a part by its path, name, fields or expression, apart from a `uid`. */
function namesPart (target: ChangePartTarget): boolean {
  return target.path !== undefined || target.name !== undefined || target.expression !== undefined ||
    target.components !== undefined || nameSetting(target.settings) !== undefined;
}

/**
 * The part a statement names (§29.4). A `uid`, in the brackets that name the
 * part or in those of a `modify` (`extra`), decides which part it is; a name
 * beside it that leads elsewhere draws a warning.
 */
function locatePart (model: Model, el: Located, target: ChangePartTarget, ifExists: boolean, verb: string, span: Span, extra: ReadonlyArray<Setting> = []): FoundPart | undefined {
  const where = describe(kindOfDeclaration(el.decl as TopLevelStatement) ?? 'element', joinName(el.segments));
  const uid = uidOf(target.settings, extra);
  if (uid !== undefined) {
    const byUid = findPartByUid(el, target.kind, uid);
    if (!byUid) {
      uidNotFound(model, `${target.keyword} of ${where}`, uid, ifExists, verb, span);
      return undefined;
    }
    if (namesPart(target) && findPart(el, target)?.settings !== byUid.settings) {
      nameMismatch(model, verb, partTargetText(target), byUid.label, uid, span);
    }
    return byUid;
  }
  const found = findPart(el, target);
  if (found) return found;
  if (ifExists) skipped(model, `${partTargetText(target)} does not exist in ${where}`, span);
  else error(model, 'change-part-not-found', `'${verb}' names ${partTargetText(target)}, which ${where} does not hold at this point of the document (spec §29.4).`, span);
  return undefined;
}

function modifyPart (model: Model, el: Located, action: ModifyPartAction): void {
  const part = locatePart(model, el, action.target, false, 'modify', action.span, action.settings);
  if (!part) return;
  if (!checkWas(model, action.settings, part.type, part.settings, part.label, action.span)) return;
  if (action.type) {
    if (!part.setType) {
      error(model, 'change-invalid-action', `${part.label} has no type (spec §29.8).`, action.span);
      return;
    }
    part.setType(structuredClone(action.type));
  }
  part.setSettings(modifiedSettings(part.settings, action.settings, action.drop));
}

function renamePart (model: Model, el: Located, target: ChangePartTarget, newName: string, span: Span): void {
  const part = locatePart(model, el, target, false, 'rename', span);
  if (!part) return;
  if (target.kind === 'Value' && el.decl.kind === 'EnumDeclaration') {
    const value = part.value;
    if (el.decl.values.some((v) => v !== value && v.name === newName)) {
      error(model, 'change-name-taken', `Value '${newName}' of ${joinName(el.segments)} already exists (spec §29.9).`, span);
      return;
    }
    if (value) value.name = newName;
    return;
  }
  if (target.kind !== 'Field' || !part.field || !part.segments) {
    error(model, 'change-invalid-action', `${part.label} is renamed by dropping it and adding it under the new name (spec §29.9).`, span);
    return;
  }
  const field = part.field;
  const siblings = findField(partBody(el) ?? [], part.segments.slice(el.segments.length))?.list ?? [];
  if (siblings.some((x) => x !== field && x.kind === 'FieldDeclaration' && (x as FieldDeclaration).name === newName)) {
    error(model, 'change-name-taken', `${part.label.replace(/'[^']*'/, `'${newName}'`)} already exists (spec §29.9).`, span);
    return;
  }
  const uses = collectUses(model);
  field.name = newName;
  rewriteUses(uses, part.segments, [...part.segments.slice(0, -1), newName], (role) => role !== 'decl');
}

function dropPart (model: Model, el: Located, target: ChangePartTarget, ifExists: boolean, span: Span): void {
  const part = locatePart(model, el, target, ifExists, 'drop', span);
  if (!part) return;
  if (part.field && !checkWas(model, target.settings, part.type, part.settings, part.label, span)) return;
  if (part.field && part.segments) {
    const roles = new Set<UseRole>(['endpoint', 'key']);
    const blocking = blockingUses(model, part.segments, part.field, roles);
    if (blocking.length > 0) {
      error(model, 'change-element-referenced',
        `${part.label} cannot be dropped: ${blocking.length === 1 ? 'a relationship, a dependency, an index or a key still refers' : `${blocking.length} relationships, dependencies, indexes or keys still refer`} to it, ` +
        `first at line ${lineOf(blocking[0].span)}. Drop those references first (spec §29.6).`, span);
      return;
    }
    if (part.segments.length === el.segments.length + 1) dropRecordValues(model, el, part.field.name);
    removeFollowers(model, part.segments);
  }
  part.remove();
}

/** A dropped field takes its value out of every row of the entity's records (§26, §29.6). */
function dropRecordValues (model: Model, el: Located, field: string): void {
  const without = (rows: Array<{ values: SettingValue[] }>, index: number) => {
    if (index < 0) return;
    for (const row of rows) row.values = row.values.filter((_, i) => i !== index);
  };
  const body = partBody(el) ?? [];
  const fields = body.filter((b): b is FieldDeclaration => b.kind === 'FieldDeclaration').map((f) => f.name);
  for (const item of body) {
    if (item.kind === 'RecordsBlock') without(item.rows, item.columns ? item.columns.indexOf(field) : fields.indexOf(field));
  }
  const ctx = nameContext(model);
  for (const stmt of model.statements) {
    if (stmt.kind === 'TopLevelRecordsDeclaration' && sameSegments(canonical(splitName(stmt.entityRef), ctx).segments, el.segments)) {
      without(stmt.rows, stmt.columns.indexOf(field));
    }
  }
}

/* -------------------------------------------------------------------------
 * uid (§29.15)
 * ----------------------------------------------------------------------- */

/** Two elements of a model never carry the same `uid` (§29.15). */
export function checkUids (statements: ReadonlyArray<TopLevelStatement>): Diagnostic[] {
  const seen = new Map<string, Span>();
  const diagnostics: Diagnostic[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.kind === 'ChangesDeclaration' || obj.kind === 'MetadataDeclaration') return;
    if (Array.isArray(obj.settings)) {
      for (const s of obj.settings as Setting[]) {
        if (s.name !== 'uid' || !s.value) continue;
        const key = valueText(s.value);
        const first = seen.get(key);
        if (first) {
          diagnostics.push({
            severity: 'error',
            code: 'duplicate-uid',
            message: `uid '${key}' is already carried by the element at line ${first.start.line}; two elements never carry the same uid (spec §29.15).`,
            span: s.span,
          });
        } else {
          seen.set(key, s.span);
        }
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'settings' || k === 'span') continue;
      if (v && typeof v === 'object') visit(v);
    }
  };
  visit(statements);
  return diagnostics;
}

function compareVersion (a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
