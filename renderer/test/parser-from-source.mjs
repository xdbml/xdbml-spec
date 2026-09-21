/**
 * Test-only module hook: resolve `@xdbml/parse` to the parser's source in
 * this repository instead of the copy installed from npm.
 *
 * The playground already does this through a Vite alias, so the renderer is
 * exercised against the parser it ships with. Without the hook, a renderer
 * change that depends on a parser change made in the same release (a new
 * construct such as SupertypeGroup, spec §12) could not be tested until the
 * parser was published. Used by the `test*` scripts in package.json only;
 * the published package resolves `@xdbml/parse` normally.
 */
import { register } from 'node:module';

register('./parser-from-source-hooks.mjs', import.meta.url);
