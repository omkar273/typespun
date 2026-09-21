import { afterEach, describe, expect, test } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  atomicWrite,
  createGenerationFingerprint,
  generateProject,
} from './generate.js';

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
  test('package metadata version changes the generated schema fingerprint', () => {
    const directory = mkdtempSync(join(tmpdir(), 'typespun-version-'));
    temporaryDirectories.push(directory);
    const firstManifest = join(directory, 'first.json');
    const secondManifest = join(directory, 'second.json');
    writeFileSync(firstManifest, '{"version":"1.2.3"}');
    writeFileSync(secondManifest, '{"version":"1.2.4"}');
    const inputs = {
      protocolVersion: 1,
      configuration: { input: 'src/config.ts' },
      analysis: { fields: [] },
      compiledDefaults: {},
    };

    expect(
      createGenerationFingerprint(inputs, pathToFileURL(firstManifest)),
    ).not.toBe(
      createGenerationFingerprint(inputs, pathToFileURL(secondManifest)),
    );
  });

  test('writes once and leaves unchanged output modification time intact', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'src/generated/typespun.ts');

    const first = await generateProject({ projectDirectory, mode: 'write' });
    const firstContents = readFileSync(outputPath, 'utf8');
    const firstMtime = statSync(outputPath).mtimeMs;
    await sleep(20);
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
    expect(temporaryArtifacts(dirname(outputPath))).toEqual([]);
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

  test('uses a bounded temporary basename for a long valid output filename', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, `${'a'.repeat(220)}.ts`);

    await atomicWrite(outputPath, 'generated contents');

    expect(readFileSync(outputPath, 'utf8')).toBe('generated contents');
    expect(temporaryArtifacts(projectDirectory)).toEqual([]);
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

/** Sibling temp files the atomic write must never leave behind. */
function temporaryArtifacts(directory: string): string[] {
  return readdirSync(directory).filter(
    (entry) => entry.startsWith('.typespun.') && entry.endsWith('.tmp'),
  );
}

describe('generation failure paths', () => {
  test.each([
    ['no version field', '{}'],
    ['an empty version', '{"version":""}'],
    ['a non-string version', '{"version":1}'],
    ['a non-object manifest', '[]'],
  ])('refuses to fingerprint a manifest with %s', (_name, manifest) => {
    const directory = mkdtempSync(join(tmpdir(), 'typespun-manifest-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'package.json');
    writeFileSync(path, manifest);

    expect(() =>
      createGenerationFingerprint(
        {
          protocolVersion: 1,
          configuration: {},
          analysis: {},
          compiledDefaults: {},
        },
        pathToFileURL(path),
      ),
    ).toThrow('typespun-codegen package version is missing');
  });

  test('reports a tsconfig that parses but carries unusable options', async () => {
    const projectDirectory = createProject();
    write(
      projectDirectory,
      'tsconfig.json',
      JSON.stringify({ compilerOptions: { target: 'NOT_A_TARGET' } }),
    );

    const result = await generateProject({ projectDirectory, mode: 'write' });

    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'typescript_config',
    ]);
  });

  test('gives up after exhausting every temporary name', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'generated.ts');
    const collisionPath = join(projectDirectory, '.typespun.always.tmp');
    writeFileSync(collisionPath, 'belongs to another process');

    await expect(
      atomicWrite(outputPath, 'contents', () => collisionPath),
    ).rejects.toThrow('Could not reserve a temporary generated-output file.');

    expect(readFileSync(collisionPath, 'utf8')).toBe(
      'belongs to another process',
    );
    expect(() => statSync(outputPath)).toThrow();
  });

  test('propagates a temporary-file error that is not a name collision', async () => {
    const projectDirectory = createProject();
    const outputPath = join(projectDirectory, 'generated.ts');

    await expect(
      atomicWrite(outputPath, 'contents', () =>
        join(projectDirectory, 'missing-directory', 'scratch.tmp'),
      ),
    ).rejects.toThrow(/ENOENT/);

    expect(() => statSync(outputPath)).toThrow();
  });
});
