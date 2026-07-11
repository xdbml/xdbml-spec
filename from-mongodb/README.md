# @xdbml/from-mongodb

Map MongoDB inferred collection schemas to [xDBML](https://xdbml.org).

The input is the output of the
[MongoDB MCP server](https://www.mongodb.com/products/tools/mcp-server)'s
`collection-schema` tool (a `SimplifiedSchema` as produced by
[mongodb-schema](https://www.npmjs.com/package/mongodb-schema)'s
`getSimplifiedSchema`). The output is an xDBML document that preserves what
flat notations lose: nested documents become inline objects, scalar type
drift folds into unions in observed-frequency order, mixed document-and-
scalar fields become `oneOf`, arrays of documents keep their element shape,
and every collection carries provenance attributes recording how and when it
was inferred.

The full workflow, mapping rules, and caveats are documented in the
[MongoDB recipe](https://xdbml.org/recipes/mongodb) on xdbml.org.

Zero runtime dependencies. Node 22 or later. Apache-2.0.

## Install

```
npm install @xdbml/from-mongodb
```

## Usage

```js
import {
  simplifiedSchemaToXdbml,
  detectReferences,
} from '@xdbml/from-mongodb';

// results: an array of collection-schema outputs,
// each { database, collection, schema }
const results = [customers, orders];

// 1) Propose references from ObjectId naming conventions. This returns
//    candidates for review; nothing is applied automatically. Each
//    candidate carries a `basis` ('naming' or 'naming-cross-database')
//    and default cardinality you can correct.
const candidates = detectReferences(results);

// 2) Review, filter, or amend the candidates, then generate the document.
const xdbml = simplifiedSchemaToXdbml(results, {
  refs: candidates,
  sampleSize: 50,          // recorded as x_sample_size provenance
  inferredOn: '2026-07-11' // omit to use today's date
});
```

The result validates and renders through the
[xDBML MCP server](https://xdbml.org/ai-assistants) or the
[playground](https://xdbml.org/playground/index.html).

## API

`simplifiedSchemaToXdbml(results, options?)` converts an array of
`CollectionSchemaResult` objects to an xDBML string. Collections are grouped
into one `Database <name> { }` block per distinct database, in first-seen
order. References are emitted only when passed via `options.refs`, in block
form with database-qualified paths, because bare names fail to resolve when
two databases contain same-named collections.

`detectReferences(results)` scans top-level fields for the
`<base>_id` / `<base>Id` ObjectId naming convention and proposes
`ReferenceCandidate` objects where `<base>` (or a plural variant) names
another collection. Same-database matches are preferred; a cross-database
match is proposed only when no same-database collection matches, flagged
with `basis: 'naming-cross-database'`. Only application knowledge confirms
a reference: treat the output as a proposal, not truth.

All input and output types (`SimplifiedSchema`, `CollectionSchemaResult`,
`Reference`, `ReferenceCandidate`, `XdbmlOptions`) are exported.

## Scope and caveats

The mapping is faithful to what the sample showed, no more: rare fields and
rare type variants absent from the sample are absent from the model, and the
generated `Note` on every collection says so. Reference detection reads
naming conventions only and does not scan nested fields in this version.
For the deterministic end-to-end demo this package grew from, see
[`mongodb-demo/`](https://github.com/xdbml/xdbml-spec/tree/main/mongodb-demo)
in the repository.
