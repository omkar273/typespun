/**
 * Minimal, browser-safe path helpers for the emitter.
 *
 * The emitter has to run inside a browser bundle (playground, editor
 * integrations) where `node:path` is unavailable, so it uses these instead.
 * They mirror the subset of `node:path` the emitter relied on: `dirname`,
 * `extname` and `relative`. Results always use `/` separators, which is what an
 * ES module specifier needs anyway — previously the emitter joined
 * `node:path`'s platform separator back to `/` by hand.
 *
 * Backslashes count as separators only on Windows, matching `node:path`'s own
 * platform switch, so POSIX filenames containing a backslash keep working.
 */

/** True when the host is Node on Windows; false in browsers and on POSIX. */
function onWindows(): boolean {
  const runtime = (globalThis as { process?: { platform?: string } }).process;
  return runtime?.platform === 'win32';
}

/** The process working directory, or the root when there is no process. */
function workingDirectory(): string {
  const runtime = (globalThis as { process?: { cwd?: () => string } }).process;
  return normalizeSeparators(runtime?.cwd?.() ?? '/');
}

function normalizeSeparators(value: string): string {
  return onWindows() ? value.replace(/\\/g, '/') : value;
}

function isAbsolute(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//.test(value);
}

/**
 * Splits a path into its root (`/`, or `C:/` on Windows) and its segments,
 * collapsing `.` and `..`. Relative inputs are rooted at the working directory,
 * matching `path.relative`'s own use of `path.resolve`.
 */
function splitPath(value: string): { root: string; segments: string[] } {
  const separated = normalizeSeparators(value);
  const rooted = isAbsolute(separated)
    ? separated
    : `${workingDirectory()}/${separated}`;
  const drive = /^[A-Za-z]:\//.exec(rooted);
  const root = drive === null ? '/' : drive[0];
  const segments: string[] = [];
  for (const segment of rooted.slice(root.length).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return { root, segments };
}

/** Equivalent of `path.dirname`, always returning `/` separators. */
export function dirname(value: string): string {
  const separated = normalizeSeparators(value);
  const index = separated.lastIndexOf('/');
  if (index < 0) return '.';
  if (index === 0) return '/';
  return separated.slice(0, index);
}

/** Equivalent of `path.extname` for the file extensions the emitter sees. */
export function extname(value: string): string {
  const separated = normalizeSeparators(value);
  const base = separated.slice(separated.lastIndexOf('/') + 1);
  const index = base.lastIndexOf('.');
  return index <= 0 ? '' : base.slice(index);
}

/** Equivalent of `path.relative`, always returning `/` separators. */
export function relative(from: string, to: string): string {
  const origin = splitPath(from);
  const target = splitPath(to);
  if (origin.root !== target.root) {
    // Distinct Windows drives: no relative path exists, so `node:path` returns
    // the absolute target and so do we.
    return `${target.root}${target.segments.join('/')}`;
  }
  let shared = 0;
  while (
    shared < origin.segments.length &&
    shared < target.segments.length &&
    origin.segments[shared] === target.segments[shared]
  ) {
    shared++;
  }
  const ascent = Array.from(
    { length: origin.segments.length - shared },
    () => '..',
  );
  return [...ascent, ...target.segments.slice(shared)].join('/');
}
