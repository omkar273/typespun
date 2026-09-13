import type {
  FieldKind,
  GeneratedSchema,
  LoadConfigOptions,
} from './schema.js';
import { resolveConfig } from './runtime/resolve.js';

export type {
  DeepPartial,
  FieldKind,
  FieldSchema,
  GeneratedSchema,
  LoadConfigOptions,
} from './schema.js';

export { resolveConfig } from './runtime/resolve.js';

export function validateTypedValue(
  kind: FieldKind,
  value: unknown,
): string | undefined {
  switch (kind.type) {
    case 'string':
      return typeof value === 'string' ? undefined : 'Expected a string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? undefined
        : 'Expected a finite number';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'Expected a boolean';
    case 'enum':
      return typeof value === 'string' &&
        value !== '' &&
        kind.values.includes(value)
        ? undefined
        : `Expected one of: ${kind.values.join(', ')}`;
    case 'array':
      if (!Array.isArray(value)) {
        return `Expected an array of ${kind.element}`;
      }

      return value.every((item) => isArrayElement(kind.element, item))
        ? undefined
        : `Expected an array of ${kind.element}`;
  }
}

export function createLoader<T>(
  schema: GeneratedSchema,
): (options?: LoadConfigOptions<T>) => T {
  return (options) => resolveConfig<T>(schema, options);
}

function isArrayElement(
  element: 'string' | 'number' | 'boolean',
  value: unknown,
): boolean {
  if (element === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }

  return typeof value === element;
}
