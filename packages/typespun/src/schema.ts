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
