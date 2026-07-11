---
title: "Recipe: MongoDB cluster to xDBML diagram"
description: Use MongoDB's MCP server and the xDBML MCP server together to reverse-engineer a live cluster into an xDBML model and render it as an entity-relationship diagram.
---

# Recipe: MongoDB cluster to xDBML diagram

This recipe turns a live MongoDB deployment into a rendered
entity-relationship diagram in a single AI-assistant conversation. The
assistant reads inferred collection schemas through
[MongoDB's official MCP server](https://www.mongodb.com/products/tools/mcp-server),
maps them to xDBML, then validates and renders through the
[xDBML MCP server](/ai-assistants).

MongoDB is a particularly good fit for xDBML because inferred document schemas
contain exactly the structures that flat notations lose: fields holding nested
documents, arrays of documents, and fields whose type varies across documents
because the collection evolved over several application versions. xDBML
expresses all of these losslessly with nested objects, `array [...]`, `union`,
and `oneOf`.

## Prerequisites

Connect two MCP servers to your assistant:

The **xDBML MCP server** at `https://xdbml-mcp.xdbml.workers.dev/mcp`, remote
and public, no key. Setup per client is covered in
[Use from AI assistants](/ai-assistants).

The **MongoDB MCP server**, connected to your deployment with a connection
string. It works with Atlas, Community Edition, and Enterprise Advanced. For
this recipe only read access is needed, so run it in read-only mode, which
restricts it to read, connect, and metadata tools. See MongoDB's
[getting started guide](https://www.mongodb.com/docs/mcp-server/get-started/).

## How it works

The pipeline has five steps, and the assistant performs all of them.

**1. Enumerate.** List the databases and collections in scope through the
MongoDB server's metadata tools.

**2. Infer.** Call `collection-schema` for each collection. The tool samples
documents (50 by default) and returns a `SimplifiedSchema`: for every field, a
frequency-ordered list of the types observed in the sample. Entries are either
a scalar BSON type, an `Array` with its own element types, or a `Document`
with nested fields.

**3. Map.** Convert each result to xDBML using the mapping rules below.

**4. Validate.** Call `validate_xdbml` and fix anything it flags. This is much
cheaper than rendering and reports precise line and column positions.

**5. Render.** Call `render_xdbml` for the diagram and the playground link.

## Mapping rules

Scalar BSON types map to xDBML's BSON-native types:

| bsonType | xDBML | bsonType | xDBML |
| --- | --- | --- | --- |
| `String` | `string` | `Double` | `double` |
| `ObjectId` | `objectId` | `Decimal128` | `Decimal128` |
| `Int32` | `int32` | `Boolean` | `boolean` |
| `Int64` / `Long` | `int64` | `Date` | `Date` |
| `Binary` | `BinData` | `Timestamp` | `timestamp` |

The structural rules do the real work:

**Nullability, not a type.** `Null` and `Undefined` entries in a field's type
list are signals that the field is nullable or missing in some documents.
Strip them; a field whose remaining type list is a single type and that had no
nullish entries gets `not null`.

**Scalar variance folds to a union.** A field observed as `Decimal128` in
recent documents and `Double` in older ones becomes
`total union [Decimal128, double]`, preserving the sample's frequency order so
the first member is the dominant type.

**Documents nest.** A `Document` type becomes an inline `object { ... }`,
recursively.

**Arrays.** One scalar element type gives `tags array [string]`. An array of
documents gives `line_items array [ line_item object { ... } ]` with a
singularized element name. Several scalar element types give
`array [int, varchar]`, which xDBML folds to a union at parse time.

**Mixed document and scalar is oneOf.** A field stored as a bare string by
application v1 and as a subdocument by v2 becomes a `oneOf` with one variant
per shape. This is the pattern unions cannot express, since union members are
always simple types.

**Keys and references.** `_id` gets `[pk]`. MongoDB has no foreign keys, so
references between collections exist only in application code and `$lookup`
stages; the assistant derives them from aggregation analysis or ObjectId
naming conventions and emits block-form Refs with precise cardinality. Use
database-qualified paths (`shop.orders.customer_id`), because bare names fail
to resolve when two databases contain same-named collections.

**Provenance.** Each Collection records how it was obtained:

```xdbml
Collection orders [x_inferred_from: 'mongodb-mcp collection-schema', x_sample_size: 50, x_inferred_on: '2026-07-11'] {
  Note: 'Schema inferred from a document sample; may not represent the full collection.'
  ...
}
```

## A worked example

Given this excerpt of a `collection-schema` result for `shop.orders`, where
`total` drifted from `Double` to `Decimal128` and `payment` was a string
before it became a subdocument:

```json
{
  "total":   { "types": [ { "bsonType": "Decimal128" }, { "bsonType": "Double" } ] },
  "payment": { "types": [
    { "bsonType": "Document", "fields": {
      "method":   { "types": [ { "bsonType": "String" } ] },
      "last4":    { "types": [ { "bsonType": "String" } ] },
      "captured": { "types": [ { "bsonType": "Boolean" } ] }
    } },
    { "bsonType": "String" }
  ] }
}
```

the mapping produces:

<a class="playground-launch" href="https://xdbml.org/playground/index.html#s=B4EwRgtgNgXABABgHQGYBQaDCB7KUCmAxgC4CW2AdnNgE4j40DOcA3mnHAPqkjVgBWRYgEleAbQAOAawC67OMWzEAhlDgBXCuSpiAIkVIRVARgBMADgA0cENnVgCcjhOUBPCPgrFqFfAHkAM1Z5DmVGTltCdQ8vPkESYI4kuA9iAAtsXg5GYhpSCgBzDjEKJTgKdTwnZLgoMOIAFmScvMLi0u8KqpCkwmUJYnUafF4wbFx8ZR0O8sqoao4AXx6wzhb8ovXC+WXloA" target="_blank" rel="noopener">View in playground</a>

```xdbml
total union [Decimal128, double]
payment oneOf {
  as_document object {
    method   string  [not null]
    last4    string  [not null]
    captured boolean [not null]
  }
  as_string string
}
```

The rendered diagram shows the union member list on the field row, the oneOf
variants expanded beneath `payment`, and, when collections are grouped in a
`Database shop { ... }` block, a dashed container boundary around them.

## Try it

In a chat with both servers connected, ask:

> Using the MongoDB tools, list the collections in database `<name>` and call
> collection-schema on each. Map the results to xDBML: BSON-native types;
> strip Null/Undefined and mark single-typed fields not null; fold scalar type
> variance to union in frequency order; nest Document fields as object; render
> arrays of documents as array with a singularized element object; use oneOf
> when a field mixes document and scalar shapes; \_id is pk. Detect
> cross-collection ObjectId references and emit database-qualified Refs with
> cardinality. Group collections in a Database block and add
> x\_inferred\_from, x\_sample\_size, and x\_inferred\_on to each Collection.
> First call xdbml\_reference so you author idiomatic xDBML, then validate,
> fix any diagnostics, render, and give me the playground link.

## Reference implementation

The mapping is available in two forms for two audiences.

For building on, use the npm package
[`@xdbml/from-mongodb`](https://www.npmjs.com/package/@xdbml/from-mongodb)
(source in
[`from-mongodb/`](https://github.com/xdbml/xdbml-spec/tree/main/from-mongodb)):

```
npm install @xdbml/from-mongodb
```

It is typed, tested, and dependency-free, and exports two functions:
`simplifiedSchemaToXdbml(results, options)` performs the mapping above, and
`detectReferences(results)` proposes reference candidates from ObjectId
naming conventions for you to review and pass back in, so detection is never
silently applied. An `inferredOn` option pins the provenance date for
reproducible output.

For reading, the repository also ships the mapping as a single self-contained
script in
[`mongodb-demo/`](https://github.com/xdbml/xdbml-spec/tree/main/mongodb-demo):
`simplified-schema-to-xdbml.mjs` plus `demo.mjs`, which runs it on sample
payloads shaped exactly like the tool's output. No install step: run
`node demo.mjs` from that folder. Its committed sample output,
[`out.xdbml`](https://github.com/xdbml/xdbml-spec/blob/main/mongodb-demo/out.xdbml),
can be opened directly:

<a class="playground-launch" href="https://xdbml.org/playground/index.html#s=B4EwRgtgNgXABABgHQGYBQaAiBDALtsbAZwFM4iALAewAc4BvNOOAYSqihIGNcBLKgHZwuAVyK4qEEgCcicANrAA+rwEAzGdJIgla6ZPgByCIIDmVcAFoIXOl3ace-AZaJcKJCNkMAaOMqJsCBpOJSJeAC8SeABWBD9lVQ1pLR1BIwAmBAyANksEAHZLAEZiwwBdBiZmOAA5KlxouEMAZXdPbDgkzW04PUk4TpAqUSkBXHIgkJIAbjgvAE84AQa4LRotUnG4XA8+kQ5hB24+QSRDauYVEDgqMAArE4BJG-kaAGtyy7gO3ihyXDSVSmBQrCYCA5QL41ZZBMjiIECEHyMHLSHQmpQKgLbBQXALJR8GQAxGmb7YEAgTZyO6PHhVGHMBEkEgTBHA0GrCEcDEwri8fEkjkorno77MewicbSJbspGc8FixlwCK8OhS5wKOWmPyqXAoDK8uAAXwVaJ533wpjk2BS2CW8m1lRFiotfK0eG0SjwcBwjTN3Kh1WN1TYHBOmqo0hAMjkihU6h6On6ECMJiRFjA1lsR3DTkErnaXl8-jCU1C4SisXipe6KS96WaWVy+SKpQqDJq9UaRjaHi8XUT9ZuKcGcGGoxI20CwU4c0Wy1W602U4muzIakhuccpwE52+11uD2erw+RtE4kkMkPtJPAaVNQk+H+GsECkw3F4XigxQyAA4-GGEQwE4I1xDwMQhXlF1zSDGEaHtMYJkEEgAHk1E7GFiCUCcRCQo86QmRhlWYKRdgsKDkVRQMjRhKBiFwAAWSj7zdEiuGwGhcBEVI4DAKh2BIbAhBgmjxRNcTsO1SjvhDOjVBIFRGggG07QdcSoAUpTPAIk5MMZIh3hEFjRIfZUAEdBT1A1WLgkiNVwJQNl4LgyA-flv1-P9bNomoQF4NwqClCYgJAkhxLkmpnWosy4BCbBXJ0H0-TIUy2OYMESDkbVgzQEM0AAJRINR4EoWgkCjGNZCQC8JCkaRDwAPnIagaBqsQ6tjJBD0dILpFcoxkCQAAqEt8GkUxWSMYokCQMoviAA" target="_blank" rel="noopener">View out.xdbml in playground</a> It is useful when you want the mapping to be
reproducible rather than performed inline by the assistant, for example in a
scheduled job that regenerates a model and diffs it against the committed one
to detect schema drift.

## Caveats

The schema is inferred from a sample, so rare fields and rare type variants
can be missed; raise the tool's `sampleSize` parameter for wider coverage, and
treat the result as a snapshot of observed shape, not a contract. Relationship
detection is heuristic: naming conventions and aggregation analysis find most
references, but only application knowledge confirms them, which is why the
Refs carry explicit cardinality you can correct. And the provenance
attributes exist precisely so a later reader knows which parts of the model
were inferred, from how many documents, and when.
