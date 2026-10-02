export interface ParseOptions {
  /**
   * The absolute or canonical path of the file being parsed. Used as the
   * base directory for relative `from './...'` paths in `use`/`reuse`
   * directives. If undefined, relative paths in directives can only be
   * resolved when they're already absolute (rare). For files loaded via
   * `readFile`, the parser passes the resolved path automatically.
   */
  filePath?: string;

  /**
   * Synchronous file reader. Called by the parser when it needs to resolve
   * a reference-only module directive. The argument is a resolved, stable
   * key: an absolute path for local sources, or a normalized `https://` URL
   * for remote (v0.3) sources (when a directive's `from` is a URL, or a
   * relative reference inside a remote module resolves to one). The function
   * should return the source text for that key, or throw if it is missing
   * or unreadable.
   *
   * Because this reader is synchronous, a host that supports remote sources
   * must return the fetched text from a cache it populated beforehand. The
   * network fetch, and its SSRF / redirect / size / timeout obligations
   * (spec §27.14.5), live in the host's resolver, not in the parser.
   *
   * If absent, reference-only directives fall back to the P4 rejection
   * with a clear "no resolver available" message. Clone-block-bearing
   * directives still work without a resolver because their content is
   * embedded in the importing file.
   */
  readFile?: (pathOrUrl: string) => string;

  /**
   * Maximum recursion depth when resolving directives. Each `from` traversal
   * deepens the stack by one; circular imports trigger the cycle-detection
   * path BEFORE this counter increases (cycles produce a parsed directive
   * with an empty clone, not a depth-limit error). The default (8) is
   * generous for realistic module graphs and small enough to keep the
   * stack bounded under pathological inputs.
   */
  maxDepth?: number;
}