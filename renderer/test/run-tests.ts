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
  buildDiagram,
  applyUserPositions,
  autoArrange,
  serializeDiagram,
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

/* ---- Report -------------------------------------------------------- */

console.log(`goldens: ${goldensDir}`);
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  console.log(failures.join('\n'));
  process.exit(1);
}
console.log('All renderer checks passed.');
