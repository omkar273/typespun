import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { attempt } from '../internal/attempt.js';

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

const isExistingFile = (path: string): boolean => {
  const found = attempt(() => existsSync(path) && statSync(path).isFile());

  return found.ok && found.data;
};

const findExistingCandidates = (
  projectDirectory: string,
  candidates: readonly string[],
): string[] => {
  const root = resolve(projectDirectory);
  return candidates
    .map((candidate) => join(root, candidate))
    .filter((candidate) => isExistingFile(candidate));
};

export const discoverInputPath = (projectDirectory: string): string => {
  const candidates = findExistingCandidates(
    projectDirectory,
    CONVENTIONAL_INPUTS,
  );
  const [input, ...others] = candidates;

  if (input === undefined || others.length > 0) {
    throw new ProjectDiscoveryError(
      `Expected exactly one conventional input, found ${candidates.length}.`,
    );
  }

  return input;
};

export const discoverDefaultsPath = (
  projectDirectory: string,
): string | undefined => {
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
};

export const findNearestTsconfig = (inputPath: string): string | undefined => {
  const directory = dirname(resolve(inputPath));
  const candidate = join(directory, 'tsconfig.json');

  if (isExistingFile(candidate)) {
    return candidate;
  }

  return dirname(directory) === directory
    ? undefined
    : findNearestTsconfig(directory);
};
