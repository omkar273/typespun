export type FieldKind =
  | { type: 'string' }
  | { type: 'number' }
  | { type: 'boolean' }
  | { type: 'enum'; values: readonly string[] }
  | { type: 'array'; element: 'string' | 'number' | 'boolean' };

export interface FieldSchema {
  readonly propertyPath: readonly string[];
  readonly defaultsPath: readonly string[];
  readonly envName: string;
  readonly kind: FieldKind;
  readonly required: boolean;
  readonly secret: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue?: unknown;
  readonly optionalParents: readonly (readonly string[])[];
}

export interface GeneratedSchema {
  readonly protocolVersion: 1;
  readonly fields: readonly FieldSchema[];
  readonly compiledDefaults?: Readonly<Record<string, unknown>>;
}

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface LoadConfigOptions<T> {
  readonly envFiles?: readonly (
    | string
    | { readonly path: string; readonly optional?: boolean }
  )[];
  readonly source?: Readonly<Record<string, string | undefined>>;
  readonly overrides?: DeepPartial<T>;
}

export interface ConfigIssue {
  readonly code:
    | 'missing_value'
    | 'invalid_value'
    | 'unknown_override'
    | 'source_read_failed'
    | 'incompatible_schema';
  readonly path: string;
  readonly source?: string;
  readonly envKey?: string;
  readonly message: string;
  readonly received?: unknown;
}

export class ConfigError extends Error {
  readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    super('Configuration validation failed');
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

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

      for (let index = 0; index < value.length; index += 1) {
        if (
          !Object.hasOwn(value, index) ||
          !isArrayElement(kind.element, value[index])
        ) {
          return `Expected an array of ${kind.element}`;
        }
      }

      return undefined;
  }
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

/**
 * Renders a {@link ConfigError} as indented, human-readable lines suitable for
 * stderr. Every integration otherwise rewrites the same loop over `issues`.
 *
 * Secret-safe by construction rather than by care: the resolver already omits
 * `received` and replaces the message for fields marked secret, so there is
 * nothing here to redact. This formats what it is given.
 *
 * The returned string has no trailing newline, so the caller chooses.
 *
 * ```ts
 * try {
 *   loadConfig();
 * } catch (error) {
 *   if (error instanceof ConfigError) {
 *     console.error(formatConfigError(error));
 *     process.exit(1);
 *   }
 *   throw error;
 * }
 * ```
 */
export function formatConfigError(
  error: ConfigError,
  options: { readonly heading?: string } = {},
): string {
  const heading = options.heading ?? 'Configuration validation failed';
  const lines: string[] = [heading];

  for (const issue of error.issues) {
    const where = issue.envKey === undefined ? '' : ` (${issue.envKey})`;
    lines.push(`  ${issue.path}${where}: ${issue.message}`);
    if (issue.received !== undefined) {
      lines.push(`    received: ${formatReceived(issue.received)}`);
    }
  }

  return lines.join('\n');
}

function formatReceived(value: unknown): string {
  // JSON.stringify returns undefined for functions and symbols, and throws on
  // cyclic input. Neither should reach here, but a formatter that throws while
  // reporting an error is the worst possible failure mode.
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
