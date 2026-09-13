import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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

afterAll(async () => {
  await removePackedArtifacts(artifacts);
});

describe('published package contents', () => {
  test.each([
    ['runtime', () => artifacts!.runtime],
    ['code generator', () => artifacts!.codegen],
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
    const runtime = archivedPackageJson(artifacts!.runtime);
    const codegen = archivedPackageJson(artifacts!.codegen);
    const codegenDependencies = codegen.dependencies as Record<string, string>;
    const runtimeDependencies = runtime.dependencies as Record<string, string>;

    expect(runtime.private).toBeUndefined();
    expect(codegen.private).toBeUndefined();
    expect(codegenDependencies.typespun).toBe('0.1.0');
    expect(codegenDependencies.typespun.startsWith('workspace:')).toBe(false);
    expect(Object.keys(runtimeDependencies)).toEqual(['dotenv']);
    expect(runtimeDependencies).not.toHaveProperty('typescript');
    expect(runtimeDependencies).not.toHaveProperty('yaml');
    expect(runtimeDependencies).not.toHaveProperty('typespun-codegen');
  });
});
