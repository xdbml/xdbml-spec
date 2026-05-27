# Layout overview

The playground's main window has five regions: the header bar across the top, three resizable panes in the middle (editor, diagram, inspector), and the diagnostics panel across the bottom.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `layout-overview-annotated.png`
Caption: The playground UI with each region labeled.
Should show: header bar at top with labels "Header bar"; editor, diagram, inspector panes labeled in the body; diagnostics strip labeled at the bottom. A sample schema should be loaded so all panes have content.
:::

## The header bar

A thin strip at the top with the xDBML logo on the left and four action buttons on the right (Examples, Share, Help). Always visible, always the same height. Covered in detail in [**Header bar & menus**](./header-bar.html).

## The editor pane (left)

Your xDBML source code lives here. Backed by the [Monaco editor](https://microsoft.github.io/monaco-editor/), the same editor that powers VS Code, so you get syntax highlighting, find-and-replace, multi-cursor, and the editing affordances you'd expect. Covered in [**Editor pane**](./editor-pane.html).

The editor pane can be resized by dragging its right edge. It has a minimum width so it stays usable.

## The diagram pane (center)

The rendered diagram of your schema. Always takes the remaining horizontal space between the editor pane on its left and (when visible) the inspector pane on its right. Covered in [**Diagram pane**](./diagram-pane.html).

## The inspector pane (right)

Appears when you've selected something in the diagram. Hidden when nothing is selected, or when you explicitly close it via the × button on its header. Covered in [**Inspector pane**](./inspector-pane.html).

The inspector pane can be resized by dragging its left edge. When hidden, the diagram pane expands to fill the freed space.

## The diagnostics panel (bottom)

A bottom strip that lists parse errors and warnings. Always visible. The header bar of the panel shows "No issues" or a count; the body expands to list each issue with line and column. Covered in [**Diagnostics panel**](./diagnostics-panel.html).

## Layout state is remembered

The playground remembers your layout choices across reloads:

- **Editor pane width**
- **Inspector pane width**
- **Whether the inspector is open or explicitly closed**
- **Whether the diagnostics body is expanded or collapsed**

All four are stored in your browser's local storage. Clear your site data to reset to the default layout.

## What's next

To explore each pane in detail, head to [**Header bar & menus**](./header-bar.html) and follow the links from there. Or jump straight to a specific pane:

- [**Editor pane**](./editor-pane.html)
- [**Diagram pane**](./diagram-pane.html)
- [**Inspector pane**](./inspector-pane.html)
- [**Diagnostics panel**](./diagnostics-panel.html)
