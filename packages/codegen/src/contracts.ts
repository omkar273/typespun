import type { FieldKind, FieldSchema } from 'typespun/schema';

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

export type RootExport =
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'default' };

export interface AnalyzeResult {
  readonly inputPath: string;
  readonly rootName?: string;
  /** The import binding for the selected root, present on successful analysis. */
  readonly rootExport?: RootExport;
  readonly fields: readonly FieldIR[];
  readonly diagnostics: readonly Diagnostic[];
}

export type UnknownKeysPolicy = 'error' | 'warn' | 'ignore';

export type SecretDefaultsPolicy = 'warn' | 'allow' | 'error';
