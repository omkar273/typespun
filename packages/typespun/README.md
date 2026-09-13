# typespun

Runtime package for [Typespun](https://github.com/omkar273/typespun), a
generated configuration system for TypeScript.

```sh
bun add typespun
bun add --dev typespun-codegen
```

Application code imports `ConfigError` and class decorators from `typespun`.
Generated loaders use the versioned `typespun/generated` entry point.

See the [project README](https://github.com/omkar273/typespun#readme) for the
complete workflow, supported fields, source precedence, and current maturity.
