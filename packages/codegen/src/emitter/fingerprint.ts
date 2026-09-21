import { sha256Hex } from '../internal/sha256.js';

export interface FingerprintInput {
  readonly protocolVersion: number;
  readonly generatorVersion: string;
  readonly configuration: unknown;
  readonly analysis: unknown;
  readonly compiledDefaults: unknown;
}

export function createFingerprint(input: FingerprintInput): string {
  return sha256Hex(stableJson(input));
}

export function stableJson(value: unknown, space?: number): string {
  return escapeLineSeparators(JSON.stringify(canonicalize(value), null, space));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) {
        result[key] = canonicalize(value[key]);
      }
    }
    return result;
  }
  return value;
}

function escapeLineSeparators(value: string): string {
  return value.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
