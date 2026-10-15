import { readFileSync } from 'node:fs';
import { generateProject, type GenerateDiagnostic } from '../generate.js';
import { attempt } from '../internal/attempt.js';
import { formatDiagnostic } from './diagnostics.js';
import { initializeProject, type InitOptions } from './init.js';

const PACKAGE_JSON_URL = new URL('../../package.json', import.meta.url);

const HELP = `Usage: typespun <command> [options]

Commands:
  init       Initialize a Typespun project
  generate   Generate the typed configuration loader
  check      Check that generated output is current

Options:
  -v, --version           Show version
  -h, --help              Show help

Init options:
  --style interface|class
  --input <path>
  --output <path>
  --env-prefix <prefix>
  --interactive             Ask for missing optional values in an interactive terminal

Generate/check options:
  --config <path>
`;

interface CliStreams {
  readonly stdout: { write(value: string): unknown; readonly isTTY?: boolean };
  readonly stderr: { write(value: string): unknown; readonly isTTY?: boolean };
}

interface RunCliOptions {
  readonly streams?: CliStreams;
  readonly cwd?: string;
  readonly packageJsonUrl?: URL;
}

interface CliContext {
  readonly streams: CliStreams;
  readonly cwd: string;
  readonly packageJsonUrl: URL;
}

class UsageError extends Error {}

export const getPackageVersion = (
  packageJsonUrl: URL = PACKAGE_JSON_URL,
): string => {
  const manifest: unknown = JSON.parse(readFileSync(packageJsonUrl, 'utf8'));
  const isObject = typeof manifest === 'object' && manifest !== null;
  const version: unknown =
    isObject && 'version' in manifest ? manifest.version : undefined;

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('typespun-codegen package version is missing');
  }

  return version;
};

const isHelpFlag = (argument: string | undefined): boolean =>
  argument === '--help' || argument === '-h';

const isHelpOnly = (args: readonly string[]): boolean =>
  args.length === 1 && isHelpFlag(args[0]);

const isProjectConfigurationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ProjectConfigError' ||
    error.name === 'ProjectDiscoveryError' ||
    error.name === 'InitProjectError' ||
    error.message.startsWith('Could not find tsconfig.json')
  );
};

const relativeOutput = (path: string, cwd: string): string => {
  if (!path.startsWith(cwd)) return path;
  const relativePath = path.slice(cwd.length + 1);
  return relativePath === '' ? path : relativePath;
};

const requiredValue = (value: string | undefined, flag: string): string => {
  const usable =
    value !== undefined && value.length > 0 && !value.startsWith('--');
  if (!usable) throw new UsageError(`${flag} requires a value`);
  return value;
};

const uniqueValue = (
  previous: string | undefined,
  value: string,
  flag: string,
): string => {
  if (previous !== undefined)
    throw new UsageError(`${flag} may be specified only once`);
  return value;
};

const parseConfigArguments = (args: readonly string[]): string | undefined => {
  const queue = args.values();
  let configPath: string | undefined;

  for (const argument of queue) {
    if (argument !== '--config')
      throw new UsageError(`Unknown option: ${argument}`);
    if (configPath !== undefined)
      throw new UsageError('--config may be specified only once');
    configPath = requiredValue(queue.next().value, '--config');
  }

  return configPath;
};

const parseStyle = (
  value: string | undefined,
  previous: 'interface' | 'class' | undefined,
): 'interface' | 'class' => {
  const style = requiredValue(value, '--style');

  if (style !== 'interface' && style !== 'class') {
    throw new UsageError('--style must be interface or class');
  }

  if (previous !== undefined)
    throw new UsageError('--style may be specified only once');
  return style;
};

const parseInitArguments = (args: readonly string[]): InitOptions => {
  const queue = args.values();
  const options: {
    style?: 'interface' | 'class';
    input?: string;
    output?: string;
    envPrefix?: string;
    interactive?: boolean;
  } = {};

  for (const argument of queue) {
    switch (argument) {
      case '--style':
        options.style = parseStyle(queue.next().value, options.style);
        break;
      case '--input':
        options.input = uniqueValue(
          options.input,
          requiredValue(queue.next().value, argument),
          argument,
        );
        break;
      case '--output':
        options.output = uniqueValue(
          options.output,
          requiredValue(queue.next().value, argument),
          argument,
        );
        break;
      case '--env-prefix':
        options.envPrefix = uniqueValue(
          options.envPrefix,
          requiredValue(queue.next().value, argument),
          argument,
        );
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '--no-interactive':
        options.interactive = false;
        break;
      default:
        throw new UsageError(`Unknown option: ${argument}`);
    }
  }

  return options;
};

const writeDiagnostics = (
  diagnostics: readonly GenerateDiagnostic[],
  { streams, cwd }: CliContext,
): void => {
  const color =
    streams.stderr.isTTY === true && process.env.NO_COLOR === undefined;

  for (const diagnostic of diagnostics) {
    streams.stderr.write(`${formatDiagnostic(diagnostic, { cwd, color })}\n`);
  }
};

const runGenerate = async (
  command: 'generate' | 'check',
  commandArgs: readonly string[],
  context: CliContext,
): Promise<number> => {
  const { streams, cwd } = context;

  if (isHelpOnly(commandArgs)) {
    streams.stdout.write(HELP);
    return 0;
  }

  const configPath = parseConfigArguments(commandArgs);
  const result = await generateProject({
    projectDirectory: cwd,
    mode: command === 'generate' ? 'write' : 'check',
    ...(configPath === undefined ? {} : { configPath }),
  });
  writeDiagnostics([...result.warnings, ...result.diagnostics], context);

  if (result.diagnostics.length > 0) {
    return result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'typescript_config',
    )
      ? 2
      : 1;
  }

  if (result.status === 'stale') {
    streams.stderr.write(
      `${relativeOutput(result.outputPath, cwd)} is stale; run typespun generate.\n`,
    );
    return 1;
  }

  streams.stdout.write(
    command === 'generate'
      ? `${result.status === 'written' ? 'Generated' : 'Unchanged'} ${relativeOutput(result.outputPath, cwd)}.\n`
      : `${relativeOutput(result.outputPath, cwd)} is up to date.\n`,
  );
  return 0;
};

const runInit = async (
  commandArgs: readonly string[],
  context: CliContext,
): Promise<number> => {
  const { streams, cwd } = context;

  if (isHelpOnly(commandArgs)) {
    streams.stdout.write(HELP);
    return 0;
  }

  const result = await initializeProject(cwd, parseInitArguments(commandArgs));
  for (const line of result.messages) streams.stdout.write(`${line}\n`);
  for (const line of result.warnings) streams.stderr.write(`${line}\n`);
  writeDiagnostics(result.diagnostics, context);
  return result.exitCode;
};

const runCommand = async (
  command: string,
  commandArgs: readonly string[],
  context: CliContext,
): Promise<number> => {
  switch (command) {
    case '--version':
    case '-v':
      context.streams.stdout.write(
        `${getPackageVersion(context.packageJsonUrl)}\n`,
      );
      return 0;
    case 'generate':
    case 'check':
      return runGenerate(command, commandArgs, context);
    case 'init':
      return runInit(commandArgs, context);
    default:
      throw new UsageError(`Unknown command: ${command}`);
  }
};

const reportFailure = (error: unknown, streams: CliStreams): number => {
  const message = error instanceof Error ? error.message : String(error);
  streams.stderr.write(`typespun: ${message}\n`);

  if (error instanceof UsageError || isProjectConfigurationError(error)) {
    streams.stderr.write('Run typespun --help for usage.\n');
    return 2;
  }

  return 1;
};

export const runCli = async (
  args: readonly string[],
  {
    streams = process,
    cwd = process.cwd(),
    packageJsonUrl = PACKAGE_JSON_URL,
  }: RunCliOptions = {},
): Promise<number> => {
  const [command, ...commandArgs] = args;

  if (command === undefined || isHelpFlag(command)) {
    streams.stdout.write(HELP);
    return 0;
  }

  const outcome = await attempt(
    () => runCommand(command, commandArgs, { streams, cwd, packageJsonUrl }),
    (thrown: unknown) => thrown,
  );
  return outcome.ok ? outcome.data : reportFailure(outcome.error, streams);
};
