# xDBML Changelog

This file records substantive changes between xDBML specification versions. Patch-level clarifications and typo fixes within a published version are tracked in commit history rather than here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com), adapted for a specification rather than a software project.

## v0.2 -- 2026

**Status**: Draft -- current
**Released**: 2026

### Added

- **Module system (§25)**: `use` and `reuse` directives for importing declarations from other xDBML or DBML files. Strict superset of DBML's module system, extended to cover xDBML-specific constructs (Container, Entity, Collection, Record, Type, Edge, View, DiagramView, TablePartial, Enum, Note, TableGroup) plus field-level imports.

- **Clone blocks (§25.6)**: optional inline embedding of imported content. A clone block following a `use`/`reuse` directive captures the imported declarations directly in the importing file, so the file parses correctly even when the referenced file is unavailable. Tools manage clone refresh; drift detection is out of spec scope.

- **`cloned_at` metadata setting (§25.6)**: an ISO 8601 timestamp recording when a clone was captured. Informational; the parser does not act on it. Tooling may use it to drive refresh workflows.

- **Field-level imports (§25.8)**: `reuse { field X.Y.Z } from ...` clones a single field declaration as a reusable named shape. The declaration sits at file scope; placement happens by using the imported name as a field's type elsewhere, matching scalar Named Type behavior.

- **Container-scoped imports (§25.5)**: `use`/`reuse` directives may appear inside Container bodies for non-field element types. The directive's location determines where the imported element lives in the merged AST. An entity imported into Container `ordering` is named `ordering.products`, not `core.products`.

- **Scalar Named Types (§13.7)**: Named Types extended to support scalar shapes carrying the full field-level surface (validation constraints, notes, AI-readiness metadata, custom properties). `Type Email varchar [pattern: '...', tags: ['pii']]` is now valid alongside the existing object-shaped form.

- **`from`, `use`, `reuse`, `as` as reserved keywords** in directive positions (Appendix A).

- **Cross-platform path resolution guidance (§25.13)**: relative paths with `./` and `../` prefixes use forward-slash separators on all platforms. Browser-based renderers reading referenced files via File System Access API may encounter permission prompts; clone blocks eliminate this concern by making files self-contained.

### Changed

- **Strict-superset claim sharpened**: every valid DBML document parses correctly under xDBML rules, and every DBML construct (used in a way valid in DBML) means the same thing in xDBML as in DBML. When a file declares `xdbml: 0.2`, it has opted into xDBML's extended semantics; the meaning of constructs in that context may legitimately differ from DBML's. The version directive selects which semantics apply.

- **Section renumbering**: §25 AST representation, §26 Round-trip semantics, §27 Relationship to other standards, §28 Conformance from v0.1 are now §26, §27, §28, §29 respectively, to make room for §25 Module system. Cross-references updated throughout.

- **Conformance §29**: now requires v0.2 implementations to also parse v0.1 documents with v0.1 semantics, and to implement the module system per §25.6.

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
