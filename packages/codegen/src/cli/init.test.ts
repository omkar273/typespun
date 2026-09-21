import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import {
  captureStreams,
  createBareProject,
  createProject,
  linkWorkspaceDependencies,
  makeDirectory,
  removeTemporaryDirectories,
  validInterface,
  writeProjectFile,
} from '../testing/project-fixture.js';
import { runCli } from './main.js';

const interfaceTemplate =
  '/** @typespun */\nexport interface AppConfig {\n  port: number;\n}\n';

let previousCi: string | undefined;

beforeEach(() => {
  previousCi = process.env.CI;
  // Pin the prompt decision: init consults stdin.isTTY and CI, and a prompt in
  // a test process would block forever.
  process.env.CI = 'true';
});

afterEach(async () => {
  if (previousCi === undefined) delete process.env.CI;
  else process.env.CI = previousCi;
  await removeTemporaryDirectories();
});

async function init(
  cwd: string,
  ...args: readonly string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const captured = captureStreams();
  const exitCode = await runCli(['init', ...args], captured.streams, cwd);
  return { exitCode, stdout: captured.stdout(), stderr: captured.stderr() };
}

function parseJsonWithComments(text: string): unknown {
  const parsed = ts.parseConfigFileTextToJson('typespun.json', text);
  if (parsed.error !== undefined) throw new Error('invalid test JSON');
  return parsed.config;
}

describe('init scaffolding', () => {
  test('creates a full interface project and generates once dependencies resolve', async () => {
    const project = await createBareProject();
    await linkWorkspaceDependencies(project);

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      interfaceTemplate,
    );
    const configText = await readFile(join(project, 'typespun.json'), 'utf8');
    expect(parseJsonWithComments(configText)).toEqual({
      input: 'src/config.ts',
      output: 'src/generated/typespun.ts',
    });
    expect(configText).toContain('// "envPrefix": "APP",');
    expect(configText).toContain('// "tsconfig": "tsconfig.json",');
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
  });

  test('is idempotent: a rerun leaves every file byte-identical', async () => {
    const project = await createBareProject();
    await linkWorkspaceDependencies(project);
    expect((await init(project)).exitCode).toBe(0);
    const paths = [
      'src/config.ts',
      'typespun.json',
      'package.json',
      'config.yaml',
      'src/generated/typespun.ts',
    ];
    const before = await Promise.all(
      paths.map((path) => readFile(join(project, path), 'utf8')),
    );

    expect((await init(project)).exitCode).toBe(0);

    expect(
      await Promise.all(
        paths.map((path) => readFile(join(project, path), 'utf8')),
      ),
    ).toEqual(before);
  });

  test('keeps an existing conventional defaults file instead of creating config.yaml', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'config.yml', 'port: 4000\n');
    await linkWorkspaceDependencies(project);

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project, 'config.yaml'))).toBe(false);
    expect(await readFile(join(project, 'config.yml'), 'utf8')).toBe(
      'port: 4000\n',
    );
    const configText = await readFile(join(project, 'typespun.json'), 'utf8');
    expect(configText).toContain(
      'Optional defaults override. config.yml is discovered automatically.',
    );
    expect(configText).toContain('//   "path": "config.yml",');
  });

  test('supports class style and explicit paths without normalising the prefix', async () => {
    const project = await createBareProject();

    const result = await init(
      project,
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

  test('completes a partial project without clobbering existing scripts', async () => {
    const project = await createBareProject({
      scripts: { 'config:generate': 'custom-command', test: 'vitest run' },
    });
    await writeProjectFile(project, 'src/config.ts', validInterface);

    expect((await init(project)).exitCode).toBe(0);

    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      validInterface,
    );
    expect(
      JSON.parse(await readFile(join(project, 'package.json'), 'utf8')).scripts,
    ).toEqual({
      'config:generate': 'custom-command',
      test: 'vitest run',
      'config:check': 'typespun check',
    });
  });

  test('persists missing config paths so explicit flags cannot be ignored', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'typespun.json', '{}\n');

    const result = await init(
      project,
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
    expect(existsSync(join(project, 'settings/app.ts'))).toBe(true);
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('reuses the prefix already recorded in typespun.json', async () => {
    const project = await createBareProject();
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', envPrefix: 'EXISTING' }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(
      JSON.parse(await readFile(join(project, 'typespun.json'), 'utf8')),
    ).toMatchObject({ envPrefix: 'EXISTING' });
  });

  test('adopts an output file that Typespun itself generated', async () => {
    const project = await createBareProject();
    await linkWorkspaceDependencies(project);
    expect((await init(project)).exitCode).toBe(0);
    const generated = await readFile(
      join(project, 'src/generated/typespun.ts'),
      'utf8',
    );
    await rm(join(project, 'typespun.json'));

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(
      await readFile(join(project, 'src/generated/typespun.ts'), 'utf8'),
    ).toBe(generated);
  });

  test('finds dependencies hoisted to an ancestor node_modules', async () => {
    const workspace = await makeDirectory();
    const project = join(workspace, 'packages/app');
    await mkdir(project, { recursive: true });
    await writeProjectFile(
      project,
      'package.json',
      `${JSON.stringify({ name: 'fixture', private: true, type: 'module' }, null, 2)}\n`,
    );
    await writeProjectFile(
      project,
      'tsconfig.json',
      `${JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['src/**/*.ts'] }, null, 2)}\n`,
    );
    await linkWorkspaceDependencies(workspace);

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('Dependencies are missing');
    expect(existsSync(join(project, 'src/generated/typespun.ts'))).toBe(true);
  });

  test('scaffolds without prompting when stdin is not a terminal', async () => {
    const project = await createBareProject();
    delete process.env.CI;

    // --style and --env-prefix mean no prompt is needed even if the process
    // were attached to a terminal.
    const result = await init(
      project,
      '--style',
      'interface',
      '--env-prefix',
      'APP',
    );

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project, 'src/config.ts'))).toBe(true);
  });
});

describe('init refusals leave the project untouched', () => {
  test('rejects flags that conflict with an existing configuration', async () => {
    const project = await createProject(validInterface);
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );
    const before = await readFile(join(project, 'typespun.json'), 'utf8');

    const result = await init(project, '--input', 'src/other.ts');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('conflicts');
    expect(await readFile(join(project, 'typespun.json'), 'utf8')).toBe(before);
  });

  test('rejects an unusable existing config before changing anything', async () => {
    const project = await createBareProject();
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ unknown: true }, null, 2)}\n`,
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unknown typespun.json key: unknown');
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('refuses to overwrite an application-owned output path', async () => {
    const project = await createBareProject();
    const outputPath = join(project, 'src/generated/typespun.ts');
    await writeProjectFile(
      project,
      'src/generated/typespun.ts',
      '// belongs to the application\n',
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect(await readFile(outputPath, 'utf8')).toBe(
      '// belongs to the application\n',
    );
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
    expect(existsSync(join(project, 'typespun.json'))).toBe(false);
  });

  test('refuses an app-owned output even when typespun.json names it', async () => {
    const project = await createProject(validInterface);
    const outputPath = join(project, 'src/generated/typespun.ts');
    await writeProjectFile(
      project,
      'src/generated/typespun.ts',
      '// application module\n',
    );
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect(await readFile(outputPath, 'utf8')).toBe('// application module\n');
  });

  test('rejects an output that aliases the schema through a symlink', async () => {
    const project = await createProject(validInterface);
    await mkdir(join(project, 'src/generated'), { recursive: true });
    await symlink(
      join(project, 'src/config.ts'),
      join(project, 'src/generated/typespun.ts'),
    );
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/generated/typespun.ts' }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('must differ');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      validInterface,
    );
  });

  test('preserves a dangling generated-output symlink', async () => {
    const project = await createBareProject();
    await mkdir(join(project, 'src/generated'), { recursive: true });
    const outputPath = join(project, 'src/generated/typespun.ts');
    await symlink('../missing-generated.ts', outputPath);

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('refuses to overwrite');
    expect((await lstat(outputPath)).isSymbolicLink()).toBe(true);
    expect(await readlink(outputPath)).toBe('../missing-generated.ts');
    expect(existsSync(join(project, 'typespun.json'))).toBe(false);
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('rejects a dangling typespun.json symlink before scaffolding', async () => {
    const project = await createBareProject();
    const configPath = join(project, 'typespun.json');
    await symlink('missing-typespun.json', configPath);

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('symbolic link');
    expect((await lstat(configPath)).isSymbolicLink()).toBe(true);
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
    expect(existsSync(join(project, 'config.yaml'))).toBe(false);
  });

  test('rejects a symlinked package.json without changing its target', async () => {
    const project = await createBareProject();
    const targetDirectory = await makeDirectory();
    const target = join(targetDirectory, 'shared-package.json');
    const contents = '{"name":"shared"}\n';
    await writeFile(target, contents);
    await rm(join(project, 'package.json'));
    await symlink(target, join(project, 'package.json'));

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('symbolic link');
    expect(await readFile(target, 'utf8')).toBe(contents);
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('rejects when the schema and generated output are the same path', async () => {
    const project = await createProject(validInterface);
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', output: 'src/config.ts' }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('must differ');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      validInterface,
    );
  });

  test('rejects a requested style that contradicts the existing schema', async () => {
    const project = await createProject(validInterface);

    const result = await init(project, '--style', 'class');

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--style class conflicts');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      validInterface,
    );
  });

  test('requires an explicit input when several conventional schemas exist', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'src/config.ts', validInterface);
    await writeProjectFile(project, 'src/config.mts', validInterface);

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('use --input');
  });

  test('rejects ambiguous conventional defaults files', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'config.yaml', 'port: 1\n');
    await writeProjectFile(project, 'config.json', '{"port":1}\n');

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Multiple conventional defaults files');
  });

  test('refuses to overwrite an existing entry at config.yaml', async () => {
    const project = await createBareProject();
    await mkdir(join(project, 'config.yaml'));

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      'refuses to overwrite the existing entry at config.yaml',
    );
  });

  test('validates the configured tsconfig before creating or changing files', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'config/tsconfig.json', '{ invalid');
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', tsconfig: 'config/tsconfig.json' }, null, 2)}\n`,
    );
    const packageBefore = await readFile(join(project, 'package.json'), 'utf8');

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('tsconfig.json');
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
    expect(await readFile(join(project, 'package.json'), 'utf8')).toBe(
      packageBefore,
    );
  });

  test('rejects a tsconfig that parses but carries unusable options', async () => {
    const project = await createBareProject();
    await writeProjectFile(
      project,
      'tsconfig.json',
      `${JSON.stringify({ compilerOptions: { target: 'NOT_A_TARGET' } }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      'tsconfig.json must contain usable TypeScript configuration',
    );
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('rejects ambiguous defaults discovery reached through a pathless defaults block', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'config.yaml', 'port: 1\n');
    await writeProjectFile(project, 'config.json', '{"port":1}\n');
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', defaults: { unknownKeys: 'warn' } }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Multiple conventional defaults files');
    expect(existsSync(join(project, 'src/config.ts'))).toBe(false);
  });

  test('reports a working directory that is not a directory', async () => {
    const directory = await makeDirectory();
    const notADirectory = join(directory, 'file.txt');
    await writeFile(notADirectory, 'not a project\n');

    const result = await init(notADirectory);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Could not inspect package.json');
  });

  test('requires a tsconfig somewhere above the schema input', async () => {
    const project = await createBareProject();
    await rm(join(project, 'tsconfig.json'));

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Could not find tsconfig.json');
  });
});

describe('init manifest validation', () => {
  test.each([
    ['missing package.json', undefined, 'package.json is required'],
    ['invalid JSON', '{ nope', 'package.json must contain valid JSON'],
    ['a non-object document', '[]\n', 'package.json must contain an object'],
    [
      'non-object scripts',
      '{"scripts":"nope"}\n',
      'package.json scripts must contain an object',
    ],
  ])('rejects %s', async (_name, contents, message) => {
    const project = await createBareProject();
    if (contents === undefined) await rm(join(project, 'package.json'));
    else await writeProjectFile(project, 'package.json', contents);

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
  });

  test.each([
    ['{ nope', 'typespun.json must contain valid JSON with comments'],
    // TypeScript's config parser rejects every non-object document, so a JSON
    // array never reaches the later "must contain an object" guard.
    ['[]\n', 'typespun.json must contain valid JSON with comments'],
    ['{"input":5}\n', 'typespun.json input must be a string'],
    ['{"defaults":5}\n', 'typespun.json defaults must be a string or object'],
    ['{"defaults":{"nope":1}}\n', 'Unknown typespun.json defaults key: nope'],
    [
      '{"defaults":{"path":5}}\n',
      'typespun.json defaults.path must be a string',
    ],
    [
      '{"defaults":{"unknownKeys":"nope"}}\n',
      'typespun.json defaults.unknownKeys must be error, warn, or ignore',
    ],
    [
      '{"secretDefaults":"nope"}\n',
      'typespun.json secretDefaults must be warn, allow, or error',
    ],
  ])('rejects typespun.json %j', async (contents, message) => {
    const project = await createBareProject();
    await writeProjectFile(project, 'typespun.json', contents);

    const result = await init(project);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message);
  });

  test('accepts a defaults path given as a bare string', async () => {
    const project = await createBareProject();
    await writeProjectFile(project, 'defaults/values.yaml', 'port: 1\n');
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', defaults: 'defaults/values.yaml' }, null, 2)}\n`,
    );

    const result = await init(project);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(project, 'config.yaml'))).toBe(false);
  });
});

describe('init dependency guidance', () => {
  test.each([
    ['bun', { packageManager: 'bun@1.4.1' }, [], 'bun add typespun'],
    ['npm', { packageManager: 'npm@10.0.0' }, [], 'npm install typespun'],
    ['yarn', { packageManager: 'yarn@4.0.0' }, [], 'yarn add typespun'],
    ['pnpm', { packageManager: 'pnpm@10.0.0' }, [], 'pnpm add typespun'],
    ['a bun lockfile', {}, ['bun.lock'], 'bun add typespun'],
    ['a legacy bun lockfile', {}, ['bun.lockb'], 'bun add typespun'],
    ['a pnpm lockfile', {}, ['pnpm-lock.yaml'], 'pnpm add typespun'],
    ['a yarn lockfile', {}, ['yarn.lock'], 'yarn add typespun'],
    ['no signal at all', {}, [], 'npm install typespun'],
  ])(
    'reports install commands for %s',
    async (
      _name,
      packageFields: Record<string, unknown>,
      lockfiles: string[],
      expected: string,
    ) => {
      const project = await createBareProject(packageFields);
      for (const lockfile of lockfiles) {
        await writeProjectFile(project, lockfile, '');
      }

      const result = await init(project);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('Dependencies are missing');
      expect(result.stderr).toContain(expected);
      expect(existsSync(join(project, 'src/generated/typespun.ts'))).toBe(
        false,
      );
    },
  );

  test.each([
    ['bun@1.4.1', 'bun add --dev typespun-codegen'],
    ['npm@10.0.0', 'npm install --save-dev typespun-codegen'],
    ['yarn@4.0.0', 'yarn add --dev typespun-codegen'],
    ['pnpm@10.0.0', 'pnpm add --save-dev typespun-codegen'],
  ])(
    'uses the %s development flag for the code generator',
    async (packageManager, expected) => {
      const project = await createBareProject({ packageManager });

      const result = await init(project);

      expect(result.stderr).toContain(expected);
    },
  );
});
