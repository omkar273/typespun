import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import type { LoadConfigOptions } from '../schema.js';
import { attempt } from './attempt.js';
import { nullPrototypeRecord } from './object.js';

export interface DotenvSource {
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface DotenvReadFailure {
  readonly path: string;
  readonly message: string;
}

const isMissingFileError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

export const readDotenvFiles = (
  envFiles: LoadConfigOptions<unknown>['envFiles'],
): {
  sources: readonly DotenvSource[];
  failures: readonly DotenvReadFailure[];
} => {
  const sources: DotenvSource[] = [];
  const failures: DotenvReadFailure[] = [];

  for (const entry of envFiles ?? []) {
    const { path, optional } =
      typeof entry === 'string'
        ? { path: entry, optional: false }
        : { path: entry.path, optional: entry.optional === true };
    const read = attempt(
      () => parse(readFileSync(path, 'utf8')),
      (thrown) => thrown,
    );

    if (read.ok) {
      sources.push({
        name: `dotenv:${path}`,
        values: nullPrototypeRecord(read.data),
      });
      continue;
    }

    if (optional && isMissingFileError(read.error)) {
      continue;
    }

    failures.push({
      path,
      message: `Unable to read dotenv file: ${path}`,
    });
  }

  return { sources, failures };
};
