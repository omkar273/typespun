import type { GeneratedSchema, LoadConfigOptions } from './schema.js';
import { resolveConfig } from './runtime/resolve.js';

export type {
  DeepPartial,
  FieldKind,
  FieldSchema,
  GeneratedSchema,
  LoadConfigOptions,
} from './schema.js';

export { resolveConfig } from './runtime/resolve.js';

/** Re-exported for ABI compatibility; the canonical home is `typespun/schema`. */
export { validateTypedValue } from './schema.js';

export function createLoader<T>(
  schema: GeneratedSchema,
): (options?: LoadConfigOptions<T>) => T {
  return (options) => resolveConfig<T>(schema, options);
}
