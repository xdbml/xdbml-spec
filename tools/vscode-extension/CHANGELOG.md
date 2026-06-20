# Change log

Notable changes to the xDBML language support extension.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0]

Adds a one-click bridge from the editor to the playground.

### Added
- **Open in Playground** command (`xDBML: Open in Playground`). It opens the
  current `.xdbml` file -- or the current selection -- in the hosted playground
  at xdbml.org with the schema already loaded, so there is no copy and paste.
  Available from a button in the editor title bar, the editor right-click menu,
  and the command palette. The link uses the same lz-string `#s=` share format
  as the renderer and the HTTP render API, so it round-trips exactly.

### Notes
- This is the extension's first release with runtime activation code. The
  bundle is built with esbuild at publish time (`vscode:prepublish`), and
  `lz-string` is bundled in, so the packaged extension stays self-contained.

## [0.2.0]

Adds syntax highlighting for the constructs introduced in xDBML v0.2.

### Added
- **Module system keywords**: `use`, `reuse`, `from`, `as` are now
  highlighted with a dedicated `keyword.control.module.xdbml` scope.
  These appear in v0.2's `use`/`reuse ... from './path' { ... }`
  directives (spec §26). The `as` keyword also serves DBML table-
  aliasing (`Table users as u`) under the same scope.
- **Entity-level `checks` block**: the `checks` keyword (alongside
  the existing `indexes`) is recognized as a setting key. v0.2 §10
  introduces it as an entity-level block of multi-column constraint
  expressions.
- **`cloned_at` directive setting**: the v0.2 `[cloned_at: '...']`
  metadata on `use`/`reuse` directives is recognized as a setting key.
- **`inactive` flag**: the v0.2 `[inactive]` flag on Ref declarations
  (visualization-only deactivation, spec §11.9) is now categorized as
  a setting flag rather than a setting key, matching its no-value
  syntax. This is a minor scope correction; visually identical in
  most themes.

### Notes
- Color settings on Ref and TableGroup (`[color: '#...']`) were already
  highlighted by the existing setting-key vocabulary; no change needed.
- v0.2 also adds scalar Named Types (`Type Email varchar [...]`,
  spec §14.7). The TextMate grammar already highlights `Type` as a
  declaration keyword and `varchar` as a scalar type, so no new
  pattern is required -- the scalar form is highlighted via existing
  rules.

## [0.1.1]

Maintenance release. See git history.

## [0.1.0]

Initial release.

### Added
- TextMate grammar for xDBML covering declaration keywords (Project,
  Container, Schema, Database, Keyspace, Namespace, Dataset, Bucket,
  Table, Entity, Collection, Record, Type, Edge, View, Enum, Ref,
  Note, TablePartial, TableGroup, DiagramView).
- Structural type keywords (object, struct, array, list, map, dict,
  dictionary, set, json, jsonb, variant) and polymorphism keywords
  (union, oneOf, anyOf, allOf).
- Scalar type names (51) and BSON type names (9).
- Setting flags (pk, primary, key, unique, null, not, required,
  increment) and setting keys (52 including AI-readiness, validation,
  and referential-action keys).
- Custom `x_*` extension-point property highlighting.
- Single and triple-quoted string literals, backtick expression
  literals, double-quoted identifiers, numeric and boolean literals,
  null constants.
- Line and block comments.
- Cardinality operators (`>`, `<`, `-`, `<>`) in Ref declarations.
- Language configuration: comment toggling, bracket matching,
  auto-closing pairs, block-comment continuation, fold regions
  via `// #region` markers.
- Language icon (visible in the status bar and language picker).
- File association for `.xdbml`.

[0.3.0]: https://github.com/xdbml/xdbml-spec/releases/tag/extension-v0.3.0
[0.2.0]: https://github.com/xdbml/xdbml-spec/releases/tag/extension-v0.2.0
[0.1.1]: https://github.com/xdbml/xdbml-spec/releases/tag/extension-v0.1.1
[0.1.0]: https://github.com/xdbml/xdbml-spec/releases/tag/extension-v0.1.0
