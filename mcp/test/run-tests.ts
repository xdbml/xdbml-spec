/**
 * Test runner for @xdbml/mcp validation logic.
 *
 * Mirrors parser/test/run-tests.ts: no external test framework, colored
 * output on a TTY, plain text otherwise, non-zero exit code on failure.
 *
 * Exercises validateXdbml / validateXdbmlTool directly against @xdbml/parse
 * with no MCP SDK or Worker runtime in the loop (the reason the logic lives
 * in validate-tool.ts in the first place).
 *
 * Run: npm test  (node --experimental-strip-types test/run-tests.ts)
 */

import { validateXdbml, validateXdbmlTool } from '../src/validate-tool.ts';
import { XDBML_REFERENCE } from '../src/reference.ts';

const isTTY = process.stdout.isTTY;
const RED = isTTY ? '\x1b[31m' : '';
const GREEN = isTTY ? '\x1b[32m' : '';
const RESET = isTTY ? '\x1b[0m' : '';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function test (name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function assertEqual<T> (actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert (cond: boolean, label: string): void {
  if (!cond) throw new Error(label);
}

/* -------------------------------------------------------------------------
 * Entity and container counting
 * ---------------------------------------------------------------------- */

test('counts entities nested in a container body (regression: was 0)', () => {
  const r = validateXdbml(`xdbml: 0.3

Database shop {
  Collection customers { _id objectId [pk] }
  Collection orders {
    _id objectId [pk]
    customer_id objectId
  }
}

Ref: orders.customer_id > customers._id
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.entityCount, 2, 'entityCount');
  assertEqual(r.containerCount, 1, 'containerCount');
  assertEqual(r.diagnostics.length, 0, 'diagnostics');
});

test('counts top-level entities (no containers)', () => {
  const r = validateXdbml(`xdbml: 0.3

Collection customers { _id objectId [pk] }
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.entityCount, 1, 'entityCount');
  assertEqual(r.containerCount, 0, 'containerCount');
});

test('counts entities mixed between top level and container bodies', () => {
  const r = validateXdbml(`xdbml: 0.3

Collection standalone { _id objectId [pk] }

Schema core {
  Table users { id int [pk] }
}
`);
  assertEqual(r.entityCount, 2, 'entityCount');
  assertEqual(r.containerCount, 1, 'containerCount');
});

test('empty container: zero entities, one container', () => {
  const r = validateXdbml(`xdbml: 0.3

Namespace empty {
}
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.entityCount, 0, 'entityCount');
  assertEqual(r.containerCount, 1, 'containerCount');
});

/* -------------------------------------------------------------------------
 * Supertype groups (spec 12, v0.5)
 * ---------------------------------------------------------------------- */

test('supertype group document validates and counts its entities', () => {
  const r = validateXdbml(`xdbml: 0.5

Entity Party {
  party_id int [pk]
}
Entity Person { }
Entity Organization { }

SupertypeGroup legal_nature [supertype: Party, completeness: total, exclusivity: disjoint] {
  Person
  Organization
}
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.entityCount, 3, 'entityCount');
});

test('supertype group rules surface as diagnostics', () => {
  const r = validateXdbml(`xdbml: 0.5

Entity Party {
  party_id int [pk]
  name varchar
}
Entity Worker { }
Entity Person {
  name varchar
}

SupertypeGroup legal_nature [supertype: Party] {
  Person
}
SupertypeGroup workforce [supertype: Worker] {
  Person
}
`);
  assertEqual(r.valid, false, 'valid');
  const codes = r.diagnostics.map((d) => (d as { code?: string }).code).sort().join(',');
  assertEqual(codes, 'subtype-in-multiple-groups,supertype-attribute-redeclared', 'codes');
});

test('a newer version than the parser supports is refused', () => {
  // A version far ahead of any parser, so the test survives each release.
  const r = validateXdbml('xdbml: 99.0\n\nEntity a { id int [pk] }\n');
  assertEqual(r.valid, false, 'valid');
});

/* -------------------------------------------------------------------------
 * v0.6.1: list separators, keywords as field names, View settings
 * ---------------------------------------------------------------------- */

test('v0.6.1: Enum values and fields written with commas validate', () => {
  const r = validateXdbml(`xdbml: 0.6

Enum service_status {
  'scheduled' [note: 'Appointment booked'],
  'cancelled' [note: 'Cancelled by customer or shop']
}
Entity visits { id int [pk], status service_status, visited_at timestamp }
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.diagnostics.length, 0, 'diagnostics.length');
});

test('v0.6.1: a column named note validates, as in DBML', () => {
  const r = validateXdbml(`Table orders {
  id   int [pk]
  note varchar
  Note: 'One row per order'
}
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.entityCount, 1, 'entityCount');
});

test('v0.6.1: materialized in a View body is a parse error that names the brackets', () => {
  const r = validateXdbml(`xdbml: 0.6

View monthly_revenue {
  materialized: true
  month date [pk]
}
`);
  assertEqual(r.valid, false, 'valid');
  assertEqual(r.diagnostics[0].code, 'parse-error', 'code');
  assertEqual(r.diagnostics[0].line, 4, 'line');
  assert(r.diagnostics[0].message.includes('View monthly_revenue [materialized: ...]'), r.diagnostics[0].message);
});

test('v0.6.1: source_query in the brackets is a warning; the document stays valid', () => {
  const r = validateXdbml(`xdbml: 0.6

View active_customers [source_query: 'SELECT id FROM customers'] {
  id int [pk]
}
`);
  assertEqual(r.valid, true, 'valid');
  assertEqual(r.diagnostics.length, 1, 'diagnostics.length');
  assertEqual(r.diagnostics[0].severity, 'warning', 'severity');
  assertEqual(r.diagnostics[0].code, 'source-query-in-settings', 'code');
});

test('v0.6.1: the reference teaches View placement and list separators', () => {
  assert(XDBML_REFERENCE.includes('go in the brackets after the View name, before the body'), 'View placement');
  assert(XDBML_REFERENCE.includes('with no comma or semicolon after it'), 'list separators');
  assert(XDBML_REFERENCE.includes('A field may take the name of any keyword'), 'keywords as field names');
});

/* -------------------------------------------------------------------------
 * Summary wording
 * ---------------------------------------------------------------------- */

test('summary omits container clause when there are no containers', () => {
  const r = validateXdbml(`xdbml: 0.3

Collection a { _id objectId [pk] }
`);
  assertEqual(r.summary, 'Valid xDBML: 1 entity, all references resolved.', 'summary');
});

test('summary includes container clause when containers are present', () => {
  const r = validateXdbml(`xdbml: 0.3

Database shop {
  Collection a { _id objectId [pk] }
  Collection b { _id objectId [pk] }
}
`);
  assertEqual(
    r.summary,
    'Valid xDBML: 2 entities and 1 container, all references resolved.',
    'summary',
  );
});

/* -------------------------------------------------------------------------
 * Error paths
 * ---------------------------------------------------------------------- */

test('syntax error: invalid with a parse-error diagnostic carrying position', () => {
  const r = validateXdbml(`xdbml: 0.3
Collection a { _id objectId [pk }
`);
  assertEqual(r.valid, false, 'valid');
  assertEqual(r.entityCount, 0, 'entityCount');
  assertEqual(r.containerCount, 0, 'containerCount');
  assertEqual(r.diagnostics.length, 1, 'diagnostics.length');
  assertEqual(r.diagnostics[0].code, 'parse-error', 'code');
  assertEqual(r.diagnostics[0].line, 2, 'line');
  assert(r.diagnostics[0].column > 0, 'column > 0');
});

test('unresolved reference: invalid, entity still counted', () => {
  const r = validateXdbml(`xdbml: 0.3

Collection a { _id objectId [pk] }
Ref: a._id > ghost.id
`);
  assertEqual(r.valid, false, 'valid');
  assertEqual(r.entityCount, 1, 'entityCount');
  assertEqual(r.diagnostics.length, 1, 'diagnostics.length');
  assertEqual(r.diagnostics[0].severity, 'error', 'severity');
  assertEqual(r.diagnostics[0].code, 'unresolved-entity', 'code');
});

/* -------------------------------------------------------------------------
 * MCP-facing wrapper
 * ---------------------------------------------------------------------- */

test('validateXdbmlTool: JSON tail parses and carries the structured outcome', () => {
  const result = validateXdbmlTool({
    source: `xdbml: 0.3

Database shop {
  Collection customers { _id objectId [pk] }
}
`,
  });
  const text = result.content[0].text;
  const match = text.match(/```json\n(.*)\n```/s);
  assert(match !== null, 'JSON tail present');
  const parsed = JSON.parse(match![1]);
  assertEqual(parsed.valid, true, 'valid');
  assertEqual(parsed.entityCount, 1, 'entityCount');
  assertEqual(parsed.containerCount, 1, 'containerCount');
  assert(Array.isArray(parsed.diagnostics), 'diagnostics is array');
});

/* -------------------------------------------------------------------------
 * Report
 * ---------------------------------------------------------------------- */

let failed = 0;
for (const r of results) {
  if (r.passed) {
    console.log(`  ${GREEN}\u2713${RESET} ${r.name}`);
  } else {
    failed++;
    console.log(`  ${RED}\u2717 ${r.name}${RESET}`);
    console.log(`      ${r.error}`);
  }
}
console.log('');
console.log('== Summary ==');
console.log(`  ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
