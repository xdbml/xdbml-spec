---
title: Grammar
description: The xDBML ANTLR4 grammar for parser implementers and language tooling builders. Layered as an overlay on the upstream DBML grammar.
---

# xDBML Grammar (ANTLR4)

The xDBML grammar is published as an [ANTLR4](https://www.antlr.org) grammar file, layered on top of the Holistics DBML upstream grammar. It is intended for parser implementers, language tooling builders, and contributors proposing new constructs.

## Files

- **[`xDBML.g4`](https://github.com/xdbml/xdbml-spec/blob/main/grammar/xDBML.g4)** -- the ANTLR4 grammar additions, organized to mirror the specification's §17 numbering
- **[Test cases](./test-cases)** -- reference test corpus with VALID and INVALID examples organized by spec section

## Approach

The grammar is implemented as an **overlay** on the Holistics DBML grammar rather than as a from-scratch redefinition. xDBML extensions are declared as new tokens and parser rules; constructs that needed extension (entity keywords, path syntax, relationship cardinality, index entries) are explicit overrides of the upstream rule.

The merge between upstream DBML and xDBML overlays is currently handled by a build script (ANTLR4's `import` directive does not cleanly support rule replacement). See the grammar file's notes-for-implementers section at the bottom for build details.

## Status

The grammar is **drafted but not yet compile-tested** against the ANTLR4 compiler. Compile-testing is on the roadmap once a maintainer with a Java/Maven environment has cycled through it. Subtle ANTLR-specific issues (token precedence, left-recursion handling, alternative ordering) may be identified during that pass.

The grammar's *design* is stable as of v0.2; the specific token forms may require minor adjustments without affecting the spec's semantics. v0.2 adds the module system (`use`/`reuse` directives with optional clone blocks), scalar Named Types, and the new reserved tokens `USE`, `REUSE`, `FROM`, `AS`. Field-element-type imports (`field` slot value) and Container-scoped imports are semantically validated post-parse.

## Implementing a parser

A conforming parser implementation should:

1. Parse every valid xDBML v0.2 document to the AST described in §26 of the specification
2. Also parse v0.1 documents with v0.1 semantics (the file's version directive selects)
3. Reject malformed documents with informative line/column error reporting
4. Honor the version declaration per §4.1
5. Honor the `experimental:` opt-in per §4.2
6. Normalize implicit forms to canonical AST representations
7. Preserve declared keyword choices in the raw AST flavor
8. Compute default cardinality per §10.8 when not explicitly declared
9. Implement the module system per §25 (relative-path imports, clone blocks, name resolution, conflict detection)

Multiple implementations in different language ecosystems are welcome and encouraged. Coordination on AST shape (so generators and importers can be language-agnostic) is discussed in [GitHub issues](https://github.com/xdbml/xdbml-spec/issues) tagged `grammar`.

## Contributing to the grammar

Proposed changes to the grammar follow the [contribution process](/contributing). For minor refinements (token clarifications, rule comment improvements), open a PR directly. For grammar changes that reflect new spec constructs, follow the [construct proposal process](/contributing#proposing-a-new-specification-construct) -- the grammar change should accompany the spec change in the same pull request.
