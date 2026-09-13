# Interface example

This example marks an interface with `@typespun`, compiles YAML defaults, and
uses an explicit environment prefix.

## Create the same starting point

In an existing TypeScript project with `package.json` and `tsconfig.json`:

```sh
bun add typespun
bun add --dev typespun-codegen
bun typespun init --style interface --env-prefix APP
```

With npm, install the same packages and run the locally installed executable:

```sh
npm install typespun
npm install --save-dev typespun-codegen
npx typespun init --style interface --env-prefix APP
```

`init` creates `src/config.ts`, `config.yaml`, `typespun.json`, the
`config:generate` and `config:check` scripts, and
`src/generated/typespun.ts`. This example then expands the generated starter
into a nested schema and moves its YAML defaults under `config/`.

## Run this repository example

From the repository root:

```sh
bun run build
bun run --filter typespun-example-interface config:check
bun run --filter typespun-example-interface start
```

Expected application output:

```text
Listening on 127.0.0.1:4000 (development)
```

The code supplies a typed port override, so no local `.env` is required.

Start with [the declaration](src/config.ts), follow its settings in
[`typespun.json`](typespun.json), and see the generated loader used by
[`src/index.ts`](src/index.ts).
