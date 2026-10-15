const unsafeSegments = new Set(['__proto__', 'prototype', 'constructor']);

export interface OverrideEntry {
  readonly path: readonly string[];
  readonly value: unknown;
  readonly kind: 'value' | 'container' | 'cycle';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const nullPrototypeRecord = <T>(
  values: Readonly<Record<string, T>> = {},
): Record<string, T> => {
  const record = { ...values };
  Reflect.setPrototypeOf(record, null);
  return record;
};

export const hasUnsafePathSegment = (path: readonly string[]): boolean =>
  path.some((segment) => unsafeSegments.has(segment));

export const formatPath = (path: readonly string[]): string => path.join('.');

export const getOwnPath = (
  value: unknown,
  path: readonly string[],
): { found: boolean; value?: unknown } => {
  let current = value;

  for (const segment of path) {
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return { found: false };
    }

    current = current[segment];
  }

  return { found: true, value: current };
};

export const setOwnPath = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): boolean => {
  const leaf = path.at(-1);

  if (leaf === undefined || hasUnsafePathSegment(path)) {
    return false;
  }

  let current = target;

  for (const segment of path.slice(0, -1)) {
    const existing = current[segment];

    if (existing === undefined) {
      const child = nullPrototypeRecord<unknown>();
      current[segment] = child;
      current = child;
    } else if (isRecord(existing)) {
      current = existing;
    } else {
      return false;
    }
  }

  current[leaf] = value;
  return true;
};

export const collectOverrideEntries = (
  value?: unknown,
): readonly OverrideEntry[] => {
  const entries: OverrideEntry[] = [];
  const ancestors = new Set<object>();

  const visit = (current: unknown, path: readonly string[]): void => {
    if (!isRecord(current) || Array.isArray(current)) {
      if (path.length > 0 && current !== undefined) {
        entries.push({ path, value: current, kind: 'value' });
      }

      return;
    }

    if (ancestors.has(current)) {
      entries.push({ path, value: undefined, kind: 'cycle' });
      return;
    }

    const keys = Object.keys(current);

    if (keys.length === 0 && path.length > 0) {
      entries.push({ path, value: current, kind: 'container' });
      return;
    }

    ancestors.add(current);

    for (const key of keys) {
      visit(current[key], [...path, key]);
    }

    ancestors.delete(current);
  };

  visit(value, []);
  return entries;
};
