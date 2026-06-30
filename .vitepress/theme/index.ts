// xDBML site theme — extends VitePress default theme
// Adds custom CSS for brand colors and typography, and hands the site's
// current light/dark appearance off to the playground.

import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'

/*
 * Playground appearance hand-off.
 *
 * The playground is a separate Vue app, not a VitePress page, so it can't
 * read VitePress's appearance state directly. Rather than hardcode a theme
 * into the nav link in config.ts (which is static and can't reflect the
 * live mode), we rewrite any link pointing at the playground at click time
 * to carry the current appearance as `?theme=light|dark`. The playground's
 * bootstrap reads that param, persists it, and strips it from the URL.
 *
 * VitePress's default theme toggles a `dark` class on <html>, so the live
 * mode is read from there. A capture-phase pointerdown listener updates the
 * anchor's href before any activation (left/middle click, keyboard), so the
 * correct URL is used however the link is opened. On the deployed domain
 * the two apps are same-origin and already share localStorage, so this is
 * belt-and-suspenders there; it's the actual signal in dev and preview,
 * where the path differs.
 */
function isPlaygroundUrl(u: URL): boolean {
  const p = u.pathname.replace(/\/+$/, '') // tolerate trailing slash
  return p === '/playground' || p.endsWith('/playground/index') || p.endsWith('/playground/index.html')
}

function currentAppearance(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function rewritePlaygroundLink(anchor: HTMLAnchorElement): void {
  const raw = anchor.getAttribute('href')
  if (!raw) return
  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return
  }
  if (!isPlaygroundUrl(url)) return
  url.searchParams.set('theme', currentAppearance())
  anchor.href = url.toString()
}

function onPointerDownCapture(e: Event): void {
  const target = e.target as Element | null
  const anchor = target?.closest?.('a') as HTMLAnchorElement | null
  if (anchor) rewritePlaygroundLink(anchor)
}

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof window === 'undefined') return
    // Capture phase so the href is correct before navigation begins.
    window.addEventListener('pointerdown', onPointerDownCapture, true)
    // Keyboard activation (Enter on a focused link) doesn't emit pointerdown.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return
      const a = document.activeElement as HTMLAnchorElement | null
      if (a && a.tagName === 'A') rewritePlaygroundLink(a)
    }, true)
  },
} satisfies Theme
