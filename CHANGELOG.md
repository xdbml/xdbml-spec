# xDBML Changelog

This file records substantive changes between xDBML specification versions. Patch-level clarifications and typo fixes within a published version are tracked in commit history rather than here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com), adapted for a specification rather than a software project.

## v0.3 -- 2026

**Status**: Draft -- current
**Released**: 2026

### Added

#### Module system

- **Remote module sources (§26.14)**: a `use` or `reuse` directive may now import a module from an `https://` URL in addition to a relative path. The source form is recognized purely by scheme. A remote source changes only where a module's bytes come from, not what an import does: both directive keywords, both selection forms (the import-all `*` and the selective `{ ... }` list), per-symbol `as` aliasing, and directive settings behave identically whether the string after `from` is a path or a URL. This delivers the URL imports deferred in v0.2.

- **HTTPS-only, with a strict scheme boundary (§26.14)**: only the `https` scheme is permitted. A source using `http`, `file`, `git`, `ssh`, `data`, a protocol-relative `//host/path`, or a bare host is rejected with a located error and never reinterpreted as a relative path. This keeps the local/remote boundary unambiguous and refuses plaintext transport for content the importing document will trust as schema.

- **Relative references inside remote modules (§26.14.1)**: a relative source inside a remote module resolves against that module's base URL per RFC 3986, never against the entry document or any filesystem location. An author can publish a multi-file module set, expose a single entry file, and rely on the set's internal references continuing to work once imported by URL. A consequence is a deliberate trust boundary: a remote module can never reach the importing system's filesystem.

- **Browser-based resolution and CORS guidance (§26.14.6, informative)**: notes on retrieving remote modules from browser-based tooling.

#### Tooling -- interactive playground

- **Interactive playground**: a live editor-and-diagram environment pairing a Monaco source editor (with xDBML syntax highlighting and code folding) with a live-rendered ERD and a properties inspector. Schemas are shareable via URL, and the example pages and landing pages link directly into the playground.

- **ERD auto-arrange**: relational and star-schema layout strategies. A relational arrangement is applied automatically the first time a document is opened, framed to fit the pane.

- **ERD direct manipulation**: entities and property-bearing edge boxes can be dragged to reposition, layout is persisted per document, layout changes have undo/redo (keyboard and floating-bar buttons), and zoom controls offer fit and reset.

- **Inspector**: shows properties for containers, entities, attributes, relationships, and edge boxes.

#### Tooling -- renderer package

- **New `@xdbml/render` package**: a framework-free SVG renderer for xDBML diagrams (pure layout, geometry, a string serializer, and an interactive DOM mount), extracted from the playground so diagram rendering has a single source of truth. It is reusable by outside systems and is the shared core for a planned rendering API service and MCP server.

- **Playground migrated onto `@xdbml/render`**: the playground now renders and handles all canvas interaction through the shared mount; the duplicated layout engine and the per-component diagram renderers it replaced were removed.

- **`@xdbml/parse` and `@xdbml/render` packaged for external consumption**: both build to `dist` with declaration output and an `exports` map, so they can be consumed outside the monorepo (the prerequisite for the API service and MCP server).

#### Examples

- **Examples 02 and 10 extended** to demonstrate complex Type reuse.

### Changed

- **Conformance (§30)**: v0.3 implementations parse v0.1, v0.2, and v0.3 documents with their respective semantics, and support remote module sources per §26.14.

### Not changed (compatibility)

- Every v0.2 document remains valid under v0.3. Remote module sources are a strict, backward-compatible addition.
- Relative-path imports resolve exactly as in v0.2.
- v0.1 documents and DBML 3.13.6 documents (no version directive) continue to parse with their respective semantics.

---

## v0.2 -- 2026

**Status**: Superseded by v0.3 (still supported)
**Released**: 2026

### Added

#### Module system

- **Module system (§26)**: `use` and `reuse` directives for importing declarations from other xDBML or DBML files. Strict superset of DBML's module system, extended to cover xDBML-specific constructs (Container, Entity, Collection, Record, Type, Edge, View, DiagramView, TablePartial, Enum, Note, TableGroup) plus field-level imports.

- **Clone blocks (§26.6)**: optional inline embedding of imported content. A clone block following a `use`/`reuse` directive captures the imported declarations directly in the importing file, so the file parses correctly even when the referenced file is unavailable. Tools manage clone refresh; drift detection is out of spec scope.

- **`cloned_at` metadata setting (§26.6)**: an ISO 8601 timestamp recording when a clone was captured. Informational; the parser does not act on it. Tooling may use it to drive refresh workflows.

- **Field-level imports (§26.8)**: `reuse { field X.Y.Z } from ...` clones a single field declaration as a reusable named shape. The declaration sits at file scope; placement happens by using the imported name as a field's type elsewhere, matching scalar Named Type behavior.

- **Container-scoped imports (§26.5)**: `use`/`reuse` directives may appear inside Container bodies for non-field element types. The directive's location determines where the imported element lives in the merged AST. An entity imported into Container `ordering` is named `ordering.products`, not `core.products`.

- **`from`, `use`, `reuse`, `as` as reserved keywords** in directive positions (Appendix A).

- **Cross-platform path resolution guidance (§26.13)**: relative paths with `./` and `../` prefixes use forward-slash separators on all platforms. Browser-based renderers reading referenced files via File System Access API may encounter permission prompts; clone blocks eliminate this concern by making files self-contained.

#### Type system

- **Scalar Named Types (§14.7)**: Named Types extended to support scalar shapes carrying the full field-level surface (validation constraints, notes, AI-readiness metadata, custom properties). `Type Email varchar [pattern: '...', tags: ['pii']]` is now valid alongside the existing object-shaped form.

#### Entity-level constraints

- **Checks block (§10, NEW SECTION)**: entity-level `checks { }` block declaring multi-column constraint expressions. Each check is a backtick-wrapped expression with optional `name:` and `note:` settings. The block is a peer of the `indexes { }` block. Required for full DBML 3.13.6 compatibility -- DBML documents with `checks { }` blocks now parse correctly without semantic loss. Inserting this section between §9 Index and the former §10 Relationship caused all subsequent sections to shift by one.

#### Relationship visualization

- **`inactive` setting on Ref (§11.9)**: flag-style setting marking a relationship as visually inactive. Visualization tools render dotted lines and may exclude inactive relationships from cardinality computation. Useful for documenting historical or deprecated FKs.

- **`color` setting on Ref (§11.9)**: formal documentation of the `color` setting (`#rgb` or `#rrggbb`) on relationship lines. Previously informal.

#### TableGroup visualization

- **`color` setting on TableGroup (§16.2)**: formal documentation of the `color` setting on TableGroup, controlling the frame color in diagram renderers.

#### Records completeness

- **§25 Records expanded**: top-level form `records EntityName (col1, col2) { ... }` documented alongside the inside-entity form. Cross-container reference form `records core.users (...) { ... }`. Full value-form table covering strings (single-line and triple-quoted multi-line), numbers, booleans, null, ISO 8601 dates, enum values (`Status.active`), and backtick expressions. Generator behavior matrix added (SQL INSERTs, MongoDB insertMany, Avro fixtures, JSON documents, markdown tables).

#### Examples

- **Multi-file module-system example** (`examples/09-modules-conformed-dimensions.xdbml` + `examples/10-modules-consumer.xdbml`): demonstrates the canonical conformed-dimensions pattern that motivated the module system design, as a pair of first-class examples (each with its own page) cross-linking via their descriptions. The consumer file imports three dimension entities into its `Container sales` via Container-scoped `reuse` directives with clone blocks, and imports four scalar Named Types at file scope. Showcases Container-scoped imports (entities become `sales.dim_customer` not `core.dim_customer`), multiple imports per directive with one shared clone block, `cloned_at` metadata, transitive `reuse` semantics, and scalar Named Type usage. The example also exercises new minor additions: entity-level `checks { }` blocks (on `dim_customer`, `dim_product`, `dim_date`, `fact_sales`), `color:` on TableGroups, and inline `check:` field settings.

- **Example manifest extended** with optional `companionFiles` array supporting multi-file examples where one file is the "headline" and one or more peers are not worth their own viewing page. `scripts/prepare-examples.mjs` copies companion files to `public/examples/` alongside the primary; the viewing page lists companions in a dedicated block. Not currently used by any bundled example (the v0.2 module-system pair are first-class peer examples) but available for future asymmetric file-pair scenarios.

- **Example regeneration script gained orphan cleanup** -- `scripts/prepare-examples.mjs` now detects and removes `.xdbml` files in `public/examples/` and viewing pages in `examples/` (matching the `NN-slug.md` shape) that no longer correspond to a manifest entry. This catches stale files left behind by renames, removals, or restructuring. Hand-authored files like `README.md` and `index.md` are never touched.

### Changed

- **Strict-superset claim sharpened**: every valid DBML document parses correctly under xDBML rules, and every DBML construct (used in a way valid in DBML) means the same thing in xDBML as in DBML. When a file declares `xdbml: 0.2`, it has opted into xDBML's extended semantics; the meaning of constructs in that context may legitimately differ from DBML's. The version directive selects which semantics apply.

- **Section renumbering**: insertion of new §10 Checks between §9 Index and §10 Relationship shifted §10-§29 from v0.1 to §11-§30 in v0.2. All 38 cross-references updated throughout the spec, the grammar test cases, and the supporting documentation. The previous renumbering (from v0.2 draft 1, when §25 Module system was inserted) is now subsumed in this final shape.

- **Conformance §30**: now requires v0.2 implementations to also parse v0.1 documents with v0.1 semantics, and to implement the module system per §26.6.

### Not changed (compatibility)

- v0.1 documents continue to parse correctly under v0.2 parsers with v0.1 semantics.
- DBML 3.13.6 documents (no version directive) continue to parse with DBML semantics.
- All v0.1 constructs preserve their behavior.

### Deferred to later phase

- **URL imports** in `use`/`reuse` directives (e.g., `from 'https://...'`). Phase 1 of v0.2 supports relative paths only.

---

## v0.1 -- 2026

**Status**: Superseded by v0.2 (still supported)
**Released**: 2026

### Added

Initial public draft of the xDBML specification. Strict superset of DBML 3.13.6 adding:

- Explicit namespace-level declarations (Container)
- Nested hierarchical structures (objects, arrays of records)
- Polymorphism via `oneOf`/`anyOf`/`allOf` with discriminators
- First-class JSON column type with known shape
- Polyglot vocabulary (Entity/Collection/Record synonyms; engine-native type systems)
- Named reusable types (object-shaped)
- AI-readiness metadata (`synonyms`, `business_term`, `tags`, `granularity`)
- Precise relationship cardinality (UML-style min..max strings)
- Property-bearing edges for graph models
- Views with source-query metadata
- Validation constraints (`pattern`, `minLength`, `maxLength`, range, `check`)
- Sample data via Records
- DiagramView for visual layout metadata
- TablePartial for entity-level field composition
- Custom properties via `x_` prefix convention

Twenty-eight chapters plus five appendices covering lexical conventions, language constructs, AST representation, conformance, and DBML 3.13.6 compatibility.

---

*See [SPEC INDEX](spec/) for the latest specification and version history. See [GOVERNANCE.md §9](GOVERNANCE.md) for the stability commitments that govern version transitions.*
