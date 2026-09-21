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
        return { error: jsonArrayError(kind.element) };
      }

      try {
        return typedResult(kind, JSON.parse(value));
      } catch {
        return { error: jsonArrayError(kind.element) };
      }
  }
}

/**
 * Environment values for array fields are JSON, not comma-separated. That is
 * the first thing most people try, so the message names the expected form
 * rather than only the expected type. Only reached for environment strings:
 * typed overrides and compiled defaults are validated by validateTypedValue,
 * whose message stays JSON-agnostic because those values are already parsed.
 *
 * Safe to be specific: resolve.ts replaces this message entirely for fields
 * marked secret, so nothing here can describe a secret value.
 */
function jsonArrayError(element: 'string' | 'number' | 'boolean'): string {
  const example =
    element === 'string'
      ? '["a","b"]'
      : element === 'number'
        ? '[1,2]'
        : '[true,false]';
  return `Expected a JSON array of ${element}, for example ${example}`;
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
