# Typespun v1 Design

## Summary

Typespun is a TypeScript-only configuration system inspired by Viper's
centralized source handling. A developer declares one typed configuration root,
Typespun generates a committed loader, and the application resolves values from
compiled defaults, dotenv files, an environment-shaped source, and typed
overrides.

The primary experience is convention-first:

```ts
/** @typespun */
export interface AppConfig {
  port: number;
  database: {
    host: string;
    password: string;
  };
}
```

```ts
import { loadConfig } from './generated/typespun';

const config = loadConfig();
```

Properties are inferred automatically. Decorators and JSDoc annotations exist
only for exceptions such as renamed keys, custom environment names, defaults,
redaction, and ignored fields.

## Goals

- Provide a low-boilerplate, statically typed configuration declaration.
- Give interfaces and decorated classes equivalent generated behavior.
- Resolve multiple runtime sources using fixed, documented precedence.
- Validate configuration once at application startup and report all detectable
  problems together.
- Generate deterministic TypeScript that is committed and checked in CI.
- Support Node.js and Bun applications using ESM or CommonJS.
- Prevent secret values from appearing in Typespun diagnostics.

## Non-goals

Version 1 does not include:

- JavaScript schema declarations;
- arbitrary runtime source plugins or asynchronous providers;
- custom parsers for unsupported field types;
- multiple config roots in one Typespun project;
- runtime JSON or YAML configuration files;
- environment-variable interpolation in dotenv files;
- watch mode, interactive prompts, telemetry, or JSON CLI diagnostics;
- runtime class construction or dependency injection;
- provenance or `explainConfig()` as a public API.

JavaScript schema support is permanently out of scope. The other exclusions can
be reconsidered in later versions without weakening the v1 contract.

## Packages and public entry points

Typespun is published as two unscoped npm packages even when the repository is
owned by the Caygnus GitHub organization:

- `typespun` contains decorators, runtime types, `ConfigError`, and the generated
  loader ABI.
- `typespun-codegen` is a development dependency containing the compiler and the
  `typespun` executable.

The runtime exports:

```text
typespun             Public decorators, errors, and runtime types
typespun/generated   Versioned ABI intended for generated files
```

The code-generator package does not promise a programmatic compiler API in v1.
Its public contract is the CLI.

Typical installation is:

```sh
bun add typespun
bun add --dev typespun-codegen
```

The installed executable remains `typespun`, regardless of the package name:

```sh
bunx typespun generate
```

The package manifests declare only runtime versions covered by CI. The v1 test
baseline is Node.js 22 and 24 plus Bun 1.4.1. The runtime package publishes both
ESM and CommonJS exports.

## Project discovery

A project contains exactly one marked configuration root per `typespun.json`.
Imported nested declarations can live in other files because the compiler
follows the TypeScript program.

When `input` is omitted, Typespun looks for exactly one of:

```text
src/config.ts
src/config.mts
src/config.cts
```

No match is an error. Multiple matches are an ambiguity error. Typespun does not
scan the entire repository.

When `output` is omitted, it defaults to `src/generated/typespun` and mirrors
the selected input extension. An explicit output path may use `.ts`, `.mts`, or
`.cts`.

`tsconfig` defaults to the nearest `tsconfig.json` found from the input file.
The TypeScript program follows that configuration, including path aliases and
module resolution.

## Project configuration

`typespun.json` is optional and uses strict JSON. Its complete v1 shape is:

```json
{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  "tsconfig": "tsconfig.json",
  "envPrefix": "APP",
  "defaults": {
    "path": "config/config.yaml",
    "unknownKeys": "warn"
  },
  "secretDefaults": "warn"
}
```

All properties are optional. Unknown properties are errors.

Relative paths resolve from the directory containing `typespun.json`. Without a
configuration file, they resolve from the directory in which the CLI was
invoked. Configuration paths do not support environment interpolation.

`envPrefix` is absent by default. A trailing underscore is normalized, so
`"APP"` and `"APP_"` both produce `APP_PORT`.

`defaults` accepts either a path shorthand:

```json
{
  "defaults": "config/config.yaml"
}
```

or an options object. Omitting `defaults.path` retains conventional defaults-file
discovery while changing its policy:

```json
{
  "defaults": {
    "unknownKeys": "ignore"
  }
}
```

The `unknownKeys` policies are:

- `error`, the default: generation fails and reports every unknown path;
- `warn`: generation succeeds, reports each unknown path, and excludes it;
- `ignore`: generation silently excludes unknown paths.

The `secretDefaults` policies are:

- `warn`, the default: generation succeeds and warns for every secret field
  with a compiled default;
- `allow`: generation accepts secret defaults silently;
- `error`: generation rejects secret defaults.

Diagnostics identify paths and files but never print configuration values.

## Defaults-file discovery

Without an explicit path, Typespun searches these conventional candidates:

```text
config.yaml
config.yml
config.json
config/config.yaml
config/config.yml
config/config.json
src/config.yaml
src/config.yml
src/config.json
```

No match is valid. More than one match is an ambiguity error that lists the
candidate paths and asks the user to configure `defaults.path` explicitly.

The selected JSON or YAML file must contain an object at its root. It is parsed,
validated, normalized to the declared property types, and embedded in generated
output. JSON/YAML keys follow the TypeScript property path unless changed by
`@Key` or `@key`.

Compiled defaults override inline defaults. Object defaults merge recursively;
arrays and primitives replace the earlier value.

## Declaration model

### Interface form

An exported interface is marked with `@typespun`:

```ts
/** @typespun */
export interface AppConfig {
  /** @default 3000 */
  port: number;

  /**
   * @key db-url
   * @env DATABASE_URL
   */
  databaseUrl: string;

  /** @secret */
  apiKey: string;

  /** @ignore */
  internalState: string;
}
```

JSDoc default values use JSON syntax. Strings therefore require quotes, while
numbers, booleans, arrays, and objects use their normal JSON representations.
JSDoc annotations are recognized only in TypeScript source files.

### Class form

A class is marked with an imported `@Config()` decorator:

```ts
import { Config, Env, Ignore, Key, Secret } from 'typespun';

@Config()
export class AppConfig {
  port = 3000;

  @Key('db-url')
  @Env('DATABASE_URL')
  databaseUrl!: string;

  @Secret()
  apiKey!: string;

  @Ignore()
  internalState = 'unused';
}
```

Classes are schema-only declarations. Typespun never constructs them and makes
no `instanceof` guarantee. Config classes can contain only public instance data
properties. Custom constructors, methods, accessors, static fields,
private/protected fields, and class inheritance are generation errors.

Decorators are inert at runtime and work under standard and legacy TypeScript
decorator compilation. Codegen resolves imported symbols through the type
checker, so aliased imports remain valid and unrelated decorators with the same
textual name are not mistaken for Typespun annotations.

### Annotation semantics

The complete v1 annotation set is:

- `@Config()` / `@typespun`: mark the single config root.
- `@Default(value)` / `@default`: define an inline default.
- `@Key(name)` / `@key`: rename one JSON/YAML path segment.
- `@Env(name)` / `@env`: specify the complete environment name and bypass the
  configured prefix.
- `@Secret()` / `@secret`: redact a leaf or recursively redact an object subtree.
- `@Ignore()` / `@ignore`: exclude a field or object subtree.

`@Env` applies only to leaf fields. `@Key` accepts one segment rather than a
dotted path. V1 does not provide an annotation that opts a descendant out of an
inherited `@Secret` marker.

Duplicate effective environment names and duplicate JSON/YAML paths are
generation errors.

### Inline default evaluation

Class initializers and `@Default` accept only compile-time-safe values:

- string, finite number, and boolean literals;
- negative numeric literals;
- arrays and object literals recursively composed from supported values;
- supported string-enum members;
- TypeScript wrappers such as `as const` and `satisfies`.

Typespun does not execute expressions. Function calls, environment reads,
property access other than enum members, general constant references, and other
runtime expressions are rejected. Larger defaults belong in JSON/YAML.

Secret fields may have inline or compiled defaults. `@Secret` is a redaction
contract, not encryption or secure storage. Such values are embedded in the
committed generated file, so documentation directs users to use only disposable
local/test credentials and obtain production secrets from runtime sources.

## Supported field types

V1 supports:

- `string`;
- finite `number` values;
- `boolean`;
- string enums;
- string-literal unions;
- homogeneous arrays of supported string, number, or boolean primitives;
- nested object shapes;
- optional and `readonly` properties;
- supported type aliases and interface inheritance.

It rejects:

- `Date`, `bigint`, numeric enums, tuples, `Map`, `Set`, and functions;
- nullable unions and unions containing different primitive kinds;
- generic roots and unresolved generic fields;
- intersections, index signatures, and arbitrary `Record` types;
- recursive or circular schemas;
- computed, symbol, and non-identifier property names;
- declaration merging involving the root.

Imported declarations and interface inheritance are resolved through the
TypeScript type checker. Unsupported constructs produce diagnostics at their
source location.

## Environment naming

Automatic environment names are derived from TypeScript property paths. Each
identifier is converted to screaming snake case and nested segments are joined
with underscores:

```text
database.primaryHost -> DATABASE_PRIMARY_HOST
```

With `envPrefix: "APP"`:

```text
database.primaryHost -> APP_DATABASE_PRIMARY_HOST
```

No prefix is inferred from the root type or package name. An explicit `@Env`
value is the complete environment name and bypasses the prefix.

Automatic name collisions are generation errors. Environment lookup is exact
and case-sensitive.

## Generated module

The generated file is committed to version control and has this conceptual
shape:

```ts
// Generated by typespun-codegen. Do not edit.
// Schema fingerprint: ...

import { createLoader } from 'typespun/generated';
import type { AppConfig } from '../config.js';

export type Config = AppConfig;

const schema = {
  protocolVersion: 1,
  fields: [],
  defaults: {},
} as const;

export const loadConfig = createLoader<Config>(schema);
```

The generator reads the consumer's module and module-resolution settings to
emit a valid relative type import, including `.js` specifiers for Node16 and
NodeNext projects when required.

Only `Config` and `loadConfig` are public exports. Generated schema metadata is
private. It contains only JSON-compatible data and no evaluated expressions or
generated user functions.

The generated ABI has an explicit numeric protocol version. Runtime code rejects
unsupported versions with a message that instructs the user to align package
versions and regenerate. Generated files never import undocumented package
paths.

The fingerprint covers every input that affects output, including normalized
project configuration, schema IR, defaults, generator version, and protocol
version. Generation remains deterministic across machines; absolute paths and
timestamps are excluded.

## Runtime API

The generated loader accepts:

```ts
interface LoadConfigOptions<TConfig> {
  envFiles?: Array<string | { path: string; optional?: boolean }>;
  source?: Record<string, string | undefined>;
  overrides?: DeepPartial<TConfig>;
}
```

Example:

```ts
const config = loadConfig({
  envFiles: ['.env', { path: '.env.us', optional: true }],
  source: Bun.env,
  overrides: {
    port: 4000,
  },
});
```

`source` defaults to `process.env` when it exists. Passing `source: {}` disables
ambient environment access. A caller can fetch asynchronous secrets before
calling Typespun and pass the resulting flat record through `source`.

`overrides` contains already typed nested values. Runtime validation still
rejects unknown override keys and invalid values when JavaScript or an unsafe
cast bypasses TypeScript. Overrides are not string-coerced.

Every call returns a fresh plain object. Loading is synchronous and does not
attach hidden state to the result.

### Source precedence

Later sources win:

```text
inline defaults
< compiled JSON/YAML defaults
< first dotenv file
< later dotenv files
< source record
< typed overrides
```

Resolution selects the winning raw value for each leaf before coercion and
validation. An invalid lower-precedence runtime value therefore does not fail
when a valid higher-precedence value replaces it.

Objects merge recursively. Arrays and primitives replace earlier values.
`undefined` means not provided and does not erase a lower-precedence value. Null
is unsupported and there is no deletion marker in v1.

### Dotenv behavior

Dotenv files are loaded only when explicitly supplied to `envFiles`; Typespun
does not discover them automatically. Relative paths resolve from
`process.cwd()` because they are runtime inputs.

Files are UTF-8 and use standard dotenv syntax. Later files override earlier
files, and the last duplicate declaration within a file wins. Variable
interpolation is not supported. Parsing never mutates `process.env`.

Missing required files produce `source_read_failed`. Missing optional files are
silently skipped. Unrelated names are ignored because Typespun reads only the
environment names declared by the generated schema.

### Coercion

- Strings are preserved without implicit trimming.
- Numbers accept finite decimal syntax and reject empty strings, `NaN`,
  infinities, hexadecimal syntax, and trailing characters.
- Booleans accept only `true` and `false`, case-insensitively.
- String enums and literal unions compare case-sensitively.
- Arrays use JSON array syntax and validate every element.
- Empty strings are valid strings and invalid numbers, booleans, enums, and
  arrays.

Nested objects are reconstructed from leaf values.

### Optional object activation

An optional object remains absent when none of its descendants resolve. If any
descendant resolves, the object becomes active and all required children must
resolve. Optional children may remain absent.

For example, given:

```ts
interface AppConfig {
  database?: {
    host: string;
    port?: number;
  };
}
```

no `DATABASE_*` values produce no `database` property. Providing only
`DATABASE_PORT` activates `database` and produces a missing-value issue for
`database.host`.

## Errors and diagnostics

Runtime resolution aggregates all detectable issues and throws one
`ConfigError`:

```ts
interface ConfigIssue {
  code:
    | 'missing_value'
    | 'invalid_value'
    | 'unknown_override'
    | 'source_read_failed'
    | 'incompatible_schema';
  path: string;
  source?: string;
  envKey?: string;
  message: string;
  received?: unknown;
}
```

`received` is always absent for secret fields. Messages and nested causes also
omit secret values. V1 does not include a non-throwing `tryLoadConfig` wrapper.

Unrelated keys in environment-shaped sources and dotenv files are ignored.
Unknown keys in overrides are runtime errors. Unknown defaults-file keys follow
the configured `unknownKeys` policy.

Codegen diagnostics are separate from `ConfigError`. Human-readable diagnostics
include filename, line, column, a stable error code, and a suggested correction
when possible.

## Compiler architecture

`typespun-codegen` uses the TypeScript Compiler API directly. It does not use a
custom parser or `ts-morph`.

The compiler pipeline is:

```text
project/config discovery
-> TypeScript Program and type checker
-> root and annotation analysis
-> Typespun intermediate representation
-> defaults parsing and validation
-> deterministic emitter
-> check or atomic write
```

Compiler nodes do not cross the analyzer boundary. The intermediate
representation is serializable and describes flattened leaves:

```ts
interface FieldIR {
  propertyPath: string[];
  defaultsPath: string[];
  envName: string;
  kind: FieldKind;
  required: boolean;
  secret: boolean;
  defaultValue?: unknown;
  optionalParents: string[][];
}
```

Arrays are leaf values. Object structure is retained through property paths and
optional-parent metadata. Defaults validation and emission can therefore be
tested without constructing compiler nodes.

## CLI

### `typespun init`

Initialization is deterministic, non-interactive, and non-destructive. It:

1. verifies `package.json` and a usable `tsconfig.json`;
2. discovers an existing schema or creates `src/config.ts`;
3. creates `typespun.json` when missing;
4. adds `config:generate` and `config:check` scripts when missing;
5. performs the first generation when dependencies are available;
6. prints the exact package-manager command when dependencies are missing;
7. refuses to overwrite conflicting files.

The default schema style is an interface. Supported init flags are:

```text
--style interface|class
--input <path>
--output <path>
--env-prefix <prefix>
```

### `typespun generate`

Generation discovers and validates all inputs, creates canonical output in a
temporary sibling file, and atomically replaces the destination only when bytes
change. A failure leaves an existing generated file untouched.

### `typespun check`

Check runs the same pipeline entirely in memory. It fails when generated output
is absent or differs from canonical output and never modifies files.

`generate` and `check` accept `--config <path>`. No other generation overrides
are supported in v1.

### CLI process contract

- Exit `0`: success, including success with warnings.
- Exit `1`: schema/default validation failure, generation failure, or stale
  generated output.
- Exit `2`: invalid invocation or unusable project configuration.

Warnings use stderr but do not fail the command. Successful output is concise.
Color is enabled only for terminals and respects `NO_COLOR`. Commands perform no
telemetry or network access.

## Safety boundaries

- Generated data is serialized rather than interpolated as executable source.
- Keys capable of prototype pollution, including `__proto__`, `prototype`, and
  `constructor`, are rejected in schemas, defaults, and overrides.
- YAML parsing disables custom executable tags and enforces alias-expansion
  limits.
- Secret values are omitted from errors, warnings, causes, and debug output.
- Dotenv parsing does not mutate global environment state.
- Atomic output replacement prevents partial generated files.
- Runtime sources are read only for declared environment names.
- Typespun never executes schema constructors, initializers, or arbitrary default
  expressions.

## Testing strategy

### Analyzer fixtures

Fixtures cover interfaces, schema-only classes, aliases, inheritance, enums,
nested objects, annotation aliases, both decorator modes, and every rejected
construct. Diagnostics assert stable codes and source locations.

### Runtime table tests

Table-driven tests cover every coercion, invalid input, source-precedence
combination, deep merge, array replacement, optional-object activation,
aggregate error, and redaction path.

### Golden generation tests

Golden fixtures assert exact generated output. Repeated generation must be
byte-for-byte identical. Check-mode tests cover missing, modified, and stale
output.

### Security and robustness tests

Tests cover prototype-pollution keys, safely serialized malicious strings,
secret non-disclosure, circular schemas, duplicate effective names, bounded YAML
aliases, and preservation of prior output after generation failure.

### Consumer fixtures

Packed-package fixtures exercise Node.js ESM, Node.js CommonJS, Bun, interfaces,
decorated classes, clean and partial initialization, package exports, type
declarations, CLI binaries, and published file contents.

The repository `bun run check` command runs formatting, typechecking, unit and
integration tests, builds, generated-output checks, and package validation. CI
runs the declared Node.js matrix and pinned Bun version.

## Deferred extensions

The v1 architecture deliberately leaves space for:

- `explainConfig()` and CLI provenance output;
- asynchronous or pluggable runtime sources;
- runtime JSON/YAML providers;
- custom coercion functions;
- watch mode and machine-readable CLI diagnostics;
- multiple named roots;
- a user-owned class hydration factory.

These features must be introduced explicitly. None may change v1 precedence,
silently execute schema code, or weaken redaction guarantees.
