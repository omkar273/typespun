import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProjectConfig } from './config.js';
import { compileDefaults } from './defaults.js';
import { discoverDefaultsPath } from './discovery.js';
import type { FieldIR } from '../contracts.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function createProject(): string {
  const directory = mkdtempSync(join(tmpdir(), 'typespun-project-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeProjectFile(
  projectDirectory: string,
  relativePath: string,
  contents = '',
): string {
  const path = join(projectDirectory, relativePath);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

describe('project discovery', () => {
  test('finds the sole conventional TypeScript input without a config file', () => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'src/config.ts',
      'export interface Config {}',
    );
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');

    const result = loadProjectConfig({ projectDirectory });

    expect(result.inputPath).toBe(resolve(projectDirectory, 'src/config.ts'));
    expect(result.outputPath).toBe(
      resolve(projectDirectory, 'src/generated/typespun.ts'),
    );
    expect(result.tsconfigPath).toBe(
      resolve(projectDirectory, 'tsconfig.json'),
    );
    expect(result.defaultsPath).toBeUndefined();
  });

  test.each([
    ['src/config.mts', 'src/generated/typespun.mts'],
    ['src/config.cts', 'src/generated/typespun.cts'],
  ])('mirrors %s in its default output extension', (input, output) => {
    const projectDirectory = createProject();
    writeProjectFile(projectDirectory, input, 'export interface Config {}');
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');

    const result = loadProjectConfig({ projectDirectory });

    expect(result.outputPath).toBe(resolve(projectDirectory, output));
  });

  test('rejects projects without a conventional schema candidate', () => {
    const projectDirectory = createProject();

    expect(() => loadProjectConfig({ projectDirectory })).toThrow(
      'exactly one conventional input',
    );
  });

  test('rejects projects with multiple conventional schema candidates', () => {
    const projectDirectory = createProject();
    writeProjectFile(projectDirectory, 'src/config.ts');
    writeProjectFile(projectDirectory, 'src/config.mts');

    expect(() => loadProjectConfig({ projectDirectory })).toThrow(
      'exactly one conventional input',
    );
  });

  test('accepts no conventional defaults file', () => {
    const projectDirectory = createProject();

    expect(discoverDefaultsPath(projectDirectory)).toBeUndefined();
  });

  test.each([
    'config.yaml',
    'config.yml',
    'config.json',
    'config/config.yaml',
    'config/config.yml',
    'config/config.json',
    'src/config.yaml',
    'src/config.yml',
    'src/config.json',
  ])('accepts one conventional defaults file at %s', (candidate) => {
    const projectDirectory = createProject();
    const expected = writeProjectFile(projectDirectory, candidate, '{}');

    expect(discoverDefaultsPath(projectDirectory)).toBe(expected);
  });

  test('rejects ambiguous conventional defaults files', () => {
    const projectDirectory = createProject();
    writeProjectFile(projectDirectory, 'config.yaml', '{}');
    writeProjectFile(projectDirectory, 'src/config.json', '{}');

    expect(() => discoverDefaultsPath(projectDirectory)).toThrow(
      'Multiple conventional defaults files',
    );
  });
});

describe('project configuration', () => {
  test('uses an explicit arbitrary config path and resolves paths from its directory', () => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'src/config.ts',
      'export interface Wrong {}',
    );
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');
    writeProjectFile(
      projectDirectory,
      'typespun.json',
      JSON.stringify({ input: 'src/config.ts' }),
    );
    const configPath = writeProjectFile(
      projectDirectory,
      'settings/custom.json',
      JSON.stringify({
        input: '../schema/config.mts',
        output: '../generated/loader.mts',
        tsconfig: '../tsconfig.json',
      }),
    );
    writeProjectFile(
      projectDirectory,
      'schema/config.mts',
      'export interface Config {}',
    );

    const result = loadProjectConfig({ projectDirectory, configPath });

    expect(result.inputPath).toBe(
      resolve(projectDirectory, 'schema/config.mts'),
    );
    expect(result.outputPath).toBe(
      resolve(projectDirectory, 'generated/loader.mts'),
    );
  });

  test('resolves strict configuration paths and normalizes policy values', () => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'schema/config.mts',
      'export interface Config {}',
    );
    writeProjectFile(projectDirectory, 'compiler/tsconfig.json', '{}');
    writeProjectFile(
      projectDirectory,
      'typespun.json',
      JSON.stringify({
        input: 'schema/config.mts',
        output: 'build/typespun.cts',
        tsconfig: 'compiler/tsconfig.json',
        envPrefix: 'APP_',
        defaults: { path: 'settings/defaults.yaml', unknownKeys: 'ignore' },
        secretDefaults: 'allow',
      }),
    );

    const result = loadProjectConfig({ projectDirectory });

    expect(result.inputPath).toBe(
      resolve(projectDirectory, 'schema/config.mts'),
    );
    expect(result.outputPath).toBe(
      resolve(projectDirectory, 'build/typespun.cts'),
    );
    expect(result.tsconfigPath).toBe(
      resolve(projectDirectory, 'compiler/tsconfig.json'),
    );
    expect(result.defaultsPath).toBe(
      resolve(projectDirectory, 'settings/defaults.yaml'),
    );
    expect(result.envPrefix).toBe('APP');
    expect(result.unknownKeys).toBe('ignore');
    expect(result.secretDefaults).toBe('allow');
  });

  test('accepts comments in typespun.json', () => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'src/config.ts',
      'export interface Config {}',
    );
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');
    writeProjectFile(
      projectDirectory,
      'typespun.json',
      `{
  "input": "src/config.ts",
  "output": "src/generated/typespun.ts",
  // Allowed: "warn", "allow", or "error".
  "secretDefaults": "allow"
}
`,
    );

    const result = loadProjectConfig({ projectDirectory });

    expect(result.secretDefaults).toBe('allow');
  });

  test('discovers defaults and the nearest tsconfig when config options omit paths', () => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'schema/nested/config.ts',
      'export interface Config {}',
    );
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');
    writeProjectFile(projectDirectory, 'config.yml', '{}');
    writeProjectFile(
      projectDirectory,
      'typespun.json',
      JSON.stringify({
        input: 'schema/nested/config.ts',
        defaults: { unknownKeys: 'warn' },
      }),
    );

    const result = loadProjectConfig({ projectDirectory });

    expect(result.tsconfigPath).toBe(
      resolve(projectDirectory, 'tsconfig.json'),
    );
    expect(result.defaultsPath).toBe(resolve(projectDirectory, 'config.yml'));
    expect(result.unknownKeys).toBe('warn');
    expect(result.secretDefaults).toBe('warn');
  });

  test.each([
    [
      'unknown top-level key',
      { unsupported: true },
      'Unknown typespun.json key',
    ],
    [
      'unknown defaults key',
      { defaults: { unsupported: true } },
      'Unknown defaults key',
    ],
    [
      'invalid unknown-key policy',
      { defaults: { unknownKeys: 'log' } },
      'unknownKeys',
    ],
    [
      'invalid secret-default policy',
      { secretDefaults: 'silent' },
      'secretDefaults',
    ],
    ['invalid output extension', { output: 'generated.js' }, 'output'],
  ])('rejects %s', (_name, configuration, message) => {
    const projectDirectory = createProject();
    writeProjectFile(
      projectDirectory,
      'src/config.ts',
      'export interface Config {}',
    );
    writeProjectFile(projectDirectory, 'tsconfig.json', '{}');
    writeProjectFile(
      projectDirectory,
      'typespun.json',
      JSON.stringify(configuration),
    );

    expect(() => loadProjectConfig({ projectDirectory })).toThrow(message);
  });
});

const fields: readonly FieldIR[] = [
  {
    propertyPath: ['server', 'host'],
    defaultsPath: ['server', 'host'],
    envName: 'APP_HOST',
    kind: { type: 'string' },
    required: true,
    secret: false,
    hasDefault: true,
    defaultValue: 'localhost',
    optionalParents: [],
    location: { file: 'config.ts', line: 1, column: 1 },
  },
  {
    propertyPath: ['server', 'port'],
    defaultsPath: ['server', 'port'],
    envName: 'APP_PORT',
    kind: { type: 'number' },
    required: true,
    secret: false,
    hasDefault: true,
    defaultValue: 3000,
    optionalParents: [],
    location: { file: 'config.ts', line: 2, column: 1 },
  },
  {
    propertyPath: ['features', 'tags'],
    defaultsPath: ['features', 'tags'],
    envName: 'APP_TAGS',
    kind: { type: 'array', element: 'string' },
    required: false,
    secret: false,
    hasDefault: false,
    optionalParents: [],
    location: { file: 'config.ts', line: 3, column: 1 },
  },
  {
    propertyPath: ['credentials', 'token'],
    defaultsPath: ['credentials', 'token'],
    envName: 'APP_TOKEN',
    kind: { type: 'string' },
    required: true,
    secret: true,
    hasDefault: false,
    optionalParents: [],
    location: { file: 'config.ts', line: 4, column: 1 },
  },
];

describe('compiled defaults', () => {
  test('maps nested JSON defaults by defaultsPath over inline field defaults', () => {
    const result = compileDefaults(
      {
        path: 'config.json',
        content:
          '{"server":{"port":8080},"features":{"tags":["alpha","beta"]}}',
      },
      fields,
      { unknownKeys: 'error', secretDefaults: 'allow' },
    );

    expect(result.values).toEqual({
      server: { host: 'localhost', port: 8080 },
      features: { tags: ['alpha', 'beta'] },
    });
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test.each([
    ['error', 0, 1],
    ['warn', 1, 0],
    ['ignore', 0, 0],
  ] as const)(
    'handles unknown YAML paths with the %s policy',
    (unknownKeys, warningCount, errorCount) => {
      const result = compileDefaults(
        {
          path: 'config.yaml',
          content: 'server:\n  port: 8080\n  unsupported: true\n',
        },
        fields,
        { unknownKeys, secretDefaults: 'allow' },
      );

      expect(result.values).toEqual({
        server: { host: 'localhost', port: 8080 },
      });
      expect(result.warnings).toHaveLength(warningCount);
      expect(result.errors).toHaveLength(errorCount);
      for (const diagnostic of [...result.warnings, ...result.errors]) {
        expect(diagnostic.path).toBe('server.unsupported');
        expect(JSON.stringify(diagnostic)).not.toContain('true');
      }
    },
  );

  test.each([
    ['error', 'null'],
    ['error', 'true'],
    ['error', '[]'],
    ['warn', 'null'],
    ['warn', 'true'],
    ['warn', '[]'],
    ['ignore', 'null'],
    ['ignore', 'true'],
    ['ignore', '[]'],
  ] as const)(
    'rejects a %s-policy known object branch supplied as %s',
    (unknownKeys, suppliedValue) => {
      const result = compileDefaults(
        { path: 'config.json', content: `{"server":${suppliedValue}}` },
        fields,
        { unknownKeys, secretDefaults: 'allow' },
      );

      expect(result.errors).toEqual([
        {
          code: 'invalid_default_value',
          path: 'server',
          file: 'config.json',
          message: 'Expected an object for nested defaults',
        },
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.values).toEqual({
        server: { host: 'localhost', port: 3000 },
      });
    },
  );

  test('validates scalar and array YAML defaults without exposing supplied values', () => {
    const result = compileDefaults(
      {
        path: 'config.yaml',
        content:
          'server:\n  port: invalid-port\nfeatures:\n  tags: [alpha, 99]\n',
      },
      fields,
      { unknownKeys: 'error', secretDefaults: 'allow' },
    );

    expect(result.errors.map((diagnostic) => diagnostic.path)).toEqual([
      'server.port',
      'features.tags',
    ]);
    expect(JSON.stringify(result.errors)).not.toContain('invalid-port');
    expect(JSON.stringify(result.errors)).not.toContain('99');
  });

  test.each([
    [
      'warn',
      1,
      0,
      {
        server: { host: 'localhost', port: 3000 },
        credentials: { token: 'shh' },
      },
    ],
    [
      'allow',
      0,
      0,
      {
        server: { host: 'localhost', port: 3000 },
        credentials: { token: 'shh' },
      },
    ],
    ['error', 0, 1, { server: { host: 'localhost', port: 3000 } }],
  ] as const)(
    'applies the %s secret-default policy',
    (secretDefaults, warningCount, errorCount, expectedValues) => {
      const result = compileDefaults(
        { path: 'config.json', content: '{"credentials":{"token":"shh"}}' },
        fields,
        { unknownKeys: 'error', secretDefaults },
      );

      expect(result.values).toEqual(expectedValues);
      expect(result.warnings).toHaveLength(warningCount);
      expect(result.errors).toHaveLength(errorCount);
      for (const diagnostic of [...result.warnings, ...result.errors]) {
        expect(diagnostic.path).toBe('credentials.token');
        expect(JSON.stringify(diagnostic)).not.toContain('shh');
      }
    },
  );

  test.each([
    [
      'warn',
      1,
      0,
      {
        server: { host: 'localhost', port: 3000 },
        credentials: { token: 'inline-secret' },
      },
    ],
    [
      'allow',
      0,
      0,
      {
        server: { host: 'localhost', port: 3000 },
        credentials: { token: 'inline-secret' },
      },
    ],
    ['error', 0, 1, { server: { host: 'localhost', port: 3000 } }],
  ] as const)(
    'applies the %s secret-default policy to inline defaults',
    (secretDefaults, warningCount, errorCount, expectedValues) => {
      const inlineSecretFields = fields.map((field) =>
        field.secret
          ? { ...field, hasDefault: true, defaultValue: 'inline-secret' }
          : field,
      );
      const result = compileDefaults(
        { path: 'config.yaml', content: '{}' },
        inlineSecretFields,
        { unknownKeys: 'error', secretDefaults },
      );

      expect(result.values).toEqual(expectedValues);
      expect(result.warnings).toHaveLength(warningCount);
      expect(result.errors).toHaveLength(errorCount);
      for (const diagnostic of [...result.warnings, ...result.errors]) {
        expect(diagnostic).toMatchObject({
          code: 'secret_default',
          path: 'credentials.token',
          file: 'config.ts',
        });
        expect(JSON.stringify(diagnostic)).not.toContain('inline-secret');
      }
    },
  );

  test('reports one secret-default warning when a compiled value overrides an inline value', () => {
    const inlineSecretFields = fields.map((field) =>
      field.secret
        ? { ...field, hasDefault: true, defaultValue: 'inline-secret' }
        : field,
    );
    const result = compileDefaults(
      { path: 'config.yaml', content: 'credentials:\n  token: file-secret\n' },
      inlineSecretFields,
      { unknownKeys: 'error', secretDefaults: 'warn' },
    );

    expect(result.values).toEqual({
      server: { host: 'localhost', port: 3000 },
      credentials: { token: 'file-secret' },
    });
    expect(result.warnings).toEqual([
      {
        code: 'secret_default',
        path: 'credentials.token',
        file: 'config.yaml',
        message: 'Secret field has a compiled default',
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(JSON.stringify(result.warnings)).not.toContain('inline-secret');
    expect(JSON.stringify(result.warnings)).not.toContain('file-secret');
  });

  test('redacts allowed enum values when a secret compiled default is invalid', () => {
    const secretEnumFields = fields.map((field) =>
      field.secret
        ? {
            ...field,
            kind: {
              type: 'enum' as const,
              values: ['public', 'private-key-never-print'],
            },
          }
        : field,
    );
    const result = compileDefaults(
      {
        path: 'config.yaml',
        content: 'credentials:\n  token: supplied-private-never-print\n',
      },
      secretEnumFields,
      { unknownKeys: 'error', secretDefaults: 'warn' },
    );

    expect(result.errors).toEqual([
      {
        code: 'invalid_default_value',
        path: 'credentials.token',
        file: 'config.yaml',
        message: 'Secret default does not match its declared field type',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('private-key-never-print');
    expect(JSON.stringify(result)).not.toContain(
      'supplied-private-never-print',
    );
  });

  test.each(['__proto__', 'constructor', 'prototype'] as const)(
    'rejects prototype-pollution defaults key %s',
    (key) => {
      const result = compileDefaults(
        { path: 'config.json', content: `{"${key}":{"token":"shh"}}` },
        fields,
        { unknownKeys: 'error', secretDefaults: 'allow' },
      );

      expect(result.errors.map((diagnostic) => diagnostic.path)).toEqual([key]);
      expect(result.values).toEqual({
        server: { host: 'localhost', port: 3000 },
      });
      expect(({} as { token?: string }).token).toBeUndefined();
    },
  );

  test.each([
    ['error', '__proto__'],
    ['error', 'constructor'],
    ['error', 'prototype'],
    ['warn', '__proto__'],
    ['warn', 'constructor'],
    ['warn', 'prototype'],
    ['ignore', '__proto__'],
    ['ignore', 'constructor'],
    ['ignore', 'prototype'],
  ] as const)(
    'rejects unsafe %s defaults keys hidden in an unknown array subtree under the %s policy',
    (unknownKeys, key) => {
      const result = compileDefaults(
        {
          path: 'config.json',
          content: `{"excluded":{"items":[{"${key}":"shh"}]}}`,
        },
        fields,
        { unknownKeys, secretDefaults: 'allow' },
      );

      expect(
        result.errors.filter(
          (diagnostic) => diagnostic.code === 'unsafe_defaults_key',
        ),
      ).toEqual([
        {
          code: 'unsafe_defaults_key',
          path: `excluded.items.0.${key}`,
          file: 'config.json',
          message: 'Defaults path contains an unsafe key',
        },
      ]);
      expect(result.values).toEqual({
        server: { host: 'localhost', port: 3000 },
      });
      expect(JSON.stringify(result.errors)).not.toContain('shh');
    },
  );

  test('reports a redacted error for a recursive YAML alias in an ignored subtree', () => {
    const result = compileDefaults(
      {
        path: 'config.yaml',
        content: 'excluded: &loop\n  again: *loop\n',
      },
      fields,
      { unknownKeys: 'ignore', secretDefaults: 'allow' },
    );

    expect(result.errors).toEqual([
      {
        code: 'invalid_defaults_document',
        path: 'excluded.again',
        file: 'config.yaml',
        message: 'Defaults document contains a recursive alias',
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.values).toEqual({
      server: { host: 'localhost', port: 3000 },
    });
  });
});
