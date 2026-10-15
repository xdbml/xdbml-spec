---
title: Specification
description: The xDBML specification. v0.7 is the current draft. Apache License 2.0. Backward-compatible additions are MINOR versions; documents declaring a specific version are stable across MINOR and PATCH releases.
---

# xDBML Specification

This is the canonical home of the xDBML specification. xDBML follows [Semantic Versioning](https://semver.org), adapted for a specification: MAJOR.MINOR.PATCH where MAJOR indicates incompatible changes, MINOR indicates backward-compatible additions, and PATCH indicates clarifications. See [GOVERNANCE.md §9](/governance#_9-versioning-and-stability) for the full stability commitments.

## Stable link

[xdbml.org/spec/current](/spec/current) always serves the newest draft. Bookmark it to follow the specification without editing the link each release. Every version keeps its own permanent URL as well, so a citation or a link in an issue can pin the exact text it refers to.

## Available versions

| Version | Status | Released | Notes |
|---------|--------|----------|-------|
| [v0.7](./v0.7) | Draft -- current | 2026 | Reads DBML 10.3.1. Records: a column list on records inside an entity, an `example` flag for rows that illustrate the data, and empty fields that read as null (§26); an entity holds one records block, as in DBML, and in documents declaring v0.6 or an earlier version a second block draws a warning, so every v0.6 document remains valid. Relationships: the `?` marks of DBML make an end optional (§11.1), and a nullable foreign key makes the parent end optional (§11.8). Metadata: DBML's custom properties, and `Metadata` blocks that set a note, a color and custom properties on an element declared elsewhere (§24.5, §24.7). Sticky notes: a named `Note` is an annotation drawn on the diagram with its Markdown text, its `color` and custom properties as in DBML, at the top level or in a Container that carries it; an unnamed top-level `Note` is the note of the project (§19). Data lineage: DBML's `Dep` records which entity, View or field is computed from which, drawn as a curve (§27). Modules: specifiers resolve as in DBML, `auth` as `./auth`, with a fallback to `.dbml` files and a host mapping such as `@shared/users` (§28.13). The v0.7.1 point release names the partials and groups of chapter 17 `EntityPartial` and `EntityGroup`, with the DBML keywords as aliases (§17.3), and the diagram view categories `Entities` and `EntityGroups` (§18.1); `color` sets the header color of an entity in a document that declares a version (§7.5); a quoted key with the `x-` prefix marks a custom property as `x_` does (§24.5), and a diagram view takes custom properties of any name, as every other element does (§18.1). The v0.7.2 point release lets a `Dep` specify how a target is loaded, with a `transformation` on each dependency, several upstream ends on one line and the statement that loads the target in `source_query`, so that it serves as a source-to-target mapping (§27.10); a metric is a field of a View computed at query time, whose lineage a `Dep` may state (§27.11); and an entity states its `grain` (§7.5). |
| [v0.6](./v0.6) | Draft -- superseded | 2026 | Adds constraints: a `constraints { }` block declares the primary key, unique keys and check expressions of an entity, each with an optional constraint name; keys may be composite and, in document stores, nested (§10). Check expressions are written in single quotes, with backticks as an alias. A referential relationship must reference a key of an entity that declares keys, for relational targets and logical models (§11.17). Every v0.5 document remains valid: in documents declaring earlier versions, a parser reports the new rules on older constructs as warnings. |
| [v0.5](./v0.5) | Draft -- superseded | 2026 | Adds supertype groups: a `SupertypeGroup` declares a supertype and its subtypes along one axis of specialization, with completeness and exclusivity, inherited attributes and identity, and the materialization strategy intended for physical derivation (§12). Chapters from Edge onward move up by one. Strict superset of v0.4. |
| [v0.4](./v0.4) | Draft -- superseded | 2026 | Adds the foreign master relationship type: a `Ref` may carry a `foreign_master` flag recording where a duplicated attribute of denormalized data is mastered (§11.10), with the derived `fk`/`fm`/`dk`/`dm` attribute roles (§11.12). Strict superset of v0.3. |
| [v0.3](./v0.3) | Draft -- superseded | 2026 | Adds remote module sources: `use`/`reuse` may import a module from an `https://` URL in addition to a relative path (§26.17). Strict superset of v0.2. |
| [v0.2](./v0.2) | Draft -- superseded | 2026 | Adds the module system (`use`/`reuse` directives with optional clone blocks), scalar Named Types, and field-level imports. Strict superset of v0.1. |
| [v0.1](./v0.1) | Draft -- superseded | 2026 | Initial public draft. Documents declaring `xdbml: 0.1` continue to parse correctly with v0.1 semantics under any v0.2+ parser. |

A v1.0 release is planned once the specification has been validated by independent implementations, at least one production deployment, and review by at least one adjacent-standard community. See [GOVERNANCE.md §1](/governance#_1-project-status) for v1.0 release criteria.

## Stability commitments

For documents declaring a specific version (e.g., `xdbml: 0.2` at the top of the file):

- **The behavior of every construct present in that version is preserved** across all subsequent MINOR and PATCH versions of the same MAJOR.
- **Newer parsers must continue to accept older documents** with their original semantics. A `xdbml: 0.1` document parses with v0.1 semantics even under a v0.2+ parser.
- **Documents declaring no version** are treated as DBML 10.3.1 by every xDBML parser, preserving full compatibility with the upstream.

## Choosing a version

If you are writing new xDBML documents, use the latest draft (currently v0.7). If you are reading documents authored elsewhere, the document's first line declares which version's semantics apply.

If you are an implementation author, support the latest version. Support for older versions is automatic if you implement the version declaration mechanism correctly -- versioned semantics are additive.

## Source

Each specification version is maintained as a markdown file in this directory:

- [`v0.7.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.7.md) -- current draft
- [`v0.6.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.6.md) -- superseded
- [`v0.5.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.5.md) -- superseded
- [`v0.4.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.4.md) -- superseded
- [`v0.3.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.3.md) -- superseded
- [`v0.2.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.2.md) -- superseded
- [`v0.1.md`](https://github.com/xdbml/xdbml-spec/blob/main/spec/v0.1.md) -- superseded

See [CHANGELOG.md](https://github.com/xdbml/xdbml-spec/blob/main/CHANGELOG.md) for what changed between versions.

Substantive changes follow the [contribution process](/contributing#proposing-a-new-specification-construct). Refinements within a published version (typo fixes, ambiguity clarifications) are handled as patch-level updates.
