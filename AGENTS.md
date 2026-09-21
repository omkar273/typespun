# Repository guidelines

- Use Bun for dependency installation, scripts, and workspace commands.
- Tests run on Vitest (under Node, for V8 branch coverage); invoke them
  through the Bun scripts, for example `bun run test:unit`.
- Keep runtime code in `packages/typespun` and compiler or CLI code in `packages/codegen`.
- Keep runnable examples under `examples/` and cross-package integration tests under `tests/`.
- Declare workspace dependencies with the `workspace:` protocol; do not replace them with TypeScript path aliases.
- Generated Typespun output must be deterministic and committed once code generation is implemented.
- Run `bun run check` before reporting implementation work complete.
