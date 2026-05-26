/**
 * URL share: encode the entire schema into the URL hash fragment, so a
 * shared link IS the schema. No server, no account, no database.
 *
 * Pattern: lz-string compression + base64url (URL-safe) encoding,
 * placed in the URL hash. The hash is fully client-side, never sent
 * to the server, so it doesn't pollute server logs or referer headers.
 *
 * Hash format: `#s=<compressed-content>`
 *
 * The `s=` prefix lets us add other parameters in the future without
 * ambiguity (e.g. `#s=...&z=2` for zoom level), and parses unambiguously
 * even when content contains characters that happen to look like URL
 * separators.
 *
 * Compression ratios on the bundled samples run 0.52 - 0.63, so a
 * typical 5-10 KB schema produces a 3-6 KB URL -- well under all
 * common URL length limits and short enough for chat / email pastes.
 *
 * Trade-off note: we use `compressToEncodedURIComponent` from
 * lz-string, which produces output containing only [A-Za-z0-9+-_$].
 * The `$` is technically not in the URL-unreserved set but is widely
 * accepted in hash fragments and doesn't require percent-encoding in
 * the browsers we target. (Same compromise dbdiagram.io and similar
 * tools make.)
 */

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string';

const HASH_KEY = 's';

/**
 * Build a share URL for the given content using the current page's
 * origin and path. Suitable for clipboard, anchor href, or QR code.
 *
 * Example output:
 *   https://xdbml.org/playground/index.html#s=B4EwRgtg...
 */
export function buildShareUrl (content: string): string {
  const compressed = compressToEncodedURIComponent(content);
  // Strip any existing hash from window.location, then attach ours.
  // Using `window.location.href.split('#')[0]` preserves the path AND
  // any existing query string, which the user might have set (e.g.
  // ?ref=twitter on a marketing campaign link).
  const base = window.location.href.split('#')[0];
  return `${base}#${HASH_KEY}=${compressed}`;
}

/**
 * Read the current URL hash and try to decode a shared schema from it.
 * Returns the decoded content if the hash has the expected shape AND
 * the compressed payload is valid; null otherwise.
 *
 * Robust to:
 *   - No hash at all
 *   - Hash without our key (e.g. user landed via `#section-id` for some
 *     other in-page anchor)
 *   - Truncated paste (decompression fails -> returns null)
 *   - Other URL parameters mixed in (`#s=...&zoom=2`)
 */
export function decodeShareHash (hashString: string = window.location.hash): string | null {
  if (!hashString) return null;
  // Strip the leading '#' if present.
  const trimmed = hashString.startsWith('#') ? hashString.slice(1) : hashString;
  if (!trimmed) return null;

  // Parse `key=value&key=value...` pairs. URLSearchParams would also
  // work but it adds unnecessary encoding/decoding for our use case.
  for (const part of trimmed.split('&')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx);
    const value = part.slice(eqIdx + 1);
    if (key !== HASH_KEY) continue;
    try {
      const decoded = decompressFromEncodedURIComponent(value);
      // lz-string returns "" for some malformed inputs and null for
      // others. Treat both as "didn't parse". The legitimate empty
      // schema is unlikely to be shared, and the empty string still
      // wouldn't round-trip through LZ to "".
      if (decoded && decoded.length > 0) return decoded;
    } catch {
      // Decompression error -> not our payload.
    }
  }
  return null;
}

/**
 * Remove the schema hash from the URL bar without reloading. Called
 * once after a successful URL-based load so subsequent reloads use
 * the user's current working copy (in localStorage) rather than
 * re-applying the stale shared content.
 *
 * Preserves any other hash parameters (anchors, future zoom state)
 * that aren't ours -- only strips our `s=...` key.
 */
export function clearShareHashFromUrl (): void {
  if (!window.location.hash) return;
  const trimmed = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const kept = trimmed
    .split('&')
    .filter((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx <= 0) return true;
      return part.slice(0, eqIdx) !== HASH_KEY;
    })
    .join('&');
  const newHash = kept ? `#${kept}` : '';
  // replaceState avoids creating a history entry that would let the
  // user navigate back to a URL with the stale shared content.
  const base = window.location.href.split('#')[0];
  history.replaceState(null, '', base + newHash);
}

/**
 * Display-friendly byte size of the encoded URL. Used in the share
 * dropdown to give users a feel for how shareable their schema is.
 */
export function formatUrlSize (url: string): string {
  const bytes = url.length;
  if (bytes < 1024) return `${bytes} chars`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
