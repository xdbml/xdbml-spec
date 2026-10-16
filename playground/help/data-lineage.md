---
title: Data lineage
description: How a Dep is written and drawn, what its curves, junctions, arrowheads and pills mean, how a Dep serves as a source-to-target mapping, and how to inspect it.
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

// Block: the dependencies into one downstream element; with xdbml: 0.7
// declared, a line may name several upstream ends
Dep build_full_name {
  raw_customers.first_name, raw_customers.last_name -> stg_customers.full_name
  Note: 'Joins the first and the last name.'
}

// Inline: in the brackets of the element it concerns
Table fct_orders [dep: <- stg_orders] {
  revenue decimal [dep: <- stg_orders.amount]
}
```

An end names an entity, a View, or a field of either, a nested field with its path. A dependency may go from an entity to a field, such as a row count, or from a field to an entity, such as an array unnested into a table. The note is prose; the statement that computes the data goes in `source_query`, as the next section shows.

## Source-to-target mapping

From xDBML v0.7.2, a `Dep` can say how a target is loaded: each dependency may carry a `transformation`, the kind of use of its source fields, and the `Dep` may carry the statement that loads the target in `source_query`, with its language in `source_database` ([spec §27.10](/spec/v0.7#_27-10-source-to-target-mapping)). Open the **Source-to-target mapping** example from the Examples menu, and its three diagram views, to follow along.

```xdbml
Dep load_dim_member [source_database: snowflake] {
  legacy.MBR.MBR_ID -> dw.dim_member.member_id [transformation: identity]
  legacy.MBR.FIRST_NM, legacy.MBR.LAST_NM -> dw.dim_member.full_name [transformation: calculation]
  legacy.MBR.STATUS -> dw.dim_member [transformation: filter]
  source_query: '''
    SELECT MBR_ID AS member_id, TRIM(FIRST_NM) || ' ' || TRIM(LAST_NM) AS full_name
    FROM legacy.MBR WHERE STATUS <> 'X'
  '''
}
```

The kinds `identity`, `calculation` and `aggregation` give the value of a field. The kinds `join`, `lookup`, `filter`, `group_by` and `conditional` decide which rows the target receives, or which branch of a `CASE` applies, without giving a value: they are the indirect kinds. A line without `transformation` records lineage only. The playground does not read the statement: it shows it highlighted as SQL, and reports neither a syntax error in it nor a difference with the lines.

## How a dependency is drawn

| What you see | What it means |
|---|---|
| Amber curve, arrowhead at one end | A dependency; the element at the arrowhead is computed from the element at the other end |
| Curve ending at a field row | That end names the field |
| Curve ending at a card's header | That end names the entity or the View |
| Several curves meeting at a dot before one arrowhead | Fields of one Dep combined into one, such as a first and a last name into a full name |
| A curve looping out to the right | Two ends one above the other, in one card or in two stacked cards; or an entity computed from its own earlier rows |
| A curve in another color | The `color` of the Dep, or of that one dependency |
| Dashed curve | An indirect kind: a join, a lookup, a filter, a grouping or a condition |
| A pill on a curve or where curves meet | The kind of transformation; dashed border for an indirect kind. A copied field shows none, and the meeting point shows no dot under a pill |
| A pill reading `identity` between two cards | The target is a copy of every row and every field of the source, such as a replica |

When a Dep carries kinds, the cards stand further apart, to leave room for the pills. The curve leaves and enters each card at the side that faces the other end. It never turns at right angles, so it never reads as a relationship line, and it carries no crow's foot.

With **Display > Labels > Relationship names** on, a named Dep shows its name at its junction, or along its curve.

## Arrangement

The automatic layout, and **Arrange > Relational**, place each entity to the right of the entities it is computed from, where the layout allows, so the diagram reads from the sources on the left to the targets on the right. When dependencies touch at least half of the entities of a Container, or of the entities outside any, those entities stand in columns, one per step of the lineage, and entities linked by relationships stay next to each other within a column. A Container, too, stands to the right of the Containers it is computed from.

## Selecting a Dep

Click a curve or a pill to select its Dep. Its curves, junctions, arrowheads and pills turn blue, dashed curves stay dashed, the rows of the fields at its ends take the selection tint, and an entity or a View it names with no field is outlined.

The inspector reads its dependencies back as sentences that name the elements, whatever the direction of the arrow and wherever the cards stand on the canvas:

- `fct_orders.revenue` is computed from `stg_orders.amount`.
- `stg_customers.full_name` is computed from `raw_customers.first_name` and `raw_customers.last_name`.
- The rows of `fct_orders` are computed from the rows of `stg_orders`.

A Dep whose dependencies carry kinds reads as a mapping instead: a table with one row per target field, its sources and its kind, then the lines that steer the rows, such as a lookup or a filter, then the statement of `source_query`, highlighted as SQL.

It also shows the Dep's name, its form (short, block, or inline on an entity, a View or a field), its color, the language of its statement, the note of the block under **Transformation**, rendered as Markdown, and any custom properties. **Edit in source** moves the editor to the declaration.

Selecting the target of a mapping shows, under **Loaded by**, the Deps that load it and the fields no dependency feeds. A View that is not materialized also lists its **Metrics**, each with the fields it aggregates.

## Hiding dependencies

**Display > Lineage > Dependencies** hides every curve. **Display > Lineage > Indirect dependencies** hides the dashed ones only, and keeps the curves that give a value. The choices are remembered, and the Display button is highlighted while dependencies are hidden.

## In a diagram view

A diagram view lists no dependency. It shows each dependency whose two ends are among its members. See [**Diagram views**](./diagram-views).

## What the diagnostics panel reports

The parser checks each Dep: an end that names no element, a field depending on itself, a dependency stated twice (inline and in a Dep, say), a block whose dependencies go to different elements. A block with no dependency draws a warning. In a mapping, it checks each `transformation`: an unknown kind, a kind other than `identity` between two entities, a kind that gives a value ending at an entity; `identity` with several sources and an indirect kind starting from a whole entity draw warnings. See [**Diagnostics panel**](./diagnostics-panel).

## What's next

- [**Relationships & crow's foot notation**](./relationships-crows-foot): the lines between rows.
- [**Sticky notes**](./sticky-notes): annotations on the canvas.
- [**Visual cues at a glance**](./visual-cues): the compact reference.
