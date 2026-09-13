# Generated code

`typespun generate` emits a TypeScript module containing a serializable schema,
compiled defaults, a SHA-256 fingerprint comment, and two exports:

```ts
export type Config = TypespunConfig;
export const loadConfig = createLoader<Config>(schema);
```

The file contains no copied implementation of the resolver. It calls the
versioned `typespun/generated` ABI, keeping generated output small while making
the analyzed contract reviewable.

## Determinism

Fields, diagnostics, JSON keys, and serialized values use stable ordering. The
fingerprint includes the generator version, normalized project configuration,
analyzed schema, import specifier, and compiled defaults. With those inputs
unchanged, generation is byte-identical and reports `Unchanged`.

Writes use a same-directory temporary file followed by an atomic rename.
`typespun check` computes canonical output in memory and never writes; missing
output is treated as stale.

## Version-control workflow

```sh
bun run config:generate
git add src/generated/typespun.ts
bun run config:check
```

Commit the loader so reviews show configuration-contract changes and consumers
do not need the compiler at runtime. Regenerate whenever declarations,
defaults, `typespun.json`, relevant TypeScript module settings, or the codegen
version changes. Never edit the generated file manually.

Generated defaults are source code. Do not put credentials in inline or
JSON/YAML defaults.
