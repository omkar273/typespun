import { generateProject } from '../generate.js';
import { formatDiagnostic } from './diagnostics.js';
import { initializeProject, type InitOptions } from './init.js';

const HELP = `Usage: typespun <command> [options]

Commands:
  init       Initialize a Typespun project
  generate   Generate the typed configuration loader
  check      Check that generated output is current

Options:
  -h, --help              Show help

Init options:
  --style interface|class
  --input <path>
  --output <path>
  --env-prefix <prefix>

Generate/check options:
  --config <path>
`;

interface CliStreams {
  readonly stdout: { write(value: string): unknown; readonly isTTY?: boolean };
  readonly stderr: { write(value: string): unknown; readonly isTTY?: boolean };
}

class UsageError extends Error {}

export async function runCli(
  args: readonly string[],
  streams: CliStreams = process,
  cwd = process.cwd(),
): Promise<number> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    streams.stdout.write(HELP);
    return 0;
  }

  try {
    const [command, ...commandArgs] = args;
    if (command === 'generate' || command === 'check') {
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
      const color =
        streams.stderr.isTTY === true && process.env.NO_COLOR === undefined;
      for (const warning of result.warnings) {
        streams.stderr.write(`${formatDiagnostic(warning, { cwd, color })}\n`);
      }
      for (const diagnostic of result.diagnostics) {
        streams.stderr.write(
          `${formatDiagnostic(diagnostic, { cwd, color })}\n`,
        );
      }
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
    }
    if (command === 'init') {
      if (isHelpOnly(commandArgs)) {
        streams.stdout.write(HELP);
        return 0;
      }
      const result = await initializeProject(
        cwd,
        parseInitArguments(commandArgs),
      );
      for (const line of result.messages) streams.stdout.write(`${line}\n`);
      for (const line of result.warnings) streams.stderr.write(`${line}\n`);
      const color =
        streams.stderr.isTTY === true && process.env.NO_COLOR === undefined;
      for (const diagnostic of result.diagnostics) {
        streams.stderr.write(
          `${formatDiagnostic(diagnostic, { cwd, color })}\n`,
        );
      }
      return result.exitCode;
    }
    throw new UsageError(`Unknown command: ${command ?? ''}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    streams.stderr.write(`typespun: ${message}\n`);
    if (error instanceof UsageError || isProjectConfigurationError(error)) {
      streams.stderr.write('Run typespun --help for usage.\n');
      return 2;
    }
    return 1;
  }
}

function parseConfigArguments(args: readonly string[]): string | undefined {
  let configPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument !== '--config')
      throw new UsageError(`Unknown option: ${argument}`);
    if (configPath !== undefined)
      throw new UsageError('--config may be specified only once');
    configPath = requiredValue(args, ++index, '--config');
  }
  return configPath;
}

function parseInitArguments(args: readonly string[]): InitOptions {
  const options: {
    style?: 'interface' | 'class';
    input?: string;
    output?: string;
    envPrefix?: string;
  } = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]!;
    if (argument === '--style') {
      const style = requiredValue(args, ++index, argument);
      if (style !== 'interface' && style !== 'class') {
        throw new UsageError('--style must be interface or class');
      }
      if (options.style !== undefined)
        throw new UsageError('--style may be specified only once');
      options.style = style;
    } else if (argument === '--input') {
      options.input = uniqueValue(
        options.input,
        requiredValue(args, ++index, argument),
        argument,
      );
    } else if (argument === '--output') {
      options.output = uniqueValue(
        options.output,
        requiredValue(args, ++index, argument),
        argument,
      );
    } else if (argument === '--env-prefix') {
      options.envPrefix = uniqueValue(
        options.envPrefix,
        requiredValue(args, ++index, argument),
        argument,
      );
    } else {
      throw new UsageError(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function requiredValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

function uniqueValue(
  previous: string | undefined,
  value: string,
  flag: string,
): string {
  if (previous !== undefined)
    throw new UsageError(`${flag} may be specified only once`);
  return value;
}

function isHelpOnly(args: readonly string[]): boolean {
  return args.length === 1 && (args[0] === '--help' || args[0] === '-h');
}

function isProjectConfigurationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ProjectConfigError' ||
    error.name === 'ProjectDiscoveryError' ||
    error.name === 'InitProjectError' ||
    error.message.startsWith('Could not find tsconfig.json')
  );
}

function relativeOutput(path: string, cwd: string): string {
  return (path.startsWith(cwd) ? path.slice(cwd.length + 1) : path) || path;
}
