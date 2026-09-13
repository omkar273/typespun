# `typespun.json` reference

`typespun.json` is optional. It is strict JSON; unknown keys and wrong value
types are errors. Relative paths resolve from the file’s directory. When the
file is absent, conventions resolve from the CLI working directory.

```json
{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  "tsconfig": "tsconfig.json",
  "envPrefix": "APP",
  "defaults": {
    "path": "config/config.yaml",
    "unknownKeys": "error"
  },
  "secretDefaults": "warn"
}
```

| Key              | Type                        | Default                                       | Contract                                                                                    |
| ---------------- | --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `input`          | string                      | convention                                    | `.ts`, `.mts`, or `.cts` schema input.                                                      |
| `output`         | string                      | `src/generated/typespun` plus input extension | Generated module; must differ from input.                                                   |
| `tsconfig`       | string                      | nearest `tsconfig.json` above input           | TypeScript project used for analysis and import style.                                      |
| `envPrefix`      | string                      | absent                                        | Prefix for generated environment names. Trailing underscores are removed during generation. |
| `defaults`       | string or object            | convention or none                            | Explicit defaults path, or defaults options.                                                |
| `secretDefaults` | `warn`, `allow`, or `error` | `warn`                                        | Policy for any secret leaf with a compiled or inline default.                               |

`defaults` can be a path:

```json
{ "defaults": "config/config.json" }
```

Or an options object:

```json
{
  "defaults": {
    "path": "config/config.yaml",
    "unknownKeys": "warn"
  }
}
```

`unknownKeys` defaults to `error`; `warn` excludes unknown values with a
warning, and `ignore` excludes them silently. Unsafe keys are always errors.
JSON/YAML roots must be objects. Values are validated against declared leaves
at generation time. Keys follow property paths or `@key`/`@Key` aliases.

Without explicit paths, the input candidates are `src/config.ts`,
`src/config.mts`, and `src/config.cts`; exactly one must exist. Defaults
candidates, in search order, are `config.yaml`, `config.yml`, `config.json`,
`config/config.yaml`, `config/config.yml`, `config/config.json`,
`src/config.yaml`, `src/config.yml`, and `src/config.json`. Zero defaults files
is valid; more than one is an ambiguity error.

`envPrefix: "APP"` and `envPrefix: "APP_"` both generate `APP_PORT`. Explicit
`@Env('PORT')`/`@env PORT` bypasses the prefix.
