import { afterEach, describe, expect, test } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveCodegenBinary, run } from './cli-shim.js';

const temporaryDirectories: string[] = [];
const originalCwd = process.cwd();
const originalPath = process.env.PATH;

afterEach(async () => {
  process.chdir(originalCwd);
  process.env.PATH = originalPath;
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function makeDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'typespun-shim-unit-'));
  temporaryDirectories.push(path);
  return path;
}

async function installCodegen(root: string, exitCode = 0): Promise<string> {
  const directory = join(root, 'node_modules/typespun-codegen/dist');
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'bin.js');
  await writeFile(path, `process.exitCode = ${exitCode};\n`);
  return path;
}

/** A silent stand-in for bunx or npx on PATH. */
async function installFakeLauncher(
  directory: string,
  name: string,
  exitCode: number,
): Promise<void> {
  const path = join(directory, name);
  await writeFile(path, `#!/bin/sh\nexit ${exitCode}\n`);
  await chmod(path, 0o755);
}

/** Collects what the shim writes without letting it reach the test output. */
async function captureStderr(fn: () => Promise<number>): Promise<{
  exitCode: number;
  stderr: string;
}> {
  const original = process.stderr.write.bind(process.stderr);
  let stderr = '';
  process.stderr.write = ((value: string) => {
    stderr += value;
    return true;
  }) as typeof process.stderr.write;
  try {
    return { exitCode: await fn(), stderr };
  } finally {
    process.stderr.write = original;
  }
}

describe('resolveCodegenBinary', () => {
  test('finds a code generator installed in the starting directory', async () => {
    const project = await makeDirectory();
    const expected = await installCodegen(project);

    expect(resolveCodegenBinary(project)).toBe(expected);
  });

  test('walks up to a code generator hoisted into an ancestor', async () => {
    const workspace = await makeDirectory();
    const expected = await installCodegen(workspace);
    const nested = join(workspace, 'packages/app/src');
    await mkdir(nested, { recursive: true });

    expect(resolveCodegenBinary(nested)).toBe(expected);
  });

  test('finds a code generator unpacked beside the runtime package', async () => {
    const project = await makeDirectory();
    const installRoot = await makeDirectory();
    const moduleDirectory = join(installRoot, 'typespun', 'dist');
    // npm can nest the generator inside the runtime package.
    const directory = join(installRoot, 'typespun', 'typespun-codegen', 'dist');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'bin.js'), 'process.exitCode = 0;\n');

    expect(resolveCodegenBinary(project, moduleDirectory)).toBe(
      join(directory, 'bin.js'),
    );
  });

  test('returns undefined when no ancestor provides one', async () => {
    const project = await makeDirectory();

    expect(resolveCodegenBinary(project)).toBeUndefined();
  });
});

describe('run', () => {
  test('executes the located binary and propagates its exit code', async () => {
    const project = await makeDirectory();
    await installCodegen(project, 3);
    process.chdir(project);

    expect(await run(['generate'])).toBe(3);
  });

  test('falls back to bunx when no binary is installed', async () => {
    const project = await makeDirectory();
    const binDirectory = await makeDirectory();
    await installFakeLauncher(binDirectory, 'bunx', 0);
    process.chdir(project);
    process.env.PATH = binDirectory;

    expect(await run(['generate'])).toBe(0);
  });

  test('falls back to npx when bunx is unavailable', async () => {
    const project = await makeDirectory();
    const binDirectory = await makeDirectory();
    await installFakeLauncher(binDirectory, 'npx', 4);
    process.chdir(project);
    process.env.PATH = binDirectory;

    expect(await run(['check'])).toBe(4);
  });

  test('stops at a launcher that exists but cannot be executed', async () => {
    const project = await makeDirectory();
    const binDirectory = await makeDirectory();
    // Present on PATH but without the executable bit: spawning it fails with
    // EACCES rather than ENOENT, so it is not treated as "not installed".
    await writeFile(join(binDirectory, 'bunx'), '#!/bin/sh\nexit 0\n');
    process.chdir(project);
    process.env.PATH = binDirectory;

    expect(await run(['generate'])).toBe(1);
  });

  test('reports guidance and exits 127 when nothing can run the CLI', async () => {
    const project = await makeDirectory();
    const emptyBin = await makeDirectory();
    process.chdir(project);
    process.env.PATH = emptyBin;

    const result = await captureStderr(() => run(['generate']));

    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('Unable to run the typespun CLI.');
  });

  test('treats a signal-killed code generator as a failure', async () => {
    const project = await makeDirectory();
    const directory = join(project, 'node_modules/typespun-codegen/dist');
    await mkdir(directory, { recursive: true });
    // Exits via a signal, so the close event reports a null code.
    await writeFile(
      join(directory, 'bin.js'),
      "process.kill(process.pid, 'SIGKILL');\n",
    );
    process.chdir(project);

    expect(await run(['generate'])).toBe(1);
  });

  test('treats a signal-killed launcher as a failure', async () => {
    const project = await makeDirectory();
    const binDirectory = await makeDirectory();
    const path = join(binDirectory, 'bunx');
    await writeFile(path, '#!/bin/sh\nkill -9 $$\n');
    await chmod(path, 0o755);
    process.chdir(project);
    process.env.PATH = binDirectory;

    expect(await run(['generate'])).toBe(1);
  });
});
