import { afterEach, describe, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createBareProject,
  createProject,
  linkWorkspaceDependencies,
  removeTemporaryDirectories,
} from '../testing/project-fixture.js';

/**
 * End-to-end coverage of the published binary. Command behaviour itself is
 * tested in-process in main.test.ts and init.test.ts; these cases only prove
 * what a subprocess can prove: that dist/bin.js is wired to runCli, that exit
 * codes reach the shell, that interactive prompts read stdin, and that init
 * never shells out to a package manager.
 */
const binPath = join(import.meta.dirname, '..', '..', 'dist', 'bin.js');

afterEach(removeTemporaryDirectories);

interface CliRun {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runBinary(
  cwd: string,
  args: readonly string[],
  options: { env?: Record<string, string | undefined> } = {},
): Promise<CliRun> {
  const child = spawn(process.execPath, [binPath, ...args], {
    cwd,
    env: options.env ?? { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
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
  child.stdin.end();
  return new Promise<CliRun>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({ exitCode: code ?? 1, stdout, stderr }),
    );
  });
}

/**
 * Answers prompts one at a time. `promptLine` builds a fresh readline
 * interface per question, so the whole script cannot be piped up front: each
 * answer is written only once its prompt has actually been printed.
 */
function runBinaryInteractive(
  cwd: string,
  args: readonly string[],
  dialogue: readonly { readonly prompt: string; readonly answer: string }[],
): Promise<CliRun> {
  const child = spawn(process.execPath, [binPath, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });

  let remaining = [...dialogue];
  let seen = 0;
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
    // Count prompts as they arrive so a repeated question gets its own answer.
    const next = remaining[0];
    if (next === undefined) return;
    const occurrences = stdout.split(next.prompt).length - 1;
    if (occurrences > seen) {
      seen = 0;
      remaining = remaining.slice(1);
      child.stdin.write(`${next.answer}\n`);
      if (remaining.length === 0) child.stdin.end();
    }
  });

  return new Promise<CliRun>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      child.stdin.end();
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

describe('published binary', () => {
  test('prints help and exits zero', async () => {
    const result = await runBinary(process.cwd(), ['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: typespun');
  });

  test('generates and checks a project through the real process', async () => {
    const project = await createProject();

    const generated = await runBinary(project, ['generate']);
    expect(generated.exitCode).toBe(0);
    expect(generated.stdout).toContain('Generated');

    const checked = await runBinary(project, ['check']);
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toContain('up to date');
  });

  test('propagates failure and usage exit codes to the shell', async () => {
    const broken = await createProject(`/** @typespun */
export interface AppConfig { createdAt: Date }
`);
    const usable = await createProject();

    expect((await runBinary(broken, ['generate'])).exitCode).toBe(1);
    expect((await runBinary(usable, ['wat'])).exitCode).toBe(2);
  });

  test('scaffolds and generates a project end to end', async () => {
    const project = await createBareProject();
    await linkWorkspaceDependencies(project);

    const result = await runBinary(project, ['init', '--no-interactive']);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project, 'src/generated/typespun.ts'))).toBe(true);
  });

  test('reads interactive answers from stdin and re-asks on a bad one', async () => {
    const project = await createBareProject();

    const result = await runBinaryInteractive(
      project,
      ['init', '--interactive'],
      [
        { prompt: 'Which schema style', answer: 'nope' },
        { prompt: 'Which schema style', answer: 'class' },
        { prompt: 'Optional environment variable prefix', answer: 'APP' },
      ],
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Please answer "interface" or "class"');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toContain(
      '@Config()\nexport class AppConfig',
    );
    expect(await readFile(join(project, 'typespun.json'), 'utf8')).toContain(
      '"envPrefix": "APP"',
    );
  });

  test('accepts empty interactive answers as the defaults', async () => {
    const project = await createBareProject();

    const result = await runBinaryInteractive(
      project,
      ['init', '--interactive'],
      [
        { prompt: 'Which schema style', answer: '' },
        { prompt: 'Optional environment variable prefix', answer: '' },
      ],
    );

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toContain(
      'export interface AppConfig',
    );
    expect(await readFile(join(project, 'typespun.json'), 'utf8')).toContain(
      '// "envPrefix": "APP",',
    );
  });

  test('prints package-manager commands without executing an installer', async () => {
    const project = await createBareProject({ packageManager: 'pnpm@10.0.0' });
    const fakeBin = join(project, 'fake-bin');
    const invocationLog = join(project, 'invocations.txt');
    await mkdir(fakeBin);
    await writeFile(
      join(fakeBin, 'pnpm'),
      `#!/bin/sh\necho invoked >> '${invocationLog}'\nexit 99\n`,
    );
    await chmod(join(fakeBin, 'pnpm'), 0o755);

    const result = await runBinary(project, ['init', '--no-interactive'], {
      env: { ...process.env, PATH: fakeBin, NO_COLOR: '1' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('pnpm add typespun');
    expect(result.stderr).toContain('pnpm add --save-dev typespun-codegen');
    expect(existsSync(invocationLog)).toBe(false);
  });
});
