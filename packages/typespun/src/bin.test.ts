import { afterEach, describe, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The `typespun` binary is a shim: it locates typespun-codegen and re-executes
 * it. It is a top-level-await script, so it can only be exercised as a real
 * process.
 */
const shimPath = join(import.meta.dirname, '..', 'dist', 'bin.js');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function makeDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'typespun-shim-'));
  temporaryDirectories.push(path);
  return path;
}

/** A stand-in code generator that reports how it was invoked. */
async function installFakeCodegen(root: string, exitCode = 0): Promise<void> {
  const directory = join(root, 'node_modules/typespun-codegen/dist');
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'bin.js'),
    `console.log(JSON.stringify(process.argv.slice(2)));\nprocess.exitCode = ${exitCode};\n`,
  );
}

function runShim(
  cwd: string,
  args: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [shimPath, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({ exitCode: code ?? 1, stdout, stderr }),
    );
  });
}

describe('typespun shim', () => {
  test('runs a code generator installed in the working directory', async () => {
    const project = await makeDirectory();
    await installFakeCodegen(project);

    const result = await runShim(project, ['generate', '--config', 'a.json']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      'generate',
      '--config',
      'a.json',
    ]);
  });

  test('walks up to a code generator hoisted into an ancestor', async () => {
    const workspace = await makeDirectory();
    await installFakeCodegen(workspace);
    const project = join(workspace, 'packages/app');
    await mkdir(project, { recursive: true });

    const result = await runShim(project, ['check']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['check']);
  });

  test('propagates the code generator exit code', async () => {
    const project = await makeDirectory();
    await installFakeCodegen(project, 2);

    expect((await runShim(project, ['check'])).exitCode).toBe(2);
  });

  test('reports installation guidance when nothing can run the CLI', async () => {
    const project = await makeDirectory();
    const emptyBin = await makeDirectory();

    const result = await runShim(project, ['generate'], {
      ...process.env,
      PATH: emptyBin,
    });

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('Unable to run the typespun CLI.');
  });
});
