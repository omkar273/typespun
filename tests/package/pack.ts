import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const workspaceRoot = resolve(import.meta.dir, '../..');

export interface PackedArtifacts {
  readonly directory: string;
  readonly runtime: string;
  readonly codegen: string;
}

export async function packArtifacts(): Promise<PackedArtifacts> {
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
}

export async function removePackedArtifacts(
  artifacts: PackedArtifacts | undefined,
): Promise<void> {
  if (artifacts !== undefined) {
    await rm(artifacts.directory, { recursive: true, force: true });
  }
}

export function archiveEntries(path: string): readonly string[] {
  return run(['tar', '-tzf', path]).trim().split('\n').filter(Boolean);
}

export function archivedPackageJson(
  path: string,
): Readonly<Record<string, unknown>> {
  return JSON.parse(run(['tar', '-xOzf', path, 'package/package.json']));
}

export function run(command: readonly string[], cwd = workspaceRoot): string {
  const result = Bun.spawnSync(command, {
    cwd,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(' ')} failed (${result.exitCode})\n${result.stdout.toString()}${result.stderr.toString()}`,
    );
  }
  return result.stdout.toString();
}
