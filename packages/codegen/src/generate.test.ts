import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { atomicWrite, generateProject } from './generate.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createProject(schema = validSchema): string {
  const directory = mkdtempSync(join(tmpdir(), 'typespun-generate-'));
  temporaryDirectories.push(directory);
  write(directory, 'package.json', '{"type":"module"}');
  write(
    directory,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
      },
      include: ['src/**/*.ts'],
    }),
  );
  write(directory, 'src/config.ts', schema);
  return directory;
}

function write(
  directory: string,
  relativePath: string,
  contents: string,
): void {
  const path = join(directory, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

const validSchema = `/** @typespun */
export interface AppConfig {
  /** @default 3000 */
  port: number;
  enabled?: boolean;
}
`;

describe('project generation', () => {
  test('writes once and leaves unchanged output modification time intact', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');

    const first = await generateProject({ projectDirectory, mode: 'write' });
    const firstContents = readFileSync(outputPath, 'utf8');
    const firstMtime = statSync(outputPath).mtimeMs;
    await Bun.sleep(20);
    const second = await generateProject({ projectDirectory, mode: 'write' });

    expect(first.status).toBe('written');
    expect(first.diagnostics).toEqual([]);
    expect(second.status).toBe('unchanged');
    expect(readFileSync(outputPath, 'utf8')).toBe(firstContents);
    expect(statSync(outputPath).mtimeMs).toBe(firstMtime);
    expect(firstContents).toContain(
      "import type { AppConfig as TypespunConfig } from '../config.js';",
    );
    expect(firstContents).toContain('"port": 3000');
  });

  test('check reports modified output as stale without restoring it', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');
    await generateProject({ projectDirectory, mode: 'write' });
    writeFileSync(outputPath, '// locally modified\n');

    const result = await generateProject({ projectDirectory, mode: 'check' });

    expect(result.status).toBe('stale');
    expect(readFileSync(outputPath, 'utf8')).toBe('// locally modified\n');
  });

  test('check reports missing output as stale without creating directories', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');

    const result = await generateProject({ projectDirectory, mode: 'check' });

    expect(result.status).toBe('stale');
    expect(() => statSync(outputPath)).toThrow();
    expect(() => statSync(dirname(outputPath))).toThrow();
  });

  test('analyzer errors preserve prior output bytes and do not leave a sibling temp', async () => {
    const projectDirectory = createProject(
      'export interface AppConfig { port: number }',
    );
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');
    write(projectDirectory, 'src/generated/typespun.ts', '// prior output\n');

    const result = await generateProject({ projectDirectory, mode: 'write' });

    expect(result.status).toBe('unchanged');
    expect(result.diagnostics.map(({ code }) => code)).toContain('root_count');
    expect(readFileSync(outputPath, 'utf8')).toBe('// prior output\n');
    expect(
      Array.from(new Bun.Glob('.typespun.*.tmp').scanSync(dirname(outputPath))),
    ).toEqual([]);
  });

  test('defaults errors preserve output and secret diagnostics never include values', async () => {
    const projectDirectory = createProject(`/** @typespun */
export interface AppConfig {
  /** @secret */ token: string;
}
`);
    write(
      projectDirectory,
      'typespun.json',
      JSON.stringify({
        defaults: 'config.yaml',
        secretDefaults: 'error',
      }),
    );
    write(projectDirectory, 'config.yaml', 'token: super-secret-value\n');
    write(projectDirectory, 'src/generated/typespun.ts', '// prior output\n');

    const result = await generateProject({ projectDirectory, mode: 'write' });

    expect(result.status).toBe('unchanged');
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      'secret_default',
    );
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
    expect(
      readFileSync(join(projectDirectory, 'src/generated/typespun.ts'), 'utf8'),
    ).toBe('// prior output\n');
  });

  test('reports a configured defaults file that cannot be read without touching output', async () => {
    const projectDirectory = createProject();
    write(
      projectDirectory,
      'typespun.json',
      JSON.stringify({ defaults: 'missing.yaml' }),
    );
    write(projectDirectory, 'src/generated/typespun.ts', '// prior output\n');

    const result = await generateProject({ projectDirectory, mode: 'write' });

    expect(result.status).toBe('unchanged');
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'defaults_read_failed',
    ]);
    expect(
      readFileSync(join(projectDirectory, 'src/generated/typespun.ts'), 'utf8'),
    ).toBe('// prior output\n');
  });

  test('rejects output paths that alias the input through a symlinked parent', async () => {
    const projectDirectory = createProject();
    symlinkSync(
      join(projectDirectory, 'src'),
      join(projectDirectory, 'source-alias'),
      'dir',
    );
    write(
      projectDirectory,
      'typespun.json',
      JSON.stringify({ output: 'source-alias/config.ts' }),
    );
    const inputPath = join(projectDirectory, 'src/config.ts');
    const original = readFileSync(inputPath, 'utf8');

    const result = await generateProject({ projectDirectory, mode: 'write' });

    expect(result.status).toBe('unchanged');
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'overlapping_paths',
    ]);
    expect(readFileSync(inputPath, 'utf8')).toBe(original);
    expect(JSON.stringify(result.diagnostics)).not.toContain(inputPath);
  });

  test('preserves a pre-existing temp-name collision and retries another sibling', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'generated.ts');
    const collisionPath = join(projectDirectory, '.typespun.collision.tmp');
    const retryPath = join(projectDirectory, '.typespun.retry.tmp');
    writeFileSync(collisionPath, 'belongs to another process');

    await atomicWrite(outputPath, 'generated contents', (attempt) =>
      attempt === 0 ? collisionPath : retryPath,
    );

    expect(readFileSync(outputPath, 'utf8')).toBe('generated contents');
    expect(readFileSync(collisionPath, 'utf8')).toBe(
      'belongs to another process',
    );
    expect(() => statSync(retryPath)).toThrow();
  });

  test('keeps fingerprints stable for one explicit config across invocation directories', async () => {
    const projectDirectory = createProject();
    const configPath = join(projectDirectory, 'settings/typespun.custom.json');
    write(
      projectDirectory,
      'settings/typespun.custom.json',
      JSON.stringify({
        input: '../src/config.ts',
        output: '../src/generated/typespun.ts',
        tsconfig: '../tsconfig.json',
      }),
    );
    const firstInvocation = join(projectDirectory, 'first');
    const secondInvocation = join(projectDirectory, 'second/nested');
    mkdirSync(firstInvocation, { recursive: true });
    mkdirSync(secondInvocation, { recursive: true });

    await generateProject({
      projectDirectory: firstInvocation,
      configPath,
      mode: 'write',
    });
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');
    const firstOutput = readFileSync(outputPath, 'utf8');
    rmSync(outputPath);
    await generateProject({
      projectDirectory: secondInvocation,
      configPath,
      mode: 'write',
    });

    expect(readFileSync(outputPath, 'utf8')).toBe(firstOutput);
  });
});
