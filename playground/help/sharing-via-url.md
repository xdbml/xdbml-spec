---
title: Sharing via URL
description: How URL sharing works, what's in the URL, and the size limits to know about.
---

# Sharing via URL

The Share button in the header copies a single URL that contains your entire schema. Send the URL to a colleague, paste it in chat or an email, bookmark it for yourself: opening it loads the schema into a fresh playground session. No accounts, no server-side storage, no login.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `share-dropdown.png`
Caption: The Share dropdown showing a generated URL, the Copy button, and the size indicator.
Should show: the Share button in the playground header (highlighted/active) and its dropdown open below. The dropdown contains a read-only text field with a long URL starting with `https://xdbml.org/playground/#/...`, a Copy button, and a small size indicator like "1.2 KB" or similar.
:::

## Opening the menu

Click **Share** in the header bar. A dropdown opens with:

- A read-only text field showing the current shareable URL
- A **Copy** button on the right
- A size indicator below the URL, showing how many characters the URL is

The URL updates live as you edit the schema. Each keystroke generates a new URL; the Share dropdown always shows the URL for whatever's currently in the editor.

## Copying the URL

Click the **Copy** button. The button briefly turns green to confirm the copy. Your clipboard now contains the URL. You can also click into the text field, press `Ctrl + A` to select the URL, then `Ctrl + C` to copy: same result.

The URL is a complete, ready-to-paste link. No additional encoding or wrapping is needed.

## What's in the URL

The URL has three parts:

1. **The site origin and playground path**: `https://xdbml.org/playground/`
2. **A hash separator**: `#`
3. **The encoded schema**: a compressed-and-base64'd representation of the editor's current text

The schema goes after the `#`, which means it's a URL **fragment**. Browsers don't send fragments to servers: when you paste the URL into a browser, your schema travels with the URL through every step (mail, chat, paste) but is never transmitted to xdbml.org or to any other server. Decoding happens entirely in the recipient's browser.

This is the same model dbdiagram.io uses for non-account sharing, and it's why no server-side storage is needed.

## How encoding works

The text in your editor gets compressed using `deflate` (the same algorithm that powers gzip), then base64-encoded so it survives URL transmission. The encoded form is roughly 30 to 50 percent of the source size for typical xDBML, since schemas have a lot of repeated structure (keywords, common type names) that compresses well.

For a small blog schema of about 1,000 characters, the encoded portion is around 400 characters. A 4,000-character schema produces about a 1,500-character encoded URL. The largest bundled example (financial-services) encodes to around 3,500 characters.

## Size limits and the warning

The Share dropdown shows the URL's total length and warns when it exceeds 4,000 characters. The warning text is a small line below the URL field.

The reason for the 4,000-character threshold: it's the conservative limit for URL length in many widely-used systems. Specifically:

- Many email clients truncate URLs longer than about 2,000 characters
- Some chat applications wrap or truncate URLs above 4,000 characters
- Browser address bars handle much longer URLs (Chrome supports up to ~32,000) but copy-paste through other tools may not

If your URL exceeds 4,000 characters, the URL still works in browsers that receive it intact. The warning just tells you that some transmission channels may truncate it. Workarounds:

- Use a URL shortener (bit.ly, tinyurl, your own).
- Send the schema text directly as a code block or attachment instead.
- Trim the schema to a smaller subset that demonstrates the point you're making, and share that.

## Loading a shared URL

When someone opens a shared URL in a browser, the playground:

1. Detects the hash portion of the URL on page load
2. Decodes the schema text from it
3. Loads the text into the editor
4. Parses and renders the diagram

The URL hash is consumed at load time but not removed from the browser's address bar, so the recipient can re-share the same URL onward by copying it from the address bar.

If the recipient already had unsaved work in the editor from a previous session, **loading a shared URL replaces it**. The previous content is not preserved. The playground does not currently prompt before overwriting; this is something a future version may improve.

## Sharing a draft, then editing

If you copy a URL and then continue editing, the URL you copied still points to the schema as it was at the moment of copy. Your subsequent edits do NOT update what's at the copied URL. To share the updated version, copy the URL again.

This means the URL is a snapshot, not a live link. Useful in practice: you can iterate on a schema and only share specific snapshots you're happy with.

## What's NOT in the URL

The encoded URL contains only the editor's text. Specifically, it does NOT include:

- Manual entity positions (your drag layout). Recipients get the auto-layout.
- Field collapse states. Recipients see everything expanded.
- Editor pane width, inspector width, or other layout state.
- Zoom level.
- Selection.

The receiving playground starts in its default state with the loaded schema. This keeps URLs as small as possible and avoids confusing recipients with sender-specific layout choices that might not look right on different screens.

## Privacy

The URL contains your schema text, base64'd but not encrypted. Anyone who has the URL can decode it. Treat the URL as you'd treat the schema content itself: if the schema is sensitive (proprietary modeling, customer data, etc.), don't post the URL publicly.

The URL is never sent to any server when you click Share. The encoding happens entirely in your browser. xdbml.org has no way to know what URLs you generate.

## What's next

- [**Persistence & undo**](./persistence-and-undo): the local-storage side of saving your work.
- [**Header bar & menus**](./header-bar): the surrounding context of the Share button.
