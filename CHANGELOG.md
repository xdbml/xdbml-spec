# xDBML Changelog

This file records substantive changes between xDBML specification versions. Patch-level clarifications and typo fixes within a published version are tracked in commit history rather than here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com), adapted for a specification rather than a software project.

## v0.6.4 -- 2026

**Status**: Draft -- current
**Released**: 2026-10-02

A point release of the v0.6 draft that brings the parser in line with four rules the spec already stated, and checks every case of the grammar test corpus. A reader reported two cases of `grammar/test-cases.md` that the parser contradicted; running all of them against the 0.6.3 parser found thirteen. Documents continue to declare `xdbml: 0.6`.

### Changed

#### Spec

- **Import item lists (§3.9, §27.2)**: the items of `use { }` and `reuse { }` form a list body, one per line or separated by commas, with commas and semicolons optional as in every list body. §27.2 always showed the multi-line form, without commas; §3.9 now lists it.

- **Tuple positions (§8.6)**: a gap, a repeated position or a first position other than 0 is an error in a document declaring v0.6 or later, and a warning in a document declaring an earlier version. The rule that positions form a contiguous range from 0 dates from v0.1; until v0.6.4 no parser checked it.

- **Named types under a built-in name (§15.2)**: `Type varchar { ... }` or `Type int string` is an error in a document declaring v0.6 or later, and a warning in a document declaring an earlier version. Built-in types always took precedence; until v0.6.4 no parser reported the declaration.

#### Tooling

- **Parser (`@xdbml/parse`)**: reads the items of an import list one per line, where it required a comma between two items ("Expected '}' closing import item list"). New diagnostics `invalid-tuple-positions` and `named-type-shadows-builtin`, with the severities above; the second compares names in any letter case, as built-in types match, so `Type Money` is reported against the built-in `money`. Refuses `use` and `reuse` in a document declaring `xdbml: 0.1`, since the module system belongs to the v0.2 feature set (Appendix D, item 3). Reads `xdbml: 0.6.4`.

- **Grammar test corpus**: all 131 cases of `grammar/test-cases.md` now run in the parser's test suite, so `npm run check` fails when a case and the parser disagree. Three `Ref` cases and the polyglot case declare the entities they name; the module cases import from small files in `grammar/fixtures/`; the multi-line and single-line import forms are two cases, since importing one declaration twice into one document declares it twice; the tuple and built-in-name cases declare `xdbml: 0.6`, each beside a case declaring v0.5 that expects the warning; the case of a patch release newer than the parser declares `xdbml: 0.6.99`, a version no release reaches.

- **Example 06 (financial services)**: its `Type Money` becomes `Type MonetaryAmount`. Its four `Money` fields had the built-in `money` type all along, never the Type; they now reach it.

- **llms.txt**: a Common mistake for a Type named after a built-in type, and the rule in the Fields section.

- **Playground help**: the diagnostics panel page lists the two new codes and their severities.

### Not changed (compatibility)

- A document the 0.6.3 parser accepted parses with the 0.6.4 parser. A document declaring v0.6 with a gap in its tuple positions or a Type under a built-in name now draws an error; one declaring an earlier version, a warning.

---

## v0.6.3 -- 2026

**Status**: Draft -- superseded by v0.6.4
**Released**: 2026-10-01

A backward-compatible point release of the v0.6 draft. Chapter 18 defines diagram views, the subject areas or sub-models of a model's diagram: the elements a diagram view contains, how a listed Container combines with the entities named beside it, how names resolve, and what a renderer draws. A relationship appears in a diagram view when both of its ends do, so the `Edges` category is dropped. Every v0.6 document remains valid, and documents continue to declare `xdbml: 0.6`.

### Added

#### Spec

- **Diagram view (§18)**: the chapter is rewritten, from one example and a list of categories into six sections. A diagram view lists entities under `Tables`, database views under `Views`, Containers under `Containers`, TableGroups, supertype groups and sticky notes, with `*` for every element of a category and `{ * }` for every element of every category; a category left out or empty lists nothing (§18.1). A listed Container contributes all of its entities and database views, unless `Tables` names some of its entities or `Views` some of its database views, in which case it contributes only those named; a TableGroup or a supertype group contributes all of its members (§18.2). Names resolve as the endpoints of a `Ref` do: an unqualified name names the element of that name outside any Container, or else the one inside a Container, and is an error when several Containers hold one (§18.3). A renderer draws the frame of each Container and TableGroup around the members it holds, and each `Ref` and Edge whose two ends lie in members, and keeps positions and display options for each diagram view (§18.4). The DBML form, which Holistics added to DBML in April 2026, reads in every document (§18.5), and §18.6 lists the conditions a parser reports. Every condition is an error, except a category written twice in a document without a version declaration, which DBML accepts: there it is a warning.

- **Diagram view notes (§18.1)**: a diagram view takes a note, in the brackets after its name or as `Note:` in its body, and custom properties in the brackets; no other setting. Both are xDBML extensions, which need a version declaration (§18.5). §19 lists DiagramView among the constructs with inline notes.

- **AST (§28.8)**: a DiagramView carries its settings, its note and one Category node per category; its members are computed, not stored.

- **Conformance (§31)**: item 19, reading diagram views.

- **Appendix A**: the DiagramView categories.

- **Appendix D**: item 10, on the DBML form of `DiagramView`. Items 10 to 14 become 11 to 15.

#### Tooling

- **Parser (`@xdbml/parse`)**: reads `DiagramView`, where it raised "Unknown top-level construct", in every document, as a `DiagramViewDeclaration` with one category node per category, `Schemas` read as `Containers`, and a flag for the body-level `{ * }`. An `Edges` category, an unknown category, and a `DiagramView` in a Container fail the parse with a message that cites §18.1. `diagramViews()` lists the diagram views of a document after module resolution, and `diagramViewMembers()` returns the members of one (§18.2) with the Containers, TableGroups and supertype groups drawn around them (§18.4). `resolveNames()` reports `unresolved-diagram-view-name`, `ambiguous-diagram-view-name`, `diagram-view-wrong-category`, `duplicate-diagram-view` and `duplicate-diagram-view-category`, `unknown-diagram-view-setting` for a setting other than `note` or a custom property, and `construct-requires-version` for `Containers`, `Views` or `SupertypeGroups`, a note, or settings in a document without a version declaration (§18.6). `diagramViewNote()` returns the note of a diagram view. `reuse { diagramview X }` imports the diagram view `X`, where it imported a database view of that name; the import is refused in a Container body, and a `reuse *` in a Container body moves an imported diagram view to the top level. The editor colors the category keywords before `{`. Reads `xdbml: 0.6.3`.

- **Grammar**: `diagramViewDefinition`, which the grammar referenced without defining, with `diagramViewCategory`, `diagramViewBodyItem` and `DIAGRAM_VIEW`; a diagram view takes a settings block and notes. `grammar/test-cases.md` gains fifteen v0.6.3 cases, each checked against the parser.

- **Renderer (`@xdbml/render`)**: `buildDiagram(doc, collapsedPaths, { diagramView })` and the `diagramView` option of `renderToSVG` draw a diagram view: its members, stacked again in their Containers' columns, a frame for each Container holding a member, and the relationships and Edges whose two ends are members. Field markers come from every relationship of the model, so an attribute keeps `fk` or `dk` when the other end is outside the diagram view, and every id stays the id it has in the full diagram. The interactive mount takes a `diagramView` option and gains `getDiagramView()` and `setDiagramView(name, layout)`. `diagramViewNames()` lists the diagram views a document declares, for callers that refuse an unknown name.

- **Playground**: a Diagram menu in the diagram toolbar, shown when the document declares diagram views, switches between Main ERD and each diagram view. Positions, Edge offsets, zoom, Display options and undo history belong to the diagram on display; collapsed rows are shared. A diagram view opened for the first time is arranged and fitted. A reload returns to the diagram view on display; renaming or removing it returns to Main ERD. A click on an empty area of the canvas selects the diagram on display, where it used to clear the selection and close the inspector: the inspector shows the Project on Main ERD (name, targets, counts of the model, note), or the diagram view (members, frames, categories as written, custom properties, note). A new help page, Diagram views, and additions to the pages on the diagram pane, the inspector, the diagnostics panel, parse failures and persistence.

- **Rendering API**: a `diagram_view` query parameter, `diagramView` in a JSON body, renders one diagram view; a name the document does not declare returns 400 with the names it declares. The tester page gains a Diagram view field, and `/health` lists the option.

- **MCP server and llms.txt**: `render_xdbml` takes `diagram_view`, refuses an undeclared name with the list of declared ones, and names the diagram view in its summary. `validate_xdbml` counts and names the diagram views, in its summary and its JSON tail. llms.txt gains a Diagram views section, a `DiagramView` row in What goes where (with its note and custom properties), a Common mistake for an `Edges` category, and `DiagramView` among the top-level declarations of the checklist; `mcp/src/reference.ts` is regenerated, and the MCP tests now load the renderer of the release from source as well as the parser.

- **VS Code extension 0.6.3 and the site's highlighting**: the TextMate grammar colors the DiagramView categories before `{`, with the scope `keyword.declaration.category.xdbml`. The extension skips 0.6.2, which changed no highlighting.

- **Examples**: example 16, Diagram views: subject areas, an order-to-cash model with three diagram views, each with a note. The §18.2 snippet with a supertype group gains a View in playground button.

### Changed

#### Spec

- **`Edges` category removed (§18.1)**: v0.1 through v0.6.2 listed an `Edges` category. A `Ref` or an Edge appears in a diagram view when both of its ends do, so `Edges` is now an error.

- **`Schemas` category (§18.1)**: accepted as an alias of `Containers`, as in DBML.

- **Supertype group notation (§12.9)**: the subtypes connected to the symbol in a diagram view are the subtypes among its members.

### Fixed

- **This changelog**: the `v0.6.1` heading, dropped in 0.6.2, is restored.

### Not changed (compatibility)

- Backward-compatible throughout. `@xdbml/parse` read no `DiagramView` before 0.6.3, so no document that parsed before contains one.

---

## v0.6.2 -- 2026

**Status**: Draft -- superseded by v0.6.3
**Released**: 2026-09-30

A backward-compatible point release of the v0.6 draft. Three DBML forms that the parser rejected or misread now parse as DBML reads them, and two rules the specification already stated are now reported. The AI reference, llms.txt, is rewritten from the specification, and CI checks every example in it. Every v0.6 document without a name collision or a Container target problem remains valid, and documents continue to declare `xdbml: 0.6`, though the parser now also reads `xdbml: 0.6.2`.

### Fixed

#### Spec

- **Unquoted colors (§3.3)**: `headercolor: #3498DB`, the DBML form, reads as the string `'#3498DB'`. Tools that write xDBML quote it.
- **Aliases in relationships (§7.4)**: an alias names its entity in the endpoints of a `Ref` and of an inline `ref:`. An alias that repeats the name of an entity or a Container names nothing.
- **Target array types (§8.1)**: `text[]` and `varchar(20)[]`, the DBML form of a PostgreSQL array type, keep their brackets in the type name.
- **Container targets (§5.2)**: rules 3 and 4 apply to Containers declared as such, when the Project declares `targets:`, and compare target names by their canonical form.
- **Name collisions (§15.5)**: two declarations of the shared namespace with one qualified name are an error, and a warning in a document declaring an earlier version than 0.6, or none.

#### Tooling

- **Parser (`@xdbml/parse`)**: reads `#3498DB` as a string where it raised a lex error, which rejected valid DBML. Resolves `Ref: V.id ...` and `[ref: > V.id]` through the alias of `Table very_long as V`, where it reported `unresolved-entity`; the key rule of §11.17 applies through the alias. Keeps `[]` in `text[]`, where it dropped the brackets and read the field as `text`. Reports `container-target-missing`, `container-target-not-in-project` and `name-collision`; before, a Type and an Entity with one name replaced each other in the symbol table. Reads `xdbml: 0.6.2`.
- **Grammar**: `HEX_COLOR` as a setting value, and `( LBRACK RBRACK )*` after a scalar type. `grammar/test-cases.md` gains six v0.6.2 cases.
- **Renderer (`@xdbml/render`) and playground**: a type such as `varchar(20)[]` displays as written rather than as `varchar[](20)`. The help page on relationships gives its conceptual example the verb that reads in the direction it names.
- **MCP server and llms.txt**: llms.txt is rewritten from the specification, with a table of what goes in the brackets and in the body of each construct, every field setting, the quoting and separator rules, the referenced side of each relationship operator, and a checklist. It gains Common mistakes for a missing comma between settings, a reversed relationship, a foreign key to part of a composite key, a block in a View body, a `Ref` in a Container, relationship settings beside an inline `ref:`, quotes and function defaults, types and settings from other languages, cardinality in the entity settings of an Edge, and a path across an array. The MCP tests now validate every example in llms.txt: a Right example with no diagnostic, a Wrong example with the diagnostic its comment names. `mcp/src/reference.ts` is regenerated; the server serves it once redeployed.

---

## v0.6.1 -- 2026

**Status**: Draft -- superseded by v0.6.2
**Released**: 2026-09-29

A backward-compatible point release of the v0.6 draft. List bodies accept a comma or a semicolon between items, as TableGroup and SupertypeGroup bodies already did, so Enum values and Entity fields written with commas, as AI assistants often write them, now parse. A field may take the name of any keyword: `note`, `indexes`, `checks` and `records`, which DBML accepts as field names, no longer fail. Chapter 14 states where each part of a View goes: the source query in the body, every other setting in the brackets. A key is declared once, and a unique key declared twice draws a warning. Every v0.6 document remains valid, and documents continue to declare `xdbml: 0.6`, though the parser now also reads `xdbml: 0.6.1`.

### Added

#### Spec

- **Separators in list bodies (§3.9)**: in the body of an Entity, a TablePartial, an Edge, a View, an object-shaped Type, an `object` / `struct` / `record`, a `json { }` schema, a `oneOf` / `anyOf` / `allOf`, an Enum, `constraints`, `checks`, a DiagramView and its categories, and a Project, a comma or a semicolon may appear between items, before the first and after the last, with no meaning of its own. A parser accepts them in every document, including one without a version declaration (Appendix D, item 9). Tools that write xDBML write none. DBML accepts none in these bodies. `indexes` stays out: there, `email, name` may be meant as the composite index `(email, name)`, so a comma between entries remains an error.

- **Keywords and field names (§3.10)**: no keyword is reserved as the name of a field or of an enum value. `Note`, `indexes`, `constraints`, `checks`, `records` and `source_query` start an element only when `:` or `{`, as the element requires, follows them. Before v0.6.1 the parser rejected a field named `note`, `indexes`, `checks` or `records`, which DBML accepts, and a View field named `source_query`.

- **Each key declared once (§10.3, §10.10)**: a key written inline is not repeated in `constraints`. A unique key declared twice, inline and in `constraints` or on two lines with the same fields in any order, draws a warning whatever version the document declares; a second declaration of the primary key was already an error (§10.4).

- **View validation summary (§14.7)**: a setting other than `note` written in the body is an error; `source_query` written in the brackets, and a second source query, are warnings.

- **View source query in the AST (§28.7)**: in the normalized AST, a View carries at most one source query, the first `source_query:` element of its body.

#### Tooling

- **Parser (`@xdbml/parse`)**: reads the separators of §3.9 in every list body, and reports a comma between index entries with an error that points to the composite form `(email, name)`. `Note`, `indexes`, `checks`, `records` and `source_query` start their element only before `:` or `{` (§3.10), as `constraints` already did. A setting written in a body, such as `materialized: true` in a View, fails with an error that names the brackets, `View monthly_revenue [materialized: ...] { ... }`, instead of "Expected type name". `viewSourceQuery()` returns the source query of a View (§28.7), and `resolveNames()` reports `source-query-in-settings` and `duplicate-source-query` as warnings (§14.7), and `duplicate-unique-key` as a warning (§10.3). When a primary key is declared twice on the same fields, `duplicate-primary-key` names both declarations, as in "declares its primary key (customer_id) twice: [pk] on customer_id and a pk line in constraints", instead of reporting a second primary key. The playground editor colors a field named `note` like any other field name.

- **Grammar**: `listSeparator` in every list body; replacement rules for `tableDefinition`, `tablePartialDefinition`, `enumDefinition` and `tableGroupDefinition`; `fieldName`, which accepts the six body keywords; and a View whose `source_query` is a body element only. `grammar/test-cases.md` gains fifteen v0.6.1 cases, each checked against the parser.

- **Renderer (`@xdbml/render`)**: no change of its own; it moves to the new parser at release. A new test checks that fields named `note` and `records` draw rows, and that a View's source query draws none.

- **Playground**: the inspector shows a View's source query through `viewSourceQuery()`, the first `source_query:` of its body, where it joined every one before. The help pages on the diagnostics panel, the inspector, the editor and parse failures cover the two View warnings and `duplicate-unique-key`, a setting written in a body, list separators, and keywords as field names; the parse-failure page no longer says that a field named after a keyword needs quotes.

- **MCP server and llms.txt**: both teach one field or enum value per line with no separator, the composite index form in `indexes`, keywords as field names, and the placement of View settings: in the brackets after the name, never in the body, with the source query as the one `source_query:` element of the body. `mcp/src/reference.ts` is regenerated; the server serves it once redeployed with 0.6.1. The MCP tests cover commas, a column named `note`, `materialized` in a View body and a bracketed `source_query`. llms.txt also gains a "Common mistakes" section: wrong and right forms, each checked against the parser, for a setting in a body, a key declared twice, a composite key written as several `[pk]`, separators between items, and a comma between index entries. The 5-minute introduction states the same View placement under its example, and the "Use from AI assistants" page gains a section on giving llms.txt to an assistant without the MCP server.

### Changed

#### Spec

- **§3.9** is reorganized around list bodies. The tuple, `map`, `union` and array rows keep their rules; the `records` row, whose rows end with their line, is new, and §3.1 notes that exception.

- **Chapter 14, View**: §14.1 lists the body elements (source query, fields, note) and states that the settings of §14.5 go in the brackets. §14.2 shows `materialized` in the brackets, before the body, and shows the same setting in the body as a syntax error. §14.3 places the source query in the body; with more than one, the first counts. A `source_query` in the brackets, which the grammar of v0.6.0 accepted, is not the view's source query and draws a warning. §14.2 and §14.5 held two partial settings tables; §14.5 now holds the only one, without `source_query`.

- **§16 Enum**: values are separated as in every list body, and a quoted value may use double or single quotes, as the parser already accepted; tools that write xDBML use double quotes.

- **§28, §31, Appendices A and D**: aligned with §3.9, §3.10 and chapter 14. Conformance gains items 17 and 18; Appendix D gains item 9, and its later items are renumbered.

### Fixed

#### Tooling

- **Parser**: a field named `note`, `indexes`, `checks` or `records`, which DBML 3.13.6 accepts, failed to parse (for example with "Expected ':' or '{' after Note"), so a valid DBML file with such a column did not open in the playground and failed MCP validation. A View field named `source_query` failed the same way.

- **Parser**: `xdbml: 0.6.1` failed with "Unexpected token Dot", though §4 and the grammar allow `MAJOR.MINOR[.PATCH]`. The parser reads the patch number and supports documents up to 0.6.1: `xdbml: 0.6` stays valid, and `xdbml: 0.6.2` is refused as newer than supported.

- **Editor grammars**: the TextMate grammar colored `note varchar` as a `Note` declaration, with the type colored as the declared name. `Note` is now a keyword only before `:` or `{`, or before a name and `{` on the same line, in the site's code blocks and in the VS Code extension 0.6.1, which packages the grammar. The playground editor gets the same fix through the parser (see Added).

### Packages

- `@xdbml/parse` 0.6.1 and `@xdbml/render` 0.6.1. The renderer has no change of its own; it moves to the new parser so the two stay in step. The MCP server and the rendering API are redeployed on them. The VS Code extension 0.6.1 is published to the Marketplace separately.

### Not changed (compatibility)

- Backward-compatible throughout. A document that writes `source_query` in the brackets, or declares two source queries, now draws a warning. A 0.6.0 parser rejects a document that uses commas or semicolons between list items, or a field named `note`, `indexes`, `checks` or `records`.

---

## v0.6 -- 2026

**Status**: Draft -- superseded by v0.6.1
**Released**: 2026-09-28

Adds constraints: one entity-level block for the primary key, unique keys and check expressions, each with an optional constraint name, with composite keys listed in key order and nested keys for document stores. A referential relationship must reference a key of the entity it points at. Every v0.5 document remains valid; documents using the new constructs declare `xdbml: 0.6`.

### Added

#### Spec

- **Constraints block (§10.1)**: `constraints { }` in the body of an Entity, a TablePartial or an Edge. A line naming one field or a parenthesized list declares a key with `pk` or `unique`; a quoted line declares a check. `constraints` starts a block only when `{` follows, so a field may keep that name.

- **Keys (§10.2)**: `name` and `note` settings, fields listed in key order, and nested fields reached through objects; a key path never crosses an array, a tuple position or a map key. The index behind a key and whether the database enforces it stay with each target.

- **Inline and block declarations (§10.3)**: a key on one field without a name MAY stay inline as `[pk]` or `[unique]`; a named or multi-field key goes in `constraints`. `[pk]` on several fields still reads as one composite key, for DBML compatibility, but authors SHOULD NOT use it and tools that write xDBML MUST NOT produce it. `[unique]` on several fields declares separate keys. A `pk` entry in `indexes` reads as the primary key, with its `name` as the constraint name.

- **Primary key (§10.4)**: at most one per entity, declared in one place, with the conflict resolution of §17.1 for TablePartials. Its fields are `not null` in the AST whether or not the document says so, and `null` written on one of them is an error.

- **Quoted check expressions (§10.5)**: a check is written in single quotes, with backticks as an alias, in `constraints`, in `checks { }` and in the field-level `check:` setting. Elsewhere a quoted value stays a string. Tools that write xDBML switch to backticks when the expression contains a single quote.

- **Validation summary (§10.10)**: the new errors, with one rule on versions: in a document declaring an earlier version, or none, the conditions that concern constructs earlier versions accept (an index on an undeclared field, a second primary key, `null` on a primary key field, a relationship to a non-key) are warnings, so every valid v0.5 or DBML document stays valid.

- **Referenced keys (§11.17)**: the fields at the referenced end of a referential relationship must be the primary key or a unique key of the referenced entity (a DBML `unique` index counts), when that entity declares keys. Exempt: entities without keys, which a tool MAY give a primary key on import; many-to-many, foreign master and entity-level relationships; and entities with a non-relational target.

- **Relationship names as constraint names (§11.2)**: the name of a `Ref` is the name of its foreign key constraint in SQL targets.

- **Relational targets (§5.1)**: the targets subject to §11.17, with Db2, Db2 for z/OS and Teradata added to the target table.

- **Constraint nodes (§28.6)**: in the normalized AST, every key and check of an entity is a Constraint node, whichever form declared it, so the primary key sits in one place.

#### Tooling

- **Parser (`@xdbml/parse`)**: reads `xdbml: 0.6`, the `constraints { }` block (new AST nodes `ConstraintsBlock` and `KeyConstraintEntry`) and quoted check expressions (`CheckEntry.delimiter` records the form). `entityConstraints()`, `primaryKey()` and `bodyConstraints()` return every key and check of an entity, whichever form declared it (§28.6). In a 0.6 document each primary key field carries an implied `not null` (`Setting.implied`). `resolveNames()` reports the conditions of §10.10 -- `invalid-key-flags`, `unresolved-key-field`, `key-path-crosses-collection`, `duplicate-primary-key`, `null-in-primary-key`, `duplicate-constraints-block`, `unresolved-index-field` -- and `ref-target-not-key` for §11.17, the conditions on older constructs as warnings in documents declaring an earlier version or none. `isRelationalTarget()` exposes the list of §5.1.

- **Grammar**: `constraintsBlock`, `keyConstraint` and a quoted `checkEntry` in `grammar/xDBML.g4`; `grammar/test-cases.md` gains ten v0.6 cases, each checked against the parser.

- **Editor grammars**: `constraints` is highlighted as a block keyword in the playground editor, the site's code blocks and the VS Code extension's grammar copy. After the 0.6.0 release, the TextMate grammar also colors `indexes`, `checks`, `constraints` and `records` where they open a block in an entity body, which it had never done (the playground editor already did), and the VS Code extension 0.6.0 packages it: highlighting up to v0.6, target-native type names included. From 0.6.0 the extension's version follows the xDBML version its grammar covers.

- **Renderer (`@xdbml/render`)**: a `pk` line in `constraints` gives each field of the key the PK badge, like a `pk` entry in `indexes`, and a `unique` line on one field gives it the U badge. The fields of a composite unique key carry a numbered badge, U1 for the entity's first composite unique key, U2 for the second, including fields that are also in the primary key; a composite `unique` entry in `indexes` declares an index and stays unbadged. Primary key fields of a 0.6 document show the not-null marker, since the parser marks them `not null`.

- **Example 15, constraints**: Formula 1 results as an Oracle schema and a MongoDB collection, with named composite primary and unique keys, quoted checks, named foreign keys, a composite foreign key that references a unique key, and a unique key on a nested field.

- **Playground**: the entity inspector gains a Constraints section listing the primary key, unique keys and checks with their names, whichever form declares them, and counts primary key fields from any form. The help pages on the inspector, entity cards, visual cues and the diagnostics panel describe the constraints block, the badges it sets, and the conditions whose severity follows the declared version.

- **MCP server and llms.txt**: both teach `xdbml: 0.6`, when a key goes inline and when in `constraints` (never several `[pk]` fields for a composite key), checks in single quotes, named foreign keys, and the rule that a foreign key references a key, with its exemptions. `mcp/src/reference.ts` is regenerated; the server serves it once redeployed with 0.6.0.

### Changed

#### Spec

- **Chapter 10** is renamed from "Checks -- entity-level constraints" to "Constraints -- keys and checks" and rewritten in place, so no chapter is renumbered. The `checks { }` block of v0.2 remains valid and equivalent (§10.9); the former §10.3 to §10.5 are now §10.6 to §10.8.

- **§8.8, §9**: the `pk`, `unique` and `check:` rows point to §10; the §9 example declares its primary key in `constraints`; every field an index names must be declared.

- **§3.5, §4.1, §11.4, §11.11, §29.2, §31, Appendices A, B and D**: aligned with §10 and §11.17. Conformance gains items 13 and 14.


### Fixed

#### Examples

- **08-university-registrar and 10-modules-consumer**: declare `xdbml: 0.6` and move their composite primary keys from `[pk]` on several fields to `constraints` (§10.3). Example 08 names its keys and adds a capacity check; example 10 moves its line-total check into `constraints` and writes its field-level checks in single quotes.

- **05-healthcare-fhir**: the `patients` indexes named `family_name_lookup`, which is not a field of the entity. The index check of §10.10 reports it; the entry is now an expression index on the first family name.
---

## v0.5.1 -- 2026

**Status**: Draft -- superseded by v0.6
**Released**: 2026-09-28

A backward-compatible point release of the v0.5 draft. The parser accepts any type name, as §1.2 always stated, reads container-qualified Enums in their DBML form, and warns about a type name that looks like a misspelled Type or Enum; editors color the common types of each target. §16 gains a clarification and an example. Every v0.5 document remains valid, and documents continue to declare `xdbml: 0.5`.

### Added

#### Tooling

- **Target-native type names colored**: `TARGET_NATIVE_TYPES` in `parser/src/keywords.ts` lists 72 common type names of specific targets: Oracle `number`, `clob` and `raw`, PostgreSQL `serial`, `bytea` and `citext`, SQL Server `uniqueidentifier` and `datetimeoffset`, Snowflake `timestamp_ntz`, BigQuery `float64`, the integer types of Cassandra, Protobuf and ClickHouse, and `geometry`, `geography` and `interval`. The playground editor and the site's code blocks color them like scalar types, and so will the next build of the VS Code extension, whose grammar copy is updated. They are not built-ins: the resolver passes them through like any other target-native name, and a Named Type may be declared under one of them, whereas a name in `SCALAR_TYPES` is a built-in that no Named Type can shadow (spec §15.2). Generic words that often name fields (`point`, `line`, `box`, `path`, `image`, `duration`) are left out, since coloring does not depend on position. The parser's keyword-consistency tests and the TextMate smoke test cover the list.

### Changed

#### Spec

- **§16 Enum, clarification**: the section already allowed container-qualified Enums; it now shows both ways to declare one, inside a Container block or under a qualified name, states that the two forms are equivalent, so declaring one Enum both ways is a duplicate, and shows a field naming each by its qualified name. The example has a View in playground button (114 buttons across v0.1 to v0.5).

- **Adjacent standards, editorial update** (no change to the language): Open Semantic Interchange is now Apache Ossie (incubating), with its new name and repository link in the abstract, §1.1, §24, §30 and the references; §30 gains a LinkML row and a sentence on how the two languages differ, and LinkML joins the references. The site pages (FAQ, README, home page, xDBML in 5 minutes, ecosystem, governance, contributing) follow, and the FAQ gains "How does xDBML compare with LinkML?".

#### Tooling

- **Playground help, Diagnostics panel**: the page described warnings as future work and said the parser recovers to report several syntax errors at once. It now describes the two stages as they run: parsing stops at the first syntax error and the diagram keeps the last good state, while resolution reports errors and warnings together and the diagram and inspector keep working. It lists the four warnings (`possible-type-typo`, `ambiguous-ref-endpoint`, `empty-supertype-group`, `merge-without-roll-up`), the row layout with its code, and the default expanded state. The Editor pane page mentions the target-native type colors, and comments in the playground source that still called warnings a future feature are updated.

- **MCP server and llms.txt**: the paragraph on types now says that any other type name is valid and passes through as written, so a physical model uses its target's own types (`number(10)`, `varchar2(255)`, `serial`, `bytea`); it shows how a field names an Enum declared in a schema (`status core.job_status`) and names the `possible-type-typo` warning. `mcp/src/reference.ts` is regenerated from it; the MCP server serves the new text once redeployed.

### Fixed

#### Parser (`@xdbml/parse`)

- **Target-native type names**: the name resolver reported `unresolved-type` for every scalar type name missing from the parser's highlighting lists, among them Oracle `number`, `clob` and `raw`, PostgreSQL `serial` and `bytea`, SQL Server `uniqueidentifier`, and the `number(10)` of the §27.16 field-level import example. A field typed by a declared `Enum`, which DBML allows, failed the same way. Scalar type names pass through as written (spec §1.2, principle 4), so a name that is neither a builtin nor a declared Type or Enum is now accepted as a target-native type with no diagnostic. The exception is a near miss of a declared Type or Enum -- a difference of case, or one or two edits depending on the length of the name -- reported as the new `possible-type-typo` warning, with the declared name as the suggestion. `unresolved-type` stays in `DiagnosticCode`, but the field-type pass no longer emits it for a scalar name. A path that navigates into a target-native or Enum-typed field reports `invalid-nested-path`, as a path into a builtin scalar already did.

- **Container-qualified Enums**: the parser rejected `enum core.job_status { ... }`, the DBML form of an Enum declared in a schema, and a field type naming it, `status core.job_status`, although §16 allows container-qualified Enums. Both now parse, with quoted segments allowed (`"billing"."invoice status"`). The resolver files an Enum declared under a qualified name in that container, as if it were declared in the Container block, so the two forms share one qualified name and declaring both is a `duplicate-declaration`. A qualified type name that names no Enum, such as `public.geometry`, passes through as a target-native type, and a near miss of a qualified Enum suggests the qualified name. `use { enum core.job_status }` imports such an Enum under its bare name, as it does a container-scoped one. The grammar gains a `typeName` rule under `scalarType`, and `grammar/test-cases.md` gains a valid and an invalid case.

### Packages

- `@xdbml/parse` 0.5.1 and `@xdbml/render` 0.5.1. The renderer has no change of its own; it moves to the new parser so the two stay in step. The MCP server and the rendering API are redeployed on them.

### Not changed (compatibility)

- Backward-compatible throughout. A document that raised `unresolved-type` for a scalar type name now resolves cleanly, unless the name is a near miss of a declared Type or Enum, which raises a warning rather than an error. `unresolved-type` remains in `DiagnosticCode`.

---

## v0.5 -- 2026

**Status**: Draft -- superseded by v0.5.1
**Released**: 2026-09-21

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

- **`scripts/spec-playground-links.mjs`**: checks that every "View in playground" button in `spec/vN.M.md` opens the snippet below it (113 buttons across v0.1 to v0.5 at this point) and, with `--write`, regenerates the ones that do not, including a new button written with an empty `#s=`. Runs as `npm run check:spec-links`, in `npm test`, and in CI. Arguments that are not `.md` files are ignored with a warning, since `npm test` passes its own extra arguments to this last script in its chain.

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

- **Playground help**: a new "Supertype groups" page under Reading the diagram, with the five symbols drawn inline, how groups arrange and hide, the group inspector, and the diagnostics you may meet. The pages that had not caught up with v0.4 now cover it: the relationships page explains line styles (solid foreign key, dotted foreign master, open circles for inactive), the fk/dk/fm/dm markers, conceptual relationships with their direction triangle, roles and verbs read in both directions, identifying and non-identifying constraint types, relationship names and the Display menu; the entity-cards and visual-cues pages list the badges the diagram actually draws (P, U, !, fk, dk, fm, dm; the AUTO badge they described does not exist); the inspector page covers the relationship reading, the entity's supertype groups section, the group inspector and links between panes; the diagram-pane page describes the Arrange and Display menus. Stale statements corrected on the way: relationship lines are orthogonal rather than curves, Open and Save exist, a DBML document parses as it is, fourteen examples are bundled, and warning-level diagnostics are no longer a roadmap item.

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

- **Playground help in the site's Learn menus**: the top-level Learn menu and the "Learn xDBML" sidebar groups link the playground help (Getting started). Until now the help pages were reachable only from the playground's Help button.

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
