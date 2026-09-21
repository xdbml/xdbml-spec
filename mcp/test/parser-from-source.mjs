/**
 * Test-only module hook: resolve `@xdbml/parse` to the parser's source in
 * this repository instead of the copy installed from npm.
 *
 * The MCP tools import the parser by package name, so without the hook these
 * tests would exercise the npm copy rather than the parser this release
 * ships, and a tool behavior that depends on a parser change made in the same
 * release (a new construct such as SupertypeGroup, spec §12) could not be
 * tested until the parser was published. The renderer and playground tests
 * use the same hook. Used by the `test` script in package.json only; the
 * deployed worker bundles `@xdbml/parse` from its lockfile as before.
 */
import { register } from 'node:module';

register('./parser-from-source-hooks.mjs', import.meta.url);
