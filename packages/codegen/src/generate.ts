import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { analyzeProgram } from './analyzer/analyze.js';
import type { Diagnostic, FieldIR } from './contracts.js';
import {
  emitGeneratedModule,
  relativeTypeImportSpecifier,
} from './emitter/emit.js';
import { createFingerprint } from './emitter/fingerprint.js';
import {
  loadProjectConfig,
  type ProjectConfigResult,
} from './project/config.js';
import {
  compileDefaults,
  type DefaultsDiagnostic,
} from './project/defaults.js';

const GENERATOR_VERSION = '0.0.0';
const PROTOCOL_VERSION = 1;
let temporarySequence = 0;

export interface GenerateProjectOptions {
  readonly configPath?: string;
  readonly projectDirectory?: string;
  readonly mode: 'write' | 'check';
}

export interface GenerationIoDiagnostic {
  readonly code: 'defaults_read_failed';
  readonly file: string;
  readonly path: string;
  readonly message: string;
}

export type GenerateDiagnostic =
  | Diagnostic
  | DefaultsDiagnostic
  | GenerationIoDiagnostic;

export interface GenerateResult {
  readonly status: 'unchanged' | 'written' | 'stale';
  readonly outputPath: string;
  readonly warnings: readonly GenerateDiagnostic[];
  readonly diagnostics: readonly GenerateDiagnostic[];
}

export async function generateProject(
  options: GenerateProjectOptions,
): Promise<GenerateResult> {
  const projectDirectory = resolve(options.projectDirectory ?? process.cwd());
  const config = loadProjectConfig({
    projectDirectory,
    ...(options.configPath === undefined
      ? {}
      : { configPath: options.configPath }),
  });
  const programResult = createProjectProgram(config);
  if (programResult.diagnostics.length > 0) {
    return failedResult(config.outputPath, programResult.diagnostics);
  }

  const analysis = analyzeProgram(
    programResult.program,
    config.inputPath,
    config.envPrefix,
  );
  if (
    analysis.diagnostics.length > 0 ||
    analysis.rootName === undefined ||
    analysis.rootExport === undefined
  ) {
    return failedResult(config.outputPath, analysis.diagnostics);
  }

  const defaultsDocument =
    config.defaultsPath === undefined
      ? { path: config.inputPath, content: '{}' }
      : await readDefaults(config.defaultsPath);
  if ('diagnostic' in defaultsDocument) {
    return failedResult(config.outputPath, [defaultsDocument.diagnostic]);
  }
  const defaults = compileDefaults(
    {
      path: defaultsDocument.path,
      content: defaultsDocument.content,
    },
    analysis.fields,
    {
      unknownKeys: config.unknownKeys,
      secretDefaults: config.secretDefaults,
    },
  );
  if (defaults.errors.length > 0) {
    return failedResult(config.outputPath, defaults.errors, defaults.warnings);
  }

  const portableConfig = normalizeConfiguration(config, projectDirectory);
  const typeImport = relativeTypeImportSpecifier(
    config.inputPath,
    config.outputPath,
    programResult.program.getCompilerOptions(),
  );
  const portableAnalysis = {
    rootExport: analysis.rootExport,
    fields: analysis.fields.map(withoutLocation),
    typeImport,
  };
  const fingerprint = createFingerprint({
    protocolVersion: PROTOCOL_VERSION,
    generatorVersion: GENERATOR_VERSION,
    configuration: portableConfig,
    analysis: portableAnalysis,
    compiledDefaults: defaults.values,
  });
  const canonical = emitGeneratedModule({
    rootExport: analysis.rootExport,
    rootName: analysis.rootName,
    typeImport,
    fields: analysis.fields,
    compiledDefaults: defaults.values,
    fingerprint,
  });
  const existing = await readExisting(config.outputPath);

  if (existing === canonical) {
    return {
      status: 'unchanged',
      outputPath: config.outputPath,
      warnings: defaults.warnings,
      diagnostics: [],
    };
  }
  if (options.mode === 'check') {
    return {
      status: 'stale',
      outputPath: config.outputPath,
      warnings: defaults.warnings,
      diagnostics: [],
    };
  }

  await atomicWrite(config.outputPath, canonical);
  return {
    status: 'written',
    outputPath: config.outputPath,
    warnings: defaults.warnings,
    diagnostics: [],
  };
}

function createProjectProgram(config: ProjectConfigResult): {
  program: ts.Program;
  diagnostics: Diagnostic[];
} {
  const loaded = ts.readConfigFile(config.tsconfigPath, ts.sys.readFile);
  if (loaded.error !== undefined) {
    return {
      program: ts.createProgram([], {}),
      diagnostics: [typescriptConfigDiagnostic(config.tsconfigPath)],
    };
  }
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    dirname(config.tsconfigPath),
    undefined,
    config.tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    return {
      program: ts.createProgram([], parsed.options),
      diagnostics: [typescriptConfigDiagnostic(config.tsconfigPath)],
    };
  }
  const rootNames = Array.from(
    new Set([
      ...parsed.fileNames.map((path) => resolve(path)),
      resolve(config.inputPath),
    ]),
  );
  return {
    program: ts.createProgram(rootNames, parsed.options),
    diagnostics: [],
  };
}

function typescriptConfigDiagnostic(path: string): Diagnostic {
  return {
    code: 'typescript_config',
    message: 'The TypeScript project configuration could not be loaded.',
    location: { file: path, line: 1, column: 1 },
  };
}

async function readDefaults(
  path: string,
): Promise<
  { path: string; content: string } | { diagnostic: GenerationIoDiagnostic }
> {
  try {
    return { path, content: await readFile(path, 'utf8') };
  } catch {
    return {
      diagnostic: {
        code: 'defaults_read_failed',
        file: path,
        path: '',
        message: 'The configured defaults file could not be read.',
      },
    };
  }
}

async function readExisting(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${dirname(path)}/.typespun.${process.pid}.${temporarySequence++}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx');
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function failedResult(
  outputPath: string,
  diagnostics: readonly GenerateDiagnostic[],
  warnings: readonly GenerateDiagnostic[] = [],
): GenerateResult {
  return { status: 'unchanged', outputPath, warnings, diagnostics };
}

function normalizeConfiguration(
  config: ProjectConfigResult,
  projectDirectory: string,
): unknown {
  return {
    input: portableRelative(projectDirectory, config.inputPath),
    output: portableRelative(projectDirectory, config.outputPath),
    tsconfig: portableRelative(projectDirectory, config.tsconfigPath),
    ...(config.defaultsPath === undefined
      ? {}
      : {
          defaults: portableRelative(projectDirectory, config.defaultsPath),
        }),
    ...(config.envPrefix === undefined ? {} : { envPrefix: config.envPrefix }),
    unknownKeys: config.unknownKeys,
    secretDefaults: config.secretDefaults,
  };
}

function portableRelative(from: string, to: string): string {
  return relative(from, to).split(sep).join('/');
}

function withoutLocation(field: FieldIR): Omit<FieldIR, 'location'> {
  const { location: _location, ...portable } = field;
  return portable;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
