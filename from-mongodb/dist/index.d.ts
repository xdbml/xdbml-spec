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
export type SimplifiedSchemaType = SimplifiedArrayType | SimplifiedDocumentType | SimplifiedScalarType;
/**
 * One collection's inferred schema: for every field, the list of types
 * observed in the sample, ordered most frequent first.
 */
export interface SimplifiedSchema {
    [fieldName: string]: {
        types: SimplifiedSchemaType[];
    };
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
/**
 * Convert collection-schema results to an xDBML document.
 *
 * Collections are grouped in `Database <name> { }` container blocks, one
 * per distinct database, in first-seen order. References are emitted only
 * when supplied via options.refs; see detectReferences() for candidates.
 */
export declare function simplifiedSchemaToXdbml(results: CollectionSchemaResult[], options?: XdbmlOptions): string;
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
export declare function detectReferences(results: CollectionSchemaResult[]): ReferenceCandidate[];
