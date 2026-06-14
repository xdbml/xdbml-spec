/**
 * Monaco environment configuration.
 *
 * Monaco normally ships dedicated web workers for several "smart"
 * languages (TypeScript, JSON, CSS, HTML) that provide language
 * services like IntelliSense and validation. Each worker is a separate
 * bundle the browser loads when its language is active.
 *
 * The playground only uses a custom language (`xdbml`) with a Monarch
 * tokenizer for syntax highlighting. The Monarch grammar runs in the
 * editor's main worker; it doesn't need any of the language-specific
 * worker bundles. So we point MonacoEnvironment's `getWorker` factory
 * at only the base editor worker for every workerId.
 *
 * This must run BEFORE any code that creates a Monaco editor.
 * Importing this module at the top of `main.ts` is what guarantees
 * that.
 *
 * Trade-off: if we ever want to register additional languages with
 * smart workers (e.g. a JSON exporter view), we'd need to add their
 * worker entry points here. Today we don't, and shaving ~200 KB of
 * worker bundles + the language packs that depend on them is the
 * main win of this optimization.
 *
 * Vite's `?worker` suffix tells Vite to treat the import as a worker
 * entry point and emit it as a separate chunk loadable via the
 * Worker constructor at runtime.
 */

// Pull in Monaco's icon font (codicon) so fold controls, find/replace icons,
// scrollbar arrows, and every other built-in UI icon actually render. The
// `editor.api` ESM entry doesn't include this CSS by default; without this
// import, Monaco renders icon glyphs as blank spaces. Vite picks up the
// embedded url('./codicon.ttf') reference and bundles the font as an asset.
import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';

// Pull in Monaco's folding contribution. The `editor.api` ESM entry imports
// only the minimal editor surface (creation, model API, options) and OMITS
// the editor contributions (folding, find, multi-cursor, parameter hints,
// etc.) so an app can include just what it needs. Without this import:
//   - `foldingStrategy: 'indentation'` is silently ignored (no provider)
//   - no fold ranges are computed
//   - no fold-control decorations are rendered (no carets in the gutter)
//   - the `editor.fold` action is unregistered (Ctrl+Shift+[ does nothing)
// Importing the folding module for its side effects registers the
// contribution with Monaco's editor framework, after which all of the
// above work as documented.
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// Setting MonacoEnvironment.getWorker is the Monaco-documented way to
// supply worker bundles. We return the base editor worker for every
// requested workerId so any code path that asks for json/ts/css/html
// workers falls back to the editor worker (which still does basic
// editing functions just fine for syntax-highlighted-only languages).
self.MonacoEnvironment = {
  getWorker (_workerId: string, _label: string): Worker {
    return new EditorWorker();
  },
};
