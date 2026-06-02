# xDBML TextMate Grammar

A TextMate grammar for xDBML v0.1 (eXtended Database Markup Language). Use it to add syntax highlighting in VS Code, Shiki, VitePress, Prism (via tmLanguage adapter), and any other tooling that consumes TextMate grammars.

## File

`xdbml.tmLanguage.json` -- the grammar.

## Scope name

`source.xdbml`

## File extensions

`.xdbml`

## What it highlights

Token category mapping (TextMate scope on the left, intent on the right):

- `keyword.control.construct.*` : top-level constructs (`Project`, `Container`, `Schema`, `Database`, `Keyspace`, `Namespace`, `Dataset`, `Bucket`, `Entity`, `Table`, `Collection`, `Record`, `Edge`, `View`, `Type`, `Enum`/`enum`, `Ref`, `TablePartial`, `TableGroup`, `DiagramView`, `Note`)
- `keyword.other.block.xdbml` : block keywords (`records`, `indexes`, `checks`)
- `keyword.other.polymorphism.xdbml` : polymorphism keywords (`union`, `oneOf`, `anyOf`, `allOf`)
- `keyword.control.directive.version.xdbml` : `xdbml:` and `experimental:` directives
- `keyword.operator.relationship.*` : relationship operators (`<`, `>`, `-`, `<>`)
- `storage.type.complex.xdbml` : complex type keywords (`object`, `struct`, `record`, `array`, `list`, `map`, `dict`, `dictionary`, `set`)
- `storage.type.scalar.relational.xdbml` : relational scalar types (`int`, `varchar`, `decimal`, `timestamp`, etc.)
- `storage.type.scalar.bson.xdbml` : BSON scalar types (`string`, `int32`, `int64`, `objectId`, `Decimal128`, `Date`, etc.)
- `storage.type.scalar.json.xdbml` : JSON storage types (`json`, `jsonb`, `variant`)
- `support.type.property-name.xdbml` : field settings (`pk`, `not null`, `unique`, `default`, `pattern`, `format`, validation keywords, etc.)
- `support.type.property-name.cardinality.xdbml` : cardinality settings (`source`, `target`, `min_source`, `source_cardinality`, etc.)
- `support.type.property-name.view.xdbml` : view settings (`materialized`, `refresh_schedule`, `source_query`, etc.)
- `support.type.property-name.ai.xdbml` : AI-readiness settings (`synonyms`, `business_term`, `granularity`, `tags`)
- `variable.other.custom-property.xdbml` : custom properties with `x_` prefix
- `constant.language.target.xdbml` : recognized target names (`Oracle`, `PostgreSQL`, `MongoDB`, `Neo4j`, etc.)
- `constant.numeric.cardinality.xdbml` : UML cardinality strings (`'0..*'`, `'1..1'`, etc.)
- `constant.numeric.array-index.xdbml` : array index path segments (`.[0]`, `.[*]`)
- `constant.numeric.*` : numeric literals
- `constant.language.boolean.xdbml` : `true`, `false`
- `constant.language.null.xdbml` : `null` (when used as a value, not as a type membership)
- `string.quoted.single.xdbml`, `string.quoted.triple.xdbml`, `string.quoted.double.xdbml` : string literals
- `string.interpolated.backtick.xdbml` : expression literals (backtick-quoted engine-native expressions)
- `comment.line.double-slash.xdbml`, `comment.block.xdbml` : comments
- `entity.name.namespace.container.xdbml`, `entity.name.class.entity.xdbml`, `variable.other.field.xdbml` : qualified names (`container.entity.field`)
- `entity.name.tag.partial-injection.xdbml` : partial injection (`~base_template`)

## Using with Shiki (recommended for xdbml.org / VitePress)

Shiki 1.x and later support adding custom languages at runtime. In a VitePress config:

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress'
import xdbmlGrammar from './xdbml.tmLanguage.json'

export default defineConfig({
  markdown: {
    shikiSetup: async (shiki) => {
      await shiki.loadLanguage({
        ...xdbmlGrammar,
        name: 'xdbml',
        scopeName: 'source.xdbml',
        aliases: ['xdbml']
      })
    }
  }
})
```

Then in markdown, fenced code blocks tagged `xdbml` will highlight correctly:

```markdown
​```xdbml
xdbml: 0.1
Project demo {
  targets: Oracle
}
​```
```

## Using with VS Code

Create a minimal extension with this structure:

```
xdbml-vscode/
├── package.json
├── language-configuration.json
└── syntaxes/
    └── xdbml.tmLanguage.json
```

`package.json`:

```json
{
  "name": "xdbml",
  "displayName": "xDBML",
  "description": "Syntax highlighting for xDBML",
  "version": "0.1.0",
  "engines": { "vscode": "^1.60.0" },
  "categories": ["Programming Languages"],
  "contributes": {
    "languages": [{
      "id": "xdbml",
      "aliases": ["xDBML", "xdbml"],
      "extensions": [".xdbml"],
      "configuration": "./language-configuration.json"
    }],
    "grammars": [{
      "language": "xdbml",
      "scopeName": "source.xdbml",
      "path": "./syntaxes/xdbml.tmLanguage.json"
    }]
  }
}
```

`language-configuration.json`:

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [["{", "}"], ["[", "]"], ["(", ")"]],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "'", "close": "'" },
    { "open": "\"", "close": "\"" },
    { "open": "`", "close": "`" }
  ],
  "surroundingPairs": [
    ["{", "}"], ["[", "]"], ["(", ")"],
    ["'", "'"], ["\"", "\""], ["`", "`"]
  ]
}
```

Package and publish to the VS Code Marketplace, or install locally with `vsce package` followed by `code --install-extension xdbml-0.1.0.vsix`.

## Known limitations of this draft

This is a first draft. A few areas could be tightened in a follow-up:

1. The `null` rule uses negative lookbehinds to avoid highlighting `not null` and `union [int, null]` -- it works for common cases but a stateful parser would handle context more reliably.
2. The relationship operators `<`, `>`, `-` are matched with whitespace lookarounds because these characters appear in other contexts (less-than comparisons in expression literals, dashes in identifiers when quoted, etc.). False positives are possible in edge cases.
3. Target name highlighting covers the canonical names from spec §5.1 and the most common aliases. Custom target names will fall through to generic identifier styling.
4. Two-word keywords like `not null` and `primary key` are matched with `\s+` between tokens, which assumes a single line. Multi-line splits would not be recognized but the spec does not require supporting them.
5. JSONPath-style bracket syntax (e.g. `addresses[0].city` from spec §18.4) is not specifically handled -- it falls through to identifier + bracket styling.
6. Heterogeneous tuple positional syntax (`[0] billing object { ... }`) renders the position correctly but does not distinguish the tuple label from a regular identifier.

## License

Recommended: Apache License 2.0, matching the xDBML specification itself.
