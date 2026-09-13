# Example guidance

- Keep examples small, runnable, and aligned with the public documentation.
- `interface/` demonstrates JSDoc annotations, nested fields, an environment
  prefix, YAML defaults, and typed overrides.
- `class/` demonstrates inert decorators, inline defaults, an explicit
  environment name, secret diagnostics, and dotenv loading.
- Generated files under `src/generated/` are committed artifacts. Change the
  declaration or `typespun.json`, run the example's `config:generate` script,
  and commit the resulting output; never hand-edit it.
- Use `workspace:*` for Typespun packages and Bun for all repository commands.
- From the repository root, run `bun run config:check`, example typechecks, and
  the relevant `start` script after changes.
- Do not put real credentials in `.env` examples or expected output.
