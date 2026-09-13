# Class example

This example uses inert decorators, class-field defaults, an explicit
environment name, and secret-aware error handling.

## Create the same starting point

In an existing TypeScript project with `package.json` and `tsconfig.json`:

```sh
bun add typespun
bun add --dev typespun-codegen
bun typespun init --style class --env-prefix APP
```

The npm equivalent is:

```sh
npm install typespun
npm install --save-dev typespun-codegen
npx typespun init --style class --env-prefix APP
```

`init` creates the decorated class, `config.yaml`, `typespun.json`, package
scripts, and the generated loader. This example then adds `@Env()` and
`@Secret()` fields and replaces the starter default with class-field defaults.

## Run this repository example

From the repository root:

```sh
bun run build
APP_TOKEN=development-only bun run --filter typespun-example-class start
```

The first load intentionally prints a missing-secret issue without a value. The
second load succeeds and prints:

```text
Connecting to 127.0.0.1:3000
```

Read [the decorated declaration](src/config.ts), its
[`typespun.json`](typespun.json), and the [loader usage](src/index.ts) together.
