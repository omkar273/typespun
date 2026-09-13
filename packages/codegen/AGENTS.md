# `typespun-codegen` contributor guidance

## Scope

- Keep TypeScript analysis, generation orchestration, project/configuration
  loading, and the `typespun` CLI in this package.
- Keep runtime loading, coercion, validation errors, and inert decorators in
  `packages/typespun`. Generated modules may depend on the documented
  `typespun/generated` ABI; compiler internals must not leak into runtime code.
- The package root currently has no supported programmatic compiler API. Do not
  export internal analyzer, emitter, project, or CLI modules without an explicit
  public-API decision and matching package tests and documentation.

## Boundaries

- `src/analyzer/` converts a real TypeScript program and exactly one marked,
  exported root declaration into diagnostics plus location-bearing IR. Keep
  TypeScript symbol/type reasoning here; do not make it emit source text or
  perform filesystem writes.
- `src/emitter/` converts validated, portable inputs into canonical generated
  source and fingerprints. Keep ordering, quoting, import-specifier selection,
  and serialization deterministic and independent of machine-specific absolute
  paths.
- `src/project/` owns `typespun.json`, conventional-file discovery,
  `tsconfig.json` resolution, and JSON/YAML defaults parsing and policy. Paths
  from an explicit configuration file resolve relative to that file.
- `src/generate.ts` is the orchestration boundary: load the project, create the
  TypeScript program, analyze, compile defaults, fingerprint, emit, compare, and
  atomically write only in write mode.
- `src/cli/` owns argument parsing, initialization, human-readable diagnostics,
  stdout/stderr routing, and exit codes. Keep the CLI thin over generation and
  project services.

## Determinism and safety

- Generated output is committed. The same declaration, resolved configuration,
  defaults, and generator version must produce byte-identical output.
- Never include timestamps, random identifiers, absolute workspace paths, host
  state, or unstable traversal order in generated content or fingerprints.
- Preserve atomic generation: compare canonical bytes first and replace the
  output through a temporary sibling only when content changed.
- `check` is read-only. It must report missing or stale output without creating
  directories or files.
- Keep `init` idempotent and preflight failures before mutation. Preserve
  existing scripts and configuration, reject conflicting flags and aliased
  input/output paths, and never overwrite application-owned output. Do not add
  implicit package installation or a force-overwrite path.
- Fresh initialization creates `config.yaml` and a commented `typespun.json`.
  Keep only selected settings active, keep every optional setting discoverable
  in comments, and update JSON-with-comments parsing and CLI tests together.
- Diagnostics involving secrets must not disclose received values.

## Dependencies and commands

- Use Bun for dependency installation, scripts, tests, and workspace commands.
- Declare dependencies on sibling packages with the `workspace:` protocol. Do
  not replace workspace dependencies with TypeScript path aliases.
- Keep runnable examples under `examples/` and cross-package or packed-consumer
  integration tests under `tests/`.
- Place analyzer, emitter, project, CLI, and generation unit tests beside their
  source under `packages/codegen/src/`.
- Run focused tests while iterating, for example:

  ```sh
  bun test packages/codegen/src/cli/cli.test.ts
  bun test packages/codegen/src/analyzer/analyze.test.ts
  bun test packages/codegen/src/emitter/emit.test.ts
  bun test packages/codegen/src/project/project.test.ts
  ```

- For CLI, packaging, exports, or dependency changes, build and exercise packed
  consumers:

  ```sh
  bun run build
  bun run test:package
  ```

- When analysis or emission changes generated output, regenerate and verify the
  committed examples:

  ```sh
  bun run config:generate
  bun run config:check
  ```

- Before reporting implementation work complete, run the repository-wide gate:

  ```sh
  bun run check
  ```
