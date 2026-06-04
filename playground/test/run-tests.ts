/**
 * Test runner for the playground's diagram layout.
 *
 * Walks a small set of inline schemas plus the bundled examples, runs
 * them through parse() + buildDiagram(), and asserts properties of the
 * resulting DiagramModel. This catches regressions in the diagram
 * rendering path: row counts, indent levels, caret placement, named-
 * type expansion, recursion handling.
 *
 * Why this runner exists separately from the parser tests: the parser
 * tests check that parsing succeeds (or fails predictably) and that
 * the AST has the expected shape. They do not exercise buildDiagram(),
 * which is where most regressions in the playground originate. This
 * runner fills that gap.
 *
 * No test framework. Same pattern as parser/test/run-tests.ts:
 * vanilla node + --experimental-strip-types, ANSI colors via raw
 * escape codes when stdout is a TTY. The tests in this file are
 * regression cases for actual bugs that have shipped to main and
 * been fixed; each commented header explains what bug the test
 * guards against.
 *
 * To add a new test: add a new entry to the `tests` array below.
 * To run: `npm test` from playground/ (or `node --experimental-strip-types test/run-tests.ts`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from '../../parser/src/index.ts';
import type { XDbmlDocument } from '../../parser/src/index.ts';
import { buildDiagram, applyUserPositions } from '../src/components/diagram/layout.ts';
import type { DiagramModel } from '../src/components/diagram/layout.ts';
import { resolveSelection } from '../src/components/inspector/ast-lookup.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, '..', '..', 'examples');

const isTTY = process.stdout.isTTY;
const RED = isTTY ? '\x1b[31m' : '';
const GREEN = isTTY ? '\x1b[32m' : '';
const DIM = isTTY ? '\x1b[2m' : '';
const RESET = isTTY ? '\x1b[0m' : '';

interface TestCase {
  name: string;
  /** Either inline source or a function returning source (lets us read files lazily). */
  source: string | (() => string);
  /** Run assertions against the parsed + laid-out result. Throw to fail. */
  check: (ctx: { ast: XDbmlDocument; diagram: DiagramModel }) => void;
}

/* -------------------------------------------------------------------------
 * Tests
 *
 * Add new regression cases here, one entry per case. Keep checks focused;
 * one test per behavior is easier to debug than one test asserting many
 * things.
 * ----------------------------------------------------------------------- */

const tests: TestCase[] = [
  {
    name: 'plain scalar fields render as leaf rows',
    source: `xdbml: 0.1
Table users {
  id    int     [pk]
  email varchar [unique]
  name  varchar
}
`,
    check: ({ diagram }) => {
      const users = findEntity(diagram, 'users');
      assertEq(users.fields.length, 3, 'row count');
      for (const f of users.fields) {
        assertEq(f.hasChildren, false, `'${f.name}' should be a leaf row`);
        assertEq(f.indent, 0, `'${f.name}' should be at indent 0`);
      }
    },
  },

  /* ---- Named-type expansion (commit 94d447c) -------------------------- */

  {
    name: 'named-type field expands inline to show the type body',
    source: `xdbml: 0.1
Type MonetaryAmount {
  amount   decimal(18,4)
  currency char(3)
}
Table products {
  id    int     [pk]
  price MonetaryAmount
}
`,
    check: ({ diagram }) => {
      const products = findEntity(diagram, 'products');
      const price = products.fields.find((f) => f.name === 'price');
      assertTrue(price !== undefined, 'price field present');
      assertEq(price!.hasChildren, true, 'price has caret (expandable named type)');
      const amount = products.fields.find((f) => f.name === 'amount' && f.indent === 1);
      const currency = products.fields.find((f) => f.name === 'currency' && f.indent === 1);
      assertTrue(amount !== undefined, 'amount appears at indent 1 below price');
      assertTrue(currency !== undefined, 'currency appears at indent 1 below price');
    },
  },

  {
    name: 'unknown named-type renders as leaf (no expansion, no error)',
    source: `xdbml: 0.1
Table users {
  id     int      [pk]
  custom UnknownType
}
`,
    check: ({ diagram }) => {
      const users = findEntity(diagram, 'users');
      const custom = users.fields.find((f) => f.name === 'custom');
      assertTrue(custom !== undefined, 'custom field present');
      assertEq(custom!.hasChildren, false, 'unknown type has no caret');
      assertEq(custom!.typeLabel, 'UnknownType', 'type label preserved');
    },
  },

  {
    name: 'chained named types expand through multiple levels',
    source: `xdbml: 0.1
Type Inner { value int  label varchar }
Type Outer { name varchar  inner Inner }
Table demo { thing Outer }
`,
    check: ({ diagram }) => {
      const demo = findEntity(diagram, 'demo');
      const value = demo.fields.find((f) => f.name === 'value');
      assertTrue(value !== undefined, 'inner.value appears in the entity');
      assertEq(value!.indent, 2, 'value sits at indent 2 (thing > inner > value)');
    },
  },

  /* ---- Recursion handling (commit 94d447c, then fix in later commit) -- */

  {
    name: 'self-referential type stops cleanly without infinite recursion',
    source: `xdbml: 0.1
Type Node {
  id     int
  parent Node
  label  varchar
}
Table tree { root Node }
`,
    check: ({ diagram }) => {
      const tree = findEntity(diagram, 'tree');
      // The outer root is expandable. The inner parent (same type as
      // the ancestor we're inside) should render without a caret.
      const parent = tree.fields.find((f) => f.name === 'parent' && f.indent === 1);
      assertTrue(parent !== undefined, 'parent field appears at indent 1');
      assertEq(parent!.hasChildren, false, 'parent (cyclic) has no caret');
    },
  },

  {
    name: 'array of recursive type lays out without stack overflow',
    // This is the healthcare-example shape: a named Type contains an
    // array whose element references the same Type. The recursion guard
    // must trigger at the named-type expansion site, not just at the
    // FieldDeclaration level, or the layout overflows the call stack.
    source: `xdbml: 0.1
Type OrgUnit {
  name varchar
  subs array [child OrgUnit]
}
Table demo { root OrgUnit }
`,
    check: ({ diagram }) => {
      const demo = findEntity(diagram, 'demo');
      const root = demo.fields.find((f) => f.name === 'root');
      assertTrue(root?.hasChildren === true, 'root expands');
      const subs = demo.fields.find((f) => f.name === 'subs' && f.indent === 1);
      assertTrue(subs !== undefined, 'subs appears at indent 1');
      assertEq(subs!.hasChildren, false, 'recursive array has no caret');
    },
  },

  /* ---- Existing structural types ------------------------------------- */

  {
    name: 'inline object type expands',
    source: `xdbml: 0.1
Table orders {
  id      int     [pk]
  details object {
    qty    int
    weight decimal(8,2)
  }
}
`,
    check: ({ diagram }) => {
      const orders = findEntity(diagram, 'orders');
      const details = orders.fields.find((f) => f.name === 'details');
      assertTrue(details?.hasChildren === true, 'details expands');
      const qty = orders.fields.find((f) => f.name === 'qty' && f.indent === 1);
      const weight = orders.fields.find((f) => f.name === 'weight' && f.indent === 1);
      assertTrue(qty !== undefined && weight !== undefined, 'object fields appear at indent 1');
    },
  },

  {
    name: 'oneOf polymorphism expands with synthetic alternative rows',
    source: `xdbml: 0.1
Table payments {
  id     int [pk]
  method oneOf {
    card     object { last4 varchar(4) }
    transfer object { iban varchar(34) }
  }
}
`,
    check: ({ diagram }) => {
      const payments = findEntity(diagram, 'payments');
      const cardAlt = payments.fields.find((f) => f.name === '{card}');
      const transferAlt = payments.fields.find((f) => f.name === '{transfer}');
      assertTrue(cardAlt !== undefined, '{card} synthetic alternative row');
      assertTrue(transferAlt !== undefined, '{transfer} synthetic alternative row');
      assertEq(cardAlt!.synthetic, true, 'alternative rows are marked synthetic');
    },
  },

  /* ---- Name alignment (commit acca7cd) ------------------------------- */
  //
  // The alignment fix lives in EntityCard.vue's nameLeftEdge() at the
  // SVG layer, not in layout.ts. The layout only emits the indent
  // level. So we can't directly test the rendered X coordinate here.
  // What we CAN test is that the layout output that drives alignment
  // is well-formed: every row has an integer indent >= 0, and rows
  // are emitted in the same order as the original source.

  {
    name: 'all rows have non-negative integer indent',
    source: `xdbml: 0.1
Type Address { street varchar  city varchar }
Table users {
  id        int     [pk]
  primary_addr Address
  tags      array [varchar]
}
`,
    check: ({ diagram }) => {
      const users = findEntity(diagram, 'users');
      for (const f of users.fields) {
        assertTrue(Number.isInteger(f.indent), `indent is integer for '${f.name}'`);
        assertTrue(f.indent >= 0, `indent is non-negative for '${f.name}'`);
      }
    },
  },

  /* ---- Inspector lookup (commit 841d95f) ----------------------------- */

  {
    name: 'inspector resolves a path into an expanded named-type body',
    source: `xdbml: 0.1
Type MonetaryAmount {
  amount   decimal(18,4)
  currency char(3)
}
Table products {
  id    int     [pk]
  price MonetaryAmount
}
`,
    check: ({ ast }) => {
      // Click on the `amount` row under `price`. Before the inspector
      // fix, this resolved to null and the inspector showed its empty
      // state. After the fix, it resolves to the FieldDeclaration
      // inside the Type body.
      const resolved = resolveSelection(ast, {
        kind: 'field',
        entityId: 'products',
        path: 'price.amount',
      });
      assertTrue(resolved !== null, 'selection resolves');
      assertEq(resolved!.kind, 'field', 'resolves to a field');
      if (resolved!.kind !== 'field') return;
      assertEq(resolved!.node.name, 'amount', 'correct field');
      assertEq(resolved!.ancestors.length, 1, 'one ancestor (price)');
      assertEq(resolved!.ancestors[0].name, 'price', 'ancestor is price');
    },
  },

  /* ---- Container sizing consistency (commit fix-pending) ------------ */
  //
  // The auto-layout in buildDiagram and the recompute path in
  // applyUserPositions must agree on container bounds for the same
  // member positions. They previously differed by CONTAINER_PADDING
  // (24 pixels) in height: auto-layout left zero bottom padding while
  // the recompute correctly accounted for both top and bottom. The
  // visible symptom was a 24-pixel jump in container height the first
  // time any entity was dragged inside the container, because the
  // rendering path switched from auto-layout to recompute.

  {
    name: 'auto-layout and applyUserPositions produce identical container bounds',
    source: `xdbml: 0.1
Container core {
  Table users {
    id    int [pk]
    email varchar
  }
  Table posts {
    id        int [pk]
    author_id int
  }
}
`,
    check: ({ ast }) => {
      const base = buildDiagram(ast);
      // Force recompute path by passing entities' current positions.
      const positions = new Map<string, { x: number; y: number }>();
      for (const e of base.entities) positions.set(e.id, { x: e.bounds.x, y: e.bounds.y });
      const recomputed = applyUserPositions(base, positions);
      assertTrue(base.containers.length === 1, 'one container');
      const autoBounds = base.containers[0].bounds;
      const recompBounds = recomputed.containers[0].bounds;
      assertEq(autoBounds.x, recompBounds.x, 'container x matches');
      assertEq(autoBounds.y, recompBounds.y, 'container y matches');
      assertEq(autoBounds.width, recompBounds.width, 'container width matches');
      assertEq(autoBounds.height, recompBounds.height, 'container height matches');
    },
  },

  /* ---- Bundled examples ---------------------------------------------- */
  //
  // Every bundled .xdbml example must parse AND lay out without errors.
  // Generated below as a single test per example, so a failure in any
  // one example doesn't hide failures in the others.
];

// Add one test per bundled example.
for (const file of readdirSync(examplesDir).filter((f) => f.endsWith('.xdbml')).sort()) {
  tests.push({
    name: `bundled example parses and lays out: ${file}`,
    source: () => readFileSync(join(examplesDir, file), 'utf-8'),
    check: ({ ast, diagram }) => {
      assertTrue(ast.statements.length > 0, 'has statements');
      assertTrue(diagram.entities.length > 0, 'has at least one entity');
      // Every entity should have at least one row (an entity with no
      // fields is technically allowed by the spec but no bundled
      // example should ship with one).
      for (const e of diagram.entities) {
        assertTrue(e.fields.length > 0, `entity '${e.name}' has rows`);
      }
    },
  });
}

/* -------------------------------------------------------------------------
 * Assertion helpers
 *
 * Plain functions that throw on failure. The runner catches the throw
 * and prints the test name + message.
 * ----------------------------------------------------------------------- */

function assertEq<T> (actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertTrue (cond: boolean, label: string): void {
  if (!cond) throw new Error(`${label}: expected true`);
}

function findEntity (diagram: DiagramModel, name: string) {
  const ent = diagram.entities.find((e) => e.name === name);
  if (!ent) throw new Error(`entity '${name}' not found in diagram`);
  return ent;
}

/* -------------------------------------------------------------------------
 * Runner
 * ----------------------------------------------------------------------- */

let passed = 0;
let failed = 0;
const failures: { name: string; error: string }[] = [];

for (const t of tests) {
  const source = typeof t.source === 'function' ? t.source() : t.source;
  try {
    const ast = parse(source);
    const diagram = buildDiagram(ast);
    t.check({ ast, diagram });
    process.stdout.write(`  ${GREEN}✓${RESET} ${t.name}\n`);
    passed += 1;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`  ${RED}✗${RESET} ${t.name}\n`);
    process.stdout.write(`    ${DIM}${msg}${RESET}\n`);
    failures.push({ name: t.name, error: msg });
    failed += 1;
  }
}

process.stdout.write('\n');
if (failed === 0) {
  process.stdout.write(`${GREEN}${passed} passed${RESET}, 0 failed\n`);
  process.exit(0);
} else {
  process.stdout.write(`${GREEN}${passed} passed${RESET}, ${RED}${failed} failed${RESET}\n`);
  process.exit(1);
}
