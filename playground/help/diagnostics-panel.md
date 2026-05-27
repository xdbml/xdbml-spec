---
title: Diagnostics panel
description: The bottom strip that lists parse errors and warnings, with click-to-jump.
---

# Diagnostics panel

The diagnostics panel is a thin horizontal strip across the bottom of the playground. It tells you at a glance whether your schema parses cleanly, and when it doesn't, lists every error with click-to-jump-to-source.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagnostics-panel-errors.png`
Caption: The diagnostics panel expanded, showing a list of two parse errors with line and column.
Should show: the bottom of the playground UI with the diagnostics panel expanded. The header shows "2 errors" in red. Two error rows are visible, each with a red × icon, an error message, and "Line N, column M" formatted in a smaller grey font.
:::

## Two states

**No issues**: header shows "No issues" in grey. Body is empty and collapsed. The strip stays visible (about 32 pixels tall) so the UI doesn't shift when an error first appears.

**Errors present**: header shows the count (e.g. "1 error", "3 errors") in red with a small × icon. A caret (▸ or ▾) indicates collapsed or expanded state. The body, when expanded, lists each error.

The body is open by default the first time errors appear. You can collapse it manually, and your collapse choice persists across reloads. Even when collapsed, the header bar shows the current count, so you always know whether errors exist.

## Click to jump

Each error row in the expanded body has:

- A red × icon
- The error message text (e.g. "Unexpected token '['")
- The source position in grey font: "Line 12, column 5"

Clicking anywhere on the row jumps your editor cursor to that line and column, scrolls the editor to bring it into view, and gives the editor focus. Useful when you have many errors or when the error is on a line that's scrolled off-screen.

The errors are sorted by line then column, matching the order you'd read them in the source.

## How it relates to editor squiggles

The same errors are also shown as red squiggles in the editor pane, with the error message in a hover tooltip. The two surfaces are complementary:

- **Squiggles** are visible while you're already looking at the editor, in-place at the offending token.
- **The diagnostics panel** is visible regardless of which pane has your attention, lists multiple errors compactly, and gives you a count.

Use whichever feels natural for the situation. The squiggle is good for quick fixes; the panel is better when an error is on a line you can't see, or when you want to count outstanding issues.

## Errors vs warnings

The panel is shaped to handle both errors and warnings, with separate counts and different badge colors (red for errors, amber for warnings). Today the parser emits only errors. Warnings will arrive with the future semantic-analysis pass, which can flag things like "this Ref points at a non-existent field" or "this field's type is undefined." When that lands, the panel will pick warnings up automatically; no UI change needed.

## When the schema is partially broken

The parser reports errors line-by-line where it can recover, and bails out where it can't. As a result:

- **Multiple errors at the same time** are possible. You don't have to fix and re-parse one error at a time.
- **Some errors hide others.** A syntax error early in the file can prevent the parser from getting to a later semantic mistake. Fix the early ones first; new errors may appear once the parser can reach further.
- **The diagram keeps showing the last good state** while errors are present. So you can fix one error, see the diagram update, fix the next, and so on.

## Collapsing manually

Click the header bar to collapse or expand the body. The caret rotates 90° to indicate state. When there are zero errors, clicking does nothing because there's no body to expand.

When you collapse with errors present, the count badge stays visible in the header so you don't forget about them. Your collapse state persists across reloads.

## What's next

- [**When parsing fails**](./when-parsing-fails): broader strategies for recovering from broken schemas.
- [**Editor pane**](./editor-pane): the editor side of error reporting, including squiggles and hover tooltips.
