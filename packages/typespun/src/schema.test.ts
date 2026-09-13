import { describe, expect, test } from 'bun:test';
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
