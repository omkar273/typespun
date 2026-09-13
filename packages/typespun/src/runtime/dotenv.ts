import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import type { LoadConfigOptions } from '../schema.js';

export interface DotenvSource {
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface DotenvReadFailure {
  readonly path: string;
  readonly message: string;
}

export function readDotenvFiles<T>(
  envFiles: LoadConfigOptions<T>['envFiles'],
): {
  sources: readonly DotenvSource[];
  failures: readonly DotenvReadFailure[];
} {
  const sources: DotenvSource[] = [];
  const failures: DotenvReadFailure[] = [];

  for (const entry of envFiles ?? []) {
    const { path, optional } =
      typeof entry === 'string'
        ? { path: entry, optional: false }
        : { path: entry.path, optional: entry.optional === true };

    try {
      const parsed = parse(readFileSync(path, 'utf8'));
      const values = Object.assign(Object.create(null), parsed) as Record<
        string,
        string
      >;
      sources.push({ name: `dotenv:${path}`, values });
    } catch (error) {
      if (optional && isMissingFileError(error)) {
        continue;
      }

      failures.push({
        path,
        message: `Unable to read dotenv file: ${path}`,
      });
    }
  }

  return { sources, failures };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
