---
title: Pan and zoom
description: Navigation controls for the diagram pane.
---

# Pan and zoom

The diagram pane supports the standard pan-and-zoom interactions you'd expect from a graphical tool. Useful when a schema grows past what fits on screen at default zoom.

## Zoom controls in the corner

The bottom-right of the diagram pane has a small toolbar. Eight controls are always present; a ninth, **Reset positions**, appears once you've repositioned something:

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagram-pan-zoom-controls.png`
Caption: The zoom toolbar in the bottom-right corner of the diagram pane, with controls labeled.
Should show: close-up of the bottom-right corner. The toolbar with: minus button, percentage display showing e.g. "100%", plus button, Fit button, 1:1 reset button, undo and redo buttons, and Arrange dropdown. Annotations or callouts pointing at each. (The Reset positions button only appears once an entity has been moved or arranged.)
:::

From left to right:

- **`−` (minus) button**: zoom out by one step (steps follow a discrete ladder, see below).
- **Percentage input**: shows the current zoom level. Click to edit; type a number; press Enter to apply. Valid range is 25% to 400%.
- **`+` (plus) button**: zoom in by one step.
- **Fit button**: scale the diagram to fit the available pane width and height. Useful after a layout has been rearranged or when starting on a large schema.
- **1:1 button**: reset to 100% zoom.
- **Undo button**: step back through diagram layout changes -- drags, edge nudges, an applied Arrange, and Reset positions. Disabled when there's nothing to undo. Equivalent to Ctrl+Z while the diagram is the pane you're working in. This is a separate history from the editor's text undo.
- **Redo button**: re-apply a layout change you just undid. Disabled when there's nothing to redo. Equivalent to Ctrl+Shift+Z (or Ctrl+Y).
- **Arrange button**: opens a menu of automatic layouts -- **Relational** (a general foreign-key layout) and **Star schema** (a central fact surrounded by its dimensions). Picking one positions every entity, snaps it to the grid, and fits the result to the pane. The arrangement persists like a manual drag and is reverted by **Reset positions**; it is also applied automatically the first time you open a document that has no saved layout.
- **Reset positions button**: appears only after you've moved an entity or applied an Arrange layout. Clears every position override, returning entities to their default computed layout; the button then disappears until the next move. (You can undo a reset.)

## Mouse wheel zoom

Hold `Ctrl` (or `Cmd` on macOS) and scroll the mouse wheel anywhere in the diagram pane to zoom in or out. The zoom is centered on the cursor position, not on the viewport center: the point under your cursor stays under your cursor as you zoom. This makes zooming-to-inspect feel natural, because you point at what you want to look at and zoom from there.

Without the modifier key, the mouse wheel scrolls the pane vertically (or horizontally with `Shift`). This means you can scroll a tall schema with the wheel and zoom on demand with `Ctrl`.

## Zoom step ladder

The `+` and `−` buttons use a discrete ladder of zoom levels: 25%, 33%, 50%, 67%, 75%, 90%, 100%, 110%, 125%, 150%, 175%, 200%, 250%, 300%, 400%. This matches the ladder used in browsers and most design tools. Each click on `+` or `−` moves to the next level.

Mouse wheel zoom (with `Ctrl`) is continuous, not stepped, and uses a smaller increment per tick so fine adjustments feel smooth.

The percentage input accepts any integer in the 25 to 400 range, so you can type 87 if you want 87%.

## Panning

Three ways to pan around a diagram larger than the visible pane:

- **Scrollbars**: the pane shows horizontal and vertical scrollbars when the diagram doesn't fit.
- **Mouse wheel** (vertical scroll without Ctrl): scrolls the pane vertically. Hold `Shift` for horizontal scroll.
- **Click-and-drag on the canvas background**: not currently supported. Use scrollbars or wheel.

## Persistence

Your zoom level is saved to local storage and restored on page reload. The default for a fresh visitor is 100%.

## What if the diagram is empty?

The zoom controls still work, but there's nothing to see. This usually means the schema doesn't parse, or it has no entities yet. Check the diagnostics panel at the bottom for parse errors, or write at least one `Table` / `Entity` block in the editor.

## What's next

- [**Repositioning entities**](./diagram-drag): drag entities around the canvas.
- [**Diagram pane**](./diagram-pane): the full overview.
- [**Keyboard shortcuts**](./keyboard-shortcuts): the complete keyboard reference.
