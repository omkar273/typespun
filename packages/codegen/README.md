<p align="center">
  <img src="https://raw.githubusercontent.com/omkar273/typespun/main/docs/assets/typespun-mark.svg" width="64" height="64" alt="Typespun threads converging into typed brackets">
</p>

# typespun-codegen

The TypeScript compiler and `typespun` command-line tool for
[Typespun](https://github.com/omkar273/typespun). It initializes a project,
analyzes one TypeScript configuration declaration, and emits a deterministic
loader for the separate [`typespun`](https://www.npmjs.com/package/typespun)
runtime package.

[![npm](https://img.shields.io/npm/v/typespun-codegen.svg)](https://www.npmjs.com/package/typespun-codegen)
[![license](https://img.shields.io/npm/l/typespun-codegen.svg)](LICENSE)

The package name is `typespun-codegen`; the executable it provides is
`typespun`. There is no supported programmatic compiler API in version 0.1.

## Start with `init`

Run initialization from the root of an existing TypeScript project. The
project must already contain a valid `package.json` and a usable
`tsconfig.json`.

Install the runtime and generator, then invoke the local executable:

```sh
bun add typespun
bun add --dev typespun-codegen
bun typespun init --env-prefix APP
```

Using npm:

```sh
npm install typespun
npm install --save-dev typespun-codegen
npx typespun init --env-prefix APP
```

The default initialization creates, when missing:

- `src/config.ts`, containing an `@typespun` interface with a numeric `port`
  field;
- `config.yaml`, containing `port: 3000` for a runnable default;
- `typespun.json`, pointing from `src/config.ts` to
  `src/generated/typespun.ts`, with commented examples for every optional
  setting and allowed policy value; and
- `config:generate` and `config:check` scripts in `package.json`.

When both `typespun` and `typespun-codegen` resolve from the project or an
ancestor `node_modules`, `init` also creates the first generated loader at
`src/generated/typespun.ts`.

If either dependency is missing, initialization still creates the other
missing project files and exits successfully, but does not generate output. It
prints install commands for the package manager selected by `packageManager`
or a recognized lockfile (falling back to npm). It never runs an installer.
If initialization was invoked before the dependencies were installed—for
example with `bunx --package typespun-codegen typespun init`—install them and
then generate:

```sh
bun add typespun
bun add --dev typespun-codegen
bun run config:generate
```

`init` preserves existing scripts and initialized files. Re-running it is
byte-stable. It refuses conflicting options, input/output aliases, and an
existing output file or symlink that is not recognizable as Typespun-generated;
there is no force-overwrite option.

## Customize initialization

```text
typespun init [--style interface|class] [--input <path>]
              [--output <path>] [--env-prefix <prefix>]
```

| Option                     | Effect                                                                      |
| -------------------------- | --------------------------------------------------------------------------- |
| `--style interface\|class` | Creates an annotated interface (the default) or a decorated class.          |
| `--input <path>`           | Selects the schema path. It must end in `.ts`, `.mts`, or `.cts`.           |
| `--output <path>`          | Selects the generated module path. It must end in `.ts`, `.mts`, or `.cts`. |
| `--env-prefix <prefix>`    | Stores the environment-variable prefix in `typespun.json`.                  |

For example:

```sh
bun typespun init \
  --style class \
  --input config/app.mts \
  --output config/generated.mts \
  --env-prefix APP
```

Without explicit paths, `init` adopts one existing conventional schema at
`src/config.ts`, `src/config.mts`, or `src/config.cts`; otherwise it creates
`src/config.ts`. The output defaults to `src/generated/typespun` with the same
extension as the input. Multiple conventional schemas require `--input`.

## Use the generated loader

After the default initialization, expand `src/config.ts` into your application
schema:

```ts
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  /** @secret */
  databaseUrl: string;
}
```

Regenerate and import the generated module:

```sh
bun run config:generate
```

```ts
import { loadConfig } from './generated/typespun.js';

const config = loadConfig({
  source: {
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: '3000',
    DATABASE_URL: 'postgres://localhost/example',
  },
});

console.log(config.server.port); // 3000, typed as number
```

The generated module exports the declaration-backed `Config` type and
`loadConfig()`. Commit that module: output is deterministic for the same
declaration, resolved configuration, defaults, and generator version.

## Generate and check

Initialization adds these scripts:

```json
{
  "scripts": {
    "config:generate": "typespun generate",
    "config:check": "typespun check"
  }
}
```

Use them locally and in CI:

```sh
bun run config:generate
bun run config:check
```

The underlying commands are:

```text
typespun generate [--config <path>]
typespun check [--config <path>]
```

`generate` reads `typespun.json`, the schema, the resolved `tsconfig.json`, and
an optional JSON or YAML defaults file. It writes atomically only when the
canonical output differs, reporting either `Generated` or `Unchanged`.

`check` performs the same analysis but never writes. It exits nonzero when the
output is missing or stale and tells you to run `typespun generate`. Pass
`--config <path>` once to either command to use a configuration file other than
`typespun.json`; relative paths inside it resolve from that file's directory.

## Errors and exit status

- Exit `0`: help or success. For `init`, this also includes the safe
  dependency-installation handoff described above.
- Exit `1`: schema, defaults, output, or stale-output failure.
- Exit `2`: invalid CLI usage or unusable project/TypeScript configuration.

Warnings and diagnostics are written to stderr. Secret-default warnings identify
the field path without printing the received secret value. `generate` and
`check` accept only `--config`; unknown options, duplicate options, and missing
option values are usage errors.

Run `bun typespun --help`, `bun typespun generate --help`, or
`bun typespun check --help` for the built-in command summary.

## Package role

`typespun-codegen` carries the TypeScript compiler and YAML parser needed while
authoring and checking configuration. Applications import the generated loader,
which delegates runtime loading and validation to `typespun`; they do not import
compiler internals from this package. Keeping code generation separate lets the
compiler remain a development dependency.

Further documentation:

- [Getting started](https://github.com/omkar273/typespun/blob/main/docs/getting-started.md)
- [CLI reference](https://github.com/omkar273/typespun/blob/main/docs/api/cli.md)
- [`typespun.json` reference](https://github.com/omkar273/typespun/blob/main/docs/reference/configuration.md)
- [Declaration syntax](https://github.com/omkar273/typespun/blob/main/docs/concepts/declarations.md)
- [Generated loader API](https://github.com/omkar273/typespun/blob/main/docs/api/generated-loader.md)

MIT © Typespun contributors
