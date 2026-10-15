import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const workspaceRoot = resolve(import.meta.dirname, '../..');

export interface PackedArtifacts {
  readonly directory: string;
  readonly runtime: string;
  readonly codegen: string;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

export const run = (
  command: readonly [string, ...string[]],
  cwd = workspaceRoot,
): string => {
  const [executable, ...args] = command;
  const result = spawnSync(executable, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `${command.join(' ')} failed (${result.status})\n${result.stdout}${result.stderr}`,
    );
  }

  return result.stdout;
};

export const packArtifacts = async (): Promise<PackedArtifacts> => {
  const directory = await mkdtemp(join(tmpdir(), 'typespun-pack-'));
  const runtime = join(directory, 'typespun.tgz');
  const codegen = join(directory, 'typespun-codegen.tgz');
  await mkdir(dirname(runtime), { recursive: true });

  run(
    ['bun', 'pm', 'pack', '--filename', runtime, '--ignore-scripts'],
    join(workspaceRoot, 'packages/typespun'),
  );
  run(
    ['bun', 'pm', 'pack', '--filename', codegen, '--ignore-scripts'],
    join(workspaceRoot, 'packages/codegen'),
  );

  return { directory, runtime, codegen };
};

export const removePackedArtifacts = async (
  artifacts: PackedArtifacts | undefined,
): Promise<void> => {
  if (artifacts !== undefined) {
    await rm(artifacts.directory, { recursive: true, force: true });
  }
};

export const archiveEntries = (path: string): readonly string[] =>
  run(['tar', '-tzf', path]).trim().split('\n').filter(Boolean);

export const archivedPackageJson = (
  path: string,
): Readonly<Record<string, unknown>> => {
  const manifest: unknown = JSON.parse(
    run(['tar', '-xOzf', path, 'package/package.json']),
  );

  if (!isRecord(manifest)) {
    throw new Error(`${path} does not contain a package.json object`);
  }

  return manifest;
};
