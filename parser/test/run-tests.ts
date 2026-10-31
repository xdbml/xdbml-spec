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

import {
  parse, flatten, resolveNames,
  isForeignMaster, pathToString, refChildEndpoint, refParentEndpoint, relationshipType,
  constraintType, isUndirected, isInactive,
  resolveSupertypeGroups, subtypeStrategy, supertypeChains, supertypeGroupSettings,
  viewSourceQuery,
  diagramViewMembers, diagramViews, diagramViewNote,
  entityDefinitions, isDefinitionsExcludedTarget,
  refCardinality, refCardinalityIn,
  metadataIndex, settingValueText, withMetadata,
  projectNote, resolveStickyNote, stickyNotes,
  collectLineage, depColor, depSettings, resolveLineage,
  grainOf, targetCoverage, TRANSFORMATIONS,
  classifyModuleSource, moduleCandidates, ParseError,
} from '../src/index.ts';
import type { AppliedSetting, DepDeclaration, EndCardinality, EntityDeclaration, FieldDeclaration, ParseOptions, RecordRow, RecordsBlock, RefDeclaration, RefValue, TopLevelRecordsDeclaration, XDbmlDocument } from '../src/index.ts';
import {
  BSON_TYPES,
  CONTAINER_KEYWORDS,
  ENTITY_KEYWORDS,
  SCALAR_TYPES,
  SETTING_FLAGS,
  TARGET_NATIVE_TYPES,
} from '../src/keywords.ts';
import * as keywordArrays from '../src/keywords.ts';
import { parse as parse062, resolveNames as resolveNames062 } from '../src/index.ts';
import { entityConstraints, primaryKey } from '../src/constraints.ts';
import { effectiveFields, effectiveHeaderColor, effectiveIndexes, effectiveNote, tablePartials } from '../src/partials.ts';
import { keyPathString } from '../src/constraints.ts';
import type { PathSegment } from '../src/index.ts';
import { xdbmlMonarchTokensProvider } from '../src/monarch.ts';
import { isCustomPropertyName, isQualifiedName, joinName, lastNameSegment, nameQualifier, quoteNameSegment, splitName } from '../src/names.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
// The repository's own examples, the same files the site publishes and the
// renderer's golden tests draw, so every example is parsed here as it is
// added. (Earlier, this suite parsed private copies under test/examples that
// had drifted from the published files and stopped at example 11.)
const examplesDir = join(__dirname, '..', '..', 'examples');

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
      name: 'Array sugar: `array [int, varchar]` folds to a union element',
      source: 'Entity e {\n  f array [int, varchar]\n}',
      assert: (doc) => {
        const e = doc.statements[0] as EntityDeclaration;
        const f = e.body.find((b) => (b as { name?: string }).name === 'f') as { type?: { kind?: string; elementType?: { kind?: string; members?: { kind: string; name?: string }[] } } } | undefined;
        if (f?.type?.kind !== 'ArrayType') return `expected ArrayType, got ${f?.type?.kind}`;
        const el = f.type.elementType;
        if (el?.kind !== 'UnionType') return `expected element to fold to UnionType, got ${el?.kind}`;
        const ms = el.members ?? [];
        if (ms.length !== 2) return `expected 2 union members, got ${ms.length}`;
        if (ms[0].name !== 'int' || ms[1].name !== 'varchar') return `expected int,varchar members, got ${ms.map((m) => m.name).join(',')}`;
        return null;
      },
    },
    {
      name: 'Array sugar: three members incl. null; single type is NOT folded',
      source: 'Entity e {\n  many array [int, varchar, null]\n  one  array [varchar]\n}',
      assert: (doc) => {
        const e = doc.statements[0] as EntityDeclaration;
        const many = e.body.find((b) => (b as { name?: string }).name === 'many') as { type?: { elementType?: { kind?: string; members?: unknown[] } } } | undefined;
        const one = e.body.find((b) => (b as { name?: string }).name === 'one') as { type?: { elementType?: { kind?: string } } } | undefined;
        if (many?.type?.elementType?.kind !== 'UnionType') return `many: expected UnionType element, got ${many?.type?.elementType?.kind}`;
        if ((many.type.elementType.members ?? []).length !== 3) return `many: expected 3 members, got ${(many.type.elementType.members ?? []).length}`;
        if (one?.type?.elementType?.kind === 'UnionType') return 'one: single element type must NOT fold to a union';
        return null;
      },
    },
    {
      name: 'Set sugar: `set [int, varchar]` folds to a union element',
      source: 'Entity e {\n  f set [int, varchar]\n  g set [varchar]\n}',
      assert: (doc) => {
        const e = doc.statements[0] as EntityDeclaration;
        const f = e.body.find((b) => (b as { name?: string }).name === 'f') as { type?: { kind?: string; elementType?: { kind?: string; members?: unknown[] } } } | undefined;
        const g = e.body.find((b) => (b as { name?: string }).name === 'g') as { type?: { elementType?: { kind?: string } } } | undefined;
        if (f?.type?.kind !== 'SetType') return `expected SetType, got ${f?.type?.kind}`;
        if (f.type.elementType?.kind !== 'UnionType') return `expected set element to fold to UnionType, got ${f.type.elementType?.kind}`;
        if ((f.type.elementType.members ?? []).length !== 2) return `expected 2 members, got ${(f.type.elementType.members ?? []).length}`;
        if (g?.type?.elementType?.kind === 'UnionType') return 'single set element type must NOT fold to a union';
        return null;
      },
    },
    {
      name: 'Tuple: newline-separated elements (no commas)',
      source: `Entity customers {
  id int [pk]
  addresses array [
    [0] billing object {
      street varchar
      city varchar
    }
    [1] shipping object {
      street varchar
    }
  ]
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${e.kind}`;
        const f = e.body.find((b) => (b as { name?: string }).name === 'addresses') as { type?: { kind?: string; elements?: { position: number; name: string }[] } } | undefined;
        if (!f || f.type?.kind !== 'TupleType') return `expected addresses field to be a TupleType, got ${f?.type?.kind}`;
        const els = f.type.elements ?? [];
        if (els.length !== 2) return `expected 2 tuple elements, got ${els.length}`;
        if (els[0].position !== 0 || els[1].position !== 1) return `expected positions 0,1, got ${els.map((x) => x.position).join(',')}`;
        if (els[0].name !== 'billing' || els[1].name !== 'shipping') return `expected names billing,shipping, got ${els.map((x) => x.name).join(',')}`;
        return null;
      },
    },
    {
      name: 'Tuple: newline elements with per-element settings (position marker not consumed as settings)',
      source: `Entity e {
  t array [
    [0] a int [not null]
    [1] b int [default: 5]
  ]
}`,
      assert: (doc) => {
        const e = doc.statements[0] as EntityDeclaration;
        const f = e.body.find((b) => (b as { name?: string }).name === 't') as { type?: { kind?: string; elements?: { settings?: { name: string }[] }[] } } | undefined;
        if (f?.type?.kind !== 'TupleType') return `expected TupleType, got ${f?.type?.kind}`;
        const els = f.type.elements ?? [];
        if (els.length !== 2) return `expected 2 elements, got ${els.length}`;
        if ((els[0].settings ?? []).length !== 1) return `expected 1 setting on element 0, got ${(els[0].settings ?? []).length}`;
        if ((els[1].settings ?? []).length !== 1) return `expected 1 setting on element 1, got ${(els[1].settings ?? []).length}`;
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
        name: 'P5: ImportAll skips ProjectDeclaration (spec §28.4)',
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
        name: 'P5: circular imports do not crash (spec §28.15)',
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
     * v0.3: remote (URL) module sources  (spec §28.14)
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
Type Amount decimal`,
      };
      return {
        name: 'v0.3 remote: no .xdbml appended to a URL source (query string preserved)',
        source: `xdbml: 0.2
reuse { type Amount } from '${AZ}'`,
        options: {
          filePath: '/local/entry.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found (key=${p})`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected resolved directive';
          if ((dir.clone.statements[0] as { name?: string }).name !== 'Amount') return 'expected Amount type';
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
    /* -------------------------------------------------------------------
     * Foreign master relationships (spec 11.10 - 11.11, new in v0.4)
     * ----------------------------------------------------------------- */
    {
      name: 'FM: top-level foreign master is clean',
      source: `xdbml: 0.4
Collection customers {
  customerID objectId [pk]
  name string
}
Collection orders {
  orderID objectId [pk]
  customerName string
}
Ref: orders.customerName > customers.name [foreign_master]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        if (relationshipType(ref) !== 'foreign_master') return 'expected relationshipType foreign_master';
        if (!isForeignMaster(ref)) return 'expected isForeignMaster true';
        return null;
      },
    },
    {
      name: 'FM: a Ref without the flag is referential',
      source: `xdbml: 0.4
Collection a { x int }
Collection b { y int }
Ref: a.x > b.y`,
      assert: (doc) => {
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        if (relationshipType(ref) !== 'referential') return `expected referential, got ${relationshipType(ref)}`;
        return null;
      },
    },
    {
      name: 'FM: inline foreign master beside an inline ref is clean',
      source: `xdbml: 0.4
Collection customers {
  customerID objectId [pk]
  name string
}
Collection orders {
  orderID objectId [pk]
  customerName string [ref: > customers.name, foreign_master]
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected 0 diagnostics, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'FM: settings block in the long Ref form parses (new in v0.4)',
      source: `xdbml: 0.4
Collection a { x int }
Collection b { y int }
Ref named {
  a.x > b.y [foreign_master]
}`,
      assert: (doc) => {
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        if (ref.name !== 'named') return `expected name 'named', got ${String(ref.name)}`;
        if (!isForeignMaster(ref)) return 'expected the long-form settings block to carry the flag';
        return null;
      },
    },
    {
      name: 'FM: composite endpoints are rejected',
      source: `xdbml: 0.4
Collection a { p int
 q int }
Collection b { p int
 q int }
Ref: a.(p, q) > b.(p, q) [foreign_master]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'foreign-master-composite');
        if (hits.length !== 2) return `expected 2 foreign-master-composite diagnostics, got ${hits.length}`;
        return null;
      },
    },
    {
      name: 'FM: composite referential relationships stay legal',
      source: `xdbml: 0.4
Collection a { p int
 q int }
Collection b { p int
 q int }
Ref: a.(p, q) > b.(p, q)`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code.startsWith('foreign-master'));
        if (hits.length !== 0) return `expected no foreign-master diagnostics, got ${hits.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'FM: a child attribute takes at most one master',
      source: `xdbml: 0.4
Collection a { p int
 q int }
Collection o { x int }
Ref: o.x > a.p [foreign_master]
Ref: o.x > a.q [foreign_master]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'foreign-master-duplicate-child');
        if (hits.length !== 1) return `expected 1 foreign-master-duplicate-child, got ${hits.length}`;
        if (!hits[0].message.includes('o.x')) return 'message should name the child attribute';
        return null;
      },
    },
    {
      name: 'FM: two referential relationships from one child stay legal',
      source: `xdbml: 0.4
Collection a { p int }
Collection b { q int }
Collection o { x int }
Ref: o.x > a.p
Ref: o.x > b.q`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code.startsWith('foreign-master'));
        if (hits.length !== 0) return `expected no foreign-master diagnostics, got ${hits.map((d) => d.code).join(', ')}`;
        return null;
      },
    },
    {
      name: 'FM: the flag without an inline ref is rejected',
      source: `xdbml: 0.4
Collection o { x int [foreign_master] }`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'foreign-master-without-ref');
        if (hits.length !== 1) return `expected 1 foreign-master-without-ref, got ${hits.length}`;
        return null;
      },
    },
    {
      name: 'FM: the flag on a nested field without an inline ref is rejected',
      source: `xdbml: 0.4
Collection o {
  id objectId [pk]
  ship object {
    city string [foreign_master]
  }
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'foreign-master-without-ref');
        if (hits.length !== 1) return `expected 1 foreign-master-without-ref, got ${hits.length}`;
        return null;
      },
    },
    {
      name: 'FM: the flag requires a document declaring 0.4 or later',
      source: `xdbml: 0.3
Collection a { p int }
Collection o { x int }
Ref: o.x > a.p [foreign_master]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'construct-requires-version');
        if (hits.length !== 1) return `expected 1 construct-requires-version, got ${hits.length}`;
        return null;
      },
    },
    {
      name: 'FM: the cardinality operator picks the child endpoint',
      source: `xdbml: 0.4
Collection a { p int }
Collection o { x int }
Ref: a.p < o.x [foreign_master]`,
      assert: (doc) => {
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        const child = refChildEndpoint(ref);
        const parent = refParentEndpoint(ref);
        if (!child || pathToString(child.path) !== 'o.x') return `expected child o.x, got ${child ? pathToString(child.path) : 'none'}`;
        if (!parent || pathToString(parent.path) !== 'a.p') return `expected parent a.p, got ${parent ? pathToString(parent.path) : 'none'}`;
        return null;
      },
    },
    /* -------------------------------------------------------------------
     * Entity-level relationship endpoints (spec 11.16)
     * ----------------------------------------------------------------- */
    {
      name: 'EL: bare entity names resolve',
      source: `xdbml: 0.4
Entity Customer { }
Entity Order { }
Ref: Customer > Order`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'EL: container.entity resolves as an entity-level endpoint',
      source: `xdbml: 0.4
Database shop {
  Entity orders { id int [pk] }
}
Entity Customer { }
Ref: Customer - shop.orders`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'EL: an unknown single-segment endpoint is an error',
      source: `xdbml: 0.4
Entity Customer { }
Ref: Customer > Nope`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'unresolved-entity');
        return hits.length === 1 ? null : `expected 1 unresolved-entity, got ${hits.length}`;
      },
    },
    {
      name: 'EL: the attribute reading still wins',
      source: `xdbml: 0.4
Entity shop { orders int }
Entity Customer { id int [pk] }
Ref: Customer.id > shop.orders`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'EL: a genuine collision warns and keeps the attribute reading',
      source: `xdbml: 0.4
Database shop {
  Entity orders { id int [pk] }
}
Entity shop { orders int }
Entity Customer { id int [pk] }
Ref: Customer.id > shop.orders`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const hits = r.diagnostics.filter((d) => d.code === 'ambiguous-ref-endpoint');
        if (hits.length !== 1) return `expected 1 ambiguous-ref-endpoint, got ${hits.length}`;
        if (hits[0].severity !== 'warning') return `expected a warning, got ${hits[0].severity}`;
        return null;
      },
    },
    /* -------------------------------------------------------------------
     * Relationship documentation settings (spec 11.14, 11.15, 11.16.2)
     * ----------------------------------------------------------------- */
    {
      name: 'RD: roles, verbs and constraint type are accepted',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b { aid int }
Ref: b.aid > a.id [source_role: 'child', target_role: 'parent', source_verb: 'belongs to', target_verb: 'owns', constraint_type: identifying]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        if (constraintType(ref) !== 'identifying') return `expected identifying, got ${String(constraintType(ref))}`;
        return null;
      },
    },
    {
      name: 'RD: an unknown constraint type is rejected',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b { aid int }
Ref: b.aid > a.id [constraint_type: identifyng]`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'invalid-constraint-type');
        return hits.length === 1 ? null : `expected 1 invalid-constraint-type, got ${hits.length}`;
      },
    },
    {
      name: 'RD: constraint type does not apply to a foreign master',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b { aid int }
Ref: b.aid > a.id [foreign_master, constraint_type: identifying]`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'constraint-type-on-foreign-master');
        return hits.length === 1 ? null : `expected 1 constraint-type-on-foreign-master, got ${hits.length}`;
      },
    },
    {
      name: 'RD: undirected takes true or false',
      source: `xdbml: 0.4
Entity a { }
Entity b { }
Ref: a - b [undirected: yes]`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'invalid-undirected');
        return hits.length === 1 ? null : `expected 1 invalid-undirected, got ${hits.length}`;
      },
    },
    {
      name: 'RD: undirected true is accepted and readable',
      source: `xdbml: 0.4
Entity a { }
Entity b { }
Ref: a - b [undirected: true]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        return isUndirected(ref) ? null : 'expected isUndirected true';
      },
    },
    {
      name: 'RD: undirected alone is accepted on a Ref, as on an Edge',
      source: `xdbml: 0.7
Entity a { }
Entity b { }
Ref: a - b [undirected]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        return isUndirected(ref) ? null : 'expected isUndirected true';
      },
    },
    {
      name: "RD: undirected reads true from true, 'true' and the name alone, false from false",
      source: `xdbml: 0.7
Entity a { }
Entity b { }
Ref r1: a - b [undirected]
Ref r2: a - b [undirected: true]
Ref r3: a - b [undirected: 'true']
Ref r4: a - b [undirected: false]
Ref r5: a - b [undirected: 'false']
Ref r6: a - b`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const got = doc.statements.filter((st) => st.kind === 'RefDeclaration')
          .map((ref) => (ref.kind === 'RefDeclaration' && isUndirected(ref) ? 'y' : 'n')).join('');
        return got === 'yyynnn' ? null : `expected yyynnn, got ${got}`;
      },
    },
    {
      name: 'RD: undirected on an Edge takes the values it takes on a Ref',
      source: `xdbml: 0.7
Entity Person { id int [pk] }
Edge KNOWS [source: Person, target: Person, undirected] { since date }
Edge LIKES [source: Person, target: Person, undirected: false] { at date }
Edge BAD [source: Person, target: Person, undirected: yes] { at date }
Keyspace social {
  Edge WORSE [source: Person, target: Person, undirected: 2] { at date }
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'invalid-undirected');
        if (hits.length !== 2) return `expected 2 invalid-undirected, got ${hits.length}`;
        const edges = doc.statements.filter((st) => st.kind === 'EdgeDeclaration');
        const got = edges.map((e) => (e.kind === 'EdgeDeclaration' && isUndirected(e) ? 'y' : 'n')).join('');
        return got === 'ynn' ? null : `expected ynn, got ${got}`;
      },
    },
    {
      name: 'RD: inactive false and foreign_master false leave the flags unset',
      source: `xdbml: 0.3
Entity a { id int [pk] }
Entity b {
  aid int
  bid int [foreign_master: false]
}
Ref: b.aid > a.id [inactive: false, foreign_master: false]`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const ref = doc.statements.find((st) => st.kind === 'RefDeclaration');
        if (!ref || ref.kind !== 'RefDeclaration') return 'expected a RefDeclaration';
        if (isInactive(ref)) return 'expected isInactive false';
        return relationshipType(ref) === 'referential' ? null : `expected referential, got ${relationshipType(ref)}`;
      },
    },
    {
      name: 'RD: inactive reads true from the name alone and from true',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b { aid int }
Ref r1: b.aid > a.id [inactive]
Ref r2: b.aid > a.id [inactive: true]
Ref r3: b.aid > a.id [inactive: 'true']
Ref r4: b.aid > a.id [foreign_master: true]`,
      assert: (doc) => {
        const refs = doc.statements.filter((st) => st.kind === 'RefDeclaration');
        const got = refs.map((ref) => (ref.kind === 'RefDeclaration' && isInactive(ref) ? 'y' : 'n')).join('');
        if (got !== 'yyyn') return `expected yyyn, got ${got}`;
        const last = refs[3];
        return last.kind === 'RefDeclaration' && isForeignMaster(last) ? null : 'expected foreign_master: true to set the flag';
      },
    },
    {
      name: 'RD: inactive and foreign_master with a value other than true or false are errors',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b {
  aid int
  bid int [ref: > a.id, foreign_master: maybe]
}
Ref: b.aid > a.id [inactive: 'soon', foreign_master: 1]`,
      assert: (doc) => {
        const codes = resolveNames(doc).diagnostics.map((d) => d.code).sort().join(', ');
        return codes === 'invalid-foreign-master, invalid-foreign-master, invalid-inactive'
          ? null
          : `expected two invalid-foreign-master and one invalid-inactive, got ${codes}`;
      },
    },
    {
      name: 'RD: <> is rejected between entities',
      source: `xdbml: 0.4
Entity a { }
Entity b { }
Ref: a <> b`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'entity-level-many-to-many');
        return hits.length === 1 ? null : `expected 1 entity-level-many-to-many, got ${hits.length}`;
      },
    },
    {
      name: 'RD: <> between attributes stays legal',
      source: `xdbml: 0.4
Entity a { id int [pk] }
Entity b { aid int }
Ref: b.aid <> a.id`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'RD: the documentation settings require v0.4',
      source: `xdbml: 0.3
Entity a { id int [pk] }
Entity b { aid int }
Ref: b.aid > a.id [source_role: 'child']`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'construct-requires-version');
        return hits.length === 1 ? null : `expected 1 construct-requires-version, got ${hits.length}`;
      },
    },
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
      name: 'P6: near miss of a declared Named Type produces a possible-type-typo warning',
      source: `xdbml: 0.2
Type Address {
  street varchar
}
Entity users {
  id int [pk]
  home Adress
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 1) return `expected 1 diagnostic, got ${r.diagnostics.length}: ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const d = r.diagnostics[0];
        if (d.code !== 'possible-type-typo') return `wrong code: ${d.code}`;
        if (d.severity !== 'warning') return `expected a warning, got ${d.severity}`;
        if (!d.message.includes("'Adress'") || !d.message.includes("'Address'")) return `message should name both spellings: ${d.message}`;
        return null;
      },
    },
    {
      name: 'P6: an unknown type name with no near miss passes through as target-native (spec §1.2)',
      source: `xdbml: 0.2
Entity users {
  id int [pk]
  email NoSuchType
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
      },
    },
    {
      name: 'P6: target-native type names produce no diagnostics',
      source: `xdbml: 0.5
Project p { targets: Oracle }
Schema ops [type: schema] {
  Table native {
    a number(11) [pk]
    b NUMBER(10,2)
    c clob
    d nclob
    e raw(16)
    f binary_double
    g serial
    h bigserial
    i bytea
    j citext
    k uniqueidentifier
    l datetimeoffset
    m timestamp_ntz
    n float64
    o "timestamp with time zone"
    p union [number, varchar2(10)]
    q array [clob]
    r map [varchar2, number]
  }
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
      },
    },
    {
      name: 'P6: a DBML field typed by a declared Enum produces no diagnostics',
      source: `Enum job_status {
  created
  running
}
Table jobs {
  id int [pk]
  status job_status
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
      },
    },
    {
      name: 'P6: an Enum declared in two containers resolves by bare name without a near-miss warning',
      source: `xdbml: 0.2
Container a [type: schema] {
  Enum state { on
    off }
  Entity t { s state }
}
Container b [type: schema] {
  Enum state { up
    down }
  Entity u { s state }
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
      },
    },
    {
      name: 'P6: near-miss rules -- case only, transposition, nested positions, Enums, length thresholds',
      source: `xdbml: 0.2
Type Email varchar
Type Address {
  street varchar
}
Type Geo {
  lat float
}
Enum job_status {
  created
}
Entity t {
  a email
  b Adderss
  c array [Adress]
  d union [Emial, int]
  e object {
    f Adress
  }
  g job_stauts
  h geo
  i gep
  j number
  k address_line
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const got = r.diagnostics.map((d) => `${d.code}:${d.severity}:${(d.message.match(/did you mean '([^']+)'/) ?? [])[1]}`);
        const want = [
          'possible-type-typo:warning:Email',      // a -- case only
          'possible-type-typo:warning:Address',    // b -- adjacent transposition
          'possible-type-typo:warning:Address',    // c -- array element
          'possible-type-typo:warning:Email',      // d -- union member
          'possible-type-typo:warning:Address',    // f -- nested object field
          'possible-type-typo:warning:job_status', // g -- Enum
          'possible-type-typo:warning:Geo',        // h -- three characters, case only
        ];
        // i: three characters allow no edit beyond case; j and k are too far from any declaration.
        return JSON.stringify(got) === JSON.stringify(want) ? null : `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
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
      name: 'DBML: schema-qualified Enum declarations parse with their qualified names (spec §16)',
      source: `enum core.job_status {
  created
  running [note: 'in progress']
}
enum "billing"."invoice status" {
  draft
}`,
      assert: (doc) => {
        const names = doc.statements.map((s) => (s.kind === 'EnumDeclaration' ? `${s.name}:${s.values.length}` : s.kind));
        const want = ['core.job_status:2', 'billing.invoice status:1'];
        return JSON.stringify(names) === JSON.stringify(want) ? null : `expected ${JSON.stringify(want)}, got ${JSON.stringify(names)}`;
      },
    },
    {
      name: 'DBML: a qualified type name parses as one ScalarType, parameters included',
      source: `Table core.jobs {
  status core.job_status [not null]
  label "billing"."invoice status"
  amount core.money_t(10,2)
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${e.kind}`;
        const got = e.body.map((b) => {
          if (b.kind !== 'FieldDeclaration' || b.type.kind !== 'ScalarType') return b.kind;
          return `${b.type.name}${b.type.params ? `(${b.type.params.join(',')})` : ''}:${b.settings.length}`;
        });
        const want = ['core.job_status:1', 'billing.invoice status:0', 'core.money_t(10,2):0'];
        return JSON.stringify(got) === JSON.stringify(want) ? null : `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'P6: a qualified Enum is filed under its container, like the Container form, and resolves',
      source: `enum core.job_status {
  created
  done
}
Container ops [type: schema] {
  Enum level { low
    high }
}
Table core.jobs {
  a core.job_status
  b job_status
  c ops.level
  d level
  e public.geometry
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length !== 0) return `expected clean, got ${r.diagnostics.map((d) => d.code + ': ' + d.message).join('\n')}`;
        const sym = r.symbols.lookup('core.job_status');
        if (!sym || sym.kind !== 'enum') return 'core.job_status should be an enum symbol';
        if (sym.name !== 'job_status' || sym.containerName !== 'core') return `expected job_status in core, got ${sym.name} in ${sym.containerName}`;
        return null;
      },
    },
    {
      name: 'P6: the same Enum declared in a Container block and with a qualified name is a duplicate',
      source: `Container core [type: schema] {
  Enum job_status { created
    done }
}
enum core.job_status {
  queued
}`,
      assert: (doc) => {
        const codes = resolveNames(doc).diagnostics.map((d) => d.code);
        return JSON.stringify(codes) === JSON.stringify(['duplicate-declaration']) ? null : `expected one duplicate-declaration, got ${codes.join(', ')}`;
      },
    },
    {
      name: 'P6: a near miss of a qualified Enum suggests the qualified name',
      source: `enum core.job_status {
  created
}
Table core.jobs {
  status core.job_stauts
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        if (d.length !== 1 || d[0].code !== 'possible-type-typo') return `expected one possible-type-typo, got ${d.map((x) => x.code).join(', ')}`;
        return d[0].message.includes("did you mean 'core.job_status'") ? null : `wrong suggestion: ${d[0].message}`;
      },
    },
    (() => {
      const files: Record<string, string> = {
        '/test/enums.xdbml': `xdbml: 0.5
enum core.job_status {
  created
  done
}
Container ops [type: schema] {
  Enum level { low
    high }
}`,
      };
      return {
        name: 'P5: use { enum core.job_status } imports a qualified top-level Enum under its bare name, like a container-scoped one',
        source: `xdbml: 0.5
use { enum core.job_status, enum ops.level } from './enums'
Table jobs {
  s job_status
  l level
}`,
        options: {
          filePath: '/test/main.xdbml',
          readFile: (p: string) => files[p] ?? (() => { throw new Error(`not found: ${p}`); })(),
        },
        assert: (doc) => {
          const dir = doc.statements[0];
          if (dir.kind !== 'ModuleImportDirective' || !dir.clone) return 'expected ModuleImportDirective with clone';
          const got = dir.clone.statements.map((s) => `${s.kind}:${(s as { name?: string }).name}`);
          const want = ['EnumDeclaration:job_status', 'EnumDeclaration:level'];
          if (JSON.stringify(got) !== JSON.stringify(want)) return `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`;
          const diags = resolveNames(doc).diagnostics;
          return diags.length === 0 ? null : `unexpected diagnostics: ${diags.map((d) => d.code).join(', ')}`;
        },
      };
    })(),
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
      name: 'P6-nested: navigating past a target-native type is invalid',
      source: `xdbml: 0.2
Entity users {
  id number(11) [pk]
  code clob
}
Entity foo { x varchar [pk] }
Ref: users.code.something > foo.x`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const codes = r.diagnostics.map((d) => d.code);
        return JSON.stringify(codes) === JSON.stringify(['invalid-nested-path']) ? null : `expected exactly one invalid-nested-path, got: ${codes.join(', ')}`;
      },
    },
    {
      name: 'P6-nested: navigating past an Enum-typed field is invalid',
      source: `Enum job_status {
  created
}
Table jobs {
  id int [pk]
  status job_status
}
Table foo { x varchar [pk] }
Ref: jobs.status.something > foo.x`,
      assert: (doc) => {
        const r = resolveNames(doc);
        const codes = r.diagnostics.map((d) => d.code);
        return JSON.stringify(codes) === JSON.stringify(['invalid-nested-path']) ? null : `expected exactly one invalid-nested-path, got: ${codes.join(', ')}`;
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
      assert: (_doc) => 'parse should have failed',
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
          // Per spec §28.13: failures are silent at module resolution.
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
    /* -----------------------------------------------------------------
     * SG: supertype groups (spec §12, v0.5)
     * ----------------------------------------------------------------- */
    {
      name: 'SG: a group parses with its name, settings and members',
      source: `xdbml: 0.5
Entity Party {
  party_id int [pk]
}
Entity Person { }
Entity Organization { }
SupertypeGroup legal_nature [supertype: Party, completeness: total, exclusivity: disjoint] {
  Person
  Organization [strategy: roll_down]
}`,
      assert: (doc) => {
        const g = doc.statements.find((s) => s.kind === 'SupertypeGroupDeclaration');
        if (!g || g.kind !== 'SupertypeGroupDeclaration') return 'no SupertypeGroupDeclaration';
        if (g.name !== 'legal_nature') return `name ${g.name}`;
        if (g.members.map((m) => m.name).join(',') !== 'Person,Organization') return `members ${g.members.map((m) => m.name).join(',')}`;
        if (g.members[1].settings[0]?.name !== 'strategy') return 'member setting missing';
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'SG: members separate by newline, comma or semicolon, like TableGroup',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
Entity C { }
Entity D { }
SupertypeGroup g [supertype: A] { B, C; D }`,
      assert: (doc) => {
        const g = doc.statements.find((s) => s.kind === 'SupertypeGroupDeclaration');
        if (!g || g.kind !== 'SupertypeGroupDeclaration') return 'no group';
        return g.members.map((m) => m.name).join(',') === 'B,C,D' ? null : `members ${g.members.map((m) => m.name).join(',')}`;
      },
    },
    {
      name: 'SG: a group without a name is a parse error',
      source: `xdbml: 0.5
Entity A { }
SupertypeGroup [supertype: A] { }`,
      assert: () => 'should have thrown',
      expectError: true,
    },
    {
      name: 'SG: the keyword is case-insensitive',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
supertypegroup g [supertype: A] {
  B
}`,
      assert: (doc) => doc.statements.some((s) => s.kind === 'SupertypeGroupDeclaration') ? null : 'not parsed as a group',
    },
    {
      name: 'SG: container-qualified members resolve',
      source: `xdbml: 0.5
Container crm [type: schema] {
  Entity Party {
    id int [pk]
  }
  Entity Person { }
}
SupertypeGroup g [supertype: crm.Party] {
  crm.Person
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length > 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const groups = resolveSupertypeGroups(flatten(doc));
        return groups[0].supertype === 'crm.Party' && groups[0].subtypes[0].entity === 'crm.Person'
          ? null : `resolved ${groups[0].supertype} / ${groups[0].subtypes[0].entity}`;
      },
    },
    {
      name: 'SG: aliases normalize to canonical values',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
Entity C { }
Entity D { }
SupertypeGroup g [supertype: A, completeness: complete, exclusivity: exclusive, strategy: single_table, merge: flat_with_discriminator] {
  B [strategy: joined]
  C [strategy: table_per_class]
  D [strategy: CONCRETE_TABLE]
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length > 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const g = doc.statements.find((s) => s.kind === 'SupertypeGroupDeclaration');
        if (!g || g.kind !== 'SupertypeGroupDeclaration') return 'no group';
        const s = supertypeGroupSettings(g);
        const got = [s.completeness, s.exclusivity, s.strategy, s.merge, ...g.members.map((m) => subtypeStrategy(m))].join(',');
        const want = 'total,disjoint,roll_up,flat,preserved_hierarchy,roll_down,roll_down';
        return got === want ? null : `got ${got}`;
      },
    },
    {
      name: 'SG: an unknown value is reported, on the group and on a member',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
SupertypeGroup g [supertype: A, completeness: mostly] {
  B [strategy: sideways]
}`,
      assert: (doc) => {
        const n = resolveNames(doc).diagnostics.filter((d) => d.code === 'invalid-supertype-group-value').length;
        return n === 2 ? null : `expected 2 invalid-supertype-group-value, got ${n}`;
      },
    },
    {
      name: 'SG: a group without supertype: is reported',
      source: `xdbml: 0.5
Entity B { }
SupertypeGroup g {
  B
}`,
      assert: (doc) => resolveNames(doc).diagnostics.some((d) => d.code === 'missing-supertype') ? null : 'expected missing-supertype',
    },
    {
      name: 'SG: unresolved, non-entity and ambiguous members are reported',
      source: `xdbml: 0.5
Container a [type: schema] {
  Entity X { }
}
Container b [type: schema] {
  Entity X { }
}
Entity A { }
View V {
  id int
}
SupertypeGroup g [supertype: A] {
  Nope
  V
  X
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'unresolved-supertype-group-member');
        if (hits.length !== 3) return `expected 3, got ${hits.length}: ${hits.map((d) => d.message).join(' | ')}`;
        if (!hits.some((d) => /names a View/.test(d.message))) return 'no View message';
        if (!hits.some((d) => /several containers/.test(d.message))) return 'no ambiguity message';
        return null;
      },
    },
    {
      name: 'SG: duplicate group names are reported',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
Entity C { }
SupertypeGroup g [supertype: A] {
  B
}
SupertypeGroup g [supertype: A] {
  C
}`,
      assert: (doc) => resolveNames(doc).diagnostics.some((d) => d.code === 'duplicate-declaration' && /SupertypeGroup/.test(d.message)) ? null : 'expected duplicate-declaration',
    },
    {
      name: 'SG: a subtype listed twice, and a supertype listed as its own subtype, are reported',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
SupertypeGroup g [supertype: A] {
  B
  B
  A
}`,
      assert: (doc) => {
        const codes = resolveNames(doc).diagnostics.map((d) => d.code);
        return codes.includes('duplicate-subtype') && codes.includes('supertype-is-subtype') ? null : `got ${codes.join(', ')}`;
      },
    },
    {
      name: 'SG: an entity that is a subtype in two groups is reported',
      source: `xdbml: 0.5
Entity Party { }
Entity Worker { }
Entity Person { }
SupertypeGroup legal_nature [supertype: Party] {
  Person
}
SupertypeGroup workforce [supertype: Worker] {
  Person
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'subtype-in-multiple-groups');
        return hits.length === 1 ? null : `expected 1, got ${hits.length}`;
      },
    },
    {
      name: 'SG: one supertype may anchor several axes, and levels may stack',
      source: `xdbml: 0.5
Entity Party {
  party_id int [pk]
  name varchar
}
Entity Person {
  birth_date date
}
Entity Organization { }
Entity Customer { }
Entity Supplier { }
Entity Employee {
  hire_date date
}
SupertypeGroup legal_nature [supertype: Party, completeness: total, exclusivity: disjoint] {
  Person
  Organization
}
SupertypeGroup business_role [supertype: Party, completeness: partial, exclusivity: overlapping] {
  Customer
  Supplier
}
SupertypeGroup person_role [supertype: Person] {
  Employee
}`,
      assert: (doc) => {
        const r = resolveNames(doc);
        if (r.diagnostics.length > 0) return `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        const chains = supertypeChains(flatten(doc));
        const e = (chains.get('Employee') ?? []).join(',');
        return e === 'Person,Party' ? null : `Employee chain ${e}`;
      },
    },
    {
      name: 'SG: a cycle across levels is reported once',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
SupertypeGroup g1 [supertype: A] {
  B
}
SupertypeGroup g2 [supertype: B] {
  A
}`,
      assert: (doc) => {
        const n = resolveNames(doc).diagnostics.filter((d) => d.code === 'supertype-cycle').length;
        return n === 1 ? null : `expected 1 supertype-cycle, got ${n}`;
      },
    },
    {
      name: 'SG: redeclaring a supertype attribute is reported, at any level',
      source: `xdbml: 0.5
Entity Party {
  party_id int [pk]
  name varchar
}
Entity Person {
  name varchar
}
Entity Employee {
  party_id int
}
SupertypeGroup legal_nature [supertype: Party] {
  Person
}
SupertypeGroup person_role [supertype: Person] {
  Employee
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'supertype-attribute-redeclared');
        return hits.length === 2 ? null : `expected 2, got ${hits.length}: ${hits.map((d) => d.message).join(' | ')}`;
      },
    },
    {
      name: 'SG: redeclaration through a TablePartial is reported, on either side',
      source: `xdbml: 0.5
TablePartial audited {
  created_at timestamp
}
TablePartial named {
  name varchar
}
Entity Party {
  party_id int [pk]
  name varchar
  ~audited
}
Entity Person {
  ~named
}
Entity Organization {
  created_at timestamp
}
SupertypeGroup legal_nature [supertype: Party] {
  Person
  Organization
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'supertype-attribute-redeclared');
        if (hits.length !== 2) return `expected 2, got ${hits.length}: ${hits.map((d) => d.message).join(' | ')}`;
        return hits.some((d) => /through the partial 'named'/.test(d.message)) ? null : 'partial not named in message';
      },
    },
    {
      name: 'SG: a path through a subtype does not reach supertype attributes',
      source: `xdbml: 0.5
Entity Party {
  party_id int [pk]
  email varchar
}
Entity Person { }
Entity Assignment {
  person_email varchar
}
SupertypeGroup g [supertype: Party] {
  Person
}
Ref: Assignment.person_email > Person.email`,
      assert: (doc) => resolveNames(doc).diagnostics.some((d) => d.severity === 'error') ? null : 'expected an unresolved endpoint',
    },
    {
      name: 'SG: a relationship names a subtype as an entity-level endpoint',
      source: `xdbml: 0.5
Entity Party {
  party_id int [pk]
}
Entity Employee { }
Entity Assignment {
  assignment_id int [pk]
  employee_id int [not null]
}
SupertypeGroup g [supertype: Party] {
  Employee
}
Ref assigned: Assignment.employee_id > Employee [source: '0..*', target: '1..1']`,
      assert: (doc) => {
        const r = resolveNames(doc);
        return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
      },
    },
    {
      name: 'SG: discriminator is rejected on an overlapping group only',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
Entity C { }
Entity D { }
Entity E { }
Entity F { }
SupertypeGroup g1 [supertype: A, exclusivity: overlapping, discriminator: kind] {
  B
}
SupertypeGroup g2 [supertype: C, exclusivity: disjoint, discriminator: kind] {
  D
}
SupertypeGroup g3 [supertype: E, discriminator: kind] {
  F
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'discriminator-on-overlapping-group');
        return hits.length === 1 ? null : `expected 1, got ${hits.length}`;
      },
    },
    {
      name: 'SG: merge warns without roll-up, and is satisfied by a member roll-up',
      source: `xdbml: 0.5
Entity A { }
Entity B { }
Entity C { }
Entity D { }
SupertypeGroup g1 [supertype: A, merge: nested] {
  B
}
SupertypeGroup g2 [supertype: C, merge: flat] {
  D [strategy: roll_up]
}`,
      assert: (doc) => {
        const hits = resolveNames(doc).diagnostics.filter((d) => d.code === 'merge-without-roll-up');
        if (hits.length !== 1) return `expected 1, got ${hits.length}`;
        return hits[0].severity === 'warning' ? null : 'should be a warning';
      },
    },
    {
      name: 'SG: an empty group is a warning, not an error',
      source: `xdbml: 0.5
Entity A { }
SupertypeGroup g [supertype: A] { }`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        return d.length === 1 && d[0].code === 'empty-supertype-group' && d[0].severity === 'warning'
          ? null : `got ${d.map((x) => `${x.severity}:${x.code}`).join(', ')}`;
      },
    },
    {
      name: 'SG: the construct requires xdbml: 0.5',
      source: `xdbml: 0.4
Entity A { }
Entity B { }
SupertypeGroup g [supertype: A] {
  B
}`,
      assert: (doc) => resolveNames(doc).diagnostics.some((d) => d.code === 'construct-requires-version') ? null : 'expected construct-requires-version',
    },
    (() => {
      const files: Record<string, string> = {
        '/test/party.xdbml': `xdbml: 0.5
Entity Party {
  party_id int [pk]
}
Entity Person { }
SupertypeGroup legal_nature [supertype: Party, completeness: total] {
  Person
}`,
      };
      return {
        name: 'SG: a group imports with reuse { supertypegroup ... }',
        source: `xdbml: 0.5
reuse { entity Party, entity Person, supertypegroup legal_nature } from './party'`,
        options: {
          filePath: '/test/consumer.xdbml',
          readFile: (p: string) => {
            if (!(p in files)) throw new Error(`not found: ${p}`);
            return files[p];
          },
        },
        assert: (doc: XDbmlDocument) => {
          const flat = flatten(doc);
          if (!flat.statements.some((s) => s.kind === 'SupertypeGroupDeclaration' && s.name === 'legal_nature')) return 'group not imported';
          const r = resolveNames(doc);
          return r.diagnostics.length === 0 ? null : `expected clean, got ${r.diagnostics.map((d) => d.code).join(', ')}`;
        },
      };
    })(),
    {
      name: 'Version: xdbml 0.7 is accepted; a newer version is refused with unsupported-version',
      source: `xdbml: 0.7
Entity A { }`,
      assert: (doc) => {
        if (doc.version?.version !== '0.7') return 'version 0.7 not parsed';
        for (const v of ['0.8', '0.7.6', '1.0', '0.10']) {
          try {
            parse(`xdbml: ${v}\nEntity A { }`);
            return `xdbml: ${v} was accepted`;
          } catch (e) {
            if ((e as { code?: string }).code !== 'unsupported-version') return `xdbml: ${v}: wrong error ${(e as Error).message}`;
          }
        }
        return null;
      },
    },
    /* ---- v0.6 constraints (spec §10) and referenced keys (§11.17) ---- */
    {
      name: 'v0.6 §10.1: constraints block parses key lines and quoted, triple-quoted and backtick checks',
      source: `xdbml: 0.6
Table pitstops {
  raceid   int
  driverid int
  stop     int
  lap      int
  profile  object {
    email varchar
  }
  constraints {
    (raceid, driverid, stop) [pk, name: 'pk_pitstops']
    (raceid, driverid, lap)  [unique, name: 'uk_lap', note: 'one stop per lap']
    profile.email [unique]
    'stop >= 1' [name: 'chk_stop']
    \`lap IN (1, 2)\`
    '''stop < 100'''
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const block = e.body.find((b) => b.kind === 'ConstraintsBlock');
        if (!block || block.kind !== 'ConstraintsBlock') return 'no ConstraintsBlock';
        const got = block.entries.map((x) => x.kind === 'KeyConstraintEntry'
          ? `key:${x.fields.map((f) => f.map((seg) => (seg as { name: string }).name).join('.')).join(',')}:${x.parenthesized}:${x.settings.map((st) => st.name).join('+')}`
          : `check:${x.expression}:${x.delimiter}`);
        const want = ['key:raceid,driverid,stop:true:pk+name', 'key:raceid,driverid,lap:true:unique+name+note', 'key:profile.email:false:unique',
          'check:stop >= 1:quote', 'check:lap IN (1, 2):backtick', 'check:stop < 100:quote'];
        if (JSON.stringify(got) !== JSON.stringify(want)) return `got ${JSON.stringify(got)}`;
        const d = resolveNames(doc).diagnostics;
        return d.length === 0 ? null : `unexpected: ${d.map((x) => x.code + ': ' + x.message).join('; ')}`;
      },
    },
    {
      name: 'v0.6 §10.1: a field named constraints still parses',
      source: `xdbml: 0.6
Table rules {
  id          int [pk]
  constraints varchar
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const names = e.body.filter((b) => b.kind === 'FieldDeclaration').map((f) => (f as { name: string }).name);
        return JSON.stringify(names) === JSON.stringify(['id', 'constraints']) ? null : `fields: ${names}`;
      },
    },
    {
      name: 'v0.6 §29.6: entityConstraints gathers every form into keys and checks',
      source: `xdbml: 0.6
Table t {
  a int [pk]
  b int [pk]
  c varchar [unique, check: 'c <> \\'\\'']
  d varchar [unique, check: \`d > 0\`]
  constraints {
    (c, d) [unique, name: 'uk_cd']
    'a < b' [name: 'chk_ab']
  }
  checks {
    \`b > 0\`
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const got = entityConstraints(e, doc).map((c) => c.kind === 'key'
          ? `${c.keyKind}(${c.fields.join(',')})${c.name ? '=' + c.name : ''}@${c.source}`
          : `check[${c.expression}]${c.field ? '@' + c.field : ''}@${c.source}`);
        const want = ['primary(a,b)@inline', 'unique(c)@inline', "check[c <> '']@c@field-check", 'unique(d)@inline', 'check[d > 0]@d@field-check',
          'unique(c,d)=uk_cd@constraints', 'check[a < b]@constraints', 'check[b > 0]@checks'];
        return JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6 §10.4: primary key fields get an implied not null in 0.6 documents only',
      source: `xdbml: 0.6
Table t {
  a int
  b int [not null]
  c int
  constraints {
    (a, b) [pk]
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const flags = e.body.filter((b) => b.kind === 'FieldDeclaration').map((f) => {
          const st = (f as { settings: { name: string; implied?: boolean }[] }).settings;
          return st.map((x) => x.name + (x.implied ? '*' : '')).join('+');
        });
        if (JSON.stringify(flags) !== JSON.stringify(['not null*', 'not null', ''])) return `0.6: ${JSON.stringify(flags)}`;
        const old = parse('xdbml: 0.5\nTable t {\n  a int [pk]\n}');
        const f = (old.statements[0] as { body: { settings: unknown[] }[] }).body[0];
        return f.settings.length === 1 ? null : '0.5 document got an implied setting';
      },
    },
    {
      name: 'v0.6 §10.10: key-line, key-path, duplicate and null conditions',
      source: `xdbml: 0.6
Type Address {
  city varchar
}
Table t {
  id      int [pk, null]
  code    int
  tags    array [varchar]
  home    Address
  meta    object {
    lines array [object {
      n int
    }]
  }
  constraints {
    (id, code) [pk]
    code [pk, unique]
    code
    nosuch [unique]
    tags.x [unique]
    home.city [unique]
    meta.lines.n [unique]
  }
  constraints {
    code [unique]
  }
  indexes {
    missing_col
    code
  }
}`,
      assert: (doc) => {
        const codes = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`).sort();
        const want = ['duplicate-constraints-block:error', 'duplicate-primary-key:error', 'invalid-key-flags:error', 'invalid-key-flags:error',
          'key-path-crosses-collection:error', 'key-path-crosses-collection:error', 'null-in-primary-key:error', 'unresolved-index-field:error',
          'unresolved-key-field:error'].sort();
        return JSON.stringify(codes) === JSON.stringify(want) ? null : `got ${JSON.stringify(codes)}`;
      },
    },
    {
      name: 'v0.6 §10.10: in a v0.5 or DBML document the older-construct conditions are warnings',
      source: `xdbml: 0.5
Table t {
  id   int [pk, null]
  code int
  indexes {
    code [pk]
    missing_col
  }
}`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`).sort();
        const want = ['duplicate-primary-key:warning', 'null-in-primary-key:warning', 'unresolved-index-field:warning'];
        if (JSON.stringify(got) !== JSON.stringify(want)) return `0.5: ${JSON.stringify(got)}`;
        const dbml = resolveNames(parse('Table t {\n  id int [pk]\n  indexes {\n    nope\n  }\n}')).diagnostics.map((d) => `${d.code}:${d.severity}`);
        return JSON.stringify(dbml) === JSON.stringify(['unresolved-index-field:warning']) ? null : `DBML: ${JSON.stringify(dbml)}`;
      },
    },
    {
      name: 'v0.6 §10.10: the constraints block and quoted checks require xdbml 0.6',
      source: `xdbml: 0.5
Table t {
  id int
  constraints {
    id [pk]
  }
  checks {
    'id > 0'
  }
}`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => d.code);
        return JSON.stringify(got) === JSON.stringify(['construct-requires-version', 'construct-requires-version']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6 §10.9: a key line in checks { } is a parse error',
      source: `xdbml: 0.6
Table t {
  id int
  checks {
    id [pk]
  }
}`,
      expectError: true,
      assert: () => null,
    },
    {
      name: 'v0.6 §10.4: an entity key wins over an injected partial key; the partial key applies otherwise',
      source: `xdbml: 0.6
TablePartial audited {
  id int [pk]
  created_at timestamp
}
Table a {
  ~audited
  code varchar
  constraints {
    code [pk]
  }
}
Table b {
  ~audited
  name varchar
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        if (d.length) return `unexpected: ${d.map((x) => x.code).join(', ')}`;
        const [, a, b] = doc.statements as unknown as { body: never[] }[];
        const ka = primaryKey(a, doc)?.fields.join(',');
        const kb = primaryKey(b, doc)?.fields.join(',');
        return ka === 'code' && kb === 'id' ? null : `a=${ka} b=${kb}`;
      },
    },
    {
      name: 'v0.6 §11.17: a Ref to a non-key field of an entity with keys is an error; unique makes it valid',
      source: `xdbml: 0.6
Table customers {
  id    int [pk]
  email varchar
  code  varchar [unique]
}
Table orders {
  id int [pk]
  customer_email varchar
  customer_code  varchar [ref: > customers.code]
  customer_id    int [ref: > customers.email]
}
Ref fk_orders_customer: orders.customer_email > customers.email
Ref: customers.id < orders.id
Ref: orders.id - customers.email
Ref: orders.id <> customers.email`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`);
        const want = ['ref-target-not-key:error', 'ref-target-not-key:error'];
        return JSON.stringify(got) === JSON.stringify(want) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6 §11.17: composite keys match as sets; DBML unique indexes count',
      source: `xdbml: 0.6
Table merchants {
  id           int
  country_code char(2)
  alt_a        int
  alt_b        int
  constraints {
    (id, country_code) [pk]
  }
  indexes {
    (alt_a, alt_b) [unique]
  }
}
Table periods {
  merchant_id  int
  country_code char(2)
  a int
  b int
}
Ref: periods.(merchant_id, country_code) > merchants.(country_code, id)
Ref: periods.(a, b) > merchants.(alt_b, alt_a)
Ref: periods.(a, merchant_id) > merchants.(alt_a, id)`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => d.code);
        return JSON.stringify(got) === JSON.stringify(['ref-target-not-key']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6 §11.17: exemptions -- no key, foreign master, entity-level, non-relational target',
      source: `xdbml: 0.6
Project p {
  targets: [Oracle, MongoDB]
}
Container rel [type: schema, target: Oracle] {
  Table parent {
    id   int [pk]
    name varchar
  }
  Table nokey {
    name varchar
  }
  Table child {
    parent_name varchar
    other varchar
  }
}
Container docs [type: database, target: MongoDB] {
  Collection users {
    _id  objectId [pk]
    email string
  }
  Collection posts {
    author_email string
  }
}
Ref: rel.child.parent_name > rel.nokey.name
Ref: rel.child.other > rel.parent.name [foreign_master]
Ref: rel.child > rel.parent
Ref: docs.posts.author_email > docs.users.email
Ref: rel.child.parent_name > rel.parent.name`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => d.code);
        return JSON.stringify(got) === JSON.stringify(['ref-target-not-key']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6 §11.17: warning in DBML documents',
      source: `Table customers {
  id    int [pk]
  email varchar
}
Table orders {
  customer_email varchar
}
Ref: orders.customer_email > customers.email`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`);
        return JSON.stringify(got) === JSON.stringify(['ref-target-not-key:warning']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    // ---- v0.6.1: separators in list bodies (§3.9) ----
    {
      name: 'v0.6.1 §3.9: Enum values separated by commas, with notes',
      source: `Enum ServiceStatus {
  'scheduled' [note: 'Appointment booked'],
  'in_progress' [note: 'Currently being serviced'],
  'completed' [note: 'Service finished'],
  'on_hold' [note: 'Paused, awaiting parts or decision'],
  'cancelled' [note: 'Cancelled by customer or shop']
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EnumDeclaration') return 'expected enum';
        const names = e.values.map((v) => v.name);
        const want = ['scheduled', 'in_progress', 'completed', 'on_hold', 'cancelled'];
        if (JSON.stringify(names) !== JSON.stringify(want)) return `values: ${JSON.stringify(names)}`;
        return e.values[3].settings[0]?.value?.kind === 'StringValue' ? null : 'note of on_hold lost';
      },
    },
    {
      name: 'v0.6.1 §3.9: separators before, between and after items, any number, commas or semicolons',
      source: `Enum s { ,, a ;; b , c; }
Entity e { id int [pk], name varchar; age int, }`,
      assert: (doc) => {
        const [en, e] = doc.statements;
        if (en.kind !== 'EnumDeclaration' || e.kind !== 'EntityDeclaration') return 'expected enum and entity';
        const v = en.values.map((x) => x.name).join(',');
        const f = e.body.map((b) => (b as { name?: string }).name).join(',');
        return v === 'a,b,c' && f === 'id,name,age' ? null : `enum ${v}; entity ${f}`;
      },
    },
    {
      name: 'v0.6.1 §3.9: separators in View, Edge, TablePartial, Type, object, json, oneOf, constraints, checks, Project',
      source: `xdbml: 0.6
Project p { database_type: 'PostgreSQL', Note: 'demo', }
TablePartial audit { created_at timestamp, updated_at timestamp }
Type Amount { amount decimal(12,2), currency varchar }
Entity a { id int [pk] }
Entity b {
  id int, total Amount, ~audit,
  meta json { source varchar, tags varchar },
  payment oneOf { card object { last4 varchar, brand varchar }, cash object { change decimal } } [discriminator: kind],
  constraints { (id) [pk], 'id > 0' },
  checks { 'id < 100000'; },
}
Edge e [source: a, target: b] { since date, weight int }
View v { source_query: 'SELECT id FROM b', id int, }`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        if (d.length > 0) return `unexpected: ${d.map((x) => x.code + ': ' + x.message).join('; ')}`;
        const b = doc.statements.find((s) => s.kind === 'EntityDeclaration' && s.name === 'b') as EntityDeclaration;
        const kinds = b.body.map((x) => x.kind === 'FieldDeclaration' ? x.name : x.kind).join(',');
        return kinds === 'id,total,PartialInjection,meta,payment,ConstraintsBlock,ChecksBlock' ? null : kinds;
      },
    },
    {
      name: 'v0.6.1 §3.9: a comma between index entries is an error that names parentheses',
      source: `Table t {
  email varchar
  name  varchar
  indexes {
    email, name
  }
}`,
      expectError: true,
      assert: () => 'expected a parse error',
    },
    {
      name: 'v0.6.1 §3.9: the index error message points to a composite index',
      source: `Table t { email varchar }`,
      assert: () => {
        try {
          parse(`Table t {
  email varchar
  name  varchar
  indexes { email, name }
}`);
          return 'expected a parse error';
        } catch (e) {
          return /\(email, name\)/.test((e as Error).message) ? null : (e as Error).message;
        }
      },
    },
    {
      name: 'v0.6.1 §3.9: a separator inside an item is an error',
      source: `Table t { id, int }`,
      expectError: true,
      assert: () => 'expected a parse error',
    },
    {
      name: 'v0.6.1 §3.9: records rows still end with their line',
      source: `Table t {
  id int [pk], name varchar
  records {
    1, 'Ada',
    2, 'Grace'
  }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const r = e.body.find((b) => b.kind === 'RecordsBlock');
        if (!r || r.kind !== 'RecordsBlock') return 'no records block';
        return r.rows.length === 2 ? null : `rows: ${r.rows.length}`;
      },
    },
    // ---- v0.6.1: keywords as field names (§3.10) ----
    {
      name: 'v0.6.1 §3.10: fields named note, Note, indexes, checks, records beside a table note and blocks',
      source: `Table appointments {
  id      int [pk]
  note    varchar
  Note    varchar
  records int
  indexes varchar
  checks  varchar
  Note: 'One row per booked appointment'
  indexes { id }
}`,
      assert: (doc) => {
        const e = doc.statements[0];
        if (e.kind !== 'EntityDeclaration') return 'expected entity';
        const kinds = e.body.map((x) => x.kind === 'FieldDeclaration' ? x.name : x.kind).join(',');
        return kinds === 'id,note,Note,records,indexes,checks,NoteBlock,IndexesBlock' ? null : kinds;
      },
    },
    {
      name: 'v0.6.1 §3.10: a field named note in an Edge, a TablePartial, a Type, an object and a json schema',
      source: `Entity a { id int [pk] }
TablePartial p { note varchar }
Type T { note varchar }
Entity b { id int [pk]
  o object { note varchar }
  j json { note string }
}
Edge e [source: a, target: b] { note varchar }`,
      assert: (doc) => {
        const names: string[] = [];
        const walk = (items: ReadonlyArray<{ kind: string }>): void => {
          for (const it of items) {
            if (it.kind !== 'FieldDeclaration') continue;
            const f = it as unknown as { name: string; type: { kind: string; fields?: ReadonlyArray<{ kind: string }> } };
            names.push(f.name);
            if (f.type.fields) walk(f.type.fields);
          }
        };
        for (const st of doc.statements) walk((st as unknown as { body?: ReadonlyArray<{ kind: string }> }).body ?? []);
        return names.filter((n) => n === 'note').length === 5 ? null : `names: ${names.join(',')}`;
      },
    },
    {
      name: 'v0.6.1 §3.10: a View field named source_query or note',
      source: `View v {
  source_query: 'SELECT 1 AS source_query, 2 AS note'
  source_query varchar
  note varchar
}`,
      assert: (doc) => {
        const v = doc.statements[0];
        if (v.kind !== 'ViewDeclaration') return 'expected view';
        const kinds = v.body.map((x) => x.kind === 'FieldDeclaration' ? x.name : x.kind).join(',');
        return kinds === 'SourceQueryItem,source_query,note' ? null : kinds;
      },
    },
    // ---- v0.6.1: View source query and settings (§14) ----
    {
      name: 'v0.6.1 §14.2: materialized in the body is an error that names the brackets',
      source: `Entity e { id int [pk] }`,
      assert: () => {
        try {
          parse(`View monthly_revenue {
  materialized: true
  month date [pk]
}`);
          return 'expected a parse error';
        } catch (e) {
          const m = (e as Error).message;
          return m.includes('View monthly_revenue [materialized: ...]') ? null : m;
        }
      },
    },
    {
      name: 'v0.6.1: a setting in a Table body is an error that names the brackets',
      source: `Entity e { id int [pk] }`,
      assert: () => {
        try {
          parse(`Table users {
  headercolor: '#3498DB'
  id int [pk]
}`);
          return 'expected a parse error';
        } catch (e) {
          const m = (e as Error).message;
          return m.includes('Table users [headercolor: ...]') ? null : m;
        }
      },
    },
    {
      name: 'v0.6.1 §14.7: source_query in the brackets is a warning and not the source query',
      source: `xdbml: 0.6
View v [materialized: true, source_query: 'SELECT id FROM t'] { id int }`,
      assert: (doc) => {
        const v = doc.statements[0];
        if (v.kind !== 'ViewDeclaration') return 'expected view';
        if (viewSourceQuery(v) !== undefined) return 'bracketed query counted';
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`);
        return JSON.stringify(got) === JSON.stringify(['source-query-in-settings:warning']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6.1 §14.7: a second source query is a warning; the first one counts',
      source: `View v {
  source_query: 'SELECT 1'
  source_query: 'SELECT 2'
  id int
}`,
      assert: (doc) => {
        const v = doc.statements[0];
        if (v.kind !== 'ViewDeclaration') return 'expected view';
        if (viewSourceQuery(v)?.query !== 'SELECT 1') return `source query: ${viewSourceQuery(v)?.query}`;
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`);
        return JSON.stringify(got) === JSON.stringify(['duplicate-source-query:warning']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6.1 §14.7: the View warnings reach Views inside a Container',
      source: `Container dw [type: schema] {
  View v [source_query: 'SELECT 1'] { id int }
}`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => d.code);
        return JSON.stringify(got) === JSON.stringify(['source-query-in-settings']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    // ---- v0.6.1: version declaration with a patch number (§4) ----
    // ---- v0.6.1: a key declared twice (§10.3, §10.4) ----
    {
      name: 'v0.6.1 §10.4: a primary key restated in constraints names both declarations',
      source: `xdbml: 0.6
Table customers {
  customer_id int [pk, increment]
  constraints {
    (customer_id) [pk]
  }
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        const want = "'customers' declares its primary key (customer_id) twice: [pk] on customer_id and a pk line in constraints. Declare it in one place (spec §10.4).";
        return d.length === 1 && d[0].code === 'duplicate-primary-key' && d[0].severity === 'error' && d[0].message === want
          ? null : `got ${JSON.stringify(d.map((x) => [x.code, x.severity, x.message]))}`;
      },
    },
    {
      name: 'v0.6.1 §10.4: a primary key on other fields is still a second primary key',
      source: `xdbml: 0.6
Table t {
  a int [pk]
  b int
  constraints { b [pk] }
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        return d.length === 1 && d[0].message.includes('declares a second primary key') ? null : `got ${JSON.stringify(d.map((x) => x.message))}`;
      },
    },
    {
      name: 'v0.6.1 §10.3: a unique key restated in constraints is a warning',
      source: `xdbml: 0.6
Table t {
  id    int [pk]
  email varchar [unique]
  constraints { email [unique, name: 'uk_email'] }
}`,
      assert: (doc) => {
        const got = resolveNames(doc).diagnostics.map((d) => `${d.code}:${d.severity}`);
        return JSON.stringify(got) === JSON.stringify(['duplicate-unique-key:warning']) ? null : `got ${JSON.stringify(got)}`;
      },
    },
    {
      name: 'v0.6.1 §10.3: the same fields in another order are the same unique key',
      source: `xdbml: 0.6
Table t {
  id int [pk]
  a  int
  b  int
  constraints {
    (a, b) [unique]
    (b, a) [unique]
  }
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        return d.length === 1 && d[0].code === 'duplicate-unique-key' && d[0].message.includes('two unique lines in constraints')
          ? null : `got ${JSON.stringify(d.map((x) => x.message))}`;
      },
    },
    {
      name: 'v0.6.1 §10.3: distinct unique keys and a DBML unique index draw no warning',
      source: `Table t {
  id    int [pk]
  a     int [unique]
  b     int [unique]
  email varchar [unique]
  indexes { email [unique] }
}`,
      assert: (doc) => {
        const d = resolveNames(doc).diagnostics;
        return d.length === 0 ? null : `got ${JSON.stringify(d.map((x) => x.code))}`;
      },
    },
    {
      name: 'v0.6.1 §4: xdbml: 0.6.1 parses and keeps its patch number',
      source: `xdbml: 0.6.1
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.6.1' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.1 §4: xdbml: 0.7.1 parses and keeps its patch number',
      source: `xdbml: 0.7.1
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.7.1' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.2 §4: xdbml: 0.7.2 parses and keeps its patch number',
      source: `xdbml: 0.7.2
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.7.2' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.3 §4: xdbml: 0.7.3 parses and keeps its patch number',
      source: `xdbml: 0.7.3
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.7.3' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.4 §4: xdbml: 0.7.4 parses and keeps its patch number',
      source: `xdbml: 0.7.4
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.7.4' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.5 §4: xdbml: 0.7.5 parses and keeps its patch number',
      source: `xdbml: 0.7.5
Entity e { id int [pk] }`,
      assert: (doc) => (doc.version?.version === '0.7.5' ? null : `version: ${doc.version?.version}`),
    },
    {
      name: 'v0.7.5 §4: xdbml: 0.7.6 is newer than this parser supports',
      source: `xdbml: 0.7.6
Entity e { id int [pk] }`,
      expectError: true,
      assert: () => 'expected unsupported-version',
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

  // Target-native types: highlighting only. Each parses as a scalar
  // field type and resolves with no diagnostic; none duplicates a
  // built-in or any other keyword array; Monarch colors them as `type`.
  {
    const fields = TARGET_NATIVE_TYPES.map((t, i) => `  f${i} ${t}`).join('\n');
    const err = tryParse(`xdbml: 0.5\nTable t {\n${fields}\n}\n`, (doc) => {
      const d = doc.statements[0];
      if (!d || d.kind !== 'EntityDeclaration') return `expected EntityDeclaration, got ${d?.kind ?? 'none'}`;
      const types = d.body.filter((b) => b.kind === 'FieldDeclaration').map((b) => (b as { type: { kind: string; name?: string } }).type);
      const wrong = types.filter((t, i) => t.kind !== 'ScalarType' || t.name !== TARGET_NATIVE_TYPES[i]);
      if (wrong.length > 0) return `not parsed as ScalarType: ${wrong.map((t) => t.name ?? t.kind).join(', ')}`;
      const diags = resolveNames(doc).diagnostics;
      return diags.length === 0 ? null : `unexpected diagnostics: ${diags.map((x) => x.message).join('; ')}`;
    });
    results.push(err === null
      ? ok(`Target-native types: all ${TARGET_NATIVE_TYPES.length} parse as scalar types and resolve cleanly`)
      : fail('Target-native types: parse and resolve', err));
  }
  {
    const overlaps: string[] = [];
    const seen = new Set<string>();
    for (const t of TARGET_NATIVE_TYPES) {
      if (seen.has(t)) overlaps.push(`${t} listed twice`);
      seen.add(t);
      if (t !== t.toLowerCase()) overlaps.push(`${t} is not lower-case`);
    }
    for (const [arrayName, arr] of Object.entries(keywordArrays)) {
      if (arrayName === 'TARGET_NATIVE_TYPES' || !Array.isArray(arr)) continue;
      const lower = (arr as readonly string[]).map((x) => x.toLowerCase());
      for (const t of TARGET_NATIVE_TYPES) {
        if (lower.includes(t)) overlaps.push(`${t} also in ${arrayName}`);
      }
    }
    results.push(overlaps.length === 0
      ? ok('Target-native types: no duplicate and no overlap with SCALAR_TYPES, BSON_TYPES or other keyword arrays')
      : fail('Target-native types: no duplicate or overlap', overlaps.join('; ')));
  }
  {
    const lang = xdbmlMonarchTokensProvider;
    const missing = TARGET_NATIVE_TYPES.filter((t) => !lang.nativeTypes.includes(t));
    const builtinsIntact = SCALAR_TYPES.every((t) => lang.scalarTypes.includes(t)) && BSON_TYPES.every((t) => lang.bsonTypes.includes(t));
    results.push(missing.length === 0 && builtinsIntact
      ? ok('Target-native types: Monarch nativeTypes carries the full list')
      : fail('Target-native types: Monarch nativeTypes', `missing: ${missing.join(', ')}; builtins intact: ${builtinsIntact}`));
  }
  {
    // Not built-ins: a Named Type may take a target-native name and
    // still resolve, including through a Ref path into its fields.
    const err = tryParse(`xdbml: 0.5
Type Geography {
  country varchar
}
Entity sites {
  id int [pk]
  region Geography
}
Entity countries { code varchar [pk] }
Ref: sites.region.country > countries.code
`, (doc) => {
      const diags = resolveNames(doc).diagnostics;
      return diags.length === 0 ? null : `unexpected diagnostics: ${diags.map((x) => x.code + ': ' + x.message).join('; ')}`;
    });
    results.push(err === null
      ? ok('Target-native types: a Named Type called Geography still resolves (no shadowing)')
      : fail('Target-native types: Named Type called Geography', err));
  }

  {
    // Spec §3.10 (v0.6.1): Monarch colors `note` as an identifier where it
    // names a field, and leaves the keyword rules to color it elsewhere.
    const rule = (xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>)
      .find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('note(?!'));
    const re = rule ? new RegExp(rule[0].source, 'i') : null;
    const asField = ['note varchar', 'Note varchar [not null]', 'note    int', "note varchar [note: 'x']"];
    const asKeyword = ['Note: \'x\'', 'Note { \'x\' }', 'note:', 'Note schema_notes {', 'notes varchar',
      'Note legend [color: #F4D03F] {', 'Note core.legend {', 'Note "Release plan" [color: none] {', "Note legend: 'x'"];
    const bad = re === null
      ? ['rule missing']
      : [
        ...asField.filter((t) => !re.test(t)).map((t) => `not an identifier: ${t}`),
        ...asKeyword.filter((t) => re.test(t) && !t.startsWith('notes')).map((t) => `identifier: ${t}`),
        ...(re.exec('notes varchar')?.index === 0 ? ['matches inside notes'] : []),
      ];
    results.push(bad.length === 0
      ? ok('v0.6.1 §3.10: Monarch colors a field named note as an identifier, and Note: or Note { as a keyword')
      : fail('v0.6.1 §3.10: Monarch note rule', bad.join('; ')));
  }

  return results;
}




/* -------------------------------------------------------------------------
 * v0.6.2: DBML forms the parser rejected or misread, and spec rules it did
 * not enforce (§3.3, §5.2, §7.4, §8.1, §15.5)
 * ----------------------------------------------------------------------- */

function runV062Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string[] =>
    resolveNames062(parse062(src)).diagnostics.map((d) => `${d.severity}:${d.code}`);

  check('v0.6.2 §3.3: an unquoted hex color reads as a string, in a document with or without a version', () => {
    for (const head of ['xdbml: 0.6\n', '']) {
      const doc = parse062(`${head}Table t [headercolor: #3498DB] { id int [pk] }\nTableGroup g [color: #345] { t }`);
      const t = doc.statements[0] as EntityDeclaration;
      const v = t.settings[0].value as { kind: string; value: string };
      if (v.kind !== 'StringValue' || v.value !== '#3498DB') return `got ${JSON.stringify(v)}`;
      if (codes(`${head}Table t [headercolor: #3498DB] { id int [pk] }`).length) return 'diagnostics';
    }
    return undefined;
  });
  check('v0.6.2 §3.3: # with other than three or six hex digits stays a lex error', () => {
    try { parse062('xdbml: 0.6\nTable t [headercolor: #34] { id int [pk] }'); } catch { return undefined; }
    return 'no error';
  });
  check('v0.6.2 §7.4: a relationship names an entity by its alias, inline and in a Ref', () => {
    const src = 'xdbml: 0.6\nTable very_long as V { id int [pk] }\nTable o {\n id int [pk]\n v_id int [ref: > V.id]\n v2 int\n}\nRef: o.v2 > V.id';
    const doc = parse062(src);
    if ((doc.statements[0] as EntityDeclaration).alias !== 'V') return 'alias lost';
    const found = codes(src);
    return found.length ? found.join(', ') : undefined;
  });
  check('v0.6.2 §7.4: the key rule applies through an alias', () => {
    const found = codes('xdbml: 0.6\nTable very_long as V {\n id int [pk]\n x int\n}\nTable o {\n id int [pk]\n vx int\n}\nRef: o.vx > V.x');
    return found.includes('error:ref-target-not-key') ? undefined : found.join(', ');
  });
  check('v0.6.2 §7.4: an alias that repeats an entity name leaves the entity in place', () => {
    const doc = parse062('xdbml: 0.6\nTable a as b { id int [pk] }\nTable b { id int [pk] }\nTable o {\n id int [pk]\n b_id int\n}\nRef: o.b_id > b.id');
    const ref = doc.statements[3] as unknown as { spec: { target: { path: { name: string }[] } } };
    const first = ref.spec?.target?.path?.[0]?.name;
    return first === 'b' ? undefined : `endpoint rewritten to ${first}`;
  });
  check('v0.6.2 §8.1: empty brackets right after a type name belong to it', () => {
    const doc = parse062('xdbml: 0.6\nTable t {\n id int [pk]\n a text[]\n b varchar(20)[]\n c int[][]\n d int []\n e int [not null]\n}');
    const got = (doc.statements[0] as EntityDeclaration).body
      .map((f) => {
        const t = (f as { type?: { name: string; params?: string[] } }).type;
        return t ? `${t.name}${t.params ? `(${t.params.join(',')})` : ''}` : '';
      })
      .join(' ');
    return got === 'int text[] varchar[](20) int[][] int int' ? undefined : got;
  });
  check('v0.6.2 §15.5: a Type and an Entity with one name collide; an error from v0.6, a warning before', () => {
    const v06 = codes('xdbml: 0.6\nType customers { a int }\nTable customers { id int [pk] }');
    const v05 = codes('xdbml: 0.5\nType customers { a int }\nTable customers { id int [pk] }');
    const dbml = codes('enum status {\n a\n b\n}\nTable status { id int [pk] }');
    if (!v06.includes('error:name-collision')) return `0.6: ${v06}`;
    if (!v05.includes('warning:name-collision')) return `0.5: ${v05}`;
    if (!dbml.includes('warning:name-collision')) return `DBML: ${dbml}`;
    return undefined;
  });
  check('v0.6.2 §15.5: entities with one name in two containers do not collide', () => {
    const found = codes('xdbml: 0.6\nSchema a { Table orders { id int [pk] } }\nSchema b { Table orders { id int [pk] } }');
    return found.length ? found.join(', ') : undefined;
  });
  check('v0.6.2 §5.2: with several targets, a Container without one is an error', () => {
    const found = codes('xdbml: 0.6\nProject p { targets: [PostgreSQL, MongoDB] }\nSchema core { Table t { id int [pk] } }');
    return found.includes('error:container-target-missing') ? undefined : found.join(', ');
  });
  check('v0.6.2 §5.2: a Container target outside the Project targets is an error; aliases compare as their canonical name', () => {
    const bad = codes('xdbml: 0.6\nProject p { targets: [PostgreSQL] }\nSchema core [target: Oracle] { Table t { id int [pk] } }');
    const good = codes('xdbml: 0.6\nProject p { targets: [PostgreSQL, Mongo] }\nSchema core [target: postgres] { Table t { id int [pk] } }\nDatabase d [target: MongoDB] { Collection c { _id objectId [pk] } }');
    if (!bad.includes('error:container-target-not-in-project')) return `bad: ${bad}`;
    return good.length ? `good: ${good}` : undefined;
  });
  check('v0.6.2 §5.2: no Project targets, one inherited target, or an earlier version do not raise an error', () => {
    const none = codes('xdbml: 0.6\nDatabase shop [target: MongoDB] { Collection c { _id objectId [pk] } }');
    const single = codes('xdbml: 0.6\nProject p { targets: PostgreSQL }\nSchema core { Table t { id int [pk] } }');
    const older = codes('xdbml: 0.5\nProject p { targets: [PostgreSQL, MongoDB] }\nSchema core { Table t { id int [pk] } }');
    if (none.length || single.length) return `${none} / ${single}`;
    return older.includes('warning:container-target-missing') ? undefined : `0.5: ${older}`;
  });
  return results;
}

/* -------------------------------------------------------------------------
 * v0.6.3: diagram views (spec §18)
 * ----------------------------------------------------------------------- */

function runV063Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string[] =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`);
  const members = (src: string, name: string): string => {
    const m = diagramViewMembers(parse(src), name);
    if (!m) return 'none';
    return [
      `E=${m.entities.join(',')}`, `V=${m.views.join(',')}`, `C=${m.containers.join(',')}`,
      `G=${m.tableGroups.join(',')}`, `S=${m.supertypeGroups.join(',')}`, `N=${m.notes.join(',')}`,
    ].join(' ');
  };
  const parseError = (src: string): string => {
    try { parse(src); } catch (e) { return e instanceof Error ? e.message : String(e); }
    return '';
  };

  const MODEL = `xdbml: 0.6
Schema sales {
  Table orders      { id int [pk] }
  Table order_lines { id int [pk] }
  Table returns     { id int [pk] }
  View revenue [materialized: true] {
    source_query: 'SELECT 1 AS total'
    total int
  }
}
Schema billing {
  Table invoices { id int [pk] }
  Table payments { id int [pk] }
}
Schema crm {
  Table customers { id int [pk] }
  Table leads     { id int [pk] }
}
Note states { 'An order moves from placed to shipped.' }
`;

  check('v0.6.3 §18.1: a DiagramView parses, with Schemas read as Containers and keywords in any case', () => {
    const doc = parse(`${MODEL}DiagramView v {\n  schemas { sales }\n  TABLES { sales.orders, crm.customers; }\n  Notes { * }\n}`);
    const v = doc.statements.find((x) => x.kind === 'DiagramViewDeclaration');
    if (!v || v.kind !== 'DiagramViewDeclaration') return 'no DiagramViewDeclaration';
    const got = v.categories.map((c) => `${c.keyword}->${c.category}${c.wildcard ? '*' : ''}:${c.items.map((i) => i.name).join('+')}`).join(' ');
    return got === 'schemas->Containers:sales TABLES->Tables:sales.orders+crm.customers Notes->Notes*:' ? undefined : got;
  });
  check('v0.6.3 §18.1: a quoted name and a body-level * parse; the body-level * lists every category', () => {
    const doc = parse('Table a { id int [pk] }\nDiagramView "Sales team" { * }');
    const v = diagramViews(doc)[0];
    if (!v || v.name !== 'Sales team' || !v.wildcardBody) return JSON.stringify(v);
    return members('Table a { id int [pk] }\nTable b { id int [pk] }\nDiagramView all { * }', 'all') === 'E=a,b V= C= G= S= N=' ? undefined : members('Table a { id int [pk] }\nTable b { id int [pk] }\nDiagramView all { * }', 'all');
  });
  check('v0.6.3 §18.1: Edges, an unknown category, a DiagramView in a Container and * beside a body-level * fail the parse', () => {
    const edges = parseError('xdbml: 0.6\nTable a { id int [pk] }\nDiagramView v { Edges { * } }');
    const unknown = parseError('xdbml: 0.6\nDiagramView v { Things { a } }');
    const inContainer = parseError('xdbml: 0.6\nSchema s { Table a { id int [pk] }\n DiagramView v { Tables { a } } }');
    const star = parseError('xdbml: 0.6\nDiagramView v { * Tables { a } }');
    const problems: string[] = [];
    if (!edges.includes('Edges is not a DiagramView category')) problems.push(`edges: ${edges}`);
    if (!unknown.includes('Unknown DiagramView category')) problems.push(`unknown: ${unknown}`);
    if (!inContainer.includes('top-level declaration')) problems.push(`container: ${inContainer}`);
    if (!star.includes("A '*' body")) problems.push(`star: ${star}`);
    return problems.length ? problems.join('; ') : undefined;
  });
  check('v0.6.3 §18.2: a listed Container is narrowed by its entities under Tables, Container by Container', () => {
    const got = members(`${MODEL}DiagramView v {\n Containers { sales billing }\n Tables { sales.orders sales.order_lines crm.customers }\n}`, 'v');
    return got === 'E=sales.orders,sales.order_lines,billing.invoices,billing.payments,crm.customers V=sales.revenue C=sales,billing,crm G= S= N='
      ? undefined : got;
  });
  check('v0.6.3 §18.2: Views narrows the database views of a listed Container separately from Tables', () => {
    const got = members(`${MODEL}DiagramView v {\n Containers { sales }\n Views { sales.revenue }\n}`, 'v');
    return got === 'E=sales.orders,sales.order_lines,sales.returns V=sales.revenue C=sales G= S= N=' ? undefined : got;
  });
  check('v0.6.3 §18.2: an omitted or empty category lists nothing; an empty body is an empty diagram view', () => {
    const a = members(`${MODEL}DiagramView v { Tables { crm.leads } Notes { } }`, 'v');
    const b = members(`${MODEL}DiagramView v { }`, 'v');
    if (a !== 'E=crm.leads V= C=crm G= S= N=') return `a: ${a}`;
    return b === 'E= V= C= G= S= N=' ? undefined : `b: ${b}`;
  });
  check('v0.6.3 §18.2: TableGroups and SupertypeGroups contribute all their members, whatever narrows their Container', () => {
    const src = `xdbml: 0.6
Schema crm {
  Table party        { id int [pk] }
  Table person       { birth_date date }
  Table organization { vat varchar }
  Table customers    { id int [pk] }
  Table leads        { id int [pk] }
}
SupertypeGroup legal_nature [supertype: crm.party] {
  crm.person
  crm.organization
}
TableGroup prospects { crm.leads }
DiagramView v {
  Containers { crm }
  Tables { crm.customers }
  SupertypeGroups { legal_nature }
  TableGroups { prospects }
}`;
    const got = members(src, 'v');
    return got === 'E=crm.party,crm.person,crm.organization,crm.customers,crm.leads V= C=crm G=prospects S=legal_nature N='
      ? undefined : got;
  });
  check('v0.6.3 §18.4: a TableGroup frame and a supertype group symbol follow the members, named or not', () => {
    const src = `xdbml: 0.6
Table party  { id int [pk] }
Table person { birth date }
Table firm   { vat varchar }
SupertypeGroup kinds [supertype: party] { person firm }
TableGroup people { party person }
DiagramView v { Tables { party person } }
DiagramView w { Tables { party } }`;
    const v = members(src, 'v');
    const w = members(src, 'w');
    if (v !== 'E=party,person V= C= G=people S=kinds N=') return `v: ${v}`;
    return w === 'E=party V= C= G=people S= N=' ? undefined : `w: ${w}`;
  });
  check('v0.6.3 §18.3: an unqualified name prefers the element outside any Container, then the one inside a Container', () => {
    const top = members('Table users { id int [pk] }\nTable core.users { id int [pk] }\nDiagramView v { Tables { users } }', 'v');
    const one = members('xdbml: 0.6\nSchema a { Table users { id int [pk] } }\nDiagramView v { Tables { users } }', 'v');
    if (top !== 'E=users V= C= G= S= N=') return `top: ${top}`;
    return one === 'E=a.users V= C=a G= S= N=' ? undefined : `one: ${one}`;
  });
  check('v0.6.3 §18.3: Table core.users is in the implicit Container core, listed by Containers or Schemas', () => {
    const got = members('Table core.users { id int [pk] }\nTable core.roles { id int [pk] }\nTable other { id int [pk] }\nDiagramView v { Schemas { core } }', 'v');
    return got === 'E=core.users,core.roles V= C=core G= S= N=' ? undefined : got;
  });
  check('v0.6.3 §18.3: an alias names its entity under Tables; an alias that repeats a name does not', () => {
    const aliased = members('Table very_long_users as U { id int [pk] }\nDiagramView v { Tables { U } }', 'v');
    if (aliased !== 'E=very_long_users V= C= G= S= N=') return `aliased: ${aliased}`;
    const shadow = codes('xdbml: 0.6\nTable a as b { id int [pk] }\nTable b { id int [pk] }\nDiagramView v { Tables { b } }');
    const shadowMembers = members('xdbml: 0.6\nTable a as b { id int [pk] }\nTable b { id int [pk] }\nDiagramView v { Tables { b } }', 'v');
    return shadow.length === 0 && shadowMembers === 'E=b V= C= G= S= N=' ? undefined : `${shadow} ${shadowMembers}`;
  });
  check('v0.6.3 §18.6: unknown, ambiguous and wrong-category names are errors', () => {
    const found = codes(`xdbml: 0.6
Schema a { Table orders { id int [pk] } }
Schema b { Table orders { id int [pk] } }
View revenue [materialized: true] { source_query: 'SELECT 1 AS t'
 t int }
Edge e [source: a.orders, target: b.orders] { }
DiagramView v {
  Tables { order orders revenue e }
  Notes { a }
}`).join(' ');
    const want = ['error:unresolved-diagram-view-name', 'error:ambiguous-diagram-view-name', 'error:diagram-view-wrong-category'];
    const wrong = found.split(' ').filter((c) => c === 'error:diagram-view-wrong-category').length;
    return want.every((w) => found.includes(w)) && wrong === 3 ? undefined : found;
  });
  check('v0.6.3 §18.6: messages name the right category and the qualified candidates', () => {
    const d = resolveNames(parse(`xdbml: 0.6
Schema a { Table orders { id int [pk] } }
Schema b { Table orders { id int [pk] } }
View revenue [materialized: true] { source_query: 'SELECT 1 AS t'
 t int }
DiagramView v { Tables { orders revenue } }`)).diagnostics.map((x) => x.message).join(' | ');
    return d.includes("'a.orders' and 'b.orders'") && d.includes('list it under Views') ? undefined : d;
  });
  check('v0.6.3 §18.6: a category twice is an error, and a warning without a version declaration; two diagram views with one name are an error', () => {
    const declared = codes('xdbml: 0.6\nSchema s { Table a { id int [pk] } }\nDiagramView v { Schemas { s } Containers { s } }');
    const dbml = codes('Table a { id int [pk] }\nTable b { id int [pk] }\nDiagramView v { Tables { a } Tables { b } }');
    const dbmlMembers = members('Table a { id int [pk] }\nTable b { id int [pk] }\nDiagramView v { Tables { a } Tables { b } }', 'v');
    const dup = codes('xdbml: 0.6\nTable a { id int [pk] }\nDiagramView v { Tables { a } }\nDiagramView v { Tables { a } }');
    if (declared.join() !== 'error:duplicate-diagram-view-category') return `declared: ${declared}`;
    if (dbml.join() !== 'warning:duplicate-diagram-view-category') return `dbml: ${dbml}`;
    if (dbmlMembers !== 'E=a,b V= C= G= S= N=') return `lists do not combine: ${dbmlMembers}`;
    return dup.join() === 'error:duplicate-diagram-view' ? undefined : `dup: ${dup}`;
  });
  check('v0.6.3 §18.5: Containers, Views and SupertypeGroups need a version declaration; Schemas does not', () => {
    const ext = codes('Table core.users { id int [pk] }\nDiagramView v { Containers { core } Views { * } SupertypeGroups { * } }');
    const dbml = codes('Table core.users { id int [pk] }\nDiagramView v { Schemas { core } Tables { * } Notes { * } TableGroups { * } }');
    const n = ext.filter((c) => c === 'error:construct-requires-version').length;
    if (n !== 3) return `ext: ${ext}`;
    return dbml.length === 0 ? undefined : `dbml: ${dbml}`;
  });
  check('v0.6.3 §28: reuse { diagramview X } imports the diagram view, not a database view named X', () => {
    const files: Record<string, string> = {
      '/w/a.xdbml': `xdbml: 0.6
Table orders { id int [pk] }
View reports [materialized: true] { source_query: 'SELECT 1 AS t'
 t int }
DiagramView reports { Tables { orders } }`,
      '/w/main.xdbml': "xdbml: 0.6\nTable orders { id int [pk] }\nreuse { diagramview reports } from './a'",
    };
    const opts: ParseOptions = { filePath: '/w/main.xdbml', readFile: (p: string) => { if (!(p in files)) throw new Error(`no ${p}`); return files[p]; } } as ParseOptions;
    const doc = parse(files['/w/main.xdbml'], opts);
    const kinds = flatten(doc).statements.map((x) => x.kind).join(',');
    if (kinds !== 'EntityDeclaration,DiagramViewDeclaration') return kinds;
    const got = diagramViewMembers(doc, 'reports')?.entities.join();
    return got === 'orders' ? undefined : `members: ${got}`;
  });
  check('v0.6.3 §28.5: a diagramview import in a Container body fails; a reuse * in a Container body moves a DiagramView to the top level', () => {
    const files: Record<string, string> = {
      '/w/a.xdbml': 'xdbml: 0.6\nTable orders { id int [pk] }\nDiagramView o { Tables { orders } }',
      '/w/bad.xdbml': "xdbml: 0.6\nSchema s {\n reuse { diagramview o } from './a'\n}",
      '/w/star.xdbml': "xdbml: 0.6\nSchema s {\n reuse * from './a'\n}",
    };
    const opts = (f: string): ParseOptions => ({ filePath: f, readFile: (p: string) => files[p] } as ParseOptions);
    let badMsg = '';
    try { parse(files['/w/bad.xdbml'], opts('/w/bad.xdbml')); } catch (e) { badMsg = (e as Error).message; }
    if (!badMsg.includes('import it at file scope')) return `bad: ${badMsg}`;
    const flat = flatten(parse(files['/w/star.xdbml'], opts('/w/star.xdbml')));
    const kinds = flat.statements.map((x) => x.kind).join(',');
    const inBody = flat.statements.some((x) => x.kind === 'ContainerDeclaration' && x.body.some((b) => (b as { kind: string }).kind === 'DiagramViewDeclaration'));
    return kinds === 'ContainerDeclaration,DiagramViewDeclaration' && !inBody ? undefined : kinds;
  });
  check('v0.6.3 §4.1: the parser reads xdbml: 0.6.3 and refuses a later patch it does not know', () => {
    parse('xdbml: 0.6.3\nTable a { id int [pk] }');
    try { parse('xdbml: 0.7.99\nTable a { id int [pk] }'); } catch { return undefined; }
    return '0.7.99 accepted';
  });
  check('v0.6.3: Monarch colors a category keyword before { only', () => {
    const rule = (xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>)
      .find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('(?:entities'));
    if (!rule) return 'rule missing';
    const re = new RegExp(`^(?:${rule[0].source})`, 'i');
    const yes = ['Tables {', 'schemas{', 'SupertypeGroups  {', 'Notes { *', 'Entities {', 'EntityGroups{'];
    const no = ['tables varchar', 'notes int', 'Tablesx {', 'views object', 'entities int', 'entitygroups varchar'];
    const bad = [...yes.filter((t) => !re.test(t)), ...no.filter((t) => re.test(t))];
    return bad.length ? bad.join('; ') : undefined;
  });
  check('v0.6.3 §18.1: a diagram view takes a note in its brackets or its body; the body note wins', () => {
    const doc = parse(`xdbml: 0.6
Table a { id int [pk] }
DiagramView b1 [note: 'In brackets', x_owner: 'data-team'] { Tables { a } }
DiagramView b2 {
  Note: 'In the body'
  Tables { a }
}
DiagramView b3 [note: 'Brackets'] {
  Note { 'Body block' }
  Tables { a }
}
DiagramView b4 { Note: 'Beside a star' * }
DiagramView b5 { Tables { a } }`);
    const notes = diagramViews(doc).map((v) => `${v.name}=${diagramViewNote(v) ?? '-'}`).join(' ');
    if (notes !== 'b1=In brackets b2=In the body b3=Body block b4=Beside a star b5=-') return notes;
    const found = resolveNames(doc).diagnostics.map((d) => d.code);
    return found.length ? found.join(', ') : undefined;
  });
  check('v0.6.3 §18.6: a note or settings need a version declaration (any key is a custom property from v0.7.1)', () => {
    const any = codes('xdbml: 0.6\nTable a { id int [pk] }\nDiagramView v [color: \'#fff\'] { Tables { a } }');
    if (any.length) return `custom property: ${any}`;
    const dbmlNote = codes("Table a { id int [pk] }\nDiagramView v {\n Note: 'x'\n Tables { a }\n}");
    const dbmlSetting = codes("Table a { id int [pk] }\nDiagramView v [note: 'x'] { Tables { a } }");
    if (dbmlNote.join() !== 'error:construct-requires-version') return `dbml note: ${dbmlNote}`;
    return dbmlSetting.join() === 'error:construct-requires-version' ? undefined : `dbml setting: ${dbmlSetting}`;
  });
  check('v0.6.4 §28.2: import items one per line, with or without commas or semicolons', () => {
    const files: Record<string, string> = {
      '/w/lib.xdbml': 'xdbml: 0.6\nEntity a { id int [pk] }\nEntity b { id int [pk] }\nType T string',
      '/w/m1.xdbml': "xdbml: 0.6\nreuse {\n  entity a\n  entity b as bb\n  type T\n} from './lib'",
      '/w/m2.xdbml': "xdbml: 0.6\nreuse { entity a; entity b as bb, type T, } from './lib'",
    };
    const opts = (f: string) => ({ filePath: f, readFile: (p: string) => files[p] } as ParseOptions);
    const names = (f: string) => flatten(parse(files[f], opts(f))).statements.map((x) => (x as { name?: string }).name).join(',');
    const a = names('/w/m1.xdbml');
    const b = names('/w/m2.xdbml');
    return a === 'a,bb,T' && b === a ? undefined : `${a} / ${b}`;
  });
  check('v0.6.4 §8.6: tuple positions run from [0] without a gap, each once; any order', () => {
    const c = (t: string) => codes(`xdbml: 0.6\nEntity e { t array [ ${t} ] }`).join();
    const bad = ['[0] x int, [2] y int', '[1] x int, [2] y int', '[0] x int, [0] y int'].filter((t) => c(t) !== 'error:invalid-tuple-positions');
    const good = ['[0] x int, [1] y int', '[1] y int, [0] x int'].filter((t) => c(t) !== '');
    const old = codes('xdbml: 0.5\nEntity e { t array [ [0] x int, [2] y int ] }').join();
    if (old !== 'warning:invalid-tuple-positions') return `0.5: ${old}`;
    return bad.length || good.length ? `bad: ${bad.join(' / ')}; good: ${good.join(' / ')}` : undefined;
  });
  check('v0.6.4 §15.2: a Type under a built-in name is an error, a warning before v0.6; target-native names are fine', () => {
    const err = codes('xdbml: 0.6\nType varchar { f int }').join();
    const ci = codes('xdbml: 0.6\nType Money { f int }').join();
    const old = codes('xdbml: 0.5\nType int string').join();
    const native = codes('xdbml: 0.6\nType number decimal(10,2)\nType serial int').join();
    if (err !== 'error:named-type-shadows-builtin' || ci !== 'error:named-type-shadows-builtin') return `${err} / ${ci}`;
    if (old !== 'warning:named-type-shadows-builtin') return `0.5: ${old}`;
    return native === '' ? undefined : `native: ${native}`;
  });
  check('v0.6.4 §28: a Windows importer path with backslashes resolves next to the importer', () => {
    const read: string[] = [];
    const files: Record<string, string> = {
      'C:/repo/models/lib.xdbml': 'xdbml: 0.6\nEntity a { id int [pk] }',
      'C:/repo/shared/types.xdbml': 'xdbml: 0.6\nType T string',
    };
    const readFile = (p: string) => { read.push(p); if (!(p in files)) throw new Error(`no ${p}`); return files[p]; };
    const src = "xdbml: 0.6\nreuse { entity a } from './lib'\nreuse { type T } from '../shared/types'";
    const doc = parse(src, { filePath: 'C:\\repo\\models\\main.xdbml', readFile } as ParseOptions);
    const names = flatten(doc).statements.map((x) => (x as { name?: string }).name).join(',');
    if (names !== 'a,T') return `names: ${names}`;
    return read.join(' ') === 'C:/repo/models/lib.xdbml C:/repo/shared/types.xdbml' ? undefined : read.join(' ');
  });
  check('v0.6.4 §28: an import cycle stops at the importer when its path uses backslashes', () => {
    // a imports b, which imports a back: the importer is on the resolution
    // stack, so b's directive is not followed and a is never read.
    const reads: string[] = [];
    const files: Record<string, string> = {
      'C:/repo/b.xdbml': "xdbml: 0.6\nreuse { entity a } from './a'\nEntity b { id int [pk] }",
    };
    const readFile = (p: string) => { reads.push(p); if (!(p in files)) throw new Error(`no ${p}`); return files[p]; };
    const doc = parse("xdbml: 0.6\nreuse { entity b } from './b'\nEntity a { id int [pk] }", { filePath: 'C:\\repo\\a.xdbml', readFile } as ParseOptions);
    const names = flatten(doc).statements.map((x) => (x as { name?: string }).name).join(',');
    return reads.join(' ') === 'C:/repo/b.xdbml' && names === 'b,a' ? undefined : `${reads.join(' ')} / ${names}`;
  });
  check('v0.6.4 Appendix D: use and reuse need xdbml: 0.2 or later', () => {
    const msg = parseError("xdbml: 0.1\nreuse { entity a } from './lib'");
    return msg.includes('needs xdbml: 0.2 or later') ? undefined : msg || 'accepted';
  });
  check('v0.6.3: every DIAGRAM_VIEW_CATEGORIES keyword opens a category', () => {
    const bad: string[] = [];
    for (const k of keywordArrays.DIAGRAM_VIEW_CATEGORIES) {
      const doc = parse(`xdbml: 0.6\nDiagramView v { ${k} { * } }`);
      const v = doc.statements[0];
      if (v.kind !== 'DiagramViewDeclaration' || v.categories.length !== 1) bad.push(k);
    }
    return bad.length ? bad.join(', ') : undefined;
  });
  return results;
}

/* -------------------------------------------------------------------------
 * v0.6.5: internal definitions (spec §15.8)
 * ----------------------------------------------------------------------- */

function runV065Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const parseError = (src: string): string => {
    try {
      parse(src);
      return '';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const entityBody = (src: string): EntityDeclaration['body'] =>
    (parse(src).statements.find((x) => x.kind === 'EntityDeclaration') as EntityDeclaration).body;
  const example = `xdbml: 0.6
Project crm { targets: 'JSON Schema' }
Entity customers {
  id       string  [not null]
  name     string  [not null]
  billing  Address [not null]
  shipping Address
  contacts array [Contact]
  definitions {
    Address {
      street  string [not null]
      city    string [not null]
      country CountryCode
    }
    CountryCode string [pattern: '^[A-Z]{2}$']
    Contact [note: 'One way to reach the customer'] {
      kind    string [not null]
      value   string [not null]
      address Address
    }
  }
}`;

  check('v0.6.5 §15.8.1: the spec example parses into one DefinitionsBlock with no diagnostic', () => {
    const body = entityBody(example);
    const blocks = body.filter((b) => b.kind === 'DefinitionsBlock');
    if (blocks.length !== 1 || blocks[0].kind !== 'DefinitionsBlock') return `blocks: ${blocks.length}`;
    const forms = blocks[0].entries.map((e) => `${e.name}:${e.scalarBase ? 'scalar' : 'object'}:${e.settings.map((x) => x.name).join('+')}`);
    if (forms.join(' ') !== 'Address:object: CountryCode:scalar:pattern Contact:object:note') return forms.join(' ');
    const d = codes(example);
    return d === '' ? undefined : d;
  });
  check('v0.6.5 §3.10: a field may be named definitions; only definitions { opens the block', () => {
    const body = entityBody('xdbml: 0.6\nEntity e {\n  definitions varchar\n  Definitions object { a int }\n  definitions { A int }\n}');
    const kinds = body.map((b) => (b.kind === 'FieldDeclaration' ? `F:${b.name}` : b.kind)).join(' ');
    return kinds === 'F:definitions F:Definitions DefinitionsBlock' ? undefined : kinds;
  });
  check('v0.6.5 §3.9: the entries of a definitions block form a list body', () => {
    const body = entityBody('xdbml: 0.6\nEntity e { a A, definitions { A { x int, y int }, B string; C int, } }');
    const block = body.find((b) => b.kind === 'DefinitionsBlock');
    const names = block && block.kind === 'DefinitionsBlock' ? block.entries.map((e) => e.name).join(',') : 'none';
    return names === 'A,B,C' ? undefined : names;
  });
  check('v0.6.5 §15.8.1: a definitions block in a View is a parse error that cites §15.8.1', () => {
    const msg = parseError('xdbml: 0.6\nView v { definitions { A int } }');
    return msg.includes('§15.8.1') ? undefined : `message: ${msg}`;
  });
  check('v0.6.5 §15.8.6: a definitions block in a TablePartial or an Edge is an error', () => {
    const d = codes('xdbml: 0.6\nTablePartial p { definitions { A int } }\nEntity a { id int [pk] }\nEntity b { id int [pk] }\n' +
      'Edge e [source: a, target: b] { definitions { A int } }');
    return d === 'error:definitions-outside-entity error:definitions-outside-entity' ? undefined : d;
  });
  check('v0.6.5 §15.8.6: a second block, a repeated entry and a built-in name are errors, in any version', () => {
    const d = codes('xdbml: 0.6\nEntity e { a A\n definitions { A { x int }\n A string\n varchar int }\n definitions { B int } }');
    const want = 'error:duplicate-definitions-block error:duplicate-definition error:named-type-shadows-builtin';
    if (d !== want) return d;
    const old = codes('xdbml: 0.5\nEntity e { a int\n definitions { Money int } }');
    return old === 'error:named-type-shadows-builtin' ? undefined : `0.5: ${old}`;
  });
  check('v0.6.5 §15.8.2: an entry named like a Type or an Enum draws a warning, and wins inside the entity', () => {
    // e.a.x resolves through the entry A; through the Type A it would be an
    // unresolved field.
    const d = codes('xdbml: 0.6\nType A { y int }\nEnum S { a, b }\nEntity e { a A, s S\n definitions { A { x int }\n S string } }\n' +
      'Entity f { id int [pk], x int }\nRef: f.x > e.a.x');
    return d === 'warning:definition-shadows-type warning:definition-shadows-type' ? undefined : d;
  });
  check('v0.6.5 §15.8.2: entity fields and entries resolve among the entries; a near miss suggests an entry', () => {
    const clean = codes('xdbml: 0.6\nEntity e { a A, b array [B], c map [string, B]\n definitions { A { n B }\n B string } }');
    if (clean !== '') return `clean: ${clean}`;
    const typo = resolveNames(parse('xdbml: 0.6\nEntity e { a Adress\n definitions { Address { x int } } }')).diagnostics;
    if (typo.length !== 1 || typo[0].code !== 'possible-type-typo' || !typo[0].message.includes("'Address'")) {
      return typo.map((x) => x.message).join(' | ');
    }
    // An entry of one entity is not visible in another (§15.8.2): there the
    // name is a target-native type, with no near miss and no fields.
    const other = codes('xdbml: 0.6\nEntity e { a Address\n definitions { Address { x int } } }\n' +
      'Entity f { id int, a Address, b Adress }\nEntity g { id int [pk], z int }\nRef: g.z > f.a.x');
    return other === 'error:invalid-nested-path' ? undefined : `other entity: ${other}`;
  });
  check('v0.6.5 §15.8.4: relational targets, Cassandra, ScyllaDB and the property graphs exclude the block; aliases count', () => {
    const bad: string[] = [];
    for (const t of ['Oracle', 'postgres', "'SQL Server'", 'Cassandra', "'Apache Cassandra'", 'ScyllaDB', 'Neo4j', 'Memgraph', "'Amazon Neptune'", 'JanusGraph']) {
      const d = codes(`xdbml: 0.6\nProject p { targets: ${t} }\nTable t { a A\n definitions { A { x int } } }`);
      if (d !== 'error:definitions-unsupported-target') bad.push(`${t}: ${d}`);
    }
    for (const t of ['MongoDB', "'JSON Schema'", 'Avro', 'Protobuf', 'OpenAPI', 'DynamoDB', 'ClickHouse', 'SomethingElse']) {
      const d = codes(`xdbml: 0.6\nProject p { targets: ${t} }\nTable t { a A\n definitions { A { x int } } }`);
      if (d !== '') bad.push(`${t}: ${d}`);
    }
    return bad.length ? bad.join(' / ') : undefined;
  });
  check('v0.6.5 §15.8.4: the Container target applies; no effective target accepts the block', () => {
    const src = "xdbml: 0.6\nProject p { targets: [MongoDB, Cassandra] }\n" +
      'Keyspace k [target: Cassandra] { Table t { a A\n definitions { A { x int } } } }\n' +
      'Database d [target: MongoDB] { Collection c { a A\n definitions { A { x int } } } }\n' +
      'Entity loose { a A\n definitions { A { x int } } }';
    const d = codes(src);
    if (d !== 'error:definitions-unsupported-target') return d;
    const none = codes('xdbml: 0.6\nEntity e { a A\n definitions { A { x int } } }');
    if (none !== '') return `no target: ${none}`;
    return isDefinitionsExcludedTarget('db2 z/os') && !isDefinitionsExcludedTarget('Mongo') ? undefined : 'isDefinitionsExcludedTarget';
  });
  check('v0.6.5 §15.8.2: a Ref path and a composite endpoint walk through internal definitions', () => {
    const tail = '\nEntity d { id int [pk], z string, y string }\n';
    const good = codes('xdbml: 0.6\nEntity c { id int [pk], addr A\n constraints { addr.zip [unique] }\n definitions { A { zip string, n B }\n B { k int } } }' +
      tail + 'Ref: d.z > c.addr.zip');
    if (good !== '') return `good: ${good}`;
    const deep = codes('xdbml: 0.6\nEntity c { id int [pk], addr A\n definitions { A { n B }\n B { k int } } }' + tail + 'Ref: d.z > c.addr.n.nope');
    if (!deep.startsWith('error:unresolved-field')) return `deep: ${deep}`;
    const composite = codes('xdbml: 0.6\nEntity c { id int [pk], addr A\n definitions { A { n B }\n B { k int, j int } } }' + tail + 'Ref: d.(z, y) > c.addr.n.(k, q)');
    return composite.includes('error:unresolved-field') ? undefined : `composite: ${composite}`;
  });
  check('v0.6.5 §15.8.2: names resolve where they are written: a project Type body and a partial use project scope', () => {
    const viaType = codes('xdbml: 0.6\nType Outer { inner Inner }\nType Inner { p int }\n' +
      'Entity c { o Outer\n constraints { o.inner.q [unique] }\n definitions { Inner { q int } } }');
    if (viaType !== 'error:unresolved-key-field warning:definition-shadows-type') return `via Type: ${viaType}`;
    const viaPartial = codes('xdbml: 0.6\nType Address { p int }\nTablePartial base { addr Address }\n' +
      'Entity c { ~base\n constraints { addr.q [unique] }\n definitions { Address { q int } } }');
    if (viaPartial !== 'error:unresolved-key-field warning:definition-shadows-type') return `via partial: ${viaPartial}`;
    const own = codes('xdbml: 0.6\nType Address { p int }\nEntity c { addr Address\n constraints { addr.q [unique] }\n definitions { Address { q int } } }');
    return own === 'warning:definition-shadows-type' ? undefined : `own field: ${own}`;
  });
  const lib = `xdbml: 0.6
Type Inner { p int }
Type Outer { inner Inner }
Entity customers {
  id string [pk]
  billing Address [not null]
  codes array [CountryCode]
  root Node
  o Outer
  definitions {
    Address { street string [not null], country CountryCode }
    CountryCode string [pattern: '^[A-Z]{2}$']
    Node { v int, children array [Node] }
    Inner { q int }
  }
}`;
  const importing = (src: string): XDbmlDocument =>
    parse(src, { filePath: '/v065/main.xdbml', readFile: (p: string) => { if (p !== '/v065/lib.xdbml') throw new Error(`no ${p}`); return lib; } } as ParseOptions);
  const importedType = (src: string, name: string) =>
    flatten(importing(src)).statements.find((x) => x.kind === 'TypeDeclaration' && x.name === name) as
      { scalarBase?: { kind: string; name?: string; elementType?: { name?: string }; elementSettings?: { name: string }[] }; settings: { name: string }[]; body: { kind: string; name?: string; type?: { name?: string }; settings?: { name: string }[] }[] } | undefined;
  check('v0.6.5 §15.8.3: a field imported on its own takes the shape of the internal definitions it names', () => {
    const billing = importedType("xdbml: 0.6\nreuse { field customers.billing } from './lib'\nEntity e { b billing }", 'billing');
    const country = billing?.body.find((f) => f.name === 'country');
    if (!billing || billing.scalarBase || country?.type?.name !== 'string' || country.settings?.map((x) => x.name).join() !== 'pattern') {
      return `billing: ${JSON.stringify(billing?.body.map((f) => [f.name, f.type?.name, f.settings?.map((x) => x.name)]))}`;
    }
    const codesType = importedType("xdbml: 0.6\nreuse { field customers.codes } from './lib'\nEntity e { c codes }", 'codes');
    if (codesType?.scalarBase?.elementType?.name !== 'string' || codesType.scalarBase.elementSettings?.map((x) => x.name).join() !== 'pattern') {
      return `codes: ${JSON.stringify(codesType?.scalarBase)}`;
    }
    const nested = importedType("xdbml: 0.6\nreuse { field customers.billing.country } from './lib'\nEntity e { c country }", 'country');
    if (nested?.scalarBase?.name !== 'string' || nested.settings.map((x) => x.name).join() !== 'pattern') return `nested: ${JSON.stringify(nested)}`;
    const viaType = importedType("xdbml: 0.6\nreuse { field customers.o.inner } from './lib'\nEntity e { i inner }", 'inner');
    return viaType?.scalarBase?.name === 'Inner' ? undefined : `through a project Type: ${JSON.stringify(viaType?.scalarBase)}`;
  });
  check('v0.6.5 §15.8.3: importing on its own a field that reaches a recursive definition is an error', () => {
    try {
      importing("xdbml: 0.6\nreuse { field customers.root } from './lib'\nEntity e { r root }");
      return 'no error';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes("'Node'") && msg.includes('§15.8.3') ? undefined : msg;
    }
  });
  check('v0.6.5 §15.8.3: an imported entity brings its definitions block', () => {
    const doc = importing("xdbml: 0.6\nreuse { entity customers } from './lib'");
    const entity = flatten(doc).statements.find((x) => x.kind === 'EntityDeclaration') as EntityDeclaration | undefined;
    const names = entity ? [...entityDefinitions(entity.body).keys()].join(',') : 'none';
    if (names !== 'Address,CountryCode,Node,Inner') return names;
    const d = resolveNames(doc).diagnostics.filter((x) => x.severity === 'error').map((x) => x.code).join(' ');
    return d === '' ? undefined : d;
  });
  check('v0.6.5 §15.8: Monarch colors definitions before { as a keyword, and a field named definitions as an identifier', () => {
    const rule = (xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>)
      .find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('definitions'));
    if (!rule) return 'rule missing';
    const re = new RegExp(rule[0].source, 'i');
    const asKeyword = ['definitions {', 'Definitions{', 'definitions  {'].filter((t) => !re.test(t));
    const asField = ['definitions varchar', 'definitions object {', 'definitionsx {'].filter((t) => re.exec(t)?.index === 0);
    return asKeyword.length || asField.length ? `keyword missed: ${asKeyword.join(' / ')}; field matched: ${asField.join(' / ')}` : undefined;
  });
  return results;
}

/* -------------------------------------------------------------------------
 * TablePartial injection applied (spec §17.1)
 * ----------------------------------------------------------------------- */

function runPartialInjectionTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const fieldsOf = (src: string, entity: string): string => {
    const doc = parse(src);
    const decl = doc.statements.find((s) => s.kind === 'EntityDeclaration' && s.name === entity) as EntityDeclaration;
    return effectiveFields(decl, tablePartials(doc))
      .map((e) => `${e.field.name}${e.partial ? `<${e.partial.name}` : ''}`).join(' ');
  };

  const SPEC = `xdbml: 0.6
TablePartial base_template {
  id         int       [pk, not null]
  created_at timestamp
  updated_at timestamp
}
Entity users {
  ~base_template
  name varchar
}
Entity orders {
  id      int [pk]
  user_id int
}
`;

  check('§17.1: injected fields sit where the ~name line is written', () => {
    const got = fieldsOf(SPEC, 'users');
    const want = 'id<base_template created_at<base_template updated_at<base_template name';
    return got === want ? undefined : `got: ${got}`;
  });

  check('§17.1: an injection between two fields keeps both around it', () => {
    const got = fieldsOf(`xdbml: 0.6
TablePartial audit { created_at timestamp
 updated_at timestamp }
Entity e { a int
 ~audit
 b int }`, 'e');
    return got === 'a created_at<audit updated_at<audit b' ? undefined : `got: ${got}`;
  });

  const OVERRIDE = `xdbml: 0.6
TablePartial a { id int [pk]
 name varchar(10) }
TablePartial b { name varchar(20)
 extra int }
Entity local_wins { ~a
 name text
 ~b }
Entity last_wins { ~a
 ~b }
Entity last_wins_reversed { x int
 ~b
 ~a }
`;
  check('§17.1: a field of the entity overrides an injected one and keeps its place', () => {
    const got = fieldsOf(OVERRIDE, 'local_wins');
    return got === 'id<a name extra<b' ? undefined : `got: ${got}`;
  });
  check('§17.1: among partials the last one injected applies, at its own position', () => {
    const one = fieldsOf(OVERRIDE, 'last_wins');
    const two = fieldsOf(OVERRIDE, 'last_wins_reversed');
    if (one !== 'id<a name<b extra<b') return `last_wins: ${one}`;
    return two === 'x extra<b id<a name<a' ? undefined : `last_wins_reversed: ${two}`;
  });

  check('§17.1: a Ref names a field the entity receives from a TablePartial', () => {
    const got = codes(`${SPEC}Ref: orders.user_id > users.id\n`);
    return got === '' ? undefined : `diagnostics: ${got}`;
  });
  check('§17.1: a composite endpoint names injected fields', () => {
    const got = codes(`xdbml: 0.6
TablePartial tenant_key { tenant_id int [not null]
 code varchar [not null]
 constraints { (tenant_id, code) [pk] } }
Entity accounts { ~tenant_key
 name varchar }
Entity entries { id int [pk]
 tenant_id int
 account_code varchar }
Ref: entries.(tenant_id, account_code) > accounts.(tenant_id, code)
`);
    return got === '' ? undefined : `diagnostics: ${got}`;
  });
  check('§17.1: a Ref to a field no partial brings is still unresolved', () => {
    const got = codes(`${SPEC}Ref: orders.user_id > users.missing\n`);
    return got.includes('error:unresolved-field') ? undefined : `diagnostics: ${got}`;
  });
  check('§11.17: a Ref to an injected field that is not a key is reported', () => {
    const got = codes(`${SPEC}Ref: orders.user_id > users.created_at\n`);
    return got.includes('ref-target-not-key') ? undefined : `diagnostics: ${got}`;
  });
  check('§26: top-level records name injected fields', () => {
    const got = codes(`${SPEC}records users(id, name) {\n  1, 'Ada'\n}\n`);
    return got === '' ? undefined : `diagnostics: ${got}`;
  });

  check('§11.17: an inline ref received from a TablePartial is checked once per message', () => {
    const got = codes(`xdbml: 0.6
Entity users { id int [pk]
 email varchar }
TablePartial audit { created_by varchar [ref: > users.email] }
Entity orders { id int [pk]
 ~audit }
Entity items { id int [pk]
 ~audit }
`);
    const hits = got.split(' ').filter((c) => c.endsWith('ref-target-not-key'));
    return hits.length === 1 ? undefined : `expected 1 ref-target-not-key, got: ${got}`;
  });

  check('§17.1: a TablePartial that injects another one is an error, and brings no field', () => {
    const src = `xdbml: 0.6
TablePartial a { x int }
TablePartial b { ~a
 y int }
Entity e { ~b
 z int }
`;
    const got = codes(src);
    if (got !== 'error:partial-injection-in-partial') return `diagnostics: ${got}`;
    const fields = fieldsOf(src, 'e');
    return fields === 'y<b z' ? undefined : `fields: ${fields}`;
  });

  const NESTED = `xdbml: 0.6
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
`;
  check('§17.1: a path steps into fields a ~name line places in an object and in a Type', () => {
    const got = codes(`${NESTED}Entity logs { id int [pk]
 a int
 c int }
Ref: logs.a > e.profile.created_by [foreign_master]
Ref: logs.c > e.stamp.created_by [foreign_master]
`);
    return got === '' ? undefined : `diagnostics: ${got}`;
  });
  check('a path into a json body is not navigable, with or without ~name (unchanged)', () => {
    const literal = codes(`xdbml: 0.6
Entity users { id int [pk] }
Entity e { id int [pk]
 doc json { owner int } }
Ref: e.doc.owner > users.id
`);
    const injected = codes(`${NESTED}Ref: e.doc.created_by > users.id [foreign_master]\n`);
    return literal === 'error:invalid-nested-path' && injected === literal ? undefined : `literal: ${literal}; injected: ${injected}`;
  });
  check('§17.1: a key path names a field injected in a nested object', () => {
    const got = codes(NESTED.replace('  stamp Stamped\n', '  stamp Stamped\n  constraints {\n    (profile.created_at) [unique]\n  }\n'));
    return got === '' ? undefined : `diagnostics: ${got}`;
  });
  check('§17.1: a nested path to a field no partial brings is still unresolved', () => {
    const got = codes(`${NESTED}Ref: e.profile.missing > users.id\n`);
    return got.includes('error:unresolved-field') ? undefined : `diagnostics: ${got}`;
  });
  check('§17.1: ~name in a Type body or a nested object names a TablePartial', () => {
    const got = codes(`xdbml: 0.6
Type T { ~missing
 x int }
Entity e { id int [pk]
 o object { ~Other } }
Type Other { y int }
`);
    return got === 'error:unresolved-partial error:unresolved-partial' ? undefined : `diagnostics: ${got}`;
  });
  check('§17.1: ~name inside a field of a TablePartial is an error as well', () => {
    const got = codes(`xdbml: 0.6
TablePartial a { x int }
TablePartial b { meta object { ~a
 y int } }
Entity e { id int [pk]
 ~b }
`);
    return got === 'error:partial-injection-in-partial' ? undefined : `diagnostics: ${got}`;
  });

  const CARRIED = `xdbml: 0.6
TablePartial a [headercolor: '#ff0000', note: 'from a'] {
  x int
  indexes { x [name: 'ix_a'] }
}
TablePartial b [headercolor: '#00ff00'] {
  y int
  Note: 'body note of b'
  indexes { y [unique] }
}
Entity own [headercolor: '#0000ff', note: 'own'] { id int [pk]
 ~a
 ~b
 indexes { id } }
Entity ab { id int [pk]
 ~a
 ~b }
Entity ba { id int [pk]
 ~b
 ~a }
Entity bodynote { id int [pk]
 ~a
 Note: 'own body note' }
Entity child { id int [pk]
 y int }
Ref: child.y > ab.y
`;
  const carried = (name: string): string => {
    const doc = parse(CARRIED);
    const partials = tablePartials(doc);
    const decl = doc.statements.find((s) => s.kind === 'EntityDeclaration' && s.name === name) as EntityDeclaration;
    const color = effectiveHeaderColor(decl, partials);
    const colorText = color?.value && 'value' in color.value ? String(color.value.value) : '-';
    const indexes = effectiveIndexes(decl, partials)
      .map((i) => `${keyPathString((i.entry.components[0] as { path: PathSegment[] }).path)}${i.partial ? `<${i.partial.name}` : ''}`).join(',');
    return `${colorText} | ${effectiveNote(decl, partials)?.body ?? '-'} | ${indexes}`;
  };
  // Expected values are those of @dbml/core 10.2.0 for the same document.
  check('§17.1: the header color and the note of the entity apply over those of a partial', () => {
    const got = carried('own');
    return got === '#0000ff | own | id,x<a,y<b' ? undefined : `got: ${got}`;
  });
  check('§17.1: among partials the header color and the note of the last one injected apply', () => {
    const ab = carried('ab');
    const ba = carried('ba');
    if (ab !== '#00ff00 | body note of b | x<a,y<b') return `ab: ${ab}`;
    return ba === '#ff0000 | from a | y<b,x<a' ? undefined : `ba: ${ba}`;
  });
  check('§17.1: a Note in the body of the entity applies over the note of a partial', () => {
    const got = carried('bodynote');
    return got === '#ff0000 | own body note | x<a' ? undefined : `got: ${got}`;
  });
  check('§17.1, §11.17: a unique index of a partial is a key a relationship may reference', () => {
    const got = codes(CARRIED);
    if (got !== '') return `diagnostics: ${got}`;
    const without = codes(CARRIED.replace('  indexes { y [unique] }\n', ''));
    return without.includes('ref-target-not-key') ? undefined : `without the index: ${without}`;
  });
  check('§17.1: a pk entry in the indexes of a partial is the primary key of the entity', () => {
    const src = `xdbml: 0.6
TablePartial keyed { a int [not null]
 b int [not null]
 indexes { (a, b) [pk] } }
Entity e { ~keyed
 c int }
`;
    const got = codes(src);
    if (got !== '') return `diagnostics: ${got}`;
    const doc = parse(src);
    const decl = doc.statements.find((s) => s.kind === 'EntityDeclaration') as EntityDeclaration;
    const pk = primaryKey(decl, doc)?.fields.join(',') ?? '';
    return pk === 'a,b' ? undefined : `primary key: ${pk}`;
  });

  check('§10.4: the primary key of the entity applies over the one of a partial', () => {
    const doc = parse(`xdbml: 0.6
TablePartial base { id int [pk] }
Entity own_key { ~base
 code varchar [pk] }
Entity partial_key { ~base
 code varchar }
`);
    const pk = (name: string): string => {
      const decl = doc.statements.find((s) => s.kind === 'EntityDeclaration' && s.name === name) as EntityDeclaration;
      return primaryKey(decl, doc)?.fields.join(',') ?? '';
    };
    if (pk('own_key') !== 'code') return `own_key: ${pk('own_key')}`;
    return pk('partial_key') === 'id' ? undefined : `partial_key: ${pk('partial_key')}`;
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.6.4: the grammar test corpus (grammar/test-cases.md), every case
 *
 * Each case is a "### VALID -- ...", "### VALID with a warning -- ..." or
 * "### INVALID -- ..." heading followed by one code block. VALID: no parse
 * error and no error diagnostic. VALID with a warning: a warning and no
 * error. INVALID: a parse error or an error diagnostic. Imports resolve
 * against grammar/fixtures/, as if the case were a file there.
 * ----------------------------------------------------------------------- */

function runGrammarCorpusTests (): TestResult[] {
  const results: TestResult[] = [];
  const grammarDir = join(__dirname, '..', '..', 'grammar');
  const fixtures = join(grammarDir, 'fixtures');
  const md = readFileSync(join(grammarDir, 'test-cases.md'), 'utf8');
  const headings = [...md.matchAll(/^### (VALID with a warning|VALID|INVALID) -- (.*)$/gm)];
  const options = {
    filePath: join(fixtures, '__case__.xdbml'),
    readFile: (p: string) => readFileSync(p, 'utf8'),
  } as ParseOptions;
  headings.forEach((h, i) => {
    const kind = h[1];
    const title = `corpus: ${kind} -- ${h[2]}`;
    const end = i + 1 < headings.length ? headings[i + 1].index! : md.length;
    const section = md.slice(h.index!, end).split(/^## /m)[0];
    const block = /```[a-z]*\n([\s\S]*?)```/.exec(section);
    if (!block) {
      results.push(fail(title, 'no code block under the heading'));
      return;
    }
    let outcome: 'clean' | 'warning' | 'error';
    let detail = '';
    try {
      const d = resolveNames(parse(block[1], options)).diagnostics;
      const errors = d.filter((x) => x.severity === 'error');
      const warnings = d.filter((x) => x.severity === 'warning');
      outcome = errors.length ? 'error' : warnings.length ? 'warning' : 'clean';
      detail = (errors.length ? errors : warnings).map((x) => `${x.code}: ${x.message}`).join(' | ');
    } catch (e) {
      outcome = 'error';
      detail = `parse error: ${e instanceof Error ? e.message : String(e)}`;
    }
    const expected = kind === 'INVALID' ? 'error' : kind === 'VALID' ? 'clean' : 'warning';
    const okay = expected === outcome || (kind === 'VALID' && outcome === 'warning');
    results.push(okay ? ok(title) : fail(title, `expected ${expected}, got ${outcome}${detail ? `: ${detail}` : ''}`));
  });
  if (headings.length < 100) results.push(fail('corpus: at least 100 cases found', `only ${headings.length}`));
  return results;
}

/* -------------------------------------------------------------------------
 * v0.6.7: quoted names in every name position (spec §3.2, §20.1)
 *
 * A quoted name may stand wherever a name does: at the head of a path, in
 * a composite Ref, in a qualified entity name, as a TableGroup member, in
 * a top-level `records` declaration, after `~`. A dot outside quotes
 * separates levels; a dot inside quotes belongs to the name. The cases
 * marked DBML are valid DBML 3.13.6, checked against @dbml/core 3.13.6.
 * ----------------------------------------------------------------------- */

function runQuotedNameTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const clean = (src: string): string | undefined => {
    const got = codes(src);
    return got === '' ? undefined : `diagnostics: ${got}`;
  };
  const entityNames = (src: string): string => {
    const out: string[] = [];
    for (const s of parse(src).statements) {
      if (s.kind === 'EntityDeclaration') out.push(s.name);
      if (s.kind === 'ContainerDeclaration') {
        for (const b of s.body) if (b.kind === 'EntityDeclaration') out.push(`${s.name}/${b.name}`);
      }
    }
    return out.join(' | ');
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

  /* ---- names.ts ---- */

  check('names: a segment without a dot or a quote stays bare', () =>
    same([quoteNameSegment('Work Order'), joinName(['sales', 'Work Order'])], ['Work Order', 'sales.Work Order']));
  check('names: a segment with a dot or a quote is quoted, with escapes', () =>
    same([quoteNameSegment('my.table'), quoteNameSegment('a"b'), joinName(['core', 'a.b'])], ['"my.table"', '"a\\"b"', 'core."a.b"']));
  check('names: splitName keeps a dot inside quotes in the segment', () =>
    same([splitName('"my.table".id'), splitName('core.users'), splitName('"a\\"b".c')], [['my.table', 'id'], ['core', 'users'], ['a"b', 'c']]));
  check('names: splitName(joinName(x)) returns x', () => {
    const samples = [['a'], ['a', 'b'], ['a.b'], ['x', 'a.b', 'c'], ['q"uote', 'back\\slash.dot'], ['Work Order', 'Work Order ID']];
    const bad = samples.filter((s) => JSON.stringify(splitName(joinName(s))) !== JSON.stringify(s));
    return bad.length === 0 ? undefined : `round trip failed for ${JSON.stringify(bad)}`;
  });
  check('names: qualifier, last segment and isQualifiedName', () =>
    same(
      [nameQualifier('core.users'), nameQualifier('"a.b".users'), nameQualifier('"my.table"'), lastNameSegment('core."my.table"'), isQualifiedName('"my.table"'), isQualifiedName('my.table')],
      ['core', '"a.b"', undefined, 'my.table', false, true],
    ));

  /* ---- DBML 3.13.6 forms ---- */

  const WO = `Table "Work Order" {
  "Work Order ID" int [pk]
  "Status" varchar
}
`;
  check('DBML: composite pk in indexes with quoted columns', () => clean(`Table "Work Order Part" {
  "Work Order ID" int
  "Part ID" int
  indexes {
    ("Work Order ID", "Part ID") [pk]
  }
}`));
  check('DBML: an index on one quoted column', () => clean(`Table "T" {
  "Part ID" int
  indexes {
    "Part ID" [unique]
  }
}`));
  check('DBML: Ref with quoted endpoints, as @dbml/core writes them', () => {
    const src = `${WO}Table "Work Order Part" {
  "Work Order ID" int
}
Ref:"Work Order"."Work Order ID" < "Work Order Part"."Work Order ID"`;
    const ref = parse(src).statements.find((s) => s.kind === 'RefDeclaration');
    if (!ref || ref.kind !== 'RefDeclaration') return 'no Ref';
    const names = ref.spec.target.path.map((p) => (p.kind === 'PathField' ? p.name : '?'));
    return clean(src) ?? same(names, ['Work Order Part', 'Work Order ID']);
  });
  check('DBML: inline ref to a quoted target', () => clean(`${WO}Table "Work Order Part" {
  "Work Order ID" int [ref: > "Work Order"."Work Order ID"]
}`));
  check('DBML: composite Ref with quoted fields', () => clean(`Table "A B" {
  "x y" int
  "z w" int
  indexes {
    ("x y", "z w") [pk]
  }
}
Table "C D" {
  "x y" int
  "z w" int
}
Ref: "C D".("x y", "z w") > "A B".("x y", "z w")`));
  check('DBML: quoted schema and table, and a Ref through them', () => {
    const src = `Table "sales"."Work Order" {
  "id" int [pk]
}
Table sales."Line" {
  "wo id" int
}
Ref: "sales"."Line"."wo id" > "sales"."Work Order"."id"`;
    return clean(src) ?? same(entityNames(src), 'sales.Work Order | sales.Line');
  });
  check('DBML: TableGroup with quoted members', () => clean(`${WO}TableGroup "Ops" {
  "Work Order"
}`));

  check('DBML: a quoted Ref name, a quoted alias and a quoted Project name', () => {
    const src = `Project "Car Maintenance" {
  database_type: 'Oracle'
}
Table "Work Order" as "WO" {
  id int [pk]
}
Table b {
  wo int
}
Ref "fk b wo": b.wo > "WO".id`;
    const doc = parse(src);
    const ref = doc.statements.find((s) => s.kind === 'RefDeclaration');
    const project = doc.statements.find((s) => s.kind === 'ProjectDeclaration');
    const target = ref && ref.kind === 'RefDeclaration' ? ref.spec.target.path.map((p) => (p.kind === 'PathField' ? p.name : '?')) : [];
    return clean(src) ?? same([ref && ref.kind === 'RefDeclaration' ? ref.name : undefined, project?.kind === 'ProjectDeclaration' ? project.name : undefined, target],
      ['fk b wo', 'Car Maintenance', ['Work Order', 'id']]);
  });

  /* ---- xDBML ---- */

  check('§10.1: constraints key line with quoted fields (the reported case)', () => {
    const src = `xdbml: 0.6
Entity "Work Order Part" {
  "Work Order ID" NUMBER(12)
  "Part ID" NUMBER(10)
  "Quantity Used" NUMBER(5) [not null]
  constraints {
    ("Work Order ID", "Part ID") [pk]
  }
}`;
    const doc = parse(src);
    const e = doc.statements[0] as EntityDeclaration;
    const notNull = e.body.filter((b) => b.kind === 'FieldDeclaration' && b.settings.some((s) => s.name === 'not null')).length;
    return clean(src) ?? same([primaryKey(e, doc)?.fields, notNull], [['Work Order ID', 'Part ID'], 3]);
  });
  check('§10.1: a key on one quoted field, and bare and quoted fields mixed', () => clean(`xdbml: 0.6
Entity "T" {
  a int
  "b c" int
  "Part ID" int
  constraints {
    (a, "b c") [pk]
    "Part ID" [unique, name: 'uk_t']
  }
}`));
  check('§6: a quoted Container name, and a Ref through it', () => clean(`xdbml: 0.6
Container "sales ops" [type: schema] {
  Entity "Work Order" {
    "id" int [pk]
  }
  Entity "Line" {
    "wo id" int
  }
}
Ref: "sales ops"."Line"."wo id" > "sales ops"."Work Order"."id"`));
  check('§11.16: entity-level Ref between quoted names', () => clean(`xdbml: 0.6
Entity "Work Order" {
  id int [pk]
}
Entity "Customer Account" {
  id int [pk]
}
Ref: "Work Order" > "Customer Account"`));
  check('§9.3: index on a nested path with a quoted head', () => clean(`xdbml: 0.6
Entity "T" {
  "the profile" object {
    "e mail" varchar
  }
  indexes {
    "the profile"."e mail"
  }
}`));
  check('§12, §18: quoted segments in a supertype, a subtype and a diagram view', () => clean(`xdbml: 0.6
Container sales {
  Entity "Legal Party" {
    id int [pk]
  }
  Entity "Natural Person" {
    born date
  }
}
SupertypeGroup legal [supertype: "sales"."Legal Party"] {
  sales."Natural Person"
}
DiagramView "Ops view" {
  Tables {
    "sales"."Legal Party"
  }
}`));
  check('§26.2: top-level records with a quoted entity and quoted columns', () => clean(`xdbml: 0.6
${WO}records "Work Order"("Work Order ID", "Status") {
  1, 'open'
}`));
  check('§17.1: ~"name" injects a TablePartial declared with a quoted name', () => {
    const src = `xdbml: 0.6
TablePartial "audit cols" {
  created_at timestamp
}
Entity t {
  id int [pk]
  ~"audit cols"
}`;
    const doc = parse(src);
    const t = doc.statements.find((s) => s.kind === 'EntityDeclaration') as EntityDeclaration;
    return clean(src) ?? same(effectiveFields(t, tablePartials(doc)).map((f) => f.field.name), ['id', 'created_at']);
  });
  check('§28: an import names a quoted entity', () => {
    const files: Record<string, string> = {
      '/q/lib.xdbml': `xdbml: 0.6
Container "sales ops" {
  Entity "Work Order" {
    id int [pk]
  }
}`,
    };
    const doc = parse(`xdbml: 0.6
reuse { entity "sales ops"."Work Order" } from './lib'`, {
      filePath: '/q/consumer.xdbml',
      readFile: (p: string) => {
        if (!(p in files)) throw new Error(`not found: ${p}`);
        return files[p];
      },
    });
    const d = doc.statements[0];
    if (d.kind !== 'ModuleImportDirective' || !d.clone) return 'no clone';
    return same(d.clone.statements.map((s) => (s as { name?: string }).name), ['Work Order']);
  });

  /* ---- a dot inside quotes belongs to the name ---- */

  const BOTH = `xdbml: 0.6
Container my {
  Table table {
    id int [pk]
  }
}
Table "my.table" {
  id int [pk]
}
Table other {
  a int
  b int
}
`;
  check('§3.2: "my.table" and my.table are two entities', () =>
    clean(BOTH) ?? same(entityNames(BOTH), 'my/table | "my.table" | other'));
  check('§3.2: a Ref reaches each of the two', () =>
    clean(`${BOTH}Ref: other.a > my.table.id
Ref: other.b > "my.table".id`));
  check('§3.2: "my.table".id does not reach the entity table of Container my', () => {
    const got = codes(`xdbml: 0.6
Container my {
  Table table {
    id int [pk]
  }
}
Table other {
  a int
}
Ref: other.a > "my.table".id`);
    return got === 'error:unresolved-entity' ? undefined : `diagnostics: ${got}`;
  });
  const DOTTED_FIELD = `xdbml: 0.6
Table t {
  "user.id" int
  user object {
    id int
  }
  constraints {
    ("user.id") [pk]
  }
}
Table o {
  uid int
}
`;
  check('§10.2: a key on a field named "user.id" names that field, not user.id', () => {
    const doc = parse(DOTTED_FIELD);
    const t = doc.statements[0] as EntityDeclaration;
    const f = t.body[0];
    const implied = f.kind === 'FieldDeclaration' && f.settings.some((s) => s.name === 'not null');
    return same([primaryKey(t, doc)?.fields, implied], [['"user.id"'], true]);
  });
  check('§11.17: a Ref to t."user.id" references the key; t.user.id does not', () => {
    const toKey = codes(`${DOTTED_FIELD}Ref: o.uid > t."user.id"`);
    const toNested = codes(`${DOTTED_FIELD}Ref: o.uid > t.user.id`);
    return same([toKey, toNested], ['', 'error:ref-target-not-key']);
  });
  check('§16: a type name with a quoted segment', () => {
    const src = `xdbml: 0.6
Enum "a.b" {
  x
}
Container s {
  Enum "st" {
    p
  }
}
Table t {
  f1 "a.b"
  f2 s."st"
}`;
    const t = parse(src).statements.find((s) => s.kind === 'EntityDeclaration') as EntityDeclaration;
    const types = t.body.map((b) => (b.kind === 'FieldDeclaration' && b.type.kind === 'ScalarType' ? b.type.name : '?'));
    return clean(src) ?? same(types, ['"a.b"', 's.st']);
  });
  check('§20: pathToString quotes a field name that holds a dot', () => {
    const ref = parse(`${DOTTED_FIELD}Ref: o.uid > t."user.id"`).statements.find((s) => s.kind === 'RefDeclaration');
    if (!ref || ref.kind !== 'RefDeclaration') return 'no Ref';
    return same(pathToString(ref.spec.target.path), 't."user.id"');
  });

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

/* -------------------------------------------------------------------------
 * v0.7: records in the forms of DBML 10.3.1 (spec §26)
 *
 * The cases without a version declaration are valid DBML 10.3.1, checked
 * against @dbml/core 10.3.1: the example flag on both forms, a column list
 * on records inside a table, empty fields. A second records block for an
 * entity is an error, as in DBML, and a warning in a document declaring
 * 0.6 or an earlier version, which accepted it (§26.6).
 * ----------------------------------------------------------------------- */

function runV07RecordsTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const expectCodes = (src: string, want: string): string | undefined => {
    const got = codes(src);
    return got === want ? undefined : `diagnostics: '${got}', want '${want}'`;
  };
  const parseFails = (src: string, fragment: string): string | undefined => {
    try {
      parse(src);
      return 'parsed';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes(fragment) ? undefined : `wrong error: ${msg}`;
    }
  };
  /** Every records node of a document, inside entities and at the top level, in source order. */
  const records = (src: string): Array<RecordsBlock | TopLevelRecordsDeclaration> => {
    const out: Array<RecordsBlock | TopLevelRecordsDeclaration> = [];
    const walk = (e: EntityDeclaration) => {
      for (const item of e.body) if (item.kind === 'RecordsBlock') out.push(item);
    };
    for (const s of parse(src).statements) {
      if (s.kind === 'EntityDeclaration') walk(s);
      if (s.kind === 'ContainerDeclaration') for (const b of s.body) if (b.kind === 'EntityDeclaration') walk(b);
      if (s.kind === 'TopLevelRecordsDeclaration') out.push(s);
    }
    return out;
  };
  /** A row's values in a compact form: `∅` for an empty field. */
  const cells = (row: RecordRow): string[] => row.values.map((v) => {
    if (v.kind === 'NullValue') return v.empty ? '∅' : 'null';
    if (v.kind === 'StringValue' || v.kind === 'NumberValue' || v.kind === 'IdentifierValue') return String(v.value);
    if (v.kind === 'BooleanValue') return String(v.value);
    if (v.kind === 'ExpressionValue') return `\`${v.expression}\``;
    return v.kind;
  });
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const T = 'Table t {\n  id int [pk]\n  name varchar\n}\n';

  /* ---- §26.5 example records ---- */

  check('§26.5 DBML: [example] on a top-level declaration, after the column list', () => {
    const src = `${T}records t (id, name) [example] {\n  1, 'Alice'\n}`;
    const [r] = records(src);
    return expectCodes(src, '') ?? same([r.kind, r.example, (r as TopLevelRecordsDeclaration).columns], ['TopLevelRecordsDeclaration', true, ['id', 'name']]);
  });
  check('§26.5 DBML: [example] inside a table, without a column list', () => {
    const src = 'Table t {\n  id int [pk]\n  records [example] {\n    1\n  }\n}';
    const [r] = records(src);
    return expectCodes(src, '') ?? same([r.example, (r as RecordsBlock).columns], [true, undefined]);
  });
  check('§26.5 DBML: [example] inside a table, after a column list', () => {
    const src = "Table t {\n  id int [pk]\n  name varchar\n  records (name) [example] {\n    'x'\n  }\n}";
    const [r] = records(src);
    return expectCodes(src, '') ?? same([r.example, (r as RecordsBlock).columns], [true, ['name']]);
  });
  check('§26.5: a records block without the flag is not an example; [example: true] is', () => {
    const src = `${T}records t (id) {\n  1\n}\nTable u {\n  id int\n  records [example: true] {\n    1\n  }\n}`;
    return same(records(src).map((r) => r.example), [false, true]);
  });
  check('§26.5 DBML: the brackets before the column list are a parse error, inside a table', () =>
    parseFails('Table t {\n  id int\n  records [example] (id) {\n    1\n  }\n}', 'comes before its brackets'));
  check('§26.5 DBML: the brackets before the column list are a parse error, at the top level', () =>
    parseFails(`${T}records t [example] (id) {\n  1\n}`, 'comes before its brackets'));

  /* ---- §26.1 a column list inside an entity ---- */

  check('§26.1 DBML: records inside a table with a column list populate those columns', () => {
    const src = "Table t {\n  id int [pk]\n  name varchar\n  email varchar\n  records (id, email) {\n    1, 'a@x.org'\n  }\n}";
    const [r] = records(src) as RecordsBlock[];
    return expectCodes(src, '') ?? same([r.columns, cells(r.rows[0])], [['id', 'email'], ['1', 'a@x.org']]);
  });
  check('§26.1: a column of the list that is not a field of the entity is an error', () =>
    expectCodes('Table t {\n  id int\n  records (id, nope) {\n    1, 2\n  }\n}', 'error:unresolved-records-column'));
  check('§26.1: a column injected by a TablePartial is a field of the entity', () =>
    expectCodes('TablePartial stamps {\n  created_at timestamp\n}\nTable t {\n  id int\n  ~stamps\n  records (id, created_at) {\n    1, \'2026-01-01\'\n  }\n}', ''));
  check('§3.10: records followed by ( or [ starts a block; a field may still be named records', () =>
    same(parse('Table t {\n  id int\n  records int\n}').statements.map((s) => s.kind === 'EntityDeclaration' ? s.body.map((b) => b.kind) : []), [['FieldDeclaration', 'FieldDeclaration']]));

  /* ---- §26.4 empty fields ---- */

  check('§26.4 DBML: an empty field between two commas reads as null', () => {
    const src = 'Table t {\n  a int\n  b int\n  c int\n}\nrecords t (a, b, c) {\n  1, , 3\n}';
    return expectCodes(src, '') ?? same(cells(records(src)[0].rows[0]), ['1', '∅', '3']);
  });
  check('§26.4 DBML: an empty field before the first comma reads as null', () => {
    const src = `${T}records t (id, name) {\n  , 'Alice'\n}`;
    return expectCodes(src, '') ?? same(cells(records(src)[0].rows[0]), ['∅', 'Alice']);
  });
  check('§26.4: a comma at the end of a row is ignored, as in v0.6; DBML reads `1,` with the same meaning', () => {
    const src = `${T}records t (id, name) {\n  1,\n  2, 'Bob',\n}`;
    return expectCodes(src, '') ?? same(records(src)[0].rows.map(cells), [['1'], ['2', 'Bob']]);
  });
  check('§26.4: an empty field has an empty span at the comma after it', () => {
    const [r] = records(`${T}records t (id, name) {\n  , 'x'\n}`);
    const v = r.rows[0].values[0];
    return same([v.span.start.line, v.span.start.column, v.span.end.column], [6, 3, 3]);
  });
  check('§26.4 DBML: an empty field inside a table, in each position', () => {
    const src = 'Table t {\n  a int\n  b int\n  c int\n  records {\n    , 2, 3\n    1, , 3\n    1, 2,\n  }\n}';
    return expectCodes(src, '') ?? same(records(src)[0].rows.map(cells), [['∅', '2', '3'], ['1', '∅', '3'], ['1', '2']]);
  });

  /* ---- §26.6 one records block per entity ---- */

  check('§26.6 DBML: a second records block inside a table is an error', () =>
    expectCodes('Table t {\n  id int\n  records {\n    1\n  }\n  records {\n    2\n  }\n}', 'error:duplicate-records-block'));
  check('§26.6 DBML: a second top-level declaration for a table is an error, example or not', () =>
    expectCodes(`${T}records t (id) {\n  1\n}\nrecords t (name) [example] {\n  'x'\n}`, 'error:duplicate-records-block'));
  check('§26.6 DBML: a block inside a table and a top-level declaration for it are an error', () =>
    expectCodes(`Table t {\n  id int\n  records {\n    1\n  }\n}\nrecords t (id) {\n  2\n}`, 'error:duplicate-records-block'));
  check('§26.6: a container-qualified declaration and the block inside the entity are an error', () =>
    expectCodes('xdbml: 0.7\nContainer core [type: schema] {\n  Entity u {\n    id int\n    records {\n      1\n    }\n  }\n}\nrecords core.u (id) {\n  2\n}', 'error:duplicate-records-block'));
  check('§26.6: the error falls on each block after the first', () =>
    expectCodes(`${T}records t (id) {\n  1\n}\nrecords t (id) {\n  2\n}\nrecords t (id) {\n  3\n}`, 'error:duplicate-records-block error:duplicate-records-block'));
  check('§26.6: a document declaring xdbml: 0.7 draws an error', () =>
    expectCodes(`xdbml: 0.7\n${T}records t (id) {\n  1\n}\nrecords t (name) {\n  'x'\n}`, 'error:duplicate-records-block'));
  check('§26.6: a document declaring xdbml: 0.6 draws a warning and stays valid', () =>
    expectCodes(`xdbml: 0.6\n${T}records t (id) {\n  1\n}\nrecords t (name) {\n  'x'\n}`, 'warning:duplicate-records-block'));
  check('§26.6: one block for each of two entities is clean', () =>
    expectCodes('Table a {\n  id int\n  records {\n    1\n  }\n}\nTable b {\n  id int\n  records {\n    1\n  }\n}', ''));

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7: optional marks on relationship operators, and cardinality (spec
 * §11.1, §11.7, §11.8, §11.16)
 *
 * The DBML cases are valid DBML 10.3.1, checked against @dbml/core 10.3.1,
 * which gives the same cardinality for every operator on a not-null foreign
 * key, `<>` aside: §11.8 keeps '0..*' at both ends of a many-to-many.
 * ----------------------------------------------------------------------- */

function runV07OptionalRefTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const firstRef = (src: string): { doc: XDbmlDocument; ref: RefDeclaration } => {
    const doc = flatten(parse(src));
    const ref = doc.statements.find((s): s is RefDeclaration => s.kind === 'RefDeclaration');
    if (!ref) throw new Error('no Ref');
    return { doc, ref };
  };
  const ends = (src: string): string => {
    const { doc, ref } = firstRef(src);
    const c = refCardinalityIn(doc, ref);
    const one = (e: EndCardinality) => `${e.text ?? (e.min !== undefined ? `${e.min}..?` : '-')}:${e.origin}`;
    return `${one(c.source)} ${one(c.target)}`;
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const parseFails = (src: string, fragment: string): string | undefined => {
    try {
      parse(src);
      return 'parsed';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes(fragment) ? undefined : `wrong error: ${msg}`;
    }
  };
  const B = 'Table a {\n  id int [pk]\n}\nTable b {\n  id   int [pk]\n  n    int\n  nn   int [not null]\n}\n';

  /* ---- §11.1 the marks ---- */

  check('§11.1 DBML: every operator with and without ? parses, and the AST keeps the marks', () => {
    const ops = ['>', '<', '-', '<>', '>?', '?>', '?>?', '<?', '?<', '?<?', '-?', '?-', '?-?', '<>?', '?<>', '?<>?'];
    const got = ops.map((op) => {
      const { ref } = firstRef(`${B}Ref: b.nn ${op} a.id`);
      return `${ref.spec.sourceOptional ? '?' : ''}${ref.spec.operator}${ref.spec.targetOptional ? '?' : ''}`;
    });
    return same(got, ops);
  });
  check('§11.1 DBML: the ? marks of an inline ref', () => {
    const doc = parse(`${B}Table c {\n  x int [ref: ?> a.id]\n  y int [ref: >? a.id]\n}`);
    const c = doc.statements.find((s): s is EntityDeclaration => s.kind === 'EntityDeclaration' && s.name === 'c');
    const vals = (c?.body ?? []).flatMap((f) => (f.kind === 'FieldDeclaration' ? f.settings : []))
      .map((st) => st.value)
      .filter((v): v is RefValue => !!v && v.kind === 'RefValue')
      .map((v) => `${v.sourceOptional ? '?' : ''}${v.operator}${v.targetOptional ? '?' : ''}`);
    return same(vals, ['?>', '>?']);
  });
  check('§11.1 DBML: the long form takes a marked operator and settings', () => {
    const { ref } = firstRef(`${B}Ref r {\n  b.nn >? a.id [delete: cascade]\n}`);
    return same([ref.spec.targetOptional, ref.settings.map((x) => x.name)], [true, ['delete']]);
  });
  check('§11.1 DBML: a ? apart from the operator is a syntax error', () =>
    parseFails(`${B}Ref: b.nn > ? a.id`, 'written against the operator'));
  check('§11.1 DBML: two ? on one side are a syntax error', () =>
    parseFails(`${B}Ref: b.nn ??> a.id`, "one '?' at most") ?? parseFails(`${B}Ref: b.nn >?? a.id`, "one '?' at most"));
  check('§11.1: marked operators draw no diagnostic in a document without a version (DBML)', () => {
    const got = codes(`${B}Ref: b.nn >? a.id\nRef: a.id ?< b.nn\nRef: b.nn ?-? a.id`);
    return got === '' ? undefined : got;
  });

  /* ---- §11.8 the operator, the marks and nullability ---- */

  check('§11.8 DBML: on a not-null foreign key, every operator gives the cardinality of DBML 10, <> aside', () => {
    const want: Record<string, string> = {
      '>': '1..*/1..1', '<': '1..1/1..*', '-': '1..1/1..1', '<>': '0..*/0..*',
      '>?': '1..*/0..1', '?>': '0..*/1..1', '?>?': '0..*/0..1',
      '<?': '1..1/0..*', '?<': '0..1/1..*', '?<?': '0..1/0..*',
      '-?': '1..1/0..1', '?-': '0..1/1..1', '?-?': '0..1/0..1',
    };
    const bad: string[] = [];
    for (const [op, w] of Object.entries(want)) {
      const bare = op.replace(/\?/g, '');
      const src = bare === '<' ? `${B}Ref: a.id ${op} b.nn` : `${B}Ref: b.nn ${op} a.id`;
      const { doc, ref } = firstRef(src);
      const c = refCardinalityIn(doc, ref);
      const got = `${c.source.text}/${c.target.text}`;
      if (got !== w) bad.push(`${op}: ${got}, want ${w}`);
    }
    return bad.length ? bad.join('; ') : undefined;
  });
  check('§11.8: a nullable foreign key makes the parent end optional, for > and for <', () =>
    same([ends(`${B}Ref: b.n > a.id`), ends(`${B}Ref: a.id < b.n`)],
      ['1..*:operator 0..1:nullable-foreign-key', '0..1:nullable-foreign-key 1..*:operator']));
  check('§11.8: a nullable foreign key under - makes the target end optional', () =>
    same(ends(`${B}Ref: b.n - a.id`), '1..1:operator 0..1:nullable-foreign-key'));
  check('§11.8: a field of the primary key is not nullable', () =>
    same(ends('Table p {\n  id int [pk]\n}\nTable c {\n  pid int [pk]\n}\nRef: c.pid - p.id'), '1..1:operator 1..1:operator'));
  check('§11.8: required reads as not null', () =>
    same(ends('Table p {\n  id int [pk]\n}\nTable c {\n  pid int [required]\n}\nRef: c.pid > p.id'), '1..*:operator 1..1:operator'));
  check('§11.8: a composite foreign key with one nullable field is nullable', () =>
    same(ends('Table p {\n  x int\n  y int\n  indexes {\n    (x, y) [pk]\n  }\n}\nTable q {\n  x int [not null]\n  y int\n}\nRef: q.(x, y) > p.(x, y)'),
      '1..*:operator 0..1:nullable-foreign-key'));
  check('§11.8: a nullable field of an injected TablePartial counts', () =>
    same(ends('TablePartial fk {\n  pid int\n}\nTable p {\n  id int [pk]\n}\nTable c {\n  id int [pk]\n  ~fk\n}\nRef: c.pid > p.id'),
      '1..*:operator 0..1:nullable-foreign-key'));
  check('§11.8: a nested foreign key field reads its own nullability', () =>
    same(ends('xdbml: 0.7\nTable p {\n  id int [pk]\n}\nTable c {\n  id int [pk]\n  info object {\n    pid int\n  }\n}\nRef: c.info.pid > p.id'),
      '1..*:operator 0..1:nullable-foreign-key'));
  check('§11.8: the ? and the nullable foreign key combine end by end', () =>
    same(ends(`${B}Ref: b.n ?> a.id`), '0..*:optional-mark 0..1:nullable-foreign-key'));
  check('§11.8: <> keeps 0..* at both ends, nullable or not', () =>
    same([ends(`${B}Ref: b.nn <> a.id`), ends(`${B}Ref: b.n <> a.id`)], ['0..*:operator 0..*:operator', '0..*:operator 0..*:operator']));

  /* ---- §11.7 settings and the marks ---- */

  check('§11.7: a setting states its end; the other end keeps the operator', () =>
    same(ends(`xdbml: 0.7\n${B}Ref: b.n > a.id [target: '1..1']`), '1..*:operator 1..1:setting'));
  check('§11.7: the four-key form states its end too', () =>
    same(ends(`xdbml: 0.7\n${B}Ref: b.nn > a.id [min_target: 0, max_target: 1]`), '1..*:operator 0..1:setting'));
  check('§11.7: a ? and a setting that agree draw nothing', () => {
    const src = `xdbml: 0.7\n${B}Ref: b.nn >? a.id [target: '0..1', source: '0..*']`;
    return same([ends(src), codes(src)], ['0..*:setting 0..1:setting', '']);
  });
  check('§11.7: with an xdbml: version, a setting that disagrees with a ? applies, with a warning', () => {
    const src = `xdbml: 0.7\n${B}Ref: b.nn >? a.id [target: '1..1']`;
    return same([ends(src), codes(src)], ['1..*:operator 1..1:setting', 'warning:cardinality-conflict']);
  });
  check('§11.7: without a version (DBML), the ? applies over a setting that disagrees, with a warning', () => {
    const src = `${B}Ref: b.nn >? a.id [target: '1..1']`;
    return same([ends(src), codes(src)], ['1..*:operator 0..1:optional-mark', 'warning:cardinality-conflict']);
  });
  check('§11.7: a disagreement on the source end names it', () => {
    const d = resolveNames(parse(`xdbml: 0.7\n${B}Ref: b.nn ?> a.id [source: '1..*']`)).diagnostics;
    return d.length === 1 && d[0].message.includes('source end') ? undefined : d.map((x) => x.message).join(' | ');
  });

  /* ---- §11.16 entity-level relationships ---- */

  const E = 'xdbml: 0.7\nEntity Customer { }\nEntity Order { }\n';
  check('§11.16: an entity-level Ref states no cardinality from its operator', () =>
    same(ends(`${E}Ref: Customer > Order`), '-:unstated -:unstated'));
  check('§11.16: a ? on an entity-level Ref states the minimum of its end only', () =>
    same(ends(`${E}Ref: Customer >? Order`), '-:unstated 0..?:optional-mark'));
  check('§11.16: a setting completes an end that a ? marks', () =>
    same(ends(`${E}Ref: Customer >? Order [target: '0..*']`), '-:unstated 0..*:setting'));
  check('§11.16: a ? on an entity-level Ref draws no diagnostic', () => {
    const got = codes(`${E}Ref: Customer ?>? Order`);
    return got === '' ? undefined : got;
  });

  /* ---- refCardinality without a document ---- */

  check('refCardinality: an unknown nullability infers nothing', () => {
    const c = refCardinality({ operator: '>' }, [], {});
    return same([c.source.text, c.target.text, c.target.origin], ['1..*', '1..1', 'operator']);
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7: custom properties and Metadata blocks (spec §24.5, §24.7)
 *
 * The cases marked DBML are valid DBML 10.3.1, checked against
 * @dbml/core 10.3.1, or rejected by it where the case expects an error.
 * ----------------------------------------------------------------------- */

function runV07MetadataTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string): string =>
    resolveNames(parse(src)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const expectCodes = (src: string, want: string): string | undefined => {
    const got = codes(src);
    return got === want ? undefined : `diagnostics: '${got}', want '${want}'`;
  };
  const parseFails = (src: string, fragment: string): string | undefined => {
    try {
      parse(src);
      return 'parsed';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes(fragment) ? undefined : `wrong error: ${msg}`;
    }
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  /** Applied settings as name=value text, in index order. */
  const shown = (list: ReadonlyArray<AppliedSetting>): string[] =>
    list.map((a) => `${a.setting.name}=${settingValueText(a.setting.value)}`);
  const index = (src: string, options?: ParseOptions) => metadataIndex(flatten(parse(src, options)));
  const Q = "'''";

  const T = "Table users [owner: 'jane'] {\n  id    int [pk]\n  email varchar\n  Note: 'own note'\n}\n";

  /* ---- §24.5 custom properties ---- */

  check('§24.5 DBML: custom properties on a table, a column and a TableGroup draw nothing', () =>
    expectCodes("Table users [owner: 'data-team', sla_hours: '24'] {\n  id int [pk, masking: 'partial']\n}\nTableGroup g [team: 'growth'] {\n  users\n}", ''));
  check('§24.5 DBML: a setting written twice in one list draws a warning on the second', () =>
    expectCodes("Table t [owner: 'a', Owner: 'b'] {\n  id int\n}", 'warning:duplicate-setting'));
  check('§24.5 DBML: check and ref repeat by design', () =>
    expectCodes('Table a {\n  id int [pk]\n}\nTable b {\n  id int [pk]\n}\nTable t {\n  x int [ref: > a.id, ref: > b.id, check: `x > 0`, check: `x < 9`]\n}', ''));

  /* ---- §24.7.1 kinds ---- */

  check('§24.7.1 DBML: Table, Column, TableGroup and Note in a document without a version', () => {
    const src = `${T}TableGroup g {\n  users\n}\nNote n {\n  'sticky'\n}\nMetadata Table users {\n  team: 'web'\n}\nMetadata Column users.email {\n  pii: 'yes'\n}\nMetadata TableGroup g {\n  color: #123456\n}\nMetadata Note n {\n  color: none\n}`;
    const i = index(src);
    return expectCodes(src, '') ?? same([shown(i.entity('users')), shown(i.field('users', undefined, 'email')), shown(i.tableGroup('g')), shown(i.note('n'))],
      [['team=web'], ['pii=yes'], ['color=#123456'], ['color=none']]);
  });
  check('§24.7.1 DBML: kind words are case-insensitive', () => {
    const src = `${T}metadata TABLE users {\n  team: 'web'\n}`;
    return expectCodes(src, '') ?? same(shown(index(src).entity('users')), ['team=web']);
  });
  check('§24.7.1 DBML: a word that names no kind is an error', () =>
    expectCodes(`${T}enum E {\n  a\n}\nMetadata Enum E {\n  owner: 'x'\n}`, 'error:unknown-metadata-kind'));
  check('§24.7.1: an xDBML kind requires xdbml: 0.7 or later', () =>
    same([codes(`${T}Metadata Entity users {\n  team: 'x'\n}`), codes(`xdbml: 0.6\n${T}Metadata Field users.id {\n  note: 'x'\n}`)],
      ['error:construct-requires-version', 'error:construct-requires-version']));
  check('§24.7.1: Entity, Field, Container and its synonyms, View and DiagramView with xdbml: 0.7', () => {
    const src = "xdbml: 0.7\nSchema sales [type: schema] {\n  Entity orders {\n    id int\n    addr object {\n      city varchar\n    }\n  }\n  View open_orders {\n    id int\n  }\n}\nDiagramView dv {\n  Tables {\n    sales.orders\n  }\n}\nMetadata Entity sales.orders {\n  team: 'x'\n}\nMetadata Field orders.addr.city {\n  note: 'City'\n}\nMetadata Schema sales {\n  color: #abcdef\n}\nMetadata View open_orders {\n  headercolor: #fedcba\n}\nMetadata DiagramView dv {\n  note: 'Orders', x_owner: 'ops'\n}";
    const i = index(src);
    return expectCodes(src, '') ?? same([
      shown(i.entity('orders', 'sales')), shown(i.field('orders', 'sales', 'addr.city')), shown(i.container('sales')),
      shown(i.view('open_orders', 'sales')), shown(i.diagramView('dv')),
    ], [['team=x'], ['note=City'], ['color=#abcdef'], ['headercolor=#fedcba'], ['note=Orders', 'x_owner=ops']]);
  });
  check('§24.7.1: a Metadata block inside a Container is a syntax error', () =>
    parseFails("xdbml: 0.7\nContainer c {\n  Metadata Table t {\n    owner: 'x'\n  }\n}", 'never appears in a Container'));
  check('§24.7.1: a field and an entity may be named Metadata', () =>
    expectCodes("Table Metadata {\n  metadata json\n}\nMetadata Table Metadata {\n  owner: 'x'\n}", ''));

  /* ---- §24.7.2 targets ---- */

  check('§24.7.2 DBML: a schema-qualified table and column', () => {
    const src = "Table core.orders {\n  id int\n}\nMetadata Table core.orders {\n  owner: 'o'\n}\nMetadata Column core.orders.id {\n  pii: 'no'\n}";
    const i = index(src);
    return expectCodes(src, '') ?? same([shown(i.entity('core.orders')), shown(i.field('core.orders', undefined, 'id'))], [['owner=o'], ['pii=no']]);
  });
  check('§24.7.2 DBML: an alias names the entity', () => {
    const src = "Table users as U {\n  id int\n}\nMetadata Table U {\n  owner: 'x'\n}\nMetadata Column U.id {\n  pii: 'no'\n}";
    const i = index(src);
    return expectCodes(src, '') ?? same([shown(i.entity('users')), shown(i.field('users', undefined, 'id'))], [['owner=x'], ['pii=no']]);
  });
  check('§24.7.2 DBML: quoted names', () => {
    const src = 'Table "my table" {\n  "my col" int\n}\nMetadata Column "my table"."my col" {\n  owner: \'x\'\n}';
    return expectCodes(src, '') ?? same(shown(index(src).field('my table', undefined, 'my col')), ['owner=x']);
  });
  check('§24.7.2: a bare name finds an entity in a Container when only one carries it', () => {
    const src = "xdbml: 0.7\nContainer core [type: schema] {\n  Table users {\n    id int\n  }\n}\nMetadata Table users {\n  owner: 'x'\n}";
    return expectCodes(src, '') ?? same(shown(index(src).entity('users', 'core')), ['owner=x']);
  });
  check('§24.7.2 DBML: a field a TablePartial injects is a field of the entity', () => {
    const src = "TablePartial stamps {\n  created_at timestamp\n}\nTable t {\n  id int\n  ~stamps\n}\nMetadata Column t.created_at {\n  owner: 'x'\n}";
    return expectCodes(src, '') ?? same(shown(index(src).field('t', undefined, 'created_at')), ['owner=x']);
  });
  check('§24.7.2 DBML: a target that names nothing is an error', () =>
    same([codes(`${T}Metadata Table nobody {\n  owner: 'x'\n}`), codes(`${T}Metadata Column users.nothing {\n  owner: 'x'\n}`)],
      ['error:unresolved-metadata-target', 'error:unresolved-metadata-target']));
  check('§24.7.2: Metadata Table on a View is an error naming the View', () => {
    const d = resolveNames(parse("xdbml: 0.7\nView v {\n  id int\n}\nMetadata Table v {\n  owner: 'x'\n}")).diagnostics;
    return d.length === 1 && d[0].code === 'unresolved-metadata-target' && d[0].message.includes('Metadata View v') ? undefined : d.map((x) => x.message).join(' | ');
  });

  /* ---- §24.7.3 settings ---- */

  check('§24.7.3 DBML: note, headercolor and custom properties on a table, a multi-line note included', () => {
    const src = `${T}Metadata Table users {\n  note: ${Q}\n  Accounts\n  ${Q}\n  headercolor: #3498DB\n  x_team: 'web'\n}`;
    return same(shown(index(src).entity('users')), ['note=Accounts\n', 'headercolor=#3498DB', 'x_team=web']);
  });
  check('§24.7.3: the body is a list body: commas and semicolons separate lines', () => {
    const src = `${T}Metadata Table users { a: '1', b: '2'; c: '3' }`;
    return same(shown(index(src).entity('users')), ['a=1', 'b=2', 'c=3']);
  });
  check('§24.7.3 DBML: a flag in the body is a syntax error', () =>
    parseFails(`${T}Metadata Column users.id {\n  pk\n}`, "'key: value' lines only"));
  check('§24.7.3 DBML: a block in the body is a syntax error', () =>
    parseFails(`${T}Metadata Table users {\n  Note { 'x' }\n}`, "'key: value' lines only"));
  check('§24.7.3 DBML: a key written twice in one block is an error', () =>
    expectCodes(`${T}Metadata Table users {\n  team: 'a'\n  team: 'b'\n}`, 'error:duplicate-metadata-setting'));
  check('§24.7.3 DBML: a note that is not a string, a color that is not a color', () =>
    expectCodes(`${T}Metadata Table users {\n  note: 42\n  headercolor: red\n}`, 'error:invalid-metadata-value error:invalid-metadata-value'));
  check('§24.7.3 DBML: note on a sticky note is a custom property', () => {
    const src = "Note n {\n  'text'\n}\nMetadata Note n {\n  note: 'x'\n}";
    return expectCodes(src, '') ?? same(shown(index(src).note('n')), ['note=x']);
  });
  check('§24.7.3 DBML: synonyms, a field setting and a color on a Column draw warnings and read as custom properties', () => {
    const src = `${T}Metadata Table users {\n  synonyms: 'clients'\n}\nMetadata Column users.id {\n  pk: 'true'\n  headercolor: #111111\n}`;
    const i = index(src);
    return expectCodes(src, 'warning:metadata-custom-property warning:metadata-custom-property warning:metadata-custom-property')
      ?? same([shown(i.entity('users')), shown(i.field('users', undefined, 'id'))], [['synonyms=clients'], ['pk=true', 'headercolor=#111111']]);
  });
  check('§24.7.3: a custom property of a reserved name stands beside the element\'s own setting', () => {
    const doc = flatten(parse(`${T}Metadata Column users.id {\n  pk: 'true'\n}`));
    const users = doc.statements.find((s): s is EntityDeclaration => s.kind === 'EntityDeclaration')!;
    const id = users.body.find((b): b is FieldDeclaration => b.kind === 'FieldDeclaration' && b.name === 'id')!;
    const merged = withMetadata(id.settings, metadataIndex(doc).field('users', undefined, 'id'));
    return same(merged.settings.map((x) => `${x.name}=${settingValueText(x.value)}`), ['pk=(flag)', 'pk=true']);
  });
  check('§24.7.3: a diagram view takes note and custom properties of any name (v0.7.1)', () =>
    expectCodes("xdbml: 0.7\nTable t {\n  id int\n}\nDiagramView dv {\n  Tables {\n    t\n  }\n}\nMetadata DiagramView dv {\n  owner: 'x'\n}", ''));
  check('§24.7.3 DBML: settings in brackets after the target apply nothing, with a warning', () => {
    const src = `${T}Metadata Table users [team: 'y'] {\n  x_a: 'b'\n}`;
    return expectCodes(src, 'warning:metadata-brackets-ignored') ?? same(shown(index(src).entity('users')), ['x_a=b']);
  });

  /* ---- §24.7.4 precedence ---- */

  check('§24.7.4 DBML: a block replaces the element\'s own setting, with a warning naming both values', () => {
    const src = `${T}Metadata Table users {\n  owner: 'scott'\n}`;
    const d = resolveNames(parse(src)).diagnostics;
    return same(shown(index(src).entity('users')), ['owner=scott'])
      ?? (d.length === 1 && d[0].code === 'metadata-override' && d[0].message.includes("'jane'") && d[0].message.includes("'scott'") ? undefined : d.map((x) => x.message).join(' | '));
  });
  check('§24.7.4: the note of a Note element is the element\'s own', () =>
    expectCodes(`${T}Metadata Table users {\n  note: 'block note'\n}`, 'warning:metadata-override'));
  check('§24.7.4 DBML: of two blocks, the later applies', () => {
    const src = `${T}Metadata Table users {\n  team: 'a'\n}\nMetadata Table users {\n  team: 'b'\n}`;
    return expectCodes(src, 'warning:metadata-override') ?? same(shown(index(src).entity('users')), ['team=b']);
  });
  check('§24.7.4: a value set again unchanged draws nothing', () =>
    expectCodes(`${T}Metadata Table users {\n  owner: 'jane'\n}`, ''));

  /* ---- §24.7.5 imports ---- */

  const files: Record<string, string> = {
    '/m/schema.xdbml': "xdbml: 0.7\nTable users [owner: 'jane'] {\n  id int [pk]\n}\nContainer core [type: schema] {\n  Table orders {\n    id int\n  }\n}\nNote n {\n  'x'\n}\nMetadata Table users {\n  owner: 'david'\n}\nMetadata Column users.id {\n  pii: 'yes'\n}\nMetadata Table core.orders {\n  owner: 'o'\n}\nMetadata Container core {\n  note: 'Core'\n}\nMetadata Note n {\n  color: #abcdef\n}\n",
    '/m/team.xdbml': "xdbml: 0.7\nreuse * from './schema'\nMetadata Table users {\n  owner: 'alice'\n}\n",
  };
  const opts = (path: string): ParseOptions => ({
    filePath: path,
    readFile: (p: string) => {
      const text = files[p.replace(/\\/g, '/')];
      if (text === undefined) throw new Error(`no ${p}`);
      return text;
    },
  });
  const importing = (main: string) => {
    files['/m/main.xdbml'] = main;
    return index(main, opts('/m/main.xdbml'));
  };

  check('§24.7.5 DBML: importing everything brings every block, and the importing file reports nothing about them', () => {
    const main = "xdbml: 0.7\nuse * from './schema'\n";
    const i = importing(main);
    const d = resolveNames(parse(main, opts('/m/main.xdbml'))).diagnostics.map((x) => x.code).join(' ');
    return same([shown(i.entity('users')), shown(i.field('users', undefined, 'id')), shown(i.entity('orders', 'core')), shown(i.container('core')), shown(i.note('n')), d],
      [['owner=david'], ['pii=yes'], ['owner=o'], ['note=Core'], ['color=#abcdef'], '']);
  });
  check('§24.7.5 DBML: a file\'s own blocks come after those of its imports', () =>
    same(shown(importing("xdbml: 0.7\nuse * from './team'\n").entity('users')), ['owner=alice']));
  check('§24.7.5 DBML: a selective import brings the blocks of the element and its fields', () => {
    const i = importing("xdbml: 0.7\nuse {\n  table users\n} from './schema'\n");
    return same([shown(i.entity('users')), shown(i.field('users', undefined, 'id')), shown(i.note('n'))], [['owner=david'], ['pii=yes'], []]);
  });
  check('§24.7.5 DBML: an alias carries the blocks to the new name', () => {
    const i = importing("xdbml: 0.7\nuse {\n  table users as u\n} from './schema'\nMetadata Table u {\n  team: 'x'\n}\n");
    return same([shown(i.entity('u')), shown(i.field('u', undefined, 'id'))], [['owner=david', 'team=x'], ['pii=yes']]);
  });
  check('§24.7.5: an entity imported out of its Container takes its blocks along', () =>
    same(shown(importing("xdbml: 0.7\nuse {\n  table core.orders\n} from './schema'\n").entity('orders')), ['owner=o']));
  check('§24.7.5: an imported Container brings the blocks of its elements, renamed', () => {
    const i = importing("xdbml: 0.7\nuse {\n  container core as c\n} from './schema'\n");
    return same([shown(i.container('c')), shown(i.entity('orders', 'c'))], [['note=Core'], ['owner=o']]);
  });
  check('§24.7.4 DBML: the document\'s block applies after the imported ones, even written before the import', () => {
    const main = "xdbml: 0.7\nMetadata Table users {\n  owner: 'main'\n}\nuse * from './schema'\n";
    const i = importing(main);
    const d = resolveNames(parse(main, opts('/m/main.xdbml'))).diagnostics;
    return same(shown(i.entity('users')), ['owner=main'])
      ?? (d.length === 1 && d[0].code === 'metadata-override' && d[0].message.includes('/m/schema.xdbml') ? undefined : d.map((x) => x.message).join(' | '));
  });
  check('§24.7.4: flatten() lists the blocks last, those an import brings first and marked', () => {
    files['/m/main.xdbml'] = "xdbml: 0.7\nMetadata Table users {\n  owner: 'main'\n}\nuse * from './schema'\nTable z {\n  id int\n}\n";
    const flat = flatten(parse(files['/m/main.xdbml'], opts('/m/main.xdbml')));
    const tail = flat.statements.slice(-7).map((x) => (x.kind === 'MetadataDeclaration' ? `${x.target}${x.imported ? '*' : ''}` : x.kind));
    return same(tail, ['EntityDeclaration', 'users*', 'users.id*', 'core.orders*', 'core*', 'n*', 'users']);
  });

  check('§24.7: Monarch colors Metadata and its kind, and leaves a field named metadata alone', () => {
    const rule = (xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>)
      .find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('(metadata)'));
    if (!rule) return 'rule missing';
    const re = new RegExp(`^(?:${rule[0].source})`, 'i');
    const yes = ['Metadata Table users', 'metadata column users.id', 'Metadata TableGroup g', 'Metadata Schema s'];
    const no = ['metadata json', 'Metadata Tables x', 'metadata varchar'];
    const bad = [...yes.filter((t) => !re.test(t)), ...no.filter((t) => re.test(t))];
    return bad.length ? bad.join('; ') : undefined;
  });

  return results;
}

function runV07StickyNoteTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const diags = (src: string, options?: ParseOptions) => resolveNames(parse(src, options)).diagnostics;
  const codes = (src: string, options?: ParseOptions): string =>
    diags(src, options).map((d) => `${d.severity}:${d.code}`).join(' ');
  const expectCodes = (src: string, want: string): string | undefined => {
    const got = codes(src);
    return got === want ? undefined : `diagnostics: '${got}', want '${want}'`;
  };
  const parseFails = (src: string, fragment: string): string | undefined => {
    try {
      parse(src);
      return 'parsed';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return msg.includes(fragment) ? undefined : `wrong error: ${msg}`;
    }
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const placed = (src: string) => stickyNotes(flatten(parse(src))).map((n) => `${n.id}|${n.name}|${n.containerName ?? ''}|${n.topLevel ? 'top' : 'in'}`);
  const settingsOf = (src: string) => stickyNotes(flatten(parse(src))).map((n) => n.decl.settings.map((s) => `${s.name}=${settingValueText(s.value)}`).join(','));
  const V = 'xdbml: 0.7\n';
  const SALES = "Container sales [type: schema] {\n  Note: 'Order management'\n  Entity orders {\n    id int [pk]\n  }\n  Note states [color: #FBCFE8] {\n    'placed, shipped, delivered'\n  }\n}\n";

  /* ---- §19.2 sticky notes ---- */

  check('§19.2 DBML: a named top-level Note is a sticky note, its text the body', () => {
    const doc = parse("Table a {\n  id int\n}\nNote design {\n  '''\n  ## Title\n  - **one**\n  '''\n}\n");
    const n = stickyNotes(doc);
    return same(n.map((x) => [x.id, x.decl.body]), [['design', '## Title\n- **one**\n']]);
  });
  check('§19.2 DBML: a quoted name keeps its text', () => same(placed("Note \"Design decision\" {\n  'x'\n}"), ['Design decision|Design decision||top']));
  check('§19.2 DBML: a qualified name places the note in the implicit Container', () =>
    same(placed("Table core.users {\n  id int\n}\nNote core.legend {\n  'x'\n}"), ['core.legend|legend|core|in']));
  check('§19.2: the colon form after a name reads the same', () => same(placed("Note n: 'x'"), ['n||top'.replace('||', '|n||')]));
  check('§19.2 DBML: an empty body is a syntax error', () => parseFails('Note n {\n}', 'Expected string inside Note block'));
  check('§19.2 DBML: two strings in a body are a syntax error', () => parseFails("Note n {\n  'a'\n  'b'\n}", "Expected '}' closing Note"));
  check('§19.2 DBML: two sticky notes of one name are an error naming a sticky note', () => {
    const d = diags("Note n {\n  'a'\n}\nNote n {\n  'b'\n}");
    return d.length === 1 && d[0].code === 'duplicate-declaration' && d[0].message.includes('sticky note') ? undefined : d.map((x) => x.message).join(' | ');
  });
  check('§19.2: a sticky note may share its name with an entity', () => expectCodes("Table a {\n  id int\n}\nNote a {\n  'x'\n}", ''));

  /* ---- §19.3 settings ---- */

  check('§19.3 DBML: color and custom properties in the brackets, in a document without a version', () => {
    const src = "Note n [color: #F4D03F, author: \"docs\"] {\n  'x'\n}";
    return same(settingsOf(src), ['color=#F4D03F,author=docs']) ?? expectCodes(src, '');
  });
  check("§19.3: color none is valid bare or quoted, as a color is (§3.3)", () =>
    expectCodes("Note a [color: none] {\n  'x'\n}\nNote b [color: 'NONE'] {\n  'y'\n}\nNote c [color: #abc] {\n  'z'\n}", ''));
  check('§19.3 DBML: a color of another form is an error', () => {
    const d = diags("Note n [color: red] {\n  'x'\n}");
    return d.length === 1 && d[0].code === 'invalid-note-color' && d[0].severity === 'error' && d[0].message.includes("'red'") ? undefined : d.map((x) => x.message).join(' | ');
  });
  check('§19.3: a flag in the brackets is a custom property, with nothing reported', () => expectCodes("Note n [pinned] {\n  'x'\n}", ''));
  check('§19.3: a setting written twice draws a warning', () => expectCodes("Note n [author: 'a', author: 'b'] {\n  'x'\n}", 'warning:duplicate-setting'));

  /* ---- §19.4 sticky notes in a Container ---- */

  check('§19.4: a named Note in a Container is a sticky note, the unnamed one the Container note', () => {
    const doc = parse(V + SALES);
    const c = doc.statements.find((s) => s.kind === 'ContainerDeclaration');
    const kinds = c && c.kind === 'ContainerDeclaration' ? c.body.map((b) => b.kind) : [];
    return same(kinds, ['NoteBlock', 'EntityDeclaration', 'NoteDeclaration'])
      ?? same(placed(V + SALES), ['sales.states|states|sales|in'])
      ?? expectCodes(V + SALES, '');
  });
  check('§19.4: a sticky note in a Container needs xdbml: 0.7', () =>
    expectCodes(SALES, 'error:construct-requires-version') ?? expectCodes('xdbml: 0.6\n' + SALES, 'error:construct-requires-version'));
  check('§19.4: a sticky note in a Container takes a name of one segment', () =>
    parseFails(V + "Container s {\n  Note a.b {\n    'x'\n  }\n}", 'takes a name of one segment'));
  check('§19.4: notes of one name in two Containers are distinct', () =>
    expectCodes(V + "Container a {\n  Note n {\n    'x'\n  }\n}\nContainer b {\n  Note n {\n    'y'\n  }\n}", ''));
  check('§19.4: Note core.n and a note n in Container core are duplicates', () =>
    expectCodes(V + "Note core.n {\n  'x'\n}\nContainer core {\n  Note n {\n    'y'\n  }\n}", 'error:duplicate-declaration'));
  check('§19.4: an unqualified name resolves at the top level first, then to the one note in a Container', () => {
    const notes = stickyNotes(flatten(parse(V + SALES + "Note other {\n  'o'\n}")));
    const a = resolveStickyNote(notes, 'states');
    const b = resolveStickyNote(notes, 'sales.states');
    const c = resolveStickyNote(notes, 'nothing');
    return same([a.ok && a.note.id, b.ok && b.note.id, c.ok], ['sales.states', 'sales.states', false]);
  });
  check('§19.4: an unqualified name two Containers hold is ambiguous', () => {
    const notes = stickyNotes(parse(V + "Container a {\n  Note n {\n    'x'\n  }\n}\nContainer b {\n  Note n {\n    'y'\n  }\n}"));
    const r = resolveStickyNote(notes, 'n');
    return !r.ok && r.reason === 'ambiguous' ? undefined : JSON.stringify(r);
  });

  /* ---- §19.5 the note of the project ---- */

  check('§19.5: a top-level Note without a name is the note of the project', () => {
    const doc = parse("Table a {\n  id int\n}\nNote: 'Reference model'\n");
    return same(projectNote(doc)?.body, 'Reference model') ?? same(stickyNotes(doc).length, 0) ?? expectCodes("Note { 'x' }", '');
  });
  check("§19.5: the Project block's note applies, and an unnamed Note draws a warning", () => {
    const src = "Project p {\n  Note: 'own'\n}\nNote: 'other'\n";
    return same(projectNote(parse(src))?.body, 'own') ?? expectCodes(src, 'warning:duplicate-project-note');
  });
  check('§19.5: without a Project note, the first unnamed Note applies and the second draws a warning', () => {
    const src = "Note: 'first'\nNote: 'second'\n";
    return same(projectNote(parse(src))?.body, 'first') ?? expectCodes(src, 'warning:duplicate-project-note');
  });
  check('§19.5: an unnamed Note takes no settings', () => parseFails("Note [color: #abc] {\n  'x'\n}", 'Settings belong to a sticky note'));

  /* ---- §28 imports ---- */

  const files: Record<string, string> = {
    '/n/lib.xdbml': V + "Note: 'Project note of lib'\nNote legend [color: #abc] {\n  'Legend'\n}\n" + SALES + 'Metadata Note sales.states {\n  owner: \'ops\'\n}\n',
  };
  const opts = (path: string): ParseOptions => ({
    filePath: path,
    readFile: (p: string) => {
      const text = files[p.replace(/\\/g, '/')];
      if (text === undefined) throw new Error(`no ${p}`);
      return text;
    },
  });
  check('§19.5, §28.2: importing everything brings the sticky notes and leaves the note of the project behind', () => {
    const flat = flatten(parse(V + "use * from './lib'\n", opts('/n/main.xdbml')));
    return same(stickyNotes(flat).map((n) => n.id), ['legend', 'sales.states']) ?? same(projectNote(flat), undefined);
  });
  check('§28.3: a sticky note in a Container imports by its qualified name, lands at the top level, and brings its Metadata block', () => {
    const main = V + "use { note sales.states as order_states } from './lib'\n";
    files['/n/main.xdbml'] = main;
    const flat = flatten(parse(main, opts('/n/main.xdbml')));
    const ids = stickyNotes(flat).map((n) => n.id);
    const applied = metadataIndex(flat).note('order_states').map((a) => `${a.setting.name}=${settingValueText(a.setting.value)}`);
    return same(ids, ['order_states']) ?? same(applied, ['owner=ops']);
  });
  check('§28.3: a bare name imports the one note of that name in a Container', () => {
    const flat = flatten(parse(V + "use { note states } from './lib'\n", opts('/n/main.xdbml')));
    return same(stickyNotes(flat).map((n) => [n.id, n.decl.body]), [['states', 'placed, shipped, delivered']]);
  });

  /* ---- §24.7 Metadata ---- */

  check('§24.7.2: Metadata Note names a note in a Container, qualified or not', () => {
    const src = V + SALES + "Metadata Note sales.states {\n  owner: 'a'\n}\nMetadata Note states {\n  reviewer: 'b'\n}\n";
    const applied = metadataIndex(flatten(parse(src))).note('sales.states').map((a) => a.setting.name);
    return same(applied, ['owner', 'reviewer']) ?? expectCodes(src, '');
  });
  check("§24.7.4: a Metadata headercolor over a table's own draws the override warning and replaces it", () => {
    const src = "Table t [headercolor: #111111] {\n  id int\n}\nMetadata Table t {\n  headercolor: #222222\n}\n";
    const doc = flatten(parse(src));
    const t = doc.statements[0] as EntityDeclaration;
    const merged = withMetadata(t.settings, metadataIndex(doc).entity('t')).settings.map((x) => `${x.name}=${settingValueText(x.value)}`);
    return expectCodes(src, 'warning:metadata-override') ?? same(merged, ['headercolor=#222222']);
  });
  check("§24.7.4: a Metadata color over a note's own color draws the override warning", () =>
    expectCodes(V + SALES + 'Metadata Note sales.states {\n  color: #000000\n}\n', 'warning:metadata-override'));

  /* ---- §18 diagram views ---- */

  const DV = V + SALES + "Note other {\n  'o'\n}\n";
  const members = (src: string, view: string) => {
    const m = diagramViewMembers(parse(src), view);
    return m ? { notes: m.notes, containers: m.containers, entities: m.entities } : undefined;
  };
  check('§18.2: a listed Container contributes its sticky notes', () =>
    same(members(DV + 'DiagramView v {\n  Containers {\n    sales\n  }\n}', 'v'), { notes: ['sales.states'], containers: ['sales'], entities: ['sales.orders'] }));
  check('§18.2: Notes naming a note of the Container narrows what the Container contributes', () =>
    same(members(V + SALES.replace("  Note states", "  Note extra {\n    'e'\n  }\n  Note states") + 'DiagramView v {\n  Containers {\n    sales\n  }\n  Notes {\n    sales.states\n  }\n}', 'v')?.notes, ['sales.states']));
  check('§18.2: a top-level note under Notes leaves the Container contributing all of its notes', () =>
    same(members(DV + 'DiagramView v {\n  Containers {\n    sales\n  }\n  Notes {\n    other\n  }\n}', 'v')?.notes, ['sales.states', 'other']));
  check('§18.3: an unqualified note name resolves into a Container, and its frame is drawn', () =>
    same(members(DV + 'DiagramView v {\n  Notes {\n    states\n  }\n}', 'v'), { notes: ['sales.states'], containers: ['sales'], entities: [] })
      ?? expectCodes(DV + 'DiagramView v {\n  Notes {\n    states\n  }\n}', ''));

  return results;
}

function runV07LineageTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string, options?: ParseOptions): string =>
    resolveNames(parse(src, options)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const expectCodes = (src: string, want: string, options?: ParseOptions): string | undefined => {
    const got = codes(src, options);
    return got === want ? undefined : `diagnostics: '${got}', want '${want}'`;
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const dep = (src: string, k = 0): DepDeclaration =>
    parse(src).statements.filter((x): x is DepDeclaration => x.kind === 'DepDeclaration')[k];
  const ends = (src: string): string[] => collectLineage(flatten(parse(src))).map((l) =>
    `${l.id}:${l.dependencies.map((d) => `${pathToString(d.upstream.path)}->${pathToString(d.downstream.path)}`).join(';')}`);
  const settings = (list: ReadonlyArray<{ name: string; value: Parameters<typeof settingValueText>[0] }>): string[] =>
    list.map((x) => `${x.name}=${settingValueText(x.value)}`);
  const T = 'Table a {\n  x int\n  y int\n}\nTable b {\n  x int\n  y int\n}\nTable c {\n  x int\n}\n';
  const V = 'xdbml: 0.7\n';

  /* ---- §27.2 forms ---- */

  check('§27.2: the short form reads the arrow from upstream to downstream', () => {
    const d = dep(`${T}Dep: a -> b`);
    return same([d.form, d.name, pathToString(d.dependencies[0].upstream.path), pathToString(d.dependencies[0].downstream.path), d.dependencies[0].arrow],
      ['short', undefined, 'a', 'b', '->']);
  });
  check('§27.1: `b <- a` states the dependency `a -> b`', () => {
    const d = dep(`${T}Dep: b.x <- a.y`);
    return same([pathToString(d.dependencies[0].upstream.path), pathToString(d.dependencies[0].downstream.path), d.dependencies[0].arrow], ['a.y', 'b.x', '<-']);
  });
  check('§27.2, §27.4: a name before the colon, bare or quoted', () =>
    same([dep(`${T}Dep load: a -> b`).name, dep(`${T}Dep "load orders": a -> b`).name], ['load', 'load orders']));
  check('§27.2: brackets before the colon apply, and those after the dependency take precedence', () =>
    same(settings(depSettings(dep(`${T}Dep n [note: 'x', owner: 'o']: a -> b [note: 'y']`))), ['note=y', 'owner=o']));
  check('§27.2: in a block, the body takes precedence over the brackets, a Note included', () => {
    const d = dep(`${T}Dep n [note: 'brackets', owner: 'o', color: #111] {\n  a -> b\n  owner: 'body'\n  Note {\n    'from the body'\n  }\n}`);
    return same(settings(depSettings(d)), ['note=from the body', 'owner=body', 'color=#111']);
  });
  check('§27.2: brackets after a dependency in a block concern that dependency alone', () => {
    const d = dep(`${T}Dep n {\n  a.x -> b.x [note: 'cast to int']\n  a.y -> b.x\n}`);
    return same([settings(d.dependencies[0].settings), settings(d.dependencies[1].settings), settings(depSettings(d))],
      [['note=cast to int'], [], []]);
  });
  check('§27.2: a block on one line, and an empty block', () =>
    same([dep(`${T}Dep n { a -> b }`).dependencies.length, dep(`${T}Dep n { }`).dependencies.length], [1, 0]));
  check('§3.10: `dep` still names a table, a field and a nested object', () =>
    expectCodes(`${T}Table dep {\n  dep int\n  meta object {\n    dep int\n  }\n}\nDep: a -> dep\nDep: a.x -> dep.dep`, ''));
  check("§27.2: 'Dep' is case-insensitive, like every keyword", () =>
    same(dep(`${T}DEP: a -> b`).form, 'short'));

  /* ---- §27.2 inline form, collectLineage ---- */

  check('§27.2: inline deps gather after the declarations, the entity before its fields', () =>
    same(ends(`${T}Table d [dep: <- a] {\n  x int [dep: <- a.x, dep: -> c.x]\n}\nDep: a -> b`),
      ['dep:0:a->b', 'dep:1:a->d', 'dep:2:a.x->d.x', 'dep:3:d.x->c.x']));
  check('§27.1: an inline dep on a nested field names it with its path, through [*]', () =>
    same(ends(`${V}${T}Table o {\n  items array [object {\n    sku varchar [dep: <- a.x]\n  }]\n}`), ['dep:0:a.x->o.items.[*].sku'])
      ?? expectCodes(`${V}${T}Table o {\n  items array [object {\n    sku varchar [dep: <- a.x]\n  }]\n}`, ''));
  check('§27.2: an inline dep in a Container names the entity with its Container', () =>
    same(ends(`${V}${T}Container s {\n  Entity t [dep: <- a] {\n    id int\n  }\n}`), ['dep:0:a->s.t']));
  check('§27.3: depColor reads #rgb and #rrggbb only', () =>
    same([depColor(depSettings(dep(`${T}Dep: a -> b [color: #abc]`))), depColor(depSettings(dep(`${T}Dep: a -> b [color: red]`)))], ['#abc', undefined]));

  /* ---- §27.1 endpoints ---- */

  check('§27.1: resolveLineage gives the element and the field of each end, by Dep id', () => {
    const src = `${V}${T}Container s {\n  View v {\n    n int\n  }\n}\nDep: s.v.n <- a\nDep: a.x -> zz`;
    const got = [...resolveLineage(parse(src))].map(([id, ds]) => [id, ds.map((d) => [d.upstream, d.downstream])]);
    return same(got, [
      ['dep:0', [[{ element: 'a', elementKind: 'entity' }, { element: 's.v', elementKind: 'view', field: 'n' }]]],
      ['dep:1', [[{ element: 'a', elementKind: 'entity', field: 'x' }, undefined]]],
    ]);
  });

  check('§27.1: an injected field is a field of the entity', () =>
    expectCodes(`${T}TablePartial audited {\n  loaded_at timestamp\n}\nTable d {\n  id int\n  ~audited\n}\nDep: a.x -> d.loaded_at`, ''));
  check('§11.16.3: a path naming an entity and a field reads as the field, with a warning', () =>
    expectCodes(`${V}${T}Container a {\n  Entity x {\n    id int\n  }\n}\nDep: a.x -> b.x`, 'warning:ambiguous-dep-endpoint'));
  check('§27.1: a bare name declared in two Containers asks for the Container', () => {
    const src = `${V}Container s1 {\n  Entity t {\n    id int\n  }\n}\nContainer s2 {\n  Entity t {\n    id int\n  }\n}\nTable z {\n  id int\n}\nDep: t -> z`;
    const d = resolveNames(parse(src)).diagnostics;
    return same(d.map((x) => x.code), ['unresolved-dep-endpoint']) ?? (d[0].message.includes('several Containers') ? undefined : d[0].message);
  });
  check('§27.1: a field a View does not declare names nothing', () =>
    expectCodes(`${V}${T}View v {\n  x int\n}\nDep: a.y -> v.y`, 'error:unresolved-dep-endpoint'));
  check('§11.5: a nested path that the type does not hold is reported', () =>
    expectCodes(`${V}${T}Table o {\n  p object {\n    id int\n  }\n}\nDep: o.p.nope -> b.x`, 'error:unresolved-field'));
  check('§27.1: the field of an Edge is no endpoint', () =>
    expectCodes(`${V}${T}Edge e [source: a, target: b] {\n  w int\n}\nDep: e.w -> b.x`, 'error:invalid-dep-endpoint'));
  check('§27.1: a dep in the brackets of an Edge is an error', () =>
    expectCodes(`${V}${T}Edge e [source: a, target: b, dep: <- a] {\n  w int\n}`, 'error:misplaced-dep'));
  check('§27.2: a dep on a Ref or in a Type is an error', () =>
    expectCodes(`${V}${T}Ref: a.x > b.x [dep: <- c]\nType t {\n  v int [dep: <- c.x]\n}`, 'error:misplaced-dep error:misplaced-dep'));

  /* ---- §27.4 rules ---- */

  check('§27.4: a reversed pair and a pair at another level are other dependencies', () =>
    expectCodes(`${T}Dep: a -> b\nDep: b -> a\nDep: a.x -> b.x\nDep: a -> b.x`, ''));
  check('§27.4: a dependency stated twice in one block', () =>
    expectCodes(`${T}Dep n {\n  a.x -> b.x\n  b.x <- a.x\n}`, 'error:duplicate-dep'));
  check('§27.4: the same dependency written with and without its Container is stated twice', () =>
    expectCodes(`${V}Container s {\n  Entity t {\n    id int\n  }\n}\nTable z {\n  id int\n}\nDep: t.id -> z.id\nDep: s.t.id -> z.id`, 'error:duplicate-dep'));
  check('§27.4: two fields of one entity may depend on each other', () =>
    expectCodes(`${T}Dep: a.x -> a.y`, ''));
  check('§27.3: a color in the brackets of a dependency in a block is checked too', () =>
    expectCodes(`${T}Dep n {\n  a -> b [color: blue]\n}`, 'error:invalid-dep-color'));

  /* ---- §27.9 values that are no arrow ---- */

  check('§27.9: a dep flag, a number and a name are no arrow', () =>
    expectCodes(`${T}Table d [dep] {\n  x int [dep: -3]\n  y int [dep: a]\n}`, 'error:invalid-dep-value error:invalid-dep-value error:invalid-dep-value'));
  check('§27.9: in a v0.6 document, a TablePartial keeps a dep custom property with a warning, and an arrow is an error', () =>
    expectCodes(`xdbml: 0.6\n${T}TablePartial p [dep: 'x'] {\n  f int [dep: <- a.x]\n}`, 'warning:invalid-dep-value error:dep-in-partial'));
  check('§27.9: an arrow is a dependency in a document declaring v0.6', () =>
    same(ends(`xdbml: 0.6\n${T}Table d [dep: <- a] {\n  x int\n}`), ['dep:0:a->d']));

  /* ---- §27.8 modules ---- */

  const files: Record<string, string> = {
    '/l/lib.xdbml': `${T}Table d [dep: <- c] {\n  x int\n}\nDep load {\n  a -> b\n}\n`,
  };
  const opts = (path: string): ParseOptions => ({
    filePath: path,
    readFile: (p: string) => {
      const text = files[p.replace(/\\/g, '/')];
      if (text === undefined) throw new Error(`no ${p}`);
      return text;
    },
  });
  check('§27.8: importing everything brings the Deps, which resolve', () => {
    const doc = parse("use * from './lib'\n", opts('/l/main.xdbml'));
    const got = collectLineage(flatten(doc)).map((l) => l.name ?? l.id);
    return same(got, ['load', 'dep:1']) ?? expectCodes("use * from './lib'\n", '', opts('/l/main.xdbml'));
  });
  check('§27.8: a selective import brings no Dep, and an inline dep travels with its entity', () => {
    const src = "use { table c, table d } from './lib'\n";
    const doc = parse(src, opts('/l/main.xdbml'));
    return same(collectLineage(flatten(doc)).map((l) => l.inline?.carrier ?? l.name), ['d']) ?? expectCodes(src, '', opts('/l/main.xdbml'));
  });
  check('§27.8: an inline dep whose other end the import leaves behind names nothing', () =>
    expectCodes("use { table d } from './lib'\n", 'error:unresolved-dep-endpoint', opts('/l/main.xdbml')));
  check('§27.4, §28.2: a Dep that a Container-scoped import brings moves to the top level', () => {
    const src = `${V}Container k {\n  use * from './lib'\n}\n`;
    const flat = flatten(parse(src, opts('/l/main.xdbml')));
    const top = flat.statements.filter((x) => x.kind === 'DepDeclaration').length;
    return same(top, 1) ?? expectCodes(src, '', opts('/l/main.xdbml'));
  });

  /* ---- editors ---- */

  check('§27.2: Monarch colors Dep at the start of a line as a keyword, and dep before a type as a name', () => {
    const rules = xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>;
    const rule = rules.find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('^dep'));
    const arrows = rules.find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[1] === 'operators.lineage');
    if (!rule || !arrows) return 'rule missing';
    const re = new RegExp(rule[0].source, 'i');
    const asKeyword = ['Dep: a -> b', 'dep load: a -> b', 'Dep load [owner: \'x\'] {', 'Dep "load it" {', 'DEP {', 'Dep n [note: \'x\']: a -> b']
      .filter((t) => !re.test(t));
    const asName = ['  dep int', 'dep int [pk]', '  Dep: a -> b', 'depot: x'].filter((t) => re.test(t));
    const arrowRe = new RegExp(arrows[0].source);
    const arrowsMissed = ['a -> b', 'b <- a', '[dep: <- a]'].filter((t) => !arrowRe.test(t));
    return asKeyword.length || asName.length || arrowsMissed.length
      ? `keyword missed: ${asKeyword.join(' / ')}; name matched: ${asName.join(' / ')}; arrows missed: ${arrowsMissed.join(' / ')}`
      : undefined;
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7: module specifiers as DBML 10.3 reads them (spec §28.13)
 *
 * A specifier other than an https URL is read relative to the importing
 * file, with or without './'; without an extension the parser asks for
 * '<path>.xdbml', then '<path>.dbml'. The host may map a specifier first
 * (ParseOptions.resolveSpecifier, DBML's resolveFileSpecifier); without a
 * mapping an absolute path is an error, as in DBML's default layout.
 * ----------------------------------------------------------------------- */

function runV07ModuleSpecifierTests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const LIB = 'Table users {\n  id int [pk]\n}';
  const XLIB = 'xdbml: 0.7\nEntity members {\n  id int [pk]\n}';
  const reads: string[] = [];
  const host = (files: Record<string, string>, extra: Partial<ParseOptions> = {}): ParseOptions => ({
    filePath: '/p/main.xdbml',
    readFile: (key: string) => {
      reads.push(key);
      if (key in files) return files[key];
      throw new Error(`not found: ${key}`);
    },
    ...extra,
  });
  const imported = (src: string, options: ParseOptions): string => {
    reads.length = 0;
    return flatten(parse(src, options)).statements
      .filter((x) => x.kind === 'EntityDeclaration')
      .map((x) => (x as EntityDeclaration).name).join(',');
  };
  const failure = (src: string, options: ParseOptions): Error | undefined => {
    try {
      parse(src, options);
      return undefined;
    } catch (e) {
      return e as Error;
    }
  };
  const use = (from: string): string => `use * from '${from}'`;

  /* ---- the extension search ---- */

  check('§28.13: ./lib reads lib.xdbml', () => {
    const got = imported(use('./lib'), host({ '/p/lib.xdbml': XLIB }));
    return got === 'members' ? undefined : `imported '${got}'`;
  });
  check('§28.13: ./lib reads lib.dbml when there is no lib.xdbml, as a DBML project has', () => {
    const got = imported(use('./lib'), host({ '/p/lib.dbml': LIB }));
    return got === 'users' && reads.join(' ') === '/p/lib.xdbml /p/lib.dbml' ? undefined : `imported '${got}', reads ${reads.join(' ')}`;
  });
  check('§28.13: ./lib reads lib.xdbml when both files exist', () => {
    const got = imported(use('./lib'), host({ '/p/lib.xdbml': XLIB, '/p/lib.dbml': LIB }));
    return got === 'members' ? undefined : `imported '${got}'`;
  });
  check('§28.13: ./lib.dbml reads lib.dbml as written (until v0.7 the parser asked for lib.dbml.xdbml)', () => {
    const got = imported(use('./lib.dbml'), host({ '/p/lib.dbml': LIB }));
    return got === 'users' && reads.join(' ') === '/p/lib.dbml' ? undefined : `imported '${got}', reads ${reads.join(' ')}`;
  });
  check('§28.13: ./lib.xdbml reads lib.xdbml only', () => {
    const got = imported(use('./lib.xdbml'), host({ '/p/lib.xdbml': XLIB, '/p/lib.dbml': LIB }));
    return got === 'members' && reads.join(' ') === '/p/lib.xdbml' ? undefined : `imported '${got}', reads ${reads.join(' ')}`;
  });
  check('§28.13: a file found under neither name is an error naming both', () => {
    const e = failure(use('./nope'), host({}));
    return e && /'\/p\/nope\.xdbml' or '\/p\/nope\.dbml'/.test(e.message) ? undefined : `got ${e?.message ?? 'no error'}`;
  });

  /* ---- specifiers without './' ---- */

  check('§28.13: lib without ./ reads the same file as ./lib, as in DBML', () => {
    const got = imported(use('lib'), host({ '/p/lib.dbml': LIB }));
    return got === 'users' ? undefined : `imported '${got}'`;
  });
  check('§28.13: sub/lib reads sub/lib next to the importing file', () => {
    const got = imported(use('sub/lib'), host({ '/p/sub/lib.dbml': LIB }));
    return got === 'users' ? undefined : `imported '${got}'`;
  });
  check('§28.13: ../lib reads lib in the parent directory', () => {
    const got = imported(use('../lib'), host({ '/lib.dbml': LIB }));
    return got === 'users' ? undefined : `imported '${got}'`;
  });
  check('§28.13: @shared-users reads @shared-users next to the importing file by default', () => {
    const got = imported(use('@shared-users'), host({ '/p/@shared-users.dbml': LIB }));
    return got === 'users' ? undefined : `imported '${got}'`;
  });
  check('§28.13: backslashes read as forward slashes', () => {
    const got = imported(use('.\\\\sub\\\\lib'), host({ '/p/sub/lib.dbml': LIB }));
    return got === 'users' ? undefined : `imported '${got}'`;
  });
  check('§28.13: a source whose first folder looks like a host is a folder, as in DBML', () => {
    const got = imported(use('github.com/acme/schemas/core'), host({ '/p/github.com/acme/schemas/core.xdbml': XLIB }));
    return got === 'members' ? undefined : `imported '${got}'`;
  });
  check('§28.13: when that folder holds no such file, the error suggests https://', () => {
    const e = failure(use('github.com/acme/schemas/core.xdbml'), host({}));
    return e && e.message.includes("'https://github.com/acme/schemas/core.xdbml'") ? undefined : `got ${e?.message ?? 'no error'}`;
  });

  /* ---- the host's mapping ---- */

  check('§28.13: resolveSpecifier maps @shared/users to a library file', () => {
    const seen: string[] = [];
    const got = imported(use('@shared/users'), host({ '/libs/shared/users.dbml': LIB }, {
      resolveSpecifier: (spec, importer) => {
        seen.push(`${spec}|${importer}`);
        return spec.startsWith('@shared/') ? `/libs/shared/${spec.slice(8)}.dbml` : undefined;
      },
    }));
    return got === 'users' && seen.join() === '@shared/users|/p/main.xdbml' ? undefined : `imported '${got}', seen ${seen.join()}`;
  });
  check('§28.13: a specifier the host leaves alone resolves by default', () => {
    const got = imported(use('./lib'), host({ '/p/lib.xdbml': XLIB }, { resolveSpecifier: () => undefined }));
    return got === 'members' ? undefined : `imported '${got}'`;
  });
  check('§28.13: the key the host returns is read as is, with no extension search', () => {
    imported(use('@lib'), host({ '/libs/lib': LIB }, { resolveSpecifier: () => '/libs/lib' }));
    return reads.join(' ') === '/libs/lib' ? undefined : `reads ${reads.join(' ')}`;
  });

  /* ---- absolute paths ---- */

  check('§28.13: an absolute path the host does not map is an error at the string', () => {
    const e = failure(`xdbml: 0.7\n${use('/models/lib')}`, host({ '/models/lib.xdbml': XLIB }));
    return e instanceof ParseError && e.position.line === 2 && /absolute path/.test(e.message)
      ? undefined : `got ${e?.message ?? 'no error'}`;
  });
  check('§28.13: a host may accept an absolute path', () => {
    const got = imported(use('/models/lib'), host({ '/models/lib.xdbml': XLIB }, { resolveSpecifier: (s) => `${s}.xdbml` }));
    return got === 'members' ? undefined : `imported '${got}'`;
  });
  check('§28.13: C:\\models\\lib is a Windows path, not a URL scheme c:', () => {
    const e = failure(use('C:\\\\models\\\\lib'), host({}));
    return e && /absolute path/.test(e.message) && !/scheme/.test(e.message) ? undefined : `got ${e?.message ?? 'no error'}`;
  });
  check('§28.13: the host receives a Windows path as written; the key reads with forward slashes', () => {
    let seen = '';
    imported(use('C:\\\\models\\\\lib.xdbml'), host({ 'C:/models/lib.xdbml': XLIB }, { resolveSpecifier: (s) => { seen = s; return s; } }));
    return seen === 'C:\\models\\lib.xdbml' && reads.join(' ') === 'C:/models/lib.xdbml' ? undefined : `seen ${seen}, reads ${reads.join(' ')}`;
  });
  check('§28.13: classifyModuleSource tells absolute paths, URLs and relative specifiers apart', () => {
    const kinds = ['/x', 'C:/x', 'c:\\x', '\\\\server\\share\\x', 'https://h.example/x', './x', 'x', '@x', 'github.com/x']
      .map((s) => classifyModuleSource(s).kind).join(' ');
    return kinds === 'absolute absolute absolute absolute url relative relative relative relative' ? undefined : kinds;
  });
  check('§28.14: http:, file: and //host stay rejected', () => {
    const thrown = ['http://h.example/x', 'file:///x', '//h.example/x'].filter((s) => {
      try { classifyModuleSource(s); return false; } catch { return true; }
    });
    return thrown.length === 3 ? undefined : `rejected only ${thrown.join(', ')}`;
  });

  /* ---- inside a remote module ---- */

  const BASE = 'https://h.example/acme/v1/';
  check('§28.14.1: inside a remote module a specifier resolves against its URL, never through the host', () => {
    const got = imported(use(`${BASE}core.xdbml`), host({
      [`${BASE}core.xdbml`]: "use * from 'enums'",
      [`${BASE}enums.dbml`]: LIB,
    }, { resolveSpecifier: () => { throw new Error('the host was asked'); } }));
    return got === 'users' && reads.join(' ') === `${BASE}core.xdbml ${BASE}enums.xdbml ${BASE}enums.dbml`
      ? undefined : `imported '${got}', reads ${reads.join(' ')}`;
  });
  check('§28.14.1: a remote module cannot import a Windows or UNC path', () => {
    const bad = ['C:\\x\\lib', '\\\\server\\share\\lib'].filter((from) => {
      try { moduleCandidates(from, `${BASE}core.xdbml`); return false; } catch { return true; }
    });
    return bad.length === 2 ? undefined : `accepted ${2 - bad.length}`;
  });

  /* ---- cycles ---- */

  check('§28.15: a cycle through a .dbml file terminates', () => {
    const got = imported(use('./a'), host({
      '/p/a.xdbml': "use * from './b'\nTable a {\n  id int\n}",
      '/p/b.dbml': "use * from './a'\nTable b {\n  id int\n}",
    }));
    return got.split(',').sort().join() === 'a,b' ? undefined : `imported '${got}'`;
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7.1: x- custom properties (§24.5, §18.1), color as the header color
 * of an entity (§7.5), EntityPartial and EntityGroup (§17), the diagram
 * view categories Entities and EntityGroups (§18.1)
 * ----------------------------------------------------------------------- */

function runV071Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const diags = (src: string) => resolveNames(parse(src)).diagnostics;
  const codes = (src: string): string => diags(src).map((d) => `${d.severity}:${d.code}`).join(',');
  const failure = (src: string): string => {
    try { parse(src); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); }
  };
  const entity = (doc: XDbmlDocument, name: string): EntityDeclaration =>
    doc.statements.find((s) => s.kind === 'EntityDeclaration' && s.name === name) as EntityDeclaration;

  /* ---- §24.5, §18.1: x- custom properties ---- */

  check('§24.5: isCustomPropertyName reads x_ and x-, and nothing else', () => {
    const yes = ['x_owner', 'x-hackolade-id', 'x-a'];
    const no = ['owner', 'xowner', 'x', 'hackolade-id', 'note'];
    const bad = [...yes.filter((n) => !isCustomPropertyName(n)), ...no.filter((n) => isCustomPropertyName(n))];
    return bad.length ? bad.join('; ') : undefined;
  });
  check('§18.1: a diagram view takes a quoted x- custom property, as it takes x_', () => {
    const got = codes(`xdbml: 0.7
Table a { id int [pk] }
DiagramView "Customers and Vehicles" ["x-hackolade-id": 'Customers and Vehicles-1', x_owner: 'ops'] { Tables { a } }`);
    return got === '' ? undefined : got;
  });
  check('§18.1: a diagram view takes an unprefixed key, quoted or not, as a TableGroup does', () => {
    const got = codes(`xdbml: 0.7
Table a { id int [pk] }
TableGroup g [owner: 'ops', "hackolade-id": 'x'] { a }
DiagramView v1 [owner: 'ops'] { Tables { a } }
DiagramView v2 ["hackolade-id": 'x', color: '#fff'] { Tables { a } }`);
    return got === '' ? undefined : got;
  });
  check('§24.7.3: a Metadata DiagramView block applies x-, x_ and unprefixed custom properties', () => {
    const src = `xdbml: 0.7
Table a { id int [pk] }
DiagramView v { Tables { a } }
Metadata DiagramView v {
  "x-hackolade-id": 'v-1'
  x_team: 'core'
  owner: 'ops'
}`;
    const got = codes(src);
    if (got !== '') return got;
    const applied = metadataIndex(flatten(parse(src))).diagramView('v').map((a) => a.setting.name).join(',');
    return applied === 'x-hackolade-id,x_team,owner' ? undefined : `applied: ${applied}`;
  });
  check('§24.7.3: a color in a Metadata DiagramView block reads as a custom property, with a warning, as on a Column', () => {
    const got = codes(`xdbml: 0.7
Table a { id int [pk] }
DiagramView v { Tables { a } }
Metadata DiagramView v { color: '#fff' }`);
    return got === 'warning:metadata-custom-property' ? undefined : got;
  });
  check('Monarch colors a quoted x- key as a custom property, and only before a colon', () => {
    const rule = (xdbmlMonarchTokensProvider.tokenizer.root as unknown as ReadonlyArray<[RegExp, unknown]>)
      .find((r) => Array.isArray(r) && r[0] instanceof RegExp && r[0].source.startsWith('"x-'));
    if (!rule) return 'rule missing';
    const re = new RegExp(`^(?:${rule[0].source})`);
    const yes = ['"x-hackolade-id": \'a\'', '"x-a" :'];
    const no = ['"x-a" int', '"y-a": 1'];
    const bad = [...yes.filter((t) => !re.test(t)), ...no.filter((t) => re.test(t))];
    return bad.length ? bad.join('; ') : undefined;
  });

  /* ---- §7.5: color, the header color of an entity ---- */

  check('§7.5: in a document that declares a version, color on an entity reads as headercolor', () => {
    const doc = parse(`xdbml: 0.7
Entity a [color: #3498DB] { id int [pk] }`);
    const s = entity(doc, 'a').settings[0];
    return s.name === 'headercolor' && s.nameSource === 'color' ? undefined : `${s.name}/${s.nameSource}`;
  });
  check('§7.5: without a version declaration, color on a Table stays a custom property, as in DBML 10.3.1', () => {
    const doc = parse('Table a [color: #3498DB] { id int [pk] }');
    const s = entity(doc, 'a').settings[0];
    if (s.name !== 'color') return s.name;
    return effectiveHeaderColor(entity(doc, 'a'), tablePartials(doc)) ? 'a header color applied' : undefined;
  });
  check('§7.5: headercolor reads the same in every document', () => {
    for (const head of ['', 'xdbml: 0.6\n', 'xdbml: 0.7.1\n']) {
      const s = entity(parse(`${head}Table a [headercolor: #111] { id int }`), 'a').settings[0];
      if (s.name !== 'headercolor') return `${JSON.stringify(head)}: ${s.name}`;
    }
    return undefined;
  });
  check('§7.5: color on a View and on an EntityPartial is the header color; on a TableGroup it stays color', () => {
    const doc = parse(`xdbml: 0.7
Table t { id int [pk] }
View v [color: #111] { id int }
EntityPartial p [color: #222] { x int }
Entity e { ~p
  id int [pk] }
TableGroup g [color: #333] { t }`);
    const view = doc.statements.find((s) => s.kind === 'ViewDeclaration')!.settings[0].name;
    const carried = effectiveHeaderColor(entity(doc, 'e'), tablePartials(doc));
    const group = doc.statements.find((s) => s.kind === 'TableGroupDeclaration')!.settings[0].name;
    const got = `${view},${carried ? settingValueText(carried.value) : '-'},${group}`;
    return got === 'headercolor,#222,color' ? undefined : got;
  });
  check('§7.5, §24.5: color and headercolor in one list draw duplicate-setting; the first applies', () => {
    const src = 'xdbml: 0.7\nEntity a [color: #111, headercolor: #222] { id int }';
    const d = diags(src).filter((x) => x.code === 'duplicate-setting');
    if (d.length !== 1 || !/header color/.test(d[0].message)) return d.map((x) => x.message).join(' | ') || 'none';
    const doc = parse(src);
    const c = effectiveHeaderColor(entity(doc, 'a'), tablePartials(doc));
    return c && settingValueText(c.value) === '#111' ? undefined : 'second applied';
  });
  check('§7.5: without a version, color and headercolor on a Table are two settings', () => {
    const got = codes('Table a [color: #111, headercolor: #222] { id int }');
    return got === '' ? undefined : got;
  });
  check('§24.7.3: color in a Metadata Table block of a versioned document sets the header color', () => {
    const src = `xdbml: 0.7
Table a [headercolor: #111] { id int [pk] }
Metadata Entity a { color: #222 }`;
    const got = codes(src);
    if (got !== 'warning:metadata-override') return got;
    const applied = metadataIndex(flatten(parse(src))).entity('a').map((a) => `${a.setting.name}=${settingValueText(a.setting.value)}`).join(',');
    return applied === 'headercolor=#222' ? undefined : applied;
  });
  check('§24.7.3: color and headercolor in one Metadata block are one setting written twice', () => {
    const d = diags(`xdbml: 0.7
Table a { id int [pk] }
Metadata Table a {
  color: #111
  headercolor: #222
}`).filter((x) => x.code === 'duplicate-metadata-setting');
    return d.length === 1 && /header color/.test(d[0].message) ? undefined : d.map((x) => x.message).join(' | ') || 'none';
  });
  check('§24.7.3: without a version, color in a Metadata Table block is a custom property, with a warning naming both words', () => {
    const d = diags(`Table a { id int [pk] }
Metadata Table a { color: #111 }`).filter((x) => x.code === 'metadata-custom-property');
    return d.length === 1 && /'headercolor', or as 'color'/.test(d[0].message) ? undefined : d.map((x) => x.message).join(' | ') || 'none';
  });
  check('§7.5: an imported file keeps its own reading of color', () => {
    const files: Record<string, string> = {
      '/p/dbml.dbml': 'Table d [color: #111] { id int }',
      '/p/x.xdbml': 'xdbml: 0.7\nTable x [color: #222] { id int }',
    };
    const doc = flatten(parse("xdbml: 0.7\nuse * from './dbml'\nuse * from './x'", {
      filePath: '/p/main.xdbml',
      readFile: (k: string) => { if (k in files) return files[k]; throw new Error(`not found: ${k}`); },
    }));
    const got = ['d', 'x'].map((n) => entity(doc, n).settings[0].name).join(',');
    return got === 'color,headercolor' ? undefined : got;
  });

  /* ---- §17: EntityPartial and EntityGroup ---- */

  check('§17.1: EntityPartial injects its fields, its header color and its note, as TablePartial does', () => {
    const doc = parse(`xdbml: 0.7
EntityPartial audit [color: #F1C40F, note: 'Audited'] {
  created_at timestamp
}
Entity orders {
  id int [pk]
  ~audit
}`);
    const e = entity(doc, 'orders');
    const fields = effectiveFields(e, tablePartials(doc)).map((f) => f.field.name).join(',');
    const color = effectiveHeaderColor(e, tablePartials(doc));
    const note = effectiveNote(e, tablePartials(doc))?.body;
    const kw = (doc.statements.find((s) => s.kind === 'TablePartialDeclaration') as { keyword: string }).keyword;
    const got = `${kw}|${fields}|${color ? settingValueText(color.value) : '-'}|${note}`;
    return got === 'EntityPartial|id,created_at|#F1C40F|Audited' && codes(`xdbml: 0.7\nEntityPartial p { x int }\nEntity e { ~p }`) === ''
      ? undefined : got;
  });
  check('§17.2: EntityGroup groups entities, with its keyword kept; TableGroup keeps its own', () => {
    const doc = parse(`xdbml: 0.7
Entity a { id int [pk] }
Entity b { id int [pk] }
EntityGroup g1 [color: '#3498DB'] { a }
tablegroup g2 { b }`);
    const groups = doc.statements.filter((s) => s.kind === 'TableGroupDeclaration').map((s) => `${(s as { keyword: string }).keyword}:${(s as { members: string[] }).members.join('+')}`).join(',');
    return groups === 'EntityGroup:a,TableGroup:b' && resolveNames(doc).diagnostics.length === 0 ? undefined : groups;
  });
  check('§17: EntityPartial and EntityGroup parse without a version declaration, as Entity does', () => {
    const got = codes('EntityPartial p { x int }\nEntity e { id int [pk]\n ~p }\nEntityGroup g { e }');
    return got === '' ? undefined : got;
  });
  check('§17: diagnostics name the keyword as written', () => {
    const group = diags('xdbml: 0.7\nEntityGroup g { missing }').find((d) => d.code === 'unresolved-tablegroup-member')?.message ?? '';
    const tgroup = diags('TableGroup g { missing }').find((d) => d.code === 'unresolved-tablegroup-member')?.message ?? '';
    const inj = diags('xdbml: 0.7\nEntityPartial a { ~b\n x int }\nEntityPartial b { y int }').find((d) => d.code === 'partial-injection-in-partial')?.message ?? '';
    const ok1 = group.startsWith("EntityGroup member 'missing'") && tgroup.startsWith("TableGroup member 'missing'") && inj.startsWith("EntityPartial 'a'");
    return ok1 ? undefined : [group, tgroup, inj].join(' | ');
  });
  check('§15.5: an EntityPartial shares the namespace of entities, named as an EntityPartial', () => {
    const d = diags('xdbml: 0.7\nEntityPartial a { x int }\nEntity a { id int }').find((x) => x.code === 'name-collision');
    return d && /an EntityPartial/.test(d.message) ? undefined : d?.message ?? 'no diagnostic';
  });
  check('§28.3: entitypartial and entitygroup import as tablepartial and tablegroup do', () => {
    const files: Record<string, string> = {
      '/p/lib.xdbml': 'xdbml: 0.7\nEntityPartial audit { created_at timestamp }\nEntity a { id int [pk] }\nEntityGroup g { a }',
    };
    const doc = flatten(parse("xdbml: 0.7\nuse { entitypartial audit\n entitygroup g\n entity a } from './lib'\nEntity e { id int [pk]\n ~audit }", {
      filePath: '/p/main.xdbml',
      readFile: (k: string) => { if (k in files) return files[k]; throw new Error(`not found: ${k}`); },
    }));
    const kinds = doc.statements.map((s) => s.kind).filter((k) => k === 'TablePartialDeclaration' || k === 'TableGroupDeclaration').sort().join(',');
    const fields = effectiveFields(entity(doc, 'e'), tablePartials(doc)).map((f) => f.field.name).join(',');
    return kinds === 'TableGroupDeclaration,TablePartialDeclaration' && fields === 'id,created_at' ? undefined : `${kinds} / ${fields}`;
  });
  check('§24.7.1: Metadata EntityGroup targets a group in a document declaring 0.7, and needs that version', () => {
    const ok7 = codes("xdbml: 0.7\nTable a { id int }\nEntityGroup g { a }\nMetadata EntityGroup g { note: 'x' }");
    const dbml = codes("Table a { id int }\nTableGroup g { a }\nMetadata EntityGroup g { note: 'x' }");
    return ok7 === '' && dbml === 'error:construct-requires-version' ? undefined : `${ok7} / ${dbml}`;
  });

  /* ---- §18.1: Entities and EntityGroups ---- */

  check('§18.1: Entities and EntityGroups list what Tables and TableGroups list', () => {
    const src = `xdbml: 0.7
Entity a { id int [pk] }
Entity b { id int [pk] }
Entity c { id int [pk] }
EntityGroup g { b }
DiagramView v {
  Entities { a }
  EntityGroups { g }
}`;
    const doc = parse(src);
    const m = diagramViewMembers(doc, 'v');
    const got = m ? [...m.entities].sort().join(',') : 'none';
    const cats = (doc.statements.find((s) => s.kind === 'DiagramViewDeclaration') as { categories: { category: string; keyword: string }[] })
      .categories.map((c) => `${c.keyword}>${c.category}`).join(',');
    return got === 'a,b' && cats === 'Entities>Tables,EntityGroups>TableGroups' && codes(src) === '' ? undefined : `${got} / ${cats} / ${codes(src)}`;
  });
  check('§18.1: Entities and Tables in one diagram view are one category written twice', () => {
    const d = diags('xdbml: 0.7\nTable a { id int }\nDiagramView v {\n Entities { a }\n Tables { a }\n}').filter((x) => x.code === 'duplicate-diagram-view-category');
    return d.length === 1 && /Tables is the DBML name of Entities/.test(d[0].message) ? undefined : d.map((x) => x.message).join(' | ') || 'none';
  });
  check('§18.5: Entities and EntityGroups need a version declaration; Tables and TableGroups do not', () => {
    const xd = codes('Table a { id int }\nTableGroup g { a }\nDiagramView v {\n Entities { a }\n EntityGroups { g }\n}');
    const dbml = codes('Table a { id int }\nTableGroup g { a }\nDiagramView v {\n Tables { a }\n TableGroups { g }\n}');
    return xd === 'error:construct-requires-version,error:construct-requires-version' && dbml === '' ? undefined : `${xd} / ${dbml}`;
  });
  check('§18.3: a wrong category points to the xDBML name in a versioned document', () => {
    const d = diags('xdbml: 0.7\nTable a { id int }\nEntityGroup g { a }\nDiagramView v { Entities { g } }').find((x) => x.code === 'diagram-view-wrong-category');
    return d && /an EntityGroup: list it under EntityGroups/.test(d.message) ? undefined : d?.message ?? 'none';
  });
  check('§17, §18.1: the parse error for an unknown category lists the new names', () => {
    const m = failure('xdbml: 0.7\nDiagramView v { Things { a } }');
    return /Entities \(or Tables\)/.test(m) && /EntityGroups \(or TableGroups\)/.test(m) ? undefined : m;
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7.2: source-to-target mapping in a Dep (spec §27.2, §27.3, §27.10,
 * §27.12), metrics (§27.11) and grain (§7.5)
 *
 * In a document that declares a version, a dependency line may name
 * several upstream ends, a block may mix the two levels, and a Dep carries
 * `source_query`, `source_database` (alias `dialect`) and, on each
 * dependency, a `transformation`. Without a version declaration these stay
 * DBML: one upstream end, one level per block, custom properties.
 * ----------------------------------------------------------------------- */

function runV072Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string, options?: ParseOptions): string =>
    resolveNames(parse(src, options)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const expectCodes = (src: string, want: string, options?: ParseOptions): string | undefined => {
    const got = codes(src, options);
    return got === want ? undefined : `diagnostics: '${got}', want '${want}'`;
  };
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const failure = (src: string): string => {
    try {
      parse(src);
      return 'no parse error';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const dep = (src: string, k = 0): DepDeclaration =>
    parse(src).statements.filter((x): x is DepDeclaration => x.kind === 'DepDeclaration')[k];
  const pairs = (src: string, options?: ParseOptions): string[] => collectLineage(flatten(parse(src, options))).flatMap((l) =>
    l.dependencies.map((d) => `${pathToString(d.upstream.path)}->${pathToString(d.downstream.path)}${d.transformation ? `:${d.transformation}` : ''}`));
  const T = 'Table a {\n  x int\n  y int\n}\nTable b {\n  x int\n  y int\n}\nTable c {\n  x int\n}\n';
  const V = 'xdbml: 0.7\n';

  /* ---- §27.2 several upstream ends ---- */

  check('§27.2: a line with several upstream ends keeps them in order, the first as upstream', () => {
    const d = dep(`${V}${T}Dep: a.x, a.y -> b.x`).dependencies[0];
    return same([pathToString(d.upstream.path), d.upstreams.map((u) => pathToString(u.path)), pathToString(d.downstream.path)],
      ['a.x', ['a.x', 'a.y'], 'b.x']);
  });
  check('§27.2: `b.x <- a.x, a.y` states the same dependencies as `a.x, a.y -> b.x`', () =>
    same(pairs(`${V}${T}Dep: b.x <- a.x, a.y`), pairs(`${V}${T}Dep: a.x, a.y -> b.x`)));
  check('§27.2: collectLineage gives one pair per upstream end, sharing the line and its settings', () => {
    const l = collectLineage(parse(`${V}${T}Dep n {\n  a.x, a.y -> b.x [note: 'full name']\n  a.x -> b.y\n}`))[0];
    const [p, q, r] = l.dependencies;
    return same([l.dependencies.length, p.line === q.line, p.settings === q.settings, q.line === r.line, settingValueText(p.settings[0].value)],
      [3, true, true, false, 'full name']);
  });
  check('§27.2: every line has its upstreams, one end included', () =>
    same(dep(`${T}Dep: a -> b`).dependencies[0].upstreams.map((u) => pathToString(u.path)), ['a']));
  check('§27.2: several upstream ends without a version declaration are a parse error, as in DBML', () => {
    const m = failure(`${T}Dep: a.x, a.y -> b.x`);
    return /need a version declaration/.test(m) ? undefined : m;
  });
  check('§27.2: the downstream end stays single, with either arrow', () => {
    const m = [failure(`${V}${T}Dep: a.x -> b.x, b.y`), failure(`${V}${T}Dep: b.x, b.y <- a.x`)];
    return m.every((x) => /one downstream end/.test(x)) ? undefined : m.join(' / ');
  });
  check('§27.2: a chained dependency is still a parse error', () => {
    const m = failure(`${V}${T}Dep: a -> b -> c`);
    return /one arrow/.test(m) ? undefined : m;
  });
  check('§27.4: an upstream end listed twice on one line states a dependency twice', () =>
    expectCodes(`${V}${T}Dep: a.x, a.x -> b.x`, 'error:duplicate-dep'));
  check('§27.4: a pair of a multi-end line stated again on its own line', () =>
    expectCodes(`${V}${T}Dep n {\n  a.x, a.y -> b.x\n  a.y -> b.x\n}`, 'error:duplicate-dep'));

  /* ---- §27.2 levels ---- */

  check('§27.2: a block may mix the entity level and the field level in a document that declares a version', () =>
    expectCodes(`${V}${T}Dep n {\n  a -> b\n  a.x -> b.x\n}`, ''));
  check('§27.2: without a version declaration, mixing levels stays an error, as in DBML', () => {
    const d = resolveNames(parse(`${T}Dep n {\n  a -> b\n  a.x -> b.x\n}`)).diagnostics;
    return same(d.map((x) => x.code), ['dep-mixed-level']) ?? (/declare a version/.test(d[0].message) ? undefined : d[0].message);
  });

  /* ---- §27.3 source_query and source_database ---- */

  check('§27.3: a block body holds the statement and its language; dialect reads as source_database, lowercased', () => {
    const l = collectLineage(parse(`${V}${T}Dep n [dialect: Snowflake] {\n  a.x -> b.x\n  source_query: 'SELECT x FROM a'\n}`))[0];
    return same([l.sourceQuery, l.sourceDatabase, l.settings.map((s) => `${s.name}/${s.nameSource}`)],
      ['SELECT x FROM a', 'snowflake', ['source_database/dialect', 'source_query/source_query']]);
  });
  check('§27.3: source_database in the body, quoted, in any casing', () =>
    same(collectLineage(parse(`${V}${T}Dep n {\n  a.x -> b.x\n  source_database: 'ANSI_SQL'\n}`))[0].sourceDatabase, 'ansi_sql'));
  check('§27.3: a multi-line source_query in the body', () => {
    const q = collectLineage(parse(`${V}${T}Dep n {\n  a.x -> b.x\n  source_query: '''\n    SELECT x\n    FROM a\n  '''\n}`))[0].sourceQuery ?? '';
    return /SELECT x/.test(q) && /FROM a/.test(q) ? undefined : JSON.stringify(q);
  });
  check('§27.3: source_query in brackets draws a warning and is not the statement', () => {
    const src = `${V}${T}Dep n [source_query: 'q1'] {\n  a.x -> b.x [source_query: 'q2']\n}\nDep m [source_query: 'q3']: a -> b`;
    return expectCodes(src, 'warning:source-query-in-settings warning:source-query-in-settings warning:source-query-in-settings')
      ?? same(collectLineage(parse(src)).map((l) => l.sourceQuery ?? null), [null, null]);
  });
  check('§27.3: without a version declaration, the settings stay custom properties', () => {
    const src = `${T}Dep n [dialect: snowflake, source_query: 'q'] {\n  a.x -> b.x [transformation: copy]\n  source_query: 'q2'\n}`;
    const l = collectLineage(parse(src))[0];
    return expectCodes(src, '') ?? same([l.sourceQuery ?? null, l.sourceDatabase ?? null, l.dependencies[0].transformation ?? null, l.settings[0].name],
      [null, null, null, 'dialect']);
  });
  check('§14.5: dialect on a View reads as source_database in a document that declares a version', () => {
    const view = (src: string) => parse(src).statements.find((s) => s.kind === 'ViewDeclaration') as { settings: Array<{ name: string; nameSource: string }> };
    const a = view(`${V}View v [dialect: oracle] {\n  x int\n}`).settings[0];
    const b = view('View v [dialect: oracle] {\n  x int\n}').settings[0];
    return same([a.name, a.nameSource, b.name], ['source_database', 'dialect', 'dialect']);
  });
  check('§24.5: dialect and source_database in one settings list draw duplicate-setting', () => {
    const d = resolveNames(parse(`${V}View v [dialect: snowflake, source_database: oracle] {\n  x int\n}`)).diagnostics;
    return same(d.map((x) => x.code), ['duplicate-setting']) ?? (/the language of the query/.test(d[0].message) ? undefined : d[0].message);
  });

  /* ---- §27.10.1 transformations ---- */

  check('§27.10.1: the eight kinds, bare or quoted, in any casing', () => {
    const lines = TRANSFORMATIONS.map((k, i) => {
      const written = i % 2 ? `'${k.toUpperCase()}'` : k[0].toUpperCase() + k.slice(1);
      return ['identity', 'calculation', 'aggregation', 'conditional'].includes(k)
        ? `  a.x -> b.x [transformation: ${written}]` : `  a.y -> b [transformation: ${written}]`;
    });
    const got = TRANSFORMATIONS.map((k, i) => pairs(`${V}${T}Dep n {\n${lines[i]}\n}`)[0].split(':')[1]);
    return same(got, [...TRANSFORMATIONS]);
  });
  check('§27.10.1: a line without transformation carries no kind', () =>
    same(pairs(`${V}${T}Dep: a.x -> b.x\nDep: a -> b`), ['a.x->b.x', 'a->b']));
  check('§27.3: in the short form, the brackets after the dependency hold its transformation', () =>
    same(pairs(`${V}${T}Dep n [note: 'n']: a.x -> b.x [transformation: calculation]`), ['a.x->b.x:calculation']));
  check('§27.3: a transformation in the brackets of a block is no setting of its lines', () =>
    same(pairs(`${V}${T}Dep n [transformation: calculation] {\n  a.x -> b.x\n}`), ['a.x->b.x']));
  check('§27.10.1: the indirect kinds may end at the entity, from fields', () =>
    expectCodes(`${V}${T}Dep n {\n  a.x, b.y -> c [transformation: join]\n  a.y -> c [transformation: lookup]\n  b.x -> c [transformation: filter]\n}\nDep m {\n  a.x -> b [transformation: group_by]\n}`, ''));
  check('§27.10.1: a CASE: calculation of the value, conditional of the field it tests', () =>
    expectCodes(`${V}${T}Dep n [source_database: ansi_sql] {\n  a.x -> c.x [transformation: calculation]\n  a.y -> c.x [transformation: conditional]\n  source_query: '''\n    SELECT CASE WHEN y = 1 THEN x END AS x FROM a\n  '''\n}`, ''));

  /* ---- §27.10.5 checks ---- */

  check('§27.10.5: an unknown value of transformation is an error, a word or any other value', () =>
    expectCodes(`${V}${T}Dep n {\n  a.x -> b.x [transformation: copy]\n  a.y -> b.y [transformation: 3]\n}`, 'error:unknown-transformation error:unknown-transformation'));
  check('§27.10.1 (v0.7.3): derivation is no kind of transformation, and the message lists calculation', () => {
    const d = resolveNames(parse(`${V}${T}Dep: a.x -> b.x [transformation: derivation]`)).diagnostics;
    return same(d.map((x) => x.code), ['unknown-transformation'])
      ?? (/identity, calculation, aggregation/.test(d[0].message) ? undefined : d[0].message);
  });
  check('§27.10.5: a transformation between two entities is an error', () =>
    expectCodes(`${V}${T}Dep: a -> b [transformation: filter]`, 'error:transformation-between-entities'));
  check('§27.10.5: a transformation on a line where one pair is between entities is an error', () =>
    expectCodes(`${V}${T}Dep: a, b.x -> c [transformation: join]`, 'error:transformation-between-entities'));
  check('§27.10.5: identity, calculation, aggregation and conditional ending at an entity are errors', () =>
    expectCodes(`${V}${T}Dep n {\n  a.x -> c [transformation: identity]\n  a.y -> c [transformation: calculation]\n  b.x -> c [transformation: aggregation]\n  b.y -> c [transformation: conditional]\n}`,
      'error:transformation-target-mismatch error:transformation-target-mismatch error:transformation-target-mismatch error:transformation-target-mismatch'));
  check('§27.10.1: identity between two entities states a copy', () =>
    expectCodes(`${V}${T}Dep: a -> b [transformation: identity]`, '') ?? same(pairs(`${V}${T}Dep: a -> b [transformation: identity]`), ['a->b:identity']));
  check('§27.10.5: identity from a field to an entity is still an error', () =>
    expectCodes(`${V}${T}Dep: a.x -> b [transformation: identity]`, 'error:transformation-target-mismatch'));
  check('§27.10.5: a copy from two entities draws the identity warning', () =>
    expectCodes(`${V}${T}Dep: a, b -> c [transformation: identity]`, 'warning:transformation-mismatch'));
  check('§27.4: one field may play several roles: the same pair once for each kind', () =>
    expectCodes(`${V}${T}Dep n {\n  a.x -> c [transformation: join]\n  a.x -> c [transformation: group_by]\n  a.x -> c [transformation: filter]\n}`, ''));
  check('§27.4: the same pair with the same kind twice is stated twice', () => {
    const d = resolveNames(parse(`${V}${T}Dep n {\n  a.x -> c [transformation: join]\n  a.x -> c [transformation: join]\n}`)).diagnostics;
    return same(d.map((x) => x.code), ['duplicate-dep']) ?? (/both times as 'join'/.test(d[0].message) ? undefined : d[0].message);
  });
  check('§27.4: without a version declaration, the same pair twice is stated twice, whatever its custom properties', () =>
    expectCodes(`${T}Dep n {\n  a.x -> c [transformation: join]\n  a.x -> c [transformation: group_by]\n}`, 'error:duplicate-dep'));
  check('§27.10.5: identity with several upstream ends draws a warning', () =>
    expectCodes(`${V}${T}Dep: a.x, a.y -> b.x [transformation: identity]`, 'warning:transformation-mismatch'));
  check('§27.10.5: an indirect kind from a whole entity draws a warning, once per line', () =>
    expectCodes(`${V}${T}Dep n {\n  a, b -> c.x [transformation: filter]\n}\nDep m {\n  a -> b.x [transformation: lookup]\n}`, 'warning:indirect-from-entity warning:indirect-from-entity'));
  check('§27.10.5: a transformation on a dependency to a View field is read as for an entity', () =>
    expectCodes(`${V}${T}View v {\n  total int\n}\nDep: a.x -> v.total [transformation: aggregation]`, ''));

  /* ---- §27.10.4 target coverage, §7.5 grain ---- */

  check('§27.10.4: targetCoverage lists the fields a dependency feeds and those none does, nested and injected included', () => {
    const doc = parse(`${V}${T}TablePartial audited {\n  loaded_at timestamp\n}\nTable d {\n  id int\n  name varchar\n  meta object {\n    k int\n  }\n  ~audited\n}\nDep: a.x -> d.id\nDep: a.y -> d.meta.k\nDep: a -> d`);
    return same([targetCoverage(doc, 'd'), targetCoverage(doc, 'zz')], [{ fed: ['id', 'meta'], unfed: ['name', 'loaded_at'] }, undefined]);
  });
  check('§27.10.4: a Data Vault record source fed from an entity counts as fed', () => {
    const doc = parse(`${V}${T}Table hub {\n  id int\n  REC_SRC varchar\n}\nDep n {\n  a.x -> hub.id\n  a -> hub.REC_SRC\n  source_query: 'SELECT x AS id, \\'A\\' AS REC_SRC FROM a'\n}`);
    return same(targetCoverage(doc, 'hub'), { fed: ['id', 'REC_SRC'], unfed: [] }) ?? expectCodes(`${V}${T}Table hub {\n  id int\n  REC_SRC varchar\n}\nDep n {\n  a.x -> hub.id\n  a -> hub.REC_SRC\n}`, '');
  });
  check('§7.5: grainOf reads the grain of an entity and of a View', () => {
    const doc = parse(`${V}Table f [grain: 'One row per order'] {\n  id int\n}\nView m [grain: 'One row per month'] {\n  n int\n}\nTable g {\n  id int\n}`);
    return same(doc.statements.map((s) => grainOf(s as unknown as { settings: [] })), ['One row per order', 'One row per month', undefined]);
  });
  check('§24.7.3: grain in a Metadata block reads as a custom property, with a warning', () =>
    expectCodes(`${V}Table f {\n  id int\n}\nMetadata Table f {\n  grain: 'One row per order'\n}`, 'warning:metadata-custom-property'));

  /* ---- §27.8 modules ---- */

  const files: Record<string, string> = {
    '/l/lib.xdbml': `${V}${T}Dep load [dialect: snowflake] {\n  a.x, a.y -> b.x [transformation: calculation]\n  source_query: 'SELECT x || y AS x FROM a'\n}\n`,
  };
  const opts = (path: string): ParseOptions => ({
    filePath: path,
    readFile: (p: string) => {
      const text = files[p.replace(/\\/g, '/')];
      if (text === undefined) throw new Error(`no ${p}`);
      return text;
    },
  });
  check('editors: Monarch colors transformation, dialect and grain as setting keys, and the kinds as values', () => {
    const lang = xdbmlMonarchTokensProvider as unknown as { settingKeys: string[]; transformationValues: string[] };
    const keys = ['transformation', 'dialect', 'grain'].filter((k) => !lang.settingKeys.includes(k));
    return keys.length ? `missing keys: ${keys.join(', ')}` : same(lang.transformationValues, [...TRANSFORMATIONS]);
  });
  check('§27.8: importing everything brings a Dep with its upstream ends, transformation and statement', () => {
    const src = `${V}use * from './lib'\n`;
    const l = collectLineage(flatten(parse(src, opts('/l/main.xdbml'))))[0];
    return same([pairs(src, opts('/l/main.xdbml')), l.sourceQuery, l.sourceDatabase], [['a.x->b.x:calculation', 'a.y->b.x:calculation'], 'SELECT x || y AS x FROM a', 'snowflake'])
      ?? expectCodes(src, '', opts('/l/main.xdbml'));
  });

  return results;
}

/* -------------------------------------------------------------------------
 * v0.7.4: a type of several words written without quotes (spec §8.1)
 *
 * The words of a type written on the line of its declaration, up to the
 * settings or a separator, form one name, with the parameters of each
 * word, as the quoted form does: `timestamp with time zone` reads as
 * `"timestamp with time zone"`, with the warning `unquoted-type-name`.
 * DBML 10.3.1 rejects the unquoted form (checked against @dbml/core
 * 10.3.1); before 0.7.4, the parser read the words after the first as
 * further fields.
 * ----------------------------------------------------------------------- */

function runV074Tests (): TestResult[] {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => string | undefined): void => {
    try {
      const problem = fn();
      results.push(problem ? fail(name, problem) : ok(name));
    } catch (e) {
      results.push(fail(name, e instanceof Error ? e.message : String(e)));
    }
  };
  const codes = (src: string, options?: ParseOptions): string =>
    resolveNames(parse(src, options)).diagnostics.map((d) => `${d.severity}:${d.code}`).join(' ');
  const same = (got: unknown, want: unknown): string | undefined =>
    (JSON.stringify(got) === JSON.stringify(want) ? undefined : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  // `name:type` for each field of the first entity or partial, `+w` when
  // the type was written in words without quotes, `(p,s)` for parameters.
  const fieldTypes = (src: string): string[] => {
    const decl = parse(src).statements.find((s) => s.kind === 'EntityDeclaration' || s.kind === 'TablePartialDeclaration') as
      unknown as { body: { kind: string; name?: string; type?: { kind: string; name?: string; params?: string[]; unquotedWords?: true } }[] };
    return decl.body.filter((b) => b.kind === 'FieldDeclaration').map((f) => {
      const t = f.type!;
      return `${f.name}:${t.name ?? t.kind}${t.params ? `(${t.params.join(',')})` : ''}${t.unquotedWords ? '+w' : ''}`;
    });
  };
  const V = 'xdbml: 0.7\n';

  const REPORTED = `xdbml: 0.6.5

Project empty {
  targets: PostgreSQL
}

TablePartial Audit [synonyms: ['AUDIT'], x_hackolade_id: 'Audit-11265'] {
  Note: 'Reusable creation and last-update timestamps. The application must maintain the last-update value on changes.'
  "Created At" TIMESTAMP WITH TIME ZONE [not null, default: \`SYSTIMESTAMP\`, synonyms: ['CREATED_AT'], x_hackolade_id: 'Created At-97781']
  "Updated At" TIMESTAMP WITH TIME ZONE [not null, default: \`SYSTIMESTAMP\`, synonyms: ['UPDATED_AT'], x_hackolade_id: 'Updated At-44876']
}
`;

  check('§8.1: the reported partial parses, two fields typed TIMESTAMP WITH TIME ZONE, with their settings', () => {
    const p = parse(REPORTED).statements.find((s) => s.kind === 'TablePartialDeclaration') as unknown as { body: FieldDeclaration[] };
    const fields = p.body.filter((b) => b.kind === 'FieldDeclaration');
    return same(fieldTypes(REPORTED), ['Created At:TIMESTAMP WITH TIME ZONE+w', 'Updated At:TIMESTAMP WITH TIME ZONE+w'])
      ?? same(fields.map((f) => f.settings.map((s) => s.name).join(',')), ['not null,default,synonyms,x_hackolade_id', 'not null,default,synonyms,x_hackolade_id']);
  });
  check('§8.1: the reported partial draws one unquoted-type-name warning per field, on the type', () => {
    const d = resolveNames(parse(REPORTED)).diagnostics;
    return same(d.map((x) => `${x.severity}:${x.code}@${x.span.start.line}:${x.span.start.column}-${x.span.end.column}`),
      ['warning:unquoted-type-name@9:16-40', 'warning:unquoted-type-name@10:16-40'])
      ?? (d[0].message.includes('"TIMESTAMP WITH TIME ZONE"') ? undefined : `message: ${d[0].message}`);
  });
  check('§8.1: the words read as the quoted name, which draws no warning', () => {
    const quoted = `${V}Entity e {\n  a "TIMESTAMP WITH TIME ZONE"\n}`;
    return same(fieldTypes(quoted), ['a:TIMESTAMP WITH TIME ZONE']) ?? same(codes(quoted), '');
  });
  check('§8.1: an even number of words after the first no longer reads as further fields', () =>
    same(fieldTypes(`${V}Entity e {\n  created_at TIMESTAMP WITH LOCAL TIME ZONE [not null]\n  b int\n}`),
      ['created_at:TIMESTAMP WITH LOCAL TIME ZONE+w', 'b:int']));
  check('§8.1: without settings, the line break ends the type', () =>
    same(fieldTypes(`${V}Entity e {\n  a double precision\n  b int\n}`), ['a:double precision+w', 'b:int']));
  check('§8.1: each word keeps its parameters, as written', () =>
    same(fieldTypes(`${V}Entity e {\n  a TIMESTAMP(6) WITH TIME ZONE\n  b INTERVAL DAY(2) TO SECOND(6)\n  c character varying(255) [not null]\n  d decimal(10, 2) unsigned\n}`),
      ['a:TIMESTAMP(6) WITH TIME ZONE+w', 'b:INTERVAL DAY(2) TO SECOND(6)+w', 'c:character varying(255)+w', 'd:decimal(10, 2) unsigned+w']));
  check('§8.1: the array brackets of the target follow the last word', () =>
    same(fieldTypes(`${V}Entity e {\n  a timestamp with time zone[]\n}`), ['a:timestamp with time zone[]+w']));
  check('§8.1: spaces and a comment between the words read as one space', () =>
    same(fieldTypes(`${V}Entity e {\n  a timestamp   with /* tz */ time zone\n}`), ['a:timestamp with time zone+w']));
  check('§8.1: a type of one word is read as before', () =>
    same(fieldTypes(`${V}Entity e {\n  a varchar(20) [pk]\n  b int\n  c text[]\n  d public.geometry\n}`), ['a:varchar(20)', 'b:int', 'c:text[]', 'd:public.geometry'])
      ?? same(codes(`${V}Entity e {\n  a varchar(20) [pk]\n  b int\n}`), ''));
  check('§3.9: fields that share a line read as before, the words of each one a field', () =>
    same((parse(`${V}Type Inner { value int  label varchar }`).statements[0] as unknown as { body: FieldDeclaration[] }).body
      .map((f) => `${f.name}:${(f.type as unknown as { name: string }).name}`), ['value:int', 'label:varchar'])
      ?? same(fieldTypes(`${V}Entity e { a int b varchar }`), ['a:int', 'b:varchar'])
      ?? same(fieldTypes(`${V}Entity e {\n  a int  b varchar }`), ['a:int', 'b:varchar'])
      ?? same(fieldTypes(`${V}Entity e {\n  a int, b timestamp }`), ['a:int', 'b:timestamp'])
      ?? same(codes(`${V}Entity e { a int b varchar }`), ''));
  check('§3.9: on a line that holds more than the declaration, the words need the quotes, as before', () => {
    try {
      parse(`${V}Entity e {\n  a double precision, b int\n}`);
      return 'parsed';
    } catch (e) {
      return e instanceof ParseError ? undefined : String(e);
    }
  });
  check('§3.10: a body element on the line of a field ends its type', () => {
    const doc = parse(`${V}Entity e {\n  a int Note: 'n'\n}\nEntity f {\n  a int indexes { a }\n}\nEntity g {\n  a int records { 1 }\n}`);
    const kinds = doc.statements.map((s) => (s as unknown as { body: { kind: string }[] }).body.map((b) => b.kind).join(','));
    return same(kinds, ['FieldDeclaration,NoteBlock', 'FieldDeclaration,IndexesBlock', 'FieldDeclaration,RecordsBlock']);
  });
  check('§8.1: words on the next line are not part of the type', () =>
    same(fieldTypes(`${V}Entity e {\n  a timestamp\n  with_tz int\n}`), ['a:timestamp', 'with_tz:int']));
  check('§8.1: nested fields, Type declarations, alternatives and tuple elements read the words too', () => {
    const doc = parse(`${V}Type stamp timestamp with time zone [note: 'UTC']
Entity e {
  meta object {
    at timestamp with time zone
  }
  v oneOf {
    when timestamp with time zone
    n int
  }
  pt array [
    [0] at timestamp with time zone
    [1] v double precision
  ]
}`);
    const type = doc.statements[0] as unknown as { scalarBase: { name: string }; settings: { name: string }[] };
    const body = (doc.statements[1] as unknown as { body: FieldDeclaration[] }).body;
    const meta = body[0].type as unknown as { fields: FieldDeclaration[] };
    const alts = (body[1].type as unknown as { alternatives: { name: string; type: { name: string } }[] }).alternatives;
    const tuple = (body[2].type as unknown as { elementType?: unknown; elements?: { name: string; type: { name: string } }[] });
    const elements = (tuple.elements ?? (tuple.elementType as { elements: { name: string; type: { name: string } }[] }).elements);
    return same([
      type.scalarBase.name, type.settings.map((s) => s.name).join(','),
      (meta.fields[0].type as unknown as { name: string }).name,
      alts.map((a) => `${a.name}:${a.type.name}`),
      elements.map((t) => `${t.name}:${t.type.name}`),
    ], [
      'timestamp with time zone', 'note',
      'timestamp with time zone',
      ['when:timestamp with time zone', 'n:int'],
      ['at:timestamp with time zone', 'v:double precision'],
    ]) ?? same(codes(`${V}Type stamp timestamp with time zone`), 'warning:unquoted-type-name');
  });
  check('§8.1: the element of an array keeps its name form, array [double precision] names the element double', () => {
    const doc = parse(`${V}Entity e {\n  a array [double precision]\n  b array [\n    at timestamp with time zone [not null]\n  ]\n}`);
    const body = (doc.statements[0] as unknown as { body: FieldDeclaration[] }).body;
    const el = (i: number) => body[i].type as unknown as { elementName?: string; elementType: { name: string }; elementSettings?: { name: string }[] };
    return same([el(0).elementName, el(0).elementType.name, el(1).elementName, el(1).elementType.name, el(1).elementSettings?.map((s) => s.name)],
      ['double', 'precision', 'at', 'timestamp with time zone', ['not null']]);
  });
  check('§8.1: the warning appears in a document of any version, and in DBML', () =>
    same([
      codes(`Table t {\n  a timestamp with time zone\n}`),
      codes(`xdbml: 0.5\nEntity t {\n  a timestamp with time zone\n}`),
      codes(`${V}Entity t {\n  a timestamp with time zone\n}`),
    ], ['warning:unquoted-type-name', 'warning:unquoted-type-name', 'warning:unquoted-type-name']));
  const files: Record<string, string> = {
    '/l/lib.xdbml': `${V}Entity audit {\n  at timestamp with time zone\n}\n`,
  };
  const opts = (path: string): ParseOptions => ({
    filePath: path,
    readFile: (p: string) => {
      const text = files[p.replace(/\\/g, '/')];
      if (text === undefined) throw new Error(`no ${p}`);
      return text;
    },
  });
  check('§8.1: an imported type keeps its reading, and its warning belongs to its own file', () => {
    const src = `${V}use * from './lib'\n`;
    const e = flatten(parse(src, opts('/l/main.xdbml'))).statements.find((s) => s.kind === 'EntityDeclaration') as unknown as { body: FieldDeclaration[] };
    return same((e.body[0].type as unknown as { name: string }).name, 'timestamp with time zone')
      ?? same(codes(src, opts('/l/main.xdbml')), '')
      ?? same(codes(files['/l/lib.xdbml'], opts('/l/lib.xdbml')), 'warning:unquoted-type-name');
  });

  return results;
}

function main (): void {
  console.log(`${CYAN}@xdbml/parse proof-of-concept test suite${RESET}`);
  console.log(`${DIM}examples directory: ${examplesDir}${RESET}`);
  const inline = runInlineTests();
  const examples = runExampleTests();
  const keywords = runKeywordConsistencyTests();
  const v062 = runV062Tests();
  const v063 = runV063Tests();
  const v065 = runV065Tests();
  const partialTests = runPartialInjectionTests();
  const quotedTests = runQuotedNameTests();
  const recordsTests = runV07RecordsTests();
  const optionalRefTests = runV07OptionalRefTests();
  const metadataTests = runV07MetadataTests();
  const noteTests = runV07StickyNoteTests();
  const lineageTests = runV07LineageTests();
  const specifierTests = runV07ModuleSpecifierTests();
  const v071Tests = runV071Tests();
  const v072Tests = runV072Tests();
  const v074Tests = runV074Tests();
  const corpus = runGrammarCorpusTests();
  const ir = report('Inline grammar tests', inline);
  const er = report('Official example files (xdbml/xdbml-spec/examples)', examples);
  const kr = report('Keyword-consistency tests (parser/src/keywords.ts vs parser)', keywords);
  const vr = report('v0.6.2 fixes', v062);
  const dr = report('v0.6.3 diagram views', v063);
  const fr = report('v0.6.5 internal definitions', v065);
  const pr = report('TablePartial injection (spec §17.1)', partialTests);
  const qr = report('v0.6.7 quoted names (spec §3.2, §20.1)', quotedTests);
  const rr = report('v0.7 records in the forms of DBML 10.3.1 (spec §26)', recordsTests);
  const or = report('v0.7 optional marks and cardinality (spec §11.1, §11.7, §11.8, §11.16)', optionalRefTests);
  const mr = report('v0.7 custom properties and Metadata blocks (spec §24.5, §24.7)', metadataTests);
  const nr = report('v0.7 sticky notes and the note of the project (spec §19)', noteTests);
  const lr = report('v0.7 data lineage (spec §27)', lineageTests);
  const sr = report('v0.7 module specifiers (spec §28.13)', specifierTests);
  const v71 = report('v0.7.1 x- custom properties, color, EntityPartial and EntityGroup (spec §24.5, §7.5, §17)', v071Tests);
  const v72 = report('v0.7.2 source-to-target mapping, metrics and grain (spec §27.2, §27.3, §27.10, §27.11, §7.5)', v072Tests);
  const v74 = report('v0.7.4 types of several words without quotes (spec §8.1)', v074Tests);
  const cr = report('v0.6.4 grammar test corpus (grammar/test-cases.md)', corpus);
  const totalPassed = ir.passed + er.passed + kr.passed + vr.passed + dr.passed + fr.passed + pr.passed + qr.passed + rr.passed + or.passed + mr.passed + nr.passed + lr.passed + sr.passed + v71.passed + v72.passed + v74.passed + cr.passed;
  const totalFailed = ir.failed + er.failed + kr.failed + vr.failed + dr.failed + fr.failed + pr.failed + qr.failed + rr.failed + or.failed + mr.failed + nr.failed + lr.failed + sr.failed + v71.failed + v72.failed + v74.failed + cr.failed;
  console.log(`\n${CYAN}== Summary ==${RESET}`);
  console.log(`  ${GREEN}${totalPassed} passed${RESET}, ${totalFailed > 0 ? RED : DIM}${totalFailed} failed${RESET}`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main();
