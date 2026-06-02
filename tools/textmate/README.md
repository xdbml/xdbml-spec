# xDBML TextMate grammar

A TextMate grammar for the xDBML language, used to drive syntax
highlighting across several surfaces:

- **Shiki**, used by VitePress on [xdbml.org](https://xdbml.org) for
  code blocks. The grammar is registered in `.vitepress/config.ts`.
- **The xDBML VS Code extension**, which embeds this grammar so that
  `.xdbml` files in VS Code are highlighted. The extension is in
  `tools/vscode-extension/`.
- **Future**: Shiki upstream (so Claude chat and other Shiki users
  pick up xDBML automatically); GitHub Linguist (so `.xdbml` files on
  GitHub get colored); `highlight.js` (so ChatGPT-style tools pick
  it up).

## Files

```
tools/textmate/
├── README.md                          this file
├── xdbml.tmLanguage.template.json     hand-edited template with
│                                      placeholder strings (DO edit)
├── xdbml.tmLanguage.json              generated grammar (DO NOT edit)
└── scripts/
    ├── build.mjs                      fills the template from
    │                                  parser/src/keywords.ts
    └── test.mjs                       smoke-tests the grammar
                                       against bundled examples
```

The single source of truth for the keyword vocabulary is
`parser/src/keywords.ts`. The template references it via placeholder
strings like `__SCALAR_TYPES__` that the build script replaces with
case-insensitive regex alternations.

## Adding a keyword

1. Edit `parser/src/keywords.ts`, adding the keyword to the right
   exported array (e.g. `SCALAR_TYPES`, `SETTING_KEYS`).
2. Run `node tools/textmate/scripts/build.mjs` to regenerate
   `xdbml.tmLanguage.json`.
3. Run `npm test` in the parser package; the keyword-consistency
   tests there verify the parser also recognizes the new keyword.
4. Run `node tools/textmate/scripts/test.mjs` to confirm the grammar
   still tokenizes the bundled example files cleanly.
5. Commit both `keywords.ts` and the regenerated
   `xdbml.tmLanguage.json`.

## Adding a syntactic pattern

If the new feature is more than a keyword (e.g. a new bracket form,
a new operator, a new string delimiter), edit
`xdbml.tmLanguage.template.json` directly. The build script preserves
the rest of the template; only placeholder strings are replaced.

Test guidelines for new patterns:

- Add a small fragment exercising the pattern to one of the example
  files under `parser/test/examples/`, OR
- Add a targeted assertion in `scripts/test.mjs` to verify the
  pattern produces the expected scope.

## Scope names

The grammar uses standard TextMate scope conventions with the
`.xdbml` suffix. The scopes that appear in tokenized output:

| Scope | Where it appears |
|---|---|
| `comment.line.double-slash.xdbml` | `// ...` line comments |
| `comment.block.xdbml` | `/* ... */` block comments |
| `keyword.control.directive.xdbml` | Top-of-file `xdbml: 0.1` directive |
| `keyword.declaration.xdbml` | `Project`, `Table`, `Ref`, etc. |
| `keyword.control.type.xdbml` | `object`, `array`, `map`, `set`, etc. |
| `keyword.control.polymorphism.xdbml` | `oneOf`, `anyOf`, `allOf`, `union` |
| `keyword.operator.cardinality.xdbml` | `>`, `<`, `-`, `<>` in Refs |
| `entity.name.type.xdbml` | Declared entity/container names |
| `storage.type.xdbml` | Scalar types (`int`, `varchar`, etc.) |
| `storage.type.bson.xdbml` | BSON types (`objectId`, etc.) |
| `support.constant.flag.xdbml` | Flag settings (`pk`, `unique`, `not null`, etc.) |
| `support.other.x-property.xdbml` | Custom `x_*` extension-point properties |
| `variable.parameter.setting.xdbml` | Setting keys (`default`, `pattern`, etc.) |
| `string.quoted.single.xdbml` | `'foo'` strings |
| `string.quoted.double.xdbml` | `"foo"` double-quoted identifiers |
| `string.quoted.triple.xdbml` | `'''foo'''` multi-line strings |
| `string.quoted.template.xdbml` | `` `foo` `` backtick strings |
| `string.unquoted.cardinality.xdbml` | `'0..*'` cardinality strings |
| `constant.numeric.xdbml` | Numeric literals |
| `constant.language.xdbml` | `true`, `false`, `null` |
| `constant.character.escape.xdbml` | Backslash escapes inside strings |
| `punctuation.separator.xdbml` | Commas, internal colons |
| `punctuation.separator.key-value.xdbml` | Colons after setting keys |
| `punctuation.section.brackets.*` | `[`, `]` |
| `punctuation.section.parens.xdbml` | `(`, `)` |
| `punctuation.section.braces.xdbml` | `{`, `}` |

These scopes are colored by VS Code themes and Shiki themes by their
prefixes (`keyword`, `string`, `storage.type`, etc.), so any theme
that knows about those base scopes will color xDBML reasonably
without needing xDBML-specific theme support.

## Relationship to Monarch

The playground's editor uses **Monaco**, which has its own tokenizer
language called **Monarch** (in `parser/src/monarch.ts`). Monarch and
TextMate share keyword vocabularies via `parser/src/keywords.ts`, but
their pattern formats are different: Monarch is a state-machine
language, TextMate is a begin/end-with-nesting language.

We maintain both. The Monarch tokenizer drives the in-playground
editor only; this TextMate grammar drives everything else.

## Testing

Two test scripts:

```sh
# Verifies parser/src/keywords.ts and parser/src/parser.ts agree
# (run as part of the regular parser test suite).
cd parser && npm test

# Verifies this TextMate grammar tokenizes the bundled .xdbml files
# without crashing and produces the expected scopes.
node tools/textmate/scripts/test.mjs
```

The smoke test loads the grammar with `vscode-textmate` and
`vscode-oniguruma` (the same libraries VS Code uses), so a passing
test here is a strong signal that VS Code will accept the grammar.

## Known limitations

- **Context-sensitive scopes are approximated.** TextMate grammars
  use regex-based pattern matching, not real parsing, so some
  contexts can't be disambiguated. For example, a bare `>` is
  highlighted as a cardinality operator only when surrounded by
  identifier-looking text; in other contexts it may not match. This
  matches industry practice (the dbdiagram.io grammar has the same
  caveat).
- **Composite flag settings**: `not null` and `primary key` are
  highlighted as two adjacent flag tokens rather than one combined
  token. Most themes color both consistently, so this is invisible
  in practice.
- **Open-vocabulary setting keys**: the parser accepts any
  identifier followed by `:` as a setting key. The grammar only
  highlights the curated list in `SETTING_KEYS`; uncommon or
  custom keys appear as plain identifiers. Adding them to
  `keywords.ts` opts them into highlighting.

## Provenance

Apache-2.0 licensed, matching the rest of the xDBML project. The
grammar is generated and committed; both the template and the
generated output should be code-reviewed for changes.
