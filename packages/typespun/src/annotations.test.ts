import { describe, expect, test } from 'vitest';
import { Config, Default, Env, Ignore, Key, Secret } from './annotations.js';

describe('inert annotations', () => {
  test('do not replace or mutate decorated values', () => {
    class Example {}
    const context = { kind: 'class', name: 'Example' } as const;

    expect(Config()(Example, context)).toBeUndefined();
    expect(
      Default('value')(undefined, { kind: 'field', name: 'value' }),
    ).toBeUndefined();
    expect(
      Env('PORT')(undefined, { kind: 'field', name: 'port' }),
    ).toBeUndefined();
    expect(
      Ignore()(undefined, { kind: 'field', name: 'ignored' }),
    ).toBeUndefined();
    expect(
      Key('renamed')(undefined, { kind: 'field', name: 'key' }),
    ).toBeUndefined();
    expect(
      Secret()(undefined, { kind: 'field', name: 'token' }),
    ).toBeUndefined();
    expect(Example).toEqual(Example);
  });
});
