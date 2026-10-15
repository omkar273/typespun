import { sha256Hex } from '../internal/sha256.js';

export interface FingerprintInput {
  readonly protocolVersion: number;
  readonly generatorVersion: string;
  readonly configuration: unknown;
  readonly analysis: unknown;
  readonly compiledDefaults: unknown;
}

export const createFingerprint = (input: FingerprintInput): string =>
  sha256Hex(stableJson(input));

export const stableJson = (value: unknown, space?: number): string =>
  escapeLineSeparators(JSON.stringify(canonicalize(value), null, space));

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (isRecord(value)) {
    const result: Record<string, unknown> = {};

    const keys = Object.keys(value);
    keys.sort();

    for (const key of keys) {
      if (value[key] !== undefined) {
        result[key] = canonicalize(value[key]);
      }
    }

    return result;
  }

  return value;
};

const escapeLineSeparators = (value: string): string =>
  value.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
