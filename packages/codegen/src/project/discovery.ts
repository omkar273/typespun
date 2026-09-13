import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONVENTIONAL_INPUTS = [
  'src/config.ts',
  'src/config.mts',
  'src/config.cts',
] as const;

export const CONVENTIONAL_DEFAULTS = [
  'config.yaml',
  'config.yml',
  'config.json',
  'config/config.yaml',
  'config/config.yml',
  'config/config.json',
  'src/config.yaml',
  'src/config.yml',
  'src/config.json',
] as const;

export class ProjectDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectDiscoveryError';
  }
}

export function discoverInputPath(projectDirectory: string): string {
  const candidates = findExistingCandidates(
    projectDirectory,
    CONVENTIONAL_INPUTS,
  );

  if (candidates.length !== 1) {
    throw new ProjectDiscoveryError(
      `Expected exactly one conventional input, found ${candidates.length}.`,
    );
  }

  return candidates[0]!;
}

export function discoverDefaultsPath(
  projectDirectory: string,
): string | undefined {
  const candidates = findExistingCandidates(
    projectDirectory,
    CONVENTIONAL_DEFAULTS,
  );

  if (candidates.length > 1) {
    throw new ProjectDiscoveryError(
      `Multiple conventional defaults files found: ${candidates.join(', ')}. Configure defaults.path explicitly.`,
    );
  }

  return candidates[0];
}

export function findNearestTsconfig(inputPath: string): string | undefined {
  let directory = dirname(resolve(inputPath));

  while (true) {
    const candidate = join(directory, 'tsconfig.json');
    if (isFile(candidate)) {
      return candidate;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function findExistingCandidates(
  projectDirectory: string,
  candidates: readonly string[],
): string[] {
  const root = resolve(projectDirectory);
  return candidates
    .map((candidate) => join(root, candidate))
    .filter((candidate) => isFile(candidate));
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}
