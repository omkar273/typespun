import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import ts from 'typescript';
import type { GenerateDiagnostic } from '../generate.js';
import { generateProject } from '../generate.js';
import { CONVENTIONAL_INPUTS } from '../project/discovery.js';

export interface InitOptions {
  readonly style?: 'interface' | 'class';
  readonly input?: string;
  readonly output?: string;
  readonly envPrefix?: string;
}

export interface InitResult {
  readonly exitCode: 0 | 1;
  readonly messages: readonly string[];
  readonly warnings: readonly string[];
  readonly diagnostics: readonly GenerateDiagnostic[];
}

interface PackageDocument extends Record<string, unknown> {
  scripts?: Record<string, unknown>;
  packageManager?: string;
}

interface InitConfig extends Record<string, unknown> {
  input?: string;
  output?: string;
  envPrefix?: string;
}

const SCHEMA_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);

export class InitProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitProjectError';
  }
}

export async function initializeProject(
  cwd: string,
  options: InitOptions,
): Promise<InitResult> {
  const projectDirectory = resolve(cwd);
  const packagePath = join(projectDirectory, 'package.json');
  const tsconfigPath = join(projectDirectory, 'tsconfig.json');
  const packageDocument = readPackageDocument(packagePath);
  validateTsconfig(tsconfigPath);

  const configPath = join(projectDirectory, 'typespun.json');
  const existingConfig = existsSync(configPath)
    ? readInitConfig(configPath)
    : undefined;
  const input = selectInput(projectDirectory, options, existingConfig);
  const output =
    options.output ??
    existingConfig?.output ??
    `src/generated/typespun${extname(input)}`;
  validateSchemaPath(input, '--input');
  validateSchemaPath(output, '--output');
  rejectConflictingOptions(options, existingConfig, input, output);
  validateExistingSchemaStyle(projectDirectory, input, options.style);
  const inputPath = resolve(projectDirectory, input);
  const outputPath = resolve(projectDirectory, output);
  if (inputPath === outputPath) {
    throw new InitProjectError('Schema input and generated output must differ');
  }
  if (existingConfig === undefined && existsSync(outputPath)) {
    throw new InitProjectError(
      `Initialization refuses to overwrite the existing output at ${output}`,
    );
  }

  const config: InitConfig = {
    input,
    output,
    ...(options.envPrefix === undefined
      ? existingConfig?.envPrefix === undefined
        ? {}
        : { envPrefix: existingConfig.envPrefix }
      : { envPrefix: options.envPrefix }),
  };
  const messages: string[] = [];

  if (!existsSync(inputPath)) {
    await writeNewFile(inputPath, schemaTemplate(options.style ?? 'interface'));
    messages.push(`Created ${input}.`);
  }
  if (existingConfig === undefined) {
    await writeNewFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
    messages.push('Created typespun.json.');
  }

  if (addMissingScripts(packageDocument)) {
    await writeFile(
      packagePath,
      `${JSON.stringify(packageDocument, null, 2)}\n`,
    );
    messages.push('Added config:generate and config:check scripts.');
  }

  const missing = missingDependencies(projectDirectory);
  if (missing.length > 0) {
    return {
      exitCode: 0,
      messages,
      warnings: installationGuidance(
        projectDirectory,
        packageDocument,
        missing,
      ),
      diagnostics: [],
    };
  }

  const generated = await generateProject({
    projectDirectory,
    configPath,
    mode: 'write',
  });
  if (generated.diagnostics.length > 0) {
    return {
      exitCode: 1,
      messages,
      warnings: [],
      diagnostics: [...generated.warnings, ...generated.diagnostics],
    };
  }
  messages.push(
    `${generated.status === 'written' ? 'Generated' : 'Unchanged'} ${displayPath(projectDirectory, generated.outputPath)}.`,
  );
  return {
    exitCode: 0,
    messages,
    warnings: [],
    diagnostics: generated.warnings,
  };
}

function readPackageDocument(path: string): PackageDocument {
  if (!isFile(path)) throw new InitProjectError('package.json is required');
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new InitProjectError('package.json must contain valid JSON');
  }
  if (!isRecord(value)) {
    throw new InitProjectError('package.json must contain an object');
  }
  if (value.scripts !== undefined && !isRecord(value.scripts)) {
    throw new InitProjectError('package.json scripts must contain an object');
  }
  return value as PackageDocument;
}

function validateTsconfig(path: string): void {
  if (!isFile(path)) throw new InitProjectError('tsconfig.json is required');
  const loaded = ts.readConfigFile(path, ts.sys.readFile);
  if (loaded.error !== undefined) {
    throw new InitProjectError(
      'tsconfig.json must contain usable TypeScript configuration',
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    loaded.config,
    ts.sys,
    dirname(path),
    undefined,
    path,
  );
  if (parsed.errors.some((diagnostic) => diagnostic.code !== 18003)) {
    throw new InitProjectError(
      'tsconfig.json must contain usable TypeScript configuration',
    );
  }
}

function readInitConfig(path: string): InitConfig {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new InitProjectError('typespun.json must contain valid JSON');
  }
  if (!isRecord(value)) {
    throw new InitProjectError('typespun.json must contain an object');
  }
  const allowed = new Set([
    'input',
    'output',
    'tsconfig',
    'envPrefix',
    'defaults',
    'secretDefaults',
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new InitProjectError(`Unknown typespun.json key: ${key}`);
    }
  }
  for (const key of ['input', 'output', 'tsconfig', 'envPrefix'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      throw new InitProjectError(`typespun.json ${key} must be a string`);
    }
  }
  validateDefaultsConfig(value.defaults);
  if (
    value.secretDefaults !== undefined &&
    value.secretDefaults !== 'warn' &&
    value.secretDefaults !== 'allow' &&
    value.secretDefaults !== 'error'
  ) {
    throw new InitProjectError(
      'typespun.json secretDefaults must be warn, allow, or error',
    );
  }
  return value as InitConfig;
}

function validateDefaultsConfig(value: unknown): void {
  if (value === undefined || typeof value === 'string') return;
  if (!isRecord(value)) {
    throw new InitProjectError(
      'typespun.json defaults must be a string or object',
    );
  }
  for (const key of Object.keys(value)) {
    if (key !== 'path' && key !== 'unknownKeys') {
      throw new InitProjectError(`Unknown typespun.json defaults key: ${key}`);
    }
  }
  if (value.path !== undefined && typeof value.path !== 'string') {
    throw new InitProjectError('typespun.json defaults.path must be a string');
  }
  if (
    value.unknownKeys !== undefined &&
    value.unknownKeys !== 'error' &&
    value.unknownKeys !== 'warn' &&
    value.unknownKeys !== 'ignore'
  ) {
    throw new InitProjectError(
      'typespun.json defaults.unknownKeys must be error, warn, or ignore',
    );
  }
}

function selectInput(
  projectDirectory: string,
  options: InitOptions,
  existingConfig: InitConfig | undefined,
): string {
  if (options.input !== undefined) return options.input;
  if (existingConfig?.input !== undefined) return existingConfig.input;
  const candidates = CONVENTIONAL_INPUTS.filter((path) =>
    isFile(resolve(projectDirectory, path)),
  );
  if (candidates.length > 1) {
    throw new InitProjectError(
      `Multiple conventional schemas exist: ${candidates.join(', ')}; use --input.`,
    );
  }
  return candidates[0] ?? 'src/config.ts';
}

function rejectConflictingOptions(
  options: InitOptions,
  existing: InitConfig | undefined,
  input: string,
  output: string,
): void {
  if (existing === undefined) return;
  const comparisons: Array<[string, string | undefined, string | undefined]> = [
    ['--input', options.input, existing.input ?? input],
    ['--output', options.output, existing.output ?? output],
    ['--env-prefix', options.envPrefix, existing.envPrefix],
  ];
  for (const [flag, requested, configured] of comparisons) {
    if (requested !== undefined && requested !== configured) {
      throw new InitProjectError(
        `${flag} conflicts with the existing typespun.json`,
      );
    }
  }
}

function validateExistingSchemaStyle(
  projectDirectory: string,
  input: string,
  requestedStyle: 'interface' | 'class' | undefined,
): void {
  const path = resolve(projectDirectory, input);
  if (requestedStyle === undefined || !isFile(path)) return;
  const source = readFileSync(path, 'utf8');
  const matches =
    requestedStyle === 'class'
      ? /\b(?:export\s+)?class\s+[A-Za-z_$]/.test(source)
      : /\b(?:export\s+)?interface\s+[A-Za-z_$]/.test(source);
  if (!matches) {
    throw new InitProjectError(
      `--style ${requestedStyle} conflicts with the existing schema at ${input}`,
    );
  }
}

function validateSchemaPath(path: string, flag: string): void {
  if (!SCHEMA_EXTENSIONS.has(extname(path))) {
    throw new InitProjectError(
      `${flag} must use a .ts, .mts, or .cts extension`,
    );
  }
}

function schemaTemplate(style: 'interface' | 'class'): string {
  return style === 'interface'
    ? `/** @typespun */\nexport interface AppConfig {\n  port: number;\n}\n`
    : `import { Config } from 'typespun';\n\n@Config()\nexport class AppConfig {\n  port!: number;\n}\n`;
}

function addMissingScripts(document: PackageDocument): boolean {
  const scripts = document.scripts ?? {};
  let changed = false;
  if (scripts['config:generate'] === undefined) {
    scripts['config:generate'] = 'typespun generate';
    changed = true;
  }
  if (scripts['config:check'] === undefined) {
    scripts['config:check'] = 'typespun check';
    changed = true;
  }
  if (document.scripts === undefined) document.scripts = scripts;
  return changed;
}

function missingDependencies(projectDirectory: string): string[] {
  const require = createRequire(join(projectDirectory, 'package.json'));
  return ['typespun', 'typespun-codegen'].filter((name) => {
    if (isFile(join(projectDirectory, 'node_modules', name, 'package.json'))) {
      return false;
    }
    try {
      require.resolve(name);
      return false;
    } catch {
      return true;
    }
  });
}

function installationGuidance(
  projectDirectory: string,
  packageDocument: PackageDocument,
  missing: readonly string[],
): string[] {
  const manager = detectPackageManager(projectDirectory, packageDocument);
  const commands: string[] = [];
  if (missing.includes('typespun')) {
    commands.push(installCommand(manager, 'typespun', false));
  }
  if (missing.includes('typespun-codegen')) {
    commands.push(installCommand(manager, 'typespun-codegen', true));
  }
  return [
    'Dependencies are missing; generated output was not created. Install them, then run typespun generate:',
    ...commands,
  ];
}

type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

function detectPackageManager(
  projectDirectory: string,
  document: PackageDocument,
): PackageManager {
  const configured = document.packageManager?.split('@')[0];
  if (
    configured === 'bun' ||
    configured === 'npm' ||
    configured === 'pnpm' ||
    configured === 'yarn'
  ) {
    return configured;
  }
  if (
    isFile(join(projectDirectory, 'bun.lock')) ||
    isFile(join(projectDirectory, 'bun.lockb'))
  ) {
    return 'bun';
  }
  if (isFile(join(projectDirectory, 'pnpm-lock.yaml'))) return 'pnpm';
  if (isFile(join(projectDirectory, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function installCommand(
  manager: PackageManager,
  packageName: string,
  development: boolean,
): string {
  if (manager === 'npm') {
    return `npm install${development ? ' --save-dev' : ''} ${packageName}`;
  }
  if (manager === 'yarn') {
    return `yarn add${development ? ' --dev' : ''} ${packageName}`;
  }
  const developmentFlag = development
    ? manager === 'pnpm'
      ? ' --save-dev'
      : ' --dev'
    : '';
  return `${manager} add${developmentFlag} ${packageName}`;
}

async function writeNewFile(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' });
}

function displayPath(projectDirectory: string, path: string): string {
  return path.startsWith(`${projectDirectory}/`)
    ? path.slice(projectDirectory.length + 1)
    : path;
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
