import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Scaffolding for CLI tests that need a throwaway project on a real disk. */

const temporaryDirectories: string[] = [];

export const validInterface = `/** @typespun */
export interface AppConfig { port: number }
`;

export async function makeDirectory(prefix = 'typespun-cli-'): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}

export async function removeTemporaryDirectories(): Promise<void> {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
}

export async function createBareProject(
  packageFields: Record<string, unknown> = {},
): Promise<string> {
  const path = await makeDirectory();
  await writeProjectFile(
    path,
    'package.json',
    `${JSON.stringify({ name: 'fixture', private: true, type: 'module', ...packageFields }, null, 2)}\n`,
  );
  await writeProjectFile(
    path,
    'tsconfig.json',
    `${JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true }, include: ['src/**/*.ts'] }, null, 2)}\n`,
  );
  return path;
}

export async function createProject(
  schema: string = validInterface,
  packageFields: Record<string, unknown> = {},
): Promise<string> {
  const path = await createBareProject(packageFields);
  await writeProjectFile(path, 'src/config.ts', schema);
  return path;
}

export async function writeProjectFile(
  project: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const path = join(project, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/** Makes `typespun` and `typespun-codegen` resolvable from inside a fixture. */
export async function linkWorkspaceDependencies(
  project: string,
): Promise<void> {
  const repository = join(import.meta.dirname, '..', '..', '..', '..');
  await mkdir(join(project, 'node_modules'), { recursive: true });
  await symlink(
    join(repository, 'packages/typespun'),
    join(project, 'node_modules/typespun'),
  );
  await symlink(
    join(repository, 'packages/codegen'),
    join(project, 'node_modules/typespun-codegen'),
  );
}

export interface CapturedStreams {
  readonly streams: {
    readonly stdout: { write(value: string): unknown; readonly isTTY: boolean };
    readonly stderr: { write(value: string): unknown; readonly isTTY: boolean };
  };
  stdout(): string;
  stderr(): string;
}

/** Collects what the CLI writes instead of letting it reach the real process. */
export function captureStreams(isTTY = false): CapturedStreams {
  let out = '';
  let err = '';
  return {
    streams: {
      stdout: {
        isTTY,
        write: (value: string) => {
          out += value;
          return true;
        },
      },
      stderr: {
        isTTY,
        write: (value: string) => {
          err += value;
          return true;
        },
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}
