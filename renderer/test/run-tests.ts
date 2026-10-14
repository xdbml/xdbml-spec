/**
 * @xdbml/render validation harness.
 *
 * Renders every bundled example to SVG and checks structural invariants,
 * then writes a golden SVG per example to test/goldens/. The goldens are
 * for visual diffing (open in a browser) and for catching unintended
 * output changes in future edits -- they are NOT pixel-asserted here.
 *
 * Run: npm test  (node --experimental-strip-types test/run-tests.ts)
 * Pass UPDATE_GOLDENS=1 to (re)write goldens without failing on drift.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { parse, flatten } from '@xdbml/parse';
import {
  renderToSVG,
  diagramViewNames,
  buildDiagram,
  applyUserPositions,
  autoArrange,
  serializeDiagram,
  layoutSupertypeGroups,
  parseMarkdown,
  parseInline,
  layoutNoteText,
  sizeNote,
  NOTE_WIDTHS,
  defaultTheme,
  layoutDeps,
  type DiagramModel,
} from '../src/index.ts';
import { ENTITY_NAME_FONT_SIZE, FIELD_FONT_SIZE } from '../src/svg/metrics.ts';
import { buildOverlay } from '../src/interactive/overlay.ts';
import { depEnds, depExtent } from '../src/geometry/dep-path.ts';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '..', '..', 'examples');
const goldensDir = join(here, 'goldens');
const updateGoldens = process.env.UPDATE_GOLDENS === '1';

interface Case { name: string; source: string; }

function loadExamples (): Case[] {
  const files = readdirSync(examplesDir).filter((f) => f.endsWith('.xdbml')).sort();
  return files.map((f) => ({
    name: basename(f, '.xdbml'),
    source: readFileSync(join(examplesDir, f), 'utf8'),
  }));
}

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check (label: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    failures.push(`  FAIL: ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** Lightweight well-formedness checks on the emitted SVG string. */
function assertWellFormed (name: string, svg: string): void {
  check(`${name}: starts with <svg`, svg.startsWith('<svg '));
  check(`${name}: ends with </svg>`, svg.trimEnd().endsWith('</svg>'));
  check(`${name}: no NaN`, !svg.includes('NaN'), firstContext(svg, 'NaN'));
  check(`${name}: no undefined`, !svg.includes('undefined'), firstContext(svg, 'undefined'));
  check(`${name}: no [object Object]`, !svg.includes('[object Object]'));
  check(`${name}: <g> balanced`, countTag(svg, '<g') === countTag(svg, '</g>'),
    `<g>=${countTag(svg, '<g')} </g>=${countTag(svg, '</g>')}`);
  check(`${name}: <text> balanced`, countTag(svg, '<text') === countTag(svg, '</text>'),
    `<text>=${countTag(svg, '<text')} </text>=${countTag(svg, '</text>')}`);
}

function countTag (s: string, tag: string): number {
  // Count occurrences of `tag` as a tag opener (followed by space or '>').
  let n = 0;
  let i = 0;
  while ((i = s.indexOf(tag, i)) !== -1) {
    const next = s[i + tag.length];
    if (tag.endsWith('>') || next === ' ' || next === '>' || next === '/') n += 1;
    i += tag.length;
  }
  return n;
}

function firstContext (s: string, needle: string): string {
  const i = s.indexOf(needle);
  return i === -1 ? '' : `near "...${s.slice(Math.max(0, i - 30), i + 30)}..."`;
}

console.log('xDBML renderer -- validation harness\n');

const examples = loadExamples();
check('examples found', examples.length > 0, `found ${examples.length}`);

if (!existsSync(goldensDir)) mkdirSync(goldensDir, { recursive: true });

for (const ex of examples) {
  let svg = '';
  try {
    svg = renderToSVG(ex.source);
  } catch (e) {
    failed += 1;
    failures.push(`  FAIL: ${ex.name}: renderToSVG threw -- ${(e as Error).message}`);
    continue;
  }

  assertWellFormed(ex.name, svg);

  // Input-parity: source vs document must yield the same SVG (both go
  // through the same default arrangement). And serializing an explicitly
  // arranged model must equal the source/document render.
  const doc = flatten(parse(ex.source));
  const fromDoc = renderToSVG(doc);
  const base: DiagramModel = buildDiagram(doc);
  const arranged = applyUserPositions(base, autoArrange(base, 'relational'));
  const fromModel = serializeDiagram(arranged);
  check(`${ex.name}: source == document output`, svg === fromDoc);
  check(`${ex.name}: document == arranged-model output`, fromDoc === fromModel);
  // And `arrange: 'none'` must reproduce the raw column layout.
  check(`${ex.name}: arrange:none == raw model output`,
    renderToSVG(doc, { arrange: 'none' }) === serializeDiagram(base));

  // Golden management.
  const goldenPath = join(goldensDir, `${ex.name}.svg`);
  if (updateGoldens || !existsSync(goldenPath)) {
    writeFileSync(goldenPath, svg, 'utf8');
  } else {
    const golden = readFileSync(goldenPath, 'utf8');
    check(`${ex.name}: matches golden`, svg === golden,
      svg === golden ? '' : 'output changed (run UPDATE_GOLDENS=1 to accept)');
  }
}

/* ---- Targeted feature assertions on specific examples -------------- */

function modelFor (name: string): DiagramModel {
  const ex = examples.find((e) => e.name === name)!;
  return buildDiagram(flatten(parse(ex.source)));
}

// 07-project-management demonstrates self-references.
const m07 = modelFor('07-project-management');
const selfRefs = m07.refs.filter((r) =>
  r.source && r.target && r.source.entityId === r.target.entityId);
check('07: has at least one self-reference', selfRefs.length > 0,
  `self-refs=${selfRefs.length}`);
{
  const svg07 = serializeDiagram(m07);
  // A self-reference renders as a 5-point loop path (M + 4 L).
  const hasLoop = /M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+/.test(svg07);
  check('07: self-reference renders a loop path', hasLoop);
}

// 08-university-registrar demonstrates composite PK/FK.
const m08 = modelFor('08-university-registrar');
const compositeRefs = m08.refs.filter((r) =>
  (r.source?.compositeFields && r.source.compositeFields.length > 1) ||
  (r.target?.compositeFields && r.target.compositeFields.length > 1));
check('08: has a composite-field ref', compositeRefs.length > 0,
  `composite refs=${compositeRefs.length}`);
const multiPkEntities = m08.entities.filter((e) =>
  e.fields.filter((f) => f.flags.pk).length > 1);
check('08: has an entity with a composite PK', multiPkEntities.length > 0,
  `entities w/ >1 pk=${multiPkEntities.length}`);

// Collapse: collapsing a parent path removes its child rows from the model.
{
  const ex02 = examples.find((e) => e.name === '02-ecommerce')!;
  const doc02 = flatten(parse(ex02.source));
  const full = buildDiagram(doc02);
  // Find any entity with a collapsible (hasChildren) field.
  let probed = false;
  for (const e of full.entities) {
    const parent = e.fields.find((f) => f.hasChildren);
    if (!parent) continue;
    const key = `${e.id}::${parent.path}`;
    const collapsedModel = buildDiagram(doc02, new Set([key]));
    const before = full.entities.find((x) => x.id === e.id)!.fields.length;
    const after = collapsedModel.entities.find((x) => x.id === e.id)!.fields.length;
    check(`collapse removes child rows (${e.name}.${parent.path})`, after < before,
      `before=${before} after=${after}`);
    // Caret on the collapsed parent should point right in the SVG.
    const svgCollapsed = serializeDiagram(collapsedModel, { collapsedPaths: new Set([key]) });
    check('collapsed caret points right', svgCollapsed.includes('▸'));
    probed = true;
    break;
  }
  check('found a collapsible field to probe', probed);
}

/* ---- Supertype groups (spec §12.9) ---------------------------------- */

{
  const doc = (settings: string, extra = ''): ReturnType<typeof flatten> => flatten(parse(
    `xdbml: 0.5\nEntity P {\n  id int [pk]\n}\nEntity A {\n  a int\n}\nEntity B {\n  b int\n}\n${extra}` +
    `SupertypeGroup g [supertype: P${settings ? `, ${settings}` : ''}] {\n  A\n  B\n}\n`,
  ));
  const cases: Array<[string, string, 'solid' | 'dashed' | 'none', 'solid' | 'dashed' | 'none']> = [
    ['total, disjoint', 'completeness: total, exclusivity: disjoint', 'solid', 'solid'],
    ['total, overlapping', 'completeness: total, exclusivity: overlapping', 'none', 'solid'],
    ['partial, disjoint', 'completeness: partial, exclusivity: disjoint', 'solid', 'none'],
    ['partial, overlapping', 'completeness: partial, exclusivity: overlapping', 'none', 'none'],
    ['both unstated', '', 'dashed', 'dashed'],
    ['completeness only (mixed)', 'completeness: total', 'dashed', 'solid'],
    ['aliases', 'completeness: complete, exclusivity: exclusive', 'solid', 'solid'],
  ];
  const state = (m?: { dashed: boolean }): 'solid' | 'dashed' | 'none' => (m ? (m.dashed ? 'dashed' : 'solid') : 'none');
  for (const [label, settings, cross, bar] of cases) {
    const geo = layoutSupertypeGroups(buildDiagram(doc(settings)))[0];
    check(`supertype group ${label}: drawn`, !!geo);
    if (!geo) continue;
    check(`supertype group ${label}: cross ${cross}`, state(geo.cross) === cross, `got ${state(geo.cross)}`);
    check(`supertype group ${label}: bar ${bar}`, state(geo.bar) === bar, `got ${state(geo.bar)}`);
  }

  const model = buildDiagram(doc('completeness: total'));
  const p = model.entities.find((e) => e.id === 'P')!;
  const geo = layoutSupertypeGroups(model)[0]!;
  check('supertype group: stem leaves the middle of the supertype bottom edge',
    geo.cx === p.bounds.x + p.bounds.width / 2 && geo.stem.startsWith(`M ${geo.cx} ${p.bounds.y + p.bounds.height}`));
  check('supertype group: rounded side up, base below the curve', geo.baseY > geo.topY);
  check('supertype group: one drop per subtype', (geo.branches.match(/ M /g) ?? []).length === 2);
  check('supertype group: edges reserved for the group',
    p.reservedBottom === true && model.entities.filter((e) => e.reservedTop).length === 2);

  const two = buildDiagram(flatten(parse(
    'xdbml: 0.5\nEntity P {\n  id int [pk]\n}\nEntity A { }\nEntity B { }\nEntity C { }\nEntity D { }\n' +
    'SupertypeGroup g1 [supertype: P] {\n  A\n  B\n}\nSupertypeGroup g2 [supertype: P] {\n  C\n  D\n}\n',
  )));
  const [g1, g2] = layoutSupertypeGroups(two);
  const tp = two.entities.find((e) => e.id === 'P')!;
  check('supertype groups on one supertype spread across its bottom edge',
    !!g1 && !!g2 && g1.cx < g2.cx && g1.cx > tp.bounds.x && g2.cx < tp.bounds.x + tp.bounds.width);

  const unresolved = buildDiagram(flatten(parse(
    'xdbml: 0.5\nEntity P {\n  id int [pk]\n}\nSupertypeGroup g [supertype: P] {\n  Missing\n}\n',
  )));
  check('supertype group without a drawable subtype draws nothing', layoutSupertypeGroups(unresolved).length === 0);

  const src = 'xdbml: 0.5\nEntity P {\n  id int [pk]\n}\nEntity A {\n  p_id int\n}\nEntity B { }\n' +
    'SupertypeGroup legal [supertype: P, completeness: total, exclusivity: disjoint] {\n  A\n  B\n}\n' +
    'Ref owns: A.p_id > P.id\n';
  const plain = renderToSVG(src);
  const named = renderToSVG(src, { showRelationshipNames: true });
  assertWellFormed('supertype group svg', named);
  check('relationship names are off by default', !plain.includes('>legal</text>') && !plain.includes('>owns</text>'));
  check('relationship names draw the group name and the Ref name',
    named.includes('>legal</text>') && named.includes('>owns</text>'));
}

/* ---- v0.6.1: list separators and keywords as field names ---------- */

{
  // A field named `note` or `records` failed to parse before 0.6.1 (spec
  // §3.10); commas between fields are list separators (spec §3.9). Each
  // field draws a row, and a View's source query draws none.
  const src = 'Table orders { id int [pk], note varchar, records int }\n' +
    "View monthly_orders [materialized: true] {\n  source_query: 'SELECT id, note FROM orders'\n  id int\n  note varchar\n}\n";
  const model = buildDiagram(flatten(parse(src)));
  const rows = (id: string): string =>
    (model.entities.find((e) => e.id === id)?.fields ?? []).map((f) => f.name).join(',');
  check('v0.6.1: fields named note and records render as rows', rows('orders') === 'id,note,records',
    `orders rows: ${rows('orders')}`);
  check('v0.6.1: a View field named note renders as a row; the source query draws none',
    rows('monthly_orders') === 'id,note', `view rows: ${rows('monthly_orders')}`);
  assertWellFormed('v0.6.1 separators and note fields', renderToSVG(src));
}

{
  // v0.6.3: a diagram view (spec §18) draws its members, the Containers
  // holding them and the relationships whose two ends are members. Field
  // markers and ids stay as in the full diagram (§18.4).
  const src = `xdbml: 0.6
Schema crm {
  Table party     { id int [pk] }
  Table person    { birth date }
  Table customers {
    id       int [pk]
    party_id int [ref: > crm.party.id]
  }
}
Schema sales {
  Table orders {
    id          int [pk]
    customer_id int [ref: > crm.customers.id]
  }
  Table returns {
    id       int [pk]
    order_id int [ref: > sales.orders.id]
  }
}
Edge buys [source: crm.customers, target: sales.orders] { }
Edge reviews [source: crm.party, target: sales.orders] { }
SupertypeGroup kinds [supertype: crm.party] { crm.person }
DiagramView ordering {
  Tables { crm.customers }
  Containers { sales }
}
DiagramView parties {
  SupertypeGroups { kinds }
}`;
  const doc = flatten(parse(src));
  const full = buildDiagram(doc);
  const view = buildDiagram(doc, new Set(), { diagramView: 'ordering' });
  const ids = (m: typeof full): string => m.entities.map((e) => e.id).join(',');
  check('v0.6.3: a diagram view draws its members only',
    ids(view) === 'crm.customers,sales.orders,sales.returns', ids(view));
  check('v0.6.3: a Container frame is drawn only around a Container holding a member',
    view.containers.map((c) => c.name).join(',') === 'crm,sales', view.containers.map((c) => c.name).join(','));
  const refIds = (m: typeof full): string => m.refs.map((r) => r.id).join(',');
  const kept = full.refs.filter((r) => r.source && r.target && ['crm.customers', 'sales.orders', 'sales.returns'].includes(r.source.entityId)
    && ['crm.customers', 'sales.orders', 'sales.returns'].includes(r.target.entityId)).map((r) => r.id).join(',');
  check('v0.6.3: a relationship is drawn when both ends are members, with the id it has in the full diagram',
    refIds(view) === kept && view.refs.length === 2, `${refIds(view)} vs ${kept}`);
  const partyId = (m: typeof full): boolean | undefined => m.entities.find((e) => e.id === 'crm.customers')?.fields.find((f) => f.name === 'party_id')?.flags.fk;
  check('v0.6.3: an attribute keeps its fk marker when the other end is outside the diagram view', partyId(view) === true);
  check('v0.6.3: an Edge is drawn when both ends are members',
    view.edges.map((e) => e.name).join(',') === 'buys', view.edges.map((e) => e.name).join(','));
  const crm = view.containers.find((c) => c.name === 'crm');
  const cust = view.entities.find((e) => e.id === 'crm.customers');
  check('v0.6.3: entities are stacked again inside their Container frames',
    !!crm && !!cust && cust.bounds.y >= crm.bounds.y && cust.bounds.x >= crm.bounds.x
      && cust.bounds.y + cust.bounds.height <= crm.bounds.y + crm.bounds.height);
  const parties = buildDiagram(doc, new Set(), { diagramView: 'parties' });
  check('v0.6.3: a supertype group listed in a diagram view draws its symbol',
    parties.supertypeGroups.filter((g) => !g.unresolved).map((g) => g.name).join(',') === 'kinds');
  check('v0.6.3: a supertype group is not drawn when its supertype is outside the diagram view',
    view.supertypeGroups.every((g) => g.unresolved));
  const unknown = buildDiagram(doc, new Set(), { diagramView: 'nope' });
  check('v0.6.3: an undeclared diagram view name draws the full diagram', ids(unknown) === ids(full));
  const svg = renderToSVG(src, { diagramView: 'ordering' });
  assertWellFormed('v0.6.3 diagram view render', svg);
  check('v0.6.3: renderToSVG draws the diagram view', svg.includes('customers') && !svg.includes('>person<'));
  check('v0.6.3: diagramViewNames lists the declared diagram views in order',
    diagramViewNames(src).join(',') === 'ordering,parties', diagramViewNames(src).join(','));
}

{
  // v0.6.5: a field typed by an internal definition (spec §15.8) expands
  // like one typed by a Type. Names resolve where they are written
  // (§15.8.2): the body of a project Type uses the project's Types even
  // when the entity has an entry of the same name, an entry is not visible
  // in another entity, and a recursive entry stops at its second level.
  const src = `xdbml: 0.6
Type Inner { p int }
Type Outer { inner Inner }
Entity customers {
  id      string  [not null]
  billing Address [not null]
  o       Outer
  root    Node
  definitions {
    Address { street string, country CountryCode }
    CountryCode string [pattern: '^[A-Z]{2}$']
    Inner { q int }
    Node { v int, children array [Node] }
  }
}
Entity other { a Address }`;
  const model = buildDiagram(flatten(parse(src)));
  const rows = (id: string): string => (model.entities.find((e) => e.id === id)?.fields ?? []).map((f) => f.path).join(',');
  check('v0.6.5: a field typed by an internal definition expands its fields',
    rows('customers').includes('billing.street') && rows('customers').includes('billing.country'), rows('customers'));
  check('v0.6.5: a project Type body resolves at project scope, past an entry of the same name',
    rows('customers').includes('o.inner.p') && !rows('customers').includes('o.inner.q'), rows('customers'));
  check('v0.6.5: a recursive internal definition expands once, without a caret on the repeat',
    rows('customers').includes('root.children') && !rows('customers').includes('root.children.[*].v'), rows('customers'));
  check('v0.6.5: an internal definition is not visible in another entity', rows('other') === 'a', rows('other'));
  assertWellFormed('v0.6.5 internal definitions render', renderToSVG(src));
}

{
  // Auto-arrange (relational): the second entity of a related pair goes
  // beside the first, on the same row, never across a corner; and the
  // container blocks of example 17 share one row, so claim_submission sits
  // at the top of `intake` beside adjuster_note instead of a row lower.
  const pair = buildDiagram(flatten(parse(`xdbml: 0.6
Entity a { id int [pk], b_id int [ref: > b.id] }
Entity b { id int [pk] }`)));
  const placed = applyUserPositions(pair, autoArrange(pair, 'relational'));
  const pa = placed.entities.find((e) => e.id === 'a')?.bounds;
  const pb = placed.entities.find((e) => e.id === 'b')?.bounds;
  check('arrange: two related entities sit side by side on one row',
    !!pa && !!pb && pa.y === pb.y && pa.x !== pb.x, JSON.stringify({ pa, pb }));
  const ex17 = examples.find((e) => e.name === '17-internal-definitions');
  if (ex17) {
    const base = buildDiagram(flatten(parse(ex17.source)));
    const m = applyUserPositions(base, autoArrange(base, 'relational'));
    const at = (id: string) => m.entities.find((e) => e.id === id)?.bounds;
    const note = at('intake.adjuster_note'); const sub = at('intake.claim_submission');
    check('arrange: example 17 puts claim_submission beside adjuster_note, top-aligned',
      !!note && !!sub && note.y === sub.y && note.x < sub.x, JSON.stringify({ note, sub }));
    const tops = m.containers.map((c) => c.bounds.y);
    check('arrange: example 17 lays its three containers out in one row',
      tops.length === 3 && tops.every((y) => y === tops[0]), tops.join(','));
  }
}

/* ---- TablePartial injection (spec §17.1) --------------------------- */
{
  const build = (src: string): DiagramModel => buildDiagram(flatten(parse(src)));
  const rows = (m: DiagramModel, id: string): string => {
    const box = m.entities.find((e) => e.id === id) ?? m.edges.find((e) => e.id === id)?.box;
    return (box?.fields ?? []).map((f) =>
      `${f.name}${f.flags.pk ? '*' : ''}${f.flags.unique ? '!' : ''}${f.flags.uniqueKeys.length ? `!${f.flags.uniqueKeys.join('')}` : ''}`).join(' ');
  };

  // The example of spec §17.1, with a relationship to the injected key.
  const spec = build(`xdbml: 0.6
TablePartial base_template {
  id         int       [pk, not null]
  created_at timestamp [default: \`SYSTIMESTAMP\`]
  updated_at timestamp [default: \`SYSTIMESTAMP\`]
}
Entity users {
  ~base_template
  name varchar
}
Entity orders {
  id      int [pk]
  user_id int [ref: > users.id]
}`);
  check('partial: the entity lists the injected fields where ~name is written',
    rows(spec, 'users') === 'id* created_at updated_at name', rows(spec, 'users'));
  const users = spec.entities.find((e) => e.id === 'users');
  check('partial: the entity is as tall as its four rows',
    !!users && users.bounds.height === spec.entities.find((e) => e.id === 'orders')!.bounds.height + 2 * (users.fields[1].rowY - users.fields[0].rowY),
    String(users?.bounds.height));
  check('partial: a relationship to an injected field resolves and marks it dk',
    spec.refs.length === 1 && !spec.refs[0].unresolved && !!users?.fields[0].flags.dk);
  check('partial: the TablePartial itself draws no box',
    spec.entities.every((e) => e.name !== 'base_template'));

  const over = build(`xdbml: 0.6
TablePartial a { id int [pk]
 name varchar(10) }
TablePartial b { name varchar(20)
 extra int
 constraints { (name, extra) [unique] } }
Entity local_wins { ~a
 name text
 ~b }
Entity last_wins { ~a
 ~b }
Entity own_key { x int [pk]
 ~b
 ~a }`);
  check('partial: a field of the entity overrides an injected one',
    rows(over, 'local_wins') === 'id* name!1 extra!1'
      && over.entities.find((e) => e.id === 'local_wins')!.fields[1].typeLabel === 'text', rows(over, 'local_wins'));
  check('partial: among partials the last one injected applies',
    rows(over, 'last_wins') === 'id* name!1 extra!1'
      && over.entities.find((e) => e.id === 'last_wins')!.fields[1].typeLabel === 'varchar(20)', rows(over, 'last_wins'));
  check('partial: the primary key of the entity applies over the one of a partial (§10.4)',
    rows(over, 'own_key') === 'x* extra!1 id name!1', rows(over, 'own_key'));

  const refs = build(`xdbml: 0.6
Entity users { id int [pk] }
TablePartial audit { created_by int [ref: > users.id] }
Entity orders { id int [pk]
 ~audit }
Entity items { id int [pk]
 ~audit }
Edge RATED [source: users, target: items] { ~audit
 rating int }`);
  check('partial: an inline ref of a partial draws one relationship per entity that injects it',
    refs.refs.length === 2 && refs.refs.every((r) => !r.unresolved)
      && refs.refs.map((r) => r.source?.entityId).join(',') === 'orders,items',
    refs.refs.map((r) => `${r.source?.entityId}.${r.source?.fieldName}`).join(' '));
  check('partial: an Edge lists the fields it injects',
    rows(refs, 'edge:RATED') === 'created_by rating', rows(refs, 'edge:RATED'));

  // Header color of a partial (spec §17.1, as upstream DBML).
  const colors = build(`xdbml: 0.6
TablePartial a [headercolor: '#ff0000'] { x int }
TablePartial b [headercolor: '#00ff00'] { y int }
Entity own [headercolor: '#0000ff'] { id int [pk]
 ~a }
Entity ab { id int [pk]
 ~a
 ~b }
Entity grouped { id int [pk]
 ~a }
Entity plain { id int [pk] }
TableGroup g [color: '#999999'] {
  grouped
  plain
}`);
  const colorOf = (id: string): string => colors.entities.find((x) => x.id === id)?.headerColor ?? '-';
  check('partial: the header color of the entity applies over the one of a partial',
    colorOf('own') === '#0000ff', colorOf('own'));
  check('partial: among partials the header color of the last one injected applies',
    colorOf('ab') === '#00ff00', colorOf('ab'));
  check('partial: the header color of a partial applies over the color of a TableGroup',
    colorOf('grouped') === '#ff0000' && colorOf('plain') === '#999999', `${colorOf('grouped')} ${colorOf('plain')}`);

  // v0.7.1 §7.5: `color` is the header color of an entity, a View and an
  // EntityPartial in a document that declares a version; without one it
  // stays a custom property, as in DBML 10.3.1.
  const colorWord = build(`xdbml: 0.7.1
EntityPartial p [color: '#ff0000'] { x int }
Entity own [color: '#0000ff'] { id int [pk] }
Entity carried { id int [pk]
 ~p }
Entity both [color: '#111111', headercolor: '#222222'] { id int [pk] }
View v [color: '#00ff00'] { id int }
EntityGroup g [color: '#999999'] { carried }`);
  const colorWordOf = (id: string): string => colorWord.entities.find((x) => x.id === id)?.headerColor ?? '-';
  check('v0.7.1: color sets the header color of an entity, a View and an EntityPartial; the first of color and headercolor applies',
    colorWordOf('own') === '#0000ff' && colorWordOf('carried') === '#ff0000' && colorWordOf('both') === '#111111'
      && colorWord.entities.some((x) => x.headerColor === '#00ff00'),
    colorWord.entities.map((x) => `${x.id}=${x.headerColor ?? '-'}`).join(' '));
  const dbmlColor = build("Table t [color: '#0000ff'] { id int [pk] }");
  check('v0.7.1: without a version declaration, color on a Table draws no header color',
    dbmlColor.entities.find((x) => x.id === 't')?.headerColor === undefined,
    String(dbmlColor.entities.find((x) => x.id === 't')?.headerColor));

  // ~name in an object, a json body and a Type (spec §17.1).
  const nested = build(`xdbml: 0.6
Entity users { id int [pk] }
TablePartial audit {
  created_at timestamp
  created_by int [ref: > users.id]
}
Type Stamped {
  ~audit
  label varchar
}
Entity e {
  id int [pk]
  profile object {
    nick varchar
    ~audit
  }
  doc json {
    ~audit
  }
  stamp Stamped
}
`);
  const e = nested.entities.find((x) => x.id === 'e');
  const paths = (e?.fields ?? []).map((f) => `${f.indent}:${f.path}`).join(' ');
  check('partial: an object, a json body and a Type list the fields a ~name line places in them',
    paths === '0:id 0:profile 1:profile.nick 1:profile.created_at 1:profile.created_by '
      + '0:doc 1:doc.created_at 1:doc.created_by '
      + '0:stamp 1:stamp.created_at 1:stamp.created_by 1:stamp.label', paths);
  // An inline ref in the body of a Type draws no relationship for the
  // fields typed by it, injected or not, so `stamp` brings none.
  check('partial: an inline ref injected in an object or a json body draws a relationship from that field',
    nested.refs.length === 2 && nested.refs.every((r) => !r.unresolved && r.target?.entityId === 'users')
      && nested.refs.map((r) => r.source?.fieldName).join(' ') === 'profile.created_by doc.created_by',
    nested.refs.map((r) => `${r.source?.fieldName}${r.unresolved ? '?' : ''}`).join(' '));
  check('partial: the nested injected field carries the fk mark',
    !!e?.fields.find((f) => f.path === 'profile.created_by')?.flags.fk);
}

/* ---- Quoted names (spec §3.2, §20.1, v0.6.7) ----------------------- */
{
  const build = (src: string): DiagramModel => buildDiagram(flatten(parse(src)));
  const quoted = build(`xdbml: 0.6
Container sales {
  Table "Work Order" {
    "Work Order ID" int [pk]
  }
}
Table "Work Order Part" {
  "Work Order ID" int [ref: > "sales"."Work Order"."Work Order ID"]
  "Part ID" int
  constraints {
    ("Work Order ID", "Part ID") [pk]
  }
}
Table "Part" {
  "Part ID" int [pk]
}
Ref: "Work Order Part"."Part ID" > "Part"."Part ID"`);
  const ends = quoted.refs.map((r) => `${r.source?.entityId}.${r.source?.fieldName}>${r.target?.entityId}.${r.target?.fieldName}${r.unresolved ? '?' : ''}`).join(' ');
  check('quoted: relationships between quoted names resolve, inline and long form',
    ends === 'Work Order Part.Part ID>Part.Part ID Work Order Part.Work Order ID>sales.Work Order.Work Order ID', ends);
  const wop = quoted.entities.find((e) => e.id === 'Work Order Part');
  check('quoted: a key line with quoted fields marks both fields pk',
    (wop?.fields ?? []).filter((f) => f.flags.pk).map((f) => f.name).join(',') === 'Work Order ID,Part ID',
    (wop?.fields ?? []).map((f) => `${f.name}:${f.flags.pk}`).join(' '));

  // A dot inside quotes belongs to the name: "my.table" is one entity, and
  // "user.id" is one field, beside the nested field user.id.
  const dotted = build(`xdbml: 0.6
Container my {
  Table table {
    id int [pk]
  }
}
Table "my.table" {
  "user.id" int
  user object {
    id int
  }
  constraints {
    ("user.id") [pk]
  }
}
Table other {
  a int
  b int
}
Ref: other.a > my.table.id
Ref: other.b > "my.table"."user.id"`);
  const dt = dotted.entities.find((e) => e.id === '"my.table"');
  check('quoted: "my.table" and my.table are two entities',
    !!dt && !!dotted.entities.find((e) => e.id === 'my.table'), dotted.entities.map((e) => e.id).join(' | '));
  check('quoted: the field "user.id" and the nested field user.id are two rows; the key marks the first',
    (dt?.fields ?? []).map((f) => `${f.path}${f.flags.pk ? '*' : ''}`).join(' ') === '"user.id"* user user.id',
    (dt?.fields ?? []).map((f) => `${f.path}${f.flags.pk ? '*' : ''}`).join(' '));
  const dends = dotted.refs.map((r) => `${r.target?.entityId}.${r.target?.fieldName}${r.unresolved ? '?' : ''}`).join(' ');
  check('quoted: each Ref reaches its own entity and field',
    dends === 'my.table.id "my.table"."user.id"', dends);
}

/* ---- v0.7: cardinality from the operator, its ? marks, the settings and a nullable FK (spec §11.7, §11.8) ---- */
{
  const build = (src: string): DiagramModel => buildDiagram(flatten(parse(src)));
  const ends = (m: DiagramModel): string =>
    m.refs.map((r) => `${r.sourceEnd?.text ?? '-'}:${r.sourceEnd?.origin}/${r.targetEnd?.text ?? '-'}:${r.targetEnd?.origin}`).join(' | ');
  const base = `Table a {
  id int [pk]
}
Table b {
  id    int [pk]
  a_n   int
  a_nn  int [not null]
}
`;
  const m1 = build(`${base}Ref: b.a_nn > a.id
Ref: b.a_n > a.id
Ref: b.a_nn >? a.id
Ref: b.a_nn ?> a.id
Ref: a.id < b.a_n
Ref: b.a_nn <> a.id`);
  check('cardinality §11.8: >, nullable >, >?, ?>, nullable <, <>',
    ends(m1) === [
      '1..*:operator/1..1:operator',
      '1..*:operator/0..1:nullable-foreign-key',
      '1..*:operator/0..1:optional-mark',
      '0..*:optional-mark/1..1:operator',
      '0..1:nullable-foreign-key/1..*:operator',
      '0..*:operator/0..*:operator',
    ].join(' | '), ends(m1));

  const m2 = build(`${base}Table c {
  x int [ref: >? a.id]
}`);
  check('cardinality §11.1: the ? of an inline ref reaches the diagram',
    m2.refs[0]?.targetEnd?.text === '0..1' && m2.refs[0]?.targetEnd?.origin === 'optional-mark', ends(m2));

  const m3 = build(`xdbml: 0.7
${base}Ref: b.a_n > a.id [target: '1..1']`);
  check('cardinality §11.7: a setting states the end, and its label is drawn',
    m3.refs[0]?.targetEnd?.origin === 'setting' && m3.refs[0]?.targetCardinality === '1..1', ends(m3));
  check('cardinality §11.7: an end stated by the operator carries no label',
    m1.refs.every((r) => r.sourceCardinality === undefined && r.targetCardinality === undefined));

  const m4 = build(`xdbml: 0.7
Entity Customer { }
Entity Order { }
Ref: Customer > Order
Ref: Customer >? Order`);
  check('cardinality §11.16: an entity-level end is unstated until a ? states its minimum',
    ends(m4) === '-:unstated/-:unstated | -:unstated/-:optional-mark', ends(m4));
  const svg4 = renderToSVG(flatten(parse(`xdbml: 0.7
Entity Customer { }
Entity Order { }
Ref: Customer >? Order`)));
  check('cardinality §11.16: the open ring alone at an end a ? marks on an entity-level Ref',
    (svg4.match(/<circle[^>]*r="2\.5"/g) ?? []).length === 1);
}

/* ---- v0.7: colors that Metadata blocks set (spec §24.7) ---- */
{
  const build = (src: string): DiagramModel => buildDiagram(flatten(parse(src)));
  const m = build(`xdbml: 0.7
Container sales [type: schema, color: '#111111'] {
  Table orders [headercolor: '#222222'] {
    id int
  }
  View open_orders {
    id int
  }
}
Table users {
  id int
}
Table audit {
  id int
}
TableGroup people [color: '#333333'] {
  users
  audit
}
Metadata Container sales {
  color: #AA0000
}
Metadata Table sales.orders {
  headercolor: #00AA00
}
Metadata View open_orders {
  headercolor: #0000AA
}
Metadata TableGroup people {
  color: #ABCDEF
}
Metadata Table audit {
  headercolor: #FEDCBA
}`);
  const header = (id: string): string | undefined => m.entities.find((e) => e.id === id)?.headerColor;
  check('metadata §24.7.4: a block sets an entity\'s header color over its own', header('sales.orders') === '#00AA00', String(header('sales.orders')));
  check('metadata §24.7.4: a block sets a View\'s header color', header('sales.open_orders') === '#0000AA', String(header('sales.open_orders')));
  check('metadata §24.7.4: a block sets a TableGroup\'s color, which its members take', header('users') === '#ABCDEF', String(header('users')));
  check('metadata §24.7.4: an entity\'s header color from a block applies over its group\'s', header('audit') === '#FEDCBA', String(header('audit')));
  const sales = m.containers.find((c) => c.name === 'sales');
  check('metadata §24.7.4: a block sets a Container\'s color over its own', sales?.accentColor === '#AA0000', String(sales?.accentColor));
}

/* ---- Sticky notes (spec §19, v0.7) --------------------------------- */
{
  const md = (t: string) => JSON.stringify(parseMarkdown(t));
  check('markdown: a heading, a paragraph joined with a space, and a list',
    md('# Title\nline one\nline two\n\n- a\n- **b**') === JSON.stringify([
      { kind: 'heading', level: 1, inlines: [{ text: 'Title' }] },
      { kind: 'paragraph', inlines: [{ text: 'line one line two' }] },
      { kind: 'list', ordered: false, start: 1, items: [
        [{ kind: 'paragraph', inlines: [{ text: 'a' }] }],
        [{ kind: 'paragraph', inlines: [{ text: 'b', strong: true }] }],
      ] },
    ]), md('# Title\nline one\nline two\n\n- a\n- **b**'));
  check('markdown: emphasis, code, links, strikethrough and an escape',
    JSON.stringify(parseInline('*a* __b__ `c` [d](https://x.org) ~~e~~ \\*f')) === JSON.stringify([
      { text: 'a', em: true }, { text: ' ' }, { text: 'b', strong: true }, { text: ' ' }, { text: 'c', code: true }, { text: ' ' },
      { text: 'd', href: 'https://x.org' }, { text: ' ' }, { text: 'e', strike: true }, { text: ' *f' },
    ]), JSON.stringify(parseInline('*a* __b__ `c` [d](https://x.org) ~~e~~ \\*f')));
  check('markdown: an underscore inside a word stays (snake_case)',
    JSON.stringify(parseInline('order_line_id and _x_')) === JSON.stringify([{ text: 'order_line_id and ' }, { text: 'x', em: true }]));
  check('markdown: a nested list, a quote, a fenced code block and a rule',
    parseMarkdown('1. one\n   - sub\n2. two\n\n> quoted\n\n```\nSELECT 1;\n```\n\n---').map((b) => b.kind).join(',') === 'list,quote,code,rule');
  check('markdown: a table stays as written',
    JSON.stringify(parseMarkdown('| a | b |\n|---|---|')) === JSON.stringify([{ kind: 'verbatim', lines: ['| a | b |', '|---|---|'] }]));

  const short = sizeNote('Short');
  check('note size: a short note takes the narrowest width and the minimum height', short.width === NOTE_WIDTHS[0] && short.height === NOTE_WIDTHS[0] / 2,
    `${short.width}x${short.height}`);
  const long = sizeNote(Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about the model.`).join(' '));
  check('note size: a long note widens before it grows', long.width === NOTE_WIDTHS[NOTE_WIDTHS.length - 1] && long.height > long.width,
    `${long.width}x${long.height}`);
  const mid = sizeNote(Array.from({ length: 12 }, (_, i) => `Sentence ${i} here.`).join(' '));
  check('note size: a box is no taller than wide when a width allows it', mid.height <= mid.width, `${mid.width}x${mid.height}`);
  const sized = layoutNoteText('# Title\n## Sub\nBody text\n\n- item', 200).lines;
  check('note text: the body is the size of a field name, and no heading is larger than an entity name',
    sized.filter((l) => l.weight === 400).every((l) => l.size === FIELD_FONT_SIZE)
      && sized.every((l) => l.size <= ENTITY_NAME_FONT_SIZE),
    sized.map((l) => `${l.size}/${l.weight}`).join(','));
  const lines = layoutNoteText('A **bold** word and [a link](https://xdbml.org).', 120).lines;
  check('note text: lines fit the width', lines.length > 1 && lines.every((l) => l.runs.length > 0));
  check('note text: a style change inside a word is no place to break',
    layoutNoteText('[guide](https://x.org).', 40).lines.every((l) => l.runs.map((r) => r.text).join('') !== '.'));

  const src = `xdbml: 0.7
Container sales [type: schema] {
  Entity orders { id int [pk] }
  Note states [color: #FBCFE8, owner: 'ops'] { 'placed, shipped' }
}
Note legend { 'Legend' }
Note plain [color: none] { 'Plain' }
Note odd [color: red] { 'Odd' }
Note meta [color: #111111] { 'Meta' }
Metadata Note meta { color: #222222 }
DiagramView sales_only { Containers { sales } }
DiagramView legend_only { Notes { legend } }`;
  const m = buildDiagram(flatten(parse(src)));
  const note = (id: string) => m.notes.find((n) => n.id === `note:${id}`);
  check('notes: one layout per sticky note, in declaration order',
    m.notes.map((n) => n.name).join(',') === 'sales.states,legend,plain,odd,meta', m.notes.map((n) => n.name).join(','));
  check('notes: a note in a Container stacks below its entities, inside the frame', (() => {
    const c = m.containers[0].bounds; const n = note('sales.states')!.bounds; const e = m.entities[0].bounds;
    return note('sales.states')!.containerName === 'sales' && n.y > e.y + e.height && c.y + c.height >= n.y + n.height && c.x < n.x;
  })());
  check('notes: the colors of the brackets, none, and the default for a value that is no color',
    note('sales.states')?.color === '#FBCFE8' && note('plain')?.transparent === true && note('plain')?.color === undefined
      && note('odd')?.color === undefined && note('legend')?.color === undefined);
  check('notes: a Metadata color applies over the brackets (§24.7.4)', note('meta')?.color === '#222222', String(note('meta')?.color));
  const svg = serializeDiagram(m);
  check('notes: drawn with a title, the default fill and the folded corner',
    svg.includes('<title>legend</title>') && svg.includes(`fill="${defaultTheme.note.fill}"`) && svg.includes('fill-opacity="0.14"'));
  check('notes: a note with color none draws no box', (() => {
    const at = svg.indexOf('<title>plain</title>');
    const end = svg.indexOf('</g>', at);
    return at > 0 && !svg.slice(at, end).includes('<path');
  })());
  const dv = buildDiagram(flatten(parse(src)), new Set(), { diagramView: 'sales_only' });
  check('notes: a diagram view draws the notes of a listed Container (§18.2)', dv.notes.map((n) => n.name).join(',') === 'sales.states');
  const lv = buildDiagram(flatten(parse(src)), new Set(), { diagramView: 'legend_only' });
  check('notes: a diagram view of a note alone draws it and no entity', lv.notes.map((n) => n.name).join(',') === 'legend' && lv.entities.length === 0);
  const arranged = autoArrange(m, 'relational');
  check('notes: the arrangement positions every note', m.notes.every((n) => arranged.has(n.id)));
  const placed = applyUserPositions(m, new Map([['note:legend', { x: 900, y: 700 }]]));
  check('notes: a user position moves a note and grows the canvas',
    placed.notes.find((n) => n.id === 'note:legend')?.bounds.x === 900 && placed.width >= 900 + NOTE_WIDTHS[0]);
  const onlyNotes = buildDiagram(flatten(parse("Note a { 'x' }\nNote b { 'y' }")));
  check('notes: a document of notes alone is arranged', autoArrange(onlyNotes, 'relational').size === 2);
}

/* ---- Data lineage (spec §27, v0.7) -------------------------------- */
{
  const src = [
    'xdbml: 0.7',
    'Table raw {', '  id int [pk]', '  amount int', '}',
    'Table customers {', '  first varchar', '  last varchar', '}',
    'Table dim {', '  full varchar', '}',
    'Table stg [dep: <- raw] {', '  revenue int [dep: <- raw.amount]', '}',
    'View kpis {', '  n int', '}',
    'Dep: stg -> kpis.n [color: #123456]',
    'Dep full_name {', '  customers.first -> dim.full', '  customers.last -> dim.full [color: #abcdef]', '}',
    'Dep: dim -> dim',
    'DiagramView raw_side {', '  Tables {', '    raw', '    stg', '  }', '}',
  ].join('\n');
  const m = buildDiagram(flatten(parse(src)));
  check('lineage: one layout per Dep, under the ids of collectLineage',
    m.deps.map((d) => d.id).join(',') === 'dep:0,dep:1,dep:2,dep:3,dep:4', m.deps.map((d) => d.id).join(','));
  check('lineage: a field end and a View end resolve',
    m.deps[0].dependencies[0].downstream?.entityId === 'kpis' && m.deps[0].dependencies[0].downstream?.fieldName === 'n'
      && m.deps[0].dependencies[0].upstream?.fieldName === undefined);
  check('lineage: the color of a Dep and of one dependency', m.deps[0].color === '#123456' && m.deps[1].dependencies[1].color === '#abcdef' && m.deps[1].color === undefined);
  const placed = applyUserPositions(m, autoArrange(m, 'relational'));
  const geo = layoutDeps(placed.deps, placed.entities);
  const full = geo.find((g) => g.dep.id === 'dep:1');
  check('lineage: two dependencies into one field meet at one junction with one arrowhead',
    !!full && full.curves.length === 2 && full.junctions.length === 1 && full.arrows.length === 1 && full.trunks.length === 1);
  check('lineage: a dependency draws as a curve', geo.every((g) => g.curves.every((c) => / C /.test(c.d))));
  const self = geo.find((g) => g.dep.id === 'dep:2');
  check('lineage: an entity that depends on itself draws a loop', !!self && self.curves.length === 1 && self.arrows.length === 1);
  check('lineage: the name of a Dep goes at its junction', !!full?.label && Math.abs(full.label.x - full.junctions[0].x) < 0.01);
  const svg = serializeDiagram(placed, { showRelationshipNames: true });
  check('lineage: drawn in the default lineage color, the Dep color and the dependency color',
    svg.includes(`stroke="${defaultTheme.lineage.line}"`) && svg.includes('stroke="#123456"') && svg.includes('stroke="#abcdef"'));
  check('lineage: the name of a Dep shows with the names', svg.includes('>full_name</text>'));
  check('lineage: no name without the names option', !serializeDiagram(placed).includes('>full_name</text>'));
  check('lineage: a Dep counts as a link when arranging', (() => {
    const lonely = buildDiagram(flatten(parse('Table a {\n  x int\n}\nTable b {\n  x int\n}\nDep: a -> b')));
    const pos = autoArrange(lonely, 'relational');
    const a = pos.get('a');
    const b = pos.get('b');
    return !!a && !!b && Math.abs(a.y - b.y) < 1;
  })());
  const dv = buildDiagram(flatten(parse(src)), new Set(), { diagramView: 'raw_side' });
  check('lineage: a diagram view draws the dependencies between its members only (§18.4)',
    dv.deps.map((d) => d.id).join(',') === 'dep:3,dep:4', dv.deps.map((d) => d.id).join(','));
  check('lineage: a prebuilt model without deps still renders', serializeDiagram({ ...placed, deps: undefined as unknown as DiagramModel['deps'] }).includes('<svg'));

  // Selection (spec §27.7): the rows of the fields at the ends tinted, the
  // boxes named with no field outlined, the curves and arrowheads in blue.
  const ends0 = depEnds(placed.deps[0], placed.entities);
  check('lineage: the ends of a Dep, a field row and a box', JSON.stringify(ends0) === JSON.stringify({ fields: [{ entityId: 'kpis', path: 'n' }], entities: ['stg'] }), JSON.stringify(ends0));
  const tinted = serializeDiagram(placed, { highlightedFields: depEnds(placed.deps[1], placed.entities).fields });
  check('lineage: the field rows at the ends of a selected Dep take the selection tint',
    (tinted.match(new RegExp(`fill="${defaultTheme.row.selectFill}"`, 'g')) ?? []).length === 3);
  const overlay = buildOverlay(placed, { kind: 'dep', id: 'dep:0' }, defaultTheme);
  check('lineage: a selected Dep draws its arrowhead in the selection color and outlines the box it names',
    overlay.includes(`<polygon points=`) && /<polygon[^>]*fill="#2563eb"/.test(overlay)
      && overlay.includes(`stroke="${defaultTheme.row.selectStrip}" stroke-width="2" pointer-events="none"`));

  // A loop between two boxes of one column stays on the canvas.
  const stacked = applyUserPositions(m, new Map([['raw', { x: 40, y: 40 }], ['stg', { x: 40, y: 300 }]]));
  const reach = depExtent(layoutDeps(stacked.deps, stacked.entities));
  check('lineage: the canvas holds a loop that bows out past the boxes',
    reach.right > 40 + 280 && stacked.width >= reach.right, `${reach.right} / ${stacked.width}`);

  // Arrangement: sources on the left, targets on the right.
  const chain = buildDiagram(flatten(parse('Table c {\n  x int\n}\nTable b {\n  x int\n}\nTable a {\n  x int\n}\nDep: a -> b\nDep: b.x -> c.x')));
  const cp = autoArrange(chain, 'relational');
  check('lineage: a chain arranges left to right, source first',
    (cp.get('a')?.x ?? 0) < (cp.get('b')?.x ?? 0) && (cp.get('b')?.x ?? 0) < (cp.get('c')?.x ?? 0),
    JSON.stringify([...cp]));
  const blocks = buildDiagram(flatten(parse([
    'xdbml: 0.7',
    'Container marts {', '  Table m {', '    x int', '  }', '}',
    'Container raw {', '  Table r {', '    x int', '  }', '}',
    'Container other {', '  Table o {', '    x int', '  }', '}',
    'Dep: raw.r -> marts.m',
  ].join('\n'))));
  const bp = autoArrange(blocks, 'relational');
  check('lineage: the Container of a source stands left of the Container it feeds, and an unlinked one below',
    (bp.get('raw.r')?.x ?? 0) < (bp.get('marts.m')?.x ?? 0) && (bp.get('other.o')?.y ?? 0) > (bp.get('marts.m')?.y ?? 0),
    JSON.stringify([...bp]));
  const web = buildDiagram(flatten(parse([
    'Table a {', '  id int [pk]', '}', 'Table b {', '  id int [pk]', '  a_id int [ref: > a.id]', '}',
    'Table c {', '  id int [pk]', '  b_id int [ref: > b.id]', '}', 'Table d {', '  id int [pk]', '  c_id int [ref: > c.id]', '}',
    'Table e {', '  id int [pk]', '  d_id int [ref: > d.id]', '}',
    'Dep: d -> a',
  ].join('\n'))));
  const wp = autoArrange(web, 'relational');
  check('lineage: in a relational web that lineage does not lead, the source of a Dep stands left of its target',
    (wp.get('d')?.x ?? 0) < (wp.get('a')?.x ?? 0), JSON.stringify([...wp]));
}

/* ---- Report -------------------------------------------------------- */

console.log(`goldens: ${goldensDir}`);
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('All renderer checks passed.');
