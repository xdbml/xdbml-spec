/**
 * Register the xDBML language with Monaco.
 *
 * Plugs the Monarch tokens provider and language configuration from
 * `@xdbml/parse` into Monaco, and defines a color theme tuned to the
 * token types Monarch emits for xDBML (declaration keywords, container
 * keywords, type expressions, polymorphism, BSON types, the array
 * wildcard `[*]`, the partial-injection `~`, etc.).
 *
 * Idempotent -- safe to call from multiple components on mount.
 */
import * as monaco from 'monaco-editor';
import {
  xdbmlLanguageConfig,
  xdbmlMonarchTokensProvider,
} from '@xdbml/parse';

import logger from '@/utils/logger';

const XDBML_LANGUAGE_CONFIG = xdbmlLanguageConfig as unknown as monaco.languages.LanguageConfiguration;
const XDBML_TOKEN_PROVIDER = xdbmlMonarchTokensProvider as unknown as monaco.languages.IMonarchLanguage;

/**
 * Theme. Coloring choices:
 *   - Declaration keywords (Project, Container, Entity, ...) -- deep blue, bold.
 *   - Type expression keywords (object, array, oneOf, ...) -- magenta-ish.
 *   - Scalar / BSON types -- green; BSON italic to flag MongoDB-specific.
 *   - Setting keys (pattern, default, synonyms, ...) -- teal.
 *   - x_-prefixed custom properties -- italic amber so they stand out as
 *     extension points.
 *   - Cardinality operators (< > - <>) -- bold black for emphasis.
 *   - `[*]` array wildcard and `~` partial injection -- orange-bold to make
 *     them visually scannable.
 */
const XDBML_THEME: monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword.declaration', foreground: '0033cc', fontStyle: 'bold' },
    { token: 'keyword.container', foreground: '0033cc', fontStyle: 'bold' },
    { token: 'keyword.entity', foreground: '0033cc', fontStyle: 'bold' },
    { token: 'keyword.type', foreground: 'aa3399', fontStyle: 'bold' },
    { token: 'keyword.polymorphism', foreground: 'aa3399', fontStyle: 'bold italic' },
    { token: 'keyword.directive', foreground: '7c1f9e', fontStyle: 'bold' },
    { token: 'keyword.setting', foreground: '0a8080' },
    { token: 'keyword.value', foreground: '0a8080' },
    { token: 'keyword.literal', foreground: 'aa3399' },
    { token: 'keyword.wildcard', foreground: 'ff5500', fontStyle: 'bold' },
    { token: 'keyword.partial', foreground: 'ff5500', fontStyle: 'bold' },

    { token: 'type', foreground: '107010' },
    { token: 'type.bson', foreground: '107010', fontStyle: 'italic' },

    { token: 'identifier', foreground: '000000' },
    { token: 'identifier.custom-property', foreground: '8b5a00', fontStyle: 'italic' },

    { token: 'string', foreground: 'a31515' },
    { token: 'string.multiline', foreground: 'a31515' },
    { token: 'string.quoted-ident', foreground: '1f5582' },
    { token: 'string.backtick', foreground: 'a31515', fontStyle: 'italic' },
    { token: 'string.escape', foreground: 'cc6600' },

    { token: 'comment', foreground: '777777', fontStyle: 'italic' },
    { token: 'comment.block', foreground: '777777', fontStyle: 'italic' },

    { token: 'number', foreground: '0a7d3c' },
    { token: 'number.float', foreground: '0a7d3c' },
    { token: 'number.hex', foreground: '2030c0' },

    { token: 'operators.cardinality', foreground: '000000', fontStyle: 'bold' },
    { token: 'delimiter', foreground: '404040' },
    { token: 'delimiter.curly', foreground: '404040' },
    { token: 'delimiter.square', foreground: '404040' },
    { token: 'delimiter.parenthesis', foreground: '404040' },
  ],
  colors: {},
};

export const XDBML_LANGUAGE_ID = 'xdbml';
export const XDBML_THEME_NAME = 'xdbml-theme';

let registered = false;

export function registerXDbmlLanguage (): void {
  if (registered) return;
  try {
    monaco.languages.register({ id: XDBML_LANGUAGE_ID });
    monaco.languages.setMonarchTokensProvider(XDBML_LANGUAGE_ID, XDBML_TOKEN_PROVIDER);
    monaco.languages.setLanguageConfiguration(XDBML_LANGUAGE_ID, XDBML_LANGUAGE_CONFIG);
    monaco.editor.defineTheme(XDBML_THEME_NAME, XDBML_THEME);
    registered = true;
  } catch (e) {
    logger.warn('Failed to register xDBML language with Monaco', e);
  }
}
