<p align="center">
  <img src="https://raw.githubusercontent.com/omkar273/typespun/main/docs/assets/typespun-mark.svg" width="64" height="64" alt="Typespun threads converging into typed brackets">
</p>

# typespun

The runtime package for Typespun: generated, validated configuration for
TypeScript applications.

[![npm](https://img.shields.io/npm/v/typespun.svg)](https://www.npmjs.com/package/typespun)
[![license](https://img.shields.io/npm/l/typespun.svg)](LICENSE)

`typespun` provides class decorators, `ConfigError`, runtime types, and the
versioned ABI used by generated loaders. Schema analysis and the CLI live in the
separate [`typespun-codegen`](https://www.npmjs.com/package/typespun-codegen)
development package.

## Install

```sh
bun add typespun
bun add --dev typespun-codegen
```

Both packages are required while developing. Only `typespun` is needed by the
generated loader at runtime.

## Use the generated loader

Application code normally imports from its generated module:

```ts
import { ConfigError } from 'typespun';
import { loadConfig, type Config } from './generated/typespun.js';

try {
  const config: Config = loadConfig({
    envFiles: [{ path: '.env', optional: true }],
  });
  console.log(config.server.port);
} catch (error) {
  if (error instanceof ConfigError) console.error(error.issues);
}
```

The loader resolves each leaf from highest to lowest precedence:

1. typed overrides
2. an explicit environment-shaped `source`, or `process.env` when omitted
3. dotenv files, with later entries winning
4. compiled JSON/YAML defaults
5. inline declaration defaults

Loading is synchronous. Missing and invalid values are aggregated into one
`ConfigError`. A field marked secret omits its received value and type-specific
details from Typespun-generated diagnostics.

## Public imports

From `typespun`:

- `Config`, `Default`, `Env`, `Ignore`, `Key`, and `Secret`: inert decorators
  read statically by the generator
- `ConfigError` and the `ConfigIssue` type: runtime failure handling

From `typespun/generated`:

- `createLoader`, `resolveConfig`, and `validateTypedValue`
- generated-schema and loader option types

The second entry point is primarily an ABI for generated files. Most application
code should use the generated `Config` and `loadConfig` exports.

## Compatibility and boundaries

The package provides ESM and CommonJS entry points for Node.js 22 and 24 and Bun
1.4.1 or newer. Secret marking redacts Typespun diagnostics; it is not
encryption, a secret store, or a scrubber for application logs.

Read the [project documentation](https://github.com/omkar273/typespun#readme),
[runtime API](https://github.com/omkar273/typespun/blob/main/docs/api/runtime.md),
and [security policy](https://github.com/omkar273/typespun/blob/main/SECURITY.md).

MIT © Typespun contributors
