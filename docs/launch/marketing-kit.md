# Typespun launch kit

## Core descriptions

**One sentence:** Declare configuration once in TypeScript, then generate the
loader that resolves sources, validates values at startup, and redacts secrets
in its own diagnostics.

**25 words:** Typespun turns one TypeScript configuration declaration into a
deterministic, typed loader with explicit source precedence, startup validation,
and secret-aware diagnostics for Node.js and Bun applications.

**50 words:** Typespun removes the repeated work between configuration types,
environment parsing, and validation schemas. Declare an interface or decorated
class, run the generator, and commit a deterministic TypeScript loader. At
startup it resolves defaults, dotenv, environment values, and typed overrides,
then reports missing and invalid fields together in one ConfigError at runtime.

**100 words:** Typespun is a generated configuration system for TypeScript.
Instead of maintaining a TypeScript type beside environment parsing and a
separate validation schema, you mark one interface or schema-only class and run
`typespun generate`. The committed loader resolves inline and JSON/YAML
defaults, dotenv files, an environment-shaped record, and typed overrides in a
documented order. It converts supported environment strings, validates every
field at startup, and aggregates failures in one `ConfigError`. Secret fields
omit received values from Typespun diagnostics. The focused 0.1 scope supports
Node.js 22/24 and Bun 1.4.1+, ESM and CommonJS runtime consumers, and
deterministic CI checks in one committed module.

**GitHub description:** Declare typed configuration once; generate a validated
Node.js/Bun loader with explicit precedence and secret-aware diagnostics.

**npm — `typespun`:** Runtime, decorators, errors, and generated-loader ABI for
typed TypeScript configuration.

**npm — `typespun-codegen`:** TypeScript schema analyzer and CLI that emits
deterministic Typespun configuration loaders.

## Taglines

1. Declare configuration once. Generate the loader.
2. TypeScript in; validated configuration out.
3. One declaration from environment to typed object.
4. Commit the configuration contract, not the boilerplate.
5. Explicit sources. Startup validation. Types that stay aligned.

## Show HN

**Title:** Show HN: Typespun – generate a typed configuration loader from a
TypeScript declaration

**First comment:** I built Typespun after repeating the same configuration
contract in TypeScript types, environment parsing, and validation schemas.
Typespun takes a narrower approach: mark one exported interface or schema-only
class, run a compiler, and commit the generated loader.

The loader resolves inline defaults, compiled JSON/YAML defaults, dotenv files,
an environment-shaped record, and typed overrides in a fixed order. It validates
at startup and returns all detectable issues together. Fields marked secret do
not attach received values to Typespun diagnostics.

The design is deliberately generated rather than reflection-based: the output
is reviewable, checkable in CI, and does not instantiate configuration classes.
The initial scope supports a small set of leaf types and synchronous sources;
there is no provider plugin system or runtime config-file loading. I’d value
feedback on that boundary and on the generated-code workflow.

## r/typescript

**Title:** Typespun: declare config once in TypeScript, then generate the loader

I kept seeing configuration expressed three times: a TypeScript type, manual
`process.env` parsing, and a runtime schema. Typespun makes the TypeScript
declaration the build-time source of truth.

```ts
/** @typespun */
export interface AppConfig {
  server: { port: number };
  /** @secret */ token: string;
}
```

`typespun generate` emits a committed `loadConfig()` module. It supports
documented precedence across defaults, dotenv, environment values, and typed
overrides; aggregates startup errors; and omits secret candidates from its own
diagnostics. Interfaces and decorated classes are supported. The 0.1 scope is
intentionally small. I’d especially appreciate feedback on the generated-code
workflow, supported type boundary, and source precedence.

## TypeScript Community Discord

I’m preparing Typespun 0.1: declare an interface or decorated class, then
generate and commit a typed configuration loader. It handles defaults, dotenv,
environment values, and typed overrides with fixed precedence, aggregates
startup errors, and redacts secret candidates in its own diagnostics. The scope
is intentionally narrow. Feedback on the API and examples is welcome.

## Bun Discord

Typespun is a Bun-tested configuration generator for TypeScript. One declaration
produces a committed `loadConfig()` module; the runtime supports Bun 1.4.1+ and
the repository uses Bun for builds, tests, examples, and package checks. I’d
love feedback from Bun users on the install and generated-code workflow.

## TypeScript Weekly pitch

Typespun generates a deterministic configuration loader from one TypeScript
interface or decorated class. The loader resolves defaults, dotenv, environment
records, and typed overrides; validates at startup; and aggregates secret-aware
diagnostics. The pre-release project includes runnable Bun examples, packed
Node.js consumer tests, and a CI check for stale generated output.

## LinkedIn

Configuration types, environment parsing, and validation schemas often describe
the same fields three times.

I built Typespun around a narrower idea: declare configuration once in
TypeScript, then generate the loader.

The generated file is deterministic and reviewable. At startup it resolves
defaults, dotenv, environment values, and typed overrides, then reports all
detectable issues together. Secret fields omit received values from Typespun’s
own diagnostics.

Typespun 0.1 is deliberately small and pre-release. I’m sharing the design and
runnable examples to get feedback on the trade-off: one generation step in
exchange for one configuration declaration.

## X / Bluesky thread

**1/4** TypeScript types disappear at runtime, but configuration arrives as
strings. That often leaves three copies of one contract: types, parsing, and
validation.

**2/4** Typespun takes one interface or decorated class and generates a typed
`loadConfig()` module. Commit it, review it, and check it in CI.

**3/4** The loader has fixed precedence: inline defaults → compiled defaults →
dotenv → environment source → typed overrides. Startup failures are aggregated;
secret candidates are omitted from Typespun diagnostics.

**4/4** The 0.1 scope is intentionally narrow: Node.js 22/24, Bun 1.4.1+,
synchronous sources, and a focused type set. The question is simple: is a
generation step worth eliminating the duplicated configuration contract?

## Launch-day FAQ

### Why generate code instead of reflecting at runtime?

Interfaces do not exist at runtime. Generation lets an interface remain the
declaration, makes the runtime schema inspectable, and gives CI a deterministic
artifact to check. The trade-off is a generation step and committed output.

### Does `@Secret` encrypt values?

No. It redacts received values and type-specific detail from Typespun-generated
diagnostics. Use a secret manager for storage and control application logging.

### Does it load JSON/YAML at runtime?

No. Optional JSON/YAML defaults are validated and embedded during generation.
Runtime inputs are dotenv files, an environment-shaped source, and typed
overrides.

### Can I add AWS Secrets Manager or another provider?

Not in 0.1. There is no asynchronous or custom source plugin API. Fetch a value
before loading and pass a typed override when that fits your application.

### Does it support every TypeScript type?

No. It supports strings, finite numbers, booleans, string enums/literal unions,
arrays of primitive supported types, and nested object shapes. Unsupported
constructs fail generation.

### Is it stable?

It is published as pre-release software at version 0.1.0. Pin versions and
review generated diffs during early adoption.

### What does “Node.js and Bun support” mean?

The package engines declare Node.js 22/24 and Bun 1.4.1+. CI runs packed
consumers on Node 22 and 24 and the repository checks on Bun 1.4.1. Other
versions are not claimed.

## Honest approach comparison

| Approach                        | Source of truth                                | Runtime dependency     | Main strength                                                                      | Main cost                                                                                                  |
| ------------------------------- | ---------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Manual environment parsing      | Application code                               | None beyond your code  | Maximum control and no generator                                                   | Repeated parsing, error aggregation, and precedence logic are yours to maintain.                           |
| Schema-first runtime validation | Runtime schema                                 | Schema library         | Rich runtime validation and ecosystems; often supports transforms and custom types | TypeScript types may be inferred from or coordinated with the runtime schema; bundle/runtime work remains. |
| TypeScript-only typing          | Type declaration                               | None                   | Zero schema ceremony                                                               | Types disappear at runtime, so external values are not validated by the type alone.                        |
| Typespun                        | TypeScript declaration plus generated artifact | Small Typespun runtime | Interfaces/classes drive a reviewable loader with fixed precedence                 | Requires code generation, committed output, and a deliberately limited type/source model.                  |

Typespun is not a universal replacement for schema libraries. Choose it when a
small generated configuration contract fits better than a broad runtime schema
system; choose another approach when you need custom transforms, dynamic
schemas, provider plugins, or richer validation.
