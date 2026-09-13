# Repository guidelines

- Use Bun for dependency installation, scripts, tests, and workspace commands.
- Keep runtime code in `packages/typespun` and compiler or CLI code in `packages/codegen`.
- Keep runnable examples under `examples/` and cross-package integration tests under `tests/`.
- Declare workspace dependencies with the `workspace:` protocol; do not replace them with TypeScript path aliases.
- Generated Typespun output must be deterministic and committed once code generation is implemented.
- Run `bun run check` before reporting implementation work complete.
