# Generated loader API

Every generated module exposes exactly the application-facing type and loader:

```ts
export type Config = /* selected root */;
export const loadConfig: (options?: LoadConfigOptions<Config>) => Config;
```

Import them from the generated file, not from `typespun`:

```ts
import { loadConfig, type Config } from './generated/typespun.js';

const config: Config = loadConfig({ source: process.env });
```

## `LoadConfigOptions<T>`

Defined in `typespun/generated` and inferred by `loadConfig()`:

```ts
interface LoadConfigOptions<T> {
  readonly envFiles?: readonly (
    string | { readonly path: string; readonly optional?: boolean }
  )[];
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly overrides?: DeepPartial<T>;
}
```

- `envFiles` defaults to `[]`. Files are read synchronously in array order;
  later files win. A string path is required. An object path is skipped only
  when `optional: true` and the file is missing; other read failures become
  `source_read_failed` issues.
- `source` defaults to `process.env`. Supplying any record, including `{}`,
  disables ambient lookup. Values must be strings or `undefined`.
- `overrides` defaults to none. Values are already typed, recursively merged by
  leaf, and validated without coercion. Unknown, unsafe, or cyclic paths fail.

The call is synchronous and returns a newly reconstructed object. Resolved
arrays are shallow-cloned. It throws `ConfigError` when issues exist.

## Generated ABI

The `typespun/generated` entry point also exports `createLoader<T>(schema)`,
`resolveConfig<T>(schema, options?)`, and `validateTypedValue(kind, value)`, plus
`DeepPartial`, `FieldKind`, `FieldSchema`, `GeneratedSchema`, and
`LoadConfigOptions`. These are public package exports for generated-code
compatibility; application code should normally use its generated module.

```ts
createLoader<T>(schema: GeneratedSchema):
  (options?: LoadConfigOptions<T>) => T

resolveConfig<T>(schema: GeneratedSchema,
  options?: LoadConfigOptions<T>): T

validateTypedValue(kind: FieldKind, value: unknown): string | undefined
```

`GeneratedSchema.protocolVersion` must be `1`. Manually authored schemas can
throw `ConfigError` with `incompatible_schema`; no compatibility is promised
for invented schema shapes.
