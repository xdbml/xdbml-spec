---
title: Entity cards
description: How each entity is rendered in the diagram, including header bands, field rows, and badges.
---

# Entity cards

Each `Table`, `Entity`, `Collection`, or `Record` declaration in your schema appears in the diagram as a card. This page walks through what's on a card and what each visual element signals.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `entity-card-anatomy.png`
Caption: An entity card with each visual region labeled.
Should show: a single entity card (e.g. a `users` table) at large enough size to see clearly, with annotations or callouts identifying: the colored header band with the entity keyword and name, the field rows, the right-aligned type labels, the PK/UNIQUE/REQUIRED badges, and the card outline.
:::

## The header band

The colored strip across the top of each card carries:

- **The keyword** (Table, Entity, Collection, Record) on the left, in a smaller font.
- **The entity name** in larger, bolder text.

The keyword stays visible because xDBML lets you choose between several entity keywords depending on what kind of storage technology you're modeling. Seeing "Collection" vs "Table" on a diagram tells you whether the author was thinking documents or rows.

### Header color

The header band gets its color from the entity's parent container, when there is one. All entities inside the same container share the same header color, which makes the visual grouping easier to follow. Top-level entities (not inside any container) get a default neutral color.

The color is picked deterministically from the container name, so the same container always gets the same color across reloads, examples, and screenshots.

## The card body

Below the header, the body lists the entity's fields, one per row. Each row shows:

- **The field name** on the left, slightly indented for nested fields (see [**Nested fields**](./nested-fields)).
- **The field type** right-aligned on the right side.
- **Flag badges** between the name and type, when present.

The card auto-sizes to fit its contents. There's a minimum width so small entities don't look squished and a soft maximum so wide types don't blow up the layout.

## Field row badges

Three flag badges come from the field's own settings:

- **P** (yellow circle): the field is marked `[pk]` or `[primary key]`. Composite keys show the badge on every member field.
- **U** (purple circle): the field is marked `[unique]`. A primary key doesn't repeat it.
- **!** (red circle): the field is marked `[not null]` or `[required]` (the parser normalizes the two to the same canonical form).

Four relationship markers, drawn as small pills, come from the relationships that use the field. You never write them yourself:

- **fk**: the child side of a foreign key; **dk**: the parent side of a foreign key.
- **fm**: the child side of a foreign master (a denormalized copy of another attribute); **dm**: the parent side of a foreign master.

A field that parents both kinds of relationship shows dk and dm side by side. See [**Relationships & crow's foot notation**](./relationships-crows-foot).

Badges appear after the field name, before the type label. A field can have several: a typical primary key shows as `id P int`, and a required unique email as `email U ! varchar`.

`[increment]` gets no badge on the card; select the field to see it in the [**Inspector pane**](./inspector-pane).

Other settings (default values, regex patterns, length constraints, custom `x_*` properties) don't get badges on the card. They show in the inspector when you select the field. The diagram's job is shape, not detail.

## Field row types

The type label on the right of each row shows a compact form of the field's type:

- **Scalar types** show their name: `int`, `varchar`, `timestamp`, `objectId`.
- **Sized scalars** include the size: `varchar(100)`, `decimal(10,2)`.
- **Object types** show as `object {…}`. The actual fields appear as nested rows below.
- **Array types** show as `array of <element>`, where `<element>` is the element's short type label.
- **Polymorphism types** show as `oneOf (n)`, `anyOf (n)`, or `allOf (n)` where `n` is the number of alternatives.
- **Map types** show as `map [<key> → <value>]`.
- **Set types** show as `set [<item>]`.
- **Reference types** (`type: MyOtherEntity`) show the referenced entity's name.

The compact form is meant to fit on one row. Detailed type info, including nested structure, is in the inspector's "Type" section, accessible via "Show structural details."

## Selection highlight

A selected entity card gets:

- A thicker outline (2 pixels instead of 1)
- The outline turns blue (matching the playground's accent color)

A selected field row inside an entity card gets:

- A light blue background tint
- A 3-pixel-wide blue strip down the left edge as an accent

If you select a field, the entity card's outline also highlights (because selecting a field implies selecting its parent). The blue accent on the row tells you which specific field you have selected.

## What the card doesn't show

- **Settings on the entity declaration** (e.g. `Table users [headercolor: '#ff0000']`). These are in the inspector's "Settings" section.
- **The `Note: '...'` body** of an entity. Shown in the inspector's "Note" section.
- **Indexes, views, computed columns.** These language features are either future xDBML additions or already in the spec but not yet visualized. They will get their own treatment as they're added.
- **The full path** of a field (for nested fields). The card shows the indented row; the inspector's identification section shows the full dotted path.

## What's next

- [**Containers**](./containers): how groups of entities are visually wrapped.
- [**Nested fields**](./nested-fields): how object, array, and polymorphism children render inside a card.
- [**Visual cues at a glance**](./visual-cues): the compact reference table for all of the visual signals.
