/**
 * @xdbml/from-mongodb
 *
 * Maps the inferred collection schemas produced by MongoDB's MCP server
 * (`collection-schema` tool, backed by mongodb-schema's getSimplifiedSchema)
 * to xDBML.
 *
 * The input types below are structural mirrors of mongodb-schema's
 * SimplifiedSchema output; this package has no runtime dependencies and
 * does not depend on mongodb-schema itself.
 *
 * Mapping rules:
 *   R1  scalar bsonType -> BSON-native xDBML type (see BSON_TYPE_MAP)
 *   R2  'Null' / 'Undefined' entries are nullability signals, not types:
 *       strip them; their absence on a single-type field yields [not null]
 *   R3  multiple scalar types after stripping -> union [t1, t2, ...],
 *       preserving the sample's frequency order
 *   R4  'Document' -> nested `name object { ... }` (recurse)
 *   R5  'Array' -> `name array [ ... ]`:
 *         one scalar element type      -> array [t]
 *         several scalar element types -> array [t1, t2]  (v0.3 sugar,
 *                                         folds to a union at parse time)
 *         Document element type        -> array [ <singular> object { } ]
 *   R6  scalar(s) + Document mixed at one field -> oneOf { } with one
 *       object variant per Document shape and one variant per scalar type
 *   R7  `_id` -> [pk]
 *   R8  caller-supplied references -> block-form Refs with database-
 *       qualified paths and explicit cardinality (bare names fail to
 *       resolve when two databases contain same-named collections)
 *   R9  provenance recorded per Collection via x_ attributes and a Note
 *
 * Reference detection is deliberately a separate step: detectReferences()
 * returns reviewable candidates derived from ObjectId naming conventions,
 * and simplifiedSchemaToXdbml() only emits refs the caller passes in.
 */

/* -------------------------------------------------------------------------
 * Input types (structural mirror of mongodb-schema's SimplifiedSchema)
 * ---------------------------------------------------------------------- */

/** A scalar type observation, e.g. { bsonType: 'String' }. */
export interface SimplifiedScalarType {
  bsonType: string;
}

/** An array observation with its own element type list. */
export interface SimplifiedArrayType {
  bsonType: 'Array';
  types: SimplifiedSchemaType[];
}

/** A subdocument observation with nested fields. */
export interface SimplifiedDocumentType {
  bsonType: 'Document';
  fields: SimplifiedSchema;
}

export type SimplifiedSchemaType =
  | SimplifiedArrayType
  | SimplifiedDocumentType
  | SimplifiedScalarType;

/**
 * One collection's inferred schema: for every field, the list of types
 * observed in the sample, ordered most frequent first.
 */
export interface SimplifiedSchema {
  [fieldName: string]: { types: SimplifiedSchemaType[] };
}

/**
 * The shape returned by the MongoDB MCP server's collection-schema tool:
 * JSON.stringify({ database, collection, schema }).
 */
export interface CollectionSchemaResult {
  database: string;
  collection: string;
  schema: SimplifiedSchema;
}

/* -------------------------------------------------------------------------
 * Options and references
 * ---------------------------------------------------------------------- */

/** A reference to emit as a block-form Ref (R8). */
export interface Reference {
  /** Database-qualified field path, e.g. 'shop.orders.customer_id'. */
  from: string;
  /** Database-qualified field path, e.g. 'shop.customers._id'. */
  to: string;
  /** Cardinality at the referencing side. Default '0..*'. */
  source?: string;
  /** Cardinality at the referenced side. Default '1..1'. */
  target?: string;
}

/** A reference candidate produced by detectReferences(), for review. */
export interface ReferenceCandidate extends Reference {
  /**
   * Why the candidate was proposed:
   *   'naming'                -- <base>_id / <base>Id ObjectId field whose
   *                              base matches a collection in the same
   *                              database
   *   'naming-cross-database' -- same, but the matching collection lives
   *                              in a different database
   */
  basis: 'naming' | 'naming-cross-database';
}

export interface XdbmlOptions {
  /** References to emit; typically reviewed detectReferences() output. */
  refs?: Reference[];
  /** Recorded in the x_sample_size provenance attribute. Default 50. */
  sampleSize?: number;
  /**
   * Recorded in the x_inferred_on provenance attribute. Defaults to the
   * current date (YYYY-MM-DD). Pass a fixed value for reproducible output.
   */
  inferredOn?: string;
}

/* -------------------------------------------------------------------------
 * Type mapping (R1)
 * ---------------------------------------------------------------------- */

const BSON_TYPE_MAP: Record<string, string> = {
  String: 'string',
  ObjectId: 'objectId',
  Int32: 'int32',
  Int64: 'int64',
  Long: 'int64',
  Double: 'double',
  Decimal128: 'Decimal128',
  Boolean: 'boolean',
  Date: 'Date',
  Timestamp: 'timestamp',
  Binary: 'BinData',
  BSONRegExp: 'string',
  BSONSymbol: 'string',
  Code: 'string',
  MinKey: 'string',
  MaxKey: 'string',
};

const NULLISH = new Set(['Null', 'Undefined']);

function scalar (t: SimplifiedSchemaType): string {
  return BSON_TYPE_MAP[t.bsonType] ?? t.bsonType.toLowerCase();
}

function singular (name: string): string {
  if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
  if (name.endsWith('ses')) return name.slice(0, -2);
  if (name.endsWith('s') && !name.endsWith('ss')) return name.slice(0, -1);
  return name + '_item';
}

function isDocument (t: SimplifiedSchemaType): t is SimplifiedDocumentType {
  return t.bsonType === 'Document';
}

function isArray (t: SimplifiedSchemaType): t is SimplifiedArrayType {
  return t.bsonType === 'Array';
}

/* -------------------------------------------------------------------------
 * Field emission (R1-R7)
 * ---------------------------------------------------------------------- */

function emitFields (schema: SimplifiedSchema, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];

  for (const [name, field] of Object.entries(schema)) {
    const all = field.types ?? [];
    const nullable = all.some((t) => NULLISH.has(t.bsonType));
    const types = all.filter((t) => !NULLISH.has(t.bsonType));
    const docs = types.filter(isDocument);
    const arrays = types.filter(isArray);
    const scalars = types.filter((t) => !isDocument(t) && !isArray(t));

    const settings: string[] = [];
    if (name === '_id') settings.push('pk');                        // R7
    if (!nullable && types.length === 1 && name !== '_id') {
      settings.push('not null');                                    // R2
    }
    const suffix = settings.length ? ` [${settings.join(', ')}]` : '';

    if (types.length === 0) {
      lines.push(`${pad}${name} string${suffix} // only null/missing sampled`);
    } else if (docs.length === 1 && scalars.length === 0 && arrays.length === 0) {
      // R4 -- pure nested document
      lines.push(`${pad}${name} object {`);
      lines.push(...emitFields(docs[0].fields, indent + 2));
      lines.push(`${pad}}${suffix}`);
    } else if (arrays.length === 1 && docs.length === 0 && scalars.length === 0) {
      // R5 -- array
      const el = arrays[0].types.filter((t) => !NULLISH.has(t.bsonType));
      const elDocs = el.filter(isDocument);
      if (elDocs.length === 1 && el.length === 1) {
        lines.push(`${pad}${name} array [`);
        lines.push(`${pad}  ${singular(name)} object {`);
        lines.push(...emitFields(elDocs[0].fields, indent + 4));
        lines.push(`${pad}  }`);
        lines.push(`${pad}]${suffix}`);
      } else {
        const elTypes = el.map(scalar).join(', ');
        lines.push(`${pad}${name} array [${elTypes}]${suffix}`);
      }
    } else if (docs.length === 0 && scalars.length > 1) {
      // R3 -- scalar variance folds to a union, frequency order preserved
      lines.push(`${pad}${name} union [${scalars.map(scalar).join(', ')}]${suffix}`);
    } else if (docs.length > 0 && (scalars.length > 0 || docs.length > 1)) {
      // R6 -- mixed document/scalar polymorphism
      lines.push(`${pad}${name} oneOf {`);
      docs.forEach((d, i) => {
        const variant = docs.length > 1 ? `as_document_${i + 1}` : 'as_document';
        lines.push(`${pad}  ${variant} object {`);
        lines.push(...emitFields(d.fields, indent + 4));
        lines.push(`${pad}  }`);
      });
      for (const s of scalars) {
        lines.push(`${pad}  as_${scalar(s).toLowerCase()} ${scalar(s)}`);
      }
      lines.push(`${pad}}${suffix}`);
    } else {
      // R1 -- single scalar
      lines.push(`${pad}${name} ${scalar(scalars[0])}${suffix}`);
    }
  }
  return lines;
}

/* -------------------------------------------------------------------------
 * Document emission (R8, R9)
 * ---------------------------------------------------------------------- */

/**
 * Convert collection-schema results to an xDBML document.
 *
 * Collections are grouped in `Database <name> { }` container blocks, one
 * per distinct database, in first-seen order. References are emitted only
 * when supplied via options.refs; see detectReferences() for candidates.
 */
export function simplifiedSchemaToXdbml (
  results: CollectionSchemaResult[],
  options: XdbmlOptions = {},
): string {
  const out: string[] = ['xdbml: 0.3', ''];
  const inferredOn = options.inferredOn ?? new Date().toISOString().slice(0, 10);
  const sampleSize = options.sampleSize ?? 50;

  const byDb = new Map<string, CollectionSchemaResult[]>();
  for (const r of results) {
    const list = byDb.get(r.database);
    if (list) list.push(r);
    else byDb.set(r.database, [r]);
  }

  for (const [db, colls] of byDb) {
    out.push(`Database ${db} {`);
    for (const c of colls) {
      out.push(
        `  Collection ${c.collection} [x_inferred_from: 'mongodb-mcp collection-schema', x_sample_size: ${sampleSize}, x_inferred_on: '${inferredOn}'] {`,
      );
      out.push(
        `    Note: 'Schema inferred from a document sample; may not represent the full collection.'`,
      );
      out.push(...emitFields(c.schema, 4));
      out.push('  }');
    }
    out.push('}');
    out.push('');
  }

  for (const r of options.refs ?? []) {
    out.push(
      `Ref: ${r.from} > ${r.to} [source: '${r.source ?? '0..*'}', target: '${r.target ?? '1..1'}']`,
    );
  }
  if (options.refs?.length) out.push('');

  return out.join('\n');
}

/* -------------------------------------------------------------------------
 * Reference detection (candidates only; never applied automatically)
 * ---------------------------------------------------------------------- */

function fieldIsObjectId (types: SimplifiedSchemaType[]): boolean {
  const nonNull = types.filter((t) => !NULLISH.has(t.bsonType));
  return nonNull.length > 0 && nonNull.every((t) => t.bsonType === 'ObjectId');
}

function nameVariants (base: string): string[] {
  const v = new Set<string>([base]);
  if (base.endsWith('y')) v.add(base.slice(0, -1) + 'ies');
  if (base.endsWith('s') || base.endsWith('x') || base.endsWith('ch') || base.endsWith('sh')) {
    v.add(base + 'es');
  }
  v.add(base + 's');
  return [...v];
}

/**
 * Propose references from ObjectId naming conventions: a top-level field
 * named `<base>_id` or `<base>Id` (not `_id` itself) whose observed types
 * are all ObjectId, where `<base>` (or a plural variant) names another
 * collection. Same-database matches are preferred; a cross-database match
 * is only proposed when no same-database collection matches, and is
 * flagged with basis 'naming-cross-database'.
 *
 * The return value is a proposal for review, not truth: only application
 * knowledge confirms a reference. Nested fields are not scanned in this
 * version.
 */
export function detectReferences (
  results: CollectionSchemaResult[],
): ReferenceCandidate[] {
  const candidates: ReferenceCandidate[] = [];
  const index = results.map((r) => ({ db: r.database, coll: r.collection }));

  for (const r of results) {
    for (const [name, field] of Object.entries(r.schema)) {
      if (name === '_id') continue;
      const m = /^(.*?)(?:_id|Id)$/.exec(name);
      if (!m || !m[1]) continue;
      if (!fieldIsObjectId(field.types ?? [])) continue;

      const variants = nameVariants(m[1]);
      const same = index.find(
        (e) => e.db === r.database && variants.includes(e.coll),
      );
      const target =
        same ?? index.find((e) => e.db !== r.database && variants.includes(e.coll));
      if (!target) continue;
      if (target.db === r.database && target.coll === r.collection) continue;

      candidates.push({
        from: `${r.database}.${r.collection}.${name}`,
        to: `${target.db}.${target.coll}._id`,
        source: '0..*',
        target: '1..1',
        basis: same ? 'naming' : 'naming-cross-database',
      });
    }
  }
  return candidates;
}
