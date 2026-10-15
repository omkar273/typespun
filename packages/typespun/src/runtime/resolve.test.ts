import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { rmSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLoader } from '../generated.js';
import { ConfigError, type GeneratedSchema } from '../schema.js';
import { attempt } from './attempt.js';

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
// Loose typing lets tests pass override values that the types reject.
const untypedLoad = createLoader<Record<string, unknown>>(schema);

// This schema uses generic names that can legitimately exist in a real
// environment, and the runtime reads process.env whenever no explicit source is
// given. Isolate them so ambient state cannot decide these assertions.
const schemaEnvNames = ['PORT', 'ENABLED', 'MODE', 'ORIGINS', 'TOKEN'] as const;
let ambientSchemaEnvironment: Record<string, string | undefined> = {};

beforeEach(() => {
  ambientSchemaEnvironment = Object.fromEntries(
    schemaEnvNames.map((name) => [name, process.env[name]]),
  );
  for (const name of schemaEnvNames) delete process.env[name];
});

afterEach(() => {
  for (const name of schemaEnvNames) {
    restoreEnvironment(name, ambientSchemaEnvironment[name]);
  }
});

describe('createLoader value coercion', () => {
  test('does not coerce a lower-precedence value before selecting overrides', async () => {
    using temp = await makeTempDirectory();
    const firstPath = join(temp.path, 'first.env');
    const secondPath = join(temp.path, 'second.env');
    await writeFile(
      firstPath,
      'PORT=not-a-number\nENABLED=true\nMODE=development\nORIGINS=["https://first.example.com"]\nTOKEN=first-token\n',
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

  test('coerces boolean environment values case-insensitively', () => {
    expect(load({ source: validSource({ ENABLED: 'TRUE' }) }).enabled).toBe(
      true,
    );
    expect(load({ source: validSource({ ENABLED: 'False' }) }).enabled).toBe(
      false,
    );
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

  test('names the JSON form when a comma-separated array is supplied', () => {
    const error = getConfigError(() =>
      load({
        source: validSource({ ORIGINS: 'https://a.example,https://b.example' }),
      }),
    );

    // Comma-separated is what most people try first, so the message has to
    // say what the accepted form actually is, not just the expected type.
    expect(error.issues).toEqual([
      expect.objectContaining({
        code: 'invalid_value',
        path: 'origins',
        message: 'Expected a JSON array of string, for example ["a","b"]',
      }),
    ]);
  });

  test('gives a JSON example that matches the array element type', () => {
    const arraySchema: GeneratedSchema = {
      protocolVersion: 1,
      fields: (['number', 'boolean'] as const).map((element) => ({
        propertyPath: [element],
        defaultsPath: [element],
        envName: element.toUpperCase(),
        kind: { type: 'array', element },
        required: true,
        secret: false,
        hasDefault: false,
        optionalParents: [],
      })),
    };

    const error = getConfigError(() =>
      createLoader(arraySchema)({
        source: { NUMBER: '1,2', BOOLEAN: 'true,false' },
      }),
    );

    expect(error.issues.map((issue) => issue.message)).toEqual([
      'Expected a JSON array of number, for example [1,2]',
      'Expected a JSON array of boolean, for example [true,false]',
    ]);
  });

  test('keeps the array hint out of diagnostics for a secret field', () => {
    const secretSchema: GeneratedSchema = {
      protocolVersion: 1,
      fields: [
        {
          propertyPath: ['tokens'],
          defaultsPath: ['tokens'],
          envName: 'TOKENS',
          kind: { type: 'array', element: 'string' },
          required: true,
          secret: true,
          hasDefault: false,
          optionalParents: [],
        },
      ],
    };

    const error = getConfigError(() =>
      createLoader(secretSchema)({ source: { TOKENS: 'a,b' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({
        code: 'invalid_value',
        path: 'tokens',
        message: 'Invalid value for secret field',
      }),
    ]);
    expect(error.issues[0]).not.toHaveProperty('received');
  });

  test('does not coerce a string override that should already be typed', () => {
    const error = getConfigError(() =>
      untypedLoad({ source: validSource(), overrides: { port: '5000' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'port' }),
    ]);
  });

  test('never selects an empty enum value even when the generated enum includes an empty member', () => {
    const emptyEnumSchema = {
      protocolVersion: 1,
      fields: [
        {
          propertyPath: ['mode'],
          defaultsPath: ['mode'],
          envName: 'MODE',
          kind: { type: 'enum', values: ['', 'production'] },
          required: true,
          secret: false,
          hasDefault: false,
          optionalParents: [],
        },
      ],
    } as const satisfies GeneratedSchema;
    const loadEmptyEnum = createLoader<{ mode: string }>(emptyEnumSchema);
    const error = getConfigError(() => loadEmptyEnum({ source: { MODE: '' } }));

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'missing_value', path: 'mode' }),
    ]);
  });
});

describe('createLoader source precedence', () => {
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

  test('treats ambient process.env as the default source above dotenv files', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, validDotenv({ PORT: '3000' }));
    const previous = process.env.TYPESPUN_AMBIENT_PORT;
    process.env.TYPESPUN_AMBIENT_PORT = '4000';

    try {
      const onlyPort = createLoader<{ port: number }>(
        singleFieldSchema('TYPESPUN_AMBIENT_PORT'),
      );
      await writeFile(dotenvPath, 'TYPESPUN_AMBIENT_PORT=3000\n');

      expect(onlyPort({ envFiles: [dotenvPath] })).toEqual({ port: 4000 });
    } finally {
      restoreEnvironment('TYPESPUN_AMBIENT_PORT', previous);
    }
  });

  test('ignores inherited properties while reading ambient process.env', () => {
    const inheritedNameSchema = {
      protocolVersion: 1,
      fields: [
        {
          propertyPath: ['label'],
          defaultsPath: ['label'],
          envName: 'toString',
          kind: { type: 'string' },
          required: true,
          secret: false,
          hasDefault: true,
          defaultValue: 'inline-label',
          optionalParents: [],
        },
      ],
    } as const satisfies GeneratedSchema;
    const loadLabel = createLoader<{ label: string }>(inheritedNameSchema);

    expect(loadLabel()).toEqual({ label: 'inline-label' });
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

  test('treats a blank source value as unset and falls through to dotenv', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, validDotenv({ ENABLED: 'false' }));

    expect(
      load({
        envFiles: [dotenvPath],
        source: validSource({ ENABLED: '' }),
      }).enabled,
    ).toBe(false);
  });

  test('treats a blank ambient process.env value as unset', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, validDotenv());
    process.env.ENABLED = '';

    expect(load({ envFiles: [dotenvPath] }).enabled).toBe(true);
  });

  test('treats a blank dotenv value as unset and falls through to the earlier file', async () => {
    using temp = await makeTempDirectory();
    const firstPath = join(temp.path, 'first.env');
    const secondPath = join(temp.path, 'second.env');
    await writeFile(firstPath, validDotenv({ ENABLED: 'false' }));
    await writeFile(secondPath, 'ENABLED=\n');

    expect(load({ envFiles: [firstPath, secondPath] }).enabled).toBe(false);
  });

  test('lets a compiled or inline default win over a blank value', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, 'ORIGINS=\n');

    expect(
      createLoader<{ origins: string[] }>(
        defaultsSchema(['inline'], ['compiled']),
      )({ envFiles: [dotenvPath], source: { ORIGINS: '' } }),
    ).toEqual({ origins: ['compiled'] });
    expect(
      createLoader<{ origins: string[] }>(defaultsSchema(['inline']))({
        envFiles: [dotenvPath],
        source: { ORIGINS: '' },
      }),
    ).toEqual({ origins: ['inline'] });
  });

  test('reports a required field with only blank values as missing', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, 'TYPESPUN_BLANK_PORT=\n');
    const onlyPort = createLoader<{ port: number }>(
      singleFieldSchema('TYPESPUN_BLANK_PORT'),
    );

    const error = getConfigError(() =>
      onlyPort({ envFiles: [dotenvPath], source: { TYPESPUN_BLANK_PORT: '' } }),
    );

    expect(error.issues).toEqual([
      {
        code: 'missing_value',
        path: 'port',
        envKey: 'TYPESPUN_BLANK_PORT',
        message: 'Missing required value for port',
      },
    ]);
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

  test('reports a missing required dotenv file and an unreadable optional one', async () => {
    using temp = await makeTempDirectory();
    const missingPath = join(temp.path, 'missing.env');
    const error = getConfigError(() =>
      load({
        envFiles: [missingPath, { path: temp.path, optional: true }],
        source: validSource(),
      }),
    );

    expect(error.issues).toEqual([
      {
        code: 'source_read_failed',
        path: missingPath,
        source: 'dotenv',
        message: `Unable to read dotenv file: ${missingPath}`,
      },
      {
        code: 'source_read_failed',
        path: temp.path,
        source: 'dotenv',
        message: `Unable to read dotenv file: ${temp.path}`,
      },
    ]);
  });

  test('parses dotenv files without mutating process.env', async () => {
    using temp = await makeTempDirectory();
    const dotenvPath = join(temp.path, 'runtime.env');
    await writeFile(dotenvPath, validDotenv());
    const before = { ...process.env };

    load({ envFiles: [dotenvPath] });

    expect(process.env).toEqual(before);
  });
});

describe('createLoader diagnostics and object safety', () => {
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
    expect(JSON.stringify(error)).not.toContain('expected-token');
  });

  test('reads explicit sources through own properties only', () => {
    const inherited: Record<string, string> = {};
    Reflect.setPrototypeOf(inherited, validSource());
    const error = getConfigError(() => load({ source: inherited }));

    expect(error.issues.map((issue) => issue.code)).toEqual([
      'missing_value',
      'missing_value',
      'missing_value',
      'missing_value',
      'missing_value',
    ]);
  });

  test('rejects non-string values supplied through the runtime source boundary', () => {
    const source: Record<string, string | undefined> = validSource();
    Reflect.set(source, 'PORT', 4000);
    const error = getConfigError(() => load({ source }));

    expect(error.issues).toEqual([
      expect.objectContaining({
        code: 'invalid_value',
        path: 'port',
        source: 'source',
      }),
    ]);
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

  test('requires optional descendants when a later field activates their parent', () => {
    const loadDatabase = createLoader<{
      database?: { host: string; port: number };
    }>(reverseOptionalDatabaseSchema);
    const error = getConfigError(() =>
      loadDatabase({ source: { DATABASE_HOST: 'db.internal' } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'missing_value', path: 'database.port' }),
    ]);
  });

  test('reconstructs required object containers that only have optional children', () => {
    const loadDatabase = createLoader<{ database: { host?: string } }>(
      requiredDatabaseSchema,
    );

    expect(loadDatabase({ source: {} })).toEqual({ database: {} });
  });

  test('reconstructs required nested containers when their optional ancestor is active', () => {
    const loadFeatures = createLoader<{
      features?: { enabled?: boolean; database: { host?: string } };
    }>(requiredNestedContainerSchema);

    expect(loadFeatures({ source: { FEATURES_ENABLED: 'true' } })).toEqual({
      features: { enabled: true, database: {} },
    });
  });

  test('accepts empty known override containers without hiding lower sources', () => {
    const loadDatabase = createLoader<{
      database?: { host: string; port: number };
    }>(optionalDatabaseSchema);

    expect(
      loadDatabase({
        source: { DATABASE_HOST: 'db.internal', DATABASE_PORT: '5432' },
        overrides: { database: {} },
      }),
    ).toEqual({ database: { host: 'db.internal', port: 5432 } });
  });

  test('treats an explicit nested empty container as a merge no-op', () => {
    const loadFeatures = createLoader<{
      features?: { enabled?: boolean; database: { host?: string } };
    }>(requiredNestedContainerSchema);

    expect(
      loadFeatures({
        source: {},
        overrides: { features: { database: {} } },
      }),
    ).toEqual({});
  });

  test('reports cyclic override objects as configuration issues', () => {
    const overrides: Record<string, unknown> = {};
    overrides.database = overrides;
    const loadDatabase = createLoader<{
      database?: { host: string; port: number };
    }>(optionalDatabaseSchema);
    const error = getConfigError(() =>
      loadDatabase({ source: {}, overrides: overrides }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({
        code: 'unknown_override',
        path: 'database',
      }),
    ]);
  });

  test('rejects sparse typed arrays', () => {
    const sparseOrigins: string[] = [];
    sparseOrigins.length = 1;
    const error = getConfigError(() =>
      load({ source: validSource(), overrides: { origins: sparseOrigins } }),
    );

    expect(error.issues).toEqual([
      expect.objectContaining({ code: 'invalid_value', path: 'origins' }),
    ]);
  });

  test('uses compiled defaults above inline defaults without mutating either array', () => {
    const inlineOrigins = ['https://inline.example.com'];
    const compiledOrigins = ['https://compiled.example.com'];
    const loadDefaults = createLoader<{ origins: string[] }>(
      defaultsSchema(inlineOrigins, compiledOrigins),
    );

    const first = loadDefaults({ source: {} });
    const second = loadDefaults({ source: {} });

    expect(first).toEqual({ origins: ['https://compiled.example.com'] });
    expect(first.origins).not.toBe(compiledOrigins);
    expect(second.origins).not.toBe(first.origins);
    first.origins.push('mutated');
    expect(second.origins).toEqual(['https://compiled.example.com']);
    expect(inlineOrigins).toEqual(['https://inline.example.com']);
    expect(compiledOrigins).toEqual(['https://compiled.example.com']);

    const inlineOnly = createLoader<{ origins: string[] }>(
      defaultsSchema(inlineOrigins),
    );
    const inlineResult = inlineOnly({ source: {} });
    expect(inlineResult.origins).toEqual(['https://inline.example.com']);
    expect(inlineResult.origins).not.toBe(inlineOrigins);
  });

  test('clones typed override arrays instead of returning the caller-owned array', () => {
    const origins = ['https://override.example.com'];
    const resolved = load({
      source: validSource(),
      overrides: { origins },
    });

    expect(resolved.origins).toEqual(['https://override.example.com']);
    expect(resolved.origins).not.toBe(origins);
    resolved.origins.push('mutated');
    expect(origins).toEqual(['https://override.example.com']);
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
    const plain: { port?: number } = {};

    expect(plain.port).toBeUndefined();
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

const reverseOptionalDatabaseSchema = {
  protocolVersion: 1,
  fields: [
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
  ],
} as const satisfies GeneratedSchema;

const requiredDatabaseSchema = {
  protocolVersion: 1,
  fields: [
    {
      propertyPath: ['database', 'host'],
      defaultsPath: ['database', 'host'],
      envName: 'DATABASE_HOST',
      kind: { type: 'string' },
      required: false,
      secret: false,
      hasDefault: false,
      optionalParents: [],
    },
  ],
} as const satisfies GeneratedSchema;

const requiredNestedContainerSchema = {
  protocolVersion: 1,
  fields: [
    {
      propertyPath: ['features', 'enabled'],
      defaultsPath: ['features', 'enabled'],
      envName: 'FEATURES_ENABLED',
      kind: { type: 'boolean' },
      required: false,
      secret: false,
      hasDefault: false,
      optionalParents: [['features']],
    },
    {
      propertyPath: ['features', 'database', 'host'],
      defaultsPath: ['features', 'database', 'host'],
      envName: 'FEATURES_DATABASE_HOST',
      kind: { type: 'string' },
      required: false,
      secret: false,
      hasDefault: false,
      optionalParents: [['features']],
    },
  ],
} as const satisfies GeneratedSchema;

const defaultsSchema = (
  inlineOrigins: readonly string[],
  compiledOrigins?: readonly string[],
): GeneratedSchema => ({
  protocolVersion: 1,
  fields: [
    {
      propertyPath: ['origins'],
      defaultsPath: ['origins'],
      envName: 'ORIGINS',
      kind: { type: 'array', element: 'string' },
      required: true,
      secret: false,
      hasDefault: true,
      defaultValue: inlineOrigins,
      optionalParents: [],
    },
  ],
  ...(compiledOrigins === undefined
    ? {}
    : { compiledDefaults: { origins: compiledOrigins } }),
});

const validSource = (
  overrides: Record<string, string> = {},
): Record<string, string> => ({
  PORT: '3000',
  ENABLED: 'true',
  MODE: 'production',
  ORIGINS: '["https://example.com"]',
  TOKEN: 'runtime-token',
  ...overrides,
});

const validDotenv = (overrides: Record<string, string> = {}): string =>
  Object.entries(validSource(overrides))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

const singleFieldSchema = (
  envName: string,
  propertyPath: readonly string[] = ['port'],
): GeneratedSchema => ({
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
});

const getConfigError = (loadConfig: () => unknown): ConfigError => {
  const { error } = attempt(loadConfig, (thrown) => thrown);

  if (error instanceof ConfigError) {
    return error;
  }

  throw new Error('Expected configuration resolution to fail', {
    cause: error,
  });
};

const makeTempDirectory = async (): Promise<{
  path: string;
  [Symbol.dispose](): void;
}> => {
  const path = await mkdtemp(join(tmpdir(), 'typespun-runtime-'));

  return {
    path,
    [Symbol.dispose]() {
      rmSync(path, { recursive: true, force: true });
    },
  };
};

const restoreEnvironment = (
  key: string,
  previous: string | undefined,
): void => {
  if (previous === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = previous;
  }
};
