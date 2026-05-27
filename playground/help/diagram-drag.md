---
title: Repositioning entities
description: Drag entities around the diagram to lay out your schema visually.
---

# Repositioning entities

The diagram's automatic layout puts entities in a reasonable default arrangement, but it doesn't know what matters most for your story. You can drag any entity to a new position; the layout sticks and persists across reloads.

## How to drag

::: screenshot
**[Screenshot needed]**
Filename suggestion: `diagram-drag-header.png`
Caption: An entity card mid-drag, showing the grab cursor on the header band.
Should show: a diagram with multiple entities, one entity card being dragged with the cursor visibly on its header (the colored top band). The relationship line to another entity should be visible, re-routing toward the dragged card's new position.
:::

**Click and hold** on an entity's **header band** (the colored top strip with the entity name). The cursor changes to a grab indicator. Drag to move the entity. Release to drop it at the new position.

The header band is the only drag handle. Clicking and dragging on field rows selects the field instead. This keeps row selection and entity dragging from competing for the same gesture.

## What happens while dragging

- **The entity card follows your cursor.** Only the dragged entity moves; other entities stay where they are.
- **Relationship lines re-route automatically.** If the dragged entity has a `Ref:` connecting it to another entity, the line stays connected and finds a new path between the new position and the unchanged endpoint.
- **Containers do NOT resize.** If you drag an entity outside the visual bounds of its container, the container stays the same size and the entity appears to "escape" the box. That's a known limitation; the container will redraw with adjusted bounds on the next layout pass (e.g. when you edit the schema and trigger a re-layout).
- **Other entities don't avoid you.** Overlaps are allowed; the layout doesn't push other cards out of the way. This is intentional, so dragging stays predictable.

## Click vs. drag disambiguation

A short click (less than 2 pixels of movement) is treated as a **selection click**, opening the inspector for the entity. A longer movement is treated as a **drag**.

This means you can tap an entity header to select it without accidentally moving it, and the threshold is small enough that intentional drags work reliably.

## Persistence

Manual positions are saved to your browser's local storage, keyed by entity ID. They survive page reloads and editor edits as long as the entity still exists. If you rename or delete an entity, its stored position is no longer applied (and gets cleaned up eventually).

The auto-layout still runs for any entity that doesn't have a stored manual position. So you can move just one or two entities to highlight a specific relationship while the rest stay in their auto-arranged places.

## Reset positions

After any entity has been moved, a **Reset positions** button appears in the top-right corner of the diagram pane. Clicking it discards all stored manual positions and re-runs the auto-layout for every entity. This is a clean-slate operation; there's no undo.

If you want to reset only a single entity, the workaround is to delete its entity declaration in the editor and add it back. The stored position is keyed by name, so a re-added entity with the same name will get its stored position back. To truly reset one entity, change its name temporarily, save, then change it back.

## When auto-layout is good enough

For small schemas (up to about 8 entities), the auto-layout usually produces an acceptable arrangement. Manual positioning becomes more useful as schemas grow, especially when you want:

- Two specific entities visually adjacent to highlight their relationship
- A particular container's entities laid out in a known reading order
- Less-important entities pushed off to the side or below the fold

For very large schemas, manual positioning of every entity is tedious. A future feature will offer a few alternative auto-layout strategies (force-directed, columnar, layered) to give better defaults before manual touch-up.

## What's next

- [**Pan and zoom**](./diagram-pan-zoom): navigate the laid-out diagram.
- [**Diagram pane**](./diagram-pane): the full overview.
- [**Persistence & undo**](./persistence-and-undo): what gets saved in local storage and how to clear it.
