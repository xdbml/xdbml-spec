---
title: Data lineage
description: How a Dep is written and drawn, what its curves, junctions and arrowheads mean, and how to inspect it.
---

# Data lineage

A `Dep` records that an entity, a View or a field is computed from another, by a job or a query that lives outside the model: an ETL job, a dbt model, the query of a view. The diagram draws it as a curve with an arrowhead, from the source to the target. Data lineage arrived with xDBML v0.7, from DBML 10.0; the language side is in [spec §27](/spec/v0.7#_27-data-lineage-dep). Open the **Data lineage** example from the Examples menu to follow along.

A `Dep` is not a relationship. A `Ref` says how the rows of two entities connect; a `Dep` says how the data is produced, and states no cardinality.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `data-lineage-overview.png`
Caption: Example 18, with its sources on the left and its marts on the right.
Should show: the raw tables on the left, the staging layer in the middle, the marts on the right, the amber curves between them, and the junction where `first_name` and `last_name` meet before `full_name`.
:::

## Writing a dependency

The arrow points from upstream to downstream, `->` or `<-`, so `a -> b` and `b <- a` say the same thing. There are three forms:

```xdbml
// Short form: one dependency, with an optional name
Dep load_orders: raw_orders -> stg_orders

// Block: the dependencies into one downstream element, with the query as note
Dep build_full_name {
  raw_customers.first_name -> stg_customers.full_name
  raw_customers.last_name  -> stg_customers.full_name
  Note: '''first_name || ' ' || last_name'''
}

// Inline: in the brackets of the element it concerns
Table fct_orders [dep: <- stg_orders] {
  revenue decimal [dep: <- stg_orders.amount]
}
```

An end names an entity, a View, or a field of either, a nested field with its path. A dependency may go from an entity to a field, such as a row count, or from a field to an entity, such as an array unnested into a table.

## How a dependency is drawn

| What you see | What it means |
|---|---|
| Amber curve, arrowhead at one end | A dependency; the element at the arrowhead is computed from the element at the other end |
| Curve ending at a field row | That end names the field |
| Curve ending at a card's header | That end names the entity or the View |
| Several curves meeting at a dot before one arrowhead | Fields of one Dep combined into one, such as a first and a last name into a full name |
| A curve looping out to the right | Two ends one above the other, in one card or in two stacked cards; or an entity computed from its own earlier rows |
| A curve in another color | The `color` of the Dep, or of that one dependency |

The curve leaves and enters each card at the side that faces the other end. It never turns at right angles, so it never reads as a relationship line, and it carries no crow's foot.

With **Display > Labels > Relationship names** on, a named Dep shows its name at its junction, or along its curve.

## Arrangement

The automatic layout, and **Arrange > Relational**, place each entity to the right of the entities it is computed from, where the layout allows, so the diagram reads from the sources on the left to the targets on the right. When dependencies touch at least half of the entities of a Container, or of the entities outside any, those entities stand in columns, one per step of the lineage, and entities linked by relationships stay next to each other within a column. A Container, too, stands to the right of the Containers it is computed from.

## Selecting a Dep

Click a curve to select its Dep. Its curves, junctions and arrowheads turn blue, the rows of the fields at its ends take the selection tint, and an entity or a View it names with no field is outlined.

The inspector reads its dependencies back as sentences that name the elements, whatever the direction of the arrow and wherever the cards stand on the canvas:

- `fct_orders.revenue` is computed from `stg_orders.amount`.
- `stg_customers.full_name` is computed from `raw_customers.first_name` and `raw_customers.last_name`.
- The rows of `fct_orders` are computed from the rows of `stg_orders`.

It also shows the Dep's name, its form (short, block, or inline on an entity, a View or a field), its color, the note of the block under **Transformation**, rendered as Markdown so that a query in a code block keeps its layout, and any custom properties. **Edit in source** moves the editor to the declaration.

## Hiding dependencies

**Display > Lineage > Dependencies** hides every curve. The choice is remembered, and the Display button is highlighted while the dependencies are hidden.

## In a diagram view

A diagram view lists no dependency. It shows each dependency whose two ends are among its members. See [**Diagram views**](./diagram-views).

## What the diagnostics panel reports

The parser checks each Dep: an end that names no element, a field depending on itself, a dependency stated twice (inline and in a Dep, say), a block whose dependencies go to different elements. A block with no dependency draws a warning. See [**Diagnostics panel**](./diagnostics-panel).

## What's next

- [**Relationships & crow's foot notation**](./relationships-crows-foot): the lines between rows.
- [**Sticky notes**](./sticky-notes): annotations on the canvas.
- [**Visual cues at a glance**](./visual-cues): the compact reference.
