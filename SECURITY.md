# Security Policy

Typespun handles configuration that may sit close to credentials and other
sensitive values. Please report suspected vulnerabilities privately and avoid
including secrets in examples, logs, screenshots, generated files, or issues.

## Supported versions

Typespun has not published its first release. Security fixes currently target
the latest code on `main`. A release support policy will be documented before
the first stable release.

## Reporting a vulnerability

GitHub private vulnerability reporting is not yet enabled for this repository.
Until it is available, open a public issue titled **Security contact request**
with no vulnerability details, reproduction steps, logs, or sensitive data. A
maintainer will establish a private communication channel.

In the eventual private report, include:

- the affected package and version or commit;
- the expected and observed behavior;
- a minimal, sanitized reproduction;
- the security impact and conditions required to trigger it; and
- any suggested mitigation, if known.

The project aims to acknowledge a report within five business days. Timing for
validation, remediation, and disclosure depends on severity and complexity. We
will coordinate public disclosure with the reporter after a fix or mitigation
is available.

## Security-sensitive areas

Reports are particularly useful for issues involving secret exposure, unsafe
configuration-file or output paths, generated-code injection, unexpected
environment-variable access, dependency compromise, or validation bypasses.

Questions that are not security-sensitive belong in the normal support channels
described in [SUPPORT.md](SUPPORT.md).
