import { describe, expect, test } from 'vitest';
import { ConfigError, formatConfigError } from './schema.js';
import { validateTypedValue } from './generated.js';
import type { FieldKind } from './generated.js';

describe('validateTypedValue', () => {
  test.each([
    [{ type: 'string' }, 'value', undefined],
    [{ type: 'number' }, 42, undefined],
    [{ type: 'number' }, -1.5, undefined],
    [{ type: 'number' }, Number.NaN, 'a finite number'],
    [{ type: 'number' }, Number.POSITIVE_INFINITY, 'a finite number'],
    [{ type: 'boolean' }, true, undefined],
    [{ type: 'boolean' }, false, undefined],
    [
      { type: 'enum', values: ['development', 'production'] },
      'production',
      undefined,
    ],
    [{ type: 'enum', values: ['development', 'production'] }, 'test', 'one of'],
    [{ type: 'array', element: 'string' }, ['one', 'two'], undefined],
    [{ type: 'array', element: 'number' }, [1, 2.5], undefined],
    [{ type: 'array', element: 'boolean' }, [true, false], undefined],
    [{ type: 'array', element: 'number' }, [1, 'two'], 'number'],
    [{ type: 'string' }, null, 'string'],
    [{ type: 'boolean' }, 'true', 'boolean'],
  ] as const satisfies readonly [FieldKind, unknown, string | undefined][])(
    'validates %#',
    (kind, value, expectedMessage) => {
      const message = validateTypedValue(kind, value);

      if (expectedMessage === undefined) {
        expect(message).toBeUndefined();
      } else {
        expect(message).toContain(expectedMessage);
      }
    },
  );
});

describe('formatConfigError', () => {
  test('renders path, environment key, message and received value', () => {
    const error = new ConfigError([
      {
        code: 'invalid_value',
        path: 'cors.origins',
        envKey: 'APP_CORS_ORIGINS',
        message: 'Expected a JSON array of string, for example ["a","b"]',
        received: 'a,b',
      },
      {
        code: 'missing_value',
        path: 'sessionSecret',
        envKey: 'APP_SESSION_SECRET',
        message: 'Missing required value for sessionSecret',
      },
    ]);

    expect(formatConfigError(error)).toBe(
      [
        'Configuration validation failed',
        '  cors.origins (APP_CORS_ORIGINS): Expected a JSON array of string, for example ["a","b"]',
        '    received: "a,b"',
        '  sessionSecret (APP_SESSION_SECRET): Missing required value for sessionSecret',
      ].join('\n'),
    );
  });

  test('accepts a caller-supplied heading', () => {
    const error = new ConfigError([
      {
        code: 'missing_value',
        path: 'port',
        message: 'Missing required value',
      },
    ]);

    expect(formatConfigError(error, { heading: 'Server did not start.' })).toBe(
      ['Server did not start.', '  port: Missing required value'].join('\n'),
    );
  });

  test('omits the environment key when an issue has none', () => {
    const error = new ConfigError([
      { code: 'unknown_override', path: 'nope', message: 'Unknown path' },
    ]);

    expect(formatConfigError(error)).toContain('  nope: Unknown path');
  });

  test('carries no secret detail, because the resolver already removed it', () => {
    // The resolver replaces the message and drops `received` for secret
    // fields, so the formatter has nothing left to leak.
    const error = new ConfigError([
      {
        code: 'invalid_value',
        path: 'apiKeys',
        envKey: 'APP_API_KEYS',
        message: 'Invalid value for secret field',
      },
    ]);

    const output = formatConfigError(error);
    expect(output).toContain(
      'apiKeys (APP_API_KEYS): Invalid value for secret field',
    );
    expect(output).not.toContain('received');
  });

  test('does not throw while reporting a cyclic received value', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const error = new ConfigError([
      { code: 'invalid_value', path: 'x', message: 'bad', received: cyclic },
    ]);

    expect(() => formatConfigError(error)).not.toThrow();
  });
});
