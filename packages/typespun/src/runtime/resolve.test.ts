import { describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLoader } from '../generated.js';
import { ConfigError } from '../schema.js';
import type { GeneratedSchema } from '../schema.js';

interface RuntimeConfig {
  port: number;
  enabled: boolean;
  mode: 'development' | 'production';
  origins: string[];
  token: string;
}

const schema = {
  protocolVersion: 1,
  fields: [
    {
      propertyPath: ['port'],
      defaultsPath: ['port'],
      envName: 'PORT',
      kind: { type: 'number' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
    {
      propertyPath: ['enabled'],
      defaultsPath: ['enabled'],
      envName: 'ENABLED',
      kind: { type: 'boolean' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
    {
      propertyPath: ['mode'],
      defaultsPath: ['mode'],
      envName: 'MODE',
      kind: { type: 'enum', values: ['development', 'production'] },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
    {
      propertyPath: ['origins'],
      defaultsPath: ['origins'],
      envName: 'ORIGINS',
      kind: { type: 'array', element: 'string' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
    {
      propertyPath: ['token'],
      defaultsPath: ['token'],
      envName: 'TOKEN',
      kind: { type: 'string' },
      required: true,
      secret: true,
      hasDefault: false,
      optionalParents: [],
    },
  ],
} as const satisfies GeneratedSchema;

const load = createLoader<RuntimeConfig>(schema);

describe('createLoader', () => {
  test('does not coerce a lower-precedence value before selecting overrides', async () => {
    using temp = await makeTempDirectory();
    const firstPath = join(temp.path, 'first.env');
    const secondPath = join(temp.path, 'second.env');
    await writeFile(
      firstPath,
      'PORT=3000\nENABLED=true\nMODE=development\nORIGINS=["https://first.example.com"]\nTOKEN=first-token\n',
    );
    await writeFile(
      secondPath,
      'PORT=4000\nMODE=production\nORIGINS=["https://example.com"]\n',
    );

    expect(
      load({
        envFiles: [firstPath, secondPath],
        source: { PORT: '4000', TOKEN: 'runtime-token' },
        overrides: { port: 5000 },
      }),
    ).toEqual({
      port: 5000,
      enabled: true,
      mode: 'production',
      origins: ['https://example.com'],
      token: 'runtime-token',
    });
  });

  test('rejects a non-numeric string instead of accepting a numeric prefix', () => {
    const error = getConfigError(() =>
      load({ source: validSource({ PORT: '4000oops' }) }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'port' }),
    ]);
  });

  test('rejects boolean spellings other than true and false', () => {
    const error = getConfigError(() =>
      load({ source: validSource({ ENABLED: 'yes' }) }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'enabled' }),
    ]);
  });

  test('rejects enum values outside the declared members', () => {
    const error = getConfigError(() =>
      load({ source: validSource({ MODE: 'test' }) }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'mode' }),
    ]);
  });

  test('rejects JSON arrays with an invalid element type', () => {
    const error = getConfigError(() =>
      load({ source: validSource({ ORIGINS: '["https://example.com", 42]' }) }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'origins' }),
    ]);
  });

  test('does not coerce a string override that should already be typed', () => {
    const error = getConfigError(() =>
      load({ source: validSource(), overrides: { port: '5000' as never } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'port' }),
    ]);
  });

  test('lets the later dotenv file replace the earlier dotenv value', async () => {
    using temp = await makeTempDirectory();
    const firstPath = join(temp.path, 'first.env');
    const secondPath = join(temp.path, 'second.env');
    await writeFile(
      firstPath,
      validDotenv({ PORT: '3000', MODE: 'development' }),
    );
    await writeFile(secondPath, 'PORT=4000\nMODE=production\n');

    expect(load({ envFiles: [firstPath, secondPath] })).toEqual({
      port: 4000,
      enabled: true,
      mode: 'production',
      origins: ['https://example.com'],
      token: 'runtime-token',
    });
  });

  test('does not fall back to process.env when an explicit empty source is supplied', () => {
    const previous = process.env.TYPESPUN_ONLY_PORT;
    process.env.TYPESPUN_ONLY_PORT = '4000';

    try {
      const onlyPort = createLoader<{ port: number }>(
        singleFieldSchema('TYPESPUN_ONLY_PORT'),
      );
      const error = getConfigError(() => onlyPort({ source: {} }));

      expect(error.issues).toEqual([
        expect.objectContaining({ code: 'missing_value', path: 'port' }),
      ]);
    } finally {
      restoreEnvironment('TYPESPUN_ONLY_PORT', previous);
    }
  });

  test('skips an optional missing dotenv file instead of reporting a read failure', () => {
    expect(
      load({
        envFiles: [
          {
            path: join(tmpdir(), 'typespun-does-not-exist.env'),
            optional: true,
          },
        ],
        source: validSource(),
      }),
    ).toEqual({
      port: 3000,
      enabled: true,
      mode: 'production',
      origins: ['https://example.com'],
      token: 'runtime-token',
    });
  });

  test('parses dotenv files without mutating process.env', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, validDotenv());
    const before = { ...process.env };

    load({ envFiles: [dotenvPath] });

    expect(process.env).toEqual(before);
  });

  test('collects invalid and missing values instead of throwing after the first field', () => {
    const error = getConfigError(() =>
      load({ source: { PORT: 'nope', ENABLED: 'yes' } }),
    );

    expect(error.issues.map((issue) => [issue.code, issue.path])).toEqual([
      ['invalid_value', 'port'],
      ['invalid_value', 'enabled'],
      ['missing_value', 'mode'],
      ['missing_value', 'origins'],
      ['missing_value', 'token'],
    ]);
  });

  test('does not expose a secret candidate in aggregate errors', () => {
    const secretSchema = {
      protocolVersion: 1,
      fields: [
        {
          propertyPath: ['token'],
          defaultsPath: ['token'],
          envName: 'TOKEN',
          kind: { type: 'enum', values: ['expected-token'] },
          required: true,
          secret: true,
          hasDefault: false,
          optionalParents: [],
        },
      ],
    } as const satisfies GeneratedSchema;
    const loadSecret = createLoader<{ token: string }>(secretSchema);
    const error = getConfigError(() =>
      loadSecret({ source: { TOKEN: 'supplied-secret-token' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'token' }),
    ]);
    expect(error.issues[0]).not.toHaveProperty('received');
    expect(JSON.stringify(error)).not.toContain('supplied-secret-token');
  });

  test('leaves an optional object absent when none of its descendants resolve', () => {
    const loadDatabase = createLoader<{
      database?: { host: string; port: number };
    }>(optionalDatabaseSchema);

    expect(loadDatabase({ source: {} })).toEqual({});
  });

  test('requires optional-object descendants after any descendant activates the parent', () => {
    const loadDatabase = createLoader<{
      database?: { host: string; port: number };
    }>(optionalDatabaseSchema);
    const error = getConfigError(() =>
      loadDatabase({ source: { DATABASE_HOST: 'db.internal' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'missing_value', path: 'database.port' }),
    ]);
  });

  test('rejects unsafe schema paths instead of assigning prototype properties', () => {
    const unsafeSchema = singleFieldSchema('PORT', ['__proto__']);
    const unsafeLoad = createLoader<{ port: number }>(unsafeSchema);
    const error = getConfigError(() =>
      unsafeLoad({ source: { PORT: '4000' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({
        code: 'incompatible_schema',
        path: '__proto__',
      }),
    ]);
    expect(({} as { port?: number }).port).toBeUndefined();
  });
});

const optionalDatabaseSchema = {
  protocolVersion: 1,
  fields: [
    {
      propertyPath: ['database', 'host'],
      defaultsPath: ['database', 'host'],
      envName: 'DATABASE_HOST',
      kind: { type: 'string' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [['database']],
    },
    {
      propertyPath: ['database', 'port'],
      defaultsPath: ['database', 'port'],
      envName: 'DATABASE_PORT',
      kind: { type: 'number' },
      required: true,
      secret: false,
      hasDefault: false,
      optionalParents: [['database']],
    },
  ],
} as const satisfies GeneratedSchema;

function validSource(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    PORT: '3000',
    ENABLED: 'true',
    MODE: 'production',
    ORIGINS: '["https://example.com"]',
    TOKEN: 'runtime-token',
    ...overrides,
  };
}

function validDotenv(overrides: Record<string, string> = {}): string {
  return Object.entries(validSource(overrides))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function singleFieldSchema(
  envName: string,
  propertyPath: readonly string[] = ['port'],
): GeneratedSchema {
  return {
    protocolVersion: 1,
    fields: [
      {
        propertyPath,
        defaultsPath: propertyPath,
        envName,
        kind: { type: 'number' },
        required: true,
        secret: false,
        hasDefault: false,
        optionalParents: [],
      },
    ],
  };
}

function getConfigError(loadConfig: () => unknown): ConfigError {
  try {
    loadConfig();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }

  throw new Error('Expected configuration resolution to fail');
}

async function makeTempDirectory(): Promise<{
  path: string;
  [Symbol.dispose](): void;
}> {
  const path = await mkdtemp(join(tmpdir(), 'typespun-runtime-'));

  return {
    path,
    [Symbol.dispose]() {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

function restoreEnvironment(key: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = previous;
  }
}
