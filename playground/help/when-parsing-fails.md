---
title: When parsing fails
description: What happens to the diagram and inspector when your schema has errors, and how to recover.
---

# When parsing fails

xDBML is parsed on every keystroke. When the source has syntax errors, the playground does several things to make recovery easy without losing your work. This page explains what happens visually and how to get back to a clean parse.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `when-parsing-fails-state.png`
Caption: The playground with a parse error visible: red squiggle in the editor, error in the diagnostics panel, and the diagram showing the last good state.
Should show: the editor pane with at least one red squiggle under a token, the diagnostics panel at the bottom expanded and showing one or more errors with line/column, and the diagram pane showing the previous successfully-parsed schema (so the user can see the diagram is "frozen" while errors are present).
:::

## What the playground does on a parse error

Four things happen simultaneously when your edit produces a parse error:

1. **The editor shows red squiggles** under the tokens the parser couldn't process. Hover any squiggle for the error message in a tooltip.
2. **The diagnostics panel at the bottom** lists each error textually with its line and column. Click an entry to jump the editor cursor to that source position.
3. **The diagram pane keeps showing the last successful parse**. This is intentional: it means you can compare what you have to what you broke, and the diagram doesn't blank out every time you mistype.
4. **The inspector pane** stays as it was. If you had something selected before the error, the selection sticks (against the last good state).

The editor accepts further edits freely while errors are present. After you fix the issue, the next successful parse updates the diagram and clears the squiggles.

## The "last good state" diagram

The diagram you see when there's a parse error is the most recent successfully-parsed schema. This stays frozen until parsing succeeds again. A few consequences worth knowing:

- **The diagram may not match the source.** If you renamed an entity, the editor shows the new name (with errors elsewhere) while the diagram still shows the old name. This is normal; the diagram updates when parsing succeeds.
- **Selecting things on a stale diagram still works.** Clicks open the inspector with the last good state's details. After a successful re-parse, the selection may shift or clear if the targeted element no longer exists.
- **Manual entity positions are preserved** through errors. You don't lose your layout because of a typo.

When parsing succeeds again, the diagram redraws to match the new state. Layout (auto and manual) is applied to the new entities; if an entity was removed, its stored position is no longer applied.

## Reading error messages

Parse errors typically look like:

```
Unexpected token '{'
```
or
```
Expected ':' or '['
```
or
```
Unterminated string literal
```

Each error has a **line and column** indicating where the parser noticed the problem. Note that the noticed location is often the first token that violates the grammar, not the original source of the mistake. For example, missing a closing brace can manifest as an error several lines later, on the first token that doesn't fit the parent context.

When an error message points at a line that looks fine, scan upward for an unclosed brace, bracket, parenthesis, or quote.

## Multiple errors

The parser doesn't stop at the first error. It recovers where it can and continues, so a single edit can produce several errors at once. The diagnostics panel lists them all, sorted by line.

Strategy: fix the **earliest** error first. Later errors often disappear once the parser can recover further. A single typo near the top of the file can cascade into apparent errors throughout, all of which evaporate when the original is fixed.

Re-parsing happens automatically on the next keystroke after a fix. You don't need to trigger anything.

## Common parse errors

A few patterns to recognize quickly:

**Unmatched braces or brackets** are the most common. The parser reports the position where it expected a closing token. Look for unbalanced `{`, `}`, `[`, `]` in the surrounding block.

**Missing field type** after a field name: `id [pk]` (missing type between `id` and `[pk]`). xDBML requires `name type [settings]`.

**Setting key without a value**: `[default:]` (the colon is followed by nothing). Either give it a value or drop the colon if you meant a flag.

**Confusing flag and keyed setting**: `[pk: true]` is wrong; primary key is a flag, not a key. The correct form is `[pk]`.

**Stray comma**: trailing commas inside settings (`[pk, not null,]`) are not always accepted. Drop the trailing comma.

**Mixed quote types**: xDBML accepts single quotes (`'foo'`) and backticks (`` `bar` ``) for strings; double quotes are not a primary string delimiter. Switch to single quotes if double quotes don't parse.

**Reserved keyword as identifier without quoting**: if you really want to name a field `table`, quote it: `"table"` or `` `table` ``.

## Recovering from a tangled file

Sometimes you've made many edits and the file is in a state where every fix creates two new errors. A few approaches:

**Undo back to the last good state.** Press `Ctrl + Z` repeatedly until the editor returns to where it last parsed cleanly. The editor's undo history is rich enough that this usually works for the current session.

**Load an example fresh.** If your file has drifted far from where you wanted it, load one of the bundled examples (which always parse cleanly), then paste back the chunks of your work that you know are good.

**Comment out problematic blocks.** Wrap suspect sections in `/* ... */` block comments. The parser ignores commented content. Re-enable section by section until you find which block is broken.

**Start a new file.** Select all (`Ctrl + A`), delete, and type `xdbml: 0.1` as the version declaration. From an empty schema you can rebuild deliberately.

The schema is preserved in local storage at all times, so opening the playground tomorrow won't lose your half-broken state. You don't have to fix it now; you can come back to it.

## When the diagnostics panel is collapsed

If you've manually collapsed the diagnostics body (for screen space), the header bar still shows the error count, so you can tell at a glance whether errors exist. Click the header to expand. See [**Diagnostics panel**](./diagnostics-panel) for the full mechanics.

## What's next

- [**Diagnostics panel**](./diagnostics-panel): the UI surface for the errors themselves.
- [**Editor pane**](./editor-pane): how squiggles and hover messages work.
- [**Keyboard shortcuts**](./keyboard-shortcuts): editor shortcuts for jumping around quickly.
