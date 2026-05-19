---
title: Governance
description: How xDBML is governed. Current stewardship by Hackolade, path to neutral foundation governance, decision-making process, the relationship with DBML upstream, and stability commitments.
---

# Governance

This document describes how the xDBML project is currently governed, how decisions are made, how changes are proposed and accepted, and the intended trajectory toward neutral foundation governance. It is intentionally specific about the current state — xDBML is a draft v0.1 specification stewarded by a single organization, and the governance model reflects that lifecycle stage honestly rather than overclaiming institutional maturity that does not yet exist.

This document will evolve as the project matures. Substantive changes to governance follow the same proposal and review process as substantive changes to the specification.

## 1. Project status

xDBML is currently a **draft pre-stable specification**, on the path toward v1.0. The implications:

- Specification surface area is stable in design but subject to refinement based on early-adopter feedback.
- Backward compatibility is preserved across MINOR versions (per the version-declaration mechanism in §4 of the specification).
- Experimental features may be introduced and changed without backward-compatibility guarantees, gated by the explicit `experimental:` opt-in clause.
- v1.0 will be declared when the specification has been validated by independent implementations, at least one production deployment, and review by at least one adjacent-standard community (ODCS, OSI, Avro, or similar).

The project does not yet have a formal release cadence. Patch versions are issued as needed to correct ambiguities and typographic errors. Minor versions are anticipated annually as the language gains constructs in response to community feedback.

## 2. Stewardship model

The xDBML specification is currently **stewarded by Hackolade** (IntegrIT SA/NV dba Hackolade, a Belgian company), the principal designer and contributor at this stage. Stewardship in this context means:

**What Hackolade does:**

- Maintains the canonical specification repository at `github.com/xdbml/xdbml-spec`.
- Reviews and accepts contributions via pull request.
- Coordinates with the DBML upstream maintainers at Holistics on matters affecting compatibility.
- Funds the canonical hosting (xdbml.org, playground.xdbml.org), the reference implementations, and the integration generators.
- Represents xDBML to adjacent-standard communities (ODCS, OSI, JSON Schema, OpenAPI working groups).

**What Hackolade does not do:**

- Restrict the specification's use. xDBML is permanently Apache License 2.0; this license cannot be revoked retroactively, and any v0.1 document or implementation is permanently safe regardless of future governance decisions.
- Make decisions in private. Material decisions (new constructs, breaking changes, governance evolution) are discussed openly on the project's issue tracker and decided in public pull requests.
- Restrict implementation. Anyone may build parsers, generators, importers, or other tools for xDBML without permission, payment, or notification.

The stewardship model is intended to be transitional. The project is structured to allow migration to a neutral foundation without disruption to users (see §6).

### 2.1 Domain ownership

The xDBML domain names (`xdbml.org`, `xdbml.io`, and `xdbml.com`) are currently registered to Pascal Desmarets personally, in his capacity as the founder of the project. The domains are operated for the benefit of the xDBML project and used under an informal license from the registrant to the project.

This arrangement reflects practical reality at the project's early stage rather than long-term intent. The domains will be transferred to the project steward (currently Hackolade) or directly to the receiving foundation as part of the eventual transition to neutral governance (see §6). The Apache 2.0 license on the specification, the trademark policy described in §7, and the project's openness commitments described elsewhere in this document apply identically regardless of who currently holds the domain registrations.

Anyone using the specification, building tools, or contributing to the project does so under the licensing and governance terms described in this document. The domain-ownership detail is recorded here for transparency and does not create any additional obligations, rights, or restrictions.

## 3. Decision-making

Decisions about the specification follow a tiered process based on the scope of the change.

### 3.1 Editorial changes

Corrections to typographic errors, clarifications of existing wording, fixes to broken cross-references, and similar non-substantive edits are accepted by any project maintainer through standard pull-request review. No formal proposal process is required.

### 3.2 Specification refinements

Refinements that do not change the meaning of any existing construct but clarify edge cases, add worked examples, or improve error messages and grammar specifics require maintainer review and at least one second-maintainer approval before merge.

### 3.3 New constructs and feature proposals

Proposals that add new constructs, new settings, new keywords, or new round-trip targets to the specification follow an extended review process:

1. **Proposal**: a contributor opens a GitHub issue describing the proposed change, the motivation, the syntax, and at least one worked example.
2. **Discussion**: the issue is discussed openly. Adjacent-standard implications, target-format round-trip behavior, and backward compatibility are addressed during this phase. A two-week minimum discussion period applies before a proposal can be advanced.
3. **Draft specification**: the proposer (or a maintainer) drafts the proposed language additions in a pull request against the specification.
4. **Review**: the pull request is reviewed by maintainers and by the community. Substantive concerns must be resolved before merge.
5. **Decision**: the maintainers reach rough consensus on acceptance. Proposals may be accepted, accepted with modifications, deferred to a future minor version, marked as experimental for a trial period, or declined with explanation.

A proposal may be moved to **experimental status** (per §4.2 of the specification) rather than directly accepted into the stable feature set. This is the preferred path for proposals where real-world usage data would inform refinement.

### 3.4 Breaking changes

Changes that would invalidate existing v0.1 documents or change their semantics require a MAJOR version bump and substantially higher consensus. Breaking changes are expected to be rare and well-justified; the project's commitment to backward compatibility within a MAJOR version line is a primary stability promise to adopters.

A breaking change requires:

- Documentation of why a non-breaking alternative is not feasible.
- A migration path for affected documents.
- A minimum six-month deprecation window during which both old and new forms are accepted.
- Approval from a supermajority of maintainers.

### 3.5 Governance changes

Changes to this governance document follow the same process as new specification constructs (§3.3), with the additional requirement of explicit approval from the steward organization while stewardship remains active.

## 4. Roles

The project recognizes three roles:

### 4.1 Contributors

Anyone who participates in the project — opening issues, commenting on proposals, submitting pull requests, building generators or importers, writing examples, reporting bugs — is a contributor. Contribution does not require formal affiliation, employment by Hackolade, or any prior approval.

### 4.2 Maintainers

Maintainers are individuals with commit access to the canonical repositories. Maintainers review pull requests, participate in proposal discussions, and are responsible for the quality and consistency of accepted changes.

Initial maintainership rests with Hackolade staff. Maintainers from outside Hackolade are added based on sustained substantive contribution over a minimum of six months. The current list of maintainers is published in `MAINTAINERS.md` at the repository root.

Maintainership is a working role, not a status. Inactive maintainers (no review or contribution activity for twelve months) are moved to emeritus status, retaining read access and recognition but releasing commit rights to active maintainers.

### 4.3 Editors

Editors are responsible for the prose quality, consistency of voice, and structural integrity of the specification document specifically. Editorial role is separate from maintainership: a maintainer may or may not also serve as an editor.

The role of editor exists because language specifications are read documents — readability, internal consistency, and editorial discipline matter as much as technical correctness. Editors hold the line against scope creep, inconsistent terminology, and overweight prose.

## 5. Relationship with DBML upstream

xDBML is a strict superset of [DBML 3.13.6](https://dbml.dbdiagram.io), the Database Markup Language designed and maintained by [Holistics](https://www.holistics.io) under Apache License 2.0.

The relationship between the two projects is intended to be cooperative, not competitive. The xDBML project commits to:

- **Compatibility**: every valid DBML document remains a valid xDBML document at the lowest compatibility level (no version declaration). This compatibility is preserved across all MINOR and PATCH versions of xDBML.
- **Coordination**: when DBML upstream introduces constructs that overlap with xDBML extensions, the xDBML project will adapt to preserve compatibility, including by deprecating its own forms if needed. The version-declaration mechanism (§4 of the specification) is the technical means by which collision events are managed.
- **Attribution**: the DBML lineage is acknowledged in the specification (§1.1 and Appendix D), in the README, and in every artifact derived from xDBML.
- **Contribution upstream**: where xDBML extensions are general enough to belong in DBML itself, the xDBML maintainers will propose them upstream to Holistics for inclusion. Such proposals are not preconditioned on Holistics accepting them; xDBML extensions are valid regardless of their upstream status.

xDBML does not claim to be the canonical DBML successor, the official extension mechanism, or the recommended DBML evolution path. It is one of potentially many extension efforts; its credibility rests on technical merit, ecosystem adoption, and the quality of its coordination with the upstream, not on claims of authority.

The Holistics team has no obligation to participate in xDBML governance or to coordinate with the xDBML maintainers. If at any point Holistics objects to the xDBML name, branding, or relationship framing, the xDBML maintainers commit to engaging in good-faith dialogue to resolve the concern.

## 6. Path to neutral governance

The xDBML project is structured with the explicit intent of moving to neutral foundation governance once the project demonstrates sufficient adoption and ecosystem alignment to make such a move appropriate.

### 6.1 Why neutral governance is the goal

A single-vendor-stewarded specification has structural limitations:

- Adopters reasonably worry about steward priorities diverging from community priorities.
- Adjacent standards bodies (ODCS, OSI, JSON Schema) are easier to coordinate with when xDBML carries similar institutional weight.
- Long-term continuity of the specification is more credible under a foundation than under any single company.

Neutral governance does not solve every concern, but it is the standard institutional pattern for open specifications that survive beyond their founders.

### 6.2 Criteria for advancing

The xDBML project will pursue transition to neutral governance when the following conditions are met:

- **Independent implementations**: at least three independent implementations of the parser and generators exist in different programming language ecosystems.
- **Production adoption**: at least five organizations report production use of xDBML at conference or community forum venues.
- **Ecosystem coordination**: formal coordination relationships are established with at least two adjacent-standard communities (candidates: Bitol/ODCS, Open Semantic Interchange, Avro, JSON Schema).
- **Maintainer diversity**: at least three maintainers exist outside Hackolade, representing different organizations.

These are guideposts rather than rigid requirements. Substantial progress on most of them suffices.

### 6.3 Candidate foundations

The project has not committed to a specific destination foundation. Candidates under consideration:

- **The Linux Foundation** — broad scope, hosts Bitol/ODCS and many open data-infrastructure standards
- **The OpenJS Foundation** — natural fit if xDBML's reference implementations remain JavaScript/TypeScript-led
- **Apache Software Foundation** — strong governance reputation, longer incubation path
- **A new dedicated foundation** — possible but unlikely; xDBML does not warrant its own foundation absent extraordinary growth

The decision will be made publicly, with community input, when the criteria above are met.

### 6.4 What transition looks like

Transition to neutral governance involves:

- **Trademark transfer**: the xDBML name and logo are transferred to the receiving foundation.
- **Repository transfer**: the canonical GitHub organization moves from `xdbml/` (currently administered by Hackolade) to the foundation's namespace.
- **Maintainer adjustment**: the maintainer roster is reviewed; the receiving foundation may have governance requirements that affect role assignments.
- **License preservation**: Apache 2.0 licensing is preserved across the transition. No relicensing event will occur.
- **Branding update**: documentation, websites, and integrations update to reflect the new governance home.

The transition is intentionally designed to be invisible to adopters. Existing documents, parsers, and integrations continue to work without modification. The change is institutional, not technical.

## 7. License and trademark

### 7.1 Specification license

The xDBML specification is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). This license:

- Permits any use, including commercial use.
- Permits derivative works, including non-Apache-licensed derivatives.
- Includes an explicit patent grant from contributors.
- Cannot be revoked retroactively for any version that has been released.

The license applies to the specification document, the grammar files, the example documents, the reference parsers, and the integration generators in this project.

### 7.2 Documentation and examples license

Documentation and example documents are dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), permitting unrestricted reuse without attribution.

### 7.3 Trademark

The xDBML name and the polyglot-fanout logo are trademarks of IntegrIT SA/NV (dba Hackolade) for the duration of stewardship. Permitted uses:

- Referring to the specification by name in documentation, articles, talks, and other contexts.
- Using the logo to indicate that a tool, document, or integration is xDBML-compatible.
- Using the logo in unmodified form for educational and informational purposes.

Prohibited uses:

- Using the xDBML name in a way that suggests endorsement of a product that has not been certified as xDBML-compatible.
- Modifying the logo in ways that could create confusion about its identity.
- Using the xDBML name as part of a product name without explicit permission.

Trademark policy is intentionally permissive but exists. On transition to neutral governance, trademark ownership transfers to the receiving foundation along with the corresponding policy.

## 8. Code of conduct and conflict resolution

### 8.1 Code of conduct

The project follows the [Contributor Covenant](https://www.contributor-covenant.org), version 2.1, with the customary commitment to an inclusive, respectful environment for all contributors regardless of background, affiliation, or experience level.

The full text is available at `CODE_OF_CONDUCT.md` in the repository root. Violations may be reported to `conduct@xdbml.org` (a private mailbox monitored by maintainers); reports are handled confidentially.

### 8.2 Conflict resolution

Disagreements about specification design, governance, or community matters follow this escalation path:

1. **Direct discussion**: parties involved attempt to resolve the disagreement directly through normal review and discussion channels.
2. **Maintainer mediation**: if direct discussion does not resolve the matter, any maintainer may mediate, gathering input and facilitating a decision.
3. **Maintainer vote**: for unresolved substantive disagreements, the maintainer group votes. Simple majority decides ordinary matters; supermajority (two-thirds) decides breaking changes per §3.4.
4. **Steward decision**: while stewardship rests with Hackolade, the steward retains final authority on matters that cannot be resolved through the above mechanisms. On transition to neutral governance, this final-authority role transfers to the receiving foundation's structure.

The steward-decision step is expected to be used rarely. Its existence is a backstop, not a routine governance mechanism.

## 9. Versioning and stability

The xDBML specification follows [Semantic Versioning](https://semver.org) with the conventions adapted for a specification rather than a software library:

- **MAJOR** version: incompatible specification changes that would invalidate existing v0.1 documents or change their semantics.
- **MINOR** version: backward-compatible additions of constructs, settings, or keywords.
- **PATCH** version: clarifications, error corrections, and editorial improvements that do not change the language's behavior.

### 9.1 Stability commitments

For documents declaring a specific version (e.g., `xdbml: 0.1`):

- The behavior of every construct present in that version is preserved across all subsequent MINOR and PATCH versions of the same MAJOR.
- Newer parsers must continue to accept documents declaring older MINOR versions, with their original semantics.
- Documents declaring no version are treated as DBML 3.13.6 by every xDBML parser, preserving full compatibility with the upstream.

### 9.2 Deprecation policy

Constructs deprecated in a MINOR version are retained but documented as deprecated for at least one full MAJOR version cycle (a minimum of one year, in practice longer). Deprecated constructs may be removed in the next MAJOR version after the deprecation cycle completes.

### 9.3 Security disclosures

Vulnerabilities in reference implementations (the parser, generators, importers) may be disclosed privately to `security@xdbml.org`. The maintainers commit to:

- Acknowledging receipt within 72 hours.
- Coordinating with the reporter on a disclosure timeline appropriate to the severity.
- Issuing fixes through normal release channels with appropriate advisory text.

Specifications themselves do not typically have security vulnerabilities in the same sense as software does, but if a specification ambiguity creates a security risk in implementations, it is treated under this process.

## 10. Funding and resources

Hackolade currently funds the project's operational costs, including:

- Canonical site hosting (xdbml.org)
- Playground infrastructure (playground.xdbml.org)
- Reference implementation development
- Generator and importer development for target formats listed in the specification

This funding commitment is open-ended; Hackolade is not obligated to continue indefinitely, but no funding cliff is planned. On transition to neutral governance, funding arrangements may evolve. The project does not currently accept external sponsorship; if the project moves to a foundation, sponsorship structures will follow the foundation's conventions.

The project does not currently employ paid maintainers or contributors. Maintainer work is volunteer or employer-supported, the latter primarily through Hackolade. Contributions from employees of other organizations are welcome and recognized identically to contributions from any other source.

---

**Questions or feedback** about governance may be raised by opening an issue in the [main repository](https://github.com/xdbml/xdbml-spec) with the `governance` label.

**This document was last updated** alongside the release of the v0.1 specification. Substantive changes follow the process described in §3.5.
