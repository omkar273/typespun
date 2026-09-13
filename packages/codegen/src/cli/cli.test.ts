import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';

const binPath = join(import.meta.dir, '..', 'bin.ts');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CLI exit status', () => {
  test('generate and check exit zero for canonical output', async () => {
    const project = await createProject(validInterface);

    const generated = await runCli(project, 'generate');
    expect(generated.exitCode).toBe(0);
    expect(generated.stdout).toContain('Generated');

    const checked = await runCli(project, 'check');
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toContain('up to date');
  });

  test('check exits one when generated output is stale', async () => {
    const project = await createProject(validInterface);
    expect((await runCli(project, 'generate')).exitCode).toBe(0);
    await writeFile(join(project, 'src/generated/typespun.ts'), '// stale\n');

    const result = await runCli(project, 'check');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('stale');
  });

  test('generate exits one for invalid schema declarations', async () => {
    const project = await createProject(`/** @typespun */
export interface AppConfig { createdAt: Date }
`);

    const result = await runCli(project, 'generate');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/src\/config\.ts:\d+:\d+ \[[^\]]+\]/);
  });

  test('invalid invocations and unusable projects exit two', async () => {
    const project = await createProject(validInterface);
    const unknown = await runCli(project, 'wat');
    const missingFlagValue = await runCli(project, 'generate', '--config');
    const unusable = await runCli(await makeDirectory(), 'generate');

    expect(unknown.exitCode).toBe(2);
    expect(missingFlagValue.exitCode).toBe(2);
    expect(unusable.exitCode).toBe(2);
  });

  test('a malformed TypeScript project is an unusable project configuration', async () => {
    const project = await createProject(validInterface);
    await writeFile(join(project, 'tsconfig.json'), '{ nope');

    const result = await runCli(project, 'generate');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('[typescript_config]');
  });

  test('warnings use stderr and redact defaults values', async () => {
    const project = await createProject(`/** @typespun */
export interface AppConfig {
  /** @secret */
  token: string;
}
`);
    await writeFile(join(project, 'config.yaml'), 'token: never-print-this\n');

    const result = await runCli(project, 'generate');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('config.yaml:1:1');
    expect(result.stderr).toContain('secret_default');
    expect(result.stderr).toContain('path token');
    expect(result.stderr).not.toContain('never-print-this');
  });
});

describe('init', () => {
  test('creates the default interface project and performs first generation when dependencies resolve', async () => {
    const project = await createBareProject();
    await linkWorkspaceDependencies(project);

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      `/** @typespun */\nexport interface AppConfig {\n  port: number;\n}\n`,
    );
    const configText = await readFile(join(project, 'typespun.json'), 'utf8');
    expect(parseJsonWithComments(configText)).toEqual({
      input: 'src/config.ts',
      output: 'src/generated/typespun.ts',
    });
    expect(configText).toContain('// "envPrefix": "APP",');
    expect(configText).toContain('// "tsconfig": "tsconfig.json",');
    expect(configText).toContain('// "defaults": {');
    expect(configText).toContain('Allowed: "error", "warn", or "ignore".');
    expect(configText).toContain('// "secretDefaults": "warn"');
    expect(await readFile(join(project, 'config.yaml'), 'utf8')).toBe(
      'port: 3000\n',
    );
    expect(
      JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).scripts,
    ).toEqual({
      'config:check': 'typespun check',
      'config:generate': 'typespun generate',
    });
    expect(
      await readFile(join(project, 'src/generated/typespun.ts'), 'utf8'),
    ).toContain('export const loadConfig');

    const generatedBefore = await readFile(
      join(project, 'src/generated/typespun.ts'),
      'utf8',
    );
    expect((await runCli(project, 'init')).exitCode).toBe(0);
    expect(
      await readFile(join(project, 'src/generated/typespun.ts'), 'utf8'),
    ).toBe(generatedBefore);
  });

  test('preserves an existing conventional defaults file instead of creating config.yaml', async () => {
    const project = await createBareProject();
    await writeFile(join(project, 'config.yml'), 'port: 4000\n');
    await linkWorkspaceDependencies(project);

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(0);
    expect(await Bun.file(join(project, 'config.yaml')).exists()).toBe(false);
    expect(await readFile(join(project, 'config.yml'), 'utf8')).toBe(
      'port: 4000\n',
    );
  });

  test('supports class style and explicit paths without normalizing the requested prefix', async () => {
    const project = await createBareProject();

    const result = await runCli(
      project,
      'init',
      '--style',
      'class',
      '--input',
      'config/app.mts',
      '--output',
      'config/generated.mts',
      '--env-prefix',
      'APP_',
    );

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(project, 'config/app.mts'), 'utf8')).toContain(
      '@Config()\nexport class AppConfig',
    );
    expect(
      parseJsonWithComments(
        await readFile(join(project, 'typespun.json'), 'utf8'),
      ),
    ).toEqual({
      input: 'config/app.mts',
      output: 'config/generated.mts',
      envPrefix: 'APP_',
    });
  });

  test('preserves partial projects, existing scripts, and byte-identical reruns', async () => {
    const project = await createBareProject({
      scripts: { 'config:generate': 'custom-command', test: 'bun test' },
    });
    await mkdir(join(project, 'src'), { recursive: true });
    await writeFile(join(project, 'src/config.ts'), validInterface);

    expect((await runCli(project, 'init')).exitCode).toBe(0);
    const first = await Promise.all([
      readFile(join(project, 'src/config.ts'), 'utf8'),
      readFile(join(project, 'typespun.json'), 'utf8'),
      readFile(join(project, 'package.json'), 'utf8'),
    ]);
    expect((await runCli(project, 'init')).exitCode).toBe(0);
    const second = await Promise.all([
      readFile(join(project, 'src/config.ts'), 'utf8'),
      readFile(join(project, 'typespun.json'), 'utf8'),
      readFile(join(project, 'package.json'), 'utf8'),
    ]);

    expect(second).toEqual(first);
    expect(JSON.parse(second[2]!).scripts).toEqual({
      'config:generate': 'custom-command',
      test: 'bun test',
      'config:check': 'typespun check',
    });
  });

  test('refuses flags that conflict with an existing Typespun configuration', async () => {
    const project = await createProject(validInterface);
    await writeFile(
      join(project, 'typespun.json'),
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );
    const before = await readFile(join(project, 'typespun.json'), 'utf8');

    const result = await runCli(project, 'init', '--input', 'src/other.ts');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('conflicts');
    expect(await readFile(join(project, 'typespun.json'), 'utf8')).toBe(before);
  });

  test('rejects an unusable existing config before changing a partial project', async () => {
    const project = await createBareProject();
    await writeFile(
      join(project, 'typespun.json'),
      `${JSON.stringify({ unknown: true }, null, 2)}\n`,
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
    expect(await Bun.file(join(project, 'src/config.ts')).exists()).toBe(false);
  });

  test('refuses to adopt and overwrite an existing generated-output path', async () => {
    const project = await createBareProject();
    await mkdir(join(project, 'src/generated'), { recursive: true });
    const outputPath = join(project, 'src/generated/typespun.ts');
    await writeFile(outputPath, '// belongs to the application\n');
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect(await readFile(outputPath, 'utf8')).toBe(
      '// belongs to the application\n',
    );
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
    expect(await Bun.file(join(project, 'typespun.json')).exists()).toBe(false);
  });

  test('refuses an app-owned output even when typespun.json names it', async () => {
    const project = await createProject(validInterface);
    await mkdir(join(project, 'src/generated'), { recursive: true });
    const outputPath = join(project, 'src/generated/typespun.ts');
    await writeFile(outputPath, '// application module\n');
    await writeFile(
      join(project, 'typespun.json'),
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect(await readFile(outputPath, 'utf8')).toBe('// application module\n');
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
  });

  test('rejects an output path that aliases the schema through a symlink', async () => {
    const project = await createProject(validInterface);
    await mkdir(join(project, 'src/generated'), { recursive: true });
    await symlink(
      join(project, 'src/config.ts'),
      join(project, 'src/generated/typespun.ts'),
    );
    await writeFile(
      join(project, 'typespun.json'),
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('must differ');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      validInterface,
    );
  });

  test('rejects and preserves a dangling generated-output symlink before mutation', async () => {
    const project = await createBareProject();
    await mkdir(join(project, 'src/generated'), { recursive: true });
    const outputPath = join(project, 'src/generated/typespun.ts');
    await symlink('../missing-generated.ts', outputPath);
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect((await lstat(outputPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(outputPath)).toBe('../missing-generated.ts');
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
    expect(await Bun.file(join(project, 'typespun.json')).exists()).toBe(false);
    expect(await Bun.file(join(project, 'src/config.ts')).exists()).toBe(false);
  });

  test('persists missing config paths so explicit flags cannot be ignored', async () => {
    const project = await createBareProject();
    await writeFile(join(project, 'typespun.json'), '{}\n');

    const result = await runCli(
      project,
      'init',
      '--input',
      'settings/app.ts',
      '--output',
      'settings/generated.ts',
      '--env-prefix',
      'APP',
    );

    expect(result.exitCode).toBe(0);
    expect(
      JSON.parse(await readFile(join(project, 'typespun.json'), 'utf8')),
    ).toEqual({
      input: 'settings/app.ts',
      output: 'settings/generated.ts',
      envPrefix: 'APP',
    });
    expect(await Bun.file(join(project, 'settings/app.ts')).exists()).toBe(
      true,
    );
    expect(await Bun.file(join(project, 'src/config.ts')).exists()).toBe(false);
  });

  test('validates the configured tsconfig before creating or changing files', async () => {
    const project = await createBareProject();
    await mkdir(join(project, 'config'), { recursive: true });
    await writeFile(join(project, 'config/tsconfig.json'), '{ invalid');
    await writeFile(
      join(project, 'typespun.json'),
      `${JSON.stringify({ input: 'src/config.ts', tsconfig: 'config/tsconfig.json' }, null, 2)}\n`,
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('tsconfig.json');
    expect(await Bun.file(join(project, 'src/config.ts')).exists()).toBe(false);
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
  });

  test('finds import-only dependencies hoisted to an ancestor node_modules', async () => {
    const workspace = await makeDirectory();
    const project = join(workspace, 'packages/app');
    await mkdir(project, { recursive: true });
    await writeFixtureManifestAndTsconfig(project);
    await linkWorkspaceDependencies(workspace);

    const result = await runCli(project, 'init');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('Dependencies are missing');
    expect(
      await Bun.file(join(project, 'src/generated/typespun.ts')).exists(),
    ).toBe(true);
  });

  test('prints detected package-manager commands without executing an installer', async () => {
    const project = await createBareProject({ packageManager: 'pnpm@10.0.0' });
    const fakeBin = join(project, 'fake-bin');
    const invocationLog = join(project, 'invocations.txt');
    await mkdir(fakeBin);
    await writeFile(
      join(fakeBin, 'pnpm'),
      `#!/bin/sh\necho invoked >> '${invocationLog}'\nexit 99\n`,
    );
    await chmod(join(fakeBin, 'pnpm'), 0o755);

    const result = await runCliWithEnv(
      project,
      { ...Bun.env, PATH: fakeBin, NO_COLOR: '1' },
      'init',
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('pnpm add typespun');
    expect(result.stderr).toContain('pnpm add --save-dev typespun-codegen');
    expect(await Bun.file(invocationLog).exists()).toBe(false);
  });
});

const validInterface = `/** @typespun */
export interface AppConfig { port: number }
`;

async function createProject(schema: string): Promise<string> {
  const path = await createBareProject();
  await mkdir(join(path, 'src'), { recursive: true });
  await writeFile(join(path, 'src/config.ts'), schema);
  return path;
}

async function createBareProject(
  packageFields: Record<string, unknown> = {},
): Promise<string> {
  const path = await makeDirectory();
  await writeFixtureManifestAndTsconfig(path, packageFields);
  return path;
}

async function writeFixtureManifestAndTsconfig(
  path: string,
  packageFields: Record<string, unknown> = {},
): Promise<void> {
  await writeFile(
    join(path, 'package.json'),
    `${JSON.stringify({ name: 'fixture', private: true, type: 'module', ...packageFields }, null, 2)}\n`,
  );
  await writeFile(
    join(path, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['src/**/*.ts'] }, null, 2)}\n`,
  );
}

async function linkWorkspaceDependencies(project: string): Promise<void> {
  const repository = join(import.meta.dir, '..', '..', '..', '..');
  await mkdir(join(project, 'node_modules'), { recursive: true });
  await symlink(
    join(repository, 'packages/typespun'),
    join(project, 'node_modules/typespun'),
  );
  await symlink(
    join(repository, 'packages/codegen'),
    join(project, 'node_modules/typespun-codegen'),
  );
}

async function makeDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'typespun-cli-'));
  temporaryDirectories.push(path);
  return path;
}

async function runCli(
  cwd: string,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return runCliWithEnv(cwd, { ...Bun.env, NO_COLOR: '1' }, ...args);
}

async function runCliWithEnv(
  cwd: string,
  env: Record<string, string | undefined>,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const child = Bun.spawn([process.execPath, binPath, ...args], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function parseJsonWithComments(text: string): unknown {
  const parsed = ts.parseConfigFileTextToJson('typespun.json', text);
  if (parsed.error !== undefined) throw new Error('invalid test JSON');
  return parsed.config;
}
