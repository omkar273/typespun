import { posix } from 'node:path';
import { describe, expect, test } from 'vitest';
import { dirname, extname, relative } from './path.js';

/**
 * POSIX-style paths where these helpers are meant to be indistinguishable from
 * `node:path/posix`, so `posix` can act as an oracle for them.
 *
 * Paths with a trailing separator are deliberately absent: `node:path` strips
 * the trailing separator before taking the parent, these helpers do not (see
 * the trailing-separator test below), so the two genuinely disagree there and
 * cross-checking would assert the wrong thing.
 */
const posixPaths = [
  '/project/src/config.ts',
  '/project/src/generated/typespun.ts',
  '/project/src/config.mts',
  '/project/typespun.ts',
  '/project/a/b/c/d.ts',
  '/config.ts',
  '/project/src/.gitignore',
  '/project/src/archive.tar.gz',
  '/project/my.dir/plain',
  '/project',
  '/',
  'config.ts',
  'src/config.ts',
  './src/../src/config.ts',
  '../sibling/config.ts',
];

describe('dirname', () => {
  test('returns the parent directory of a nested file', () => {
    expect(dirname('/project/src/generated/typespun.ts')).toBe(
      '/project/src/generated',
    );
  });

  test('returns "." for a single-segment path with no separator', () => {
    expect(dirname('config.ts')).toBe('.');
  });

  test('returns "/" for a file sitting directly at the root', () => {
    expect(dirname('/config.ts')).toBe('/');
  });

  test('returns "/" for the root itself', () => {
    expect(dirname('/')).toBe('/');
  });

  test('keeps a relative prefix instead of resolving it', () => {
    expect(dirname('./src/config.ts')).toBe('./src');
  });

  test('treats a trailing separator as the end of the path, so the directory is its own parent', () => {
    // Intentional difference from `node:path`, which strips the trailing
    // separator first and answers '/project'. The emitter only ever passes
    // module file paths, which never end in a separator.
    expect(dirname('/project/src/')).toBe('/project/src');
    expect(posix.dirname('/project/src/')).toBe('/project');
  });

  test('treats a backslash as an ordinary filename character on POSIX', () => {
    expect(dirname('/project/src/od\\d.ts')).toBe('/project/src');
  });

  test.each(posixPaths)('agrees with node:path/posix for %s', (path) => {
    expect(dirname(path)).toBe(posix.dirname(path));
  });
});

describe('extname', () => {
  test('returns the extension of an ordinary file', () => {
    expect(extname('/project/src/config.ts')).toBe('.ts');
  });

  test('returns an empty extension when the basename has no dot', () => {
    expect(extname('/project/src/LICENSE')).toBe('');
  });

  test('returns an empty extension for a dotfile, whose dot starts the name', () => {
    expect(extname('/project/.gitignore')).toBe('');
    expect(extname('.gitignore')).toBe('');
  });

  test('returns only the final extension when the name has several dots', () => {
    expect(extname('/project/archive.tar.gz')).toBe('.gz');
  });

  test('ignores dots that belong to a parent directory segment', () => {
    expect(extname('/project/my.dir/plain')).toBe('');
  });

  test('returns a bare dot for a name that ends in one', () => {
    expect(extname('config.')).toBe('.');
  });

  test.each(posixPaths)('agrees with node:path/posix for %s', (path) => {
    expect(extname(path)).toBe(posix.extname(path));
  });
});

describe('relative', () => {
  test('returns an empty path between identical paths', () => {
    expect(relative('/project/src', '/project/src')).toBe('');
  });

  test('steps out of the source and into a sibling in the same directory', () => {
    expect(relative('/project/src/a', '/project/src/b')).toBe('../b');
  });

  test('descends without any leading dots when the target is below the source', () => {
    expect(relative('/project', '/project/src/generated/typespun.ts')).toBe(
      'src/generated/typespun.ts',
    );
  });

  test('ascends with one ".." per level when the target is above the source', () => {
    expect(relative('/project/src/generated', '/project')).toBe('../..');
  });

  test('ascends to the shared ancestor and then descends to the target', () => {
    expect(relative('/project/src/generated', '/project/types/env.d.ts')).toBe(
      '../../types/env.d.ts',
    );
  });

  test('walks all the way up to the root when nothing but the root is shared', () => {
    expect(relative('/a/b/c', '/x/y')).toBe('../../../x/y');
  });

  test('collapses "." and ".." segments in either argument before comparing', () => {
    expect(relative('/project/./src', '/project/src/./generated')).toBe(
      'generated',
    );
    expect(relative('/project/src/generated/..', '/project/src/a.ts')).toBe(
      'a.ts',
    );
    expect(relative('/project/src/..', '/project/./src/a.ts')).toBe('src/a.ts');
  });

  test('pops harmlessly at the root when ".." segments outrun the path', () => {
    expect(relative('/../..', '/project')).toBe('project');
  });

  test('resolves relative arguments against the working directory', () => {
    const cwd = process.cwd();
    expect(relative('src/a', 'src/b')).toBe('../b');
    expect(relative('src/a', 'src/b')).toBe(
      relative(`${cwd}/src/a`, `${cwd}/src/b`),
    );
    expect(relative('.', 'src/config.ts')).toBe('src/config.ts');
    expect(relative('src/config.ts', cwd)).toBe('../..');
  });

  test('mixes a relative argument with an absolute one through the working directory', () => {
    const cwd = process.cwd();
    expect(relative(`${cwd}/src`, 'src/config.ts')).toBe('config.ts');
    expect(relative('src', `${cwd}/src/config.ts`)).toBe('config.ts');
  });

  test('returns the target segments joined when the two paths have different roots', () => {
    // Distinct Windows drives share no root, so no relative path exists.
    expect(relative('C:/x/y', 'D:/a/b')).toBe('D:/a/b');
    expect(relative('D:/a/b', 'C:/x/y')).toBe('C:/x/y');
  });

  test('treats a drive-letter path as absolute rather than resolving it against the working directory', () => {
    expect(relative('C:/project/src', 'C:/project/types/env.d.ts')).toBe(
      '../types/env.d.ts',
    );
    expect(relative('C:/project', 'C:/project/src/config.ts')).toBe(
      'src/config.ts',
    );
  });

  test.each(
    posixPaths.flatMap((from) => posixPaths.map((to) => [from, to] as const)),
  )('agrees with node:path/posix from %s to %s', (from, to) => {
    expect(relative(from, to)).toBe(posix.relative(from, to));
  });
});
