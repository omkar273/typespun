<p align="center">
  <img src="https://raw.githubusercontent.com/omkar273/typespun/main/docs/assets/typespun-mark.svg" width="64" height="64" alt="Typespun threads converging into typed brackets">
</p>

# typespun

The small runtime behind Typespun's generated, validated configuration loaders
for TypeScript. Schema analysis and the CLI are shipped separately in
[`typespun-codegen`](https://www.npmjs.com/package/typespun-codegen).

[![npm](https://img.shields.io/npm/v/typespun.svg)](https://www.npmjs.com/package/typespun)
[![license](https://img.shields.io/npm/l/typespun.svg)](LICENSE)

## Get started

Install the runtime and the development-only generator:

```sh
bun add typespun
bun add --dev typespun-codegen
```

Initialize a TypeScript project that already has `package.json` and
`tsconfig.json`:

```sh
bun typespun init --env-prefix APP
```

The package name is `typespun-codegen`; the executable it installs is
`typespun`. `init` creates `src/config.ts`, a `config.yaml` starter default,
`typespun.json`, the generated loader, and `config:generate` / `config:check`
package scripts without overwriting existing project files.

The npm equivalent is fully local after the two install commands:

```sh
npx typespun init --env-prefix APP
```

Declare the configuration once in `src/config.ts`:

```ts
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  /** @secret */
  apiToken: string;
}
```

Regenerate and commit the loader:

```sh
bun run config:generate
```

Application code imports the generated `Config` type and `loadConfig()`:

```ts
import { ConfigError } from 'typespun';
import { loadConfig, type Config } from './generated/typespun.js';

try {
  const config: Config = loadConfig({
    envFiles: [{ path: '.env', optional: true }],
    source: {
      APP_SERVER_HOST: '127.0.0.1',
      APP_SERVER_PORT: '3000',
      APP_API_TOKEN: 'development-token',
    },
    overrides: { server: { port: 4000 } },
  });

  console.log(config.server.port); // 4000, typed as number
} catch (error) {
  if (error instanceof ConfigError) console.error(error.issues);
  else throw error;
}
```

Run `bun run config:check` in CI. It does not write files and exits nonzero when
the committed loader is missing or stale.

For npm, install with `npm install typespun` and `npm install --save-dev
typespun-codegen`. The runtime supports Bun 1.4.1+ and Node.js 22 or 24.

## Resolution and failures

Each leaf uses the highest-precedence defined value:

1. typed `overrides`
2. explicit environment-shaped `source`, or `process.env` when omitted
3. dotenv files, with later entries winning
4. compiled JSON/YAML defaults
5. inline declaration defaults

`source: {}` disables the ambient `process.env` fallback. Dotenv files are read
synchronously without mutating `process.env`; typed overrides are validated but
not string-coerced.

Missing, invalid, unknown-override, source-read, and generated-schema problems
are aggregated in one `ConfigError.issues` array. For a field marked `@secret`
or `@Secret()`, Typespun omits the received value and type-specific details from
its own invalid-value diagnostic. This is diagnostic redaction, not encryption,
a secret store, or protection from application logs. Generated defaults are
committed, so do not put secrets in them.

## Public imports

- `typespun` exports `Config`, `Default`, `Env`, `Ignore`, `Key`, and `Secret`
  decorators plus `ConfigError` and `ConfigIssue`.
- `typespun/generated` exports the versioned runtime ABI used by generated
  files: `createLoader`, `resolveConfig`, `validateTypedValue`, and its schema
  and loader option types. Application code should normally import the
  generated module instead of using this entry point directly.

## Documentation

- [Getting started](https://github.com/omkar273/typespun/blob/main/docs/getting-started.md)
- [Generated loader API](https://github.com/omkar273/typespun/blob/main/docs/api/generated-loader.md)
- [Runtime API](https://github.com/omkar273/typespun/blob/main/docs/api/runtime.md)
- [Source precedence](https://github.com/omkar273/typespun/blob/main/docs/concepts/source-precedence.md)
- [Validation and redaction](https://github.com/omkar273/typespun/blob/main/docs/concepts/validation-and-redaction.md)
- [CLI reference](https://github.com/omkar273/typespun/blob/main/docs/api/cli.md)
- [Security policy](https://github.com/omkar273/typespun/blob/main/SECURITY.md)

MIT © Typespun contributors
