---
title: Feedback & contributing
description: How to report bugs, request features, and contribute to xDBML and the playground.
---

# Feedback & contributing

The playground and xDBML itself are open-source under Apache-2.0. Issues, ideas, and code contributions are welcome. This page covers the practicalities.

## Reporting bugs

For bugs in the playground or in xDBML, [open an issue on GitHub](https://github.com/xdbml/xdbml-spec/issues/new). Useful information to include:

- **What you were doing** when the bug appeared (specific actions, not generalities)
- **What you expected to happen**
- **What actually happened**
- **A shared URL** from the playground's [Share](./sharing-via-url) button, so the bug can be reproduced. URLs include the schema text; if your schema is sensitive, reduce it to the smallest reproducer first.
- **Your browser and OS** if the bug looks display-related or interaction-related

Screenshots help a lot for visual bugs. The dev tools console (F12 in most browsers) sometimes shows useful error messages worth pasting in.

## Requesting features

For features you'd like to see, [open an issue](https://github.com/xdbml/xdbml-spec/issues/new) describing the use case rather than the implementation. A good feature request explains:

- **What you're trying to do** at the level of the underlying goal (not "add button X" but "I want to be able to export the diagram for a slide deck")
- **Why current options don't work** for that goal
- **Anything you'd find unacceptable** in a solution (e.g. "needs to work offline" or "must not require an account")

Feature priority comes from how many people need a thing combined with how clean the design is. Use cases that resonate with multiple people tend to move faster than narrowly-scoped requests. Comment "+1" on existing issues that match what you want, rather than opening duplicates.

The current limitations list at [**Limitations & roadmap**](./limitations-and-roadmap) covers known gaps and the rough direction. If a thing is there already, the relevant issue is probably already open.

## Suggesting language changes

For changes to the xDBML language itself (syntax, semantics, type system), the same GitHub issue tracker is the right place, but the bar is higher. Language changes are versioned, breaking, and have implications for every tool that parses xDBML. Useful framing:

- **What the language can't express today** that you'd want it to
- **Concrete examples** of the syntax you'd want
- **What other languages do** in this area (for reference, not blind copying)
- **Implications for round-tripping**: can existing schemas still be parsed under the proposed change?

Language design discussions happen in the open on the issue tracker. The xDBML project values getting changes right over getting them quickly, so expect feedback and iteration.

## Contributing code

The repository at [github.com/xdbml/xdbml-spec](https://github.com/xdbml/xdbml-spec) contains the specification, the grammar, the parser, and the playground. Pull requests are welcome.

Before opening a substantial PR, it's worth opening an issue first to discuss the approach. This avoids the case where a PR represents significant work that ends up needing a different design. Small fixes (typos, obvious bug fixes, documentation improvements) don't need pre-discussion; just open the PR.

The repository's CONTRIBUTING file (in the repo root) has the detailed contribution mechanics: code style, commit message format, testing expectations, and review process.

## Contributing examples

The bundled examples in the playground are part of the repository. New examples are welcome if they:

- Demonstrate a distinct modeling style or pattern not already covered
- Are reasonably small (under 50 entities)
- Have a clear pedagogical purpose explained in an accompanying write-up
- Use realistic field names and types, not placeholder-style content

The six existing examples in `/examples/` show the expected shape. New examples follow the same conventions.

## Reporting documentation issues

This help section is part of the repository at `playground/help/`. If you spot:

- A factual error
- An unclear explanation
- A broken link
- A missing topic that would help others

The fastest fix is a PR; the second-fastest is an issue. Either way, mention the specific page slug (e.g. `sharing-via-url`) so the right file is easy to find.

## Discussions and questions

For open-ended questions that aren't bug reports or feature requests, use [GitHub Discussions](https://github.com/xdbml/xdbml-spec/discussions) on the same repository. Questions about modeling specific scenarios, language-design rationale, or comparisons to other tools fit there.

If a discussion concludes that something is genuinely a bug or feature gap, it can be promoted to an issue at that point.

## What's next

- [**About xDBML**](./about-xdbml): broader resources for the language.
- [**Limitations & roadmap**](./limitations-and-roadmap): what's on the planned-improvements list.
