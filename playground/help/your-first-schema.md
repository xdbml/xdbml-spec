---
title: Your first schema
description: A short hands-on walkthrough writing a schema in the playground from scratch.
---

# Your first schema

This page walks you through writing a small xDBML schema from scratch and exploring the playground's main features hands-on. It takes about five minutes.

## Start with a clean slate

Open the playground. If there's content in the editor, select all (`Ctrl + A`) and delete it. The diagram will go blank and the diagnostics panel will show errors; that's fine, you're about to fix it.

## Type a minimal Project declaration

In the editor, type:

```
Project my_first {
  database_type: 'PostgreSQL'
  Note: 'A small example schema'
}
```

The diagnostics panel goes quiet as you finish typing. The diagram pane stays empty because there are no entities yet, but the parser is happy.

## Add a Table

Below the Project block, type:

```
Table users {
  id        int     [pk, increment]
  email     varchar [unique, not null]
  full_name varchar
  created_at timestamp [default: `now()`]
}
```

A card appears in the diagram. It shows the table name in a colored header band, four field rows with their types right-aligned, and small badges next to `id` (a yellow PK badge) and `email` (a purple unique badge plus a red required badge).

::: screenshot
**[Screenshot needed]**
Filename suggestion: `your-first-schema-single-table.png`
Caption: A single `users` table rendered in the diagram, with PK and unique badges visible.
Should show: editor pane on the left with the Project + Table source, diagram pane on the right showing the `users` card with its four field rows, no inspector pane (nothing selected).
:::

## Click a field to inspect it

Click on the `email` row in the diagram. The inspector pane slides in on the right with everything the parser knows about that field: name, parent entity, type (`varchar`), the UNIQUE and REQUIRED flag badges, and the settings.

Click **Edit in source** in the inspector. Your editor cursor jumps to the start of the `email` line. Useful when you want to make a change to the field you're inspecting.

## Add a second Table and a relationship

Below the `users` table, type:

```
Table posts {
  id         int     [pk, increment]
  author_id  int     [not null]
  title      varchar [not null]
  body       text
  created_at timestamp [default: `now()`]
}

Ref: posts.author_id > users.id
```

A second card appears, plus a curved line connecting `posts.author_id` to `users.id`. The line has a crow's foot at the `posts` end (many) and a vertical bar at the `users` end (one). That's the standard ER notation for a "many-to-one" relationship.

## Try the diagram interactions

A few things to try in the diagram pane:

- **Drag the `posts` card's header band** to move it. The relationship line re-routes automatically.
- **Ctrl + scroll** anywhere in the diagram to zoom in or out, centered on your mouse.
- **Click the relationship line itself** to select it. The inspector shows the source and target paths plus the operator.
- **Click an empty area of the canvas** to deselect.

## Share your work

Click the **Share** button in the header. A small dropdown shows a long URL with a Copy button. Click Copy. Open a new browser tab and paste the URL: your schema loads. The entire schema is encoded into the URL itself; no server stores anything.

## What's next

You've used the editor, the diagram, the inspector, the diagnostics panel, the header buttons, drag, zoom, and URL share. That covers most of the playground in one short exercise.

To keep going:

- [**The interface**](./layout-overview) for more detail on each pane.
- [**Reading the diagram**](./reading-the-diagram) to understand the visual vocabulary in depth (crow's foot variants, nested fields, container styling).
- [**Loading examples**](./loading-examples) to try the bundled sample schemas as starting points for your own work.
