/**
 * Test-only module hook: resolve `@xdbml/parse` to the parser's source in
 * this repository instead of the copy installed from npm.
 *
 * The playground build does the same through its Vite alias. These tests
 * import the renderer source by path, and the renderer imports
 * `@xdbml/parse` by name, which Node would otherwise resolve to the npm copy
 * installed under renderer/. A renderer change that depends on a parser
 * change made in the same release (a new construct such as SupertypeGroup,
 * spec §12) would then fail here until the parser was published. Used by
 * the `test` script in package.json only.
 */
import { register } from 'node:module';

register('./parser-from-source-hooks.mjs', import.meta.url);
