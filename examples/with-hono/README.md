# Hono example

A Hono application served by `Bun.serve`. Configuration is resolved once,
before the port is bound: Hono's CORS middleware, the request logger, and an
authenticated route all read the typed result.

## Create the same starting point

In an existing TypeScript project with `package.json` and `tsconfig.json`:

```sh
bun add hono typespun
bun add --dev typespun-codegen
bun typespun init --style interface --env-prefix APP
```

`init` creates `src/config.ts`, `config.yaml`, `typespun.json`, the
`config:generate` and `config:check` scripts, and `src/generated/typespun.ts`.
This example then expands the starter into a nested schema, moves the YAML
defaults under `config/`, and adds a `@secret` admin token.

## What it shows

- A nested shape (`server`, `cors`) alongside a string-literal union
  (`logLevel`) and a `string[]` (`cors.origins`).
- `@env DATABASE_URL` for a field that must keep its conventional name instead
  of the `APP_` prefix.
- `@secret adminToken`, which has no default and therefore must be supplied.
  It is never printed, never returned by `/config`, and never appears in an
  error's `received` field.
- `src/load.ts` catches `ConfigError` and prints every issue, then exits `1`.
  `Bun.serve` is never reached.

## Run this repository example

From the repository root:

```sh
bun run build
bun run --filter typespun-example-with-hono config:check
APP_ADMIN_TOKEN=development-only bun run --filter typespun-example-with-hono start
```

Startup output:

```text
typespun-example-with-hono listening on http://127.0.0.1:8787
  log level: info
  cors origins: http://localhost:5173
```

Then, from another shell:

```sh
curl -s http://127.0.0.1:8787/healthz
curl -s http://127.0.0.1:8787/config
curl -s http://127.0.0.1:8787/admin/secrets
curl -s -H 'Authorization: Bearer development-only' \
  http://127.0.0.1:8787/admin/secrets
```

```text
{"status":"ok","logLevel":"info"}
{"server":{"host":"127.0.0.1","port":8787},"logLevel":"info","cors":{"origins":["http://localhost:5173"],"allowCredentials":false},"databaseUrl":"localhost:5432","adminToken":"[redacted]"}
{"error":"unauthorized"}
{"database":"postgres://localhost:5432/typespun_example"}
```

## Failing startup

Run it with an unusable environment:

```sh
APP_LOG_LEVEL=verbose bun run --filter typespun-example-with-hono start
```

```text
Configuration is invalid. The server did not start.
  logLevel (APP_LOG_LEVEL): Expected one of: debug, info, warn, error
    received: "verbose"
  adminToken (APP_ADMIN_TOKEN): Missing required value for adminToken
```

The process exits with code `1`. Both problems are reported in one pass, and
the missing secret is named without echoing anything.

## Environment variables

`config/config.yaml` supplies every default except the admin token. Copy
[`.env.example`](.env.example) to `.env` to override them locally; the loader
reads `.env` when it exists and ignores it when it does not.

Array values are parsed as JSON, not as a comma-separated list:

```sh
APP_CORS_ORIGINS='["http://localhost:5173","https://app.example.com"]'
```

Start with [the declaration](src/config.ts), follow its settings in
[`typespun.json`](typespun.json), then read [`src/load.ts`](src/load.ts) and
[`src/index.ts`](src/index.ts).
