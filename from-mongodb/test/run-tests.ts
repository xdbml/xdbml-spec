/**
 * Test runner for @xdbml/from-mongodb. Mirrors parser/test/run-tests.ts:
 * no framework, colored TTY output, non-zero exit on failure.
 *
 * Run: npm test  (node --experimental-strip-types test/run-tests.ts)
 */

import {
  simplifiedSchemaToXdbml,
  detectReferences,
  type CollectionSchemaResult,
} from '../src/index.ts';

const isTTY = process.stdout.isTTY;
const RED = isTTY ? '\x1b[31m' : '';
const GREEN = isTTY ? '\x1b[32m' : '';
const RESET = isTTY ? '\x1b[0m' : '';

interface TestResult { name: string; passed: boolean; error?: string }
const results: TestResult[] = [];

function test (name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e instanceof Error ? e.message : String(e) });
  }
}

function assert (cond: boolean, label: string): void {
  if (!cond) throw new Error(label);
}

function assertIncludes (haystack: string, needle: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`expected output to include ${JSON.stringify(needle)}`);
  }
}

function assertExcludes (haystack: string, needle: string): void {
  if (haystack.includes(needle)) {
    throw new Error(`expected output NOT to include ${JSON.stringify(needle)}`);
  }
}

/** Shorthand for a single-collection result. */
function coll (schema: CollectionSchemaResult['schema'], name = 'things', db = 'test'): CollectionSchemaResult {
  return { database: db, collection: name, schema };
}

const OPTS = { inferredOn: '2026-01-01' }; // reproducible provenance

/* -------------------------------------------------------------------------
 * R1 -- scalar type mapping
 * ---------------------------------------------------------------------- */

test('R1: BSON scalars map to BSON-native xDBML types', () => {
  const x = simplifiedSchemaToXdbml([coll({
    a: { types: [{ bsonType: 'String' }] },
    b: { types: [{ bsonType: 'ObjectId' }] },
    c: { types: [{ bsonType: 'Int32' }] },
    d: { types: [{ bsonType: 'Long' }] },
    e: { types: [{ bsonType: 'Decimal128' }] },
    f: { types: [{ bsonType: 'Binary' }] },
  })], OPTS);
  assertIncludes(x, 'a string [not null]');
  assertIncludes(x, 'b objectId [not null]');
  assertIncludes(x, 'c int32 [not null]');
  assertIncludes(x, 'd int64 [not null]');
  assertIncludes(x, 'e Decimal128 [not null]');
  assertIncludes(x, 'f BinData [not null]');
});

/* -------------------------------------------------------------------------
 * R2 -- nullability
 * ---------------------------------------------------------------------- */

test('R2: Null/Undefined strip to optionality; single clean type gets not null', () => {
  const x = simplifiedSchemaToXdbml([coll({
    always: { types: [{ bsonType: 'String' }] },
    sometimes_null: { types: [{ bsonType: 'String' }, { bsonType: 'Null' }] },
    sometimes_missing: { types: [{ bsonType: 'Undefined' }, { bsonType: 'String' }] },
  })], OPTS);
  assertIncludes(x, 'always string [not null]');
  assertIncludes(x, 'sometimes_null string\n');
  assertExcludes(x, 'sometimes_null string [not null]');
  assertIncludes(x, 'sometimes_missing string\n');
  assertExcludes(x, 'sometimes_missing string [not null]');
});

test('R2: field observed only as null/missing falls back to string with comment', () => {
  const x = simplifiedSchemaToXdbml([coll({
    ghost: { types: [{ bsonType: 'Null' }, { bsonType: 'Undefined' }] },
  })], OPTS);
  assertIncludes(x, 'ghost string // only null/missing sampled');
});

/* -------------------------------------------------------------------------
 * R3 -- scalar variance folds to a union in frequency order
 * ---------------------------------------------------------------------- */

test('R3: scalar variance folds to a union, frequency order preserved', () => {
  const x = simplifiedSchemaToXdbml([coll({
    total: { types: [{ bsonType: 'Decimal128' }, { bsonType: 'Double' }] },
  })], OPTS);
  assertIncludes(x, 'total union [Decimal128, double]\n');
  // Decided (2026-07-11): R2 applies not null to single-type fields only.
  // A never-null multi-type field does NOT get not null, matching the
  // recipe, mongodb-demo, and the committed playground payloads.
  assertExcludes(x, 'total union [Decimal128, double] [not null]');
});

test('R3: nullable variance keeps the union and drops not null', () => {
  const x = simplifiedSchemaToXdbml([coll({
    zip: { types: [{ bsonType: 'String' }, { bsonType: 'Int32' }, { bsonType: 'Null' }] },
  })], OPTS);
  assertIncludes(x, 'zip union [string, int32]\n');
  assertExcludes(x, 'zip union [string, int32] [not null]');
});

/* -------------------------------------------------------------------------
 * R4 -- nested documents
 * ---------------------------------------------------------------------- */

test('R4: Document nests as object, recursively', () => {
  const x = simplifiedSchemaToXdbml([coll({
    address: { types: [{ bsonType: 'Document', fields: {
      city: { types: [{ bsonType: 'String' }] },
      geo: { types: [{ bsonType: 'Document', fields: {
        lat: { types: [{ bsonType: 'Double' }] },
      } }] },
    } }] },
  })], OPTS);
  assertIncludes(x, 'address object {');
  assertIncludes(x, 'city string [not null]');
  assertIncludes(x, 'geo object {');
  assertIncludes(x, 'lat double [not null]');
});

/* -------------------------------------------------------------------------
 * R5 -- arrays
 * ---------------------------------------------------------------------- */

test('R5: array of one scalar type', () => {
  const x = simplifiedSchemaToXdbml([coll({
    tags: { types: [{ bsonType: 'Array', types: [{ bsonType: 'String' }] }] },
  })], OPTS);
  assertIncludes(x, 'tags array [string] [not null]');
});

test('R5: array of several scalar types uses the union-folding sugar', () => {
  const x = simplifiedSchemaToXdbml([coll({
    mixed: { types: [{ bsonType: 'Array', types: [{ bsonType: 'Int32' }, { bsonType: 'String' }] }] },
  })], OPTS);
  assertIncludes(x, 'mixed array [int32, string] [not null]');
});

test('R5: array of documents uses a singularized element object', () => {
  const x = simplifiedSchemaToXdbml([coll({
    line_items: { types: [{ bsonType: 'Array', types: [{ bsonType: 'Document', fields: {
      sku: { types: [{ bsonType: 'String' }] },
    } }] }] },
    categories: { types: [{ bsonType: 'Array', types: [{ bsonType: 'Document', fields: {
      label: { types: [{ bsonType: 'String' }] },
    } }] }] },
  })], OPTS);
  assertIncludes(x, 'line_items array [');
  assertIncludes(x, 'line_item object {');
  assertIncludes(x, 'category object {');
});

/* -------------------------------------------------------------------------
 * R6 -- mixed document/scalar polymorphism
 * ---------------------------------------------------------------------- */

test('R6: document + scalar mix becomes oneOf with named variants', () => {
  const x = simplifiedSchemaToXdbml([coll({
    payment: { types: [
      { bsonType: 'Document', fields: { method: { types: [{ bsonType: 'String' }] } } },
      { bsonType: 'String' },
    ] },
  })], OPTS);
  assertIncludes(x, 'payment oneOf {');
  assertIncludes(x, 'as_document object {');
  assertIncludes(x, 'as_string string');
});

test('R6: two document shapes number their variants', () => {
  const x = simplifiedSchemaToXdbml([coll({
    v: { types: [
      { bsonType: 'Document', fields: { a: { types: [{ bsonType: 'String' }] } } },
      { bsonType: 'Document', fields: { b: { types: [{ bsonType: 'Int32' }] } } },
    ] },
  })], OPTS);
  assertIncludes(x, 'as_document_1 object {');
  assertIncludes(x, 'as_document_2 object {');
});

/* -------------------------------------------------------------------------
 * R7-R9 -- keys, refs, provenance, structure
 * ---------------------------------------------------------------------- */

test('R7: _id gets pk and never not null', () => {
  const x = simplifiedSchemaToXdbml([coll({
    _id: { types: [{ bsonType: 'ObjectId' }] },
  })], OPTS);
  assertIncludes(x, '_id objectId [pk]');
  assertExcludes(x, '_id objectId [pk, not null]');
});

test('R8: refs emit block form with database-qualified paths and cardinality', () => {
  const x = simplifiedSchemaToXdbml(
    [coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'shop'),
     coll({ customer_id: { types: [{ bsonType: 'ObjectId' }] } }, 'orders', 'shop')],
    { ...OPTS, refs: [{ from: 'shop.orders.customer_id', to: 'shop.customers._id' }] },
  );
  assertIncludes(x, "Ref: shop.orders.customer_id > shop.customers._id [source: '0..*', target: '1..1']");
});

test('R8: no refs are emitted unless supplied', () => {
  const x = simplifiedSchemaToXdbml(
    [coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'shop'),
     coll({ customer_id: { types: [{ bsonType: 'ObjectId' }] } }, 'orders', 'shop')],
    OPTS,
  );
  assertExcludes(x, 'Ref:');
});

test('R9: provenance attributes and note on every collection', () => {
  const x = simplifiedSchemaToXdbml([coll({})], { inferredOn: '2026-01-01', sampleSize: 500 });
  assertIncludes(x, "x_inferred_from: 'mongodb-mcp collection-schema'");
  assertIncludes(x, 'x_sample_size: 500');
  assertIncludes(x, "x_inferred_on: '2026-01-01'");
  assertIncludes(x, "Note: 'Schema inferred from a document sample");
});

test('collections group into one Database block per database, first-seen order', () => {
  const x = simplifiedSchemaToXdbml([
    coll({}, 'a', 'db1'), coll({}, 'b', 'db2'), coll({}, 'c', 'db1'),
  ], OPTS);
  const iDb1 = x.indexOf('Database db1 {');
  const iDb2 = x.indexOf('Database db2 {');
  assert(iDb1 !== -1 && iDb2 !== -1, 'both Database blocks present');
  assert(iDb1 < iDb2, 'first-seen order');
  assert(x.indexOf('Collection c') > iDb1 && x.indexOf('Collection c') < iDb2 + x.slice(iDb2).length, 'c grouped under db1');
  assert((x.match(/Database db1 \{/g) ?? []).length === 1, 'db1 block not duplicated');
});

test('output starts with the version directive', () => {
  const x = simplifiedSchemaToXdbml([coll({})], OPTS);
  assert(x.startsWith('xdbml: 0.3\n'), 'version directive first');
});

/* -------------------------------------------------------------------------
 * detectReferences
 * ---------------------------------------------------------------------- */

test('detectReferences: <base>_id ObjectId matching a same-database collection', () => {
  const c = detectReferences([
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'shop'),
    coll({ customer_id: { types: [{ bsonType: 'ObjectId' }] } }, 'orders', 'shop'),
  ]);
  assert(c.length === 1, `expected 1 candidate, got ${c.length}`);
  assert(c[0].from === 'shop.orders.customer_id', 'from path');
  assert(c[0].to === 'shop.customers._id', 'to path');
  assert(c[0].basis === 'naming', 'basis');
});

test('detectReferences: camelCase <base>Id and plural variants', () => {
  const c = detectReferences([
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'categories', 'shop'),
    coll({ categoryId: { types: [{ bsonType: 'ObjectId' }] } }, 'products', 'shop'),
  ]);
  assert(c.length === 1, `expected 1 candidate, got ${c.length}`);
  assert(c[0].to === 'shop.categories._id', 'plural variant matched');
});

test('detectReferences: same-database match preferred over cross-database', () => {
  const c = detectReferences([
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'crm'),
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'shop'),
    coll({ customer_id: { types: [{ bsonType: 'ObjectId' }] } }, 'orders', 'shop'),
  ]);
  assert(c.length === 1, `expected 1 candidate, got ${c.length}`);
  assert(c[0].to === 'shop.customers._id', 'same-database preferred');
  assert(c[0].basis === 'naming', 'basis is naming');
});

test('detectReferences: cross-database fallback flagged as such', () => {
  const c = detectReferences([
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'crm'),
    coll({ customer_id: { types: [{ bsonType: 'ObjectId' }] } }, 'orders', 'shop'),
  ]);
  assert(c.length === 1, `expected 1 candidate, got ${c.length}`);
  assert(c[0].to === 'crm.customers._id', 'cross-database target');
  assert(c[0].basis === 'naming-cross-database', 'basis flags cross-database');
});

test('detectReferences: ignores _id itself, non-ObjectId fields, and unmatched names', () => {
  const c = detectReferences([
    coll({
      _id: { types: [{ bsonType: 'ObjectId' }] },
      external_id: { types: [{ bsonType: 'String' }] },
      warehouse_id: { types: [{ bsonType: 'ObjectId' }] },
    }, 'orders', 'shop'),
  ]);
  assert(c.length === 0, `expected 0 candidates, got ${c.length}`);
});

test('detectReferences: nullable ObjectId ref field still detected', () => {
  const c = detectReferences([
    coll({ _id: { types: [{ bsonType: 'ObjectId' }] } }, 'customers', 'shop'),
    coll({ customer_id: { types: [{ bsonType: 'ObjectId' }, { bsonType: 'Null' }] } }, 'orders', 'shop'),
  ]);
  assert(c.length === 1, 'nullable ObjectId detected');
});

/* -------------------------------------------------------------------------
 * End-to-end fixture (the recipe's worked example, deterministic)
 * ---------------------------------------------------------------------- */

test('end to end: recipe fixture produces the documented shapes', () => {
  const orders = coll({
    _id: { types: [{ bsonType: 'ObjectId' }] },
    customer_id: { types: [{ bsonType: 'ObjectId' }] },
    total: { types: [{ bsonType: 'Decimal128' }, { bsonType: 'Double' }] },
    payment: { types: [
      { bsonType: 'Document', fields: {
        method: { types: [{ bsonType: 'String' }] },
        last4: { types: [{ bsonType: 'String' }] },
        captured: { types: [{ bsonType: 'Boolean' }] },
      } },
      { bsonType: 'String' },
    ] },
    line_items: { types: [{ bsonType: 'Array', types: [{ bsonType: 'Document', fields: {
      sku: { types: [{ bsonType: 'String' }] },
      qty: { types: [{ bsonType: 'Int32' }] },
      discount: { types: [{ bsonType: 'Double' }, { bsonType: 'Undefined' }] },
    } }] }] },
    notes: { types: [{ bsonType: 'Undefined' }, { bsonType: 'String' }] },
  }, 'orders', 'shop');

  const customers = coll({
    _id: { types: [{ bsonType: 'ObjectId' }] },
    email: { types: [{ bsonType: 'String' }] },
  }, 'customers', 'shop');

  const refs = detectReferences([customers, orders]);
  const x = simplifiedSchemaToXdbml([customers, orders], { ...OPTS, refs });

  assertIncludes(x, 'Database shop {');
  assertIncludes(x, 'total union [Decimal128, double]\n');
  assertIncludes(x, 'payment oneOf {');
  assertIncludes(x, 'line_item object {');
  assertIncludes(x, 'discount double\n');
  assertIncludes(x, "Ref: shop.orders.customer_id > shop.customers._id [source: '0..*', target: '1..1']");
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
