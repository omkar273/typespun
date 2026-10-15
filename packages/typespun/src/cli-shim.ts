import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locates typespun-codegen and re-executes it. Kept separate from bin.ts so the
 * resolution and fallback behaviour is reachable without spawning a process.
 */

const CODEGEN_PACKAGE = 'typespun-codegen';
const CLI_NAMES = [CODEGEN_PACKAGE, 'typespun'] as const;

const findCodegenBinary = (
  directory: string,
  siblingCandidate: string,
): string | undefined => {
  const candidate = join(
    directory,
    'node_modules',
    CODEGEN_PACKAGE,
    'dist',
    'bin.js',
  );

  if (existsSync(candidate)) {
    return candidate;
  }

  if (existsSync(siblingCandidate)) {
    return siblingCandidate;
  }

  const parent = dirname(directory);

  return parent === directory
    ? undefined
    : findCodegenBinary(parent, siblingCandidate);
};

export const resolveCodegenBinary = (
  start: string,
  /** Directory of this module; overridable so the sibling lookup is testable. */
  moduleDirectory = resolve(fileURLToPath(new URL('.', import.meta.url))),
): string | undefined =>
  findCodegenBinary(
    resolve(start),
    join(moduleDirectory, '..', CODEGEN_PACKAGE, 'dist', 'bin.js'),
  );

const runFallback = async (args: readonly string[]): Promise<number> => {
  for (const cliName of CLI_NAMES) {
    const bunxAttempt = await runIfAvailable('bunx', [
      '--package',
      CODEGEN_PACKAGE,
      cliName,
      ...args,
    ]);

    if (bunxAttempt !== null) {
      return bunxAttempt;
    }
  }

  for (const cliName of CLI_NAMES) {
    const npxAttempt = await runIfAvailable('npx', [
      '--yes',
      `--package=${CODEGEN_PACKAGE}`,
      cliName,
      ...args,
    ]);

    if (npxAttempt !== null) {
      return npxAttempt;
    }
  }

  process.stderr.write(
    'Unable to run the typespun CLI. Install bunx (Bun), npm/npx, or typespun-codegen in this project.\n',
  );
  return 127;
};

const runCommand = (
  command: string,
  args: readonly string[],
): Promise<number> =>
  new Promise((resolveExit) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    /* v8 ignore next 3 -- the command is always process.execPath, so spawn
       itself cannot fail here. */
    child.on('error', () => resolveExit(1));
    child.on('close', (code) => resolveExit(code ?? 1));
  });

const runIfAvailable = (
  command: string,
  args: readonly string[],
): Promise<number | null> =>
  new Promise((resolveExit) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') resolveExit(null);
      else resolveExit(1);
    });
    child.on('close', (code) => resolveExit(code ?? 1));
  });

export const run = async (args: readonly string[]): Promise<number> => {
  const localBinary = resolveCodegenBinary(process.cwd());

  if (localBinary !== undefined) {
    return runCommand(process.execPath, [localBinary, ...args]);
  }

  return runFallback(args);
};
