---
title: Sticky notes
description: How a sticky note is written, drawn, added from the toolbar, moved and inspected.
---

# Sticky notes

A sticky note is an annotation on the diagram: a legend, a reminder, an explanation of a design choice. It belongs to no entity. In the source it is a top-level `Note` with a name, as in DBML, and its text is Markdown. Sticky notes arrived with xDBML v0.7; the language side is in [spec §19](/spec/v0.7#_19-note).

```xdbml
Note order_lifecycle [color: #FDE68A] {
  '''
  ## Order lifecycle
  An order is **placed**, then *paid*, then shipped.
  See the `orders.status` enum.
  '''
}
```

::: screenshot
**[Screenshot needed]**
Filename suggestion: `sticky-notes-overview.png`
Caption: A sticky note beside the entities it explains, and a second one inside a Container.
Should show: the note above on the canvas, its heading and bold text rendered, and a note in a Container frame, with the frame grown to hold it.
:::

## How a note is drawn

The note is a box with a folded corner, light yellow unless its `color` setting gives another color (`#rgb` or `#rrggbb`). With `color: none`, the text stands alone, with no box. The text renders as Markdown: headings, bold and italic, strikethrough, inline code, links, bulleted and numbered lists, block quotes, code blocks and horizontal rules. A table or HTML shows as written.

The box is 220 pixels wide, and widens to 280, then 340 pixels before a long text makes it taller than wide. Body text has the size of a field name, and a heading is never larger than an entity's name.

A top-level `Note` without a name is not a sticky note: it is the note of the project, shown in the diagram inspector on Main ERD rather than on the canvas.

## Adding a note from the toolbar

The note button in the diagram toolbar writes a new note into the source:

```xdbml
Note note_1 {
  'Write something...'
}
```

The diagram places it at the center of the view and selects it, so you can type its text in the editor right away. Undo in the editor takes the note back.

Where the note goes depends on what is on display:

- With a Container selected, in a document declaring `xdbml: 0.7`, the note goes into that Container's body and is named with it, such as `sales.note_1`.
- On a diagram view, the note joins the view's `Notes` list, so it shows there.
- Otherwise it goes at the end of the document.

## Notes in a Container

In a document declaring `xdbml: 0.7`, a named `Note` in a Container body is a sticky note attached to the Container. It is drawn inside the Container's frame, which grows to hold it, and dragging the Container carries the note along. The rest of the document names it with its Container, as in `Metadata Note sales.order_states { ... }`. The unnamed `Note:` of a Container stays the Container's own note, shown in its inspector.

## Moving and selecting

Drag a note by any part of its box. Its position is remembered with those of the entities, and **Reset positions** returns it to its place in the automatic layout.

A click without a move selects the note. The inspector shows its name, its Container if it has one, its color, its custom properties and its text, rendered. A color or a property that a `Metadata` block sets carries a **Metadata** badge. **Edit in source** moves the editor to the declaration.

## Hiding notes

**Display > Annotations > Sticky notes** hides every sticky note. The choice is remembered, and the Display button is highlighted while the notes are hidden.

## In a diagram view

A diagram view shows the sticky notes it lists under `Notes`, and those of the Containers it lists. See [**Diagram views**](./diagram-views).

## What's next

- [**Data lineage**](./data-lineage): the curves between entities computed from one another.
- [**Metadata blocks**](./metadata-blocks): setting a note's color from another file.
- [**Visual cues at a glance**](./visual-cues): the compact reference.
