---
title: Specification
description: The xDBML specification. v0.5 is the current draft. Apache License 2.0. Backward-compatible additions are MINOR versions; documents declaring a specific version are stable across MINOR and PATCH releases.
---

# xDBML Specification

This is the canonical home of the xDBML specification. xDBML follows [Semantic Versioning](https://semver.org), adapted for a specification: MAJOR.MINOR.PATCH where MAJOR indicates incompatible changes, MINOR indicates backward-compatible additions, and PATCH indicates clarifications. See [GOVERNANCE.md §9](/governance#_9-versioning-and-stability) for the full stability commitments.

## Stable link

[xdbml.org/spec/current](/spec/current) always serves the newest draft. Bookmark it to follow the specification without editing the link each release. Every version keeps its own permanent URL as well, so a citation or a link in an issue can pin the exact text it refers to.

## Available versions

| Version | Status | Released | Notes |
|---------|--------|----------|-------|
| [v0.5](./v0.5) | Draft -- current | 2026 | Adds supertype groups: a `SupertypeGroup` declares a supertype and its subtypes along one axis of specialization, with completeness and exclusivity, inherited attributes and identity, and the materialization strategy intended for physical derivation (§12). Chapters from Edge onward move up by one. Strict superset of v0.4. |
| [v0.4](./v0.4) | Draft -- superseded | 2026 | Adds the foreign master relationship type: a `Ref` may carry a `foreign_master` flag recording where a duplicated attribute of denormalized data is mastered (§11.10), with the derived `fk`/`fm`/`dk`/`dm` attribute roles (§11.12). Strict superset of v0.3. |
| [v0.3](./v0.3) | Draft -- superseded | 2026 | Adds remote module sources: `use`/`reuse` may import a module from an `https://` URL in addition to a relative path (§26.17). Strict superset of v0.2. |
| [v0.2](./v0.2) | Draft -- superseded | 2026 | Adds the module system (`use`/`reuse` directives with optional clone blocks), scalar Named Types, and field-level imports. Strict superset of v0.1. |
| [v0.1](./v0.1) | Draft -- superseded | 2026 | Initial public draft. Documents declaring `xdbml: 0.1` continue to parse correctly with v0.1 semantics under any v0.2+ parser. |

A v1.0 release is planned once the specification has been validated by independent implementations, at least one production deployment, and review by at least one adjacent-standard community. See [GOVERNANCE.md §1](/governance#_1-project-status) for v1.0 release criteria.

## Stability commitments

For documents declaring a specific version (e.g., `xdbml: 0.2` at the top of the file):

- **The behavior of every construct present in that version is preserved** across all subsequent MINOR and PATCH versions of the same MAJOR.
- **Newer parsers must continue to accept older documents** with their original semantics. A `xdbml: 0.1` document parses with v0.1 semantics even under a v0.2+ parser.
- **Documents declaring no version** are treated as DBML 3.13.6 by every xDBML parser, preserving full compatibility with the upstream.

## Choosing a version

If you are writing new xDBML documents, use the latest draft (currently v0.5). If you are reading documents authored elsewhere, the document's first line declares which version's semantics apply.

If you are an implementation author, support the latest version. Support for older versions is automatic if you implement the version declaration mechanism correctly -- versioned semantics are additive.

## Source

Each specification version is maintained as a markdown file in this directory:

- [`v0.5.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.5.md) -- current draft
- [`v0.4.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.4.md) -- superseded
- [`v0.3.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.3.md) -- superseded
- [`v0.2.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.2.md) -- superseded
- [`v0.1.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.1.md) -- superseded

See [CHANGELOG.md](https://github.com/xdbml/xdbml-spec/blob/main/CHANGELOG.md) for what changed between versions.

Substantive changes follow the [contribution process](/contributing#proposing-a-new-specification-construct). Refinements within a published version (typo fixes, ambiguity clarifications) are handled as patch-level updates.
