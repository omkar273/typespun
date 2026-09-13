# Interface example

This example marks an interface with `@typespun`, compiles YAML defaults, and
uses an explicit environment prefix.

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
