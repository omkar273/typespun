# Fastify example

A Fastify server on Node. Configuration is resolved before `Fastify()` is
constructed, so the logger level, the body limit, and the CORS allow-list all
come from a validated object rather than from `process.env` reads scattered
through the code.

## Create the same starting point

In an existing TypeScript project with `package.json` and `tsconfig.json`:

```sh
npm install fastify @fastify/cors typespun
npm install --save-dev typespun-codegen
npx typespun init --style interface --env-prefix APP
```

The Bun equivalent is:

```sh
bun add fastify @fastify/cors typespun
bun add --dev typespun-codegen
bun typespun init --style interface --env-prefix APP
```

This example then deletes the starter's `config.yaml` and moves every default
into the declaration as a `@default` tag.

## What it shows

- Inline JSON defaults (`@default`) instead of a YAML defaults document. There
  is no `config.yaml` here and `typespun.json` names no `defaults` path.
- A nested shape (`server`, `logger`, `cors`), a string-literal union
  (`logger.level`), a `string[]`, a boolean, and numbers.
- `@env DATABASE_URL` to keep a conventional variable name.
- `@secret sessionSecret`, which has no default and must be supplied. It signs
  session tokens and is never logged, returned, or echoed in an error.
- `src/load.ts` catches `ConfigError`, prints every issue, and exits `1` before
  `app.listen` runs.

## Node and TypeScript

`start` is plain `node src/index.ts`. Node 22.18 and newer strip types without
a flag; on Node 22.6 to 22.17 run `node --experimental-strip-types src/index.ts`.

Node's type stripping does not rewrite import specifiers, so the source imports
the generated loader as `./generated/typespun.ts` and the tsconfig sets
`allowImportingTsExtensions`. The generated file's own import of the
declaration is type-only, so it disappears during stripping.

## Run this repository example

From the repository root:

```sh
bun run build
bun run --filter typespun-example-with-fastify config:check
APP_SESSION_SECRET=development-only bun run --filter typespun-example-with-fastify start
```

Startup output:

```text
{"level":30,"time":1790025277540,"pid":99817,"hostname":"host.local","msg":"Server listening at http://127.0.0.1:8080"}
{"level":30,"time":1790025277540,"pid":99817,"hostname":"host.local","msg":"body limit 16384 bytes, cors http://localhost:5173"}
```

Then, from another shell:

```sh
curl -s http://127.0.0.1:8080/healthz
curl -s http://127.0.0.1:8080/config
curl -s -X POST -H 'content-type: application/json' \
  -d '{"user":"ada"}' http://127.0.0.1:8080/session
```

```text
{"status":"ok","level":"info"}
{"server":{"host":"127.0.0.1","port":8080,"bodyLimitBytes":16384},"logger":{"level":"info"},"cors":{"origins":["http://localhost:5173"],"allowCredentials":false},"databaseUrl":"localhost:5432","sessionSecret":"[redacted]"}
{"user":"ada","token":"6c8b394d012b96f455d1497add8e9a86046d2f0f0fd65c5b69f6d02b35125d62"}
```

`server.bodyLimitBytes` is the real Fastify body limit, so a request larger
than it is rejected by the framework:

```text
{"statusCode":413,"code":"FST_ERR_CTP_BODY_TOO_LARGE","error":"Payload Too Large","message":"Request body is too large"}
```

## Failing startup

Run it with an unusable environment:

```sh
APP_SERVER_PORT=not-a-port APP_CORS_ORIGINS=http://localhost:5173 \
  bun run --filter typespun-example-with-fastify start
```

```text
Configuration is invalid. The server did not start.
  server.port (APP_SERVER_PORT): Expected a finite number
    received: "not-a-port"
  cors.origins (APP_CORS_ORIGINS): Expected an array of string
    received: "http://localhost:5173"
  sessionSecret (APP_SESSION_SECRET): Missing required value for sessionSecret
```

The process exits with code `1`. The second issue is the common mistake: array
values are read as JSON, not as a comma-separated list.

```sh
APP_CORS_ORIGINS='["http://localhost:5173","https://app.example.com"]'
```

Copy [`.env.example`](.env.example) to `.env` for local overrides; the loader
reads `.env` when it exists and ignores it when it does not.

Start with [the declaration](src/config.ts), follow its settings in
[`typespun.json`](typespun.json), then read [`src/load.ts`](src/load.ts) and
[`src/index.ts`](src/index.ts).
