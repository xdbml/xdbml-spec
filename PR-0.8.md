# xDBML 0.8 -- change blocks and stable identifiers

Adds change blocks to xDBML. A `Changes` block lists changes to a model in the form of the `CREATE`, `ALTER` and `DROP` statements of SQL, and a document may hold a model and any number of change blocks after it. Adds `uid`, an identifier that a rename or a move leaves unchanged. Every v0.7 document remains valid.

One topic, in six commits. Together they carry the spec text, grammar, parser, editor grammars, playground, MCP reference, examples and tests:

| Commit | Content |
|---|---|
| `afac974` | Specification text: chapter 29 of `spec/v0.8.md`, the changelog, the FAQ |
| `1a7b9c2` | Grammar and parser: change blocks applied by `flatten()`, the diagnostics of §29.16, `uid` |
| `b49efe2` | Example 20, and Append changes in the playground |
| `0adcde9` | Colors in Monaco, TextMate and the VS Code extension 0.8.0 |
| `1e54e79` | Starter schema, `llms.txt` and the MCP server, release files |
| `3e80701` | A `uid` decides which element a statement changes |

The proposal and the plan of the version follow the release notes below.

## Language (spec v0.8)

- **Change blocks (§29.1)**: `Changes "name" [settings] { statements }` at the top level, any number per document. A block takes `note`, `base` and custom properties. Its statements apply in order, and a statement that cannot apply is an error.
- **The order of a document (§29.2)**: a change block changes the model declared above it, and the declarations below it see the result. A declaration never names an element declared below a change block that stands between the two. A reference follows the element it names through a rename or a move. The model a document describes is the model at its end.
- **Statements (§29.3 to §29.9)**: `create`, which may be left out, `drop`, and `alter` with `rename to`, `move to`, `modify`, and `add`, `modify`, `rename` and `drop` of a `Field` (alias `Column`), an `Index`, a `Constraint`, an Enum `Value` or a member. `modify` changes what it names; `drop default` and `drop [default, note]` remove settings; `was` records the type and settings before the change. A `drop` is refused while another element refers to the element.
- **`if exists` and `if not exists` (§29.10)**: skip a statement, which is reported at a new severity, information, as PostgreSQL reports a notice.
- **Change sets in their own file (§29.12)**: a file of change blocks imports the model it changes; an import brings the model of a file after its own change blocks.
- **`uid` (§29.15)**: on every element, unique in the model, unchanged by a rename or a move, ignored by generators. In a statement, a `uid` decides which element or part it applies to (§29.4): `alter Table [uid: '7f3c']` names the table by its `uid` alone, and a name beside a `uid` that no longer leads to the element draws a warning, so a change set still applies after someone renamed the element.
- **Scope (§1.1, §29.14)**: how a target carries out a change, such as renaming a column in place or copying its values, is decided by the tool that writes the statements of the target.
- Chapter 29 is new, and chapters 29 to 32 become 30 to 33.

## Compatibility

- Every v0.7 document stays valid and reads as before. `Changes` and the statement words are recognized only in a document declaring `xdbml: 0.8`, and the statement words only inside a change block, so they remain available as names. In a document declaring an earlier version, `uid` is a custom property.
- `@xdbml/parse`: `TopLevelStatement` gains `ChangesDeclaration`, and `Diagnostic.severity` gains `info`. Code with an exhaustive `switch` on these unions needs the new cases. `SUPPORTED_XDBML_VERSION` is `0.8`.
- The MCP validator reports `info` diagnostics apart from warnings, and they leave a document valid.

## Tooling

- **`@xdbml/parse`**: reads change blocks; `flatten()` applies them, so the renderer, the playground and the MCP server see the model at the end of the document; `resolveNames()` reports the conditions of §29.16. New exports: `applyChanges()`, `checkChanges()`, `checkUids()`, `hasChanges()`, `flatStatementsWithChanges()`.
- **Playground**: Append changes in the header adds change blocks from pasted text or a file at the end of the open document, as one step of the editor's undo history, and refuses text that holds anything but change blocks. The Diagnostics panel and the editor show the information level. A new help page, Change blocks. The starter schema declares `xdbml: 0.8`, and the help screenshots are regenerated.
- **Editors**: Monaco, TextMate and the VS Code extension color the statements of change blocks. The VS Code extension 0.8.0 is built: `tools/vscode-extension/xdbml-0.8.0.vsix`.
- **`llms.txt` and the MCP server**: a section on change blocks, with checked Wrong and Right examples; documents declare `xdbml: 0.8`; the server's instructions tell an assistant to answer a request to change a schema with a change block.
- **Examples**: `20-model-changes` is new; example 02 declares `xdbml: 0.8`.

## Verification

`npm run check` on the branch: parser 960 tests, the grammar test corpus included; renderer 405, viewport 14, interactive 61; MCP 112; from-mongodb 24; playground 69 and its type check; 305 "View in playground" links in the spec; docs build. The TextMate tests pass, and the MCP reference is in sync with `llms.txt`.

## After the merge

`tools\release.cmd 0.8.0` publishes `@xdbml/parse` and `@xdbml/render` 0.8.0, deploys the MCP server and the rendering API, commits the version bumps, tags `v0.8` and publishes the GitHub release from the CHANGELOG. The VS Code extension is published on its own. The CHANGELOG gives 2026-11-25 as the release date; change it if the merge happens on another day.

## Proposal

### Summary

This proposal adds two things to xDBML v0.8. A `Changes` block lists changes to a model in the form of the `CREATE`, `ALTER` and `DROP` statements of SQL. A statement creates an element, drops it, or alters it: it renames the element, moves it to another Container, modifies its type and settings, or adds, modifies, renames and drops its fields, indexes, constraints and Enum values. A document may hold a model and any number of change blocks among its declarations. The `uid` setting gives an element an identifier that stays the same when the element is renamed or moved.

The specification text is chapter 29 of [`spec/v0.8.md`](spec/v0.8.md).

### Motivation

xDBML describes the state of a model. To change a model, a person or an AI assistant writes the whole model again, and the tool that receives it compares the two versions. This causes several problems:

- A tool can't tell a renamed field from a field that was dropped and another one that was added. A tool that generates migration statements then drops the column and adds a new one, and the data in the column is lost.
- An AI assistant often sees only part of a large model. When the document it sends back lacks some elements, the tool can't tell whether they were dropped or simply not shown to the assistant.
- Rewriting a large model to change one field costs tokens, and it gives the assistant a chance to change things nobody asked for.
- A reviewer has to compare two complete documents to find out what the change is.

Tools that exchange xDBML with an AI assistant work around this today with identifiers of their own in custom properties, such as `x_hackolade_id`, and with separate commands for deletions. This works within one tool but not between tools.

DDL is used for the whole life of a database, because `ALTER` statements let people change a schema step by step. Change blocks give xDBML the same ability for a model, so that a person and an AI assistant can discuss changes one statement at a time, and a tool can apply, accept or reject each statement.

### Proposed syntax

```xdbml
xdbml: 0.8

Container core {
  Table customers [uid: '7f3c'] {
    id          int [pk]
    name        varchar [uid: '7f3c-2']
    email       varchar(255)
    legacy_code varchar(10)
  }
}

Container staging {
  Table addresses {
    id          int [pk]
    customer_id int
    city        varchar
  }
}

Changes "Customer contact details" [note: 'Requested by the CRM team'] {
  alter Table core.customers {
    rename Field name to full_name
    modify Field email varchar(320) [was: 'varchar(255)']
    add Field preferred_language varchar(5) [not null, default: 'en']
    drop Field legacy_code
  }

  create Table core.loyalty_accounts {
    id          int [pk]
    customer_id int [ref: > core.customers.id]
  }
}

Changes "Addresses leave staging" {
  alter Table staging.addresses move to core
  create Ref: core.addresses.customer_id > core.customers.id
}
```

At the end of this document, `core.customers` holds `id`, `full_name`, `email` and `preferred_language`. `full_name` keeps the `uid` of `name`, and `email` is a `varchar(320)`. `core` also holds `loyalty_accounts` and `addresses`, and `staging` is empty.

The statements:

| Statement | SQL counterpart |
|---|---|
| `create Table core.loyalty_accounts { … }` | `CREATE TABLE` |
| `drop Table core.legacy_customers` | `DROP TABLE` |
| `alter Table core.customers rename to clients` | `ALTER TABLE … RENAME TO` |
| `alter Table staging.addresses move to core` | `ALTER TABLE … SET SCHEMA` in PostgreSQL |
| `alter Table core.customers add Field …` | `ALTER TABLE … ADD COLUMN` |
| `alter Table core.customers modify Field email varchar(320)` | `MODIFY` in Oracle and MySQL, `ALTER COLUMN` in PostgreSQL |
| `alter Table core.customers modify Field email drop default` | `ALTER COLUMN … DROP DEFAULT` in PostgreSQL |
| `alter Table core.customers rename Field name to full_name` | `ALTER TABLE … RENAME COLUMN` |
| `alter Table core.customers drop Field legacy_code` | `ALTER TABLE … DROP COLUMN` |
| `alter Enum billing.status add Value archived` | `ALTER TYPE … ADD VALUE` in PostgreSQL |

The main rules:

- **Order.** A change block changes the model declared above it, and the declarations below it see the result. Declarations between two change blocks may come in any order. A declaration never names an element declared below a change block that stands between the two. A reference follows the element it names through a rename or a move. The model a document describes is the model at its end. A document without change blocks reads as before.
- **Blocks.** A document may hold any number of change blocks. A new set of changes is added as a new block after the last one, or in a new file, so earlier blocks are never edited. Each block is the unit a person reviews. Every statement belongs to a block.
- **`create`** is optional, inside and outside a block. **`add`** and **`drop`** are always written, because a field line inside `alter` could otherwise mean adding a field or changing one.
- **`modify`** changes only what it names. `drop default`, `drop not null` and `drop [default, note]` remove settings. The setting `was` records the type and settings before the change, so a tool can detect that the model changed after the statement was written, and can reverse the change.
- **`drop`** fails while another element refers to the element being dropped. The statements that remove those references come first, so a reviewer sees each one.
- **`if exists`** and **`if not exists`** skip a statement whose element is missing or already present, as in SQL. The skip is reported at a new severity, information, as PostgreSQL reports a notice.
- **Keywords** are case-insensitive and accept the keyword synonyms of xDBML, so `ALTER TABLE core.customers ADD COLUMN …` is a valid statement. Settings stay in xDBML brackets.
- **Change files.** A file may hold only change blocks and import the model it changes. An import brings the model of the imported file after its own change blocks, so a sequence of files can record the versions of a model. Without an import, the host supplies the model, as in a conversation with an AI assistant.
- **`uid`** is a string on any element, written by the tool that keeps the model, unique in the model, and unchanged by a rename or a move. It lets a tool that compares two complete documents tell a rename from a drop and a create, even without change blocks. In a statement, a `uid` decides which element or part the statement applies to. It may stand alone, `alter Table [uid: '7f3c']`, or beside the name, `alter Table core.customers [uid: '7f3c']`. When the name no longer leads to the element that carries the `uid`, because someone renamed or moved it after the statement was written, the statement still applies to that element, and a warning says so.

### Round-trip behavior

A change block states a change to the structure of the model. The generator for a target decides how the target carries out the change, and whether it can.

- **SQL DDL targets** (Oracle, PostgreSQL, etc.): `CREATE`, `ALTER` and `DROP` statements. A rename becomes `ALTER TABLE … RENAME COLUMN` where the engine has it.
- **MongoDB validators**: a new `$jsonSchema` applied with `collMod`, and update operations such as `$rename` for the documents already stored.
- **JSON Schema**: a new version of the schema. The generator applies the change blocks and writes the model at its end.
- **Avro**: a new version of the schema, in which a renamed field can carry the old name in `aliases`. Avro's compatibility rules decide whether existing readers accept the new version, as they do today.
- **Neo4j Cypher**: statements that rename labels and properties, such as `SET` and `REMOVE`.

A generator that writes schemas, not migrations, applies the change blocks and writes the model at its end. Generators ignore `uid`.

### Adjacent standards

- **SQL DDL**: the statements borrow the form of `CREATE`, `ALTER` and `DROP`, and `IF EXISTS` behaves as in PostgreSQL. The statements apply to a model, not to a database.
- **Liquibase and Flyway**: these tools order migrations as change sets. Liquibase's preconditions and rollbacks correspond to `was`, which lets a tool check a statement before it applies and reverse it afterwards.
- **JSON Patch (RFC 6902)**: it also applies ordered operations (`add`, `remove`, `replace`, `move`) by path. Change blocks name elements by their kind and their name in the model, so a person can read them.
- **Avro and Protobuf evolution rules**: these say which changes existing readers accept. They remain the rules of those targets (§1.1).

### Alternatives considered

- **Sending the whole model and letting the tool compare the versions.** This is how tools work today. It doesn't distinguish renames, costs tokens on large models, and makes missing elements ambiguous.
- **A single `ALTER` verb for everything.** Adding a table would then read `alter Container core add Table …`, and a relationship, a Type or an Enum declared outside any Container would have no element to alter. SQL uses `CREATE` and `DROP` for whole objects for this reason.
- **One change block per document.** Every new change would then be an edit inside an existing block. Several blocks, each added after the last, keep earlier changes untouched.
- **Statements outside a block.** A block gives a set of changes a name and a reason, and it is the unit that a person reviews.
- **Operations on the AST, as in JSON Patch, or diff-style markers such as `+` and `-`.** Both are hard for people to read.
- **`set` and `unset` keywords.** `modify` with brackets sets values, `drop` removes settings, and `move to` replaces PostgreSQL's `SET SCHEMA`, so no `set` keyword is needed.
- **Required identifiers in every statement.** Statements name elements by their names, which people and assistants read, and a `uid` is optional.
- **A `uid` that must match the name beside it.** Any rename made by someone else after a change set was written would then block every statement that mentions the old name. When a statement gives a `uid`, the `uid` decides, and an outdated name only draws a warning.

### Backward compatibility

Every v0.7 document stays valid and reads as before. `Changes` and the statement words are recognized only in a document declaring `xdbml: 0.8` or later. The statement words have that meaning only inside a change block, except `create` in front of a declaration, so they remain available as names of fields and other elements. In a document declaring an earlier version, `uid` remains an ordinary custom property. Chapters 29 to 32 of the specification become 30 to 33.

### Open questions

- Should `add Field` be able to place the new field at a given position, as SQL's `AFTER` does? Field order matters for Avro, Parquet and tuples.
- Should a field be movable into or out of a nested object? Document stores often need this kind of restructuring.
- How should a change block change the EntityPartials an entity injects?
- Is requiring a separate statement for each reference before a `drop` workable for large changes, or is a form of `CASCADE` needed?
- Should tools be required to write `was` on every `modify` they produce?

## Plan

The steward is the only contributor to xDBML, so the proposal issue and the discussion period of GOVERNANCE.md §3.3 are not used for this version. The design was discussed with Claude Code on 2026-11-23 and 2026-11-24.

As for v0.7, the work happens on the branch `dev/0.8`, and each topic carries its spec text, grammar, parser, editor grammars, renderer, playground, MCP reference, examples and tests.

| Step | Status |
|---|---|
| 1. Design of change blocks and `uid` | Done |
| 2. Specification text: chapter 29 of `spec/v0.8.md`, the changelog entry, the version table of `spec/index.md` and the FAQ | Done, commit `afac974` |
| 3. Grammar: change blocks and `uid` in `grammar/xDBML.g4`, with cases in `grammar/test-cases.md` | Done |
| 4. `@xdbml/parse`: AST nodes, parsing of change blocks, applying the statements with the order rules of §29.2, `uid`, the information severity, diagnostics and tests | Done. `flatten()` applies the change blocks; `resolveNames()` reports their diagnostics. One part is simpler than §29.2 states: Metadata blocks apply after every change block, with their targets following renamed elements, rather than within each part of the document. |
| 5. Editor grammars: Monaco (`parser/src/monarch.ts`), TextMate (`tools/textmate`) and the VS Code extension 0.8.0 | Done. The extension is packaged as `tools/vscode-extension/xdbml-0.8.0.vsix` and not yet published on the Marketplace. |
| 6. Renderer and playground: the information level in the Diagnostics panel; Append changes in the header, which adds change blocks from pasted text or a file at the end of the open document, raises its version line to 0.8 when needed, and refuses text that holds anything but change blocks; a help page on change blocks; the starter schema; the 29 "View in playground" buttons of the v0.8 page, which open `xdbml: 0.8` | Done. Later: a button that rewrites the document as the model after the changes (it needs an xDBML writer), and marks on the diagram for what the changes added, changed or dropped. |
| 7. `llms.txt` and the MCP server: a section on change blocks and `uid`, documents that declare `xdbml: 0.8` | Done. The MCP validator also reports `info` diagnostics apart from warnings. |
| 8. Examples: a new example with change blocks | Done: `20-model-changes` |
| 9. Release: a pull request from `dev/0.8` to `main` with this file as its description, `npm run check`, the status in `spec/index.md`, the README and the "What's new" text of the site, then `tools\release.cmd 0.8.0` | Ready: the release files name v0.8 as the current draft, and `npm run check` passes. The pull request, the merge and the release script remain. |
| 10. Hackolade Studio, in the `application` repository and probably `packages` first: write `uid` in place of `x_hackolade_id` and read both during a transition, and accept change blocks from the AI assistant, one proposal per statement | Separate work |

The open questions above are decided before step 9.
