import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  archiveEntries,
  archivedPackageJson,
  packArtifacts,
  removePackedArtifacts,
  type PackedArtifacts,
} from './pack.js';

let artifacts: PackedArtifacts | undefined;

beforeAll(async () => {
  artifacts = await packArtifacts();
});

afterAll(async () => await removePackedArtifacts(artifacts));

const packed = (): PackedArtifacts => {
  if (artifacts === undefined) {
    throw new Error('The package artifacts were not packed');
  }

  return artifacts;
};

describe('published package contents', () => {
  test.each([
    ['runtime', () => packed().runtime],
    ['code generator', () => packed().codegen],
  ])(
    '%s artifact contains built output without development inputs',
    (_name: string, path: () => string): void => {
      const entries = archiveEntries(path());

      expect(entries).toContain('package/package.json');
      expect(entries.some((entry) => entry.startsWith('package/dist/'))).toBe(
        true,
      );
      expect(
        entries.some(
          (entry) =>
            entry.startsWith('package/src/') ||
            entry.includes('.test.') ||
            entry.includes('/tests/') ||
            entry.includes('/.env') ||
            entry.endsWith('.yaml') ||
            entry.endsWith('.yml') ||
            (entry !== 'package/package.json' && entry.endsWith('.json')),
        ),
      ).toBe(false);
    },
  );

  test('packed manifests are public and use publishable dependencies', () => {
    const runtime = archivedPackageJson(packed().runtime);
    const codegen = archivedPackageJson(packed().codegen);
    const engines = { node: '>=22', bun: '>=1.4.1' };

    expect(runtime).not.toHaveProperty('private');
    expect(codegen).not.toHaveProperty('private');
    expect(codegen).toHaveProperty(
      ['dependencies', 'typespun'],
      runtime['version'],
    );
    expect(codegen).toHaveProperty(
      ['dependencies', 'typespun'],
      expect.not.stringMatching(/^workspace:/),
    );
    expect(Object.keys(runtime['dependencies'] ?? {})).toEqual(['dotenv']);
    expect(runtime).not.toHaveProperty(['dependencies', 'typescript']);
    expect(runtime).not.toHaveProperty(['dependencies', 'yaml']);
    expect(runtime).not.toHaveProperty(['dependencies', 'typespun-codegen']);
    expect(runtime).toHaveProperty('engines', engines);
    expect(codegen).toHaveProperty('engines', engines);
  });
});
