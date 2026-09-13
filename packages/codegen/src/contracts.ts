import type { FieldKind, FieldSchema } from 'typespun/generated';

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface Diagnostic {
  readonly code: string;
  readonly message: string;
  readonly location: SourceLocation;
  readonly suggestion?: string;
}

export interface FieldIR extends FieldSchema {
  readonly location: SourceLocation;
  readonly kind: FieldKind;
}

export interface AnalyzeResult {
  readonly fields: readonly FieldIR[];
  readonly diagnostics: readonly Diagnostic[];
}

export type UnknownKeysPolicy = 'error' | 'warn' | 'ignore';

export type SecretDefaultsPolicy = 'warn' | 'allow' | 'error';
