---
title: Change blocks
description: How the playground shows a model followed by change blocks, and how Append changes adds a set of changes to the open document.
---

# Change blocks

A `Changes` block lists changes to a model in the form of the `CREATE`, `ALTER` and `DROP` statements of SQL: it creates elements, alters them and drops them. A document may hold a model and any number of change blocks after it, each applied to the model declared above it. Change blocks arrived with xDBML v0.8; the language side is in [spec §29](/spec/v0.8#_29-changes-evolving-a-model).

```xdbml
xdbml: 0.8

Table customers {
  id    int [pk]
  name  varchar
  email varchar(255)
}

Changes "Full name and longer email addresses" {
  alter Table customers {
    rename Field name to full_name
    modify Field email varchar(320)
    add Field preferred_language varchar(5) [default: 'en']
  }
}
```

The example **Changes to a model**, in the Examples menu, shows a longer model with three sets of changes.

## What the diagram shows

The diagram and the inspector show the model at the end of the document, with every change block applied. In the example above, the card of `customers` shows `full_name`, `email` as a `varchar(320)` and `preferred_language`. The editor keeps the text as written, so the declarations above the first change block still show the model as it was.

A relationship follows the element it names. A relationship written above a change block that renames its table relates the renamed table in the diagram.

## Append changes

**Append changes**, in the header, adds a set of changes at the end of the open document. Use it when an AI assistant proposes changes in a chat, or when someone sends you a file of changes:

1. Click **Append changes**.
2. Paste the change blocks into the box, or click **Choose a file...** to read them from a file. The text of the file appears in the box, so you can check it first.
3. Click **Append**.

The change blocks are added at the end of the editor, after a blank line, and the editor scrolls to them. The diagram then shows the model after them. **Ctrl+Z** in the editor takes the whole addition back.

The playground checks the text before it adds anything:

- The text must hold change blocks only. A line `xdbml: 0.8` at the top is accepted and left out. A declaration outside a change block, such as a whole model, is refused with the line it is on; use **Open** to load a model.
- The text must parse. A syntax error is reported with its line in the text you pasted.

Change blocks need `xdbml: 0.8` or later. When the open document declares an earlier version, the box says so, and appending changes its version line to `xdbml: 0.8`. A document with no version line receives one at the top.

## Statements that fail or are skipped

A statement that cannot apply is reported in the [**Diagnostics panel**](./diagnostics-panel), and its line in the editor is underlined. For example:

- a statement that names a table or a field that doesn't exist at that point of the document;
- a `drop` of a table that a relationship still refers to (drop the relationship first);
- a `modify` whose `was` no longer matches the field, because the model changed after the statement was written.

A statement written with `if exists` or `if not exists` is skipped when its element is missing or already present. The panel reports the skip as information, with a blue **i**, so you can see which statements did nothing.

## Limits

- The editor doesn't color the statement words, such as `Changes`, `alter` and `drop`, yet.
- The diagram doesn't mark which elements the change blocks added, changed or dropped.
- The playground can't yet rewrite the document as the model after the changes, without the change blocks.

## What's next

- [**Diagnostics panel**](./diagnostics-panel): the messages of change blocks.
- [**Loading examples**](./loading-examples): the example **Changes to a model**.
- [**Header bar & menus**](./header-bar): the other buttons of the header.
