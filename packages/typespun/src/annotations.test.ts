import { describe, expect, test, vi } from 'vitest';
import { Config, Default, Env, Ignore, Key, Secret } from './annotations.js';

const expectInert = (
  decorator: ReturnType<typeof Config>,
  target: unknown,
  context: object,
) => {
  const decorate = vi.fn(decorator);
  decorate(target, context);
  expect(decorate.mock.results).toEqual([{ type: 'return', value: undefined }]);
};

describe('inert annotations', () => {
  test('do not replace or mutate decorated values', () => {
    class Example {
      readonly marker = true;
    }

    expectInert(Config(), Example, { kind: 'class', name: 'Example' });
    expectInert(Default('value'), undefined, { kind: 'field', name: 'value' });
    expectInert(Env('PORT'), undefined, { kind: 'field', name: 'port' });
    expectInert(Ignore(), undefined, { kind: 'field', name: 'ignored' });
    expectInert(Key('renamed'), undefined, { kind: 'field', name: 'key' });
    expectInert(Secret(), undefined, { kind: 'field', name: 'token' });
    expect(new Example()).toEqual({ marker: true });
  });
});
