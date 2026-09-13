# typespun-codegen

Compiler and CLI package for
[Typespun](https://github.com/omkar273/typespun). Install it as a development
dependency beside the `typespun` runtime:

```sh
bun add typespun
bun add --dev typespun-codegen
```

The package installs the `typespun` executable. Its supported contract is the
CLI:

```sh
typespun init
typespun generate
typespun check
```

See the [CLI reference](https://github.com/omkar273/typespun/blob/main/docs/api/cli.md)
for options, files, and exit behavior. No programmatic compiler API is promised
in version 0.1.
