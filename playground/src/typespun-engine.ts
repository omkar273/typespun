/**
 * The one module in the playground that knows about TypeSpun.
 *
 * Everything else talks to `loadEngine()` and the plain data it returns, so
 * the whole app is decoupled from how the pipeline is imported. Two package
 * entry points are used:
 *
 *   - `typespun-codegen`  — the experimental programmatic surface
 *     (`analyzeProgram` → `createFingerprint` → `emitGeneratedModule`). These
 *     three modules are free of Node builtins.
 *   - `typespun/generated` — the real runtime. `createLoader(schema)` returns
 *     exactly the `loadConfig` the emitted module exports, so the Live run tab
 *     runs the shipped resolver rather than a browser re-implementation. It is
 *     browser-safe as long as an explicit `source` is passed and `envFiles`
 *     never is; see `vite.config.ts` for the two unreachable-import shims.
 *
 * TypeScript itself (~10 MB parsed) is only pulled in when `loadEngine()` is
 * first awaited, which is after first paint.
 */

import type { Diagnostic, FieldIR } from 'typespun-codegen';
import type { ConfigIssue } from 'typespun';
import type { GeneratedSchema } from 'typespun/generated';

export type { ConfigIssue, Diagnostic, FieldIR, GeneratedSchema };

/** The virtual path the user's interface lives at inside the fake program. */
export const INPUT_PATH = '/config.ts';

/** What the emitted module imports the config type from. */
const TYPE_IMPORT = './config.js';

export interface CompileResult {
  /** TypeSpun's own analyzer diagnostics (unsupported declarations, etc). */
  readonly diagnostics: readonly Diagnostic[];
  /** Syntactic + semantic diagnostics from the TypeScript compiler itself. */
  readonly typeErrors: readonly CompilerMessage[];
  readonly fields: readonly FieldIR[];
  readonly rootName?: string;
  readonly fingerprint?: string;
  /** The emitted loader module, or undefined when analysis failed. */
  readonly generated?: string;
  readonly schema?: GeneratedSchema;
}

export interface CompilerMessage {
  readonly code: number;
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export type RunResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly issues: readonly ConfigIssue[] }
  | {
      readonly ok: false;
      readonly issues: readonly ConfigIssue[];
      readonly crash: string;
    };

export interface Engine {
  readonly typescriptVersion: string;
  compile(source: string, envPrefix: string): CompileResult;
  /**
   * Runs the generated loader against a fake environment. `source` is always
   * passed, which is what keeps `process.env` and dotenv out of the picture.
   */
  run(schema: GeneratedSchema, env: Record<string, string>): RunResult;
}

let pending: Promise<Engine> | undefined;

/** Lazily builds the engine. Repeated calls share one instance. */
export function loadEngine(
  onProgress?: (message: string) => void,
): Promise<Engine> {
  pending ??= build(onProgress).catch((error) => {
    pending = undefined;
    throw error;
  });
  return pending;
}

async function build(onProgress?: (message: string) => void): Promise<Engine> {
  onProgress?.('Loading the TypeScript compiler');
  const [{ default: ts }, vfs, codegen, runtime] = await Promise.all([
    import('typescript'),
    import('@typescript/vfs'),
    import('typespun-codegen'),
    import('typespun/generated'),
  ]);

  const options: import('typescript').CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    experimentalDecorators: true,
    skipLibCheck: true,
    noEmit: true,
    lib: [DEFAULT_LIB.slice(1)],
  };

  onProgress?.('Fetching lib.d.ts');
  const libs = await loadLibFiles(ts.version);

  return {
    typescriptVersion: ts.version,

    compile(source, envPrefix) {
      const files = new Map(libs);
      files.set(INPUT_PATH, source);

      const system = vfs.createSystem(files);
      const { compilerHost } = vfs.createVirtualCompilerHost(
        system,
        options,
        ts,
      );
      // Two deliberate overrides of the stock virtual host:
      //   - parent pointers, which the analyzer relies on for JSDoc and for
      //     turning nodes back into source locations;
      //   - a default lib that matches the set actually fetched above.
      compilerHost.getSourceFile = (fileName, languageVersion) => {
        const text = system.readFile(fileName);
        return text === undefined
          ? undefined
          : ts.createSourceFile(fileName, text, languageVersion, true);
      };
      compilerHost.getDefaultLibFileName = () => DEFAULT_LIB;

      const program = ts.createProgram([INPUT_PATH], options, compilerHost);
      const input = program.getSourceFile(INPUT_PATH)!;
      const typeErrors = [
        ...program.getSyntacticDiagnostics(input),
        ...program.getSemanticDiagnostics(input),
      ].map((diagnostic) => toCompilerMessage(ts, diagnostic));

      const analysis = codegen.analyzeProgram(program, INPUT_PATH, envPrefix);
      if (analysis.diagnostics.length > 0 || !analysis.rootExport) {
        return {
          diagnostics: analysis.diagnostics,
          typeErrors,
          fields: analysis.fields,
          rootName: analysis.rootName,
        };
      }

      const fingerprint = codegen.createFingerprint({
        protocolVersion: 1,
        generatorVersion: GENERATOR_VERSION,
        configuration: { envPrefix },
        analysis: analysis.fields,
        compiledDefaults: {},
      });

      const generated = codegen.emitGeneratedModule({
        rootExport: analysis.rootExport,
        rootName: analysis.rootName!,
        typeImport: TYPE_IMPORT,
        fields: analysis.fields,
        compiledDefaults: {},
        fingerprint,
      });

      return {
        diagnostics: analysis.diagnostics,
        typeErrors,
        fields: analysis.fields,
        rootName: analysis.rootName,
        fingerprint,
        generated,
        schema: toSchema(analysis.fields),
      };
    },

    run(schema, env) {
      const loadConfig = runtime.createLoader<unknown>(schema);
      try {
        // `source` present, `envFiles` absent: no process.env, no filesystem.
        return { ok: true, value: loadConfig({ source: env }) };
      } catch (error) {
        const issues = (error as { issues?: readonly ConfigIssue[] }).issues;
        if (Array.isArray(issues)) {
          return { ok: false, issues };
        }
        return {
          ok: false,
          issues: [],
          crash: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/** Mirrors what the emitted module inlines, minus source locations. */
function toSchema(fields: readonly FieldIR[]): GeneratedSchema {
  return {
    protocolVersion: 1,
    compiledDefaults: {},
    fields: fields.map(({ location: _location, ...field }) => field),
  };
}

function toCompilerMessage(
  ts: typeof import('typescript'),
  diagnostic: import('typescript').Diagnostic,
): CompilerMessage {
  const position =
    diagnostic.file && diagnostic.start !== undefined
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : { line: 0, character: 0 };
  return {
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
    line: position.line + 1,
    column: position.character + 1,
  };
}

/**
 * Version stamped into the fingerprint. The real CLI reads it from the
 * package; the playground has no package.json at runtime, so it is pinned and
 * shown in the UI next to the fingerprint.
 */
export const GENERATOR_VERSION = '0.1.2';

const DEFAULT_LIB = '/lib.es2022.d.ts';
const LIB_CDN = 'https://cdn.jsdelivr.net/npm/typescript';
const LIB_CACHE_PREFIX = 'typespun-lib-';

/**
 * Walks `/// <reference lib="..." />` outwards from the default lib, fetching
 * each `lib.*.d.ts` from jsDelivr and caching it in localStorage. That is ~11
 * small files rather than the ~80 `@typescript/vfs` would fetch for its own
 * CDN default map, and it pins the exact compiler version in use.
 */
async function loadLibFiles(version: string): Promise<Map<string, string>> {
  evictStaleLibCache(version);
  const files = new Map<string, string>();
  const queue = [DEFAULT_LIB.slice(1)];
  const seen = new Set(queue);

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length);
    const texts = await Promise.all(
      batch.map((name) => fetchLib(version, name)),
    );
    for (const [index, text] of texts.entries()) {
      if (text === undefined) continue;
      files.set(`/${batch[index]!}`, text);
      for (const match of text.matchAll(/\/\/\/\s*<reference lib="([^"]+)"/g)) {
        const name = `lib.${match[1]!}.d.ts`;
        if (seen.has(name)) continue;
        seen.add(name);
        queue.push(name);
      }
    }
  }

  if (!files.has(DEFAULT_LIB)) {
    throw new Error(
      `Could not load ${DEFAULT_LIB} for TypeScript ${version}. Check your network connection and reload.`,
    );
  }
  return files;
}

async function fetchLib(
  version: string,
  name: string,
): Promise<string | undefined> {
  const key = `${LIB_CACHE_PREFIX}${version}-${name}`;
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const response = await fetch(`${LIB_CDN}@${version}/lib/${name}`);
  if (!response.ok) return undefined;
  const text = await response.text();
  writeCache(key, text);
  return text;
}

function readCache(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota or private mode: the libs are simply refetched next time.
  }
}

/** Drops cached libs belonging to a compiler version we no longer use. */
function evictStaleLibCache(version: string): void {
  const keep = `${LIB_CACHE_PREFIX}${version}-`;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LIB_CACHE_PREFIX) && !key.startsWith(keep)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
