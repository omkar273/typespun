import { describe, expect, test } from 'vitest';
import { attempt } from './attempt.js';

class AppError extends Error {}

const toAppError = (thrown: unknown) =>
  new AppError(thrown instanceof Error ? thrown.message : String(thrown));

const rethrow = (thrown: unknown): never => {
  throw thrown;
};

// Typed as returning a number so a callback that only throws is not inferred as `never`.
const fail = (thrown: unknown): number => {
  throw thrown;
};

describe('attempt with a synchronous function', () => {
  test('reports the returned value', () =>
    expect(attempt(() => 42)).toEqual({ ok: true, data: 42, error: null }));

  test('reports a thrown Error as the same instance', () => {
    const boom = new Error('boom');
    const result = attempt(() => fail(boom));

    expect(result).toEqual({ ok: false, data: null, error: boom });
    expect(result.error).toBe(boom);
  });

  test('wraps a thrown non-Error and keeps the original as the cause', () => {
    const result = attempt(() => fail('nope'));

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('nope');
    expect(result.error?.cause).toBe('nope');
  });

  test('returns a plain object, not a promise', () =>
    expect(attempt(() => 1)).not.toBeInstanceOf(Promise));
});

describe('attempt with an asynchronous function', () => {
  test('reports the resolved value', async () => {
    const result = await attempt(async () => 'done');

    expect(result).toEqual({ ok: true, data: 'done', error: null });
  });

  test('reports a rejection instead of throwing', async () => {
    const boom = new Error('late');
    const result = await attempt(async () => fail(boom));

    expect(result).toEqual({ ok: false, data: null, error: boom });
  });
});

describe('attempt with mapError', () => {
  test('maps a synchronous throw', () => {
    const result = attempt(() => fail(new Error('sync')), toAppError);

    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error?.message).toBe('sync');
  });

  test('maps a rejection', async () => {
    const result = await attempt(
      async () => fail(new Error('async')),
      toAppError,
    );

    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error?.message).toBe('async');
  });

  test('is not called when the function succeeds', () => {
    let called = false;
    const result = attempt(
      () => 'fine',
      (thrown) => {
        called = true;

        return thrown;
      },
    );

    expect(result.ok).toBe(true);
    expect(called).toBe(false);
  });

  test('lets a rethrow from mapError escape a synchronous call', () =>
    expect(() => attempt(() => fail(new Error('unexpected')), rethrow)).toThrow(
      'unexpected',
    ));

  test('lets a rethrow from mapError reject an asynchronous call', async () => {
    const pending = attempt(async () => fail(new Error('unexpected')), rethrow);

    const outcome = await attempt(() => pending);

    expect(outcome.error?.message).toBe('unexpected');
  });
});
