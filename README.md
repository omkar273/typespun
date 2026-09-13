# Typespun

Typespun turns a TypeScript interface or schema-only class into a small, typed
configuration loader. It combines committed defaults, dotenv files,
environment-shaped records, and typed overrides without mutating
`process.env`.

## Install

```sh
bun add typespun
bun add --dev typespun-codegen
```

Node package managers can install the same two packages. Typespun supports
Node.js 22 and 24 and Bun 1.4.1 or newer. Schema declarations are TypeScript
only; JavaScript schemas are not supported.

Initialize a project and generate its first loader:

```sh
bunx typespun init
bun run config:generate
```

`typespun init --style class` creates a class declaration instead. The command
also adds `config:generate` and `config:check` scripts when they are missing.

## Interface schemas

Interfaces use JSDoc annotations and are the recommended default:

```ts
export enum Stage {
  Development = 'development',
  Production = 'production',
}

/** @typespun */
export interface AppConfig {
  server: {
    host: string;
    port: number;
  };
  stage: Stage;
  /** @env DATABASE_URL */
  databaseUrl?: string;
  /** @secret */
  token: string;
}
```

Fields support `@env NAME`, `@key name`, `@default <JSON>`, `@secret`, and
`@ignore`. Unannotated environment names come from property paths and the
optional project prefix.

## Class schemas

Classes use inert decorators. They describe a schema; Typespun never
instantiates the class or runs constructors, methods, getters, or setters.

```ts
import { Config, Env, Secret } from 'typespun';

@Config()
export class AppConfig {
  port = 3000;

  @Env('SERVICE_HOST')
  host = '127.0.0.1';

  @Secret()
  token!: string;
}
```

Class fields support `@Default(value)`, `@Env(name)`, `@Key(name)`, `@Secret()`,
and `@Ignore()`. Inline defaults must be statically readable literals.

## Project configuration

`typespun.json` lives at the project root. Paths are resolved from its
directory.

```json
{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  "envPrefix": "APP",
  "defaults": {
    "path": "config/config.yaml",
    "unknownKeys": "error"
  },
  "secretDefaults": "warn"
}
```

`input`, `output`, and `tsconfig` may be explicit. Without an input or defaults
path, Typespun uses its project conventions. Defaults may be JSON or YAML.
Unknown defaults keys use `error` by default and can be changed to `warn` or
`ignore`. Secret defaults use `warn` by default and can be changed to `error`
or `allow`.

Generate and commit the output:

```sh
bun run config:generate
git add src/generated/typespun.ts
```

The generated module exports only the configuration type and loader:

```ts
import { loadConfig, type Config } from './generated/typespun.js';

const config: Config = loadConfig({
  envFiles: ['.env', { path: '.env.local', optional: true }],
  source: process.env,
  overrides: { server: { port: 4000 } },
});
```

Configuration precedence, from lowest to highest, is:

1. Inline interface/class defaults.
2. Compiled JSON or YAML defaults.
3. Dotenv files, with later files winning.
4. `source`, such as `process.env` or a test-owned record.
5. Typed `overrides`.

Omitting `source` reads `process.env`; passing `source: {}` explicitly disables
ambient environment input. Loading is synchronous and returns a fresh plain
object.

## Errors and security

Invalid or missing configuration throws one `ConfigError` containing every
issue. Each issue has a stable code and field path. Secret fields never include
their received values in Typespun diagnostics.

Defaults and generated files are intended for non-secret values and are
committed. Keep `.env` files and credentials out of version control; commit
only placeholder files such as `.env.example`. Typespun parses dotenv files
without changing `process.env`.

## CI

Generated files are part of the source tree. Reject stale output in CI:

```sh
bun run config:check
```

This repository's `bun run check` formats, lints, typechecks, builds, tests the
workspace and installed package tarballs, and checks both examples. CI also
runs the packed ESM/CommonJS consumers on Node.js 22 and 24.

See [`examples/interface`](examples/interface) and
[`examples/class`](examples/class) for executable projects.

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.
- Use [SUPPORT.md](SUPPORT.md) for bugs, features, and usage questions.
- Report vulnerabilities through [SECURITY.md](SECURITY.md).
- Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
