---
title: Metadata blocks
description: How a Metadata block sets a note, a color and custom properties on an element declared elsewhere, and how the playground shows what it sets.
---

# Metadata blocks

A `Metadata` block sets settings on an element declared elsewhere: in the same document, or in a file the document imports and that you would rather not edit. It names the kind of element and the element, and its body holds `key: value` lines. Metadata blocks arrived with xDBML v0.7, from DBML 9.1; the language side is in [spec §24.7](/spec/v0.7#_24-7-metadata-blocks-settings-written-apart-from-the-element).

```xdbml
Table users {
  id    int [pk]
  email varchar
}

Metadata Table users {
  owner: 'data-team'
  note: 'Accounts of the web shop'
  headercolor: #3498DB
}

Metadata Column users.email {
  classification: 'confidential'
}
```

A block declares nothing. It adds no field, key, type or relationship; it annotates.

## What a block can target

The kinds of DBML work in every document: `Table`, `Column` (a field), `TableGroup` and `Note` (a sticky note). A document declaring `xdbml: 0.7` may also use `Entity`, `Collection`, `Record`, `Field`, `Container` and its synonyms such as `Schema`, `View` and `DiagramView`. A block stands at the top level, never inside a Container, and names a field by its path, `orders.shipping.country`, and an element in a Container with its Container, `sales.orders`.

## What a block can set

- `note`, rendered as Markdown in the inspector.
- The color of an element drawn as a shape: `headercolor` on a Table or a View, `color` on a TableGroup, a sticky note or a Container.
- Custom properties, such as `owner` or `x_steward`.

A setting xDBML defines elsewhere, such as `synonyms`, `tags` or `pk`, stays in the element's own brackets. In a Metadata block it reads as a custom property, with a warning.

## How the playground shows it

**On the diagram**, a color a block sets replaces the element's own: the header band of the entity, the frame of the Container, the box of the sticky note.

**In the inspector**, the settings and the note of an entity, a View, a field, a Container, a sticky note and a diagram view include those that Metadata blocks set. Each such setting carries a small **Metadata** badge, so you can tell it apart from one written in the element's brackets. **Edit in source** still moves the editor to the element's declaration, not to the block.

## When two sources set the same value

The element's own brackets come first, then the blocks of imported files, in import order, then the document's own blocks, in source order. The last one applies. When a block of the document changes a value that an earlier source set, the diagnostics panel shows a warning, so an override is never silent.

A block that names no element, or a kind that does not exist, is an error. See [**Diagnostics panel**](./diagnostics-panel).

## What's next

- [**Sticky notes**](./sticky-notes): a block can set a note's color.
- [**Module system: use and reuse**](./module-system): importing the elements a block annotates.
- [**Inspector pane**](./inspector-pane): where the settings show.
