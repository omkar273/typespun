import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  packArtifacts,
  removePackedArtifacts,
  run,
  workspaceRoot,
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
console.log(JSON.stringify({ port: load({ source: { PORT: '4100' } }).port, error: new ConfigError([]).name }));
`,
    );

    expect(run(['node', 'commonjs.cjs'], consumerDirectory)).toBe(
      '{"port":4100,"error":"ConfigError"}\n',
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
      run(
        [join(workspaceRoot, 'node_modules/.bin/tsc'), '-p', 'tsconfig.json'],
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
});

async function writeFixture(name: string, contents: string): Promise<void> {
  await mkdir(consumerDirectory!, { recursive: true });
  await writeFile(join(consumerDirectory!, name), contents);
}
