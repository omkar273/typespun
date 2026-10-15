# Repository guidelines

- Use Bun for dependency installation, scripts, and workspace commands.
- Tests run on Vitest (under Node, for V8 branch coverage); invoke them
  through the Bun scripts, for example `bun run test:unit`.
- Keep runtime code in `packages/typespun` and compiler or CLI code in `packages/codegen`.
- Keep runnable examples under `examples/` and cross-package integration tests under `tests/`.
- Declare workspace dependencies with the `workspace:` protocol; do not replace them with TypeScript path aliases.
- Generated Typespun output must be deterministic and committed once code generation is implemented.
- Run `bun run check` before reporting implementation work complete.

## Code

`bun run lint` enforces these rules. They match the caygnus monorepo. The
custom rules are in `setup/oxlint-rules/`. Lint does not check `examples/`,
because examples are short demos that users copy.

- Use arrow functions only: `const name = (...) => ...`. Class and object
  methods, getters and setters are permitted.
- Write a one-line body without braces: `() => run()`.
- Use the package's private `attempt` helper instead of `try`/`catch`, and
  branch on `ok`: `packages/typespun/src/runtime/attempt.ts` or
  `packages/codegen/src/internal/attempt.ts`. `try`/`finally` is permitted.
- Use `es-toolkit` before you write a helper in `packages/codegen`. The runtime
  package is exempt, because it keeps runtime dependencies small.
- Put a disable comment only where a fix would change the public API, the
  generated output or the behavior. Give the reason after `--`.
