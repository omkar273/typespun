import { describe, expect, test } from 'vitest';
import {
  collectOverrideEntries,
  formatPath,
  getOwnPath,
  hasUnsafePathSegment,
  setOwnPath,
} from './object.js';

describe('path helpers', () => {
  test.each([
    [['server', 'port'], false],
    [['__proto__'], true],
    [['a', 'constructor'], true],
    [['a', 'prototype', 'b'], true],
    [[], false],
  ])('detects unsafe segments in %j', (path, expected) => {
    expect(hasUnsafePathSegment(path)).toBe(expected);
  });

  test('joins a path for display', () => {
    expect(formatPath(['server', 'port'])).toBe('server.port');
    expect(formatPath([])).toBe('');
  });
});

describe('getOwnPath', () => {
  test('reads a nested own value', () => {
    expect(getOwnPath({ server: { port: 8080 } }, ['server', 'port'])).toEqual({
      found: true,
      value: 8080,
    });
  });

  test('returns the root when the path is empty', () => {
    const value = { a: 1 };

    expect(getOwnPath(value, [])).toEqual({ found: true, value });
  });

  test.each([
    ['a missing key', { server: {} }, ['server', 'port']],
    ['a non-object on the way', { server: 'nope' }, ['server', 'port']],
    ['a primitive root', 'nope', ['server']],
    ['an inherited property', {}, ['toString']],
  ])('reports %s as not found', (_name, value, path) => {
    expect(getOwnPath(value, path)).toEqual({ found: false });
  });
});

describe('setOwnPath', () => {
  test('creates missing intermediate containers without a prototype', () => {
    const target: Record<string, unknown> = Object.create(null);

    expect(setOwnPath(target, ['server', 'tls', 'port'], 8443)).toBe(true);

    expect(target).toEqual({ server: { tls: { port: 8443 } } });
    expect(Object.getPrototypeOf(target['server'])).toBeNull();
  });

  test('reuses an existing container instead of replacing it', () => {
    const existing = { host: 'localhost' };
    const target: Record<string, unknown> = { server: existing };

    expect(setOwnPath(target, ['server', 'port'], 8080)).toBe(true);

    expect(target['server']).toBe(existing);
    expect(existing).toEqual({ host: 'localhost', port: 8080 });
  });

  test.each([
    ['an empty path', []],
    ['an unsafe segment', ['__proto__', 'polluted']],
    ['an unsafe leaf', ['server', 'constructor']],
  ])('refuses %s', (_name, path) => {
    const target: Record<string, unknown> = Object.create(null);

    expect(setOwnPath(target, path, 'value')).toBe(false);

    expect(Object.keys(target)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('refuses to descend through a non-object value', () => {
    const target: Record<string, unknown> = { server: 'already a string' };

    expect(setOwnPath(target, ['server', 'port'], 8080)).toBe(false);

    expect(target['server']).toBe('already a string');
  });
});

describe('collectOverrideEntries', () => {
  test('reports each leaf with its path', () => {
    const entries = collectOverrideEntries({
      server: { host: 'localhost', port: 8080 },
      debug: false,
    });

    expect(entries).toEqual([
      { path: ['server', 'host'], value: 'localhost', kind: 'value' },
      { path: ['server', 'port'], value: 8080, kind: 'value' },
      { path: ['debug'], value: false, kind: 'value' },
    ]);
  });

  test('treats an array as a leaf value rather than a container', () => {
    expect(collectOverrideEntries({ origins: ['a', 'b'] })).toEqual([
      { path: ['origins'], value: ['a', 'b'], kind: 'value' },
    ]);
  });

  test('reports an empty object as a container', () => {
    expect(collectOverrideEntries({ server: {} })).toEqual([
      { path: ['server'], value: {}, kind: 'container' },
    ]);
  });

  test('ignores undefined leaves and the root itself', () => {
    expect(collectOverrideEntries({ port: undefined })).toEqual([]);
    expect(collectOverrideEntries({})).toEqual([]);
    expect(collectOverrideEntries(undefined)).toEqual([]);
  });

  test('reports a cycle instead of recursing forever', () => {
    const cyclic: Record<string, unknown> = { server: {} };
    (cyclic['server'] as Record<string, unknown>)['self'] = cyclic;

    expect(collectOverrideEntries(cyclic)).toEqual([
      { path: ['server', 'self'], value: undefined, kind: 'cycle' },
    ]);
  });

  test('revisits a shared branch that is not a cycle', () => {
    const shared = { port: 8080 };

    expect(collectOverrideEntries({ a: shared, b: shared })).toEqual([
      { path: ['a', 'port'], value: 8080, kind: 'value' },
      { path: ['b', 'port'], value: 8080, kind: 'value' },
    ]);
  });
});
