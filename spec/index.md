# xDBML Specification

This is the canonical home of the xDBML specification. xDBML follows [Semantic Versioning](https://semver.org), adapted for a specification: MAJOR.MINOR.PATCH where MAJOR indicates incompatible changes, MINOR indicates backward-compatible additions, and PATCH indicates clarifications. See [GOVERNANCE.md §9](/governance#_9-versioning-and-stability) for the full stability commitments.

## Available versions

| Version | Status | Released | Notes |
|---------|--------|----------|-------|
| [v0.1](./v0.1) | Draft — current | 2026 | Initial public draft. Specification surface stable in design; refinements expected based on early-adopter feedback. |

A v1.0 release is planned once the specification has been validated by independent implementations, at least one production deployment, and review by at least one adjacent-standard community. See [GOVERNANCE.md §1](/governance#_1-project-status) for v1.0 release criteria.

## Stability commitments

For documents declaring a specific version (e.g., `xdbml: 0.1` at the top of the file):

- **The behavior of every construct present in that version is preserved** across all subsequent MINOR and PATCH versions of the same MAJOR.
- **Newer parsers must continue to accept older documents** with their original semantics.
- **Documents declaring no version** are treated as DBML 3.13.6 by every xDBML parser, preserving full compatibility with the upstream.

## Choosing a version

If you are writing new xDBML documents, use the latest draft (currently v0.1). If you are reading documents authored elsewhere, the document's first line declares which version's semantics apply.

If you are an implementation author, support the latest version. Support for older versions is automatic if you implement the version declaration mechanism correctly — versioned semantics are additive.

## Source

Each specification version is maintained as a markdown file in this directory:

- [`v0.1.md`](https://github.com/xdbml/xdbml/blob/main/spec/v0.1.md) — current draft

Substantive changes follow the [contribution process](/contributing#proposing-a-new-specification-construct). Refinements within a published version (typo fixes, ambiguity clarifications) are handled as patch-level updates.
