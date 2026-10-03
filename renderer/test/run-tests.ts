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
  type DiagramModel,
} from '../src/index.ts';

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

/* ---- Report -------------------------------------------------------- */

console.log(`goldens: ${goldensDir}`);
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('All renderer checks passed.');
