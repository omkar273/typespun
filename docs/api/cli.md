# CLI reference

Install `typespun-codegen` as a development dependency. Its executable is
`typespun`. The package has no supported programmatic codegen API.

```text
typespun <command> [options]
```

`typespun`, `typespun --help`, and command-level `--help` print help and exit
`0`. Unknown commands/options and missing or duplicate option values exit `2`.

## `typespun init`

```text
typespun init [--style interface|class] [--input <path>]
              [--output <path>] [--env-prefix <prefix>]
```

Defaults are interface style, `src/config.ts`, matching
`src/generated/typespun.ts`, and no prefix. Paths must end in `.ts`, `.mts`, or
`.cts`.

The command requires a valid `package.json` and usable `tsconfig.json`. It
creates a declaration, `config.yaml`, and `typespun.json` when no corresponding
files exist, adds missing `config:generate`/`config:check` scripts without
replacing existing scripts, and performs first generation when dependencies are
installed. A new default schema gets `port: 3000`; an existing schema gets an
empty defaults object. An existing conventional JSON/YAML defaults file is
preserved and discovered instead. A newly created `typespun.json` uses comments
to show every optional setting and allowed policy value while leaving unused
options disabled. `init` never runs a package installer; if dependencies are
absent it prints manager-specific commands.

`init` is idempotent for an initialized project. It refuses conflicting flags,
input/output aliases, symlinks that alias them, and any output not recognizable
as Typespun-generated. It does not offer a force-overwrite option.

```sh
typespun init --style class --env-prefix APP
```

Typical output:

```text
Created src/config.ts.
Created config.yaml.
Created typespun.json.
Added config:generate and config:check scripts.
Generated src/generated/typespun.ts.
```

Exit `0` means initialization completed or stopped safely for dependency
installation. Schema/generation diagnostics exit `1`; unusable project setup or
conflicting options exit `2`.

## `typespun generate`

```text
typespun generate [--config <path>]
```

Reads `typespun.json` (or the explicit path), the resolved schema and
`tsconfig.json`, and an optional JSON/YAML defaults file. It atomically writes
the configured output only when canonical content differs.

```text
Generated src/generated/typespun.ts.
Unchanged src/generated/typespun.ts.
```

Warnings go to stderr. Success exits `0`, schema/default/output diagnostics
exit `1`, and unusable TypeScript/project configuration exits `2`.

## `typespun check`

```text
typespun check [--config <path>]
```

Reads the same files as `generate` and compares the expected bytes with the
output. It never writes. Current output prints
`src/generated/typespun.ts is up to date.` and exits `0`; missing or stale
output prints a regeneration instruction and exits `1`. Other failures use the
same exit rules as `generate`.

Only `--config` is accepted by `generate` and `check`, and it may appear once.
All relative configured paths resolve from the chosen config file’s directory.
