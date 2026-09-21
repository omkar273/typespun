import { describe, expect, test } from 'vitest';
import { createFingerprint } from './fingerprint.js';

describe('schema fingerprints', () => {
  test('is insensitive to object insertion order', () => {
    const first = createFingerprint({
      protocolVersion: 1,
      generatorVersion: '1.2.3',
      configuration: {
        output: 'src/generated/typespun.ts',
        input: 'src/config.ts',
      },
      analysis: { fields: [{ envName: 'PORT', required: true }] },
      compiledDefaults: { server: { port: 3000, host: 'localhost' } },
    });
    const second = createFingerprint({
      compiledDefaults: { server: { host: 'localhost', port: 3000 } },
      analysis: { fields: [{ required: true, envName: 'PORT' }] },
      configuration: {
        input: 'src/config.ts',
        output: 'src/generated/typespun.ts',
      },
      generatorVersion: '1.2.3',
      protocolVersion: 1,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test('changes when any output-affecting input changes', () => {
    const base = {
      protocolVersion: 1 as const,
      generatorVersion: '1.2.3',
      configuration: { input: 'src/config.ts' },
      analysis: { fields: [] },
      compiledDefaults: {},
    };

    expect(createFingerprint(base)).not.toBe(
      createFingerprint({ ...base, generatorVersion: '1.2.4' }),
    );
    expect(createFingerprint(base)).not.toBe(
      createFingerprint({ ...base, compiledDefaults: { port: 3000 } }),
    );
  });
});
