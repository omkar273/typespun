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

export async function run(args: readonly string[]): Promise<number> {
  const localBinary = resolveCodegenBinary(process.cwd());
  if (localBinary !== undefined) {
    return runCommand(process.execPath, [localBinary, ...args]);
  }
  return runFallback(args);
}

export function resolveCodegenBinary(
  start: string,
  /** Directory of this module; overridable so the sibling lookup is testable. */
  moduleDirectory = resolve(fileURLToPath(new URL('.', import.meta.url))),
): string | undefined {
  const siblingCandidate = join(
    moduleDirectory,
    '..',
    CODEGEN_PACKAGE,
    'dist',
    'bin.js',
  );
  let directory = resolve(start);
  while (true) {
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
    if (parent === directory) break;
    directory = parent;
  }

  return undefined;
}

async function runFallback(args: readonly string[]): Promise<number> {
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
}

function runCommand(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolveExit) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    /* v8 ignore next 3 -- the command is always process.execPath, so spawn
       itself cannot fail here. */
    child.on('error', () => {
      resolveExit(1);
    });
    child.on('close', (code) => {
      resolveExit(code ?? 1);
    });
  });
}

function runIfAvailable(
  command: string,
  args: readonly string[],
): Promise<number | null> {
  return new Promise((resolveExit) => {
    const child = spawn(command, [...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') resolveExit(null);
      else resolveExit(1);
    });
    child.on('close', (code) => {
      resolveExit(code ?? 1);
    });
  });
}
