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

import { parse, flatten, resolveNames } from '../src/index.ts';
import type { ParseOptions, XDbmlDocument } from '../src/index.ts';
import {
  CONTAINER_KEYWORDS,
  ENTITY_KEYWORDS,
  SETTING_FLAGS,
} from '../src/keywords.ts';

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
  const cases: {
    name: string;
    source: string;
    assert: (doc: XDbmlDocument) => string | null;
    /**
     * If true, the test passes when parse() throws, and fails if parse()
     * succeeds. Used for negative tests where we want to confirm the parser
     * rejects malformed input. The assert function is not called when
     * expectError is true (the throw is the success signal). The function
     * is still required (TS shape consistency); pass a stub that returns
     * a placeholder error message that the user would see only if the
     * parser unexpectedly accepted the input.
     */
    expectError?: boolean;
    /**
     * Optional ParseOptions passed to parse() for this case. Used by P5
     * tests that need a `readFile` resolver to test cross-file imports.
     * Most tests omit this and parse self-contained sources with the
     * default 1-argument form.
     */
    options?: ParseOptions;
  }[] = [
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
        if (t.scalarBase !== undefined) return 'object form should have undefined scalarBase';
        return null;
      },
    },
    {
      name: 'v0.2 scalar Named Type with validation settings',
      source: `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii'], note: 'Standard enterprise email']`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'TypeDeclaration') return `expected Type, got ${t.kind}`;
        if (t.name !== 'Email') return 'wrong name';
        if (!t.scalarBase) return 'expected scalarBase to be set';
        if (t.scalarBase.kind !== 'ScalarType') return `expected ScalarType, got ${t.scalarBase.kind}`;
        if (t.scalarBase.name !== 'varchar') return `expected varchar, got ${t.scalarBase.name}`;
        if (t.body.length !== 0) return 'scalar form should have empty body';
        if (t.settings.length !== 3) return `expected 3 settings, got ${t.settings.length}`;
        const setNames = t.settings.map((s) => s.name);
        if (!setNames.includes('pattern')) return 'expected pattern setting';
        if (!setNames.includes('tags')) return 'expected tags setting';
        if (!setNames.includes('note')) return 'expected note setting';
        return null;
      },
    },
    {
      name: 'v0.2 scalar Named Type with parameterized base (decimal)',
      source: `xdbml: 0.2
Type Percentage decimal(5, 2) [minimum: 0, maximum: 100]`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'TypeDeclaration') return `expected Type, got ${t.kind}`;
        if (t.name !== 'Percentage') return 'wrong name';
        if (!t.scalarBase) return 'expected scalarBase';
        if (t.scalarBase.kind !== 'ScalarType') return `expected ScalarType, got ${t.scalarBase.kind}`;
        if (t.scalarBase.name !== 'decimal') return `expected decimal, got ${t.scalarBase.name}`;
        if (!t.scalarBase.params || t.scalarBase.params.length !== 2) {
          return `expected 2 params, got ${t.scalarBase.params?.length}`;
        }
        if (t.scalarBase.params[0] !== '5' || t.scalarBase.params[1] !== '2') {
          return `expected (5, 2), got (${t.scalarBase.params.join(', ')})`;
        }
        return null;
      },
    },
    {
      name: 'v0.2 scalar Named Type referencing another Type (PII_Email Email)',
      source: `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$']
Type PII_Email Email [tags: ['pii', 'gdpr-subject']]`,
      assert: (doc) => {
        if (doc.statements.length !== 2) return `expected 2 statements, got ${doc.statements.length}`;
        const t1 = doc.statements[0];
        const t2 = doc.statements[1];
        if (t1.kind !== 'TypeDeclaration' || t2.kind !== 'TypeDeclaration') return 'expected 2 Types';
        if (t2.name !== 'PII_Email') return 'wrong second name';
        if (!t2.scalarBase) return 'expected scalarBase on PII_Email';
        // The base `Email` is a reference to a Named Type, which parses as a NamedTypeReference
        // or as a ScalarType depending on parseTypeExpression's behavior. Either is acceptable
        // as long as the name resolves to 'Email'. We check both possibilities.
        const base = t2.scalarBase;
        if (base.kind === 'ScalarType') {
          if (base.name !== 'Email') return `expected base Email, got ${base.name}`;
        } else if (base.kind === 'NamedTypeReference') {
          if (base.name !== 'Email') return `expected base Email, got ${base.name}`;
        } else {
          return `expected ScalarType or NamedTypeReference base, got ${base.kind}`;
        }
        return null;
      },
    },
    {
      name: 'v0.2 scalar Named Type used as a field type in an entity',
      source: `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]

Entity users {
  id int [pk]
  email Email
}
Entity admins {
  id int [pk]
  email Email
}`,
      assert: (doc) => {
        if (doc.statements.length !== 3) return `expected 3 statements, got ${doc.statements.length}`;
        const users = doc.statements[1];
        if (users.kind !== 'EntityDeclaration' || users.name !== 'users') return 'expected users entity';
        const emailField = users.body.find((b) => b.kind === 'FieldDeclaration' && b.name === 'email');
        if (!emailField || emailField.kind !== 'FieldDeclaration') return 'expected email field on users';
        // Email as a field type is either ScalarType or NamedTypeReference (parseTypeExpression's call)
        const baseKind = emailField.type.kind;
        if (baseKind !== 'ScalarType' && baseKind !== 'NamedTypeReference') {
          return `expected ScalarType or NamedTypeReference, got ${baseKind}`;
        }
        if ((emailField.type as { name: string }).name !== 'Email') return 'expected Email type';
        return null;
      },
    },
    {
      name: 'v0.2 object and scalar Named Type forms coexist in one file',
      source: `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$']
Type Address {
  street varchar [not null]
  city varchar [not null]
  zip varchar
}
Type CountryCode varchar [minLength: 2, maxLength: 2]

Entity customers {
  id int [pk]
  email Email
  country CountryCode
  primary_address Address
}`,
      assert: (doc) => {
        if (doc.statements.length !== 4) return `expected 4 statements, got ${doc.statements.length}`;
        const [emailT, addressT, ccT, customers] = doc.statements;
        if (emailT.kind !== 'TypeDeclaration' || !emailT.scalarBase) return 'Email should be scalar';
        if (addressT.kind !== 'TypeDeclaration' || addressT.scalarBase !== undefined) return 'Address should be object form';
        if (addressT.body.length !== 3) return `Address should have 3 fields, got ${addressT.body.length}`;
        if (ccT.kind !== 'TypeDeclaration' || !ccT.scalarBase) return 'CountryCode should be scalar';
        if (customers.kind !== 'EntityDeclaration') return 'expected customers entity';
        return null;
      },
    },
    {
      name: 'v0.2 scalar Named Type with no settings (just the base)',
      source: `xdbml: 0.2
Type CustomerId int`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'TypeDeclaration') return `expected Type, got ${t.kind}`;
        if (t.name !== 'CustomerId') return 'wrong name';
        if (!t.scalarBase) return 'expected scalarBase';
        if (t.scalarBase.kind !== 'ScalarType' || t.scalarBase.name !== 'int') return 'expected int base';
        if (t.settings.length !== 0) return `expected 0 settings, got ${t.settings.length}`;
        if (t.body.length !== 0) return 'body should be empty';
        return null;
      },
    },
    {
      name: 'v0.2 entity-level checks block -- single named check',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  wealth decimal(15,2)
  debt decimal(15,2)
  checks {
    \`debt + wealth >= 0\` [name: 'chk_positive_net_worth']
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const checks = e.body.find((b) => b.kind === 'ChecksBlock');
        if (!checks || checks.kind !== 'ChecksBlock') return 'expected ChecksBlock in entity body';
        if (checks.entries.length !== 1) return `expected 1 check entry, got ${checks.entries.length}`;
        const entry = checks.entries[0];
        if (entry.kind !== 'CheckEntry') return `expected CheckEntry, got ${entry.kind}`;
        if (entry.expression !== 'debt + wealth >= 0') return `expected expression 'debt + wealth >= 0', got '${entry.expression}'`;
        if (entry.settings.length !== 1) return `expected 1 setting, got ${entry.settings.length}`;
        if (entry.settings[0].name !== 'name') return `expected name setting, got ${entry.settings[0].name}`;
        return null;
      },
    },
    {
      name: 'v0.2 entity-level checks block -- multiple checks, mixed settings',
      source: `xdbml: 0.2
Entity reservations {
  id int [pk]
  start_date date
  end_date date
  checks {
    \`start_date <= end_date\` [name: 'chk_valid_date_range']
    \`end_date - start_date <= 30\` [name: 'chk_max_30_days']
    \`start_date >= CURRENT_DATE\`
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const checks = e.body.find((b) => b.kind === 'ChecksBlock');
        if (!checks || checks.kind !== 'ChecksBlock') return 'expected ChecksBlock';
        if (checks.entries.length !== 3) return `expected 3 check entries, got ${checks.entries.length}`;
        const [a, b, c] = checks.entries;
        if (a.expression !== 'start_date <= end_date') return 'wrong first expression';
        if (a.settings.length !== 1 || a.settings[0].name !== 'name') return 'wrong first settings';
        if (b.expression !== 'end_date - start_date <= 30') return 'wrong second expression';
        if (b.settings.length !== 1 || b.settings[0].name !== 'name') return 'wrong second settings';
        if (c.expression !== 'start_date >= CURRENT_DATE') return 'wrong third expression';
        if (c.settings.length !== 0) return `expected unsetting check, got ${c.settings.length} settings`;
        return null;
      },
    },
    {
      name: 'v0.2 entity-level checks block coexists with indexes block',
      source: `xdbml: 0.2
Entity inventory {
  id int [pk]
  sku varchar
  warehouse varchar
  qty int
  indexes {
    (sku, warehouse) [unique]
  }
  checks {
    \`qty >= 0\` [name: 'chk_non_negative_qty']
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const idx = e.body.find((b) => b.kind === 'IndexesBlock');
        const checks = e.body.find((b) => b.kind === 'ChecksBlock');
        if (!idx || idx.kind !== 'IndexesBlock') return 'expected IndexesBlock';
        if (!checks || checks.kind !== 'ChecksBlock') return 'expected ChecksBlock';
        if (idx.entries.length !== 1) return 'expected 1 index entry';
        if (checks.entries.length !== 1) return 'expected 1 check entry';
        return null;
      },
    },
    {
      name: 'v0.2 entity-level checks block with note setting on check',
      source: `xdbml: 0.2
Entity orders {
  id int [pk]
  status varchar
  shipped_at timestamp
  checks {
    \`(status != 'shipped') OR (shipped_at IS NOT NULL)\` [
      name: 'chk_shipped_has_timestamp',
      note: 'A shipped order must record the shipment timestamp.'
    ]
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const checks = e.body.find((b) => b.kind === 'ChecksBlock');
        if (!checks || checks.kind !== 'ChecksBlock') return 'expected ChecksBlock';
        const entry = checks.entries[0];
        if (entry.settings.length !== 2) return `expected 2 settings on check, got ${entry.settings.length}`;
        const names = entry.settings.map((s) => s.name);
        if (!names.includes('name')) return 'expected name setting';
        if (!names.includes('note')) return 'expected note setting';
        return null;
      },
    },
    {
      name: 'v0.2 checks block -- invalid: non-backtick expression rejected',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  wealth decimal(15,2)
  checks {
    wealth >= 0
  }
}`,
      assert: (_doc) => 'parse should have failed',
      expectError: true,
    },
    {
      name: 'v0.2 Ref with inactive flag',
      source: `xdbml: 0.2
Entity posts {
  id int [pk]
  user_id int
}
Entity users {
  id int [pk]
}
Ref: posts.user_id > users.id [inactive]`,
      assert: (doc) => {
        const ref = doc.statements.find((s) => s.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected RefDeclaration';
        if (ref.settings.length !== 1) return `expected 1 setting, got ${ref.settings.length}`;
        const inactive = ref.settings[0];
        if (inactive.name !== 'inactive') return `expected inactive setting, got ${inactive.name}`;
        if (inactive.value !== null) return 'inactive should be a flag (null value)';
        return null;
      },
    },
    {
      name: 'v0.2 Ref with inactive + color + note (multiple settings)',
      source: `xdbml: 0.2
Entity audit_log {
  id int [pk]
  user_id int
}
Entity users {
  id int [pk]
}
Ref: audit_log.user_id > users.id [
  inactive,
  color: '#999999',
  note: 'Historical FK; superseded by audit_ref table'
]`,
      assert: (doc) => {
        const ref = doc.statements.find((s) => s.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected RefDeclaration';
        if (ref.settings.length !== 3) return `expected 3 settings, got ${ref.settings.length}`;
        const names = ref.settings.map((s) => s.name);
        if (!names.includes('inactive')) return 'expected inactive';
        if (!names.includes('color')) return 'expected color';
        if (!names.includes('note')) return 'expected note';
        const inactive = ref.settings.find((s) => s.name === 'inactive');
        if (inactive?.value !== null) return 'inactive should still be a flag even mixed with key:value settings';
        return null;
      },
    },
    {
      name: 'v0.2 TableGroup with color and note settings',
      source: `xdbml: 0.2
Entity orders { id int [pk] }
Entity order_lines { id int [pk] }
Entity invoices { id int [pk] }

TableGroup ecommerce [color: '#3498DB', note: 'Commerce-side entities'] {
  orders
  order_lines
  invoices
}`,
      assert: (doc) => {
        const tg = doc.statements.find((s) => s.kind === 'TableGroupDeclaration');
        if (!tg || tg.kind !== 'TableGroupDeclaration') return 'expected TableGroup';
        if (tg.name !== 'ecommerce') return 'wrong name';
        if (tg.settings.length !== 2) return `expected 2 settings, got ${tg.settings.length}`;
        const names = tg.settings.map((s) => s.name);
        if (!names.includes('color')) return 'expected color';
        if (!names.includes('note')) return 'expected note';
        if (tg.members.length !== 3) return `expected 3 members, got ${tg.members.length}`;
        return null;
      },
    },
    {
      name: 'v0.2 records inside entity -- implicit column list',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
  email varchar
  records {
    1, 'Alice', 'alice@example.com'
    2, 'Bob',   'bob@example.com'
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const recs = e.body.find((b) => b.kind === 'RecordsBlock');
        if (!recs || recs.kind !== 'RecordsBlock') return 'expected RecordsBlock';
        if (recs.rows.length !== 2) return `expected 2 rows, got ${recs.rows.length}`;
        for (const row of recs.rows) {
          if (row.values.length !== 3) return `expected 3 values per row, got ${row.values.length}`;
        }
        if (recs.rows[0].values[0].kind !== 'NumberValue') return 'expected NumberValue at [0][0]';
        if (recs.rows[0].values[1].kind !== 'StringValue') return 'expected StringValue at [0][1]';
        return null;
      },
    },
    {
      name: 'v0.2 top-level records -- explicit column list',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
  email varchar
}
records users (id, name, email) {
  1, 'Alice', 'alice@example.com'
  2, 'Bob',   'bob@example.com'
}`,
      assert: (doc) => {
        if (doc.statements.length !== 2) return `expected 2 statements, got ${doc.statements.length}`;
        const tlr = doc.statements[1];
        if (tlr.kind !== 'TopLevelRecordsDeclaration') return `expected TopLevelRecordsDeclaration, got ${tlr.kind}`;
        if (tlr.entityRef !== 'users') return `wrong entityRef: ${tlr.entityRef}`;
        if (tlr.columns.length !== 3) return `expected 3 columns, got ${tlr.columns.length}`;
        if (tlr.columns[0] !== 'id') return 'wrong first column';
        if (tlr.rows.length !== 2) return `expected 2 rows, got ${tlr.rows.length}`;
        return null;
      },
    },
    {
      name: 'v0.2 top-level records -- cross-container reference',
      source: `xdbml: 0.2
Container core [type: schema] {
  Entity users {
    id int [pk]
    email varchar
  }
}
records core.users (id, email) {
  1, 'a@b.com'
  2, 'c@d.com'
}`,
      assert: (doc) => {
        const tlr = doc.statements.find((s) => s.kind === 'TopLevelRecordsDeclaration');
        if (!tlr || tlr.kind !== 'TopLevelRecordsDeclaration') return 'expected TopLevelRecordsDeclaration';
        if (tlr.entityRef !== 'core.users') return `wrong entityRef: ${tlr.entityRef}`;
        if (tlr.columns.length !== 2) return 'expected 2 columns';
        if (tlr.rows.length !== 2) return 'expected 2 rows';
        return null;
      },
    },
    {
      name: 'v0.2 records -- full value-form coverage',
      source: `xdbml: 0.2
Enum Status { active inactive pending }
Entity events {
  id int [pk]
  occurred_at timestamp
  status Status
  archived boolean
  payload varchar
  records {
    1, '2026-06-10T14:30:00Z', Status.active, true, 'string value'
    2, '2026-06-11T09:00:00Z', Status.pending, false, null
    3, \`gen_random_uuid()\`, Status.inactive, null, '''triple
quoted string'''
  }
}`,
      assert: (doc) => {
        const e = doc.statements.find((s) => s.kind === 'EntityDeclaration');
        if (!e || e.kind !== 'EntityDeclaration') return 'expected entity';
        const recs = e.body.find((b) => b.kind === 'RecordsBlock');
        if (!recs || recs.kind !== 'RecordsBlock') return 'expected RecordsBlock';
        if (recs.rows.length !== 3) return `expected 3 rows, got ${recs.rows.length}`;
        // Row 1: number, string (date), identifier (enum), boolean (true), string
        const r1 = recs.rows[0].values;
        if (r1.length !== 5) return `row 1: expected 5 values, got ${r1.length}`;
        if (r1[0].kind !== 'NumberValue') return `row 1 [0]: expected NumberValue, got ${r1[0].kind}`;
        if (r1[1].kind !== 'StringValue') return `row 1 [1]: expected StringValue (ISO date), got ${r1[1].kind}`;
        if (r1[2].kind !== 'IdentifierValue' || r1[2].value !== 'Status.active') return `row 1 [2]: expected IdentifierValue 'Status.active', got ${r1[2].kind} ${(r1[2] as { value?: string }).value}`;
        if (r1[3].kind !== 'BooleanValue') return `row 1 [3]: expected BooleanValue, got ${r1[3].kind}`;
        if (r1[4].kind !== 'StringValue') return `row 1 [4]: expected StringValue, got ${r1[4].kind}`;
        // Row 2: null appears
        const r2 = recs.rows[1].values;
        if (r2[4].kind !== 'NullValue') return `row 2 [4]: expected NullValue, got ${r2[4].kind}`;
        // Row 3: expression and triple-quoted string
        const r3 = recs.rows[2].values;
        if (r3[1].kind !== 'ExpressionValue') return `row 3 [1]: expected ExpressionValue, got ${r3[1].kind}`;
        if (r3[4].kind !== 'StringValue' || !r3[4].multiline) return `row 3 [4]: expected multiline StringValue, got ${r3[4].kind} multiline=${(r3[4] as { multiline?: boolean }).multiline}`;
        return null;
      },
    },
    {
      name: 'v0.2 records -- trailing comma at end of row delimits properly',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
  records {
    1, 'Alice',
    2, 'Bob'
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const recs = e.body.find((b) => b.kind === 'RecordsBlock');
        if (!recs || recs.kind !== 'RecordsBlock') return 'expected RecordsBlock';
        // Critical: the trailing comma should NOT merge the two rows. We want 2 rows of 2 values each.
        if (recs.rows.length !== 2) return `trailing comma should NOT merge rows; expected 2 rows, got ${recs.rows.length}`;
        if (recs.rows[0].values.length !== 2) return `row 1: expected 2 values, got ${recs.rows[0].values.length}`;
        if (recs.rows[1].values.length !== 2) return `row 2: expected 2 values, got ${recs.rows[1].values.length}`;
        return null;
      },
    },
    {
      name: 'v0.2 records -- negative number value',
      source: `xdbml: 0.2
Entity measurements {
  id int [pk]
  reading decimal(10,2)
  records {
    1, -3.14
    2, 42.5
    3, -0.001
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const recs = e.body.find((b) => b.kind === 'RecordsBlock');
        if (!recs || recs.kind !== 'RecordsBlock') return 'expected RecordsBlock';
        if (recs.rows.length !== 3) return `expected 3 rows, got ${recs.rows.length}`;
        const r1v1 = recs.rows[0].values[1];
        if (r1v1.kind !== 'NumberValue' || r1v1.value !== '-3.14') return `row 1 [1]: expected NumberValue '-3.14', got ${r1v1.kind} ${(r1v1 as { value?: string }).value}`;
        return null;
      },
    },
    {
      name: 'v0.2 top-level records -- missing column list rejected',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
}
records users {
  1, 'Alice'
}`,
      assert: (_doc) => 'parse should have failed (missing column list)',
      expectError: true,
    },
    {
      name: 'v0.2 module-system -- single entity import with clone block',
      source: `xdbml: 0.2
reuse { entity core.dim_customer } from './lib' {
  Entity dim_customer {
    id int [pk]
    email varchar
  }
}`,
      assert: (doc) => {
        const dir = doc.statements[0];
        if (dir.kind !== 'ModuleImportDirective') return `expected ModuleImportDirective, got ${dir.kind}`;
        if (dir.mode !== 'reuse') return `expected reuse, got ${dir.mode}`;
        if (dir.from !== './lib') return `wrong from path: ${dir.from}`;
        if (dir.spec.kind !== 'ImportList') return `expected ImportList, got ${dir.spec.kind}`;
        if (dir.spec.items.length !== 1) return `expected 1 item, got ${dir.spec.items.length}`;
        const item = dir.spec.items[0];
        if (item.elementType !== 'entity') return `expected entity, got ${item.elementType}`;
        if (item.sourcePath !== 'core.dim_customer') return `wrong path: ${item.sourcePath}`;
        if (!dir.clone) return 'expected clone block';
        if (dir.clone.statements.length !== 1) return `expected 1 clone statement, got ${dir.clone.statements.length}`;
        if (dir.clone.statements[0].kind !== 'EntityDeclaration') return `expected EntityDeclaration in clone, got ${dir.clone.statements[0].kind}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- import-all with clone block',
      source: `xdbml: 0.2
reuse * from './lib' {
  Entity foo {
    id int [pk]
  }
  Entity bar {
    id int [pk]
  }
}`,
      assert: (doc) => {
        const dir = doc.statements[0];
        if (dir.kind !== 'ModuleImportDirective') return 'expected ModuleImportDirective';
        if (dir.spec.kind !== 'ImportAll') return `expected ImportAll, got ${dir.spec.kind}`;
        if (!dir.clone) return 'expected clone';
        if (dir.clone.statements.length !== 2) return `expected 2 clone statements, got ${dir.clone.statements.length}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- use (non-transitive) vs reuse',
      source: `xdbml: 0.2
use { type T1 } from './lib1' {
  Type T1 varchar
}
reuse { type T2 } from './lib2' {
  Type T2 varchar
}`,
      assert: (doc) => {
        if (doc.statements.length !== 2) return `expected 2 directives, got ${doc.statements.length}`;
        const d1 = doc.statements[0];
        const d2 = doc.statements[1];
        if (d1.kind !== 'ModuleImportDirective' || d1.mode !== 'use') return `first should be use, got ${(d1 as { mode?: string }).mode}`;
        if (d2.kind !== 'ModuleImportDirective' || d2.mode !== 'reuse') return `second should be reuse, got ${(d2 as { mode?: string }).mode}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- cloned_at metadata setting',
      source: `xdbml: 0.2
reuse { entity X } from './lib' [cloned_at: '2026-06-10T08:00:00Z'] {
  Entity X {
    id int [pk]
  }
}`,
      assert: (doc) => {
        const dir = doc.statements[0];
        if (dir.kind !== 'ModuleImportDirective') return 'expected ModuleImportDirective';
        if (dir.settings.length !== 1) return `expected 1 setting, got ${dir.settings.length}`;
        const s = dir.settings[0];
        if (s.name !== 'cloned_at') return `expected cloned_at, got ${s.name}`;
        if (!s.value || s.value.kind !== 'StringValue') return 'expected StringValue';
        if (s.value.value !== '2026-06-10T08:00:00Z') return `wrong timestamp: ${s.value.value}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- multi-item selective import',
      source: `xdbml: 0.2
reuse { entity X, entity Y, type T } from './lib' {
  Entity X { id int [pk] }
  Entity Y { id int [pk] }
  Type T varchar
}`,
      assert: (doc) => {
        const dir = doc.statements[0];
        if (dir.kind !== 'ModuleImportDirective') return 'expected ModuleImportDirective';
        if (dir.spec.kind !== 'ImportList') return 'expected ImportList';
        if (dir.spec.items.length !== 3) return `expected 3 items, got ${dir.spec.items.length}`;
        const kinds = dir.spec.items.map((i) => i.elementType);
        if (kinds[0] !== 'entity' || kinds[1] !== 'entity' || kinds[2] !== 'type') return `wrong element types: ${kinds.join(', ')}`;
        if (!dir.clone) return 'expected clone';
        if (dir.clone.statements.length !== 3) return `expected 3 clone statements, got ${dir.clone.statements.length}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- import with as alias',
      source: `xdbml: 0.2
reuse { type Email as PII_Email } from './lib' {
  Type PII_Email varchar [pattern: '.*@.*']
}`,
      assert: (doc) => {
        const dir = doc.statements[0];
        if (dir.kind !== 'ModuleImportDirective') return 'expected ModuleImportDirective';
        if (dir.spec.kind !== 'ImportList') return 'expected ImportList';
        const item = dir.spec.items[0];
        if (item.elementType !== 'type') return `wrong elementType: ${item.elementType}`;
        if (item.sourcePath !== 'Email') return `wrong sourcePath: ${item.sourcePath}`;
        if (item.alias !== 'PII_Email') return `wrong alias: ${item.alias}`;
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- directive inside Container body',
      source: `xdbml: 0.2
Container sales [type: schema] {
  Entity fact_sales {
    id int [pk]
  }
  reuse { entity core.dim_customer } from './lib' {
    Entity dim_customer {
      id int [pk]
    }
  }
}`,
      assert: (doc) => {
        const c = doc.statements[0];
        if (c.kind !== 'ContainerDeclaration') return 'expected Container';
        if (c.body.length !== 2) return `expected 2 body items, got ${c.body.length}`;
        const dir = c.body[1];
        if (dir.kind !== 'ModuleImportDirective') return `expected ModuleImportDirective in body[1], got ${dir.kind}`;
        if (!dir.clone) return 'expected clone';
        if (dir.clone.statements.length !== 1) return 'expected 1 clone statement';
        return null;
      },
    },
    {
      name: 'v0.2 module-system -- reference-only directive (no clone, no readFile) rejected',
      source: `xdbml: 0.2
reuse { entity X } from './lib'`,
      assert: (_doc) => 'parse should have failed (reference-only directive)',
      expectError: true,
    },
    {
      name: 'v0.2 module-system -- INVALID: field imports rejected in P4',
      source: `xdbml: 0.2
reuse { field core.dim_customer.email } from './lib'`,
      assert: (_doc) => 'parse should have failed (field imports not yet supported)',
      expectError: true,
    },
    {
      name: 'v0.2 module-system -- INVALID: unknown element type rejected',
      source: `xdbml: 0.2
reuse { project foo } from './lib' {}`,
      assert: (_doc) => 'parse should have failed (project not importable)',
      expectError: true,
    },
    {
      name: 'v0.2 module-system -- flatten() helper removes module directives',
      source: `xdbml: 0.2
Container sales [type: schema] {
  Entity local_fact {
    id int [pk]
  }
  reuse { entity X } from './lib' {
    Entity dim_X {
      id int [pk]
    }
  }
}
reuse * from './lib2' {
  Type TopLevelType varchar
  Enum Status { active inactive }
}`,
      assert: (doc) => {
        // Apply the flatten helper and check the result.
        const flat = flatten(doc);
        // Top-level: Container, Type, Enum (no more ModuleImportDirective at top level).
        if (flat.statements.length !== 3) return `flat top-level: expected 3, got ${flat.statements.length}`;
        const kinds = flat.statements.map((s) => s.kind).join(',');
        if (kinds !== 'ContainerDeclaration,TypeDeclaration,EnumDeclaration') return `wrong flat kinds: ${kinds}`;
        const c = flat.statements[0];
        if (c.kind !== 'ContainerDeclaration') return 'first should be Container';
        // Container body: local_fact and dim_X (no more ModuleImportDirective inside Container).
        if (c.body.length !== 2) return `flat container body: expected 2, got ${c.body.length}`;
        if (c.body[0].kind !== 'EntityDeclaration' || c.body[1].kind !== 'EntityDeclaration') return 'expected both to be entities';
        return null;
      },
    },
    /* -------------------------------------------------------------------
     * P5: cross-file module resolution
     * -----------------------------------------------------------------
     * These tests use in-memory file maps so they're hermetic (no real
     * file I/O). The `readFile` callback is constructed per test and
     * supplied via the new `options` field on the case object.
     * ----------------------------------------------------------------- */
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
Type CountryCode varchar [minLength: 2, maxLength: 2]
Container core [type: schema] {
  Entity dim_customer {
    id int [pk]
    email Email
    country CountryCode
  }
}`,
      };
      return {
        name: 'P5: reference-only directive resolves via readFile (basic case)',
        source: `xdbml: 0.2
reuse { type Email, type CountryCode } from './lib'
reuse { entity core.dim_customer } from './lib'`,
        options: {
          filePath: '/test/consumer.xdbml',
          readFile: (p: string) => {
            if (!(p in files)) throw new Error(`not found: ${p}`);
            return files[p];
          },
        },
        assert: (doc) => {
          if (doc.statements.length !== 2) return `expected 2 statements, got ${doc.statements.length}`;
          const [d1, d2] = doc.statements;
          if (d1.kind !== 'ModuleImportDirective' || !d1.clone) return 'd1 should have clone';
          if (d1.clone.statements.length !== 2) return `d1 clone: expected 2, got ${d1.clone.statements.length}`;
          const t1 = d1.clone.statements[0];
          const t2 = d1.clone.statements[1];
          if (t1.kind !== 'TypeDeclaration' || t1.name !== 'Email') return `expected TypeDeclaration Email, got ${t1.kind} ${(t1 as { name?: string }).name}`;
          if (t2.kind !== 'TypeDeclaration' || t2.name !== 'CountryCode') return 'expected TypeDeclaration CountryCode';
          if (d2.kind !== 'ModuleImportDirective' || !d2.clone) return 'd2 should have clone';
          const e = d2.clone.statements[0];
          if (e.kind !== 'EntityDeclaration' || e.name !== 'dim_customer') return `expected EntityDeclaration dim_customer, got ${e.kind}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$']
Type CountryCode varchar
Entity foo { id int [pk] }`,
      };
      return {
        name: 'P5: ImportAll resolves all top-level non-Project declarations',
        source: `xdbml: 0.2
reuse * from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected ModuleImportDirective with clone';
          if (dir.clone.statements.length !== 3) return `expected 3 clone statements, got ${dir.clone.statements.length}`;
          const kinds = dir.clone.statements.map((s) => s.kind);
          if (kinds.filter((k) => k === 'TypeDeclaration').length !== 2) return `expected 2 Types, got: ${kinds.join(',')}`;
          if (kinds.filter((k) => k === 'EntityDeclaration').length !== 1) return `expected 1 Entity, got: ${kinds.join(',')}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Project lib_project {
  database_type: 'PostgreSQL'
}
Entity X { id int [pk] }`,
      };
      return {
        name: 'P5: ImportAll skips ProjectDeclaration (spec §26.4)',
        source: `xdbml: 0.2
reuse * from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 1) return `expected 1 (Project skipped), got ${dir.clone.statements.length}`;
          if (dir.clone.statements[0].kind !== 'EntityDeclaration') return 'expected EntityDeclaration';
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$']`,
      };
      return {
        name: 'P5: alias renames extracted declaration',
        source: `xdbml: 0.2
reuse { type Email as PII_Email } from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          const t = dir.clone.statements[0];
          if (t.kind !== 'TypeDeclaration') return 'expected TypeDeclaration';
          if (t.name !== 'PII_Email') return `expected name PII_Email after alias, got ${t.name}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Container core [type: schema] {
  Entity dim_customer { id int [pk] }
  Entity dim_product { id int [pk] }
}`,
      };
      return {
        name: 'P5: cross-container reference (container.entity dotted path)',
        source: `xdbml: 0.2
reuse { entity core.dim_customer, entity core.dim_product } from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 2) return `expected 2, got ${dir.clone.statements.length}`;
          const names = dir.clone.statements.map((s) => (s as { name?: string }).name);
          if (!names.includes('dim_customer') || !names.includes('dim_product')) return `wrong names: ${names.join(', ')}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/cycle-a.xdbml': `xdbml: 0.2
reuse { entity X } from './cycle-b'
Entity A_local { id int [pk] }`,
        '/test/cycle-b.xdbml': `xdbml: 0.2
reuse { entity A_local } from './cycle-a'
Entity X { id int [pk] }`,
      };
      return {
        name: 'P5: circular imports do not crash (spec §26.15)',
        source: files['/test/cycle-a.xdbml'],
        options: {
          filePath: '/test/cycle-a.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          // cycle-a's reuse should resolve (cycle-b is not yet in the stack
          // when cycle-a is parsed at the top level).
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective') return 'expected directive';
          if (!dir.clone) return 'cycle-a directive should have resolved (cycle-b is reached for the first time here)';
          if (dir.clone.statements.length !== 1) return `expected 1 X, got ${dir.clone.statements.length}`;
          if (dir.clone.statements[0].kind !== 'EntityDeclaration') return 'expected EntityDeclaration X';
          // cycle-a also has its own local entity.
          const local = doc.statements[1];
          if (local.kind !== 'EntityDeclaration' || local.name !== 'A_local') return 'expected A_local';
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Entity X { id int [pk] }`,
      };
      return {
        name: 'P5: missing file throws clear error',
        source: `xdbml: 0.2
reuse { entity X } from './nonexistent'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => {
            if (!(p in files)) throw new Error(`file not found: ${p}`);
            return files[p];
          },
        },
        assert: (_doc) => 'parse should have thrown for missing referenced file',
        expectError: true,
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Entity X { id int [pk
}`, // intentionally malformed (missing closing brace + bracket)
      };
      return {
        name: 'P5: parse error in referenced file surfaces with file context',
        source: `xdbml: 0.2
reuse { entity X } from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (_doc) => 'parse should have thrown for malformed referenced file',
        expectError: true,
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type Email varchar`,
      };
      return {
        name: 'P5: path with .xdbml extension already attached works',
        source: `xdbml: 0.2
reuse { type Email } from './lib.xdbml'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 1) return 'expected 1';
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/sub/lib.xdbml': `xdbml: 0.2
Type Email varchar`,
      };
      return {
        name: 'P5: parent directory paths (../) resolve correctly',
        source: `xdbml: 0.2
reuse { type Email } from '../sub/lib'`,
        options: {
          filePath: '/test/other/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 1) return 'expected 1 (path: ../sub/lib must resolve to /test/sub/lib.xdbml)';
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type A varchar`,
      };
      return {
        name: 'P5: depth limit triggers when maxDepth exceeded',
        source: `xdbml: 0.2
reuse { type A } from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          maxDepth: 0, // any resolution attempt is one level deep
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (_doc) => 'parse should have thrown for depth limit',
        expectError: true,
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Entity X { id int [pk] }`,
      };
      return {
        name: 'P5: mixed -- some directives have inline clone, others reference-only',
        source: `xdbml: 0.2
reuse { entity X } from './lib'
reuse { entity Y } from './other' {
  Entity Y { id int [pk] }
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          if (doc.statements.length !== 2) return 'expected 2 directives';
          const d1 = doc.statements[0];
          const d2 = doc.statements[1];
          if (d1.kind !== 'ModuleImportDirective' || !d1.clone) return 'd1 should have clone (resolved from file)';
          if (d2.kind !== 'ModuleImportDirective' || !d2.clone) return 'd2 should have clone (inline)';
          // Both reach their targets; d2 didn't need readFile since its clone is inline.
          if ((d1.clone.statements[0] as { name?: string }).name !== 'X') return 'd1 should clone X';
          if ((d2.clone.statements[0] as { name?: string }).name !== 'Y') return 'd2 should clone Y';
          return null;
        },
      };
    })(),
    /* -------------------------------------------------------------------
     * v0.3: remote (URL) module sources  (spec §26.14)
     * -----------------------------------------------------------------
     * Hermetic: the in-memory file map is keyed by the resolved key the
     * parser produces (a normalized https href), so no network is touched.
     * ----------------------------------------------------------------- */
    (() => {
      const CORE = 'https://raw.githubusercontent.com/acme/schemas/v1.4.0/core.xdbml';
      const files: Record<string, string> = {
        [CORE]: `xdbml: 0.2
Type Email varchar [pattern: '^[^@]+@[^@]+$']
Entity Customer {
  id int [pk]
  email Email
}`,
      };
      return {
        name: 'v0.3 remote: https source resolves via readFile (URL key)',
        source: `xdbml: 0.2
reuse { type Email, entity Customer } from '${CORE}'`,
        options: {
          filePath: '/local/consumer.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected resolved directive with clone';
          const names = dir.clone.statements.map((s) => (s as { name?: string }).name).join(',');
          if (names !== 'Email,Customer') return `expected Email,Customer got ${names}`;
          return null;
        },
      };
    })(),
    (() => {
      const BASE = 'https://raw.githubusercontent.com/acme/schemas/v1.4.0/';
      const CORE = `${BASE}core.xdbml`;
      const ENUMS = `${BASE}enums.xdbml`;
      const files: Record<string, string> = {
        [CORE]: `xdbml: 0.2
reuse { type Email } from './enums'
Entity Customer {
  id int [pk]
  email Email
}`,
        [ENUMS]: `xdbml: 0.2
Type Email varchar`,
      };
      return {
        name: 'v0.3 remote: relative ref inside a remote module resolves against its URL base',
        source: `xdbml: 0.2
use * from '${CORE}'`,
        options: {
          filePath: '/local/entry.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          // CORE's own './enums' must have resolved against the CORE URL base.
          // flatten() collapses the nested directive; Email should appear.
          const flat = flatten(doc);
          const hasEmail = flat.statements.some(
            (s) => s.kind === 'TypeDeclaration' && (s as { name?: string }).name === 'Email',
          );
          if (!hasEmail) return 'expected Email Type to resolve via the remote base URL';
          const hasCustomer = flat.statements.some(
            (s) => s.kind === 'EntityDeclaration' && (s as { name?: string }).name === 'Customer',
          );
          if (!hasCustomer) return 'expected Customer entity from CORE';
          return null;
        },
      };
    })(),
    (() => {
      const AZ = 'https://dev.azure.com/org/proj/_apis/git/repositories/r/items?path=/core.xdbml&api-version=7.1';
      const files: Record<string, string> = {
        // Keyed by the exact normalized href; if the parser wrongly appended
        // '.xdbml' to the URL, this lookup would miss and the test would fail.
        [new URL(AZ).href]: `xdbml: 0.2
Type Money decimal`,
      };
      return {
        name: 'v0.3 remote: no .xdbml appended to a URL source (query string preserved)',
        source: `xdbml: 0.2
reuse { type Money } from '${AZ}'`,
        options: {
          filePath: '/local/entry.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found (key=${p})`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected resolved directive';
          if ((dir.clone.statements[0] as { name?: string }).name !== 'Money') return 'expected Money type';
          return null;
        },
      };
    })(),
    {
      name: 'v0.3 remote: INVALID -- http:// scheme rejected',
      source: `xdbml: 0.2\nuse * from 'http://example.com/core.xdbml'`,
      options: { filePath: '/local/e.xdbml', readFile: () => 'xdbml: 0.2\nType T varchar' },
      assert: (_doc) => 'parse should have rejected http:// source',
      expectError: true,
    },
    {
      name: 'v0.3 remote: INVALID -- file:// scheme rejected',
      source: `xdbml: 0.2\nuse * from 'file:///etc/core.xdbml'`,
      options: { filePath: '/local/e.xdbml', readFile: () => 'xdbml: 0.2\nType T varchar' },
      assert: (_doc) => 'parse should have rejected file:// source',
      expectError: true,
    },
    {
      name: 'v0.3 remote: INVALID -- protocol-relative source rejected',
      source: `xdbml: 0.2\nuse * from '//example.com/core.xdbml'`,
      options: { filePath: '/local/e.xdbml', readFile: () => 'xdbml: 0.2\nType T varchar' },
      assert: (_doc) => 'parse should have rejected protocol-relative source',
      expectError: true,
    },
    {
      name: 'v0.3 remote: INVALID -- embedded credentials rejected',
      source: `xdbml: 0.2\nuse * from 'https://user:token@example.com/core.xdbml'`,
      options: { filePath: '/local/e.xdbml', readFile: () => 'xdbml: 0.2\nType T varchar' },
      assert: (_doc) => 'parse should have rejected URL with userinfo',
      expectError: true,
    },
    {
      name: 'v0.3 remote: INVALID -- bare host (no scheme) rejected',
      source: `xdbml: 0.2\nuse * from 'github.com/acme/schemas/core.xdbml'`,
      options: { filePath: '/local/e.xdbml', readFile: () => 'xdbml: 0.2\nType T varchar' },
      assert: (_doc) => 'parse should have rejected bare host source',
      expectError: true,
    },
    (() => {
      const A = 'https://h.example/acme/a.xdbml';
      const B = 'https://h.example/acme/b.xdbml';
      const files: Record<string, string> = {
        [A]: `xdbml: 0.2
reuse { entity Y } from '${B}'
Entity X { id int [pk] }`,
        [B]: `xdbml: 0.2
reuse { entity X } from '${A}'
Entity Y { id int [pk] }`,
      };
      return {
        name: 'v0.3 remote: import cycle across URLs is handled (no throw)',
        source: `xdbml: 0.2
reuse { entity X } from '${A}'`,
        options: {
          filePath: '/local/entry.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected entry directive resolved';
          const x = dir.clone.statements.find((s) => (s as { name?: string }).name === 'X');
          if (!x) return 'expected entity X in the resolved clone';
          return null;
        },
      };
    })(),
    /* -------------------------------------------------------------------
     * P6: Name resolution
     * -----------------------------------------------------------------
     * These tests exercise the `resolveNames(doc)` pass. Each test
     * parses a small source, runs resolveNames, and asserts on the
     * resulting diagnostics list and symbol table.
     * ----------------------------------------------------------------- */
    {
      name: 'P6: clean schema produces no diagnostics',
      source: `xdbml: 0.2
Type Email varchar [pattern: '.*@.*']
Entity users {
  id int [pk]
  email Email
}
Entity posts {
  id int [pk]
  user_id int
}
Ref: posts.user_id > users.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics, got ${r.diagnostics.length}: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        if (r.symbols.size !== 3) return `expected 3 symbols, got ${r.symbols.size}`;
        if (!r.symbols.lookup('Email')) return 'expected Email in symbol table';
        if (!r.symbols.lookup('users')) return 'expected users in symbol table';
        if (!r.symbols.lookup('posts')) return 'expected posts in symbol table';
        return null;
      },
    },
    {
      name: 'P6: unresolved named type produces unresolved-type diagnostic',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  email NoSuchType
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 1) return `expected 1 diagnostic, got ${r.diagnostics.length}`;
        const d = r.diagnostics[0];
        if (d.code !== 'unresolved-type') return `wrong code: ${d.code}`;
        if (!d.message.includes('NoSuchType')) return `message should mention NoSuchType`;
        return null;
      },
    },
    {
      name: 'P6: built-in scalar/BSON types do not produce diagnostics',
      source: `xdbml: 0.2
Entity assorted {
  i int
  j integer
  k bigint
  s varchar
  d decimal(10,2)
  ts timestamp
  u uuid
  oid objectId
  b boolean
  j2 jsonb
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics (all builtins), got ${r.diagnostics.length}: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    {
      name: 'P6: unresolved FK entity produces unresolved-entity diagnostic',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
}
Ref: nonexistent.id > users.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 1) return `expected 1 diagnostic, got ${r.diagnostics.length}`;
        const d = r.diagnostics[0];
        if (d.code !== 'unresolved-entity') return `wrong code: ${d.code}`;
        if (!d.message.includes('nonexistent')) return `should mention nonexistent`;
        return null;
      },
    },
    {
      name: 'P6: unresolved FK field produces unresolved-field diagnostic',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
}
Entity posts {
  id int [pk]
  user_id int
}
Ref: posts.no_such_field > users.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const codes = r.diagnostics.map((d) => d.code);
        if (!codes.includes('unresolved-field')) return `expected unresolved-field diagnostic, got codes: ${codes.join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6: duplicate declaration produces diagnostic',
      source: `xdbml: 0.2
Entity users { id int [pk] }
Entity users { id int [pk] }`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const dupes = r.diagnostics.filter((d) => d.code === 'duplicate-declaration');
        if (dupes.length !== 1) return `expected 1 duplicate-declaration diagnostic, got ${dupes.length}`;
        // Symbol table still has the FIRST declaration (later one dropped).
        if (r.symbols.size !== 1) return `expected 1 symbol after dedup, got ${r.symbols.size}`;
        return null;
      },
    },
    {
      name: 'P6: unresolved TableGroup member produces diagnostic',
      source: `xdbml: 0.2
Entity foo { id int [pk] }
TableGroup mygroup {
  foo
  nonexistent_table
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 1) return `expected 1 diagnostic, got ${r.diagnostics.length}`;
        const d = r.diagnostics[0];
        if (d.code !== 'unresolved-tablegroup-member') return `wrong code: ${d.code}`;
        return null;
      },
    },
    {
      name: 'P6: TablePartial injection resolution',
      source: `xdbml: 0.2
TablePartial timestamps {
  created_at timestamp
  updated_at timestamp
}
Entity users {
  id int [pk]
  ~timestamps
}
Entity bad {
  id int [pk]
  ~missing_partial
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const partials = r.diagnostics.filter((d) => d.code === 'unresolved-partial');
        if (partials.length !== 1) return `expected 1 unresolved-partial diagnostic, got ${partials.length}: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        if (!partials[0].message.includes('missing_partial')) return 'should mention missing_partial';
        return null;
      },
    },
    {
      name: 'P6: forward reference (Type declared after use)',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  email Email
}
Type Email varchar [pattern: '.*@.*']`,
      assert: (doc) => {
        // Two-pass resolution should resolve forward references cleanly.
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `forward ref should resolve cleanly, got ${r.diagnostics.length} diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6: cross-container FK reference resolves',
      source: `xdbml: 0.2
Container core [type: schema] {
  Entity users {
    id int [pk]
  }
}
Container app [type: schema] {
  Entity posts {
    id int [pk]
    user_id int
  }
}
Ref: app.posts.user_id > core.users.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `cross-container FK should resolve cleanly, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6: nested-field FK (array wildcard in path) resolves to entity',
      source: `xdbml: 0.2
Entity orders {
  id int [pk]
  line_items array [
    object {
      sku varchar
      qty int
    }
  ]
}
Entity products {
  sku varchar [pk]
}
Ref: orders.line_items.[*].sku > products.sku`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `nested-field FK should resolve, got: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    /* -------------------------------------------------------------------
     * P6-nested: deep nested-field FK validation
     *
     * The walker now follows path segments INTO field type expressions,
     * dereferencing Named Types and stepping through arrays/sets/maps/
     * tuples/objects. These tests exercise both happy paths and the
     * structural-failure modes (typos, missing [*], etc.).
     * ----------------------------------------------------------------- */
    {
      name: 'P6-nested: typo in nested field name emits unresolved-field',
      source: `xdbml: 0.2
Entity orders {
  id int [pk]
  line_items array [
    object {
      sku varchar
      qty int
    }
  ]
}
Entity products { sku varchar [pk] }
Ref: orders.line_items.[*].skuu > products.sku`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const fieldDiags = r.diagnostics.filter((d) => d.code === 'unresolved-field');
        if (fieldDiags.length !== 1) return `expected 1 unresolved-field, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        if (!fieldDiags[0].message.includes('skuu')) return `should mention skuu, got: ${fieldDiags[0].message}`;
        return null;
      },
    },
    {
      name: 'P6-nested: navigating into array without [*] is invalid',
      source: `xdbml: 0.2
Entity orders {
  id int [pk]
  items array [
    object {
      sku varchar
    }
  ]
}
Entity products { sku varchar [pk] }
Ref: orders.items.sku > products.sku`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const structDiags = r.diagnostics.filter((d) => d.code === 'invalid-nested-path');
        if (structDiags.length !== 1) return `expected 1 invalid-nested-path, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6-nested: navigating through object-form Named Type works',
      source: `xdbml: 0.2
Type Address {
  street varchar
  city varchar
}
Entity orders {
  id int [pk]
  ship Address
}
Entity zips { code varchar [pk] }
Ref: orders.ship.street > zips.code`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `should resolve through Named Type, got: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    {
      name: 'P6-nested: navigating past scalar Named Type is invalid',
      source: `xdbml: 0.2
Type Email varchar [pattern: '.*@.*']
Entity users {
  id int [pk]
  email Email
}
Entity foo { x varchar [pk] }
Ref: users.email.something > foo.x`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const structDiags = r.diagnostics.filter((d) => d.code === 'invalid-nested-path');
        if (structDiags.length !== 1) return `expected 1 invalid-nested-path, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6-nested: map key access through map[varchar, object] navigates value type',
      source: `xdbml: 0.2
Entity user_settings {
  id int [pk]
  prefs map [
    varchar,
    object {
      enabled boolean
      weight int
    }
  ]
}
Entity flags { value boolean [pk] }
Ref: user_settings.prefs.['theme'].enabled > flags.value`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `map key access should resolve, got: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    {
      name: 'P6-nested: composite endpoint at nested level validates both fields',
      source: `xdbml: 0.2
Entity orders {
  id int [pk]
  line_items array [
    object {
      sku varchar
      qty int
      price decimal(10,2)
    }
  ]
}
Entity products {
  sku varchar [pk]
  price_band int [pk]
}
Ref: orders.line_items.[*].(sku, qty) > products.(sku, price_band)`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `nested composite should resolve, got: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    {
      name: 'P6-nested: cycle in Named Types hits depth limit and bails silently',
      source: `xdbml: 0.2
Type A B
Type B A
Entity foo {
  id int [pk]
  a A
}
Entity bar { x int [pk] }
Ref: foo.a.something > bar.x`,
      assert: (doc) => {
        // The walker should hit MAX_TYPE_WALK_DEPTH and bail without
        // emitting a noisy diagnostic chain. The field-type resolver
        // (which runs separately) handles the actual "Type A references
        // Type B" name resolution; we just need to make sure the FK
        // walker doesn't crash or emit spam.
        const r = resolveNames(doc);
        // It's OK if there's an unresolved-type from the field-type pass.
        // What we DON'T want is many duplicated invalid-nested-path errors.
        const nestedSpam = r.diagnostics.filter((d) => d.code === 'invalid-nested-path');
        if (nestedSpam.length > 1) return `cycle should not spam invalid-nested-path; got ${nestedSpam.length}`;
        return null;
      },
    },
    {
      name: 'P6: top-level records entity must exist',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
}
records nonexistent (id, name) {
  1, 'Alice'
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const recs = r.diagnostics.filter((d) => d.code === 'unresolved-records-entity');
        if (recs.length !== 1) return `expected unresolved-records-entity, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6: top-level records column must be a field of the entity',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  name varchar
}
records users (id, name, no_such_column) {
  1, 'Alice', 'x'
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const cols = r.diagnostics.filter((d) => d.code === 'unresolved-records-column');
        if (cols.length !== 1) return `expected unresolved-records-column, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P6: SymbolTable lookup APIs return correct entries',
      source: `xdbml: 0.2
Container core [type: schema] {
  Entity dim_customer { id int [pk] }
  Entity dim_product { id int [pk] }
}
Entity standalone { id int [pk] }`,
      assert: (doc) => {
        const r = resolveNames(doc);
        // Qualified lookup
        const dc = r.symbols.lookup('core.dim_customer');
        if (!dc || dc.kind !== 'entity') return 'expected core.dim_customer entity';
        if (dc.containerName !== 'core') return `wrong containerName: ${dc.containerName}`;
        // Bare lookup (unambiguous)
        const sa = r.symbols.lookupBare('standalone');
        if (!sa) return 'expected standalone bare lookup';
        // Bare lookup (unique even though in container)
        const dp = r.symbols.lookupBare('dim_product');
        if (!dp) return 'expected dim_product bare lookup (unique across containers)';
        return null;
      },
    },
    {
      name: 'P6: cloned entities (via module system) appear in symbol table',
      source: `xdbml: 0.2
reuse { entity core.dim_customer } from './lib' {
  Entity dim_customer {
    id int [pk]
    email varchar
  }
}
Entity local_fact {
  id int [pk]
  customer_id int
}
Ref: local_fact.customer_id > dim_customer.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        // The cloned dim_customer should be in the symbol table (flatten merges it).
        const dc = r.symbols.lookupBare('dim_customer');
        if (!dc) return 'expected cloned dim_customer in symbol table';
        // The FK to dim_customer.id should resolve (no diagnostics).
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics, got: ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        return null;
      },
    },
    {
      name: 'P6: inline ref setting on field resolves',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
}
Entity posts {
  id int [pk]
  user_id int [ref: > users.id]
  bad_id int [ref: > nonexistent.id]
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        // Should produce exactly 1 diagnostic: the unresolved nonexistent.
        if (r.diagnostics.length !== 1) return `expected 1, got ${r.diagnostics.length}: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        if (r.diagnostics[0].code !== 'unresolved-entity') return `wrong code: ${r.diagnostics[0].code}`;
        if (!r.diagnostics[0].message.includes('nonexistent')) return 'should mention nonexistent';
        return null;
      },
    },
    {
      name: 'P7 field-imports: clone-block scalar field lifts to a Named Type',
      source: `xdbml: 0.2
reuse { field core.dim_customer.email } from './lib' {
  email varchar [pattern: '^[^@]+@[^@]+$']
}

Entity users {
  id int [pk]
  user_email email
}`,
      assert: (doc) => {
        const flat = flatten(doc);
        const td = flat.statements.find((s) => s.kind === 'TypeDeclaration' && s.name === 'email');
        if (!td || td.kind !== 'TypeDeclaration') return 'expected synthesized Type email';
        if (!td.scalarBase) return 'expected scalarBase';
        if (td.scalarBase.kind !== 'ScalarType' || td.scalarBase.name !== 'varchar') return 'wrong scalarBase';
        if (td.settings.length !== 1 || td.settings[0].name !== 'pattern') return 'pattern setting should carry over';
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics, got: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P7 field-imports: clone-block alias renames the synthesized Type',
      source: `xdbml: 0.2
reuse { field core.dim_customer.email as PIIEmail } from './lib' {
  PIIEmail varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
}

Entity users {
  id int [pk]
  user_email PIIEmail
}`,
      assert: (doc) => {
        const flat = flatten(doc);
        const td = flat.statements.find((s) => s.kind === 'TypeDeclaration');
        if (!td || td.kind !== 'TypeDeclaration') return 'expected a Type';
        if (td.name !== 'PIIEmail') return `expected PIIEmail, got ${td.name}`;
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P7 field-imports: clone-block object-form field lifts to object Named Type',
      source: `xdbml: 0.2
reuse { field core.dim_customer.address } from './lib' {
  address object {
    street varchar
    city varchar
  }
}

Entity orders {
  id int [pk]
  ship address
}

Entity cities { name varchar [pk] }
Ref: orders.ship.city > cities.name`,
      assert: (doc) => {
        const flat = flatten(doc);
        const td = flat.statements.find((s) => s.kind === 'TypeDeclaration' && s.name === 'address');
        if (!td || td.kind !== 'TypeDeclaration') return 'expected Type address';
        if (td.scalarBase) return 'object-form Type should have undefined scalarBase';
        if (td.body.length !== 2) return `expected 2 body fields, got ${td.body.length}`;
        const r = resolveNames(doc);
        // The Ref through orders.ship.city should resolve cleanly.
        if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P7 field-imports: mixed directive (field + type in one import)',
      source: `xdbml: 0.2
reuse { type Color, field core.cat.weight_grams } from './lib' {
  Type Color varchar
  weight_grams int
}

Entity products {
  id int [pk]
  primary_color Color
  weight weight_grams
}`,
      assert: (doc) => {
        const flat = flatten(doc);
        const types = flat.statements.filter((s) => s.kind === 'TypeDeclaration');
        if (types.length !== 2) return `expected 2 Types after flatten, got ${types.length}`;
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'P7 field-imports: file-scope only -- rejected inside Container body',
      source: `xdbml: 0.2
Container app {
  reuse { field core.X.email } from './lib' {
    email varchar
  }
}`,
      expectError: true,
    },
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Container core {
  Entity dim_customer {
    id int [pk]
    email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
    country varchar
  }
}`,
      };
      return {
        name: 'P7 field-imports: reference-only resolves via readFile (basic)',
        source: `xdbml: 0.2
reuse { field core.dim_customer.email } from './lib'

Entity users {
  id int [pk]
  user_email email
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 1) return `expected 1 clone statement, got ${dir.clone.statements.length}`;
          const fd = dir.clone.statements[0];
          if (fd.kind !== 'FieldDeclaration') return `expected FieldDeclaration in clone, got ${fd.kind}`;
          if (fd.name !== 'email') return `expected name 'email', got '${fd.name}'`;
          // Pattern setting should have been carried over from the source field.
          if (!fd.settings.some((s) => s.name === 'pattern')) return 'expected pattern setting on cloned field';
          // After flatten + resolve, no diagnostics.
          const r = resolveNames(doc);
          if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Container core {
  Entity dim_customer {
    id int [pk]
    email varchar [pattern: '^[^@]+@[^@]+$']
  }
}`,
      };
      return {
        name: 'P7 field-imports: reference-only with alias renames the cloned field',
        source: `xdbml: 0.2
reuse { field core.dim_customer.email as CanonicalEmail } from './lib'

Entity users {
  id int [pk]
  user_email CanonicalEmail
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          const fd = dir.clone.statements[0];
          if (fd.kind !== 'FieldDeclaration' || fd.name !== 'CanonicalEmail') return `expected aliased name CanonicalEmail, got ${(fd as { name?: string }).name}`;
          const r = resolveNames(doc);
          if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Container core {
  Entity dim_customer {
    id int [pk]
    address object {
      street varchar
      city varchar [maxLength: 50]
    }
  }
}`,
      };
      return {
        name: 'P7 field-imports: reference-only nested path through ObjectType',
        source: `xdbml: 0.2
reuse { field core.dim_customer.address.city as cityType } from './lib'

Entity orders {
  id int [pk]
  ship_city cityType
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          const fd = dir.clone.statements[0];
          if (fd.kind !== 'FieldDeclaration' || fd.name !== 'cityType') return `expected cityType, got ${(fd as { name?: string }).name}`;
          if (!fd.settings.some((s) => s.name === 'maxlength')) return 'expected maxLength setting from nested source field';
          const r = resolveNames(doc);
          if (r.diagnostics.length !== 0) return `unexpected diagnostics: ${r.diagnostics.map((d) => d.code).join(', ')}`;
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Type Address {
  street varchar
  city varchar [maxLength: 50]
}
Container core {
  Entity dim_customer {
    id int [pk]
    home Address
  }
}`,
      };
      return {
        name: 'P7 field-imports: reference-only nested path through Named Type deref',
        source: `xdbml: 0.2
reuse { field core.dim_customer.home.city as cityType } from './lib'

Entity orders {
  id int [pk]
  ship_city cityType
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected directive with clone';
          if (dir.clone.statements.length !== 1) return `expected 1 clone statement, got ${dir.clone.statements.length}`;
          const fd = dir.clone.statements[0];
          if (fd.kind !== 'FieldDeclaration') return `expected FieldDeclaration, got ${fd.kind}`;
          if (fd.name !== 'cityType') return `expected cityType (post-alias), got '${fd.name}'`;
          // The Type's maxLength on `city` should carry across the deref.
          if (!fd.settings.some((s) => s.name === 'maxlength')) return 'expected maxLength to survive Named-Type deref';
          return null;
        },
      };
    })(),
    (() => {
      const files: Record<string, string> = {
        '/test/lib.xdbml': `xdbml: 0.2
Container core {
  Entity dim_customer {
    id int [pk]
    email varchar
  }
}`,
      };
      return {
        name: 'P7 field-imports: reference-only with missing field path -- silent skip',
        source: `xdbml: 0.2
reuse { field core.dim_customer.no_such_field } from './lib'`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          // Per spec §26.13: failures are silent at module resolution.
          // The directive's clone block exists but is empty.
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective') return 'expected directive';
          if (!dir.clone) return 'expected (empty) clone block';
          if (dir.clone.statements.length !== 0) return `expected 0 statements (silent skip), got ${dir.clone.statements.length}`;
          return null;
        },
      };
    })(),
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
    {
      // Spec §8: `required` is a synonym for `not null`. Parsers MUST
      // normalize: name=='not null' canonically, nameSource keeps the
      // original spelling so source round-tripping preserves what the
      // user typed.
      name: 'required is normalized to not null in the AST',
      source: `xdbml: 0.1
Table users {
  email varchar [required]
  name  varchar [not null]
}`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${t.kind}`;
        const email = t.body.find((b) => b.kind === 'FieldDeclaration' && b.name === 'email');
        const name  = t.body.find((b) => b.kind === 'FieldDeclaration' && b.name === 'name');
        if (!email || email.kind !== 'FieldDeclaration') return 'email field missing';
        if (!name  || name.kind  !== 'FieldDeclaration') return 'name field missing';

        const emailFlag = email.settings.find((s) => s.value === null);
        if (!emailFlag) return 'email has no flag setting';
        if (emailFlag.name !== 'not null') {
          return `email canonical name should be 'not null', got '${emailFlag.name}'`;
        }
        if (emailFlag.nameSource !== 'required') {
          return `email nameSource should preserve 'required', got '${emailFlag.nameSource}'`;
        }

        const nameFlag = name.settings.find((s) => s.value === null);
        if (!nameFlag) return 'name field has no flag setting';
        if (nameFlag.name !== 'not null') {
          return `name canonical name should be 'not null', got '${nameFlag.name}'`;
        }
        if (nameFlag.nameSource !== 'not null') {
          return `name nameSource should preserve 'not null', got '${nameFlag.nameSource}'`;
        }
        return null;
      },
    },
    {
      // Case-insensitivity: `Required`, `REQUIRED`, `not null`, `NOT NULL`
      // all normalize to the canonical lowercase form.
      name: 'required normalization is case-insensitive',
      source: `xdbml: 0.1
Table t {
  a varchar [REQUIRED]
  b varchar [Required]
  c varchar [NOT NULL]
}`,
      assert: (doc) => {
        const t = doc.statements[0];
        if (t.kind !== 'EntityDeclaration') return 'expected EntityDeclaration';
        for (const fieldName of ['a', 'b', 'c']) {
          const f = t.body.find((x) => x.kind === 'FieldDeclaration' && x.name === fieldName);
          if (!f || f.kind !== 'FieldDeclaration') return `field ${fieldName} missing`;
          const flag = f.settings.find((s) => s.value === null);
          if (!flag) return `${fieldName} has no flag`;
          if (flag.name !== 'not null') return `${fieldName} canonical name should be 'not null', got '${flag.name}'`;
        }
        return null;
      },
    },
  ];

  const results: TestResult[] = [];
  for (const c of cases) {
    try {
      const doc = parse(c.source, c.options ?? {});
      if (c.expectError) {
        // Parser accepted input that should have been rejected.
        results.push(fail(c.name, 'expected parse to throw, but it succeeded'));
      } else {
        const err = c.assert(doc);
        if (err === null) {
          results.push(ok(c.name));
        } else {
          results.push(fail(c.name, err));
        }
      }
    } catch (e) {
      if (c.expectError) {
        // Parser correctly rejected malformed input.
        results.push(ok(c.name));
      } else {
        results.push(fail(c.name, (e as Error).message));
      }
    }
  }
  return results;
}

/* -------------------------------------------------------------------------
 * Keyword-consistency tests
 *
 * Ensures every keyword in parser/src/keywords.ts is actually recognized
 * by the parser. This is the safety net for the shared-keyword-vocabulary
 * setup: keywords.ts is the source of truth for both the Monarch tokenizer
 * (in the playground) and the TextMate grammar (in tools/textmate/), so if
 * the parser ever stops recognizing a listed keyword, both highlighters
 * would silently mis-color it.
 *
 * Strategy: construct a minimal valid xDBML document that exercises each
 * keyword in its natural context (entity keyword as the start of an entity
 * declaration, scalar type as a field type, structural type as a structured
 * field type, etc.), parse it, and assert the AST has the expected shape.
 * ----------------------------------------------------------------------- */

function runKeywordConsistencyTests (): TestResult[] {
  const results: TestResult[] = [];

  // Lazily import keywords.ts via dynamic-style require; since we're
  // running with --experimental-strip-types, this is fine.
  // eslint-disable-next-line @typescript-eslint/no-require-imports

  // Each test parses a small document and verifies the keyword was
  // tokenized into the expected construct. A failure here means
  // keywords.ts and the parser have drifted apart.

  type KW = string;

  function tryParse (source: string, expect: (doc: XDbmlDocument) => string | null): string | null {
    try {
      const doc = parse(source);
      return expect(doc);
    } catch (e) {
      return (e as Error).message;
    }
  }

  // Entity keywords: Table / Entity / Collection / Record should each
  // produce an EntityDeclaration when used as the start of an entity.
  for (const kw of ENTITY_KEYWORDS) {
    const source = `xdbml: 0.1\n${kw} t {\n  id int [pk]\n}\n`;
    const err = tryParse(source, (doc) => {
      const d = doc.statements[0];
      if (!d || d.kind !== 'EntityDeclaration') {
        return `expected EntityDeclaration, got ${d?.kind ?? 'none'}`;
      }
      return null;
    });
    if (err === null) {
      results.push(ok(`Entity keyword: ${kw}`));
    } else {
      results.push(fail(`Entity keyword: ${kw}`, err));
    }
  }

  // Container keywords: each should produce a ContainerDeclaration.
  for (const kw of CONTAINER_KEYWORDS) {
    const source = `xdbml: 0.1\n${kw} c {\n  Table t {\n    id int [pk]\n  }\n}\n`;
    const err = tryParse(source, (doc) => {
      const d = doc.statements[0];
      if (!d || d.kind !== 'ContainerDeclaration') {
        return `expected ContainerDeclaration, got ${d?.kind ?? 'none'}`;
      }
      return null;
    });
    if (err === null) {
      results.push(ok(`Container keyword: ${kw}`));
    } else {
      results.push(fail(`Container keyword: ${kw}`, err));
    }
  }

  // Setting flags: each should parse as a flag setting on a field.
  // `not null`, `primary key`, and `required` are special cases: they
  // produce specific canonical settings, but the bare flag should
  // always parse without error in a flag context.
  for (const flag of SETTING_FLAGS) {
    const source = `xdbml: 0.1\nTable t {\n  f int [${flag}]\n}\n`;
    const err = tryParse(source, (doc) => {
      const t = doc.statements[0];
      if (!t || t.kind !== 'EntityDeclaration') return `parse failed`;
      const field = t.body.find((b) => b.kind === 'FieldDeclaration');
      if (!field || field.kind !== 'FieldDeclaration') return `field missing`;
      // Just verifying parse-without-error: setting may be combined
      // (e.g. `primary key` is two tokens at the lexer but combined at
      // the parser) so we accept any non-empty settings list.
      if (field.settings.length === 0) return `no settings parsed`;
      return null;
    });
    if (err === null) {
      results.push(ok(`Setting flag: ${flag}`));
    } else {
      results.push(fail(`Setting flag: ${flag}`, err));
    }
  }

  // Spot-check a handful of representative keywords across the other
  // categories. Exhaustive checks would inflate test time without
  // catching meaningfully more bugs.
  const spotChecks: { name: string; source: string; expect: (doc: XDbmlDocument) => string | null }[] = [
    {
      name: 'Top-level Project',
      source: `xdbml: 0.1\nProject p {\n  database_type: 'PostgreSQL'\n}\n`,
      expect: (doc) => doc.statements[0]?.kind === 'ProjectDeclaration' ? null : 'no Project',
    },
    {
      name: 'Top-level Ref',
      source: `xdbml: 0.1\nTable a { id int [pk] }\nTable b { aid int }\nRef: b.aid > a.id\n`,
      expect: (doc) => doc.statements.some((s) => s.kind === 'RefDeclaration') ? null : 'no Ref',
    },
    {
      name: 'Type expression: array',
      source: `xdbml: 0.1\nTable t { tags array [varchar] }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Type expression: object',
      source: `xdbml: 0.1\nTable t { meta object { name varchar } }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Polymorphism: oneOf',
      source: `xdbml: 0.1\nTable t { pm oneOf { card object {} cash object {} } }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Scalar type: varchar',
      source: `xdbml: 0.1\nTable t { f varchar(100) }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'BSON type: objectId',
      source: `xdbml: 0.1\nTable t { _id objectId [pk] }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Setting key: default with string value',
      source: `xdbml: 0.1\nTable t { f varchar [default: 'hello'] }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Note declaration',
      source: `xdbml: 0.1\nTable t {\n  id int [pk]\n  Note: 'a table'\n}\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EntityDeclaration' ? null : 'parse failed',
    },
    {
      name: 'Enum declaration',
      source: `xdbml: 0.1\nEnum colors { red green blue }\n`,
      expect: (doc) => doc.statements[0]?.kind === 'EnumDeclaration' ? null : 'expected EnumDeclaration',
    },
    {
      name: 'Directive: xdbml version',
      source: `xdbml: 0.1\nTable t { id int [pk] }\n`,
      expect: (doc) => (doc.version as { version?: string })?.version === '0.1' ? null : `version not parsed correctly`,
    },
  ];
  for (const s of spotChecks) {
    const err = tryParse(s.source, s.expect);
    if (err === null) {
      results.push(ok(s.name));
    } else {
      results.push(fail(s.name, err));
    }
  }

  return results;
}



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
  const keywords = runKeywordConsistencyTests();
  const ir = report('Inline grammar tests', inline);
  const er = report('Official example files (xdbml/xdbml-spec/examples)', examples);
  const kr = report('Keyword-consistency tests (parser/src/keywords.ts vs parser)', keywords);
  const totalPassed = ir.passed + er.passed + kr.passed;
  const totalFailed = ir.failed + er.failed + kr.failed;
  console.log(`\n${CYAN}== Summary ==${RESET}`);
  console.log(`  ${GREEN}${totalPassed} passed${RESET}, ${totalFailed > 0 ? RED : DIM}${totalFailed} failed${RESET}`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main();
