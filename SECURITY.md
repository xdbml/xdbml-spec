# Security Policy

This document describes how to report security vulnerabilities in the xDBML project and what to expect from the maintainers in response.

## Scope

This policy applies to vulnerabilities discovered in:

- Reference parsers, generators, and importers published in repositories under the github.com/xdbml organization
- The xDBML.org website and its build pipeline
- Tooling published as part of the xDBML project

The specification itself does not typically have security vulnerabilities in the same sense that software does. If a specification ambiguity creates a security risk in implementations (for example, by enabling a parser to be tricked into accepting malicious documents), it is treated under this process.

Vulnerabilities in third-party tools that consume xDBML -- including tools listed on the ecosystem page -- should be reported to their respective maintainers, not through this process.

## Reporting a vulnerability

Please report vulnerabilities privately via one of these channels:

- **Email**: security@xdbml.org
- **GitHub Security Advisory**: https://github.com/xdbml/xdbml-spec/security/advisories/new

Both channels are monitored by the project maintainers. The email channel is preferred for initial contact; the GitHub Security Advisory channel is used for coordinating the fix and disclosure once the report has been triaged.

Please do not report security vulnerabilities through public GitHub issues, social media, or other public channels until a fix has been developed and disclosure has been coordinated.

## What to include in your report

A useful security report typically includes:

- A description of the vulnerability and its potential impact
- The affected component (parser, generator, importer, website, specification ambiguity, etc.) and version
- Steps to reproduce, or a proof-of-concept
- Any suggested mitigation, if you have one
- Whether you want to be credited publicly when disclosure happens

We accept reports in English. Reports in other languages may take longer to triage.

## What to expect from us

Upon receiving a security report, the maintainers commit to:

1. **Acknowledge receipt within 72 hours.** You will receive a response confirming the report has been received and is being triaged.

2. **Provide an initial assessment within seven days.** The assessment will indicate whether the report has been confirmed, requires more information, or is determined to be out of scope.

3. **Coordinate on a disclosure timeline.** For confirmed vulnerabilities, we will work with you to agree on a disclosure timeline appropriate to the severity. We default to a 90-day disclosure window from the date of confirmation, with flexibility in either direction based on severity, complexity of the fix, and reporter preferences.

4. **Develop and test a fix.** Maintainers will develop a fix in a private branch and coordinate testing.

5. **Release the fix and publish an advisory.** Once the fix is ready, it is released through normal channels with an accompanying security advisory describing the vulnerability, affected versions, and mitigation.

6. **Credit the reporter** in the advisory, if they have indicated they want to be credited.

## Out-of-scope reports

The following are typically not treated as security vulnerabilities:

- Issues in third-party dependencies of reference implementations (report these upstream)
- Theoretical vulnerabilities without a demonstrated impact
- Vulnerabilities in tools that are not part of the canonical xDBML project
- Best-practice suggestions that are not tied to a specific exploitable issue
- Reports of behavior that matches the documented specification

We may decline to treat a report as a security issue while still acknowledging it as a useful contribution. In such cases, we will explain the reasoning and suggest the appropriate channel.

## Public disclosure

Once a fix is released, the security advisory is published on the project's GitHub Security Advisories page and announced in the release notes. We do not maintain a separate security mailing list at this stage; subscribing to GitHub release notifications for the project is the recommended way to stay informed.

## No bug bounty program

The xDBML project does not currently offer monetary rewards for security reports. We deeply appreciate responsible disclosure and will credit reporters in advisories, but we cannot offer financial compensation at this stage of the project's lifecycle. If the project transitions to a foundation with funding for a bug bounty program, this policy will be updated.

## Acknowledgments

Researchers and reporters who have contributed to xDBML security through responsible disclosure are credited in the affected security advisories on GitHub.
