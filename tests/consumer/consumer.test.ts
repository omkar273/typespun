import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  packArtifacts,
  removePackedArtifacts,
  run,
  type PackedArtifacts,
} from '../package/pack.js';

let artifacts: PackedArtifacts | undefined;
let consumerDirectory: string | undefined;

beforeAll(async () => {
  artifacts = await packArtifacts();
  consumerDirectory = await mkdtemp(join(tmpdir(), 'typespun-consumer-'));
  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          typespun: `file:${artifacts.runtime}`,
          'typespun-codegen': `file:${artifacts.codegen}`,
        },
        overrides: {
          typespun: `file:${artifacts.runtime}`,
        },
      },
      null,
      2,
    )}\n`,
  );
  run(['bun', 'install', '--ignore-scripts'], consumerDirectory);
});

afterAll(async () => {
  await Promise.all([
    removePackedArtifacts(artifacts),
    consumerDirectory === undefined
      ? Promise.resolve()
      : rm(consumerDirectory, { recursive: true, force: true }),
  ]);
});

describe('packed consumer', () => {
  test('ES modules load the runtime, generated ABI, and codegen entry', async () => {
    await writeFixture(
      'esm.mjs',
      `import { ConfigError } from 'typespun';
import { createLoader } from 'typespun/generated';
import * as codegen from 'typespun-codegen';
const load = createLoader({ protocolVersion: 1, fields: [{ propertyPath: ['name'], defaultsPath: ['name'], envName: 'NAME', kind: { type: 'string' }, required: true, secret: false, hasDefault: false, optionalParents: [] }] });
console.log(JSON.stringify({ name: load({ source: { NAME: 'Ada' } }).name, error: new ConfigError([]).name, codegen: typeof codegen }));
`,
    );

    expect(run(['node', 'esm.mjs'], consumerDirectory)).toBe(
      '{"name":"Ada","error":"ConfigError","codegen":"object"}\n',
    );
  });

  test('CommonJS loads both public runtime entry points', async () => {
    await writeFixture(
      'commonjs.cjs',
      `const { ConfigError } = require('typespun');
const { createLoader } = require('typespun/generated');
const load = createLoader({ protocolVersion: 1, fields: [{ propertyPath: ['port'], defaultsPath: ['port'], envName: 'PORT', kind: { type: 'number' }, required: true, secret: false, hasDefault: false, optionalParents: [] }] });
let sharedErrorIdentity = false;
try {
  load({ source: { PORT: 'invalid' } });
} catch (error) {
  sharedErrorIdentity = error instanceof ConfigError;
}
console.log(JSON.stringify({ port: load({ source: { PORT: '4100' } }).port, error: new ConfigError([]).name, sharedErrorIdentity }));
`,
    );

    expect(run(['node', 'commonjs.cjs'], consumerDirectory)).toBe(
      '{"port":4100,"error":"ConfigError","sharedErrorIdentity":true}\n',
    );
  });

  test('declarations resolve without workspace source paths', async () => {
    await writeFixture(
      'index.ts',
      `import { ConfigError, type ConfigIssue } from 'typespun';
import { createLoader, type GeneratedSchema } from 'typespun/generated';
const schema = { protocolVersion: 1, fields: [] } as const satisfies GeneratedSchema;
const load = createLoader<{ ready?: boolean }>(schema);
const issue: ConfigIssue | undefined = new ConfigError([]).issues[0];
void issue;
void load;
`,
    );
    await writeFixture(
      'tsconfig.json',
      `${JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['index.ts'] }, null, 2)}\n`,
    );

    expect(
      run([installedBinary('tsc'), '-p', 'tsconfig.json'], consumerDirectory),
    ).toBe('');
  });

  test('CommonJS declarations resolve through the require type condition', async () => {
    await writeFixture(
      'commonjs-types.cts',
      `import runtime = require('typespun');
import generated = require('typespun/generated');
const schema = { protocolVersion: 1, fields: [] } as const satisfies generated.GeneratedSchema;
const load = generated.createLoader<{ ready?: boolean }>(schema);
const issue: runtime.ConfigIssue | undefined = new runtime.ConfigError([]).issues[0];
void issue;
void load;
`,
    );
    await writeFixture(
      'tsconfig.commonjs.json',
      `${JSON.stringify({ compilerOptions: { module: 'Node16', moduleResolution: 'Node16', strict: true, noEmit: true }, files: ['commonjs-types.cts'] }, null, 2)}\n`,
    );

    expect(
      run(
        [installedBinary('tsc'), '-p', 'tsconfig.commonjs.json'],
        consumerDirectory,
      ),
    ).toBe('');
  });

  test('installed CLI binary runs under Bun and Node', () => {
    const bin = join(consumerDirectory!, 'node_modules/.bin/typespun');

    expect(run(['bun', bin, '--help'], consumerDirectory)).toContain(
      'Usage: typespun',
    );
    expect(run(['node', bin, '--help'], consumerDirectory)).toContain(
      'Usage: typespun',
    );
  });

  test('installed CLI initializes, generates, checks, compiles, and runs an interface project', async () => {
    const project = join(consumerDirectory!, 'projects/interface');
    await createProject(project);
    const bin = installedBinary('typespun');

    expect(run([bin, 'init'], project)).toContain('Created src/config.ts.');
    expect(run([bin, 'generate'], project)).toContain(
      'Unchanged src/generated/typespun.ts.',
    );
    expect(run([bin, 'check'], project)).toContain('is up to date.');
    await writeProjectFile(
      project,
      'src/index.ts',
      `import { loadConfig } from './generated/typespun.js';
console.log(loadConfig({ source: { PORT: '4321' } }).port);
`,
    );

    run([installedBinary('tsc'), '-p', 'tsconfig.json'], project);
    expect(run(['node', 'dist/index.js'], project)).toBe('4321\n');
  });

  test('installed CLI completes a partial class project before generate, check, compile, and execution', async () => {
    const project = join(consumerDirectory!, 'projects/class');
    await createProject(project, { keep: 'unchanged' });
    await writeProjectFile(
      project,
      'typespun.json',
      `${JSON.stringify({ input: 'src/config.ts' }, null, 2)}\n`,
    );
    const bin = installedBinary('typespun');

    expect(
      run(
        [
          bin,
          'init',
          '--style',
          'class',
          '--output',
          'src/generated/typespun.ts',
          '--env-prefix',
          'APP',
        ],
        project,
      ),
    ).toContain('Created src/config.ts.');
    expect(await readFile(join(project, 'src/config.ts'), 'utf8')).toContain(
      '@Config()\nexport class AppConfig',
    );
    expect(run([bin, 'generate'], project)).toContain(
      'Unchanged src/generated/typespun.ts.',
    );
    expect(run([bin, 'check'], project)).toContain('is up to date.');
    await writeProjectFile(
      project,
      'src/index.ts',
      `import { loadConfig } from './generated/typespun.js';
console.log(loadConfig({ source: { APP_PORT: '3000' } }).port);
`,
    );

    run([installedBinary('tsc'), '-p', 'tsconfig.json'], project);
    expect(run(['node', 'dist/index.js'], project)).toBe('3000\n');
  });
});

async function writeFixture(name: string, contents: string): Promise<void> {
  await mkdir(consumerDirectory!, { recursive: true });
  await writeFile(join(consumerDirectory!, name), contents);
}

function installedBinary(name: 'tsc' | 'typespun'): string {
  return join(consumerDirectory!, 'node_modules/.bin', name);
}

async function createProject(
  project: string,
  scripts: Readonly<Record<string, string>> = {},
): Promise<void> {
  await writeProjectFile(
    project,
    'package.json',
    `${JSON.stringify({ private: true, type: 'module', scripts }, null, 2)}\n`,
  );
  await writeProjectFile(
    project,
    'tsconfig.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          target: 'ES2022',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
}

async function writeProjectFile(
  project: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const path = join(project, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}
