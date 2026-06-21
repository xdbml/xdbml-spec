# @xdbml/parse

The parser for [xDBML](https://xdbml.org) (eXtended Database Markup Language), a strict superset of DBML 3.13.6 for describing the shape and meaning of structured and semi-structured data. It turns xDBML source into an abstract syntax tree, resolves module imports, and resolves names, with precise line and column diagnostics.

Framework-free and dependency-free, it runs anywhere JavaScript runs: the browser, Node, Cloudflare Workers. It powers the [playground](https://xdbml.org/playground/), the hosted render API, and the MCP server.

## Install

```sh
npm install @xdbml/parse
```

## Usage

```ts
import { parse, flatten, resolveNames, ParseError } from '@xdbml/parse';

const source = `
Table users {
  id int [pk]
  email varchar [unique, not null]
}
Table orders {
  id int [pk]
  user_id int [ref: > users.id]
}
`;

try {
  const doc = parse(source);                  // AST; throws ParseError on a syntax error
  flatten(doc);                               // resolve imports and partials into one document
  const { diagnostics } = resolveNames(doc);  // unresolved references, duplicate declarations, ...
  if (diagnostics.length === 0) {
    console.log('valid');
  } else {
    for (const d of diagnostics) {
      console.log(`[${d.severity}] ${d.message} (line ${d.span.start.line})`);
    }
  }
} catch (e) {
  if (e instanceof ParseError) {
    console.error(`Syntax error at line ${e.position.line}, column ${e.position.column}: ${e.message}`);
  } else {
    throw e;
  }
}
```

The package also exports `tokenize`, `LexError`, `Parser`, `SymbolTable`, and the AST types.

## Learn more

- [xdbml.org](https://xdbml.org), and the language [in 5 minutes](https://xdbml.org/learn/)
- The [specification and source](https://github.com/xdbml/xdbml-spec)
- The companion renderer, [`@xdbml/render`](https://www.npmjs.com/package/@xdbml/render)

## License

Apache License 2.0. See [LICENSE](./LICENSE).
