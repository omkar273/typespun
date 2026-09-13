const unsafeSegments = new Set(['__proto__', 'prototype', 'constructor']);

export interface OverrideEntry {
  readonly path: readonly string[];
  readonly value: unknown;
}

export function hasUnsafePathSegment(path: readonly string[]): boolean {
  return path.some((segment) => unsafeSegments.has(segment));
}

export function formatPath(path: readonly string[]): string {
  return path.join('.');
}

export function getOwnPath(
  value: unknown,
  path: readonly string[],
): { found: boolean; value?: unknown } {
  let current = value;

  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}

export function setOwnPath(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): boolean {
  if (path.length === 0 || hasUnsafePathSegment(path)) {
    return false;
  }

  let current = target;
  for (const segment of path.slice(0, -1)) {
    const existing = current[segment];
    if (existing === undefined) {
      const child = Object.create(null) as Record<string, unknown>;
      current[segment] = child;
      current = child;
    } else if (isRecord(existing)) {
      current = existing;
    } else {
      return false;
    }
  }

  current[path[path.length - 1]!] = value;
  return true;
}

export function collectOverrideEntries(
  value: unknown,
): readonly OverrideEntry[] {
  const entries: OverrideEntry[] = [];
  visit(value, [], entries);
  return entries;
}

function visit(
  value: unknown,
  path: readonly string[],
  entries: OverrideEntry[],
): void {
  if (!isRecord(value) || Array.isArray(value)) {
    if (path.length > 0 && value !== undefined) {
      entries.push({ path, value });
    }
    return;
  }

  const keys = Object.keys(value);
  if (keys.length === 0 && path.length > 0) {
    entries.push({ path, value });
    return;
  }

  for (const key of keys) {
    visit(value[key], [...path, key], entries);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
