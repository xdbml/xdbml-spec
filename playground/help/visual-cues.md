---
title: Visual cues at a glance
description: Compact reference for every visual signal in the diagram.
---

# Visual cues at a glance

A quick reference table covering every visual signal in the diagram. Bookmark this if you're skimming. For the explanations behind each cue, follow the link in the rightmost column.

## Containers

| What you see | What it means | More |
|---|---|---|
| Dashed-border box around entities | A container declaration (Schema, Database, Container, etc.) | [Containers](./containers) |
| Colored header band on the container | Identifies the container by its accent color | [Containers](./containers) |
| Keyword and name in the header | The container's keyword (Schema, Database, etc.) and its name | [Containers](./containers) |
| `→ EngineName` on the right of the header | The target storage engine (Oracle, MongoDB, etc.) | [Containers](./containers) |
| All entities inside share a header color | They belong to the same container | [Containers](./containers) |
| Thicker blue outline on the container | The container is currently selected | [Inspector pane](./inspector-pane) |

## Entity cards

| What you see | What it means | More |
|---|---|---|
| Card with header band and field rows | An entity (Table, Entity, Collection, Record) | [Entity cards](./entity-cards) |
| Keyword in the header (small text) | "Table", "Entity", "Collection", or "Record" | [Entity cards](./entity-cards) |
| Entity name in the header (large text) | The entity's declared name | [Entity cards](./entity-cards) |
| Thicker blue card outline | The entity (or one of its fields) is currently selected | [Inspector pane](./inspector-pane) |
| Light blue row background | That field row is selected | [Inspector pane](./inspector-pane) |
| Blue strip on the left edge of a row | Selection accent on the selected field row | [Inspector pane](./inspector-pane) |

## Field badges

| Badge | Color | What it means | Source setting |
|---|---|---|---|
| PK | Yellow | Primary key | `[pk]` or `[primary key]` |
| UNIQUE | Purple | Unique constraint | `[unique]` |
| REQUIRED | Red | Not nullable | `[not null]` or `[required]` |
| AUTO | Blue | Auto-increment | `[increment]` |

Composite primary keys show the PK badge on every member field, not just the first one.

## Field row text

| What you see | What it means |
|---|---|
| Plain field name | A user-defined field |
| Italic field name | A synthetic row (`[item]`, `{alt}`, `<key>`, `<value>`, `<item>`, `[N]`) that doesn't correspond to a user-written field |
| Type label right-aligned | The compact form of the field's type |
| `varchar(100)`, `decimal(10,2)` | A sized scalar type with parameters |
| `object {…}` | An object type with sub-fields rendered as nested rows |
| `array of X` | An array type; `X` is the element type's short form |
| `oneOf (n)`, `anyOf (n)`, `allOf (n)` | A polymorphism with `n` alternatives |
| `map [K → V]` | A map type from `K` to `V` |
| `set [X]` | A set of `X` |
| `tuple (n)` | A tuple with `n` positions |

## Disclosure carets

| Caret | Meaning |
|---|---|
| `▾` (downward) | The parent row is expanded; children are visible. Click to collapse. |
| `▸` (rightward) | The parent row is collapsed; children are hidden. Click to expand. |
| No caret | Leaf field; no children to show. |

Carets only appear on rows whose field has structured-type children. See [Nested fields](./nested-fields).

## Relationships

The curved line between two entities is a `Ref:`. Each endpoint carries a symbol indicating cardinality and optionality:

| Symbol | Cardinality | Reads as |
|---|---|---|
| `─║` | Exactly one | `min=1, max=1` (mandatory, single) |
| `─○║` | Zero or one | `min=0, max=1` (optional, exclusive) |
| `─≺` | One or many | `min=1, max=*` (mandatory, multiple) |
| `─○≺` | Zero or many | `min=0, max=*` (optional, multiple) |

The ring (`○`) means "zero allowed." The bar (`║`) caps "exactly one." The crow's foot (`≺`) means "many," with the V opening toward the entity. See [Relationships & crow's foot notation](./relationships-crows-foot).

When the line is **blue and thicker**, the relationship is currently selected.

Cardinality text labels (`0..*`, `1..1`, etc.) appear next to the glyphs as the source of truth. Glyphs are the visual shorthand; text is exact.

## Colors

| Color | Where it appears | What it means |
|---|---|---|
| Blue (`#2563eb`) | Selection outlines, accents | Currently selected element |
| Yellow | PK badge | Primary key |
| Purple | UNIQUE badge | Unique constraint |
| Red | REQUIRED badge, error squiggles, diagnostics errors | Required field, or a parse error |
| Amber | Warning indicators, screenshot placeholders in help | Warning or todo |
| Grey | Type labels, cardinality text, indent guides | Subordinate information |
| Container accent colors | Container header bands, member entity header bands | Container identity (deterministic from name) |

## Cursor states

| Cursor | Where | What it indicates |
|---|---|---|
| Default (arrow) | Empty canvas | No action available; click to deselect |
| Pointer (hand) | Anywhere clickable: entity headers, field rows, container bodies, relationship lines | Clickable to select |
| Grab / grabbing | Entity header band when held | Drag in progress |
| Col-resize | Pane dividers | Drag to resize the pane |

## What's next

If you want the explanations behind the cues:

- [**Entity cards**](./entity-cards)
- [**Containers**](./containers)
- [**Relationships & crow's foot notation**](./relationships-crows-foot)
- [**Nested fields**](./nested-fields)
