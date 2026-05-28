---
title: Keyboard shortcuts
description: Complete keyboard reference for the playground.
---

# Keyboard shortcuts

All keyboard shortcuts available in the playground, grouped by where they apply.

On macOS, use `Cmd` (⌘) wherever `Ctrl` is shown below. Other modifiers (Alt, Shift) are identical across platforms.

## Editor pane

These are the standard Monaco editor shortcuts; they work whenever the editor has focus.

### Editing

| Shortcut | Action |
|---|---|
| `Ctrl + Z` | Undo |
| `Ctrl + Y` or `Ctrl + Shift + Z` | Redo |
| `Ctrl + X` | Cut |
| `Ctrl + C` | Copy |
| `Ctrl + V` | Paste |
| `Ctrl + A` | Select all |

### Navigation

| Shortcut | Action |
|---|---|
| `Ctrl + Home` | Go to start of file |
| `Ctrl + End` | Go to end of file |
| `Ctrl + G` | Go to line (prompts for line number) |
| `Ctrl + ↑` / `Ctrl + ↓` | Scroll without moving cursor |
| `Home` / `End` | Start / end of line |
| `Ctrl + ←` / `Ctrl + →` | Previous / next word |
| `Page Up` / `Page Down` | Scroll one page |

### Selection

| Shortcut | Action |
|---|---|
| `Shift + ←` / `Shift + →` | Extend selection by character |
| `Shift + ↑` / `Shift + ↓` | Extend selection by line |
| `Ctrl + Shift + ←` / `→` | Extend selection by word |
| `Ctrl + L` | Select current line (press repeatedly to extend) |

### Multi-cursor

| Shortcut | Action |
|---|---|
| `Alt + Click` | Add cursor at click position |
| `Ctrl + Alt + ↑` / `↓` | Add cursor above / below |
| `Ctrl + D` | Add next occurrence of current selection as cursor |
| `Ctrl + U` | Remove last added cursor |
| `Escape` | Collapse to single cursor |

### Line operations

| Shortcut | Action |
|---|---|
| `Alt + ↑` / `Alt + ↓` | Move current line up / down |
| `Shift + Alt + ↑` / `↓` | Duplicate current line up / down |
| `Ctrl + Shift + K` | Delete current line |
| `Ctrl + /` | Toggle single-line comment |
| `Ctrl + Shift + /` | Toggle block comment |
| `Ctrl + ]` / `Ctrl + [` | Indent / outdent |

### Find and replace

| Shortcut | Action |
|---|---|
| `Ctrl + F` | Open find |
| `Ctrl + H` | Open find-and-replace |
| `F3` / `Shift + F3` | Next / previous match |
| `Enter` (in find box) | Next match |
| `Escape` | Close find / replace |

### Formatting

| Shortcut | Action |
|---|---|
| `Tab` | Insert tab character or indent selection |
| `Shift + Tab` | Outdent selection |

## Diagram pane

Currently the diagram pane has no keyboard-only operations. Interactions are mouse-driven: click to select, drag to reposition, scroll-with-Ctrl to zoom. A future release may add arrow-key navigation between entities and keyboard zoom shortcuts.

## Global

These work regardless of which pane has focus.

| Shortcut | Action |
|---|---|
| `Ctrl + +` or `Ctrl + =` | Zoom diagram in (when diagram has focus) |
| `Ctrl + -` | Zoom diagram out (when diagram has focus) |
| `Ctrl + 0` | Reset diagram zoom to 100% (when diagram has focus) |

Note that **browser zoom shortcuts** (`Ctrl + +`, `Ctrl + -`, `Ctrl + 0`) and the diagram pane's own zoom shortcuts use the same keys. The shortcut applies to whichever has focus. If you mean to zoom the browser, click outside the diagram pane first; if you mean to zoom the diagram, click inside it first.

## What's not a shortcut

Some operations that you might expect to have keyboard shortcuts don't (yet):

- **Open the Examples menu**: mouse only
- **Open the Share dropdown**: mouse only
- **Toggle the inspector pane**: mouse only (× button on the inspector header)
- **Switch focus between editor and diagram**: use mouse or `Tab`

If you frequently use one of these, [open an issue](https://github.com/xdbml/xdbml-spec/issues) and we'll prioritize.

## What's next

- [**Editor pane**](./editor-pane): more about the editing experience.
- [**Diagram pane**](./diagram-pane): the mouse-driven interactions.
