---
title: Persistence & undo
description: How local storage, URL sharing, and the editor's undo history interact.
---

# Persistence & undo

The playground saves your work to your browser's local storage as you type, so your schema survives reloads and tab closures. Several things are persisted; this page covers what they are, how they relate to URL sharing, and what to do when you want to recover an earlier state.

## What's saved to local storage

Your browser keeps a copy of the following on your device, scoped to `xdbml.org`:

- **The editor's full text content**, updated continuously as you type
- **Manual entity positions** for any entity you've dragged in the diagram
- **Field collapse states** (which nested-field disclosure carets are toggled closed)
- **The current selection** (which entity, field, or relationship you've clicked)
- **Layout dimensions**: editor pane width, inspector pane width
- **UI state**: whether the inspector is explicitly closed, whether the diagnostics body is expanded or collapsed
- **The current zoom level**

The schema text is the biggest and most important of these. Everything else is layout state, useful for picking up where you left off without re-arranging the UI.

## When persistence happens

Saves to local storage happen continuously, with a small debounce so the browser isn't writing on every keystroke. In practice, you can close the tab a half-second after a change and that change will be there next time.

Save failures are silent. If your local storage is full, or your browser is in a restricted private-browsing mode, the save fails but you don't see an error. The schema you're working on stays in memory for the current session; if you reload the page, you'll lose changes since the last successful save.

This is uncommon in normal use. If you have a few-thousand-character schema, you're not anywhere near local storage limits (which are typically 5 to 10 MB per origin).

## How it interacts with URL sharing

Local storage and URL hashes serve different purposes:

- **Local storage** is your own workspace, accessible only on this device, in this browser
- **URL hashes** are portable snapshots, shareable with anyone

Both contain the same schema text (when up to date). The difference is durability and reach. Local storage survives reloads but not device switches; a URL travels anywhere but is a static snapshot.

When you open a shared URL, the encoded schema replaces the editor content AND replaces what's in local storage. Your previous local-storage state is overwritten. There's no automatic backup; if you had unsaved work you wanted to keep, the URL-load discards it.

## Loading shared URLs without losing work

To preserve your in-progress work before loading a shared URL someone sent you:

1. **Copy your editor's text** to a scratch document (Notepad, a text editor, an email draft)
2. Or **click Share** in your current session and bookmark or paste the resulting URL somewhere safe; that's your snapshot
3. **Then** open the new URL

The playground doesn't currently warn before overwriting; this is a known rough edge.

## Browser undo (editor)

Inside the editor pane, the standard editor undo history is available:

- `Ctrl + Z` (or `Cmd + Z` on macOS): undo
- `Ctrl + Y` or `Ctrl + Shift + Z`: redo

The undo stack covers character-level edits, multi-line replacements, paste operations, and so on. It's bounded; very deep histories may be truncated as new edits push old ones out. In practice the editor keeps several hundred recent edits.

**Important caveat**: the undo stack is scoped to the current editor session. It does NOT persist across page reloads. If you reload the playground, the editor's undo history is reset, even though your text content is preserved by local storage. So you can reload and pick up your text, but you can't undo back to before the reload.

## Resetting things

A few cleanup operations:

**Reset diagram positions only.** Click the **Reset positions** button that appears in the top-right of the diagram pane after you've dragged any entity. This discards stored manual positions and reruns auto-layout. Other persistence (editor text, collapse states, UI dimensions) is unaffected.

**Reset everything to defaults.** Clear `xdbml.org` site data in your browser's settings. This wipes local storage, undo history, and any cached static assets. Next visit will be a fresh start. The exact menu varies by browser:

- Chrome: Settings → Privacy and security → Cookies and other site data → See all site data → search for `xdbml.org` → Delete
- Firefox: Settings → Privacy & Security → Cookies and Site Data → Manage Data → search → Remove Selected
- Safari: Preferences → Privacy → Manage Website Data → search → Remove

This is also what you do if you want to switch from "the schema I was working on" to "a clean playground" without first manually clearing the editor.

**Switch to a different schema temporarily.** Easier than clearing site data: just load an example, work on it, then load your saved URL when you want to come back. URL-share keeps your "real" work portable while you explore the example.

## What's NOT persisted

A few things are intentionally not persisted, to avoid confusing surprises:

- **The Share dropdown's open/closed state.** Always closed on page load.
- **The Examples dropdown's open/closed state.** Always closed on page load.
- **Whether the editor or diagram has focus.** Always the editor on page load.
- **Toast notifications.** Always start with none.
- **Diagnostics body scroll position.** Always at top.

These are session-local. Page reload = reset.

## What's next

- [**Sharing via URL**](./sharing-via-url): the portable side of saving your work.
- [**Loading examples**](./loading-examples): how examples interact with persistence.
- [**Editor pane**](./editor-pane): how the editor itself behaves day-to-day.
