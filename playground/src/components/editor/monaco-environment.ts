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
