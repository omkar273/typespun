# Changelog

All notable changes to `typespun` and `typespun-codegen` are recorded here.
Both packages are versioned and published together.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Typespun is pre-1.0: minor versions may contain breaking changes, and the
generated-module ABI is versioned separately by `GeneratedSchema.protocolVersion`.

## [Unreleased]

### Changed

- `engines.node` relaxed from `">=22 <23 || >=24 <25"` to `">=22"`. The previous
  range excluded Node.js 25 and Node.js 26, and Node.js 26 became the Current
  release line on 2026-09-16. The full test suite and the packed-consumer suite
  pass on Node.js 26.8.1. CI now covers Node.js 22, 24, and 26.
- npm package descriptions and keywords now name the problem domain
  (configuration, environment variables, dotenv) rather than only the tool.

### Added

- npm provenance attestations are published from CI.

## [0.0.9] - 2026-09-14

### Fixed

- The legacy `typespun-codegen` executable name is accepted again, so projects
  scaffolded before the binary split keep working.

## [0.0.8] - 2026-09-14

### Changed

- The CLI binaries are disambiguated between the runtime and the generator:
  `typespun-codegen` ships the generator executable, and `typespun` provides the
  short wrapper command when the runtime is installed.

### Fixed

- Packages are built before `npm publish`, so published tarballs contain `dist`.

## [0.0.7] - 2026-09-13

### Added

- `typespun` exposes the CLI wrapper, and `typespun init` gained interactive
  prompts.

## [0.1.1], [0.1.0] - 2026-09-13 — withdrawn

These two versions were published from an incomplete release pipeline before
the `0.0.x` line, and they sort **above** the current `latest` tag. `0.1.1`
contains 3 files (7 KB) and `0.1.0` contains 13 files; neither carries a
complete `dist`. Installing either one — which `npm install typespun@^0.1`
would do — does not give a working package.

Both are deprecated on npm. Use `0.1.2` or later.

## [0.0.4] - 2026-09-13

First publish with a usable `dist` for both packages: schema analysis, the
`init` / `generate` / `check` CLI, deterministic loader emission, and the
runtime resolver with fixed source precedence, aggregated `ConfigError`
diagnostics, and secret-aware redaction.

[Unreleased]: https://github.com/omkar273/typespun/compare/v0.0.9...HEAD
[0.0.9]: https://github.com/omkar273/typespun/releases/tag/v0.0.9
[0.0.8]: https://github.com/omkar273/typespun/releases/tag/v0.0.8
[0.0.7]: https://github.com/omkar273/typespun/releases/tag/v0.0.7
[0.1.1]: https://www.npmjs.com/package/typespun/v/0.1.1
[0.1.0]: https://www.npmjs.com/package/typespun/v/0.1.0
[0.0.4]: https://www.npmjs.com/package/typespun/v/0.0.4
