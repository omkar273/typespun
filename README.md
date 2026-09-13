# Typespun

Typed configuration for TypeScript, generated from decorated classes or JSDoc-annotated interfaces.

Typespun is currently in active design and initial development.

## Workspace

This repository is a Bun workspace with two publishable packages:

- `typespun` — runtime loading, validation, provenance, and class decorators.
- `@typespun/codegen` — TypeScript analysis, deterministic code generation, and the CLI.

Runnable usage examples will live under `examples/`, and cross-package integration tests will live under `tests/`.

## Development

Install the pinned Bun dependency graph:

```sh
bun install --frozen-lockfile
```

Run all repository checks:

```sh
bun run check
```

Individual commands are also available:

```sh
bun run format
bun run typecheck
bun run test
bun run build
```

Both packages remain private until their initial public contracts are implemented and reviewed.

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing or implementing a change.
- Use [SUPPORT.md](SUPPORT.md) for bugs, feature proposals, and usage questions.
- Follow [SECURITY.md](SECURITY.md) for suspected vulnerabilities.
- Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
