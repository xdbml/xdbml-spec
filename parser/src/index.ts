/**
 * @xdbml/parse -- proof-of-concept parser for xDBML v0.1 and v0.2.
 *
 * Public API:
 *
 *   parse(source, options?): XDbmlDocument
 *     Parse an xDBML document. Returns a fully-typed AST. Passing
 *     `options.readFile` enables cross-file `use`/`reuse` resolution
 *     (see ParseOptions for details).
 *
 *   tokenize(source): Token[]
 *     Tokenize the source without parsing. Useful for syntax highlighting.
 *
 *   flatten(doc): XDbmlDocument
 *     Produce a flattened view of a document where ModuleImportDirective
 *     nodes have been replaced by their clone-block content. Useful for
 *     downstream consumers that don't care about module provenance.
 *
 * The parser is DBML-3.13.6 compatible: a document without an `xdbml: ...`
 * version header still parses, and DBML constructs are preserved.
 */

export * from './ast.ts';
export { tokenize, TokenKind, LexError } from './lexer.ts';
export type { Token } from './lexer.ts';
export { parse, Parser, ParseError } from './parser.ts';
export { flatten } from './module-resolver.ts';
export {
  xdbmlLanguageConfig,
  xdbmlMonarchTokensProvider,
} from './monarch.ts';
export type {
  XDbmlLanguageConfiguration,
  XDbmlMonarchLanguage,
} from './monarch.ts';
