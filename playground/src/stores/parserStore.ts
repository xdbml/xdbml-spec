/**
 * The xDBML playground parser store.
 *
 * Maintains the editor content as the single source of truth, and on each
 * (debounced) change runs the xDBML lexer + parser. Exposes:
 *
 *   - content: the editor text (two-way bound)
 *   - ast: the parsed XDbmlDocument, or undefined if the parse failed
 *   - errors: parse/lex errors as Monaco-friendly ParserError objects
 *   - isLoading: true during the debounced reparse
 *
 * The parser throws on the first syntax error. We catch it, surface as a
 * single diagnostic with line/column, and zero out the AST so the diagram
 * pane shows the last good state with an indicator rather than flickering.
 * That last-good-state behavior is implemented in the diagram component;
 * the store just nulls the AST when parsing fails.
 *
 * No multi-file, no symbol table, no go-to-def for v1. Those land when
 * the parser's semantic-analysis pass is built.
 */
import {
  computed, ref, shallowRef, watch,
} from 'vue';
import { defineStore } from 'pinia';
import { debounce } from 'lodash-es';
import {
  LexError, ParseError, parse, tokenize, flatten, resolveNames,
} from '@xdbml/parse';
import type { Diagnostic, Token, XDbmlDocument } from '@xdbml/parse';

import logger from '@/utils/logger';
import type { ParserError } from '@/types';
import { DEFAULT_SAMPLE_CONTENT, getSampleContentBySlug } from '@/services/sample-content';
import { decodeShareHash, clearShareHashFromUrl } from '@/services/share';

const STORAGE_KEY = 'xdbml-playground:content';
const DEBOUNCE_MS = 250;

/**
 * Initial content resolution order:
 *
 *   1. URL hash (`#s=...`): a shared schema link takes precedence over
 *      any local working copy. After loading, the hash is stripped from
 *      the URL bar so subsequent reloads use the working copy rather
 *      than re-applying the stale shared content.
 *
 *   2. localStorage: the user's last working copy from a previous
 *      session.
 *
 *   3. DEFAULT_SAMPLE_CONTENT: first-time visitors get the bundled
 *      welcome schema.
 *
 * The URL-hash path is intentionally destructive of any prior
 * localStorage content: clicking someone else's share link replaces
 * the working copy. That matches the dbdiagram.io pattern and what
 * users expect from "open someone's schema and start editing it."
 * Monaco's undo history still preserves the previous content if the
 * user wants to recover it within the session.
 */
function loadInitial (): string {
  try {
    const shared = decodeShareHash();
    if (shared !== null) {
      clearShareHashFromUrl();
      // Persist immediately as the new working copy so the user's
      // first edit doesn't drop them back to the previous content.
      try {
        localStorage.setItem(STORAGE_KEY, shared);
      } catch {
        // best-effort
      }
      return shared;
    }
  } catch (e) {
    logger.warn('URL hash decode failed', e);
  }

  // A "View in playground" deep link (`?example=<slug>`) opens a named
  // example directly. Explicit intent, so it wins over the stored working
  // copy; the param is stripped from the URL afterward so a refresh, or a
  // later Share, does not carry it.
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('example');
    if (slug) {
      const content = getSampleContentBySlug(slug);
      if (content !== null) {
        params.delete('example');
        const qs = params.toString();
        const base = window.location.href.split('?')[0].split('#')[0];
        history.replaceState(null, '', base + (qs ? `?${qs}` : '') + window.location.hash);
        try { localStorage.setItem(STORAGE_KEY, content); } catch { /* best-effort */ }
        return content;
      }
      logger.warn(`Unknown ?example slug: ${slug}`);
    }
  } catch (e) {
    logger.warn('example query-param handling failed', e);
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length > 0) return stored;
  } catch (e) {
    logger.warn('localStorage read failed', e);
  }
  return DEFAULT_SAMPLE_CONTENT;
}

export const useParserStore = defineStore('parser', () => {
  const content = ref<string>(loadInitial());

  /**
   * The AST is `shallowRef`'d so Vue doesn't try to deep-proxy every
   * field/setting/span -- they're plain objects but a deep proxy on a
   * large schema is wasteful.
   */
  const ast = shallowRef<XDbmlDocument | undefined>(undefined);

  /**
   * The flattened AST: a view of the AST where v0.2 `ModuleImportDirective`
   * nodes have been replaced by their clone-block content (see
   * `flatten()` from `@xdbml/parse`). Cloned entities, types, etc. appear
   * here as ordinary top-level statements or container-body items, just
   * as if they had been written directly in the importing file.
   *
   * Most playground components use this rather than `ast` because they
   * want to render or inspect ALL declarations regardless of whether
   * they were imported. The original `ast` is also exposed (for any
   * future tooling that wants to surface provenance) but currently no
   * consumer uses it.
   *
   * When `ast` is undefined (parse failure), `flatAst` is also undefined.
   * For documents without `use`/`reuse` directives, `flatAst` and `ast`
   * are structurally identical (flatten is a no-op there).
   */
  const flatAst = shallowRef<XDbmlDocument | undefined>(undefined);

  const tokens = shallowRef<Token[]>([]);
  const errors = ref<ParserError[]>([]);
  const isLoading = ref(false);

  const hasAst = computed(() => ast.value !== undefined);

  /**
   * Persist content as the user types, throttled so we don't hit
   * localStorage on every keystroke.
   */
  const persistContent = debounce((text: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch (e) {
      logger.warn('localStorage write failed', e);
    }
  }, 500);

  const reparse = debounce(() => {
    isLoading.value = true;
    const source = content.value;
    try {
      try {
        tokens.value = tokenize(source);
      } catch (e) {
        if (e instanceof LexError) {
          tokens.value = [];
          ast.value = undefined;
          flatAst.value = undefined;
          errors.value = [lexErrorToParserError(e)];
          return;
        }
        throw e;
      }

      try {
        const parsed = parse(source);
        ast.value = parsed;
        const flat = flatten(parsed);
        flatAst.value = flat;
        // Run name resolution as a separate pass. Failures here are
        // SEMANTIC, not syntactic -- the AST is still well-formed
        // and downstream rendering (diagram, inspector) keeps working.
        // The user just sees red squigglies on the offending references
        // and entries in the diagnostics panel. The resolver is cheap
        // enough to run on every keystroke alongside the parser.
        const resolution = resolveNames(parsed);
        errors.value = resolution.diagnostics.map(resolverDiagnosticToParserError);
      } catch (e) {
        if (e instanceof ParseError) {
          ast.value = undefined;
          flatAst.value = undefined;
          errors.value = [parseErrorToParserError(e)];
          return;
        }
        throw e;
      }
    } catch (err) {
      logger.error('Unexpected parsing error', err);
      tokens.value = [];
      ast.value = undefined;
      flatAst.value = undefined;
      errors.value = [{
        code: -1,
        severity: 'error',
        message: err instanceof Error ? err.message : 'Unexpected error',
        location: {
          line: 1,
          column: 1,
        },
        endLocation: {
          line: 1,
          column: 2,
        },
      }];
    } finally {
      isLoading.value = false;
    }
  }, DEBOUNCE_MS);

  watch(content, (newContent) => {
    persistContent(newContent);
    reparse();
  }, {
    immediate: true,
  });

  function reset (): void {
    content.value = DEFAULT_SAMPLE_CONTENT;
  }

  function setContent (newContent: string): void {
    content.value = newContent;
  }

  return {
    content,
    ast,
    flatAst,
    tokens,
    errors,
    isLoading,
    hasAst,
    reset,
    setContent,
  };
});

function lexErrorToParserError (e: LexError): ParserError {
  return {
    code: 1,
    severity: 'error',
    message: e.message,
    location: {
      line: e.position.line,
      column: e.position.column,
    },
    endLocation: {
      line: e.position.line,
      column: e.position.column + 1,
    },
  };
}

function parseErrorToParserError (e: ParseError): ParserError {
  return {
    code: 2,
    severity: 'error',
    message: e.message,
    location: {
      line: e.position.line,
      column: e.position.column,
    },
    endLocation: {
      line: e.position.line,
      column: e.position.column + 1,
    },
  };
}

/**
 * Convert a resolver Diagnostic (with `span`, string `code`, explicit
 * severity) to the UI-facing ParserError shape. The Span gives us the
 * exact range, so Monaco can underline only the offending construct
 * rather than a single character.
 */
function resolverDiagnosticToParserError (d: Diagnostic): ParserError {
  return {
    code: d.code,
    severity: d.severity,
    message: d.message,
    location: {
      line: d.span.start.line,
      column: d.span.start.column,
    },
    endLocation: {
      // Monaco expects endColumn STRICTLY > startColumn, otherwise the
      // marker is invisible. Spans from the parser are inclusive on
      // start, exclusive on end -- so end.column is already correct
      // for Monaco. We still guard with max() in case a diagnostic
      // ever carries a degenerate zero-width span.
      line: d.span.end.line,
      column: Math.max(d.span.end.column, d.span.start.column + 1),
    },
  };
}
