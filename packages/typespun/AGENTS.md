# Runtime package guidance

## Scope and ownership

- This package owns runtime behavior under `src/runtime/`, declaration markers
  in `src/annotations.ts`, shared runtime schema/error types in `src/schema.ts`,
  the generated-code ABI in `src/generated.ts`, and the two public entry points
  assembled by `src/index.ts` and `src/generated.ts`.
- Keep compiler, TypeScript AST analysis, project discovery, code emission, and
  CLI behavior in `packages/codegen`. Do not add compiler or CLI code here.
- Keep runtime dependencies small. The runtime must not acquire TypeScript or
  YAML as production dependencies.

## Public API and generated ABI

- Treat exports from `typespun` and `typespun/generated` as public API. Update
  package exports, ESM/CommonJS builds, declaration output, package tests, and
  documentation together when changing them.
- `typespun/generated` is consumed by committed generated files. Changes to
  `GeneratedSchema`, `FieldSchema`, `LoadConfigOptions`, `createLoader`,
  `resolveConfig`, `validateTypedValue`, or `protocolVersion` are ABI changes.
  Coordinate them with the emitter in `packages/codegen`, preserve compatibility
  deliberately, and add cross-package consumer coverage.
- Generated output must remain deterministic. Never hand-edit files under an
  example's `src/generated/`; change the emitter and regenerate instead.

## Runtime and security invariants

- Preserve source precedence: typed overrides, explicit `source` or ambient
  `process.env`, dotenv files with later entries winning, compiled defaults,
  then inline defaults.
- Select a candidate before coercion. Environment and dotenv values may be
  string-coerced; typed overrides and defaults must only be validated.
- Keep validation failures aggregated in `ConfigError.issues`. Secret-field
  diagnostics must not include received values or type-specific details that
  could disclose allowed secrets.
- Redaction applies only to diagnostics produced by Typespun. Do not claim it
  scrubs application logs or provides encryption or secret storage. Do not add
  secrets to defaults or generated fixtures because generated output is
  committed.
- Continue to parse dotenv inputs without mutating `process.env`, read source
  objects through own properties, and reject unsafe object-path segments.

## Development workflow

- Use Bun for installs, builds, and scripts; tests run on Vitest.
- Run focused runtime tests with `bunx vitest run packages/typespun/src`.
- Run `bun run --filter typespun typecheck` and
  `bun run --filter typespun build` for package-local validation.
- When public exports, packaging, or the generated ABI changes, also run
  `bun run test:package` and the relevant codegen tests.
- Before reporting implementation work complete, run the repository-wide
  `bun run check`.

## Workspace rules

- Declare dependencies on sibling packages with the `workspace:` protocol.
  Do not replace workspace dependencies with TypeScript path aliases.
- Keep runnable examples in `examples/` and cross-package integration tests in
  `tests/`; package-local runtime tests stay beside runtime source.
