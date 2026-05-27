---
title: A 60-second tour
description: Quick walkthrough of the three panes, the header bar, and the diagnostics strip.
---

# A 60-second tour

The playground has three main panes, a header bar across the top, and a diagnostics strip across the bottom. Here's what each does.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `sixty-second-tour-full.png`
Caption: The full playground UI with all panes visible and a sample schema loaded.
Should show: header bar at top, editor pane (left) with xDBML text, diagram pane (center) with a parsed diagram, inspector pane (right) with a selected entity, diagnostics strip at bottom showing "No issues".
:::

## The editor pane (left)

This is where you type xDBML. Your text is auto-saved to your browser as you edit, and the parser re-runs after each keystroke (with a tiny debounce so it doesn't churn while you're mid-keystroke). Syntax errors show as red squiggles; hover for the message.

Drag the vertical divider on the right edge of the pane to resize it.

## The diagram pane (center)

The diagram updates as you type. Entities are rendered as cards with their fields listed. Containers (Schema, Database, etc.) wrap their member entities in a labeled box. Relationships appear as curved lines using crow's foot notation to show cardinality.

A few things you can do in this pane:

- **Click** any entity, field, container, or relationship to select it. The inspector opens on the right with its details.
- **Drag** an entity's header band to reposition it. Other connected lines re-route automatically.
- **Ctrl + scroll** to zoom in or out, centered on your cursor. Or use the `+` / `−` controls in the bottom-right corner.
- **Click the background** to deselect.

## The inspector pane (right)

Appears when you've selected something in the diagram. Shows that element's full metadata: name, type, settings, flag badges, notes, and any custom `x_*` properties. There's an **Edit in source** button on each inspector that jumps your editor cursor to the corresponding line.

Drag the vertical divider on the left edge to resize. The close button (×) hides the pane.

## The header bar (top)

Four controls, left to right:

- **Examples**: pick one of the bundled sample schemas to load.
- **Share**: copy a URL containing your current schema.
- **Help**: opens this help section in a new tab.
- The xDBML logo on the left links back to the main site.

## The diagnostics panel (bottom)

A thin strip across the bottom. Shows "No issues" when your schema parses cleanly. When there are errors, it expands to list each one with its line and column. Click any entry to jump the cursor to that source position.

## What's next

[**Your first schema**](./your-first-schema) walks through writing a small schema from scratch and exploring each of the features above hands-on.

If you want more depth on any specific pane, [**The interface**](./layout-overview) covers each pane individually.
