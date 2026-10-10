---
title: Diagnostics panel
description: The bottom strip that lists errors and warnings, with click-to-jump and copy.
---

# Diagnostics panel

The diagnostics panel is a thin horizontal strip across the bottom of the playground. It tells you at a glance whether your schema has problems, and lists each one with click-to-jump-to-source.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagnostics-panel-errors.png`
Caption: The diagnostics panel expanded, showing one error and one warning with line and column.
Should show: the bottom of the playground UI with the diagnostics panel expanded. The header shows "1 error" in red and "1 warning" in amber. Two rows are visible: one with a red × icon, one with an amber ! icon, each with a message, "Line N, column M" in a smaller grey font, and a code chip such as `possible-type-typo`.
:::

## What the header shows

The header stays visible, about 32 pixels tall, so the layout doesn't shift when a problem appears. It shows one of:

- **No issues**, in grey, when the schema parses and resolves cleanly.
- **An error count**, in red with a small × icon: "1 error", "3 errors".
- **A warning count**, in amber with a small ! icon: "1 warning", "2 warnings".

Errors and warnings are counted separately, so a schema with both shows the two counts side by side. When there is something to list, a caret (▸ or ▾) shows whether the body is collapsed or expanded, the header reads "Click to expand" or "Click to collapse", and a **Copy** button sits at its right end (see [Copying diagnostics](#copying-diagnostics)).

## Errors and warnings

The playground checks your schema in two stages.

**Parsing** reads the text. A syntax error stops it at the first problem, so the panel lists that one error, and the diagram keeps showing the last schema that parsed. [When parsing fails](./when-parsing-fails) covers recovery.

**Resolution** runs on a schema that parsed and checks what its names refer to: that a relationship points at an entity and a field that exist, that an injected partial is declared, that a key or index names fields the entity declares, that a foreign key references a key, that a supertype group follows the rules of the specification. It can report several problems at once. Since the schema parsed, the diagram and the inspector keep up with your edits while these diagnostics are listed.

Resolution reports two severities. An **error** marks something the schema cannot mean as written, such as a relationship to an entity that doesn't exist, or two declarations with the same name. A **warning** marks something valid that is probably not what you intended. These warnings exist today:

- **`possible-type-typo`**: a type name that is not declared, but is close to a declared Type or Enum, such as `Adress` in a schema that declares `Type Address`. The message suggests the declared name. Any type name is valid in xDBML, so target-native types such as `number`, `clob` or `serial` raise nothing on their own; the warning appears only for a near miss.
- **`ambiguous-ref-endpoint`**: a relationship endpoint that reads both as an entity and as a field of another entity. The field reading is used; rename one of them or qualify the path.
- **`empty-supertype-group`**: a supertype group that lists no subtype yet.
- **`merge-without-roll-up`**: a `merge` setting on a supertype group where neither the group nor any subtype uses `strategy: roll_up`, the only strategy it applies to.
- **`source-query-in-settings`**: a View writes `source_query` in the brackets after its name. The source query belongs in the body, as `source_query: '...'`; in the brackets it stays an ordinary setting, so the inspector does not show it as the view's query.
- **`duplicate-source-query`**: a View declares a second `source_query:` in its body. The first one is the view's source query.
- **`duplicate-unique-key`**: an entity declares the same unique key twice, for example `[unique]` on a field and the same field as a `unique` line in `constraints`. Declare it in one place: inline for a single field without a name, in `constraints` otherwise.
- **`name-collision`**: two declarations share one qualified name, such as a Type and an Entity named `customers`. Entities, Views, Edges, Types, Enums and TablePartials share one namespace (spec §15.5): rename one of them. An error from v0.6, a warning in a document declaring an earlier version or none.
- **`container-target-missing`**: the Project declares several targets and a Container declares none. Write it after the Container's name, as in `Schema core [target: PostgreSQL] { ... }` (spec §5.2).
- **`container-target-not-in-project`**: a Container's target is not among the Project's targets. Add it to the Project's `targets:`, or change the Container's target (spec §5.2).

A few conditions change severity with the version the document declares. In an `xdbml: 0.6` document they are errors; in a document declaring an earlier version, or none (plain DBML), they are warnings, so a file that was valid under its version stays valid:

- **`ref-target-not-key`**: a foreign key references fields that are neither the primary key nor a unique key of an entity that declares keys. A relational database refuses such a foreign key. Declare the fields unique, or reference the key. Relationships to an entity without keys, to or from a document or graph target, many-to-many relationships, foreign master relationships and entity-level relationships are exempt.
- **`duplicate-primary-key`**: an entity declares its primary key in two places, for example `[pk]` on a field and a `pk` entry in `indexes`.
- **`null-in-primary-key`**: `null` written on a field of the primary key.
- **`unresolved-index-field`**: an index names a field the entity does not declare.
- **`invalid-tuple-positions`**: the positions of a tuple, `array [ [0] ... [1] ... ]`, skip a number, repeat one, or do not start at `[0]`. A tuple of three elements numbers them `[0]`, `[1]` and `[2]` (spec §8.6).
- **`named-type-shadows-builtin`**: a Type takes the name of a built-in type, such as `Type Money` or `Type varchar`, in any letter case. Built-in types take precedence, so the fields typed with that name never reach the Type: rename it (spec §15.2).

The last two are errors in a document declaring v0.6 or later, and warnings in a document declaring an earlier version, since no parser checked them before v0.6.4.
- **`duplicate-diagram-view-category`**: a diagram view writes one category twice, or both `Schemas` and `Containers`, which are one category. Write each category once. In a document without a version declaration it is a warning, since DBML accepts it, and the two lists combine (spec §18.6).

Diagram views (spec §18) add five errors of their own, whatever version the document declares:

- **`unresolved-diagram-view-name`**: a name in a diagram view matches nothing of its category's kind.
- **`ambiguous-diagram-view-name`**: an unqualified name, such as `orders`, matches entities in several Containers and none outside a Container. Write the qualified name, `sales.orders`.
- **`diagram-view-wrong-category`**: a name lists an element under the wrong category, such as a database view under `Tables`. The message names the right category. An Edge is never listed: it appears when both of its ends do.
- **`duplicate-diagram-view`**: two diagram views share one name.
- **`unknown-diagram-view-setting`**: the brackets of a diagram view hold a setting other than `note` or a custom `x_` property.

The `Containers`, `Views` and `SupertypeGroups` categories, and a diagram view's note and settings, are xDBML extensions: in a document without a version declaration they raise `construct-requires-version`. DBML's own name for Containers, `Schemas`, needs no declaration. See [**Diagram views**](./diagram-views).

TablePartials (spec §17.1) add one condition, with the same severity whatever version the document declares:

- **`partial-injection-in-partial`** (error): the body of a TablePartial, or one of its fields, holds a `~name` line. A TablePartial does not inject another one; write both `~name` lines in the body that needs the fields of both.

Internal definitions (spec §15.8) add five conditions of their own, with the same severity whatever version the document declares, since no parser read a `definitions` block before 0.6.5:

- **`definitions-outside-entity`** (error): a TablePartial or an Edge holds a `definitions` block. Internal definitions belong to an entity; declare a shape reused elsewhere as a `Type`. In a View, the block stops the parse with a message citing §15.8.1.
- **`duplicate-definitions-block`** (error): an entity declares a second `definitions` block. Put every entry in one.
- **`duplicate-definition`** (error): two entries of one block share a name.
- **`definitions-unsupported-target`** (error): the entity's target takes no internal definitions: a relational target, Cassandra, ScyllaDB, Neo4j, Memgraph, Neptune or JanusGraph. Declare the shape as a `Type` at the top of the document (spec §15.8.4).
- **`definition-shadows-type`** (warning): an entry takes the name of a Type or an Enum declared outside the entity. Inside the entity, the entry wins.

An entry under the name of a built-in type, such as `money`, raises `named-type-shadows-builtin` as an error in every version.

## Rows in the body

Each row shows:

- A red × for an error, or an amber ! for a warning.
- The message, for example "Relationship endpoint references unknown entity 'custmers'."
- The source position in grey: "Line 12, column 5".
- For a resolution diagnostic, a short code such as `unresolved-entity` or `possible-type-typo`, the same code the MCP `validate_xdbml` tool reports. Syntax errors carry no code.

Rows are sorted by line, then column, matching the order you'd read them in the source. The body scrolls once the list is taller than about 200 pixels, so a long list doesn't push the diagram off-screen.

## Click to jump

Clicking anywhere on a row moves your editor cursor to that line and column, scrolls the editor to bring it into view, and gives the editor focus. Useful when you have many diagnostics, or when one is on a line that's scrolled off-screen.

A click that ends a text selection doesn't jump, so a selection you drag across a row stays in place for copying.

## Copying diagnostics

There are two ways to take diagnostics out of the playground, for a bug report or a message to a colleague:

- **Select and copy.** Drag across the text of one or more rows to select it, then press Ctrl+C (Cmd+C on a Mac).
- **Copy everything.** Click **Copy** at the right end of the header. Every diagnostic goes to the clipboard, one per line, in the order of the list: the severity, the line and column, the code when there is one, and the message, as in `Error at line 12, column 5 [unresolved-entity]: Relationship endpoint references unknown entity 'custmers'.` The button reads "Copied" for two seconds.

## How it relates to editor squiggles

The same diagnostics appear in the editor pane as squiggles, red for errors and amber for warnings, with the message and code in a hover tooltip. The two surfaces are complementary:

- **Squiggles** are visible while you're already looking at the editor, in place at the offending token.
- **The diagnostics panel** is visible regardless of which pane has your attention, lists every diagnostic compactly, and gives you the counts.

## Collapsing the body

The body is expanded by default. Click the header to collapse or expand it; the caret rotates to match, and the playground remembers your choice across reloads. When there is nothing to list, the header doesn't respond to clicks.

When you collapse with diagnostics present, the counts stay visible in the header so you don't forget about them.

## What's next

- [**When parsing fails**](./when-parsing-fails): broader strategies for recovering from broken schemas.
- [**Editor pane**](./editor-pane): the editor side of error reporting, including squiggles and hover tooltips.
