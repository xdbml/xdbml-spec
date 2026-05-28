---
title: About xDBML
description: Resources for learning the xDBML language itself, beyond the playground.
---

# About xDBML

The playground is a tool for working with xDBML, not a tutorial on the language itself. If you want to learn what xDBML is, how to read its syntax, or what it's good for as a data-modeling notation, the resources below are the right places.

## What xDBML is, in one line

xDBML is a polyglot, vendor-neutral data-modeling language: one syntax for describing schemas across relational, document, graph, key-value, and time-series storage technologies. It builds on [DBML](https://dbml.dbdiagram.io) (a popular open language for relational schemas) and extends it with first-class support for containers, nested types, polymorphism, and reference data.

## Where to learn

**[The 5-minute introduction](https://xdbml.org/learn/)** is the quickest way in. Reads in five minutes; covers the core concepts and the basic syntax. If you've used DBML before, much of it will feel familiar; the introduction calls out the additions.

**[The specification](https://xdbml.org/spec/v0.1)** is the authoritative reference. Goes section by section through the grammar, the type system, settings, references, and edge cases. The current version is the v0.1 draft; the specification page links to all versions as they're published.

**[The grammar](https://xdbml.org/grammar/)** is the formal ANTLR4 definition of the language. Useful if you're building tools that need to parse xDBML, or if you want absolute precision about what is and isn't accepted by the parser.

**[The examples gallery](https://xdbml.org/examples/)** has longer write-ups for each of the six bundled examples plus additional patterns. Each example explains why specific modeling decisions were made, which is often more useful than reading the spec.

**[The FAQ](https://xdbml.org/faq)** answers common questions about the language, the project's relationship to DBML, and the project's positioning relative to other modeling notations.

## How the playground relates to xDBML

The playground is one tool among several that work with xDBML; the language exists independently of any particular tool. The playground's specific role:

- **Interactive authoring**: a low-friction way to write xDBML and see it visualized
- **Teaching and demonstration**: a shareable, no-install starting point for tutorials and documentation
- **Schema visualization**: a fast way to produce diagrams of xDBML schemas

It is NOT a code generator (xDBML targets are produced by other tools), not a project workspace (no multi-file or multi-schema management), and not a full IDE. Heavier authoring workflows are served by [Hackolade Studio](https://hackolade.com) and similar tools.

## The project

xDBML is open-source under Apache-2.0. The repository at [github.com/xdbml/xdbml-spec](https://github.com/xdbml/xdbml-spec) holds the specification, grammar, parser, and this playground. Issues and discussions happen on GitHub; see [**Feedback & contributing**](./feedback-and-contributing) for how to participate.

The project is sponsored by [Hackolade](https://hackolade.com), which uses xDBML internally and benefits from its adoption. The specification itself is intended to be vendor-neutral and to evolve through community input.

## What's next

- [**Feedback & contributing**](./feedback-and-contributing): how to get involved.
- [**Limitations & roadmap**](./limitations-and-roadmap): what the playground does and doesn't do.
