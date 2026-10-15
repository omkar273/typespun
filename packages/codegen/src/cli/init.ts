import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import ts from 'typescript';
import { generateProject, type GenerateDiagnostic } from '../generate.js';
import { attempt } from '../internal/attempt.js';
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
  readonly interactive?: boolean;
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

type SchemaStyle = 'interface' | 'class';

type PackageManager = 'bun' | 'npm' | 'pnpm' | 'yarn';

interface DefaultsPlan {
  readonly discovered: string | undefined;
  readonly create: boolean;
  readonly path: string;
}

interface InitPlan {
  readonly projectDirectory: string;
  readonly packagePath: string;
  readonly packageDocument: PackageDocument;
  readonly configPath: string;
  readonly existingConfig: InitConfig | undefined;
  readonly config: InitConfig;
  readonly configNeedsMissingKeys: boolean;
  readonly input: string;
  readonly inputPath: string;
  readonly inputNeedsCreation: boolean;
  readonly style: SchemaStyle;
  readonly defaults: DefaultsPlan;
}

const SCHEMA_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);
const SECRET_DEFAULTS_POLICIES = new Set<unknown>(['warn', 'allow', 'error']);
const UNKNOWN_KEYS_POLICIES = new Set<unknown>(['error', 'warn', 'ignore']);
const PACKAGE_SCRIPTS = {
  'config:generate': 'typespun generate',
  'config:check': 'typespun check',
};

export class InitProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitProjectError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMissingEntry = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

const isRegularFile = (path: string): boolean => {
  const checked = attempt(() => existsSync(path) && statSync(path).isFile());
  return checked.ok && checked.data;
};

const pathEntryExists = (path: string): boolean =>
  attempt(() => lstatSync(path)).ok;

const rejectMutableSymlink = (path: string, displayName: string): void => {
  const entry = attempt(
    () => lstatSync(path),
    (thrown: unknown) => thrown,
  );

  if (!entry.ok) {
    if (isMissingEntry(entry.error)) return;
    throw new InitProjectError(`Could not inspect ${displayName}`);
  }

  if (entry.data.isSymbolicLink()) {
    throw new InitProjectError(
      `Initialization refuses to update the symbolic link at ${displayName}`,
    );
  }
};

const displayPath = (projectDirectory: string, path: string): string =>
  path.startsWith(`${projectDirectory}/`)
    ? path.slice(projectDirectory.length + 1)
    : path;

const readPackageDocument = (path: string): PackageDocument => {
  if (!isRegularFile(path))
    throw new InitProjectError('package.json is required');
  const parsed = attempt((): unknown => JSON.parse(readFileSync(path, 'utf8')));

  if (!parsed.ok) {
    throw new InitProjectError('package.json must contain valid JSON');
  }

  const value = parsed.data;

  if (!isRecord(value)) {
    throw new InitProjectError('package.json must contain an object');
  }

  if (value.scripts !== undefined && !isRecord(value.scripts)) {
    throw new InitProjectError('package.json scripts must contain an object');
  }

  return value;
};

const promptLine = async (question: string): Promise<string> => {
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const value = await input.question(question);
    return value.trim();
  } finally {
    input.close();
  }
};

const promptStyle = async (): Promise<SchemaStyle> => {
  const answer = await promptLine(
    'Which schema style would you like for config? [interface/class] (default: interface): ',
  );
  if (answer.length === 0) return 'interface';
  if (answer === 'interface' || answer === 'class') return answer;
  process.stderr.write('Please answer "interface" or "class"\n');
  return promptStyle();
};

const resolveStyle = async (
  style: SchemaStyle | undefined,
  shouldPrompt: boolean,
): Promise<SchemaStyle> => {
  if (style !== undefined) return style;
  if (!shouldPrompt) return 'interface';
  return promptStyle();
};

const resolveEnvPrefix = async (
  provided: string | undefined,
  existing: string | undefined,
  shouldPrompt: boolean,
): Promise<string | undefined> => {
  if (provided !== undefined || existing !== undefined) {
    return provided ?? existing;
  }

  if (!shouldPrompt) return undefined;
  const answer = await promptLine(
    'Optional environment variable prefix (leave blank to skip): ',
  );
  return answer.length === 0 ? undefined : answer;
};

const validateTsconfig = (path: string): void => {
  if (!isRegularFile(path))
    throw new InitProjectError('tsconfig.json is required');
  const loaded = ts.readConfigFile(path, (file) => ts.sys.readFile(file));

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
};

const preflightResolvedConfig = (
  projectDirectory: string,
  config: InitConfig,
  inputPath: string,
): void => {
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

  if (hasExplicitDefaultsPath) return;
  const discovery = attempt(
    () => discoverDefaultsPath(projectDirectory),
    (thrown: unknown) => thrown,
  );

  if (!discovery.ok) {
    throw new InitProjectError(
      discovery.error instanceof Error
        ? discovery.error.message
        : 'Defaults-file discovery failed',
    );
  }
};

const validateDefaultsConfig = (value: unknown): void => {
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
    !UNKNOWN_KEYS_POLICIES.has(value.unknownKeys)
  ) {
    throw new InitProjectError(
      'typespun.json defaults.unknownKeys must be error, warn, or ignore',
    );
  }
};

const readInitConfig = (path: string): InitConfig => {
  const parsed = attempt(() =>
    ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8')),
  );

  if (!parsed.ok || parsed.data.error !== undefined) {
    throw new InitProjectError(
      'typespun.json must contain valid JSON with comments',
    );
  }

  const value: unknown = parsed.data.config;

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
    !SECRET_DEFAULTS_POLICIES.has(value.secretDefaults)
  ) {
    throw new InitProjectError(
      'typespun.json secretDefaults must be warn, allow, or error',
    );
  }

  return value;
};

const serializeNewConfig = (
  config: InitConfig,
  defaultsPath: string,
): string => {
  const prefixLines =
    config.envPrefix === undefined
      ? [
          '',
          '  // Optional environment prefix. APP produces keys such as APP_PORT.',
          '  // "envPrefix": "APP",',
        ]
      : [
          `  "envPrefix": ${JSON.stringify(config.envPrefix)},`,
          '',
          '  // Environment keys use the configured prefix, such as APP_PORT.',
        ];

  return `${[
    '{',
    `  "input": ${JSON.stringify(config.input)},`,
    `  "output": ${JSON.stringify(config.output)},`,
    ...prefixLines,
    '',
    '  // Optional tsconfig override. Default: nearest tsconfig.json to the input.',
    '  // "tsconfig": "tsconfig.json",',
    '',
    `  // Optional defaults override. ${defaultsPath} is discovered automatically.`,
    '  // "defaults": {',
    `  //   "path": ${JSON.stringify(defaultsPath)},`,
    '  //   "unknownKeys": "error" // Allowed: "error", "warn", or "ignore".',
    '  // },',
    '',
    '  // Policy for defaults on secret fields. Allowed: "warn", "allow", or "error".',
    '  // "secretDefaults": "warn"',
    '}',
  ].join('\n')}\n`;
};

const selectInput = (
  projectDirectory: string,
  options: InitOptions,
  existingConfig: InitConfig | undefined,
): string => {
  if (options.input !== undefined) return options.input;
  if (existingConfig?.input !== undefined) return existingConfig.input;
  const candidates = CONVENTIONAL_INPUTS.filter((path) =>
    isRegularFile(resolve(projectDirectory, path)),
  );

  if (candidates.length > 1) {
    throw new InitProjectError(
      `Multiple conventional schemas exist: ${candidates.join(', ')}; use --input.`,
    );
  }

  return candidates[0] ?? 'src/config.ts';
};

const rejectConflictingOptions = (
  options: InitOptions,
  existing: InitConfig | undefined,
  selected: { readonly input: string; readonly output: string },
): void => {
  if (existing === undefined) return;
  const comparisons: Array<[string, string | undefined, string | undefined]> = [
    ['--input', options.input, existing.input ?? selected.input],
    ['--output', options.output, existing.output ?? selected.output],
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
};

const validateExistingSchemaStyle = (
  projectDirectory: string,
  input: string,
  requestedStyle: SchemaStyle | undefined,
): void => {
  const path = resolve(projectDirectory, input);
  if (requestedStyle === undefined || !isRegularFile(path)) return;
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
};

const validateSchemaPath = (path: string, flag: string): void => {
  if (!SCHEMA_EXTENSIONS.has(extname(path))) {
    throw new InitProjectError(
      `${flag} must use a .ts, .mts, or .cts extension`,
    );
  }
};

const schemaTemplate = (style: SchemaStyle): string =>
  style === 'interface'
    ? `/** @typespun */\nexport interface AppConfig {\n  port: number;\n}\n`
    : `import { Config } from 'typespun';\n\n@Config()\nexport class AppConfig {\n  port!: number;\n}\n`;

const withMissingScripts = (
  document: PackageDocument,
): PackageDocument | undefined => {
  const scripts = document.scripts ?? {};
  const missing = Object.entries(PACKAGE_SCRIPTS).filter(
    ([name]) => scripts[name] === undefined,
  );
  if (missing.length === 0) return undefined;
  return {
    ...document,
    scripts: { ...scripts, ...Object.fromEntries(missing) },
  };
};

const findInstalledPackage = (
  directory: string,
  packageName: string,
): boolean => {
  if (
    isRegularFile(join(directory, 'node_modules', packageName, 'package.json'))
  ) {
    return true;
  }

  const parent = dirname(directory);
  return parent !== directory && findInstalledPackage(parent, packageName);
};

const missingDependencies = (projectDirectory: string): string[] =>
  ['typespun', 'typespun-codegen'].filter(
    (name) => !findInstalledPackage(resolve(projectDirectory), name),
  );

const isPackageManager = (value: string | undefined): value is PackageManager =>
  value === 'bun' || value === 'npm' || value === 'pnpm' || value === 'yarn';

const detectPackageManager = (
  projectDirectory: string,
  document: PackageDocument,
): PackageManager => {
  const configured = document.packageManager?.split('@')[0];
  if (isPackageManager(configured)) return configured;

  if (
    isRegularFile(join(projectDirectory, 'bun.lock')) ||
    isRegularFile(join(projectDirectory, 'bun.lockb'))
  ) {
    return 'bun';
  }

  if (isRegularFile(join(projectDirectory, 'pnpm-lock.yaml'))) return 'pnpm';
  if (isRegularFile(join(projectDirectory, 'yarn.lock'))) return 'yarn';
  return 'npm';
};

const installCommand = (
  manager: PackageManager,
  packageName: string,
  development: boolean,
): string => {
  if (manager === 'npm') {
    return `npm install${development ? ' --save-dev' : ''} ${packageName}`;
  }

  if (manager === 'yarn') {
    return `yarn add${development ? ' --dev' : ''} ${packageName}`;
  }

  if (!development) return `${manager} add ${packageName}`;
  const developmentFlag = manager === 'pnpm' ? ' --save-dev' : ' --dev';
  return `${manager} add${developmentFlag} ${packageName}`;
};

const installationGuidance = (
  projectDirectory: string,
  packageDocument: PackageDocument,
  missing: readonly string[],
): string[] => {
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
};

const writeNewFile = async (path: string, contents: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, { encoding: 'utf8', flag: 'wx' });
};

const canonicalPath = (
  ancestor: string,
  remainder: readonly string[],
  path: string,
): string => {
  const canonicalAncestor = attempt(() => realpathSync(ancestor));
  if (canonicalAncestor.ok)
    return resolve(canonicalAncestor.data, ...remainder);
  const parent = dirname(ancestor);
  if (parent === ancestor) return resolve(path);
  return canonicalPath(parent, [basename(ancestor), ...remainder], path);
};

const fileIdentity = (
  path: string,
): {
  canonicalPath: string;
  stat?: ReturnType<typeof statSync>;
} => {
  const existing = attempt(() => ({
    canonicalPath: realpathSync(path),
    stat: statSync(path),
  }));
  if (existing.ok) return existing.data;
  return {
    canonicalPath: canonicalPath(dirname(path), [basename(path)], path),
  };
};

const pathsReferToSameFile = (first: string, second: string): boolean => {
  const { canonicalPath: firstPath, stat: firstStat } = fileIdentity(first);
  const { canonicalPath: secondPath, stat: secondStat } = fileIdentity(second);
  if (firstStat === undefined || secondStat === undefined)
    return firstPath === secondPath;
  const sameEntry =
    firstStat.dev === secondStat.dev && firstStat.ino === secondStat.ino;
  return sameEntry || firstPath === secondPath;
};

const isTypespunGeneratedOutput = (path: string): boolean => {
  const read = attempt(() => readFileSync(path, 'utf8'));
  if (!read.ok) return false;
  const contents = read.data;
  return (
    /^\/\/ Generated by typespun-codegen\. Do not edit\.\n\/\/ Schema fingerprint: [a-f0-9]{64}\n\n/u.test(
      contents,
    ) &&
    contents.includes("from 'typespun/generated';") &&
    contents.includes('export type Config = TypespunConfig;') &&
    contents.includes('export const loadConfig = createLoader<Config>(schema);')
  );
};

const rejectUnsafeOutput = (
  inputPath: string,
  outputPath: string,
  output: string,
): void => {
  if (pathsReferToSameFile(inputPath, outputPath)) {
    throw new InitProjectError('Schema input and generated output must differ');
  }

  if (pathEntryExists(outputPath) && !isTypespunGeneratedOutput(outputPath)) {
    throw new InitProjectError(
      `Initialization refuses to overwrite the existing output at ${output}`,
    );
  }
};

const planDefaults = (
  projectDirectory: string,
  existingConfig: InitConfig | undefined,
): DefaultsPlan => {
  const discovered =
    existingConfig?.defaults === undefined
      ? discoverDefaultsPath(projectDirectory)
      : undefined;
  const create =
    existingConfig?.defaults === undefined && discovered === undefined;
  const path = join(projectDirectory, 'config.yaml');

  if (create && pathEntryExists(path)) {
    throw new InitProjectError(
      'Initialization refuses to overwrite the existing entry at config.yaml',
    );
  }

  return { discovered, create, path };
};

const lacksRequestedKeys = (
  existingConfig: InitConfig | undefined,
  requestedEnvPrefix: string | undefined,
): boolean =>
  existingConfig !== undefined &&
  (existingConfig.input === undefined ||
    existingConfig.output === undefined ||
    (requestedEnvPrefix !== undefined &&
      existingConfig.envPrefix === undefined));

const planInitialization = async (
  projectDirectory: string,
  options: InitOptions,
): Promise<InitPlan> => {
  const packagePath = join(projectDirectory, 'package.json');
  rejectMutableSymlink(packagePath, 'package.json');
  const packageDocument = readPackageDocument(packagePath);

  const configPath = join(projectDirectory, 'typespun.json');
  rejectMutableSymlink(configPath, 'typespun.json');
  const existingConfig = existsSync(configPath)
    ? readInitConfig(configPath)
    : undefined;
  const shouldPrompt =
    options.interactive ?? (process.stdin.isTTY && process.env.CI !== 'true');
  const input = selectInput(projectDirectory, options, existingConfig);
  const output =
    options.output ??
    existingConfig?.output ??
    `src/generated/typespun${extname(input)}`;
  validateSchemaPath(input, '--input');
  validateSchemaPath(output, '--output');
  rejectConflictingOptions(options, existingConfig, { input, output });
  validateExistingSchemaStyle(projectDirectory, input, options.style);
  const inputPath = resolve(projectDirectory, input);
  const outputPath = resolve(projectDirectory, output);
  const inputNeedsCreation = !existsSync(inputPath);
  // An existing schema keeps its style, so only a new schema may prompt.
  const style = await resolveStyle(
    options.style,
    inputNeedsCreation && shouldPrompt,
  );
  const envPrefix = await resolveEnvPrefix(
    options.envPrefix,
    existingConfig?.envPrefix,
    shouldPrompt,
  );
  rejectUnsafeOutput(inputPath, outputPath, output);
  const defaults = planDefaults(projectDirectory, existingConfig);
  const config: InitConfig = {
    ...existingConfig,
    input,
    output,
    ...(envPrefix === undefined ? {} : { envPrefix }),
  };
  preflightResolvedConfig(projectDirectory, config, inputPath);

  return {
    projectDirectory,
    packagePath,
    packageDocument,
    configPath,
    existingConfig,
    config,
    configNeedsMissingKeys: lacksRequestedKeys(
      existingConfig,
      options.envPrefix,
    ),
    input,
    inputPath,
    inputNeedsCreation,
    style,
    defaults,
  };
};

const writeInitConfig = async (plan: InitPlan): Promise<string | undefined> => {
  const { projectDirectory, configPath, config, defaults } = plan;

  if (plan.existingConfig === undefined) {
    const defaultsPath =
      defaults.discovered === undefined
        ? 'config.yaml'
        : displayPath(projectDirectory, defaults.discovered);
    await writeNewFile(configPath, serializeNewConfig(config, defaultsPath));
    return 'Created typespun.json.';
  }

  if (!plan.configNeedsMissingKeys) return undefined;
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return 'Added missing paths to typespun.json.';
};

const applyInitialization = async (plan: InitPlan): Promise<string[]> => {
  const messages: string[] = [];

  if (plan.inputNeedsCreation) {
    await writeNewFile(plan.inputPath, schemaTemplate(plan.style));
    messages.push(`Created ${plan.input}.`);
  }

  if (plan.defaults.create) {
    await writeNewFile(
      plan.defaults.path,
      plan.inputNeedsCreation ? 'port: 3000\n' : '{}\n',
    );
    messages.push('Created config.yaml.');
  }

  const configMessage = await writeInitConfig(plan);
  if (configMessage !== undefined) messages.push(configMessage);
  const updatedPackage = withMissingScripts(plan.packageDocument);

  if (updatedPackage !== undefined) {
    await writeFile(
      plan.packagePath,
      `${JSON.stringify(updatedPackage, null, 2)}\n`,
    );
    messages.push('Added config:generate and config:check scripts.');
  }

  return messages;
};

export const initializeProject = async (
  cwd: string,
  options: InitOptions,
): Promise<InitResult> => {
  const plan = await planInitialization(resolve(cwd), options);
  const messages = await applyInitialization(plan);
  const { projectDirectory, configPath } = plan;
  const missing = missingDependencies(projectDirectory);

  if (missing.length > 0) {
    return {
      exitCode: 0,
      messages,
      warnings: installationGuidance(
        projectDirectory,
        plan.packageDocument,
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
};
