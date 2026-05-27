---
title: Diagram pane
description: The center pane that renders your schema as an entity-relationship diagram.
---

# Diagram pane

The diagram pane in the center of the playground renders your xDBML schema as an entity-relationship diagram. It updates live as you edit, with no Refresh button or Generate step.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagram-pane.png`
Caption: The diagram pane with a multi-entity schema rendered, including a container, a relationship line, and one entity selected.
Should show: a sample like the e-commerce or blog schema, occupying the center pane between a visible editor on the left and a closed inspector. At least one entity should be selected (highlighted) so the selection style is captured.
:::

This page covers what the diagram contains and what you can do with it. For the visual vocabulary itself (what crow's foot symbols mean, how containers are styled, how nested fields display), see [**Reading the diagram**](./reading-the-diagram).

## What's in the diagram

The diagram is built from your schema's parsed AST. Every parseable change in the editor produces an updated diagram:

- **Containers** (Schema, Database, Keyspace, etc.) are drawn as labeled boxes wrapping their member entities.
- **Entities** (Table, Entity, Collection, Record) appear as cards with their fields listed.
- **Fields** are rows inside each entity card, showing name, type, and small badges for primary keys, unique constraints, required (not null), and auto-increment flags.
- **Relationships** (`Ref:` declarations) are drawn as curved lines between source and target fields, with crow's foot notation at each end indicating cardinality.
- **Nested fields** (objects, arrays, polymorphism alternatives) appear as indented rows with disclosure carets that let you collapse or expand them.

When parsing fails, the diagram keeps showing the last valid state. The diagnostics panel at the bottom lists the errors. See [**When parsing fails**](./when-parsing-fails) for details.

## Interacting with the diagram

Three families of interactions:

**Selection.** Click any container, entity, field row, or relationship line to select it. The selected element gets a highlight (thicker outline, blue accent), and the inspector pane opens on the right with its details. Click an empty area of the canvas to deselect.

**Navigation.** Pan with arrow keys or by middle-click-dragging. Zoom with Ctrl + scroll, the `+` and `−` buttons in the bottom-right corner, or the percentage input. Detailed coverage on [**Pan and zoom**](./diagram-pan-zoom).

**Repositioning.** Drag an entity's header band to move it. Other elements stay in place; relationship lines re-route automatically. The new positions persist across page reloads. Detailed coverage on [**Repositioning entities**](./diagram-drag).

## Expand and collapse nested fields

When a field has a structured type (object, array, oneOf, anyOf, allOf, map, set, tuple), its row has a disclosure caret on the left. Click the caret to collapse or expand the children inline.

The collapse state persists across page reloads, scoped per field path within each entity. Collapsing a deeply-nested object you don't care about lets you focus on the structure that matters for the conversation.

## Controls in the corners

**Bottom-right** holds the zoom controls: zoom out, zoom in, fit-to-screen, 1:1 reset, and the editable percentage input. See [**Pan and zoom**](./diagram-pan-zoom) for what each does.

**Top-right** (when entities have been moved) holds a Reset positions button that returns every entity to its auto-computed position. See [**Repositioning entities**](./diagram-drag) for details.

## What the diagram doesn't show

The diagram is a visual summary, not an exhaustive rendering of every detail in the AST. Things that don't appear visually:

- **Notes** are not shown on the diagram. They appear in the inspector when you select the entity, field, or container they're attached to.
- **Custom `x_*` properties** are not shown on the diagram. They appear in the inspector under a dedicated "Custom properties" section.
- **Setting values** beyond the flag badges (default values, regex patterns, length constraints, etc.) are not shown on the diagram. They appear in the inspector.
- **Views and indexes**, when added to xDBML in a future release, will get their own visual treatment.

This is intentional. The diagram aims to be readable at a glance; the inspector is where the full detail lives. See [**Inspector pane**](./inspector-pane) for what you can see there.

## What's next

- [**Pan and zoom**](./diagram-pan-zoom): keyboard, mouse, and button controls for navigating large schemas.
- [**Repositioning entities**](./diagram-drag): manual layout adjustments and how they persist.
- [**Reading the diagram**](./reading-the-diagram): the visual vocabulary, including crow's foot notation and the meaning of color and badge cues.
- [**Inspector pane**](./inspector-pane): what's shown when you click on something.
