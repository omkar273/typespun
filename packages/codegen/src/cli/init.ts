import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import ts from 'typescript';
import type { GenerateDiagnostic } from '../generate.js';
import { generateProject } from '../generate.js';
import {
  CONVENTIONAL_INPUTS,
  discoverDefaultsPath,
  findNearestTsconfig,
} from '../project/discovery.js';

export interface InitOptions {
  readonly style?: 'interface' | 'class';
  readonly input?: string;
  readonly output?: string;
  readonly envPrefix?: string;
}

export interface InitResult {
  readonly exitCode: 0 | 1 | 2;
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
  tsconfig?: string;
  envPrefix?: string;
  defaults?: unknown;
  secretDefaults?: unknown;
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
  const packageDocument = readPackageDocument(packagePath);

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
  const inputNeedsCreation = !existsSync(inputPath);
  if (pathsReferToSameFile(inputPath, outputPath)) {
    throw new InitProjectError('Schema input and generated output must differ');
  }
  if (pathEntryExists(outputPath) && !isTypespunGeneratedOutput(outputPath)) {
    throw new InitProjectError(
      `Initialization refuses to overwrite the existing output at ${output}`,
    );
  }

  const discoveredDefaults =
    existingConfig?.defaults === undefined
      ? discoverDefaultsPath(projectDirectory)
      : undefined;
  const createDefaults =
    existingConfig?.defaults === undefined && discoveredDefaults === undefined;
  const defaultDefaultsPath = join(projectDirectory, 'config.yaml');
  if (createDefaults && pathEntryExists(defaultDefaultsPath)) {
    throw new InitProjectError(
      'Initialization refuses to overwrite the existing entry at config.yaml',
    );
  }

  const config: InitConfig = {
    ...existingConfig,
    input,
    output,
    ...(options.envPrefix === undefined
      ? existingConfig?.envPrefix === undefined
        ? {}
        : { envPrefix: existingConfig.envPrefix }
      : { envPrefix: options.envPrefix }),
  };
  preflightResolvedConfig(projectDirectory, config, inputPath);
  const configNeedsMissingKeys =
    existingConfig !== undefined &&
    (existingConfig.input === undefined ||
      existingConfig.output === undefined ||
      (options.envPrefix !== undefined &&
        existingConfig.envPrefix === undefined));
  const messages: string[] = [];

  if (inputNeedsCreation) {
    await writeNewFile(inputPath, schemaTemplate(options.style ?? 'interface'));
    messages.push(`Created ${input}.`);
  }
  if (createDefaults) {
    await writeNewFile(
      defaultDefaultsPath,
      inputNeedsCreation ? 'port: 3000\n' : '{}\n',
    );
    messages.push('Created config.yaml.');
  }
  const serializedConfig =
    existingConfig === undefined
      ? serializeNewConfig(config)
      : `${JSON.stringify(config, null, 2)}\n`;
  if (existingConfig === undefined) {
    await writeNewFile(configPath, serializedConfig);
    messages.push('Created typespun.json.');
  } else if (configNeedsMissingKeys) {
    await writeFile(configPath, serializedConfig);
    messages.push('Added missing paths to typespun.json.');
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
      exitCode: generated.diagnostics.some(
        (diagnostic) => diagnostic.code === 'typescript_config',
      )
        ? 2
        : 1,
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

function preflightResolvedConfig(
  projectDirectory: string,
  config: InitConfig,
  inputPath: string,
): void {
  const tsconfigPath =
    config.tsconfig === undefined
      ? findNearestTsconfig(inputPath)
      : resolve(projectDirectory, config.tsconfig);
  if (tsconfigPath === undefined) {
    throw new InitProjectError(
      `Could not find tsconfig.json for ${displayPath(projectDirectory, inputPath)}`,
    );
  }
  validateTsconfig(tsconfigPath);

  const defaults = config.defaults;
  const hasExplicitDefaultsPath =
    typeof defaults === 'string' ||
    (isRecord(defaults) && typeof defaults.path === 'string');
  if (!hasExplicitDefaultsPath) {
    try {
      discoverDefaultsPath(projectDirectory);
    } catch (error) {
      throw new InitProjectError(
        error instanceof Error
          ? error.message
          : 'Defaults-file discovery failed',
      );
    }
  }
}

function readInitConfig(path: string): InitConfig {
  let value: unknown;
  try {
    const parsed = ts.parseConfigFileTextToJson(
      path,
      readFileSync(path, 'utf8'),
    );
    if (parsed.error !== undefined) throw new Error('invalid JSON');
    value = parsed.config;
  } catch {
    throw new InitProjectError(
      'typespun.json must contain valid JSON with comments',
    );
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

function serializeNewConfig(config: InitConfig): string {
  const outputHasComma = config.envPrefix !== undefined;
  const prefixLines =
    config.envPrefix === undefined
      ? [
          '',
          '  // Optional environment prefix. APP produces keys such as APP_PORT.',
          '  // "envPrefix": "APP",',
        ]
      : [
          `  "envPrefix": ${JSON.stringify(config.envPrefix)}`,
          '',
          '  // Environment keys use the configured prefix, such as APP_PORT.',
        ];

  return `${[
    '{',
    `  "input": ${JSON.stringify(config.input)},`,
    `  "output": ${JSON.stringify(config.output)}${outputHasComma ? ',' : ''}`,
    ...prefixLines,
    '',
    '  // Optional tsconfig override. Default: nearest tsconfig.json to the input.',
    '  // "tsconfig": "tsconfig.json",',
    '',
    '  // Optional defaults override. config.yaml is discovered automatically.',
    '  // "defaults": {',
    '  //   "path": "config.yaml",',
    '  //   "unknownKeys": "error" // Allowed: "error", "warn", or "ignore".',
    '  // },',
    '',
    '  // Policy for defaults on secret fields. Allowed: "warn", "allow", or "error".',
    '  // "secretDefaults": "warn"',
    '}',
  ].join('\n')}\n`;
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
    [
      '--env-prefix',
      options.envPrefix,
      existing.envPrefix ?? options.envPrefix,
    ],
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
  return ['typespun', 'typespun-codegen'].filter(
    (name) => !findInstalledPackage(projectDirectory, name),
  );
}

function findInstalledPackage(
  projectDirectory: string,
  packageName: string,
): boolean {
  let directory = resolve(projectDirectory);
  while (true) {
    if (isFile(join(directory, 'node_modules', packageName, 'package.json'))) {
      return true;
    }
    const parent = dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
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

function pathsReferToSameFile(first: string, second: string): boolean {
  const firstIdentity = fileIdentity(first);
  const secondIdentity = fileIdentity(second);
  if (
    firstIdentity.stat !== undefined &&
    secondIdentity.stat !== undefined &&
    firstIdentity.stat.dev === secondIdentity.stat.dev &&
    firstIdentity.stat.ino === secondIdentity.stat.ino
  ) {
    return true;
  }
  return firstIdentity.canonicalPath === secondIdentity.canonicalPath;
}

function fileIdentity(path: string): {
  canonicalPath: string;
  stat?: ReturnType<typeof statSync>;
} {
  try {
    return { canonicalPath: realpathSync(path), stat: statSync(path) };
  } catch {
    let ancestor = dirname(path);
    const remainder = [basename(path)];
    while (true) {
      try {
        return {
          canonicalPath: resolve(realpathSync(ancestor), ...remainder),
        };
      } catch {
        const parent = dirname(ancestor);
        if (parent === ancestor) return { canonicalPath: resolve(path) };
        remainder.unshift(basename(ancestor));
        ancestor = parent;
      }
    }
  }
}

function isTypespunGeneratedOutput(path: string): boolean {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  return (
    /^\/\/ Generated by typespun-codegen\. Do not edit\.\n\/\/ Schema fingerprint: [a-f0-9]{64}\n\n/u.test(
      contents,
    ) &&
    contents.includes("from 'typespun/generated';") &&
    contents.includes('export type Config = TypespunConfig;') &&
    contents.includes('export const loadConfig = createLoader<Config>(schema);')
  );
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
