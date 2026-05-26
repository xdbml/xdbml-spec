/**
 * Test runner for @xdbml/parse.
 *
 * Walks /examples and parses each file. Reports per-file pass/fail with
 * line/column errors. Also runs a small inline-test suite for grammar
 * features that aren't necessarily exercised by the examples (e.g.
 * compact DBML-compat documents, tuples, map types).
 *
 * No external test framework. Output is colored for readability when run
 * in a terminal; falls back to plain text when stdout is not a TTY.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { parse } from '../src/index.ts';
import type { XDbmlDocument } from '../src/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(__dirname, 'examples');

const isTTY = process.stdout.isTTY;
const RED = isTTY ? '\x1b[31m' : '';
const GREEN = isTTY ? '\x1b[32m' : '';
const YELLOW = isTTY ? '\x1b[33m' : '';
const CYAN = isTTY ? '\x1b[36m' : '';
const DIM = isTTY ? '\x1b[2m' : '';
const RESET = isTTY ? '\x1b[0m' : '';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  detail?: string;
}

function ok (name: string, detail?: string): TestResult {
  return {
    name,
    passed: true,
    detail,
  };
}

function fail (name: string, error: string): TestResult {
  return {
    name,
    passed: false,
    error,
  };
}

/* -------------------------------------------------------------------------
 * Example-file tests
 * ----------------------------------------------------------------------- */

function runExampleTests (): TestResult[] {
  const results: TestResult[] = [];
  let files: string[];
  try {
    files = readdirSync(examplesDir)
      .filter((f) => f.endsWith('.xdbml') || f.endsWith('.dbml'))
      .sort();
  } catch (e) {
    return [fail('Locate examples directory', `${(e as Error).message}`)];
  }
  if (files.length === 0) {
    return [fail('Locate example files', `No .xdbml files in ${examplesDir}`)];
  }
  for (const filename of files) {
    const path = join(examplesDir, filename);
    const source = readFileSync(path, 'utf8');
    try {
      const doc = parse(source);
      const summary = summarizeDocument(doc);
      results.push(ok(`Parse ${filename}`, summary));
    } catch (e) {
      results.push(fail(`Parse ${filename}`, (e as Error).message));
    }
  }
  return results;
}

function summarizeDocument (doc: XDbmlDocument): string {
  const counts: Record<string, number> = {};
  for (const s of doc.statements) {
    counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  }
  // Also count entities inside containers
  let containedEntities = 0;
  let containedViews = 0;
  let containedEdges = 0;
  for (const s of doc.statements) {
    if (s.kind === 'ContainerDeclaration') {
      for (const b of s.body) {
        if (b.kind === 'EntityDeclaration') containedEntities += 1;
        else if (b.kind === 'ViewDeclaration') containedViews += 1;
        else if (b.kind === 'EdgeDeclaration') containedEdges += 1;
      }
    }
  }
  const parts: string[] = [];
  if (doc.version) parts.push(`xdbml ${doc.version.version}`);
  for (const [k, v] of Object.entries(counts)) {
    parts.push(`${v} ${k.replace('Declaration', '')}`);
  }
  if (containedEntities) parts.push(`${containedEntities} entit${containedEntities === 1 ? 'y' : 'ies'} in containers`);
  if (containedViews) parts.push(`${containedViews} view${containedViews === 1 ? '' : 's'} in containers`);
  if (containedEdges) parts.push(`${containedEdges} edge${containedEdges === 1 ? '' : 's'} in containers`);
  return parts.join(', ');
}

/* -------------------------------------------------------------------------
 * Inline assertion tests
 *
 * These exercise specific grammar features in isolation, so a regression
 * to one of them surfaces as a small, specific failure rather than as
 * "example 02 stopped parsing somewhere on line 137".
 * ----------------------------------------------------------------------- */

function runInlineTests (): TestResult[] {
  const cases: { name: string; source: string; assert: (doc: XDbmlDocument) => string | null }[] = [
    {
      name: 'Bare DBML compat: no version header, simple Table',
      source: `Table users {
  id int [pk]
  name varchar
}`,
      assert: (doc) => {
        if (doc.version !== undefined) return 'expected no version';
        if (doc.statements.length !== 1) return `expected 1 statement, got ${doc.statements.length}`;
        const s = doc.statements[0];
        if (s.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${s.kind}`;
        if (s.keyword !== 'Table') return `expected keyword Table, got ${s.keyword}`;
        if (s.body.length !== 2) return `expected 2 body items, got ${s.body.length}`;
        return null;
      },
    },
    {
      name: 'Version header recognized',
      source: `xdbml: 0.1\nProject p { targets: PostgreSQL }`,
      assert: (doc) => {
        if (!doc.version) return 'expected version';
        if (doc.version.version !== '0.1') return `expected version 0.1, got ${doc.version.version}`;
        return null;
      },
    },
    {
      name: 'Container with type setting',
      source: `xdbml: 0.1
Container core [type: schema, target: Oracle] {
  Entity users { id int [pk] }
}`,
      assert: (doc) => {
        const c = doc.statements[0];
        if (c.kind !== 'ContainerDeclaration') return `expected Container, got ${c.kind}`;
        if (c.keyword !== 'Container') return `keyword should be Container, got ${c.keyword}`;
        if (c.settings.length !== 2) return `expected 2 settings, got ${c.settings.length}`;
        if (c.settings[0].name !== 'type') return `first setting should be 'type', got ${c.settings[0].name}`;
        if (c.body.length !== 1) return `expected 1 entity, got ${c.body.length}`;
        return null;
      },
    },
    {
      name: 'Container keyword synonyms (Schema, Database)',
      source: `xdbml: 0.1
Schema core { Entity u { id int } }
Database d [type: database] { Collection c { _id objectId } }`,
      assert: (doc) => {
        if (doc.statements.length !== 2) return `expected 2 statements`;
        const a = doc.statements[0];
        const b = doc.statements[1];
        if (a.kind !== 'ContainerDeclaration' || a.keyword !== 'Schema') return 'expected Schema container';
        if (b.kind !== 'ContainerDeclaration' || b.keyword !== 'Database') return 'expected Database container';
        return null;
      },
    },
    {
      name: 'Entity keyword synonyms (Entity, Collection, Record)',
      source: `xdbml: 0.1
Entity e { id int }
Collection c { _id objectId }
Record r { x string }`,
      assert: (doc) => {
        if (doc.statements.length !== 3) return `expected 3 statements`;
        for (const s of doc.statements) {
          if (s.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${s.kind}`;
        }
        return null;
      },
    },
    {
      name: 'Named Type with fields and reference',
      source: `xdbml: 0.1
Type Address {
  street varchar [not null]
  city varchar
}
Entity customers {
  id int [pk]
  primary_address Address
}`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'TypeDeclaration') return `expected Type, got ${t.kind}`;
        if (t.name !== 'Address') return 'wrong name';
        if (t.body.length !== 2) return 'expected 2 fields';
        return null;
      },
    },
    {
      name: 'Nested object type inside an entity',
      source: `xdbml: 0.1
Entity orders {
  id int [pk]
  ship object {
    street varchar [not null]
    city varchar
  } [not null]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body.find((b) => b.kind === 'FieldDeclaration' && b.name === 'ship');
        if (!f || f.kind !== 'FieldDeclaration') return 'expected ship field';
        if (f.type.kind !== 'ObjectType') return `expected ObjectType, got ${f.type.kind}`;
        if (f.type.fields.length !== 2) return 'expected 2 nested fields';
        if (f.settings.length !== 1 || f.settings[0].name !== 'not null') return 'expected [not null] settings on field';
        return null;
      },
    },
    {
      name: 'Array of named object: array [name object {...}]',
      source: `xdbml: 0.1
Entity orders {
  line_items array [
    line_item object {
      sku string [not null]
      qty int32
    }
  ] [minItems: 1]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body[0];
        if (f.kind !== 'FieldDeclaration') return 'expected field';
        if (f.type.kind !== 'ArrayType') return `expected ArrayType, got ${f.type.kind}`;
        if (f.type.elementName !== 'line_item') return `expected element name 'line_item', got ${f.type.elementName}`;
        if (!f.type.elementType || f.type.elementType.kind !== 'ObjectType') return 'expected inner ObjectType';
        if (f.settings.length !== 1) return 'expected [minItems: 1]';
        return null;
      },
    },
    {
      name: 'oneOf polymorphism with discriminator',
      source: `xdbml: 0.1
Entity payments {
  method oneOf {
    card object { last4 string }
    bank object { iban string }
  } [discriminator: method_kind]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body[0];
        if (f.kind !== 'FieldDeclaration') return 'expected field';
        if (f.type.kind !== 'OneOfType') return `expected OneOfType, got ${f.type.kind}`;
        if (f.type.alternatives.length !== 2) return 'expected 2 alternatives';
        if (f.type.alternatives[0].name !== 'card') return 'wrong alternative name';
        if (f.type.settings.length !== 1 || f.type.settings[0].name !== 'discriminator') return 'expected discriminator';
        return null;
      },
    },
    {
      name: 'union scalar with null',
      source: `xdbml: 0.1
Entity r {
  legacy_id union [string, int, null]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body[0];
        if (f.kind !== 'FieldDeclaration' || f.type.kind !== 'UnionType') return 'expected union field';
        if (f.type.members.length !== 3) return `expected 3 members, got ${f.type.members.length}`;
        if (f.type.members[2].kind !== 'NullTypeLiteral') return 'last member should be null';
        return null;
      },
    },
    {
      name: 'json with schema',
      source: `xdbml: 0.1
Entity api_logs {
  body json {
    sku varchar
    qty int
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body[0];
        if (f.kind !== 'FieldDeclaration' || f.type.kind !== 'JsonType') return 'expected json type';
        if (!f.type.fields || f.type.fields.length !== 2) return 'expected 2 fields in json block';
        return null;
      },
    },
    {
      name: 'Cross-container Ref with explicit cardinality and array wildcard',
      source: `xdbml: 0.1
Ref: orders_store.orders.line_items.[*].sku > catalog.products.sku [source: '1..*', target: '1..1']`,
      assert: (doc) => {
        const r = doc.statements[0];
        if (r.kind !== 'RefDeclaration') return 'expected ref';
        if (r.spec.operator !== '>') return 'expected >';
        const src = r.spec.source.path;
        const hasWild = src.some((s) => s.kind === 'PathArrayWildcard');
        if (!hasWild) return 'expected array wildcard in source path';
        if (r.settings.length !== 2) return `expected 2 settings, got ${r.settings.length}`;
        return null;
      },
    },
    {
      name: 'Edge with source/target and body fields',
      source: `xdbml: 0.1
Edge FOLLOWS [source: Person, target: Person, source_cardinality: '0..*', target_cardinality: '0..*'] {
  since date [not null]
  is_close boolean [default: false]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EdgeDeclaration') return `expected Edge, got ${e.kind}`;
        if (e.settings.length !== 4) return `expected 4 settings, got ${e.settings.length}`;
        if (e.body.length !== 2) return 'expected 2 body fields';
        return null;
      },
    },
    {
      name: 'View with source_query and materialized setting',
      source: `xdbml: 0.1
View top_sellers [materialized: true, refresh_schedule: 'daily'] {
  source_query: '''
    SELECT sku, COUNT(*) FROM orders GROUP BY sku
  '''
  sku varchar [pk]
  cnt int
}`,
      assert: (doc) => {
        const v = doc.statements[0];
        if (v.kind !== 'ViewDeclaration') return 'expected view';
        if (v.settings.length !== 2) return 'expected 2 settings';
        const sq = v.body.find((b) => b.kind === 'SourceQueryItem');
        if (!sq || sq.kind !== 'SourceQueryItem') return 'expected source_query item';
        if (!sq.query.includes('SELECT')) return 'source query content lost';
        return null;
      },
    },
    {
      name: 'Indexes block with composite and expression entries',
      source: `xdbml: 0.1
Entity bookings {
  id int
  country varchar
  d date

  indexes {
    (id, country) [pk]
    d [name: 'd_idx']
    (\`id * 2\`)
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const idx = e.body.find((b) => b.kind === 'IndexesBlock');
        if (!idx || idx.kind !== 'IndexesBlock') return 'expected indexes';
        if (idx.entries.length !== 3) return `expected 3 entries, got ${idx.entries.length}`;
        if (idx.entries[2].components[0].kind !== 'IndexExpressionComponent') return 'expected expression component';
        return null;
      },
    },
    {
      name: 'Composite FK ref: a.(x, y) > b.(x, y)',
      source: `xdbml: 0.1
Ref: m.periods.(merchant_id, country) > merchants.(id, country)`,
      assert: (doc) => {
        const r = doc.statements[0];
        if (r.kind !== 'RefDeclaration') return 'expected ref';
        if (!r.spec.source.compositeFields || r.spec.source.compositeFields.length !== 2) return 'expected composite source';
        if (!r.spec.target.compositeFields || r.spec.target.compositeFields.length !== 2) return 'expected composite target';
        return null;
      },
    },
    {
      name: 'Synonyms / tags / business_term / granularity settings are accepted',
      source: `xdbml: 0.1
Entity customers {
  email varchar [synonyms: ['contact email', 'login'], tags: ['pii', 'gdpr'], business_term: 'Login Email']
  created_at timestamp [granularity: second]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const email = e.body.find((b) => b.kind === 'FieldDeclaration' && b.name === 'email');
        if (!email || email.kind !== 'FieldDeclaration') return 'expected email field';
        const names = new Set(email.settings.map((s) => s.name));
        for (const expected of ['synonyms', 'tags', 'business_term']) {
          if (!names.has(expected)) return `missing setting ${expected}`;
        }
        const synSet = email.settings.find((s) => s.name === 'synonyms')!;
        if (!synSet.value || synSet.value.kind !== 'ListValue') return 'synonyms should be a list';
        if (synSet.value.items.length !== 2) return 'expected 2 synonyms';
        return null;
      },
    },
    {
      name: 'x_ custom property accepted',
      source: `xdbml: 0.1
Entity users {
  email varchar [x_sensitivity: 'pii-low', x_retention_days: 2555]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const f = e.body[0];
        if (f.kind !== 'FieldDeclaration') return 'expected field';
        if (f.settings.length !== 2) return 'expected 2 settings';
        if (f.settings[0].name !== 'x_sensitivity') return 'wrong custom property name';
        return null;
      },
    },
    {
      name: 'BSON scalar types parse correctly',
      source: `xdbml: 0.1
Collection orders {
  _id objectId [pk]
  total Decimal128
  placed_at Date
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration' || e.keyword !== 'Collection') return 'expected Collection';
        for (const f of e.body) {
          if (f.kind !== 'FieldDeclaration') continue;
          if (f.type.kind !== 'ScalarType') return `field ${f.name} should be ScalarType`;
        }
        return null;
      },
    },
    {
      name: 'Partial injection ~name in entity body',
      source: `xdbml: 0.1
TablePartial base {
  id int [pk]
  created_at timestamp
}
Entity users {
  ~base
  name varchar
}`,
      assert: (doc) => {
        const users = doc.statements[1];
        if (users.kind !== 'EntityDeclaration') return 'expected entity';
        const inj = users.body.find((b) => b.kind === 'PartialInjection');
        if (!inj || inj.kind !== 'PartialInjection') return 'expected partial injection';
        if (inj.partialName !== 'base') return 'wrong partial name';
        return null;
      },
    },
    {
      name: 'database_type: legacy DBML setting still accepted',
      source: `Project p { database_type: 'PostgreSQL' }`,
      assert: (doc) => {
        const p = doc.statements[0];
        if (p.kind !== 'ProjectDeclaration') return 'expected project';
        const s = (p.body[0] as { name?: string });
        if (!s || s.name !== 'database_type') return 'expected database_type setting';
        return null;
      },
    },
    {
      name: 'Referential action values: cascade, set null, no action',
      source: `xdbml: 0.1
Ref: a.b > c.d [delete: cascade, update: set null]
Ref: e.f > g.h [delete: no action]`,
      assert: (doc) => {
        const r1 = doc.statements[0];
        if (r1.kind !== 'RefDeclaration') return 'expected ref';
        const del = r1.settings.find((s) => s.name === 'delete')!;
        if (del.value?.kind !== 'IdentifierValue' || del.value.value !== 'cascade') return 'wrong delete value';
        const upd = r1.settings.find((s) => s.name === 'update')!;
        if (upd.value?.kind !== 'IdentifierValue' || upd.value.value !== 'set null') return `wrong update value: ${(upd.value as { value?: string })?.value}`;
        return null;
      },
    },
  ];

  const results: TestResult[] = [];
  for (const c of cases) {
    try {
      const doc = parse(c.source);
      const err = c.assert(doc);
      if (err === null) {
        results.push(ok(c.name));
      } else {
        results.push(fail(c.name, err));
      }
    } catch (e) {
      results.push(fail(c.name, (e as Error).message));
    }
  }
  return results;
}

/* -------------------------------------------------------------------------
 * Report
 * ----------------------------------------------------------------------- */

function report (title: string, results: TestResult[]): { passed: number; failed: number } {
  console.log(`\n${CYAN}== ${title} ==${RESET}`);
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      passed += 1;
      const detail = r.detail ? ` ${DIM}(${r.detail})${RESET}` : '';
      console.log(`  ${GREEN}✓${RESET} ${r.name}${detail}`);
    } else {
      failed += 1;
      console.log(`  ${RED}✗${RESET} ${r.name}`);
      console.log(`      ${YELLOW}${r.error}${RESET}`);
    }
  }
  return {
    passed,
    failed,
  };
}

function main (): void {
  console.log(`${CYAN}@xdbml/parse proof-of-concept test suite${RESET}`);
  console.log(`${DIM}examples directory: ${examplesDir}${RESET}`);
  const inline = runInlineTests();
  const examples = runExampleTests();
  const ir = report('Inline grammar tests', inline);
  const er = report('Official example files (xdbml/xdbml-spec/examples)', examples);
  const totalPassed = ir.passed + er.passed;
  const totalFailed = ir.failed + er.failed;
  console.log(`\n${CYAN}== Summary ==${RESET}`);
  console.log(`  ${GREEN}${totalPassed} passed${RESET}, ${totalFailed > 0 ? RED : DIM}${totalFailed} failed${RESET}`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main();
