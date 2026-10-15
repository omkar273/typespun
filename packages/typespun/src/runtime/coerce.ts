import { type FieldKind, validateTypedValue } from '../schema.js';
import { attempt } from './attempt.js';

type CoerceResult = { value: unknown } | { error: string };

const typedResult = (kind: FieldKind, value: unknown): CoerceResult => {
  const error = validateTypedValue(kind, value);
  return error === undefined ? { value } : { error };
};

const jsonArrayExamples = {
  string: '["a","b"]',
  number: '[1,2]',
  boolean: '[true,false]',
} as const;

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
const jsonArrayError = (element: 'string' | 'number' | 'boolean'): string =>
  `Expected a JSON array of ${element}, for example ${jsonArrayExamples[element]}`;

// oxlint-disable-next-line typescript/consistent-return -- the switch is exhaustive; switch-exhaustiveness-check guards it
export const coerceEnvironmentValue = (
  kind: FieldKind,
  value: unknown,
): CoerceResult => {
  if (typeof value !== 'string') {
    return { error: 'Expected an environment string' };
  }

  switch (kind.type) {
    case 'string':
      return { value };
    case 'number':
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
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
      const parsed = attempt((): unknown => JSON.parse(value));
      return parsed.ok
        ? typedResult(kind, parsed.data)
        : { error: jsonArrayError(kind.element) };
  }
};

export const validateTypedCandidate = (
  kind: FieldKind,
  value: unknown,
): CoerceResult => typedResult(kind, value);
