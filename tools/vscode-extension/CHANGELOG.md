# Change log

Notable changes to the xDBML language support extension.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.1.0]: https://github.com/xdbml/xdbml-spec/releases/tag/v0.1.0
