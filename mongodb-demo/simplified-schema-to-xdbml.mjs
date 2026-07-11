/**
 * simplified-schema-to-xdbml.mjs
 *
 * Self-contained, zero-setup form of the mapping, kept deliberately as a
 * single readable file for the MongoDB recipe (xdbml.org/recipes/mongodb).
 * Building on this? Use the typed, tested npm package instead:
 * @xdbml/from-mongodb (source in ../from-mongodb).
 *
 * Maps the output of the MongoDB MCP server's `collection-schema` tool to xDBML.
 *
 * Source format (mongodb-mcp-server -> mongodb-schema getSimplifiedSchema):
 *   structuredContent.schema : SimplifiedSchema
 *   SimplifiedSchema         = { [fieldName]: { types: SimplifiedSchemaType[] } }
 *   SimplifiedSchemaType     = { bsonType: <scalar> }
 *                            | { bsonType: 'Array',    types: SimplifiedSchemaType[] }
 *                            | { bsonType: 'Document', fields: SimplifiedSchema }
 *   The `types` array is ordered by observed frequency, most common first.
 *
 * Mapping rules:
 *   R1  scalar bsonType -> BSON-native xDBML type (see BSON_TYPE_MAP)
 *   R2  'Null' / 'Undefined' entries are nullability signals, not types:
 *       strip them; their absence on a single-type field yields [not null]
 *   R3  multiple scalar types after stripping -> union [t1, t2, ...],
 *       preserving frequency order
 *   R4  'Document' -> nested `name object { ... }` (recurse)
 *   R5  'Array' -> `name array [ ... ]`:
 *         one scalar element type            -> array [t]
 *         several scalar element types       -> array [t1, t2]  (v0.3 sugar,
 *                                               folds to a union at parse time)
 *         Document element type              -> array [ <singular> object { ... } ]
 *   R6  scalar(s) + Document mixed at one field -> oneOf { } with one object
 *       variant per Document shape and one variant per scalar type
 *   R7  `_id` -> [pk]
 *   R8  reference fields (caller-supplied, e.g. detected via $lookup analysis
 *       or ObjectId naming heuristics) -> Ref: with precise cardinality
 *   R9  provenance recorded per Collection via x_ attributes and a Note
 */

const BSON_TYPE_MAP = {
  String: "string",
  ObjectId: "objectId",
  Int32: "int32",
  Int64: "int64",
  Long: "int64",
  Double: "double",
  Decimal128: "Decimal128",
  Boolean: "boolean",
  Date: "Date",
  Timestamp: "timestamp",
  Binary: "BinData",
  BSONRegExp: "string",
  BSONSymbol: "string",
  Code: "string",
  MinKey: "string",
  MaxKey: "string",
};

const NULLISH = new Set(["Null", "Undefined"]);

const singular = (name) =>
  name.endsWith("ies") ? name.slice(0, -3) + "y"
  : name.endsWith("ses") ? name.slice(0, -2)
  : name.endsWith("s") && !name.endsWith("ss") ? name.slice(0, -1)
  : name + "_item";

const scalar = (t) => BSON_TYPE_MAP[t.bsonType] ?? t.bsonType.toLowerCase();

function emitFields(schema, indent, refIndex, path) {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const [name, field] of Object.entries(schema)) {
    const all = field.types ?? [];
    const nullable = all.some((t) => NULLISH.has(t.bsonType));
    const types = all.filter((t) => !NULLISH.has(t.bsonType));
    const docs = types.filter((t) => t.bsonType === "Document");
    const arrays = types.filter((t) => t.bsonType === "Array");
    const scalars = types.filter(
      (t) => t.bsonType !== "Document" && t.bsonType !== "Array"
    );

    const settings = [];
    if (name === "_id") settings.push("pk");                       // R7
    const fq = [...path, name].join(".");
    if (refIndex.has(fq)) settings.push(refIndex.get(fq));         // R8
    if (!nullable && types.length === 1 && name !== "_id")
      settings.push("not null");                                   // R2
    const suffix = settings.length ? ` [${settings.join(", ")}]` : "";

    if (types.length === 0) {
      lines.push(`${pad}${name} string${suffix} // only null/missing sampled`);
    } else if (docs.length === 1 && scalars.length === 0 && arrays.length === 0) {
      // R4 -- pure nested document
      lines.push(`${pad}${name} object {`);
      lines.push(...emitFields(docs[0].fields, indent + 2, refIndex, [...path, name]));
      lines.push(`${pad}}${suffix}`);
    } else if (arrays.length === 1 && docs.length === 0 && scalars.length === 0) {
      // R5 -- array
      const el = arrays[0].types.filter((t) => !NULLISH.has(t.bsonType));
      const elDocs = el.filter((t) => t.bsonType === "Document");
      if (elDocs.length === 1 && el.length === 1) {
        lines.push(`${pad}${name} array [`);
        lines.push(`${pad}  ${singular(name)} object {`);
        lines.push(...emitFields(elDocs[0].fields, indent + 4, refIndex, [...path, name]));
        lines.push(`${pad}  }`);
        lines.push(`${pad}]${suffix}`);
      } else {
        const elTypes = el.map(scalar).join(", ");
        lines.push(`${pad}${name} array [${elTypes}]${suffix}`); // sugar -> union
      }
    } else if (docs.length === 0 && scalars.length > 1) {
      // R3 -- scalar variance folds to a union, frequency order preserved
      lines.push(`${pad}${name} union [${scalars.map(scalar).join(", ")}]${suffix}`);
    } else if (docs.length > 0 && (scalars.length > 0 || docs.length > 1)) {
      // R6 -- mixed document/scalar polymorphism
      lines.push(`${pad}${name} oneOf {`);
      docs.forEach((d, i) => {
        lines.push(`${pad}  as_document${docs.length > 1 ? `_${i + 1}` : ""} object {`);
        lines.push(...emitFields(d.fields, indent + 4, refIndex, [...path, name]));
        lines.push(`${pad}  }`);
      });
      for (const s of scalars)
        lines.push(`${pad}  as_${scalar(s).toLowerCase()} ${scalar(s)}`);
      lines.push(`${pad}}${suffix}`);
    } else {
      // R1 -- single scalar
      lines.push(`${pad}${name} ${scalar(scalars[0])}${suffix}`);
    }
  }
  return lines;
}

/**
 * @param results  array of collection-schema structuredContent objects,
 *                 each augmented with { database, collection } as the MCP
 *                 tool returns them in its text payload
 * @param options  { refs?: [{ from: 'coll.field', to: 'coll._id',
 *                             source?: '0..*', target?: '1..1' }],
 *                   sampleSize?: number }
 */
export function simplifiedSchemaToXdbml(results, options = {}) {
  // Refs are emitted in block form only (below), so cardinality can be
  // stated precisely; refIndex stays available for future inline needs.
  const refIndex = new Map();

  // Namespacing: entities are grouped inside `Database db { }` container
  // blocks (fully supported by parser, resolver, and renderer; the earlier
  // "0 entities" report was a validate-summary miscount, fixed in @xdbml/mcp).
  // Refs remain database-qualified ('shop.orders.customer_id') because bare
  // names fail to resolve when two databases contain same-named collections.
  const out = ["xdbml: 0.3", ""];
  const today = new Date().toISOString().slice(0, 10);
  const byDb = new Map();
  for (const r of results) {
    if (!byDb.has(r.database)) byDb.set(r.database, []);
    byDb.get(r.database).push(r);
  }
  for (const [db, colls] of byDb) {
    out.push(`Database ${db} {`);
    for (const c of colls) {
      out.push(
        `  Collection ${c.collection} [x_inferred_from: 'mongodb-mcp collection-schema', x_sample_size: ${options.sampleSize ?? 50}, x_inferred_on: '${today}'] {`
      );
      out.push(
        `    Note: 'Schema inferred from a document sample; may not represent the full collection.'`
      );
      out.push(...emitFields(c.schema, 4, refIndex, [c.database, c.collection]));
      out.push("  }");
    }
    out.push("}");
    out.push("");
  }

  // R8 -- block-form refs with precise cardinality; from/to are
  // database-qualified paths, e.g. 'shop.orders.customer_id'
  for (const r of options.refs ?? []) {
    out.push(
      `Ref: ${r.from} > ${r.to} [source: '${r.source ?? "0..*"}', target: '${r.target ?? "1..1"}']`
    );
  }
  return out.join("\n");
}
