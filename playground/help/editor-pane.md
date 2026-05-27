---
title: Editor pane
description: The Monaco-backed xDBML editor, syntax highlighting, live parsing, and editing features.
---

# Editor pane

The editor pane on the left side of the playground is where you write xDBML. It uses the [Monaco editor](https://microsoft.github.io/monaco-editor/), the same editor that powers VS Code.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `editor-pane.png`
Caption: The editor pane with syntax-highlighted xDBML and a parse error squiggle visible.
Should show: editor pane occupying most of the screen, with a sample schema loaded, syntax highlighting visible (keywords in one color, types in another, comments in grey), and at least one red squiggle from a deliberate parse error so its hover tooltip can be captured too.
:::

## Live parsing

The parser runs as you type. After each keystroke (with a small debounce so it doesn't churn mid-keystroke), the editor's text is re-tokenized and re-parsed. If parsing succeeds, the diagram updates. If it fails, the diagram keeps showing the last good state and the diagnostics panel lists the errors.

This means you can edit freely; you'll see your changes reflected almost immediately when they're syntactically valid.

## Syntax highlighting

Different parts of xDBML are colored to make scanning easier:

- **Declaration keywords** (Project, Container, Table, Entity, Ref, etc.) in deep blue, bold.
- **Type expression keywords** (object, array, oneOf, etc.) in magenta.
- **Scalar types** (int, varchar, etc.) in green.
- **BSON types** (objectId, etc.) in italic green to flag them as MongoDB-specific.
- **Setting keys** (pattern, default, etc.) in teal.
- **`x_*` custom properties** in italic amber to flag them as extension points.
- **String literals** in yellow.
- **Comments** (`//` and `/* ... */`) in grey.

## Error reporting

Parse errors appear as red underlines (squiggles) under the offending token. Hover over a squiggle to see the error message in a tooltip.

The diagnostics panel at the bottom lists the same errors in textual form, sorted by line. Clicking an entry in the diagnostics panel jumps your editor cursor to that source position.

## Editing features

You get the standard Monaco editing capabilities:

- **Find and replace**: `Ctrl + F` to find, `Ctrl + H` to find-and-replace, with regex and case-sensitivity options.
- **Multi-cursor**: hold `Alt` and click to add cursors at additional positions; type to edit all at once.
- **Line operations**: `Alt + ↑` / `Alt + ↓` to move the current line up or down; `Shift + Alt + ↑` / `Shift + Alt + ↓` to duplicate.
- **Comment toggling**: `Ctrl + /` toggles single-line comment markers on the current line or selection.
- **Undo / redo**: `Ctrl + Z` / `Ctrl + Y` (or `Ctrl + Shift + Z`).

A full reference is on the [**Keyboard shortcuts**](./keyboard-shortcuts) page.

## Auto-save to local storage

Your text is saved to your browser's local storage continuously. If you reload the page or close and reopen the tab, you pick up where you left off. There's no Save button; saving happens automatically.

Note that this is per-browser, per-device storage. If you switch browsers, switch devices, or clear your site data, your work is gone. To carry work between sessions or share with others, use the [**Sharing via URL**](./sharing-via-url) feature.

## Resizing the editor pane

Drag the vertical divider on the right edge of the pane to resize it. The width is remembered across reloads. There's a minimum width to keep the editor usable; you can't shrink it past that point.

## What's next

- [**Keyboard shortcuts**](./keyboard-shortcuts): the full keyboard reference.
- [**Diagnostics panel**](./diagnostics-panel): how to read and use the error list.
- [**Persistence & undo**](./persistence-and-undo): how local storage, URL sharing, and the editor's undo history interact.
