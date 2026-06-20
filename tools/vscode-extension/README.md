# xDBML language support for VS Code

Syntax highlighting and editor support for the [xDBML](https://xdbml.org) eXtended Database Markup Language.

xDBML is a **unified, open markup language** for **describing the shape** of structured and semi-structured data, plus the **declarative metadata** attached to that shape **across heterogeneous storage technologies**.  xDBML is designed from the ground up for **AI-assisted data modeling** and **AI-mediated schema interchange**.  A single xDBML document expresses entities, tables, attributes, columns, fields, data types, nested structures, relationships, polymorphism, named reusable types, classification tags, business-glossary references, validation constraints, synonyms, and the polyglot target-native vocabulary that real enterprise data architectures use.

It builds on [DBML](https://dbml.dbdiagram.io) and extends it with first-class support for containers, nested types, polymorphism, and reference data.

## What this extension does

- **Syntax highlighting** for `.xdbml` files, with distinct colors for declaration keywords, type expressions, scalar and BSON types, setting flags, setting keys, custom `x_*` properties, strings, comments, and cardinality operators.
- **Open in Playground**: send the current file, or the current selection, to the [xDBML playground](https://xdbml.org/playground/) with one click. The schema opens already loaded, so there is no copy and paste. Available from the button in the editor title bar, the editor right-click menu, and the command palette (`xDBML: Open in Playground`).
- **Editor affordances**: comment toggling, bracket matching, auto-closing pairs (including single quotes, double quotes, backticks for expression literals), block-comment indentation, fold regions via `// #region` / `// #endregion` markers.
- **Language icon** in the VS Code status bar for `.xdbml` files.

## What this extension does NOT do (yet)

- **No language server**. There's no parser-driven error reporting, no hover tooltips with type information, no go-to-definition, no refactoring. The highlighting is regex-based (TextMate) only.
- **No code completion**. VS Code's word-based completion still works against the open document, but there are no context-aware suggestions.
- **No file icon theme**. The extension contributes a language icon (visible in the status bar and language picker) but does not change the icons shown in the file explorer. To get a custom icon there, install a file-icon theme that supports `.xdbml` files.

A future release may add an LSP-backed language server with the features above. Subscribe to the [xdbml-spec releases](https://github.com/xdbml/xdbml-spec/releases) to be notified.

## Getting started

1. Install this extension from the VS Code Marketplace.
2. Open any `.xdbml` file. Highlighting activates automatically.
3. For an interactive editor with live diagrams, try the
   [xDBML playground](https://xdbml.org/playground/) in your browser.

## Resources

- [xDBML home](https://xdbml.org)
- [5-minute introduction](https://xdbml.org/learn/)
- [Language specification](https://xdbml.org/spec/v0.1)
- [Example schemas](https://xdbml.org/examples/)
- [Playground](https://xdbml.org/playground/)
- [GitHub repository](https://github.com/xdbml/xdbml-spec)

## Feedback

Issues and feature requests go to the [xdbml-spec issue tracker](https://github.com/xdbml/xdbml-spec/issues). Please mention this extension specifically in the issue title or description.

## License

Apache-2.0. See [LICENSE](LICENSE).

The grammar and language definition are part of the [xdbml-spec repository](https://github.com/xdbml/xdbml-spec), where the canonical TextMate grammar lives under `tools/textmate/`. This extension is a thin wrapper that packages the grammar for VS Code.
