import { validateTypedValue } from '../generated.js';
import type { FieldKind } from '../schema.js';

export function coerceEnvironmentValue(
  kind: FieldKind,
  value: unknown,
): { value: unknown } | { error: string } {
  if (typeof value !== 'string') {
    return { error: 'Expected an environment string' };
  }

  switch (kind.type) {
    case 'string':
      return { value };
    case 'number':
      if (
        value === '' ||
        !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
      ) {
        return { error: 'Expected a finite number' };
      }

      return typedResult(kind, Number(value));
    case 'boolean':
      const normalized = value.toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        return { error: 'Expected a boolean' };
      }

      return { value: normalized === 'true' };
    case 'enum':
      return typedResult(kind, value);
    case 'array':
      if (value === '') {
        return { error: `Expected an array of ${kind.element}` };
      }

      try {
        return typedResult(kind, JSON.parse(value));
      } catch {
        return { error: `Expected an array of ${kind.element}` };
      }
  }
}

export function validateTypedCandidate(
  kind: FieldKind,
  value: unknown,
): { value: unknown } | { error: string } {
  return typedResult(kind, value);
}

function typedResult(
  kind: FieldKind,
  value: unknown,
): { value: unknown } | { error: string } {
  const error = validateTypedValue(kind, value);
  return error === undefined ? { value } : { error };
}
