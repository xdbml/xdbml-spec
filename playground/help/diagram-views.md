---
title: Diagram views
description: How to show a diagram view, what it draws, and what it keeps of its own.
---

# Diagram views

A large model is easier to read one subject at a time. A diagram view is a named subset of the model's diagram, known in other data modeling tools as a subject area or a sub-model. It lists the entities to show, directly or through the Containers, TableGroups and supertype groups that hold them, and the playground draws them on a canvas of their own. Diagram views arrived with xDBML v0.6.3; the language side is in [spec §18](/spec/v0.6#_18-diagram-view-subject-areas-and-sub-models), and [example 16](/examples/16-diagram-views) has three of them.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagram-views-menu.png`
Caption: Example 16, with the Diagram menu open.
Should show: the Diagram menu in the diagram toolbar, open, listing Main ERD, order_to_cash, parties and catalog_usage, with order_to_cash drawn behind it: the sales, billing and crm frames, and customers alone in crm.
:::

## Showing a diagram view

When the document declares at least one `DiagramView`, a **Diagram** menu appears at the left end of the toolbar at the bottom right of the diagram pane. **Main ERD** is the full diagram; each other entry is a diagram view, in the order the document declares them. Choosing one redraws the pane at once. A document without diagram views shows no menu.

The playground remembers the diagram you were looking at, so a reload returns to it. Opening a file, an example or a shared link starts on Main ERD.

## What a diagram view draws

A diagram view draws its members, as [spec §18.2](/spec/v0.6#_18-2-members) defines them, and with them:

- **Container frames** around the members each Container holds. When a diagram view takes one entity from a Container, the frame holds that entity only.
- **Relationships and Edges** whose two ends are members. A relationship with one end outside the diagram view is not drawn. You never list relationships yourself.
- **Supertype group symbols** when the supertype and at least one subtype are members, connected to the subtypes on display.

An entity looks the same in every diagram view and in Main ERD, since a diagram view holds no copy of it. Its attributes, its badges and its `fk` or `dk` markers stay as they are, even when the entity at the other end of a relationship is not in the diagram view. Edit an entity in the editor and the change shows wherever the entity appears.

Sticky notes and TableGroup frames are not drawn in the playground yet, in any diagram. A `Notes { ... }` list in a diagram view is checked, and has no visible effect for now.

## Inspecting a diagram view

Click an empty area of the canvas while a diagram view is on display: the inspector shows its members, the Containers framed around them, its categories as written, its custom properties and its note. A diagram view takes a note in its brackets or in its body, as a TableGroup does:

```xdbml
DiagramView order_to_cash [note: 'From the order to its invoice and payment'] {
  Containers {
    sales
    billing
  }
}
```

On Main ERD, the same click shows the Project and its note.

## What each diagram keeps of its own

Main ERD and each diagram view keep their own:

- **Entity positions and Edge offsets.** Dragging an entity in a diagram view moves it there only. A diagram view opened for the first time is arranged with the Relational strategy and fitted to the pane.
- **Zoom level.**
- **Display options.** A diagram view starts with every relationship kind shown and names off, whatever Main ERD shows.
- **Undo and redo history** for layout changes, for as long as the document stays open.

Collapsed nested fields are shared: collapsing a field in one diagram collapses it in all of them, since it changes how the entity itself is drawn.

## When a diagram view changes

Renaming or removing the diagram view on display in the editor returns the pane to Main ERD. Positions saved under the old name stay in local storage and come back if the name returns.

A name in a diagram view that matches nothing, matches entities in several Containers, or names an element of the wrong kind shows in the [diagnostics panel](./diagnostics-panel); the rest of the diagram view still draws.

## What's next

- [**Repositioning entities**](./diagram-drag): dragging, and Reset positions, which applies to the diagram on display.
- [**Persistence & undo**](./persistence-and-undo): what the playground keeps between sessions.
