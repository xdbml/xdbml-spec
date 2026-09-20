// .vitepress/theme/playground-links.ts
//
// Playground link origin.
//
// The "View in playground" links in the specification are written with the
// production origin, because the same markdown is read on GitHub, where a
// root-relative path would resolve to github.com rather than to the site.
// That absolute origin is wrong everywhere the site is served from somewhere
// else: in `npm run docs:dev` the link jumps to xdbml.org and the reader
// loses whatever they were testing locally, and a preview deploy has the
// same problem.
//
// Every deployment of this site carries its own /playground/ (built by
// scripts/prepare-playground.mjs into public/), so pointing the link at the
// origin currently serving the page is always right. On xdbml.org the two
// origins already match and nothing changes.
//
// Kept in its own module, free of VitePress imports, so the behaviour can
// be exercised directly against a DOM.

/** True when a URL points at the playground app rather than a site page. */
export function isPlaygroundUrl (u: URL): boolean {
  const p = u.pathname.replace(/\/+$/, ''); // tolerate trailing slash
  return p === '/playground'
    || p.endsWith('/playground/index')
    || p.endsWith('/playground/index.html');
}

/**
 * Rewrite one anchor's origin to `currentHref`'s, when it points at the
 * playground and the origins differ. The path, query and fragment survive
 * untouched, which matters because the schema travels in the `#s=` payload.
 */
export function localizePlaygroundOrigin (
  anchor: HTMLAnchorElement,
  currentHref: string,
): void {
  const raw = anchor.getAttribute('href');
  if (!raw) return;
  let url: URL;
  let here: URL;
  try {
    url = new URL(raw, currentHref);
    here = new URL(currentHref);
  } catch {
    return;
  }
  if (!isPlaygroundUrl(url)) return;
  if (url.origin === here.origin) return;
  url.protocol = here.protocol;
  url.host = here.host;
  anchor.href = url.toString();
}

/** Apply `localizePlaygroundOrigin` to every anchor in a document. */
export function localizeAllPlaygroundLinks (doc: Document, currentHref: string): void {
  const anchors = doc.querySelectorAll('a[href]');
  for (const a of anchors) localizePlaygroundOrigin(a as HTMLAnchorElement, currentHref);
}
