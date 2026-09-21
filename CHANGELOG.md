# xDBML Changelog

This file records substantive changes between xDBML specification versions. Patch-level clarifications and typo fixes within a published version are tracked in commit history rather than here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com), adapted for a specification rather than a software project.

## v0.5 -- 2026

**Status**: Draft -- current
**Released**: unreleased

Adds supertype groups: generalization of entities into a supertype and subtypes, with inherited attributes and the intended materialization. Every v0.4 document remains valid; documents using the new construct declare `xdbml: 0.5`.

### Added

#### Spec

- **Supertype group (§12)**: a new top-level `SupertypeGroup` declaration, placed as chapter 12 ahead of Edge. A group names one supertype in its settings and lists its subtypes in its body, separated like TableGroup members (§12.1, §3.9). The name is required; a writer exporting a group that has no name in its source tool emits `undefinedGroup1`, `undefinedGroup2`, and so on.

- **Completeness and exclusivity (§12.3)**: `completeness: total | partial` and `exclusivity: disjoint | overlapping`, set per group, so one supertype can carry a total, disjoint axis and a partial, overlapping one. Absence means unstated, as with `constraint_type`.

- **Value aliases (§12.2)**: each canonical value accepts the spellings of other tools and of ORM frameworks (`complete`, `incomplete`, `exclusive`, `non_exclusive`, `class_table`, `joined`, `single_table`, `concrete_table`, `table_per_class`, `flat_with_discriminator`). The normalized AST holds the canonical value, and writers emit it.

- **Hierarchies (§12.4)**: several levels, several axes per supertype, and single inheritance on the subtype side -- an entity listed as a subtype in two groups is an error. Cycles, self-subtyping, and duplicate members are rejected.

- **Inherited attributes (§12.5)**: a subtype declares only its own attributes. The attributes of its supertypes apply to its instances without being copied or declared again, and their placement in stored structures is left to derivation. Redeclaring an attribute of a supertype is an error. A path through a subtype names its own attributes only, and a relationship that points at a subtype names it as an entity-level endpoint.

- **Identity (§12.6)**: a subtype without a primary key shares the identity of its supertype, and a subtype may declare a key of its own. The key each stored structure receives is derivation output.

- **Materialization intent (§12.7)**: `strategy: preserved_hierarchy | roll_up | roll_down`, `merge: flat | nested` for roll-up, and `discriminator`, which reuses the keyword of §21.2 and is rejected on an overlapping group. A subtype member may carry its own `strategy`, which takes precedence for that pair. The settings record intent for a derivation tool and add nothing to the document's structure.

- **Validation summary, diagram notation, relationship to other constructs, and Hackolade Studio interchange (§12.8 to §12.11)**, including the half-circle notation: rounded side toward the supertype, a cross for disjoint, a bar just above the base for total, and dashed marks for unstated settings, with a figure of the five variants (`/diagrams/supertype-group-notation.svg`).

- **Diagram View (§18)**: a `SupertypeGroups` category.

- **Module system (§27.3)**: `supertypegroup` is an importable element type.

- **AST (§28)**: a `SupertypeGroup` node with `Subtype` children. Supertype chains are computed for the structural and redeclaration checks rather than stored (§28.5); no attribute or key of a physical model is computed.

- **Scope (§1.1)**: physical derivation listed as out of scope, with xDBML recording intent where a construct carries one.

- **View in playground buttons (§12, Appendix C.5)**: seven snippets open in the playground. A fragment opens with an `xdbml: 0.5` line and empty declarations of the entities its groups name, after a marker comment, so the diagram has something to draw; the §12.4.3 snippet opens on the diagnostic it illustrates. The snippets shown in the spec are unchanged.

- **Appendix C.5**: a worked example with two axes, three levels, a per-subtype strategy, and a relationship that points at a subtype.

#### Tooling

- **`scripts/spec-playground-links.mjs`**: checks that every "View in playground" button in `spec/vN.M.md` opens the snippet below it (113 buttons across v0.1 to v0.5 at this point) and, with `--write`, regenerates the ones that do not, including a new button written with an empty `#s=`. Runs as `npm run check:spec-links`, in `npm test`, and in CI.

- **Parser**: `SupertypeGroup` parses to a `SupertypeGroupDeclaration` with `SupertypeGroupMember` children, each member carrying its own settings. Members are separated like TableGroup members. A group without a name is a parse error. `supertypegroup` is a selective-import element type and survives aliasing, clone blocks and `flatten()`. The keyword joins `DECLARATION_KEYWORDS`, so the playground editor highlights it.

- **Supertype group checks (spec §12.8)**, run by `resolveNames()` on the flattened document so the playground and the MCP `validate_xdbml` tool report them: `missing-supertype`, `unresolved-supertype-group-member` (unresolved, ambiguous across containers, or naming a View, Edge, Type or other non-entity), `invalid-supertype-group-value`, `duplicate-subtype`, `supertype-is-subtype`, `subtype-in-multiple-groups`, `supertype-cycle`, `supertype-attribute-redeclared` (including attributes arriving through a TablePartial, on either side), `discriminator-on-overlapping-group`, and the warnings `empty-supertype-group` and `merge-without-roll-up`. Duplicate group names reuse `duplicate-declaration`; a group in a document declaring less than 0.5 reuses `construct-requires-version`.

- **`@xdbml/parse` exports** `supertypeGroupSettings()` and `subtypeStrategy()` (canonical values), `canonicalSupertypeGroupValue()` and `SUPERTYPE_GROUP_VALUES` (the alias table), `resolveSupertypeGroups()` (members resolved to entity ids), `supertypeChains()` (nearest supertype first), and `checkSupertypeGroups()`. None of them computes the attributes or keys of a physical model.

- **Grammar**: `supertypeGroupDefinition` and its settings and member rules in `grammar/xDBML.g4`, with a `SEMICOLON` token; ten cases in `grammar/test-cases.md`, each verified against the parser.

- **Renderer**: supertype groups draw per spec §12.9. `DiagramModel.supertypeGroups` carries each group resolved against the canvas, with members resolved by the parser's `resolveSupertypeGroups()` so the diagram and the diagnostics agree. Geometry is computed at draw time from current bounds, so it follows a drag: a stem from the supertype's bottom edge to the top of a half-circle, a cross for disjoint and a bar for total, each dashed when unstated, and one line from the base to a bus with an orthogonal drop to each subtype. Subtypes are expected below the supertype in this first phase. Several groups on one supertype leave its bottom edge at evenly spaced points, in declaration order, with staggered buses. A relationship line attaching to an edge a group uses moves near the left corner. `@xdbml/render` exports `layoutSupertypeGroups()`, `supertypeGroupAnchorX()`, `SYMBOL_RADIUS`, `SYMBOL_STEM` and the `SupertypeGroupLayout` and `SupertypeGroupGeometry` types.

- **Relationship names**: a `showRelationshipNames` render option, and a `relationshipNames` visibility key in the interactive mount, draw the name of a named `Ref` at the middle of its line's longest segment and each supertype group's name beside its symbol. Off by default, so existing diagrams are unchanged.

- **Interactive mount**: a click on a group symbol selects `{ kind: 'supertypeGroup', id }`; the selected group's symbol and branches are highlighted. `RelationshipVisibility` gains `supertypeGroups` (default shown) and `relationshipNames` (default off).

- **Auto-arrange**: in the relational strategy, each supertype hierarchy is placed first, supertype above and centred over the subtypes of all its groups, levels stacked, with extra row spacing for the symbols; the rest of the component is arranged around it. Supertype-subtype pairs count as links, so a hierarchy with no relationship lines stays together. The star strategy is unchanged.

- **MCP server and llms.txt**: both teach `xdbml: 0.5` and supertype groups: when to use a group, one group per axis, subtypes declaring only their own attributes, completeness and exclusivity, the materialization settings as derivation intent, and pointing a relationship at a subtype as an entity. `mcp/src/reference.ts` is regenerated from `public/llms.txt`. The MCP tests run against the parser source through the same test-only hook as the renderer and playground tests, with three new cases: a valid group document, group rules surfacing as diagnostics, and a newer version refused.

- **Editor grammars**: the TextMate grammar and the VS Code extension highlight `SupertypeGroup` and the setting keys `supertype`, `completeness`, `exclusivity`, `strategy` and `merge`. Regenerating the extension's copy also brings in `foreign_master` and `constraint_type` from v0.4, which had not been copied into it. No new `.vsix` is built.

- **Playground**: a supertype group inspector opens when a group symbol is clicked. It shows the supertype and the subtypes as links, completeness and exclusivity ("Unstated" when absent) read back as a sentence such as "Every Party is exactly one of: Person, Organization.", each subtype's own strategy or "follows the group", the materialization intent (strategy, merge, discriminator), remaining settings, and the note. The entity inspector gains a "Supertype groups" section: a supertype lists each group it anchors with that group's subtypes, a subtype lists its group and its supertype, and an entity that is both shows both. Every group and entity name in either pane selects it, and the diagram selection follows. The Display menu gains "Supertype groups" under Relationships and a "Labels" heading with "Relationship names" (off by default); both persist like the other toggles, and the label option does not count as something hidden.

- **Example 14, supertype groups**: the Appendix C.5 model, with three groups over two axes and three levels, a per-subtype strategy, and relationships to a subtype's own key and to a subtype as an entity-level endpoint. Its golden SVG is new; the thirteen existing goldens are byte-identical.

### Changed

#### Spec

- **Chapter numbering**: the new §12 moves every chapter from Edge onward up by one (Edge §13, View §14, ... Conformance §31). All cross-references inside v0.5 follow. Earlier versions keep their own numbering.

- **Conversion to DBML is no longer specified**: xDBML is a superset of DBML that DBML parsers are not expected to read, and the specification does not govern DBML output. §29.1 lists DBML in the `DBML → xDBML` direction only and drops the sentence about emitting xDBML-only constructs as comments when downgrading. §29.2 no longer lists foreign master relationships as lossy to DBML. Appendix D items 10 and 11 of v0.4, which instructed a generator writing DBML, are replaced by one item stating that the specification defines no conversion from xDBML to DBML.

- **§4.1**: `xdbml: 0.4` is parsed by 0.4+ parsers; `xdbml: 0.5` is refused by a 0.4 parser.

- **§3.9 and §12.1**: SupertypeGroup members are separated like TableGroup members, by newline, comma or semicolon. The separators table lists TableGroup for the first time; the parser has always accepted those separators there.

#### Examples

- **Section references follow the v0.5 numbering** in the comments and notes of examples 02, 09, 10 and 11 and in the example descriptions of `scripts/examples-manifest.mjs`. The reference in example 02 to the Decimal128 lowering pointed at the wrong chapter and now names §23.2.

#### Tooling

- **The parser refuses a newer version (spec §4.1)**: a document declaring a version above `SUPPORTED_XDBML_VERSION` (0.5) fails with a `ParseError` whose new optional `code` is `unsupported-version`. Until now a parser accepted any declared version silently. Documents declaring 0.1 to 0.5, and DBML documents with no declaration, are unaffected. `compareVersions()` is exported.

- **Section references in parser comments and test names** follow the v0.5 numbering. References already pinned to a version, such as "v0.2 §26", are unchanged; references that pointed at an earlier numbering (Named Type as §13, View as §12, Records as §24, path syntax as §18) now name the right chapter.

- **Renderer and playground tests run against the parser source**: a test-only module hook (`test/parser-from-source.mjs` in `renderer/` and `playground/`) resolves `@xdbml/parse` to `parser/src`, as the playground's Vite alias already does. A renderer change that depends on a parser change in the same release can then be tested before the parser is published. The published packages resolve `@xdbml/parse` normally.

- **Parser tests parse the repository's examples**: the suite now reads `examples/` rather than private copies under `parser/test/examples`, which had drifted from the published files and stopped at example 11. All fourteen examples are parsed; the copies are removed.

- **Site shows v0.5 as the current draft**: the specification index, the three specification menus in `.vitepress/config.ts`, and the README list v0.5 as current and v0.4 as superseded. `/spec/current` follows from `scripts/prepare-spec.mjs` with no change. The FAQ reference to the module system names §27.

### Fixed

#### Spec

- **§3.9**: the subsection on element and field separators was numbered 3.8 a second time; it is now 3.9.

## v0.4 -- 2026

**Status**: Draft -- superseded by v0.5
**Released**: 2026-09-20

Expands relationships with a second relationship type. Every v0.3 document remains valid; documents opting into the new construct declare `xdbml: 0.4`.

### Added

#### Spec

- **Foreign master relationship (§11.10)**: a `Ref` may carry a `foreign_master` flag, which records where a duplicated attribute of denormalized data is mastered. A `Ref` without the flag is referential -- the foreign key xDBML has always expressed. The flag is available in the short, long, and inline declaration forms.

- **`foreign_master` beside an inline `ref:` (§11.10.2)**: the one exception to the rule that settings are not supported on inline `ref:` declarations. A field holds at most one inline `ref:`, so the flag has exactly one relationship to qualify.

- **Foreign master restrictions (§11.11)**: single-attribute endpoints (the composite form of §11.4 is rejected); at most one master per child attribute; no key requirement on either endpoint; and no output from any generator. Path syntax, cardinality, and every other relationship setting follow the referential rules unchanged.

- **Derived attribute roles (§11.12)**: a normative table for `fk`, `fm`, `dk`, and `dm`. An implementation computes all four from the set of `Ref` declarations; no document declares them.

- **Relationship line styles (§11.13)**: a normative table pairing each relationship type with a line style, plus the recommendation that a renderer offer a toggle hiding foreign master relationships.

- **Roles and verbs (§11.14)**: `source_role` / `target_role` name the role the entity at each end plays, and `source_verb` / `target_verb` carry the verb that reads the relationship from that end. Documentation only; no generator emits them. Available on an Edge as well.

- **Constraint type (§11.15)**: `constraint_type: identifying | non_identifying` records whether the child's foreign key participates in the child entity's primary key. It changes no keys and is not derived from them, so it can be stated before the child has a primary key. Absence means unstated, which is distinct from `non_identifying`. §11.15.1 maps the property onto the spellings used by Hackolade Studio, erwin, ER/Studio, and PowerDesigner, whose CDM and LDM call it a Dependent checkbox set per direction.

- **Entity-level relationship endpoints (§11.16)**: a `Ref` endpoint may name an entity rather than an attribute, so a relationship can be drawn between two concepts before either has attributes and then refined in place without changing declaration kind. Such a relationship states no cardinality (§11.8 inference does not apply), produces no `fk` / `fm` / `dk` / `dm` markers, and takes its reading direction from the operator alone, with `-` meaning linked without a stated direction and `<>` rejected. `undirected: true` marks a relationship that reads the same way from both ends, matching `undirected` on an Edge.

- **Settings block on the long `Ref` form (§11.2)**: the long form now accepts a settings block after the relationship expression inside the braces, which puts every setting of §11.9 in all three declaration forms. A long form written without a settings block parses as before.

#### Tooling

- **Parser**: `constraint_type`, `source_role` / `target_role`, `source_verb` / `target_verb` and `undirected` are recognized settings. `constraint_type` takes `identifying` or `non_identifying` and is rejected on a foreign master; `undirected` takes true or false; `<>` is rejected between entities; the documentation settings are gated on `xdbml: 0.4` like the `foreign_master` flag. New diagnostics: `invalid-constraint-type`, `constraint-type-on-foreign-master`, `invalid-undirected`, `entity-level-many-to-many`, `ambiguous-ref-endpoint`. `@xdbml/parse` exports `constraintType`, `isUndirected`, `entityNames` and `isEntityLevelEndpoint`.

- **Renderer**: entity-level endpoints resolve and draw, anchored to the entity boxes. No cardinality is inferred for them, and a direction arrow replaces the crow's foot. `@xdbml/render` exports `collectRefDeclarations`, one definition of the order the diagram numbers relationships in. `RefLayout` carries `relationshipType`, `inactive`, `entityLevel`, `undirected` and `decl`.

- **Playground**: the relationship inspector shows type, direction, constraint type, and the roles, verbs and cardinalities, with the relationship read back as a sentence. The Display dropdown gains a Conceptual toggle alongside foreign key, foreign master and inactive.

- **Example 12, conceptual to denormalized**: one order-management model holding an entity-level relationship, foreign keys carrying roles, verbs and a constraint type, and five foreign masters including one crossing an array.

- **Example 13, denormalization with foreign master**: a storefront order document with eight foreign masters across both declaration forms, including copies inside array elements, and a deliberate counter-example (`unitPrice` is not a foreign master, because the price charged may differ from the catalogue price).

- **MCP server and llms.txt**: both teach `xdbml: 0.4` and the new constructs. CI now fails when `mcp/src/reference.ts` drifts from `public/llms.txt`, the cheatsheet it is generated from.

- **tools/RELEASE.md, tools/release.cmd, tools/release-preflight.cmd**: the release is now a script rather than a list of manual edits. Preflight checks npm login, whether the version is already taken, wrangler auth, missing dev tooling, `NODE_ENV=production`, generated-file drift and the test suites, and changes nothing. The release script bumps every version and dependency range through `npm version` and `npm pkg set` so `package.json` and `package-lock.json` move together, waits for each package to become visible on the registry before the next step depends on it, and stops at the first failure. RELEASE.md carries the same sequence by hand, plus the expected-but-harmless output and the genuinely wrong output, separated.

- **tools/github-release.cmd and scripts/release-notes.mjs**: tagging and publishing the GitHub release is a command rather than a web form. Notes are extracted from the `## v<version>` section of CHANGELOG.md, so nothing is retyped and the release cannot drift from the repo. The script refuses a dirty tree or a `HEAD` that differs from `origin/main`, is safe to rerun, and falls back to writing the notes file and printing the URL when the GitHub CLI is absent.

- **MCP `SERVER_VERSION`** now reads `package.json` instead of restating the version in `src/index.ts`, removing a second place to bump that could drift.

### Fixed

#### Tooling

- **Inline refs on nested fields are drawn.** An inline `[ref: ...]` written on a field inside an object or array element was silently dropped by the renderer, with no diagnostic and no line. Where an endpoint pointed was never the problem; where the setting was written had to be a top-level field.

- **The inspector resolves a relationship that came from an inline ref.** The renderer numbered top-level and inline relationships in one sequence while the inspector counted `RefDeclaration` statements alone, so a line from an inline ref opened an empty pane. Both now index into `collectRefDeclarations`.


### Changed

#### Spec

- **`inactive` line style (§11.9)**: an inactive relationship renders as a line of small open circles rather than a dotted line, which frees the dotted line for foreign master relationships and matches Hackolade Studio. The change affects rendering only; the flag's meaning is unchanged.

- **§22.2 cross-engine references**: the value-space compatibility table extends to foreign master relationships, at warning level, since a mismatch there reaches no generator.

- **§27 AST, §28 round-trip, §30 conformance, Appendix A, Appendix D**: updated for the new flag. Foreign master relationships are lossy to DBML and to every engine DDL target by design; a generator writing DBML omits them rather than emitting a `Ref` a downstream tool would read as enforceable structure.

## v0.3.1 -- 2026

**Status**: Draft -- superseded (point release of v0.3)
**Released**: 2026-07-03

A backward-compatible point release of the v0.3 draft: one small surface-syntax addition, spec clarifications, and tooling fixes across the parser, renderer, playground, and MCP server. Every v0.3 document remains valid, and documents continue to declare `xdbml: 0.3`.

### Added

#### Spec

- **Array/list/set element-type shorthand (§8.4)**: `array [T1, T2, ...]` is now shorthand for `array [union [T1, T2, ...]]`, and `list` and `set` behave the same. The listed members must be the types a `union` accepts (scalar or named types, or `null`) and must be comma-separated -- the comma is what distinguishes the shorthand from the named-element form `array [name type]`. This lets a schema describe the heterogeneous arrays JSON and BSON allow without writing `union`. A single element type is unchanged, and the positional tuple form is unaffected.

- **Element and field separators table (§3.8)**: a normative table of which separator joins the items inside each construct -- newline-only for entity/edge/`object`/`oneOf` bodies, comma-and/or-newline for tuples, comma-required for `map` and `union`, and the element-type shorthand for `array`/`set`.

- **"View in playground" links in the spec**: every complete, renderable example now carries a link that opens it in the interactive playground.

### Changed

#### Spec

- **§8.4 "Array of scalars" rewritten**: clarifies that an `array`/`set` holds a single element *type expression* (which may itself be polymorphic), that JSON/BSON arrays need not be uniform, and points to `union` (scalar mix), `oneOf` (object-shape mix, §20.5), a tuple (fixed positions, §8.6), or an opaque `json` field for each kind of heterogeneity.

- **§8.6 tuple separators clarified**: tuple elements may be separated by a comma, a newline, or both -- the separator is optional and position-independent.

#### Grammar

- **Conformance pass on the example corpus**: object/struct bodies in `grammar/test-cases.md` and in the spec examples that used inline comma-separated fields (which the formal `.g4` does not permit) were rewritten to the newline-separated form the grammar defines, so the corpus is self-consistent with the grammar and the parser.

- **`arrayType` / `setType`**: extended to accept the comma-list element-type shorthand.

### Fixed

#### Parser (`@xdbml/parse`)

- **Newline-separated tuple elements**: a heterogeneous tuple whose elements are separated by newlines rather than commas now parses. Previously the parser required a comma between elements and greedily consumed the next `[N]` position marker as a settings block. Comma-separated tuples and per-element settings are unchanged.

#### Renderer (`@xdbml/render`) -- dark mode

- **Selected-row legibility**: a selected field row is no longer washed out in dark mode; the selection fill and accent strip are now theme tokens, so the row keeps light text on a dark tint.

- **Footer link and selection outlines**: the standalone-SVG "Open in playground" footer link and the entity/container/relationship selection outlines are now theme-aware and stay legible on the dark canvas. Light-mode output is unchanged.

### Tooling

- **Playground dark mode**: a light/dark toggle with persistence, `?theme=` hand-off from the documentation site, and protection against Chrome's automatic dark-theme re-coloring.

- **MCP `render_xdbml` mode parameter**: the render tool accepts `mode: "light" | "dark"`; in dark mode the returned SVG and PNG carry a matching dark backdrop so the diagram is legible in any viewer.

### Packages

- `@xdbml/parse` 0.3.2 (tuple fix, array/set shorthand) and `@xdbml/render` 0.3.1 (dark-mode theming) were published; the MCP server was redeployed on `@xdbml/render` 0.3.1.

### Not changed (compatibility)

- Backward-compatible throughout. Every v0.3 document remains valid; the element-type shorthand is purely additive surface syntax that desugars to the existing `union` type, and requires no change to a document's `xdbml:` version.

---

## v0.3 -- 2026

**Status**: Draft -- superseded by v0.3.1
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
