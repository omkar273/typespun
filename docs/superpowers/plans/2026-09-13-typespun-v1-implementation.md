# Typespun v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Typespun v1 runtime, TypeScript analyzer, deterministic generator, CLI, initializer, and cross-runtime validation described by the approved specification.

**Architecture:** `typespun` owns inert annotations and a generated-schema ABI plus a synchronous resolver. `typespun-codegen` turns one TypeScript config root and optional JSON/YAML defaults into a committed thin loader. Work proceeds in dependency-aware waves: shared contracts first; runtime, analyzer, and project/default discovery in parallel; emitter and CLI integration next; consumer packaging last.

**Tech Stack:** TypeScript 6.0.3 Compiler API, Bun 1.4.1 workspaces and tests, Node.js 22/24, `dotenv` 17.4.2, `yaml` 2.9.1, `tsup` 8.5.1, Prettier 3.8.1.

**Spec:** `docs/superpowers/specs/2026-09-13-typespun-v1-design.md`

## Global Constraints

- Schema declarations are TypeScript-only; `.js` schemas are permanently unsupported.
- One exported interface or schema-only class root is allowed per `typespun.json`.
- Public packages are named `typespun` and `typespun-codegen`; the CLI executable is `typespun`.
- Generated files import the versioned ABI from `typespun/generated` and export only `Config` and `loadConfig`.
- Runtime precedence is inline defaults, compiled defaults, dotenv files left-to-right, source record, then typed overrides.
- Runtime loading is synchronous, does not mutate `process.env`, and returns a fresh plain object.
- Secret values never appear in Typespun diagnostics.
- Generated output is deterministic, contains no absolute paths or timestamps, and is committed.
- Production behavior follows strict red-green-refactor TDD; each task records the failing and passing command.
- Do not edit files owned by another concurrent task and do not revert unrelated work.

## Parallel execution map

```text
Task 1: shared contracts and package wiring
  ├── Task 2: runtime resolver ───────────────┐
  ├── Task 3: TypeScript analyzer ───────────┼── Task 5: emitter + generate/check
  └── Task 4: project/default discovery ─────┘              │
                                              Task 6: CLI + init
                                                        │
                                              Task 7: packaging + consumers + docs
```

Tasks 2, 3, and 4 have exclusive file ownership and should be dispatched concurrently after Task 1 passes review. Tasks 5 and 6 are sequential because the CLI consumes the generation service. Task 7 integrates all prior work.

---

### Task 1: Shared ABI, annotations, and package wiring

**Files:**

- Create: `packages/typespun/src/annotations.ts`
- Create: `packages/typespun/src/schema.ts`
- Create: `packages/typespun/src/generated.ts`
- Create: `packages/typespun/src/schema.test.ts`
- Create: `packages/typespun/src/annotations.test.ts`
- Create: `packages/typespun/tsup.config.ts`
- Create: `packages/codegen/src/contracts.ts`
- Modify: `packages/typespun/src/index.ts`
- Modify: `packages/typespun/package.json`
- Modify: `packages/codegen/package.json`
- Modify: `package.json`
- Modify: `bun.lock`

**Interfaces:**

- Produces `Config`, `Default`, `Env`, `Ignore`, `Key`, and `Secret` inert decorator factories.
- Produces `GeneratedSchema`, `FieldSchema`, `FieldKind`, `LoadConfigOptions<T>`, `DeepPartial<T>`, `ConfigIssue`, `ConfigError`, and `createLoader<T>()` contracts used by every later task.
- Produces codegen-owned `Diagnostic`, `FieldIR`, `AnalyzeResult`, and policy types in `packages/codegen/src/contracts.ts` so parallel compiler tasks share definitions without sharing files.
- Produces `validateTypedValue(kind, value): string | undefined` through `typespun/generated`; runtime overrides and compiled defaults use this one validator.
- `createLoader<T>()` may initially throw `new Error("resolver not implemented")`; Task 2 replaces that body.

- [ ] **Step 1: Write the annotation behavior test**

Create `annotations.test.ts` with decorated test declarations that call every decorator factory under the repository TypeScript configuration. Assert that invoking returned decorators with representative standard-decorator arguments returns `undefined` and does not mutate the target or context. The production change caught is a decorator accidentally returning a field initializer or changing the class.

```ts
import { describe, expect, test } from 'bun:test';
import { Config, Env, Secret } from './annotations.js';

describe('inert annotations', () => {
  test('do not replace or mutate decorated values', () => {
    class Example {}
    const context = { kind: 'class', name: 'Example' } as const;
    expect(Config()(Example, context)).toBeUndefined();
    expect(
      Env('PORT')(undefined, { kind: 'field', name: 'port' }),
    ).toBeUndefined();
    expect(
      Secret()(undefined, { kind: 'field', name: 'token' }),
    ).toBeUndefined();
    expect(Example).toEqual(Example);
  });
});
```

- [ ] **Step 2: Verify the annotation test fails for the missing module**

Run: `bun test packages/typespun/src/annotations.test.ts`

Expected: FAIL because `./annotations.js` cannot be resolved.

- [ ] **Step 3: Define shared contracts and inert decorators**

Use overload-compatible no-op decorator functions. Define the generated schema as JSON-compatible flattened field metadata:

```ts
export type FieldKind =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'array'; element: 'string' | 'number' | 'boolean' };

export interface FieldSchema {
  readonly propertyPath: readonly string[];
  readonly defaultsPath: readonly string[];
  readonly envName: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly secret: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: unknown;
  readonly optionalParents: readonly (readonly string[])[];
}

export interface GeneratedSchema {
  readonly protocolVersion: 1;
  readonly fields: readonly FieldSchema[];
}

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface LoadConfigOptions<T> {
  readonly envFiles?: readonly (
    | string
    | { readonly path: string; readonly optional?: boolean }
  )[];
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly overrides?: DeepPartial<T>;
}
```

`ConfigIssue` uses the five codes from the spec. `ConfigError` extends `Error`, sets `name = "ConfigError"`, and exposes a readonly `issues` array. Export public annotations and errors from `index.ts`; export schema ABI only through `generated.ts` and the package `./generated` subpath.

Define `FieldIR` in `packages/codegen/src/contracts.ts` as the codegen form of
`FieldSchema`, plus source locations required for diagnostics. Define
`validateTypedValue` once in the generated ABI and add table tests asserting
finite numbers, booleans, enum membership, homogeneous arrays, and rejection of
null or the wrong primitive kind. Run the new test before implementation and
confirm it fails because the validator is missing.

- [ ] **Step 4: Wire package names and dependencies through Bun**

Rename `@typespun/codegen` to `typespun-codegen`, keep its `typespun: workspace:*` dependency, add `dotenv@17.4.2` to `typespun`, and add `yaml@2.9.1` plus `typescript@6.0.3` to `typespun-codegen` using Bun workspace commands rather than hand-written dependency entries. Add `tsup@8.5.1` at the root. Update root filters from `@typespun/codegen` to `typespun-codegen`.

- [ ] **Step 5: Build dual runtime entry points**

Configure `tsup` to emit ESM `.js`, CommonJS `.cjs`, and declarations for `src/index.ts` and `src/generated.ts`. Define `exports["."]` and `exports["./generated"]` with `types`, `import`, and `require` conditions. Keep packages private until Task 7 package validation succeeds.

- [ ] **Step 6: Verify Task 1**

Run:

```sh
bun test packages/typespun/src/annotations.test.ts
bun run typecheck
bun run build
```

Expected: all commands exit 0, both `typespun` entry points build, and `typespun-codegen` resolves its workspace dependency.

- [ ] **Step 7: Commit Task 1**

```sh
git add package.json bun.lock packages/typespun packages/codegen/package.json packages/codegen/src/contracts.ts
git commit -m "feat: define Typespun package contracts"
```

---

### Task 2: Runtime resolution and redacted errors

**Files:**

- Create: `packages/typespun/src/runtime/coerce.ts`
- Create: `packages/typespun/src/runtime/dotenv.ts`
- Create: `packages/typespun/src/runtime/object.ts`
- Create: `packages/typespun/src/runtime/resolve.ts`
- Create: `packages/typespun/src/runtime/resolve.test.ts`
- Modify: `packages/typespun/src/generated.ts`

**Interfaces:**

- Consumes the exact schema and option types from Task 1.
- Produces `resolveConfig<T>(schema, options): T` and makes `createLoader<T>(schema)` return `(options?: LoadConfigOptions<T>) => T`.
- Owns all runtime implementation files; no other parallel task edits them.

- [ ] **Step 1: Write failing coercion and precedence tests**

Use a hand-authored `GeneratedSchema` with `port`, `enabled`, `mode`, `origins`, and secret `token` fields. Create real temporary dotenv files with `using temp = await makeTempDirectory()` test utility cleanup. Assert literal expected output for:

```ts
expect(
  load({
    envFiles: [firstPath, secondPath],
    source: { PORT: '4000' },
    overrides: { port: 5000 },
  }),
).toEqual({
  port: 5000,
  enabled: true,
  mode: 'production',
  origins: ['https://example.com'],
  token: 'runtime-token',
});
```

Add separate tests for strict number, boolean, enum, and JSON-array coercion; later dotenv files winning; source `{}` disabling ambient access; optional missing files; and no `process.env` mutation. Each name states the incorrect branch it catches.

- [ ] **Step 2: Verify the runtime tests fail at the resolver stub**

Run: `bun test packages/typespun/src/runtime/resolve.test.ts`

Expected: FAIL with `resolver not implemented`.

- [ ] **Step 3: Implement winner-first resolution**

Parse dotenv files with `dotenv.parse` without calling `dotenv.config`. Build one flat candidate map per source, select the highest-precedence candidate for each declared leaf, then coerce only the winner. Treat override values as typed values and validate without string coercion. Ignore `undefined` candidates.

Use null-prototype objects and reject `__proto__`, `prototype`, and `constructor` path segments. Deeply reconstruct the output from `propertyPath`; arrays and primitives replace rather than merge.

- [ ] **Step 4: Add failing aggregate-error and optional-parent tests**

Assert one `ConfigError` includes literal issue codes and paths for multiple missing/invalid fields. Assert secret issues omit `received` and the serialized error does not contain the supplied token. Assert an optional object remains absent with no descendants and requires its mandatory children after any descendant resolves.

- [ ] **Step 5: Implement aggregate validation and activation**

Collect issues without throwing inside a field loop. Activate an optional parent when any descendant has a winning value. After resolution, report missing required leaves whose parent chain is active. Preserve empty strings for string fields and reject them for every other kind.

- [ ] **Step 6: Verify Task 2**

Run:

```sh
bun test packages/typespun/src/runtime/resolve.test.ts
bun run --filter typespun typecheck
bun run --filter typespun build
```

Expected: all commands exit 0 and no test mutates ambient environment state.

- [ ] **Step 7: Commit Task 2**

```sh
git add packages/typespun/src
git commit -m "feat: resolve typed configuration sources"
```

---

### Task 3: TypeScript schema analyzer

**Files:**

- Create: `packages/codegen/src/analyzer/annotations.ts`
- Create: `packages/codegen/src/analyzer/analyze.ts`
- Create: `packages/codegen/src/analyzer/default-expression.ts`
- Create: `packages/codegen/src/analyzer/diagnostic.ts`
- Create: `packages/codegen/src/analyzer/ir.ts`
- Create: `packages/codegen/src/analyzer/analyze.test.ts`
- Create: `packages/codegen/src/testing/program.ts`

**Interfaces:**

- Produces `analyzeProgram(program, inputPath, envPrefix): AnalyzeResult` where a successful result contains `{ rootName, inputPath, fields: FieldIR[] }` using Task 1's contracts.
- Owns `analyzer/**` and `testing/program.ts`; no other parallel task edits them.

- [ ] **Step 1: Write the failing interface-analysis test**

Create an in-memory temporary TypeScript project containing a marked interface with nested fields, a string enum, `@key`, `@env`, `@secret`, `@ignore`, and JSON JSDoc defaults. Assert the hand-written flattened IR, including `DATABASE_HOST`, custom complete env names, defaults paths, and optional-parent paths.

- [ ] **Step 2: Verify interface analysis fails because the analyzer is missing**

Run: `bun test packages/codegen/src/analyzer/analyze.test.ts -t interface`

Expected: FAIL because `analyzeProgram` cannot be imported.

- [ ] **Step 3: Implement interface and type-graph analysis**

Create a real TypeScript `Program` in the test helper. Find exported `@typespun` interfaces in the selected input and require exactly one root. Traverse properties with the checker, follow imports, aliases, and interface inheritance, flatten objects, and detect circular type identities. Support primitives, supported arrays, string enums, and string-literal unions.

Parse each JSDoc tag separately. Parse `@default` text with `JSON.parse`; report a source-located diagnostic rather than throwing raw parser errors.

- [ ] **Step 4: Write the failing decorated-class test**

Use actual imports from `typespun`, including an aliased `Config` import. Assert class initializers for literals, arrays, object literals, negative numbers, enum members, `as const`, and `satisfies`. Add rejected fixtures for constructors, methods, accessors, static/private/protected fields, inheritance, and executable initializers.

- [ ] **Step 5: Implement symbol-resolved decorators and static defaults**

Use checker symbols to prove decorators originate from the `typespun` package. Never match only decorator text. Unwrap parenthesized, `as`, and `satisfies` expressions, and recursively evaluate only approved literals and string-enum members. Do not evaluate identifiers or function calls.

- [ ] **Step 6: Add failing unsupported-type and collision tests**

Cover generics, intersections, mixed unions, nullable unions, tuples, numeric enums, records, index signatures, recursive shapes, non-identifier keys, declaration merging, duplicate env names, and duplicate defaults paths. Each test asserts a stable diagnostic code and source location.

- [ ] **Step 7: Implement validation diagnostics**

Return all analyzer diagnostics in deterministic file/position/code order. Do not throw for user-authored schema errors. Ensure object-level secret and ignore annotations cascade and reject `@Env` on objects.

- [ ] **Step 8: Verify Task 3**

Run:

```sh
bun test packages/codegen/src/analyzer/analyze.test.ts
bun run --filter typespun-codegen typecheck
```

Expected: analyzer fixtures pass with stable IR and diagnostics.

- [ ] **Step 9: Commit Task 3**

```sh
git add packages/codegen/src/analyzer packages/codegen/src/testing
git commit -m "feat: analyze TypeScript config schemas"
```

---

### Task 4: Project configuration and compiled defaults

**Files:**

- Create: `packages/codegen/src/project/config.ts`
- Create: `packages/codegen/src/project/discovery.ts`
- Create: `packages/codegen/src/project/defaults.ts`
- Create: `packages/codegen/src/project/project.test.ts`

**Interfaces:**

- Produces `loadProjectConfig(options): ProjectConfigResult` with normalized absolute input/output/tsconfig/default paths and policy values.
- Produces `compileDefaults(document, fields, policies): CompiledDefaultsResult` returning normalized values, warnings, and errors without printing values.
- Consumes `FieldIR` from Task 1 and `validateTypedValue` from `typespun/generated`; owns `project/**` exclusively.

- [ ] **Step 1: Write failing convention-discovery tests**

Create temporary projects and assert: no `typespun.json` finds one `src/config.ts`; `.mts` and `.cts` mirror their output extensions; zero or multiple schema candidates fail; defaults discovery accepts zero or exactly one of the nine specified paths and rejects ambiguity.

- [ ] **Step 2: Verify discovery tests fail for the missing implementation**

Run: `bun test packages/codegen/src/project/project.test.ts -t discovery`

Expected: FAIL because project discovery exports are missing.

- [ ] **Step 3: Implement strict project configuration**

Parse `typespun.json` with `JSON.parse`, reject unknown top-level and nested keys, validate every enum policy, normalize `APP_` to `APP`, and resolve paths from the config directory. Without a config file, use the explicit CLI project directory. Find the nearest `tsconfig.json` from the resolved input.

- [ ] **Step 4: Write failing defaults-policy tests**

Use literal JSON and YAML documents to assert deep mapping by `defaultsPath`, unknown-key behavior for `error`, `warn`, and `ignore`, scalar/array type validation, secret-default policies, and rejection of prototype-pollution keys. Verify diagnostics contain paths but not supplied values.

- [ ] **Step 5: Implement safe defaults compilation**

Use `yaml` with custom tags disabled and bounded aliases. Require an object root. Walk the parsed document with own-property checks, map known leaves to `FieldIR`, validate values with Task 1's shared `validateTypedValue`, and deep-merge compiled values over inline defaults. Return warnings separately from errors.

- [ ] **Step 6: Verify Task 4**

Run:

```sh
bun test packages/codegen/src/project/project.test.ts
bun run --filter typespun-codegen typecheck
```

Expected: all discovery and defaults-policy tests pass.

- [ ] **Step 7: Commit Task 4**

```sh
git add packages/codegen/src/project
git commit -m "feat: discover Typespun projects and defaults"
```

---

### Task 5: Deterministic emitter and generation service

**Files:**

- Create: `packages/codegen/src/emitter/emit.ts`
- Create: `packages/codegen/src/emitter/fingerprint.ts`
- Create: `packages/codegen/src/emitter/emit.test.ts`
- Create: `packages/codegen/src/generate.ts`
- Create: `packages/codegen/src/generate.test.ts`

**Interfaces:**

- Consumes Task 2's generated ABI shape, Task 3's analyzer, and Task 4's project/default loaders.
- Produces `generateProject({ configPath?, projectDirectory?, mode }): Promise<GenerateResult>` where mode is `"write" | "check"`.
- `GenerateResult` contains `status: "unchanged" | "written" | "stale"`, output path, warnings, and diagnostics.

- [ ] **Step 1: Write the failing golden emitter test**

Provide a hand-authored root name, relative type import, fields, and compiled defaults. Assert an exact literal generated module containing the do-not-edit header, fingerprint, `typespun/generated` import, type-only source import, private schema, `Config` alias, and `loadConfig` export. Assert no timestamp or absolute temporary path appears.

- [ ] **Step 2: Verify the emitter test fails because emission is missing**

Run: `bun test packages/codegen/src/emitter/emit.test.ts`

Expected: FAIL because `emitGeneratedModule` cannot be imported.

- [ ] **Step 3: Implement canonical emission and fingerprints**

Serialize schema data with stable key ordering and safe JSON string escaping. Hash normalized configuration, analyzed IR, compiled defaults, generator version, and protocol version with SHA-256. Derive `.js`, `.mjs`, or `.cjs` type-import specifiers from the consumer module mode. Format with an internal deterministic printer rather than the consumer's Prettier installation.

- [ ] **Step 4: Write failing write/check integration tests**

Create real temporary projects. Assert write mode creates output, a second run reports unchanged without changing modification time, stale check returns `stale` without writing, and an analyzer/default error preserves the prior output bytes.

- [ ] **Step 5: Implement the generation pipeline**

Compose discovery, TypeScript program construction, analysis, defaults compilation, and emission. In write mode, write a temporary sibling with exclusive creation and rename it atomically after successful completion. Always remove a temporary file after a failed operation. In check mode, compare bytes in memory and never write.

- [ ] **Step 6: Verify Task 5**

Run:

```sh
bun test packages/codegen/src/emitter packages/codegen/src/generate.test.ts
bun run typecheck
```

Expected: golden and integration tests pass; repeated output is byte-identical.

- [ ] **Step 7: Commit Task 5**

```sh
git add packages/codegen/src/emitter packages/codegen/src/generate.ts packages/codegen/src/generate.test.ts
git commit -m "feat: generate deterministic config loaders"
```

---

### Task 6: CLI commands and non-destructive initialization

**Files:**

- Create: `packages/codegen/src/cli/main.ts`
- Create: `packages/codegen/src/cli/diagnostics.ts`
- Create: `packages/codegen/src/cli/init.ts`
- Create: `packages/codegen/src/cli/cli.test.ts`
- Create: `packages/codegen/src/bin.ts`
- Modify: `packages/codegen/src/index.ts`
- Modify: `packages/codegen/package.json`

**Interfaces:**

- Consumes `generateProject` from Task 5.
- Produces the `typespun init`, `typespun generate`, and `typespun check` executable contract.
- Owns all CLI files and the codegen package public/bin entry points.

- [ ] **Step 1: Write failing CLI exit-status tests**

Invoke the real CLI in temporary projects as a subprocess. Assert exit 0 for successful generate/check, exit 1 for stale output and schema errors, and exit 2 for unknown commands, missing flag values, or unusable project configuration. Assert warnings go to stderr without exposing fixture values.

- [ ] **Step 2: Verify CLI tests fail because the executable is missing**

Run: `bun test packages/codegen/src/cli/cli.test.ts -t exit`

Expected: FAIL because `src/bin.ts` does not exist.

- [ ] **Step 3: Implement argument parsing and diagnostics**

Use a small internal parser for the three commands and documented flags; do not add a CLI framework. Render filename, line, column, stable code, and correction. Enable color only for TTY stderr/stdout and when `NO_COLOR` is absent. Print concise success summaries and route warnings to stderr.

- [ ] **Step 4: Write failing init behavior tests**

Assert default init creates an interface schema, `typespun.json`, generated output when dependencies resolve, and missing `config:generate`/`config:check` scripts. Assert `--style class`, input/output/prefix flags, partial existing projects, idempotent reruns, and refusal to overwrite conflicting files. Assert package installation is never executed.

- [ ] **Step 5: Implement `typespun init`**

Detect `package.json` and `tsconfig.json`, inspect existing conventional files, create only missing artifacts, update only missing package scripts, and invoke generation after successful preflight. Use interface style by default. On missing packages, preserve created files and print exact Bun/npm/pnpm/yarn installation guidance without spawning an installer.

- [ ] **Step 6: Expose the executable**

Add a shebang entry at `src/bin.ts`, map `"typespun"` in `package.json#bin`, and configure the build to preserve the shebang. Export no stable programmatic compiler functions from the package root in v1.

- [ ] **Step 7: Verify Task 6**

Run:

```sh
bun test packages/codegen/src/cli/cli.test.ts
bun run typecheck
bun run build
```

Expected: every CLI contract test passes and the built binary executes `--help` under Bun and Node.js.

- [ ] **Step 8: Commit Task 6**

```sh
git add packages/codegen
git commit -m "feat: add Typespun CLI and initializer"
```

---

### Task 7: Consumer fixtures, package validation, CI, and user documentation

**Files:**

- Create: `examples/interface/src/config.ts`
- Create: `examples/interface/config/config.yaml`
- Create: `examples/interface/typespun.json`
- Create: `examples/interface/package.json`
- Create: `examples/interface/tsconfig.json`
- Create: `examples/interface/src/index.ts`
- Create: `examples/class/src/config.ts`
- Create: `examples/class/.env.example`
- Create: `examples/class/typespun.json`
- Create: `examples/class/package.json`
- Create: `examples/class/tsconfig.json`
- Create: `examples/class/src/index.ts`
- Create: `tests/consumer/consumer.test.ts`
- Create: `tests/package/package.test.ts`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `packages/typespun/package.json`
- Modify: `packages/codegen/package.json`

**Interfaces:**

- Consumes the complete runtime and CLI.
- Produces executable examples, package tarball proof, and the final repository validation contract.

- [ ] **Step 1: Write failing packed-consumer tests**

Pack both workspaces into a temporary directory and install the tarballs into minimal consumers. Assert imports from `typespun` and `typespun/generated`, declaration resolution, the `typespun` binary, ESM loading, CommonJS loading, and absence of tests/source/config secrets from tarballs. Assertions execute public APIs rather than grepping manifests.

- [ ] **Step 2: Verify consumer tests fail against private/incomplete packages**

Run: `bun test tests/package/package.test.ts tests/consumer/consumer.test.ts`

Expected: FAIL because packages are private or public artifacts are incomplete.

- [ ] **Step 3: Add executable interface and class examples**

The interface example demonstrates compiled YAML defaults, prefix mapping,
dotenv input, and typed overrides. The class example demonstrates inert
decorators, inline defaults, custom env names, and secret redaction. Commit both
generated files and add `config:check` to each example.

- [ ] **Step 4: Finalize publish manifests**

Remove `private` from both package manifests, add repository/homepage/bugs,
engines, side-effects, files, exports, bin, and publish configuration. Ensure
runtime dependencies do not include TypeScript, YAML, or codegen. Use workspace
dependency linking during development and verify packed manifests replace the
workspace protocol with publishable versions.

- [ ] **Step 5: Expand repository checks and CI**

Make `bun run check` run formatting, typechecking, all tests, builds, example
generation checks, and package tests. Add Node.js 22 and 24 jobs that install
packed artifacts and execute ESM/CommonJS fixtures; retain Bun 1.4.1 as the
primary workspace job.

- [ ] **Step 6: Document the public workflow**

Update README with installation, `typespun init`, interface/class declarations,
`typespun.json`, precedence, dotenv options, generated imports, errors, security
notes, and CI checking. Update CONTRIBUTING with fixture and generated-output
commands. Do not document deferred APIs.

- [ ] **Step 7: Verify the full v1 implementation**

Run:

```sh
bun install --frozen-lockfile
bun run check
git diff --check
```

Then run the built CLI under both runtimes:

```sh
bun packages/codegen/dist/bin.js --help
node packages/codegen/dist/bin.js --help
```

Expected: every command exits 0, all tests pass with no warnings, generated
examples are current, and package tarballs expose only intended files.

- [ ] **Step 8: Commit Task 7**

```sh
git add examples tests README.md CONTRIBUTING.md .github/workflows/ci.yml package.json packages/*/package.json bun.lock
git commit -m "feat: complete Typespun v1 developer workflow"
```
