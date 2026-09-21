/**
 * Programmatic entry point for the TypeSpun code generator.
 *
 * This surface exposes the analyze → fingerprint → emit pipeline so tooling
 * (the playground, editor integrations) can run it without shelling out to the
 * CLI or deep-importing `dist/` paths. Application code should not use it:
 * import the generated module that `typespun-codegen` writes instead.
 *
 * Everything re-exported here is **experimental and unstable while the package
 * is on 0.x**. It is not covered by semantic versioning, and it may change or
 * be removed in any release. The CLI and the generated module are the
 * supported interfaces.
 *
 * The three re-exported implementation modules — `analyzer/analyze.js`,
 * `emitter/emit.js` and `emitter/fingerprint.js` — are free of Node builtins
 * and run unchanged in a browser bundle, given a `ts.Program` built over an
 * in-memory `ts.CompilerHost`. Note that `typescript` itself is still a large
 * dependency, and the rest of this package (the CLI, project discovery and
 * `generate.js`) is deliberately Node-only.
 *
 * @experimental
 * @module
 */

export { analyzeProgram } from './analyzer/analyze.js';
export type {
  AnalyzeResult,
  Diagnostic,
  FieldIR,
  RootExport,
  SecretDefaultsPolicy,
  SourceLocation,
  UnknownKeysPolicy,
} from './contracts.js';
export {
  type EmitGeneratedModuleOptions,
  emitGeneratedModule,
  relativeTypeImportSpecifier,
} from './emitter/emit.js';
export {
  createFingerprint,
  type FingerprintInput,
  stableJson,
} from './emitter/fingerprint.js';
