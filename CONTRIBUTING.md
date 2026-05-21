---
title: Contributing
description: How to contribute to xDBML. Issue templates, pull request conventions, the proposal process for new specification constructs, and conventions for examples and grammar.
---

# Contributing to xDBML

Thank you for considering a contribution to xDBML. This document describes how to participate in the project -- what to contribute, how to file issues, how to submit pull requests, and how the review process works.

For the *who decides and how* of project governance -- decision-making, roles, the relationship with DBML upstream, the path to neutral governance -- see [`GOVERNANCE.md`](./GOVERNANCE.md).

## Quick links

- [Open issues](https://github.com/xdbml/xdbml-spec/issues)
- [Specification source (v0.1)](./spec/v0.1.md)
- [Examples folder](./examples/)
- [Grammar](./grammar/xDBML.g4)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Governance](./GOVERNANCE.md)

## Ways to contribute

Contributions to xDBML take many forms. All of them are welcome, and none of them require prior approval or affiliation with any organization.

- **Reporting issues** -- typos, ambiguities, inconsistencies, unclear examples, broken cross-references
- **Improving documentation** -- clarifying wording, adding worked examples, improving the 5-minute introduction
- **Adding example schemas** -- realistic domains that demonstrate features not yet covered by the existing examples
- **Proposing new specification constructs** -- new keywords, settings, vocabulary additions, target-format support
- **Building parsers, generators, or importers** -- implementations in any programming language ecosystem
- **Coordinating with adjacent standards** -- bridging xDBML to ODCS, OSI, JSON Schema, Avro, OpenAPI, and other formats
- **Reviewing pull requests** -- substantive review by community members is invaluable and counted toward maintainership eligibility

If you're not sure where to start, look for issues tagged [`good first issue`](https://github.com/xdbml/xdbml-spec/labels/good%20first%20issue) -- these are curated by maintainers to be approachable for newcomers.

## Filing an issue

Before opening a new issue, please search existing issues to avoid duplicates. If you find a closely related issue, consider commenting on it rather than opening a new one.

Issues fall into four categories. Use the corresponding template when opening:

### Specification issues

For typos, ambiguities, contradictions, or unclear wording in the specification document. Include:

- The section number and a quote of the relevant text
- A description of what is unclear, contradictory, or incorrect
- A suggested correction if you have one (not required)

### Construct proposals

For proposing a new construct, keyword, setting, or vocabulary addition to the specification. See [Proposing a new specification construct](#proposing-a-new-specification-construct) below for the full process. A construct proposal issue is the first step.

### Implementation issues

For bugs, feature requests, or design questions in the reference parser, generators, importers, or other tooling. Include:

- The tool and version affected
- A minimal reproducing example
- The expected behavior and the actual behavior

### General questions

For questions about adoption, integration, governance, or anything else that doesn't fit the above categories. Tag your issue with `question`. Note that responses to questions are not guaranteed within any specific timeframe; we'll do our best.

## Submitting a pull request

We use GitHub's pull-request workflow for all changes. The process:

### Before you start

1. **For substantive changes**, open an issue first to discuss the proposed approach. This avoids wasted work when a maintainer would have suggested a different direction.
2. **For typos, broken links, and other small editorial fixes**, no issue is needed -- open a pull request directly.
3. **For new construct proposals**, follow the formal proposal process described below before submitting a pull request.

### Branch and commit conventions

- Work on a feature branch in your fork. Branch names should be descriptive: `fix-pattern-typo-section-23`, `add-example-streaming-events`, `propose-edge-undirected-default`.
- Keep commits focused. One logical change per commit.
- Commit messages should follow the [Conventional Commits](https://www.conventionalcommits.org) format where reasonable. Common types: `fix:`, `feat:`, `docs:`, `chore:`, `spec:` (for specification changes specifically).
- Sign off your commits if you intend to contribute regularly. We do not require a CLA, but a sign-off makes provenance clear.

### What to include in your pull request

- A short, descriptive title
- A description that links the issue being addressed (if any) and summarizes the change
- For specification changes, an explanation of the motivation and any backward-compatibility implications
- For example contributions, a brief description of which features the example emphasizes
- For tooling contributions, instructions for testing the change locally

### Review process

Pull requests are reviewed by maintainers. The review process:

- **Editorial changes** (typos, broken links, clarifying wording with no semantic change) are typically merged within a few days by any maintainer.
- **Specification refinements** require maintainer review plus a second approval. Expect a week or two of discussion.
- **New construct proposals** require the formal proposal process and an extended review period.

Reviewers will use GitHub's review features to request changes, suggest modifications, or approve. If a reviewer requests changes, please address the feedback or explain why the original approach is preferable. Constructive disagreement is welcome.

Once approved, a maintainer will merge the pull request. We use squash-merges by default for editorial changes and merge-commits for substantive changes that benefit from preserving the development history.

## Proposing a new specification construct

New constructs -- new keywords, new settings, new vocabulary, new round-trip targets -- follow a deliberate process described in §3.3 of [`GOVERNANCE.md`](./GOVERNANCE.md). The operational steps:

### Step 1: Open a proposal issue

Use the template below. Open a GitHub issue with the label `proposal`.

```markdown
## Summary

A one-paragraph description of what you propose to add.

## Motivation

Why does xDBML need this? What use case is not currently expressible?
Cite specific user scenarios where possible.

## Proposed syntax

Show the syntax with at least one worked example. Use the same
formatting conventions as the specification itself.

## Round-trip behavior

How does the construct behave when generating to:
- SQL DDL targets (Oracle, PostgreSQL, etc.)
- MongoDB validators
- JSON Schema
- Avro
- Neo4j Cypher (if relevant)

If the construct has no equivalent in some targets, describe how the
generator should handle that case (warning, drop, approximation).

## Adjacent standards

How does this construct relate to similar concepts in ODCS, OSI, OWL,
JSON Schema, OpenAPI, or other adjacent standards? Is it borrowing a
pattern, complementing an existing standard, or doing something
genuinely new?

## Alternatives considered

What alternative designs did you consider? Why is the proposed
design preferable?

## Backward compatibility

Does this proposal affect existing v0.1 documents? If so, how?
(Most proposals should be backward-compatible additions.)

## Open questions

What aspects are you unsure about and would welcome community
input on?
```

### Step 2: Discussion period

A minimum of two weeks of open discussion before the proposal can advance. During this period, maintainers and community members will raise questions, suggest alternatives, and identify implications. The proposer is expected to engage with feedback substantively.

### Step 3: Draft specification text

If discussion converges on acceptance, the proposer (or a maintainer) drafts the specification language additions in a pull request. The pull request should include:

- The new specification section(s)
- Updates to the relevant grammar rules in `grammar/xDBML.g4`
- At least one new example exercising the construct, or modifications to existing examples
- Updates to the table of contents and any cross-references
- Round-trip test cases in the test corpus

### Step 4: Final review

The pull request goes through standard pull-request review (see above). Maintainers reach rough consensus on acceptance.

Possible outcomes:

- **Accepted** -- merged into the specification for inclusion in the next MINOR version
- **Accepted with modifications** -- merged after the proposer applies requested changes
- **Promoted to experimental** -- merged but gated behind the `experimental:` opt-in clause for a trial period
- **Deferred** -- held for a future minor version, often because related proposals are also under discussion
- **Declined** -- closed with explanation; the discussion thread remains as a reference for future similar proposals

Declined proposals are not failures. Refining what the specification doesn't cover is as important as refining what it does.

## Contributing examples

Examples live in [`/examples/`](./examples/) and follow the conventions described in the examples folder's [`README.md`](./examples/README.md). When contributing a new example:

1. **Choose a domain not already represented.** The README lists specifically desired examples (streaming platforms, content management, multi-tenant SaaS).
2. **Number the file consecutively.** The next file would be `07-`, then `08-`, and so on. Numbering preserves a rough order from simple to complex.
3. **Make it realistic.** Use plausible field names, plausible domain logic, plausible relationships. Avoid `Foo`/`Bar` placeholders.
4. **Note generously.** Use `note:` at the project, container, entity, and field levels to demonstrate the language's documentation capability. Production schemas should be more selective; examples should not.
5. **Make it self-contained.** Each example should parse standalone with no cross-file dependencies.
6. **Identify the features emphasized.** In the project-level `Note`, briefly describe what the example demonstrates that other examples don't.

Submit the example as a pull request. Add a row to the table in the examples [`README.md`](./examples/README.md) describing the new file.

## Contributing to generators, importers, and other tooling

The reference parser and the various generators and importers live in companion repositories under the [`xdbml/`](https://github.com/xdbml) organization. Each has its own `CONTRIBUTING.md` describing its specific build and test conventions; this document covers the specification repository only.

If you've built an xDBML-compatible tool outside the canonical repositories -- a parser in another language, a generator for an unusual target format, an editor plugin -- we'd love to list it in the ecosystem section of the project website. Open an issue or pull request adding it to [`ECOSYSTEM.md`](./ECOSYSTEM.md).

## Style and conventions

### Specification voice

The specification document is reference documentation, not narrative prose. Conventions:

- **Third person, present tense.** "The parser accepts..." not "We accept..."
- **Imperative for normative requirements.** "A conforming implementation must..." not "We recommend that..."
- **Numbered sections with stable identifiers.** Section numbers are part of the cross-reference contract; renumbering is a breaking documentation change.
- **Examples in code fences with the `xdbml` language tag** for syntax highlighting where rendered.

### Markdown style

- Use ATX-style headings (`# Heading`) not setext (`Heading\n=======`).
- One blank line before and after every heading.
- Tables for tabular data (round-trip mappings, keyword tables, etc.).
- Em-dashes (`—`) for parenthetical asides; not double-hyphens (`--`).
- US English spelling (`modeling`, `behavior`, `color`) -- chosen for consistency with the existing specification; do not mix US and UK English within a single document.

### Code examples

xDBML code examples in the specification or in the 5-minute introduction should be:

- Realistic in domain (no `Foo`/`Bar` placeholders in published examples)
- Complete enough to parse standalone, unless explicitly framed as a fragment
- Consistent in indentation (two spaces, not tabs)
- Annotated with `note:` where clarification helps the reader

### Grammar conventions

ANTLR4 grammar files in [`grammar/`](./grammar/) follow ANTLR4 idiomatic style:

- Lexer tokens in `UPPER_SNAKE_CASE`
- Parser rules in `lowerCamelCase`
- Section comments using `// §17.X.Y` to cross-reference specification sections
- Alternatives on separate lines, with the leading `|` aligned

## Recognition

Contributors are recognized in several ways:

- **Git history** -- every commit preserves the author's name and email
- **CHANGELOG entries** -- substantive changes credit the contributor in the changelog
- **Maintainer eligibility** -- sustained substantive contribution over a minimum of six months is the criterion for maintainership (see [`GOVERNANCE.md`](./GOVERNANCE.md), §4.2)
- **Specification acknowledgments** -- Appendix E of the specification credits major contributors

We do not currently maintain an "all contributors" emoji-table or similar -- we may add one if the contributor count grows large enough to warrant it.

## Help and contact

If you have questions that don't fit an issue:

- **General questions and discussion**: open a GitHub issue with the `question` label
- **Security concerns**: email `security@xdbml.org` (private; see [`GOVERNANCE.md`](./GOVERNANCE.md) §9.3)
- **Code of Conduct concerns**: email `conduct@xdbml.org` (private; see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md))
- **Governance questions**: open an issue with the `governance` label

We do not currently maintain a chat platform (Discord, Slack, Matrix). If contributor activity grows enough to justify one, the decision will be made publicly with community input.

---

By contributing to xDBML, you agree that your contributions are licensed under the [Apache License 2.0](./LICENSE) (for specification, grammar, and code) or [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (for examples and documentation), matching the licensing of the project as described in [`GOVERNANCE.md`](./GOVERNANCE.md) §7. By submitting a pull request, you affirm that you have the right to make this contribution under those licenses.

Thank you for contributing to xDBML.
