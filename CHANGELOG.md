# Changelog

All notable changes to `typespun` and `typespun-codegen` are recorded here.
Both packages are versioned and published together.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Typespun is pre-1.0: minor versions may contain breaking changes, and the
generated-module ABI is versioned separately by `GeneratedSchema.protocolVersion`.

## [Unreleased]

## [0.1.5] - 2026-09-22

### Fixed

- The publish workflow treats an `E409` conflict as success. Its skip guard
  reads `npm view`, but the registry does not offer read-your-writes: a run
  ninety seconds after `0.1.3` went out still saw `0.1.2`, tried to republish
  and failed the build. Every other publish error still fails.

### Changed

- The npm package pages point at the documentation site. The playground moved
  from GitHub Pages into the site at `/playground`, so the old link is dead in
  the `0.1.4` tarballs; a package page can only be corrected by publishing.

### Documentation

- The object `loadConfig()` returns has a null prototype at every level, so
  `config.server.hasOwnProperty(...)` throws while `Object.hasOwn`, spreading
  and `JSON.stringify` all work. This is a prototype-pollution defence and was
  previously undocumented.
- Running a `.ts` entry point directly on Node.js cannot resolve the
  generated module, because type stripping does not rewrite the `.js`
  specifier. Compiling first, or using Bun, both work. Decorated classes need
  a TypeScript-aware runtime regardless.

## [0.1.4] - 2026-09-22

### Fixed

- The npm package pages. `0.1.3` published from a tree that predated the
  README updates, so the registry documented `formatConfigError` and the
  `typespun/schema` subpath nowhere and still claimed Node.js 22 or 24. The
  only way to correct an npm package page is to publish again; no code
  changed between `0.1.3` and `0.1.4`.

## [0.1.3] - 2026-09-22

### Added

- `formatConfigError(error, { heading? })`, exported from `typespun`, renders a
  `ConfigError` as indented lines for stderr. Building real Hono and Fastify
  servers against the package produced the same hand-written loop over `issues`
  in both, so it belongs in the package. It is secret-safe by construction: the
  resolver already drops `received` and replaces the message for fields marked
  secret, so there is nothing left for the formatter to redact.
- A `typespun/schema` subpath exporting the schema types and
  `validateTypedValue`. The analyzer previously imported that one pure function
  from `typespun/generated`, which also carries the runtime resolver and its
  inlined dotenv reader, so any browser bundle of the code generator pulled in
  `fs` and `dotenv` to get a switch statement. `typespun/generated` still
  re-exports `validateTypedValue`, so the generated-module ABI is unchanged.
- `typespun.json` accepts and ignores a `$schema` key, so the file can carry
  editor completion the way `tsconfig.json` does.

### Changed

- Environment values for array fields report the accepted form:
  `Expected a JSON array of string, for example ["a","b"]` rather than
  `Expected an array of string`. Comma-separated is what most people try first
  in a 12-factor deployment and nothing pointed at the required syntax. Typed
  overrides and compiled defaults are unaffected — their values are already
  parsed, so their message stays JSON-agnostic.

## [0.1.2] - 2026-09-21

First release with corrected version ordering: `latest` now sorts above every
published version.

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

[Unreleased]: https://github.com/omkar273/typespun/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/omkar273/typespun/releases/tag/v0.1.5
[0.1.4]: https://github.com/omkar273/typespun/releases/tag/v0.1.4
[0.1.3]: https://github.com/omkar273/typespun/releases/tag/v0.1.3
[0.1.2]: https://github.com/omkar273/typespun/releases/tag/v0.1.2
[0.0.9]: https://github.com/omkar273/typespun/releases/tag/v0.0.9
[0.0.8]: https://github.com/omkar273/typespun/releases/tag/v0.0.8
[0.0.7]: https://github.com/omkar273/typespun/releases/tag/v0.0.7
[0.1.1]: https://www.npmjs.com/package/typespun/v/0.1.1
[0.1.0]: https://www.npmjs.com/package/typespun/v/0.1.0
[0.0.4]: https://www.npmjs.com/package/typespun/v/0.0.4
