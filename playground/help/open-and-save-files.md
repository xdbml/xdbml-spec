---
title: Open and save files
description: How to load .xdbml files from your computer and save your work back as files.
---

# Open and save files

The playground lets you work with `.xdbml` files on your computer. Click **Open** to load a file into the editor, and **Save** to write the current schema back to a file. Both buttons live at the top of the header.

This complements the [**Sharing via URL**](./sharing-via-url) feature: URLs are good for sending a schema to someone else, files are good for keeping your work durable across sessions and editors.

## How Open works

Click **Open** in the header. Your operating system's file picker appears. Choose any `.xdbml` file; its contents replace the current editor content, and the filename appears in the header next to the playground title.

If your current editor content has unsaved changes, a confirmation dialog appears first with three choices:

- **Cancel**: dismiss the dialog and keep what you have. Nothing changes.
- **Discard and open**: lose the current changes, then open the new file.
- **Save first**: save the current content (you'll get the file picker to choose a destination), then open the new file.

The Save first option is the safest choice when you want to preserve your work before switching to a different file.

## How Save works

Click **Save** in the header. The behavior depends on whether a file is currently open:

**If a file is already open** (you can see its filename next to the playground title), the editor content overwrites that file. No dialog appears; the save happens immediately.

**If no file is open**, your operating system's save dialog appears. Type a filename (the playground suggests one for you based on the `Project` declaration in your schema, or `schema.xdbml` if there's no project), choose a location, and click Save.

The amber dot next to the filename in the header tells you whether there are unsaved changes. After a successful save, the dot disappears; as soon as you make a change in the editor, it reappears.

## Save As

Save As lets you save to a different filename or location, leaving the originally-open file untouched. Useful when you want to fork a schema, create a snapshot, or save a working copy without overwriting the original.

You can reach Save As two ways:

- Click the chevron (▾) next to the Save button. The dropdown shows **Save as...**
- Press **Ctrl + Shift + S** (or **Cmd + Shift + S** on Mac).

The save dialog always appears in Save As mode, even if a file is already open.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| **Ctrl + O** (Cmd + O on Mac) | Open a file |
| **Ctrl + S** (Cmd + S on Mac) | Save (or Save As if no file is open) |
| **Ctrl + Shift + S** | Save As, always with a dialog |

These shortcuts work anywhere in the playground, including while the editor has focus. They override the browser's default keyboard shortcuts for those combinations (which would otherwise save the entire web page as HTML).

## Browser support

The playground uses the [File System Access API](https://wicg.github.io/file-system-access/) for the best experience. The API is available in **Chromium-based browsers**: Chrome, Edge, Opera, Brave, Arc, and most other forks. On those browsers, Save overwrites the open file directly with no further dialog, just like a desktop editor.

**Firefox and Safari** don't implement this API yet. The playground falls back to download-based saves on those browsers:

- **Open** still works through a standard file picker.
- **Save** triggers a download to your browser's Downloads folder. You can't choose the location; the file goes wherever your browser is configured to put downloads. The filename matches whatever was suggested.
- **Save As** also triggers a download (the API to "save anywhere" isn't available).

This means workflows that involve repeated edit-save cycles work best in Chromium browsers. On Firefox and Safari, each save produces a new file in your Downloads folder, which can get cluttered. The schema content itself is preserved correctly; only the file-handling convenience differs.

## When changes are lost

A few situations where unsaved changes can be lost:

**Closing the tab with unsaved changes**: the browser shows a native "are you sure you want to leave?" prompt. If you confirm, the changes are gone. The dirty indicator in the header is your warning that this would happen.

**Loading an example**: clicking an example in the Examples menu replaces the current content. If your current content was unsaved, it's lost. Save first if you want to keep it.

**Opening a different file**: the confirmation dialog protects against this; you have to explicitly click Discard.

**Reloading the page**: editor content survives a reload via your browser's localStorage. The filename and "saved" status do NOT survive a reload, however. After reload, the editor opens with the same content but in "untitled" state, as if you'd never opened a file.

## What's NOT included

A few related features the playground deliberately doesn't have:

**No auto-save to files**. Auto-save only goes to your browser's localStorage (your "working copy"). Saving to an actual file always requires an explicit Save action. This is to avoid surprising users with files they didn't intend to write.

**No file watching**. If you edit the `.xdbml` file in another editor while the playground has it open, the playground won't notice. Click Open again to reload from disk.

**No multi-file workspaces**. The playground works with one schema at a time. For multi-file modeling, consider [Hackolade Studio](https://hackolade.com).

**No remote files**. The playground only reads from and writes to your local computer. No support for opening from Google Drive, OneDrive, S3, etc. URL sharing is the analog for collaborative workflows.

## Privacy

Files you open never leave your computer. The playground runs entirely in your browser; there's no server-side processing of your schema content. The same applies to saved files: they're written directly to your filesystem with no intermediate upload.

## What's next

- [**Sharing via URL**](./sharing-via-url): how to share schemas via copyable links.
- [**Persistence & undo**](./persistence-and-undo): how your in-browser working copy survives reloads.
- [**Keyboard shortcuts**](./keyboard-shortcuts): the full list of shortcuts in the playground.
