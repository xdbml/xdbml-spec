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
  LexError, ParseError, parse, tokenize,
} from '@xdbml/parse';
import type { Token, XDbmlDocument } from '@xdbml/parse';

import logger from '@/utils/logger';
import type { ParserError } from '@/types';
import { DEFAULT_SAMPLE_CONTENT } from '@/services/sample-content';

const STORAGE_KEY = 'xdbml-playground:content';
const DEBOUNCE_MS = 250;

function loadInitial (): string {
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
          errors.value = [lexErrorToParserError(e)];
          return;
        }
        throw e;
      }

      try {
        ast.value = parse(source);
        errors.value = [];
      } catch (e) {
        if (e instanceof ParseError) {
          ast.value = undefined;
          errors.value = [parseErrorToParserError(e)];
          return;
        }
        throw e;
      }
    } catch (err) {
      logger.error('Unexpected parsing error', err);
      tokens.value = [];
      ast.value = undefined;
      errors.value = [{
        code: -1,
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
