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
