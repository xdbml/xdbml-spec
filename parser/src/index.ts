/**
 * @xdbml/parse -- proof-of-concept parser for xDBML v0.1.
 *
 * Public API:
 *
 *   parse(source): XDbmlDocument
 *     Parse an xDBML document. Returns a fully-typed AST.
 *
 *   tokenize(source): Token[]
 *     Tokenize the source without parsing. Useful for syntax highlighting.
 *
 * The parser is DBML-3.13.6 compatible: a document without an `xdbml: ...`
 * version header still parses, and DBML constructs are preserved.
 */

export * from './ast.ts';
export { tokenize, TokenKind, LexError } from './lexer.ts';
export type { Token } from './lexer.ts';
export { parse, Parser, ParseError } from './parser.ts';
export {
  xdbmlLanguageConfig,
  xdbmlMonarchTokensProvider,
} from './monarch.ts';
export type {
  XDbmlLanguageConfiguration,
  XDbmlMonarchLanguage,
} from './monarch.ts';
