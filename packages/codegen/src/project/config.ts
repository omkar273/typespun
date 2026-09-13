import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import ts from 'typescript';
import type { SecretDefaultsPolicy, UnknownKeysPolicy } from '../contracts.js';
import {
  discoverDefaultsPath,
  discoverInputPath,
  findNearestTsconfig,
} from './discovery.js';

export interface LoadProjectConfigOptions {
  readonly projectDirectory: string;
  readonly configPath?: string;
}

export interface ProjectConfigResult {
  readonly configDirectory: string;
  readonly inputPath: string;
  readonly outputPath: string;
  readonly tsconfigPath: string;
  readonly defaultsPath?: string;
  readonly envPrefix?: string;
  readonly unknownKeys: UnknownKeysPolicy;
  readonly secretDefaults: SecretDefaultsPolicy;
}

interface RawProjectConfig {
  readonly input?: string;
  readonly output?: string;
  readonly tsconfig?: string;
  readonly envPrefix?: string;
  readonly defaults?: string | RawDefaultsConfig;
  readonly secretDefaults?: SecretDefaultsPolicy;
}

interface RawDefaultsConfig {
  readonly path?: string;
  readonly unknownKeys?: UnknownKeysPolicy;
}

const OUTPUT_EXTENSIONS = new Set(['.ts', '.mts', '.cts']);
const UNKNOWN_KEYS_POLICIES = new Set<UnknownKeysPolicy>([
  'error',
  'warn',
  'ignore',
]);
const SECRET_DEFAULTS_POLICIES = new Set<SecretDefaultsPolicy>([
  'warn',
  'allow',
  'error',
]);

export class ProjectConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectConfigError';
  }
}

export function loadProjectConfig(
  options: LoadProjectConfigOptions,
): ProjectConfigResult {
  const projectDirectory = resolve(options.projectDirectory);
  const configPath = options.configPath
    ? resolve(projectDirectory, options.configPath)
    : resolve(projectDirectory, 'typespun.json');
  const hasConfig = options.configPath !== undefined || existsSync(configPath);
  const config = hasConfig ? readProjectConfig(configPath) : {};
  const configDirectory = hasConfig ? dirname(configPath) : projectDirectory;

  const inputPath = config.input
    ? resolve(configDirectory, config.input)
    : discoverInputPath(configDirectory);
  validateInputExtension(inputPath);

  const outputPath = config.output
    ? resolve(configDirectory, config.output)
    : resolve(configDirectory, `src/generated/typespun${extname(inputPath)}`);
  validateOutputExtension(outputPath);

  const tsconfigPath = config.tsconfig
    ? resolve(configDirectory, config.tsconfig)
    : findNearestTsconfig(inputPath);
  if (tsconfigPath === undefined) {
    throw new Error(`Could not find tsconfig.json for ${inputPath}`);
  }

  const defaults = resolveDefaults(config.defaults, configDirectory);
  const envPrefix = config.envPrefix?.replace(/_+$/, '');

  return {
    configDirectory,
    inputPath,
    outputPath,
    tsconfigPath,
    ...(defaults.path === undefined ? {} : { defaultsPath: defaults.path }),
    ...(envPrefix === undefined ? {} : { envPrefix }),
    unknownKeys: defaults.unknownKeys,
    secretDefaults: config.secretDefaults ?? 'warn',
  };
}

function readProjectConfig(path: string): RawProjectConfig {
  let value: unknown;
  try {
    const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
    if (parsed.error !== undefined) throw new Error('invalid JSON');
    value = parsed.config;
  } catch {
    throw new ProjectConfigError(
      'Could not parse typespun.json as JSON with comments',
    );
  }

  if (!isRecord(value)) {
    throw new ProjectConfigError('typespun.json must contain an object');
  }

  rejectUnknownKeys(
    value,
    ['input', 'output', 'tsconfig', 'envPrefix', 'defaults', 'secretDefaults'],
    'typespun.json',
  );
  assertOptionalString(value, 'input', 'typespun.json.input');
  assertOptionalString(value, 'output', 'typespun.json.output');
  assertOptionalString(value, 'tsconfig', 'typespun.json.tsconfig');
  assertOptionalString(value, 'envPrefix', 'typespun.json.envPrefix');
  assertSecretDefaultsPolicy(value.secretDefaults);

  if (value.defaults !== undefined) {
    validateDefaultsConfig(value.defaults);
  }

  return value as RawProjectConfig;
}

function validateDefaultsConfig(value: unknown): void {
  if (typeof value === 'string') {
    return;
  }
  if (!isRecord(value)) {
    throw new ProjectConfigError(
      'typespun.json.defaults must be a string or object',
    );
  }

  rejectUnknownKeys(value, ['path', 'unknownKeys'], 'defaults');
  assertOptionalString(value, 'path', 'typespun.json.defaults.path');
  assertUnknownKeysPolicy(value.unknownKeys);
}

function resolveDefaults(
  defaults: RawProjectConfig['defaults'],
  configDirectory: string,
): { path?: string; unknownKeys: UnknownKeysPolicy } {
  if (typeof defaults === 'string') {
    return { path: resolve(configDirectory, defaults), unknownKeys: 'error' };
  }

  if (defaults?.path !== undefined) {
    return {
      path: resolve(configDirectory, defaults.path),
      unknownKeys: defaults.unknownKeys ?? 'error',
    };
  }

  const path = discoverDefaultsPath(configDirectory);
  return path === undefined
    ? { unknownKeys: defaults?.unknownKeys ?? 'error' }
    : { path, unknownKeys: defaults?.unknownKeys ?? 'error' };
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new ProjectConfigError(`Unknown ${context} key: ${key}`);
    }
  }
}

function assertOptionalString(
  value: Record<string, unknown>,
  key: string,
  context: string,
): void {
  if (value[key] !== undefined && typeof value[key] !== 'string') {
    throw new ProjectConfigError(`${context} must be a string`);
  }
}

function assertUnknownKeysPolicy(value: unknown): void {
  if (
    value !== undefined &&
    !UNKNOWN_KEYS_POLICIES.has(value as UnknownKeysPolicy)
  ) {
    throw new ProjectConfigError(
      'typespun.json.defaults.unknownKeys must be error, warn, or ignore',
    );
  }
}

function assertSecretDefaultsPolicy(value: unknown): void {
  if (
    value !== undefined &&
    !SECRET_DEFAULTS_POLICIES.has(value as SecretDefaultsPolicy)
  ) {
    throw new ProjectConfigError(
      'typespun.json.secretDefaults must be warn, allow, or error',
    );
  }
}

function validateInputExtension(path: string): void {
  if (!OUTPUT_EXTENSIONS.has(extname(path))) {
    throw new ProjectConfigError(
      'input must use a .ts, .mts, or .cts extension',
    );
  }
}

function validateOutputExtension(path: string): void {
  if (!OUTPUT_EXTENSIONS.has(extname(path))) {
    throw new ProjectConfigError(
      'output must use a .ts, .mts, or .cts extension',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
