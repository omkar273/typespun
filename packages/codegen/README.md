<p align="center">
  <img src="https://raw.githubusercontent.com/omkar273/typespun/main/docs/assets/typespun-mark.svg" width="64" height="64" alt="Typespun threads converging into typed brackets">
</p>

# typespun-codegen

The TypeScript analyzer and `typespun` CLI that generate deterministic
configuration loaders.

[![npm](https://img.shields.io/npm/v/typespun-codegen.svg)](https://www.npmjs.com/package/typespun-codegen)
[![license](https://img.shields.io/npm/l/typespun-codegen.svg)](LICENSE)

Install this package as a development dependency beside the runtime:

```sh
bun add typespun
bun add --dev typespun-codegen
```

The npm package is named `typespun-codegen`; the executable it installs is named
`typespun`. The package root intentionally has no programmatic compiler API in
version 0.1.

## Generate your first loader

Add local scripts:

```json
{
  "scripts": {
    "config:generate": "typespun generate",
    "config:check": "typespun check"
  }
}
```

Declare one exported root in `src/config.ts`:

```ts
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  /** @secret */
  token: string;
}
```

Then generate:

```sh
bun run config:generate
# Generated src/generated/typespun.ts.
```

The generated module exports the declaration-backed `Config` type and a
`loadConfig()` function. Commit the file, then keep it current in CI:

```sh
bun run config:check
```

## CLI

```text
typespun init [--style interface|class] [--input <path>]
              [--output <path>] [--env-prefix <prefix>]
typespun generate [--config <path>]
typespun check [--config <path>]
```

- `init` creates missing schema/config files and package scripts without
  overwriting application-owned output.
- `generate` statically analyzes TypeScript, validates optional JSON/YAML
  defaults, and atomically writes canonical output when it changes.
- `check` performs the same analysis without writing and exits nonzero for
  missing or stale output.

With no explicit configuration, the CLI expects exactly one conventional
`src/config.ts`, `.mts`, or `.cts` file and discovers at most one conventional
JSON/YAML defaults file. Use `typespun.json` for explicit paths, an environment
prefix, defaults policies, and secret-default policy.

## Why a separate package?

Generation uses the TypeScript compiler and YAML parser during development.
Keeping them in `typespun-codegen` lets applications depend on the smaller
`typespun` runtime while CI and schema authors retain the compiler. Generated
output is deterministic for the same declaration, settings, defaults, and
generator version.

Read the [getting-started guide](https://github.com/omkar273/typespun/blob/main/docs/getting-started.md),
[CLI reference](https://github.com/omkar273/typespun/blob/main/docs/api/cli.md),
and [`typespun.json` reference](https://github.com/omkar273/typespun/blob/main/docs/reference/configuration.md).

MIT © Typespun contributors
