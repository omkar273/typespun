import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  captureStreams,
  createBareProject,
  createProject,
  linkWorkspaceDependencies,
  makeDirectory,
  removeTemporaryDirectories,
  writeProjectFile,
} from '../testing/project-fixture.js';
import { runCli } from './main.js';

let previousNoColor: string | undefined;

beforeEach(() => {
  previousNoColor = process.env.NO_COLOR;
  // Colour depends on ambient NO_COLOR; pin it so a developer's shell cannot
  // decide these assertions.
  delete process.env.NO_COLOR;
});

afterEach(async () => {
  if (previousNoColor === undefined) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = previousNoColor;
  await removeTemporaryDirectories();
});

async function invoke(
  cwd: string,
  args: readonly string[],
  isTTY = false,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const captured = captureStreams(isTTY);
  const exitCode = await runCli(args, captured.streams, cwd);
  return { exitCode, stdout: captured.stdout(), stderr: captured.stderr() };
}

describe('runCli usage', () => {
  test.each([
    [[]],
    [['--help']],
    [['-h']],
    [['generate', '--help']],
    [['init', '-h']],
  ])('prints help and exits zero for %j', async (args: string[]) => {
    const result = await invoke(process.cwd(), args);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: typespun');
    expect(result.stderr).toBe('');
  });

  test('rejects an unknown command with usage guidance', async () => {
    const result = await invoke(process.cwd(), ['wat']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Unknown command: wat');
    expect(result.stderr).toContain('Run typespun --help for usage.');
  });

  test.each([
    [['generate', '--bogus'], 'Unknown option: --bogus'],
    [['generate', '--config'], '--config requires a value'],
    [['generate', '--config', '--other'], '--config requires a value'],
    [
      ['generate', '--config', 'a.json', '--config', 'b.json'],
      '--config may be specified only once',
    ],
  ])('rejects malformed generate options %j', async (args, message) => {
    const result = await invoke(process.cwd(), args as string[]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message as string);
  });

  test.each([
    [['init', '--style', 'nope'], '--style must be interface or class'],
    [
      ['init', '--style', 'class', '--style', 'interface'],
      '--style may be specified only once',
    ],
    [
      ['init', '--input', 'a.ts', '--input', 'b.ts'],
      '--input may be specified only once',
    ],
    [
      ['init', '--output', 'a.ts', '--output', 'b.ts'],
      '--output may be specified only once',
    ],
    [
      ['init', '--env-prefix', 'A', '--env-prefix', 'B'],
      '--env-prefix may be specified only once',
    ],
    [['init', '--nope'], 'Unknown option: --nope'],
  ])('rejects malformed init options %j', async (args, message) => {
    const result = await invoke(process.cwd(), args as string[]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(message as string);
  });
});

describe('runCli generate and check', () => {
  test('generates, reports an unchanged rerun, and confirms the check', async () => {
    const project = await createProject();

    const generated = await invoke(project, ['generate']);
    expect(generated.exitCode).toBe(0);
    expect(generated.stdout).toBe('Generated src/generated/typespun.ts.\n');

    const regenerated = await invoke(project, ['generate']);
    expect(regenerated.exitCode).toBe(0);
    expect(regenerated.stdout).toBe('Unchanged src/generated/typespun.ts.\n');

    const checked = await invoke(project, ['check']);
    expect(checked.exitCode).toBe(0);
    expect(checked.stdout).toBe('src/generated/typespun.ts is up to date.\n');
  });

  test('reports stale output on stderr without rewriting it', async () => {
    const project = await createProject();
    const output = join(project, 'src/generated/typespun.ts');
    expect((await invoke(project, ['generate'])).exitCode).toBe(0);
    await writeFile(output, '// stale\n');

    const result = await invoke(project, ['check']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('is stale; run typespun generate.');
    expect(await readFile(output, 'utf8')).toBe('// stale\n');
  });

  test('exits one and reports the location for an unusable schema', async () => {
    const project = await createProject(`/** @typespun */
export interface AppConfig { createdAt: Date }
`);

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/src\/generated|src\/config\.ts:\d+:\d+/);
    expect(result.stderr).toContain('[unsupported_type]');
    expect(result.stdout).toBe('');
  });

  test('exits two when the TypeScript project cannot be loaded', async () => {
    const project = await createProject();
    await writeProjectFile(project, 'tsconfig.json', '{ nope');

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('[typescript_config]');
  });

  test('exits two when no schema input can be discovered', async () => {
    const project = await createBareProject();

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Run typespun --help for usage.');
  });

  test('routes warnings to stderr and keeps stdout to the success line', async () => {
    const project = await createProject(`/** @typespun */
export interface AppConfig {
  /** @secret */
  token: string;
}
`);
    await writeProjectFile(project, 'config.yaml', 'token: s3cret\n');

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[secret_default]');
    expect(result.stderr).not.toContain('s3cret');
    expect(result.stdout).toBe('Generated src/generated/typespun.ts.\n');
  });

  test('honours an explicit --config path', async () => {
    const project = await createProject();
    await writeProjectFile(
      project,
      'custom/typespun.json',
      `${JSON.stringify({ input: '../src/config.ts', output: '../src/generated/typespun.ts' }, null, 2)}\n`,
    );

    const result = await invoke(project, [
      'generate',
      '--config',
      'custom/typespun.json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('src/generated/typespun.ts.');
  });

  test('exits one when the generated output path is an unreadable entry', async () => {
    const project = await createProject();
    // A directory where the generated file belongs: reading it fails with a
    // code the generator deliberately does not swallow.
    await mkdir(join(project, 'src/generated/typespun.ts'), {
      recursive: true,
    });

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('typespun:');
    expect(result.stderr).not.toContain('Run typespun --help for usage.');
  });

  test('prints an absolute output path when it sits outside the working directory', async () => {
    const project = await createProject();
    const elsewhere = await makeDirectory('typespun-outside-');
    const output = join(elsewhere, 'generated.ts');
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts', output }, null, 2)}\n`,
    );

    const result = await invoke(project, ['generate']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`Generated ${output}.\n`);
  });
});

describe('runCli diagnostic colour', () => {
  const brokenSchema = `/** @typespun */
export interface AppConfig { createdAt: Date }
`;

  test('colours diagnostic codes on a TTY', async () => {
    const project = await createProject(brokenSchema);

    const result = await invoke(project, ['generate'], true);

    expect(result.stderr).toContain('[36m[unsupported_type][0m');
  });

  test('suppresses colour when NO_COLOR is set even on a TTY', async () => {
    const project = await createProject(brokenSchema);
    process.env.NO_COLOR = '1';

    const result = await invoke(project, ['generate'], true);

    expect(result.stderr).toContain('[unsupported_type]');
    expect(result.stderr).not.toContain('[');
  });

  test('suppresses colour when stderr is not a TTY', async () => {
    const project = await createProject(brokenSchema);

    const result = await invoke(project, ['generate'], false);

    expect(result.stderr).not.toContain('[');
  });
});

describe('runCli init wiring', () => {
  test('accepts the interactive toggles and reports created files on stdout', async () => {
    const project = await createBareProject();

    const result = await invoke(project, ['init', '--no-interactive']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created src/config.ts.');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toBe(
      '/** @typespun */\nexport interface AppConfig {\n  port: number;\n}\n',
    );
  });

  test('accepts --interactive when every prompted value is supplied', async () => {
    const project = await createBareProject();

    const result = await invoke(project, [
      'init',
      '--interactive',
      '--style',
      'interface',
      '--env-prefix',
      'APP',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created src/config.ts.');
    expect(await readFile(join(project, 'typespun.json'), 'utf8')).toContain(
      '"envPrefix": "APP"',
    );
  });

  test('reports diagnostics from the generation that init performs', async () => {
    const project = await createProject(`/** @typespun */
export interface AppConfig { createdAt: Date }
`);
    await linkWorkspaceDependencies(project);

    const result = await invoke(project, ['init', '--no-interactive']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('[unsupported_type]');
  });

  test('surfaces init failures as exit code two with usage guidance', async () => {
    const project = await createBareProject();

    const result = await invoke(project, ['init', '--input', 'src/config.txt']);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      '--input must use a .ts, .mts, or .cts extension',
    );
  });
});
