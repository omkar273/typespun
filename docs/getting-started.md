# Getting started

This tutorial starts with `typespun init`, builds a small Bun application, and
shows the entire first run. The generated loader also runs on Node.js 22 and 24.

## Prerequisites

- Bun 1.4.1 or newer
- An ESM TypeScript project with a `package.json`
- A usable `tsconfig.json` that includes the schema and generated module

Typespun remains pre-release software. Pin the package versions if you need
reproducible early adoption.

For a minimal project, start with these files:

`package.json`:

```json
{
  "private": true,
  "type": "module",
  "packageManager": "bun@1.4.1"
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "target": "ES2022"
  },
  "include": ["src/**/*.ts"]
}
```

Run the remaining commands from the directory containing those files.

## 1. Install and initialize

Install `typespun` as an application dependency and `typespun-codegen` as a
development dependency. The generator package installs an executable named
`typespun`:

```sh
bun add typespun
bun add --dev typespun-codegen
bun typespun init --env-prefix APP
```

Using npm, the equivalent flow is:

```sh
npm install typespun
npm install --save-dev typespun-codegen
npx typespun init --env-prefix APP
```

The command scaffolds the project and performs the first generation:

```text
Created src/config.ts.
Created config.yaml.
Created typespun.json.
Added config:generate and config:check scripts.
Generated src/generated/typespun.ts.
```

`init` creates directories as needed and adds only missing scripts. It does not
run a package installer, create `.env`, create an application entry point, or
overwrite an existing defaults file or app-owned output file. Both dependencies
are now locally resolvable, so the generated loader is part of this first run.

The initializer accepts:

```text
--style interface|class
--input <path>
--output <path>
--env-prefix <prefix>
```

The defaults are interface style, `src/config.ts`, and
`src/generated/typespun.ts`. Here, `--env-prefix APP` makes the generated
environment key for `port` equal to `APP_PORT`.

## 2. Inspect the scaffold

`src/config.ts` is a runnable declaration:

```ts
/** @typespun */
export interface AppConfig {
  port: number;
}
```

`typespun.json` records the selected paths and prefix. The parser accepts JSON
with comments, so every optional setting stays visible without being enabled:

```jsonc
{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  "envPrefix": "APP",

  // Environment keys use the configured prefix, such as APP_PORT.

  // Optional tsconfig override. Default: nearest tsconfig.json to the input.
  // "tsconfig": "tsconfig.json",

  // Optional defaults override. config.yaml is discovered automatically.
  // "defaults": {
  //   "path": "config.yaml",
  //   "unknownKeys": "error" // Allowed: "error", "warn", or "ignore".
  // },

  // Policy for defaults on secret fields. Allowed: "warn", "allow", or "error".
  // "secretDefaults": "warn"
}
```

The new `config.yaml` makes the starter runnable without environment setup:

```yaml
port: 3000
```

The command also adds these entries without replacing existing scripts:

```json
{
  "scripts": {
    "config:generate": "typespun generate",
    "config:check": "typespun check"
  }
}
```

Running `init` again is safe and leaves an initialized project unchanged.
Flags that conflict with its existing `typespun.json` are rejected.

## 3. Regenerate after declaration changes

```sh
bun run config:generate
```

Expected output:

```text
Generated src/generated/typespun.ts.
```

The generated module exports `Config` and `loadConfig`. Commit this file. Since
`init` already generated it, running this command before making changes prints
`Unchanged src/generated/typespun.ts.` instead.

## 4. Load configuration

Create `src/index.ts`:

```ts
import { loadConfig } from './generated/typespun.js';

const config = loadConfig();
console.log(`Listening on port ${config.port}`);
```

Run the application:

```sh
bun src/index.ts
```

Expected output:

```text
Listening on port 3000
```

The first value comes from `config.yaml`. Environment values such as
`APP_PORT=4000` take precedence over that compiled default. Pass `envFiles` to
load dotenv files; an explicit `source` wins over dotenv. Arrays in environment
sources use JSON, for example `APP_ORIGINS='["https://a.test"]'`.

After changing `src/config.ts`, `typespun.json`, or a configured defaults file,
rerun `bun run config:generate` and commit the changed generated module.

## 5. See a validation failure

`loadConfig()` throws `ConfigError`. Handle it at the application boundary:

```ts
import { ConfigError } from 'typespun';
import { loadConfig } from './generated/typespun.js';

try {
  loadConfig({ source: { APP_PORT: 'not-a-number' } });
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
invalid_value port (APP_PORT): Expected a finite number
```

When multiple fields fail, the error aggregates their issues. If a secret
candidate is invalid, its issue never includes the candidate as `received` or
type details that could reveal an allowed secret.

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
