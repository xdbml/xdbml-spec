Moves the DBML baseline of xDBML from 3.13.6 to 10.3.1. A parser now reads every construct DBML added between the two versions, in every document, including one without a version declaration: the new forms of records, the `?` marks of relationship operators, custom properties and `Metadata` blocks, sticky notes, data lineage with `Dep`, and module specifiers resolved as in DBML 10.3. Every valid DBML 10.3.1 document is a valid xDBML document, and every v0.6 document remains valid.

Seven topics, in six commits. Each carries its spec text, grammar, parser, editor grammars, renderer, playground, MCP reference, examples and tests:

| Commit | Topic |
|---|---|
| `12de613` | Records in the forms of DBML 10.3.1 |
| `673f64a` | Optional marks on relationship operators, cardinality inference |
| `353c910` | Custom properties and `Metadata` blocks |
| `8a27ab4` | Sticky notes |
| `c3f67b9` | Data lineage (`Dep`) |
| `9c5deaf` | Import specifiers; closing: baseline, Appendix D, help pages, VS Code extension 0.7.0 |

The last commit of the branch adds the deployment script and the release tag rule.

## Language (spec v0.7)

- **Records (§26)**: a column list on records inside an entity, an `example` flag for rows that illustrate the data rather than load it, and an empty field that reads as null. An entity holds one records block, as in DBML.
- **Relationships (§11.1, §11.7, §11.8)**: `>?`, `?<`, `?-?` and `?<>?` make the end on their side optional, in the short, long and inline forms. A nullable foreign key now makes the parent end optional, where the §11.8 table had put the zero at the child end. A `?` and a `source:` or `target:` setting that disagree draw a warning.
- **Custom properties and Metadata blocks (§24.5, §24.7)**: DBML's custom properties are read in every document. `Metadata <kind> <target> { ... }` sets a note, a color and custom properties on an element declared elsewhere, in the same file or an imported one. A block that changes a value an earlier source set draws a warning.
- **Sticky notes (§19)**: a named top-level `Note` is an annotation drawn on the diagram, its text rendered as Markdown, with DBML's `color` and custom properties. With `xdbml: 0.7` it may sit in a Container, which carries it on the canvas. A top-level `Note` without a name is the note of the project.
- **Data lineage (§27, a new chapter)**: `Dep` records that an entity, a View or a field is computed from another, in DBML's short, block and inline forms. An end may name a View or a nested field. Chapters 27 to 31 become 28 to 32.
- **Module specifiers (§28.13)**: as in DBML 10.3, `auth` reads as `./auth`, the host application may map a specifier such as `@shared/users` to a file, an import without an extension falls back to a `.dbml` file, and an absolute path is an error unless the host resolves it. Remote modules over `https://` are unchanged.
- **Appendix D** is rewritten against DBML 10.3.1. Item 11 lists what DBML added since 3.13.6; item 12 lists the points where an xDBML parser reads DBML 10.3.1 differently, none of which makes a valid DBML document invalid.

## Compatibility

- Every v0.6 document stays valid. In a document declaring v0.6 or an earlier version, a second records block and a `dep` setting without an arrow keep their v0.6 reading, with a warning.
- Readings that change in every document:
  - a nullable foreign key draws a ring at the parent end of its relationship (§11.8);
  - a top-level `Note` without a name is the note of the project; through v0.6 the parser accepted it and left it out of the model;
  - an import without an extension falls back to `<path>.dbml`, and `./lib.dbml` is read as written, where the parser asked for `lib.dbml.xdbml`;
  - an absolute import path is an error unless the host resolves it, as §28.13 already required; the parser used to read it;
  - an import whose first folder looks like a host name, such as `github.com/acme/...`, names a folder, as in DBML, where it was rejected.
- `@xdbml/parse`: `TopLevelStatement` gains `MetadataDeclaration` and `DepDeclaration`, `SettingValue` gains `DepValue`, and `classifyModuleSource()` returns a third kind, `absolute`. Code with an exhaustive `switch` on these unions needs the new cases.

## Tooling

- **`@xdbml/parse`**: `refCardinality()`, `refCardinalityIn()` and `refChildNullable()`; `metadataIndex()` and `withMetadata()`; `stickyNotes()`, `resolveStickyNote()` and `projectNote()`; `collectLineage()`, `resolveLineage()` and `checkLineage()`; `ParseOptions.resolveSpecifier` and `moduleCandidates()`. Each construct comes with its diagnostics, listed on the Diagnostics panel help page of the playground.
- **`@xdbml/render`**: cardinality rings from the inferred cardinality; sticky notes with their Markdown text; dependency curves with junctions and arrowheads; selection of sticky notes and Deps; an arrangement that places the sources of lineage on the left and its targets on the right.
- **Playground**: an "Add sticky note" button; Display options for sticky notes and dependencies; inspectors for sticky notes and Deps, a Cardinality section for relationships, and a "Metadata" badge on each setting a block sets. The starter schema declares `xdbml: 0.7`. New help pages on sticky notes, data lineage and Metadata blocks, and the other pages brought up to date.
- **Editors**: Monaco, TextMate and the VS Code extension color `Metadata` blocks, sticky notes, `Dep` and `dep`, the arrows `->` and `<-`, the `?` marks and the new records forms. The VS Code extension 0.7.0 is built: `tools/vscode-extension/xdbml-0.7.0.vsix`.
- **`llms.txt` and the MCP server**: sections on the new constructs; documents declare `xdbml: 0.7`, and the server's instructions give DBML 10.3.1 as the baseline.
- **Examples**: `18-data-lineage` is new; example 02 declares `xdbml: 0.7`.
- **Release tooling**: `tools\release.cmd 0.7.0` tags `v0.7` and publishes the notes of `## v0.7`, as for v0.4, v0.5 and v0.6. Before, it looked for a `## v0.7.0` section and stopped.

## Verification

`npm run check` on the branch: parser 771 tests, the grammar test corpus included; renderer 356, viewport 14, interactive 58; MCP 94; from-mongodb 24; playground 65 and its type-check; 233 "View in playground" links in the spec; docs build. Each DBML construct was checked against `@dbml/core` 10.3.1.

## After the merge

`tools\release.cmd 0.7.0` publishes `@xdbml/parse` and `@xdbml/render` 0.7.0, deploys the MCP server and the rendering API, commits the version bumps, tags `v0.7` and publishes the GitHub release from the CHANGELOG. The VS Code extension is published on its own.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_014qiZWnMqu12rGat2s4zsty
