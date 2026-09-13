# Contributing to Typespun

Thank you for helping make typed configuration in TypeScript simpler and safer.
Typespun is in early development, so focused proposals and small, reviewable
changes are especially valuable.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
For security-sensitive reports, follow [SECURITY.md](SECURITY.md) instead of
opening a public issue.

## Before you start

- Search existing issues before opening a new one.
- Use the bug or feature issue form when it fits your request.
- Discuss significant API or architecture changes before implementing them.

Early discussion is required for changes to the public decorator or JSDoc
syntax, source precedence, coercion rules, generated-code protocol, supported
runtimes, or security boundaries.

## Development setup

Typespun uses Bun workspaces. Install Git and the Bun version pinned in
`package.json`, then run:

```sh
bun install --frozen-lockfile
bun run check
```

The workspace is organized as follows:

- `packages/typespun` contains the runtime and inert class decorators.
- `packages/codegen` contains TypeScript analysis, code generation, and the CLI.
- `examples` contains runnable examples.
- `tests` contains cross-package integration tests.

## Making a change

1. Fork the repository and create a focused branch.
2. Add or update tests for behavior changes.
3. Keep runtime and generated code deterministic and portable across supported
   runtimes.
4. Commit generated files when a change updates generated output.
5. Update documentation and examples when public behavior changes.
6. Run `bun run check` before opening a pull request.

Avoid unrelated formatting or refactoring in the same change. Never commit
credentials, real environment files, access tokens, or production configuration.

## Pull requests

Use the pull request template and explain the problem, the chosen design, and
how you verified the result. Link the relevant issue when one exists. Small
commits with clear, imperative messages make reviews easier.

Maintainers may ask for a proposal to be narrowed or split when it changes
multiple public contracts at once.

## Licensing

Unless stated otherwise, contributions are licensed under the repository's
[MIT License](LICENSE).
