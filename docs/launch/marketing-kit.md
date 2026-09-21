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
then reports missing and invalid fields together in ConfigError at runtime.

**100 words:** Typespun is a generated configuration system for TypeScript.
Instead of maintaining a TypeScript type beside environment parsing and a
separate validation schema, you mark one interface or schema-only class and run
`typespun generate`. The committed loader resolves inline and JSON/YAML
defaults, dotenv files, an environment-shaped record, and typed overrides in a
documented order. It converts supported environment strings, validates every
field at startup, and aggregates failures in one `ConfigError`. Secret fields
omit received values from Typespun diagnostics. The focused 0.1 scope supports
Node.js 22 or newer and Bun 1.4.1+, ESM and CommonJS runtime consumers, and
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

**Submit:** `https://typespun.vercel.app` — the landing page leads with the
before/after and the playground is one click away. Link the repository in the
first comment; do not make people hunt for the code.

**Title:** Show HN: Typespun – generate a typed config loader from a TypeScript
interface

**First comment:**

I kept writing the same configuration field three times: once as a TypeScript
type, once as `process.env` parsing, and once as a validation schema. They
drift, and the drift only shows up in production.

Typespun inverts the usual order. Instead of writing a schema and deriving a
type from it, you mark one exported interface and a compiler generates the
loader:

    /** @typespun */
    export interface AppConfig {
      server: { host: string; port: number };
      /** @secret */ apiToken: string;
    }

`typespun generate` emits a `loadConfig()` module you commit. There is a
playground that runs the real analyzer and the real runtime in your browser, so
you can see the generated output without installing anything:
https://typespun.vercel.app/playground

Two things in there I have not seen done well elsewhere, and they are the
reason the project exists:

**A precedence chain across five source kinds.** Each leaf resolves
independently, highest wins: typed overrides, an explicit source or
`process.env`, dotenv files, compiled JSON/YAML defaults, then inline defaults.
It picks the highest-precedence _defined_ candidate before coercion, so an
invalid lower-precedence value cannot break a valid higher-precedence one.

**Secret-aware diagnostics.** A field marked `@secret` omits its received value
_and_ type-specific detail from the error output, while non-secret fields in the
same error still show theirs. The playground's "Broken secret" preset
demonstrates it side by side. This is redaction in Typespun's own diagnostics —
not encryption, and it cannot scrub your application's logs.

Honest about what it is not: the type model is deliberately narrow (strings,
finite numbers, booleans, string enums, arrays of those, nested objects — no
dates, records, tuples or transforms), there are no async or plugin sources, it
needs two installs where every alternative needs one, and it is pre-1.0 with
essentially no adoption. If your config is eight flat environment variables, a
Zod schema is simpler and you should use that — the comparison page says so
outright: https://typespun.vercel.app/compare

The thing I would most like criticised is the central trade: a build step and a
committed artifact, in exchange for the TypeScript declaration being the only
place the contract lives. I think it is worth it past a certain config size and
I would like to hear where that line actually falls for people.

Code: https://github.com/omkar273/typespun

**If asked "why not just Zod?"** — answer plainly rather than defensively. Zod
is excellent and infers the type from the schema, so it is not three copies. The
real difference is that the declaration lives in TypeScript where the rest of
the application already is, the artifact is reviewable in a diff and checkable
in CI, and the precedence and redaction behaviour is built in rather than
assembled. That is a narrower claim than "Zod is worse", and it is the true one.

## r/typescript

**Title:** I generate my config loader from a TypeScript interface instead of
writing a schema

Configuration usually gets described three times — a TypeScript type,
`process.env` parsing, and a runtime schema — and the copies drift.

Typespun makes the interface the source of truth and generates the loader:

```ts
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  mode: 'development' | 'production';
  /** @secret */ apiToken: string;
}
```

`typespun generate` writes a committed `loadConfig()` module. At startup it
resolves typed overrides → explicit source or `process.env` → dotenv → compiled
JSON/YAML defaults → inline defaults, validates every field, and throws one
error with every problem rather than the first one.

There is a browser playground that runs the actual analyzer and runtime, so you
can try it without installing: https://typespun.vercel.app/playground

Deliberate limits: narrow type set, no transforms, no async sources, two
packages to install, pre-1.0. If you have a handful of flat env vars, Zod is
simpler and I would use that instead.

Runnable Hono and Fastify examples are in the repo. I would especially like
feedback on whether the codegen step earns its keep, and on the supported type
boundary.

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

**4/4** The 0.1 scope is intentionally narrow: Node.js 22+, Bun 1.4.1+,
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

Typespun is pre-release. See the [changelog](../../CHANGELOG.md) for the
current version; pin versions and review generated diffs during early adoption.

### What does “Node.js and Bun support” mean?

The package engines declare Node.js 22 or newer and Bun 1.4.1+. CI runs packed
consumers on Node.js 22, 24, and 26, and the repository checks on Bun 1.4.1. Other
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
