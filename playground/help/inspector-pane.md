---
title: Inspector pane
description: The right-side panel that shows full metadata for any selected element.
---

# Inspector pane

The inspector pane on the right side of the playground shows the complete metadata for whatever you've selected in the diagram. It's the place to look when you want to know exactly what the parser made of a specific construct, beyond what fits on a diagram card.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `inspector-pane-field.png`
Caption: The inspector showing a selected field with its identification, type, flag badges, settings, and Note.
Should show: the playground with a field selected in the diagram (the row visibly highlighted), and the inspector pane open on the right showing: kind badge (FIELD), field name, parent entity and container, type, REQUIRED and UNIQUE badges, a couple of settings rows, and a Note block with some text.
:::

## When it appears

The inspector slides in from the right when you select something in the diagram. Four kinds of things are selectable:

- **Containers** (Schema, Database, Keyspace, etc.)
- **Entities** (Table, Entity, Collection, Record)
- **Fields** (any field row, at any nesting depth)
- **Relationships** (`Ref:` declaration lines)

Selecting anything opens the inspector if it was closed. Clicking the empty canvas deselects and hides the inspector.

## How to close it

Two ways:

- **Click the × button** on the inspector header. The inspector is hidden and the selection is cleared.
- **Click an empty area of the canvas**. The selection is cleared, which also closes the inspector.

Once closed manually, the inspector stays hidden until you make a new selection. Your "explicitly closed" state persists across reloads, so if you prefer working without the inspector you don't have to dismiss it every session.

## What's in each kind of inspector

The header always shows a colored badge with the kind (`SCHEMA`, `TABLE`, `FIELD`, `REF`) and the element's name. Below that, the body is organized into labeled sections that vary by kind.

**Container inspector** shows:
- Identification: keyword (Container / Schema / Database / etc.), name, member count
- Settings: target engine, type, and any other settings on the container declaration
- Note: the container's `Note: '...'` body if present

**Entity inspector** shows:
- Identification: keyword (Table / Entity / Collection / etc.), name, parent container (if any), field stats (total / primary keys / required / nested)
- Settings: any settings on the entity declaration
- Note: the entity's `Note: '...'` body if present

**Field inspector** shows:
- Identification: name, dotted path within the entity, parent entity, parent container
- Type: short label plus an expandable structural breakdown for compound types (objects, arrays, oneOf, etc.)
- Flags: badges for PRIMARY KEY, UNIQUE, REQUIRED, and AUTO-INCREMENT when present
- Settings: regular settings (default values, regex patterns, length constraints, etc.)
- Custom properties: anything starting with `x_` shown in a separate section, since these are the AI-readiness extension point
- Note: the field's `Note: '...'` body if present

**Relationship inspector** shows:
- Identification: operator (`>` `<` `-` `<>`), source path, target path, and a name if the Ref was declared with one
- Settings: any cardinality strings, tags, or other settings on the Ref declaration

## Read-only

The inspector is purely a display surface in this version. You can't edit values in it; click the **Edit in source** button at the bottom of each inspector to jump your editor cursor to the right place and edit by typing. The "single source of truth" is always the text in the editor; the inspector is a view onto it.

## Edit in source

Every inspector has an **Edit in source** button at the bottom. Clicking it moves the editor cursor to the start of the inspected element in the source code, scrolls the editor to that position, and gives the editor focus. Useful when:

- You've found something interesting in the inspector and want to make a change
- A field is buried deep in nested structure and you don't want to scroll through the editor to find it
- You're following a relationship from one entity to another and want to inspect the declaration

The button works on all four inspector kinds.

## Resizing the pane

Drag the vertical divider on the left edge of the inspector to resize it. The width range is 240 to 600 pixels. Width is remembered across reloads.

The inspector takes priority over the diagram pane: as the inspector widens, the diagram narrows. The editor pane's width is not affected.

## Persistence

Three things about the inspector are saved to local storage:

- **The current selection.** If you select an entity, reload the page, the same entity is selected and the inspector opens to it (provided that entity still exists in the schema).
- **Inspector width.** Restored on reload.
- **The explicit-close flag.** If you dismissed the inspector via the × button, it stays dismissed across reloads until you click something in the diagram.

If the schema is edited such that the persisted selection no longer matches anything (the named entity was deleted, the path no longer exists), the inspector silently shows its empty state on next load and waits for a new selection.

## What's next

- [**Reading the diagram**](./reading-the-diagram): the visual vocabulary that the inspector adds detail to.
- [**Diagram pane**](./diagram-pane): how to select things in the diagram.
- [**Editor pane**](./editor-pane): where edits actually happen, after Edit in source navigates you there.
