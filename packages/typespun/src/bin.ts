#!/usr/bin/env node
// @ts-nocheck

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface SpawnErrorWithCode extends Error {
  code?: string;
}

const cliArgs = process.argv.slice(2);

const exitCode = await run(cliArgs);
process.exitCode = exitCode;

async function run(args: string[]): Promise<number> {
  const localBinary = resolveCodegenBinary(process.cwd());
  if (localBinary !== undefined) {
    return runCommand(process.execPath, [localBinary, ...args]);
  }
  return runFallback(args);
}

function resolveCodegenBinary(start: string): string | undefined {
  let directory = resolve(start);
  while (true) {
    const candidate = join(
      directory,
      'node_modules',
      'typespun-codegen',
      'dist',
      'bin.js',
    );
    if (existsSync(candidate)) {
      return candidate;
    }
    const siblingCandidate = join(
      resolve(fileURLToPath(new URL('.', import.meta.url))),
      '..',
      'typespun-codegen',
      'dist',
      'bin.js',
    );
    if (existsSync(siblingCandidate)) {
      return siblingCandidate;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  return undefined;
}

async function runFallback(args: string[]): Promise<number> {
  const cliNames = ['typespun-codegen', 'typespun'];

  for (const cliName of cliNames) {
    const bunxAttempt = await runIfAvailable('bunx', [
      '--package',
      'typespun-codegen',
      cliName,
      ...args,
    ]);
    if (bunxAttempt !== null) {
      return bunxAttempt;
    }
  }

  for (const cliName of cliNames) {
    const npxAttempt = await runIfAvailable('npx', [
      '--yes',
      '--package=typespun-codegen',
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

function runCommand(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    child.on('error', () => {
      resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function runIfAvailable(
  command: string,
  args: string[],
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    });
    child.on('error', (error: SpawnErrorWithCode) => {
      if (error.code === 'ENOENT') resolve(null);
      else resolve(1);
    });
    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}
