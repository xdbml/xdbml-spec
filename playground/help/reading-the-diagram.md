---
title: Reading the diagram
description: The visual vocabulary of the playground's entity-relationship diagram.
---

# Reading the diagram

The playground's diagram uses a consistent visual vocabulary so you can understand a schema at a glance. This section breaks down what each visual element means, separately from how you interact with the diagram (which is covered in [**Diagram pane**](./diagram-pane)).

::: screenshot
**[Screenshot needed]**
Filename suggestion: `reading-the-diagram-overview.png`
Caption: A diagram with most visual vocabulary elements visible, captioned to identify each.
Should show: a moderately complex schema like the e-commerce example, with at least one container visible (with its accent color and dashed border), entity cards with header bands, field rows with badges (PK, unique, required), one nested object structure with disclosure carets, and at least two relationship lines with crow's foot symbols at their endpoints.
:::

## What's in this section

[**Entity cards**](./entity-cards): how each table or entity is rendered, including the header band, field rows, badges, and the color coding.

[**Containers**](./containers): the dashed boxes that wrap groups of entities. What the container types mean, how they're styled, and when they don't appear at all.

[**Relationships & crow's foot notation**](./relationships-crows-foot): the curved lines between entities, the symbols at each endpoint, and what cardinality each combination represents.

[**Nested fields**](./nested-fields): how objects, arrays, polymorphism alternatives, maps, sets, and tuples are visualized inside an entity card. Includes the expand/collapse caret and synthetic-row notation.

[**Visual cues at a glance**](./visual-cues): a compact reference table of every visual signal in the diagram. Bookmark this one if you're skimming.

## The general principle

The diagram is meant to be read at a glance. That guides three design choices:

**Structure over detail.** The diagram shows shape: which entities exist, which ones are related to which, what the rough field layout looks like. Detailed metadata (full setting values, Notes, custom properties) lives in the inspector, not on the cards. The cards stay legible.

**Consistent symbols across all examples.** Crow's foot at the many-end of every relationship. PK badge on every primary key, regardless of which container the entity lives in. Dashed border on every container. The same conventions apply to all six bundled examples and any schema you write yourself.

**Visual differentiation by structural role, not by name.** A field's name doesn't determine how it's drawn; its role does. A primary-key field gets a yellow badge whether it's called `id`, `customer_id`, or `uuid_pk`. A required field gets a red badge whether it's tagged `[not null]` or `[required]`. This makes the diagram robust to your naming conventions.

## Where the visual vocabulary comes from

Most of it follows long-established conventions:

- **Crow's foot notation** for cardinality has been the dominant style in ERD tools since the 1980s. Same shapes you'd see in Lucidchart, DataGrip, dbdiagram.io, or older tools like ERwin.
- **Header bands** with a colored top strip on entity cards is borrowed from dbdiagram.io and Hackolade Studio.
- **Container styling** (dashed border, colored header band) is similar to how UML tools draw packages and how dbdiagram.io draws table groups.
- **Nested-field indentation** mirrors how IDE code outlines and JSON tree views show hierarchy.

A handful of conventions are xDBML-specific or playground-specific:

- The italic styling for "synthetic" rows (array elements, polymorphism alternatives) that don't correspond to user-written field names.
- The amber italics for custom `x_*` properties, signaling they're an extension point.
- The container accent color hash, which picks one of a handful of colors deterministically based on the container's name.

## What's next

Pick whichever sub-page matches what you're looking at:

- [**Entity cards**](./entity-cards)
- [**Containers**](./containers)
- [**Relationships & crow's foot notation**](./relationships-crows-foot)
- [**Nested fields**](./nested-fields)
- [**Visual cues at a glance**](./visual-cues)
