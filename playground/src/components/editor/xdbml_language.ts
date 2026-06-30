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
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
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

/*
 * Dark counterpart of XDBML_THEME. Same token taxonomy, foregrounds
 * lifted to read on a dark editor surface, and a slate editor chrome so
 * the editor pane matches the rest of the playground in dark mode rather
 * than Monaco's default near-black vs-dark background.
 */
const XDBML_THEME_DARK: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword.declaration', foreground: '6ea8ff', fontStyle: 'bold' },
    { token: 'keyword.container', foreground: '6ea8ff', fontStyle: 'bold' },
    { token: 'keyword.entity', foreground: '6ea8ff', fontStyle: 'bold' },
    { token: 'keyword.type', foreground: 'e08fd0', fontStyle: 'bold' },
    { token: 'keyword.polymorphism', foreground: 'e08fd0', fontStyle: 'bold italic' },
    { token: 'keyword.directive', foreground: 'c89be0', fontStyle: 'bold' },
    { token: 'keyword.setting', foreground: '4ec9b0' },
    { token: 'keyword.value', foreground: '4ec9b0' },
    { token: 'keyword.literal', foreground: 'e08fd0' },
    { token: 'keyword.wildcard', foreground: 'ff9e5e', fontStyle: 'bold' },
    { token: 'keyword.partial', foreground: 'ff9e5e', fontStyle: 'bold' },

    { token: 'type', foreground: '7ec699' },
    { token: 'type.bson', foreground: '7ec699', fontStyle: 'italic' },

    { token: 'identifier', foreground: 'd4d4d4' },
    { token: 'identifier.custom-property', foreground: 'd7ba7d', fontStyle: 'italic' },

    { token: 'string', foreground: 'ce9178' },
    { token: 'string.multiline', foreground: 'ce9178' },
    { token: 'string.quoted-ident', foreground: '9cdcfe' },
    { token: 'string.backtick', foreground: 'ce9178', fontStyle: 'italic' },
    { token: 'string.escape', foreground: 'd7ba7d' },

    { token: 'comment', foreground: '8a98a8', fontStyle: 'italic' },
    { token: 'comment.block', foreground: '8a98a8', fontStyle: 'italic' },

    { token: 'number', foreground: 'b5cea8' },
    { token: 'number.float', foreground: 'b5cea8' },
    { token: 'number.hex', foreground: '6ea8ff' },

    { token: 'operators.cardinality', foreground: 'd4d4d4', fontStyle: 'bold' },
    { token: 'delimiter', foreground: 'b0b0b0' },
    { token: 'delimiter.curly', foreground: 'b0b0b0' },
    { token: 'delimiter.square', foreground: 'b0b0b0' },
    { token: 'delimiter.parenthesis', foreground: 'b0b0b0' },
  ],
  colors: {
    'editor.background': '#0f172a',
    'editorGutter.background': '#0f172a',
    'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#94a3b8',
    'editor.lineHighlightBackground': '#1e293b',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#e2e8f0',
    'editor.selectionBackground': '#334155',
    'editorIndentGuide.background1': '#1e293b',
    'editorIndentGuide.activeBackground1': '#334155',
  },
};

export const XDBML_THEME_DARK_NAME = 'xdbml-theme-dark';

let registered = false;

export function registerXDbmlLanguage (): void {
  if (registered) return;
  try {
    monaco.languages.register({ id: XDBML_LANGUAGE_ID });
    monaco.languages.setMonarchTokensProvider(XDBML_LANGUAGE_ID, XDBML_TOKEN_PROVIDER);
    monaco.languages.setLanguageConfiguration(XDBML_LANGUAGE_ID, XDBML_LANGUAGE_CONFIG);
    monaco.editor.defineTheme(XDBML_THEME_NAME, XDBML_THEME);
    monaco.editor.defineTheme(XDBML_THEME_DARK_NAME, XDBML_THEME_DARK);
    registered = true;
  } catch (e) {
    logger.warn('Failed to register xDBML language with Monaco', e);
  }
}
