import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { analyzeProgram } from './analyzer/analyze.js';
import type { Diagnostic, FieldIR } from './contracts.js';
import {
  emitGeneratedModule,
  relativeTypeImportSpecifier,
} from './emitter/emit.js';
import {
  createFingerprint,
  type FingerprintInput,
} from './emitter/fingerprint.js';
import { attempt } from './internal/attempt.js';
import {
  loadProjectConfig,
  type ProjectConfigResult,
} from './project/config.js';
import {
  compileDefaults,
  type DefaultsDiagnostic,
} from './project/defaults.js';

const PROTOCOL_VERSION = 1;
const TEMPORARY_ATTEMPTS = 8;
const PACKAGE_JSON_URL = new URL('../package.json', import.meta.url);

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

export interface GenerationSafetyDiagnostic {
  readonly code: 'overlapping_paths';
  readonly message: string;
}

export type GenerateDiagnostic =
  | Diagnostic
  | DefaultsDiagnostic
  | GenerationIoDiagnostic
  | GenerationSafetyDiagnostic;

export interface GenerateResult {
  readonly status: 'unchanged' | 'written' | 'stale';
  readonly outputPath: string;
  readonly warnings: readonly GenerateDiagnostic[];
  readonly diagnostics: readonly GenerateDiagnostic[];
}

export const generateProject = async (
  options: GenerateProjectOptions,
): Promise<GenerateResult> => {
  const projectDirectory = resolve(options.projectDirectory ?? process.cwd());
  const config = loadProjectConfig({
    projectDirectory,
    ...(options.configPath === undefined
      ? {}
      : { configPath: options.configPath }),
  });

  const overlapping = await referToSameFile(
    config.inputPath,
    config.outputPath,
  );

  if (overlapping) {
    return failedResult(config.outputPath, [
      {
        code: 'overlapping_paths',
        message:
          'The schema input and generated output must be different files.',
      },
    ]);
  }

  const programResult = createProjectProgram(config);

  if (programResult.diagnostics.length > 0) {
    return failedResult(config.outputPath, programResult.diagnostics);
  }

  const analysis = analyzeProgram(
    programResult.program,
    config.inputPath,
    config.envPrefix,
  );

  const hasRoot =
    analysis.rootName !== undefined && analysis.rootExport !== undefined;

  if (analysis.diagnostics.length > 0 || !hasRoot) {
    return failedResult(config.outputPath, analysis.diagnostics);
  }

  const defaultsDocument = await readDefaults(config);

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

  const portableConfig = normalizeConfiguration(config);
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
  const fingerprint = createGenerationFingerprint({
    protocolVersion: PROTOCOL_VERSION,
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
};

export const createGenerationFingerprint = (
  input: Omit<FingerprintInput, 'generatorVersion'>,
  packageJsonUrl: URL = PACKAGE_JSON_URL,
): string => {
  const manifest: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));
  const isObject = typeof manifest === 'object' && manifest !== null;
  const version =
    isObject && 'version' in manifest ? manifest.version : undefined;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('typespun-codegen package version is missing');
  }

  return createFingerprint({ ...input, generatorVersion: version });
};

const createProjectProgram = (
  config: ProjectConfigResult,
): {
  program: ts.Program;
  diagnostics: Diagnostic[];
} => {
  const loaded = ts.readConfigFile(config.tsconfigPath, (path) =>
    ts.sys.readFile(path),
  );

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
};

const typescriptConfigDiagnostic = (path: string): Diagnostic => ({
  code: 'typescript_config',
  message: 'The TypeScript project configuration could not be loaded.',
  location: { file: path, line: 1, column: 1 },
});

const readDefaults = async ({
  defaultsPath,
  inputPath,
}: ProjectConfigResult): Promise<
  { path: string; content: string } | { diagnostic: GenerationIoDiagnostic }
> => {
  if (defaultsPath === undefined) {
    return { path: inputPath, content: '{}' };
  }

  const read = await attempt(() => readFile(defaultsPath, 'utf8'));

  if (read.ok) {
    return { path: defaultsPath, content: read.data };
  }

  return {
    diagnostic: {
      code: 'defaults_read_failed',
      file: defaultsPath,
      path: '',
      message: 'The configured defaults file could not be read.',
    },
  };
};

const readExisting = async (path: string): Promise<string | undefined> => {
  const read = await attempt(
    () => readFile(path, 'utf8'),
    (thrown) => thrown,
  );

  if (read.ok) {
    return read.data;
  }

  if (isNodeError(read.error) && read.error.code === 'ENOENT') return undefined;
  throw read.error;
};

export const atomicWrite = async (
  path: string,
  contents: string,
  temporaryPathForAttempt: (attempt: number) => string = (_attempt) =>
    `${dirname(path)}/.typespun.${randomUUID()}.tmp`,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  let temporaryPath: string | undefined;
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  for (let index = 0; index < TEMPORARY_ATTEMPTS; index++) {
    const candidate = temporaryPathForAttempt(index);
    const opened = await attempt(
      () => open(candidate, 'wx'),
      (thrown) => thrown,
    );

    if (opened.ok) {
      handle = opened.data;
      temporaryPath = candidate;
      break;
    }

    if (isNodeError(opened.error) && opened.error.code === 'EEXIST') continue;
    throw opened.error;
  }

  if (handle === undefined || temporaryPath === undefined) {
    throw new Error('Could not reserve a temporary generated-output file.');
  }

  let renamed = false;

  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
    renamed = true;
  } finally {
    /* v8 ignore next 2 -- these catch handlers only run if the cleanup itself
       fails, which cannot be provoked without faulting the filesystem. */
    await handle?.close().catch(() => {});
    if (!renamed) await unlink(temporaryPath).catch(() => {});
  }
};

const failedResult = (
  outputPath: string,
  diagnostics: readonly GenerateDiagnostic[],
  warnings: readonly GenerateDiagnostic[] = [],
): GenerateResult => ({
  status: 'unchanged',
  outputPath,
  warnings,
  diagnostics,
});

const normalizeConfiguration = (config: ProjectConfigResult): unknown => ({
  input: portableRelative(config.configDirectory, config.inputPath),
  output: portableRelative(config.configDirectory, config.outputPath),
  tsconfig: portableRelative(config.configDirectory, config.tsconfigPath),
  ...(config.defaultsPath === undefined
    ? {}
    : {
        defaults: portableRelative(config.configDirectory, config.defaultsPath),
      }),
  ...(config.envPrefix === undefined ? {} : { envPrefix: config.envPrefix }),
  unknownKeys: config.unknownKeys,
  secretDefaults: config.secretDefaults,
});

const referToSameFile = async (
  first: string,
  second: string,
): Promise<boolean> => {
  const [firstIdentity, secondIdentity] = await Promise.all([
    fileIdentity(first),
    fileIdentity(second),
  ]);

  const firstStat = firstIdentity.stat;
  const secondStat = secondIdentity.stat;
  const sameCanonicalPath =
    firstIdentity.canonicalPath === secondIdentity.canonicalPath;

  if (firstStat === undefined || secondStat === undefined) {
    return sameCanonicalPath;
  }

  const sameInode =
    firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino;
  return sameInode || sameCanonicalPath;
};

/** Resolves a missing path through its nearest existing ancestor. */
const canonicalViaAncestor = async (
  path: string,
  ancestor: string,
  remainder: readonly string[],
): Promise<string> => {
  const canonical = await attempt(() => realpath(ancestor));

  if (canonical.ok) {
    return resolve(canonical.data, ...remainder);
  }

  const parent = dirname(ancestor);

  if (parent === ancestor) {
    return resolve(path);
  }

  return canonicalViaAncestor(path, parent, [basename(ancestor), ...remainder]);
};

const fileIdentity = async (
  path: string,
): Promise<{
  canonicalPath: string;
  stat?: Awaited<ReturnType<typeof stat>>;
}> => {
  const existing = await attempt(async () => {
    const canonicalPath = await realpath(path);
    const stats = await stat(path);
    return { canonicalPath, stat: stats };
  });

  if (existing.ok) {
    return existing.data;
  }

  const canonicalPath = await canonicalViaAncestor(path, dirname(path), [
    basename(path),
  ]);
  return { canonicalPath };
};

const portableRelative = (from: string, to: string): string =>
  relative(from, to).split(sep).join('/');

const withoutLocation = (field: FieldIR): Omit<FieldIR, 'location'> => {
  const { location: _location, ...portable } = field;
  return portable;
};

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error;
