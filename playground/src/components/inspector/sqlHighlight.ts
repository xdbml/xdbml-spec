/**
 * SQL syntax highlighting for the inspector's Source query section.
 *
 * Uses Prism to tokenize and produce HTML wrapped in `<span class="token …">`
 * elements. The CSS that colors these tokens lives in
 * `src/styles/main.css` under the `.sql-block` scope, so the styles
 * only apply when the `<pre>` is wrapped in that class.
 *
 * Why Prism over alternatives:
 *
 *   - Shiki produces more accurate output (uses VS Code's grammars) but
 *     ships ~200+ KB just for the SQL grammar and is async to
 *     initialize. Overkill for a read-only inspector block.
 *   - Reusing Monaco would mean spawning a second editor instance per
 *     view click; Monaco instances are heavy and the inspector
 *     re-mounts often. Not worth the lifecycle complexity.
 *   - A regex-based highlighter we write ourselves is fragile around
 *     string literals, comments, and SQL dialects. "Looks like" SQL
 *     highlighting that's subtly wrong is more distracting than no
 *     highlighting at all.
 *
 * Prism's full entry (`prismjs`) ships ~22 KB minified, bundling the
 * core runtime plus default grammars for Markup, CSS, C-like, and
 * JavaScript that we don't use here. The leaner alternative would be
 * to import from `prismjs/components/prism-core`, but that sub-path
 * isn't covered by Prism's CommonJS export pattern in a way that all
 * bundlers (notably Rollup with strict module resolution on Windows)
 * agree on. We accept the small extra weight in exchange for a build
 * that works the same in every environment.
 *
 * The grammar registers itself globally via side-effect import. We
 * don't use Prism's DOM-walking auto-highlight (no
 * `Prism.highlightAll`); we call `Prism.highlight(sql, lang, 'sql')`
 * directly and consume the returned HTML string. That keeps the
 * integration entirely function-style and doesn't require Prism to
 * know about the DOM.
 *
 * v-html safety: the input is SQL text from the parsed XDBML document.
 * Prism HTML-escapes any non-token characters (so `<` and `>` from
 * SQL operators come out as `&lt;` and `&gt;`), and only ever wraps
 * recognized tokens in `<span class="token …">…</span>`. The output
 * HTML is bounded and trusted; v-html is the right tool here.
 */

import Prism from 'prismjs';
// Side-effect import: registers the SQL grammar on the global Prism
// instance. Must come AFTER the core import.
import 'prismjs/components/prism-sql';

// Prevent Prism from trying to auto-highlight any DOM elements when
// other parts of the page mount with elements like `<code class="language-sql">`.
// We do all highlighting explicitly via the `highlight()` call below.
Prism.manual = true;

/**
 * Highlight a SQL string. Returns sanitized HTML. Throws never; if Prism
 * doesn't recognize a fragment (e.g. dialect-specific syntax), it just
 * emits the raw text wrapped in nothing. The structure is always a
 * well-formed string of text nodes and `<span class="token …">` elements.
 */
export function highlightSql (sql: string): string {
  if (!sql) return '';
  return Prism.highlight(sql, Prism.languages.sql, 'sql');
}
