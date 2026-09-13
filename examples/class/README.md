# Class example

This example uses inert decorators, class-field defaults, an explicit
environment name, and secret-aware error handling.

From the repository root:

```sh
bun run build
APP_TOKEN=development-only bun run --filter typespun-example-class start
```

The first load intentionally prints a missing-secret issue without a value. The second
load succeeds and prints:

```text
Connecting to 127.0.0.1:3000
```
