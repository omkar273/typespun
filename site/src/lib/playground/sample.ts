import type { FieldIR } from './engine';

export const DEFAULT_ENV_PREFIX = 'APP';

export const SAMPLE_SOURCE = `/**
 * One interface in, one typed loader out.
 *
 * Mark the root with the typespun tag below, then annotate leaves with JSDoc:
 *
 *   env NAME    override the generated variable name
 *   default     inline JSON fallback, the lowest precedence source
 *   secret      never echo this value back in an error
 *   ignore      leave the property out of the schema entirely
 *
 * Edit anything here; the tabs on the right re-run as you type.
 *
 * @typespun
 */
export interface AppConfig {
  /** A literal union becomes a validated enum. */
  mode: 'development' | 'staging' | 'production';

  /** Nested objects flatten into APP_SERVER_HOST, APP_SERVER_PORT, ... */
  server: {
    host: string;
    /** @default 8080 */
    port: number;
  };

  /** Arrays are parsed as JSON: ["https://app.example.com"] */
  origins: string[];

  database: {
    /**
     * Reads DATABASE_URL, not APP_DATABASE_URL.
     *
     * @env DATABASE_URL
     * @secret
     */
    url: string;
    /** @default 10 */
    poolSize: number;
  };

  /**
   * Set APP_API_KEYS to something that is not a JSON array, then look at the
   * Live run tab: the message is redacted and the value is never echoed back.
   *
   * @secret
   */
  apiKeys: string[];

  /** An optional branch: required only once any part of it is supplied. */
  telemetry?: {
    endpoint: string;
    sampleRate: number;
  };
}
`;

/** A plausible value for a field, used to seed and reset the env editor. */
export function sampleValue(field: FieldIR): string {
  const leaf = field.propertyPath.at(-1) ?? '';
  switch (field.kind.type) {
    case 'enum':
      return field.kind.values[0] ?? '';
    case 'boolean':
      return 'true';
    case 'number':
      return leaf.toLowerCase().includes('port') ? '8080' : '10';
    case 'array':
      return field.kind.element === 'string'
        ? JSON.stringify(sampleStrings(leaf))
        : JSON.stringify(field.kind.element === 'number' ? [1, 2] : [true]);
    case 'string':
      return sampleString(leaf, field.secret);
  }
}

function sampleStrings(leaf: string): string[] {
  if (leaf.toLowerCase().includes('key')) {
    return ['sk_live_8f21c0b4a7', 'sk_live_44de9012ff'];
  }
  if (leaf.toLowerCase().includes('origin')) {
    return ['https://app.example.com', 'https://admin.example.com'];
  }
  return ['one', 'two'];
}

function sampleString(leaf: string, secret: boolean): string {
  const name = leaf.toLowerCase();
  if (name.includes('url'))
    return 'postgres://app:hunter2@db.internal:5432/app';
  if (name.includes('host')) return '0.0.0.0';
  if (name.includes('endpoint')) return 'https://otel.example.com/v1/traces';
  if (secret) return 's3cr3t-value-do-not-log';
  return 'example';
}

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** Produces the env map from the fields the current schema exposes. */
  build(fields: readonly FieldIR[]): Record<string, string>;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'valid',
    label: 'Everything set',
    hint: 'One well-formed value per variable — the loader returns a typed object.',
    build: (fields) =>
      Object.fromEntries(
        fields.map((field) => [field.envName, sampleValue(field)]),
      ),
  },
  {
    id: 'broken',
    label: 'Broken secret',
    hint: 'A bad number and a bad secret array — watch which one gets echoed back.',
    build: (fields) => {
      const env: Record<string, string> = {};
      for (const field of fields) {
        if (field.kind.type === 'number') {
          env[field.envName] = 'eight-thousand';
        } else if (field.secret && field.kind.type === 'array') {
          env[field.envName] = 'sk_live_8f21c0b4a7,sk_live_44de9012ff';
        } else {
          env[field.envName] = sampleValue(field);
        }
      }
      return env;
    },
  },
  {
    id: 'empty',
    label: 'Nothing set',
    hint: 'An empty environment — every required leaf without a default reports itself.',
    build: () => ({}),
  },
];
