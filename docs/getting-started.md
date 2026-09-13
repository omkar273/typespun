# Getting started

This tutorial builds a small Bun application, but the generated loader also
runs on the supported Node.js versions.

## Prerequisites

- Bun 1.4.1 or newer
- TypeScript 6
- An ESM TypeScript project with `package.json` and `tsconfig.json`

Typespun remains pre-release software. Pin the package versions if you need
reproducible early adoption.

## 1. Install both packages

```sh
bun add typespun
bun add --dev typespun-codegen
```

Add local CLI scripts to `package.json`:

```json
{
  "scripts": {
    "config:generate": "typespun generate",
    "config:check": "typespun check"
  }
}
```

The package is named `typespun-codegen`; its executable is named `typespun`.

## 2. Declare configuration

Create `src/config.ts`:

```ts
export enum Stage {
  Development = 'development',
  Production = 'production',
}

/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  stage: Stage;
  origins: string[];
  /**
   * @env DATABASE_URL
   * @secret
   */
  databaseUrl: string;
}
```

Create `typespun.json`:

```json
{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  "envPrefix": "APP",
  "defaults": {
    "path": "config/config.yaml",
    "unknownKeys": "error"
  }
}
```

Create `config/config.yaml`:

```yaml
server:
  host: 127.0.0.1
  port: 3000
stage: development
origins:
  - https://example.com
```

## 3. Generate the loader

```sh
bun run config:generate
```

Expected output:

```text
Generated src/generated/typespun.ts.
```

The generated module exports `Config` and `loadConfig`. Commit this file.

## 4. Load configuration

Create `src/index.ts`:

```ts
import { loadConfig } from './generated/typespun.js';

const config = loadConfig({
  envFiles: [{ path: '.env', optional: true }],
});

console.log(
  `Listening on ${config.server.host}:${config.server.port} (${config.stage})`,
);
```

Create a local, ignored `.env`:

```dotenv
APP_SERVER_PORT=4000
DATABASE_URL=postgres://localhost/example
```

Run the application:

```sh
bun src/index.ts
```

Expected output:

```text
Listening on 127.0.0.1:4000 (development)
```

Typespun parses dotenv files in the order passed; later files win. An explicit
`source` wins over dotenv, while omitting `source` reads `process.env`. Arrays in
environment sources use JSON, for example `APP_ORIGINS='["https://a.test"]'`.

## 5. See a validation failure

Change `.env` to:

```dotenv
APP_SERVER_PORT=not-a-number
```

`loadConfig()` throws `ConfigError`. Handle it at the application boundary:

```ts
import { ConfigError } from 'typespun';
import { loadConfig } from './generated/typespun.js';

try {
  loadConfig({ envFiles: ['.env'], source: {} });
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    for (const issue of error.issues) {
      console.error(
        `${issue.code} ${issue.path} (${issue.envKey ?? 'n/a'}): ${issue.message}`,
      );
    }
  }
}
```

Expected issue summary:

```text
Configuration validation failed
invalid_value server.port (APP_SERVER_PORT): Expected a finite number
missing_value databaseUrl (DATABASE_URL): Missing required value for databaseUrl
```

The error aggregates both fields. If a secret candidate is invalid, its issue
never includes the candidate as `received` or type details that could reveal an
allowed secret.

## 6. Keep generation current in CI

Commit `src/generated/typespun.ts`, then add:

```sh
bun run config:check
```

The command exits `0` when output is current and `1` when it is stale or schema
analysis fails. Unusable CLI arguments or project/TypeScript configuration exit
`2`.

## Troubleshooting

### The CLI command is not found

Install `typespun-codegen` as a dev dependency and invoke it through the package
script. The runtime package alone does not provide a binary.

### No schema is found

Set `input` explicitly or keep exactly one of `src/config.ts`,
`src/config.mts`, and `src/config.cts`.

### Multiple defaults files are found

Set `defaults.path`. Conventional discovery rejects ambiguity instead of
guessing.

### Environment values fail validation

Numbers must be complete finite numeric strings; booleans are case-insensitive
`true` or `false`; arrays must be JSON arrays with a uniform supported element
type. Typed overrides are validated but never string-coerced.

### A generated import has the wrong extension

Make sure `tsconfig.json` uses the intended module and module-resolution mode,
then regenerate. Typespun derives `.js`, `.mjs`, or `.cjs` specifiers from the
input extension and compiler options.
