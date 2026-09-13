import { extname } from 'node:path';
import { parseDocument } from 'yaml';
import { validateTypedValue } from 'typespun/generated';
import type {
  FieldIR,
  SecretDefaultsPolicy,
  UnknownKeysPolicy,
} from '../contracts.js';

export interface DefaultsDocument {
  readonly path: string;
  readonly content: string;
}

export interface CompileDefaultsPolicies {
  readonly unknownKeys: UnknownKeysPolicy;
  readonly secretDefaults: SecretDefaultsPolicy;
}

export interface DefaultsDiagnostic {
  readonly code:
    | 'invalid_defaults_document'
    | 'invalid_default_value'
    | 'secret_default'
    | 'unknown_defaults_key'
    | 'unsafe_defaults_key';
  readonly path: string;
  readonly file: string;
  readonly message: string;
}

export interface CompiledDefaultsResult {
  readonly values: Readonly<Record<string, unknown>>;
  readonly warnings: readonly DefaultsDiagnostic[];
  readonly errors: readonly DefaultsDiagnostic[];
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALIAS_LIMIT = 20;

export function compileDefaults(
  document: DefaultsDocument,
  fields: readonly FieldIR[],
  policies: CompileDefaultsPolicies,
): CompiledDefaultsResult {
  const warnings: DefaultsDiagnostic[] = [];
  const errors: DefaultsDiagnostic[] = [];
  const values: Record<string, unknown> = {};
  const fieldByDefaultsPath = new Map(
    fields.map((field) => [toPathKey(field.defaultsPath), field]),
  );

  for (const field of fields) {
    if (field.hasDefault && field.defaultValue !== undefined) {
      if (
        !setValue(values, field.propertyPath, cloneValue(field.defaultValue))
      ) {
        errors.push(
          diagnostic(
            'unsafe_defaults_key',
            field.propertyPath,
            document.path,
            'Defaults path contains an unsafe key',
          ),
        );
      }
    }
  }

  const parsed = parseDefaultsDocument(document, errors);
  if (!isRecord(parsed)) {
    if (parsed !== undefined) {
      errors.push(
        diagnostic(
          'invalid_defaults_document',
          [],
          document.path,
          'Defaults document must contain an object at its root',
        ),
      );
    }
    return { values, warnings, errors };
  }

  collectUnsafeKeys(parsed, [], document.path, errors, new Set());
  walkDefaults(
    parsed,
    [],
    fieldByDefaultsPath,
    fields,
    policies,
    document.path,
    values,
    warnings,
    errors,
  );

  return { values, warnings, errors };
}

function parseDefaultsDocument(
  document: DefaultsDocument,
  errors: DefaultsDiagnostic[],
): unknown {
  if (extname(document.path) === '.json') {
    try {
      return JSON.parse(document.content);
    } catch {
      errors.push(
        diagnostic(
          'invalid_defaults_document',
          [],
          document.path,
          'Defaults document is not valid JSON',
        ),
      );
      return undefined;
    }
  }

  try {
    const parsed = parseDocument(document.content, {
      customTags: [],
      merge: false,
      prettyErrors: false,
      resolveKnownTags: false,
      schema: 'core',
      stringKeys: true,
      uniqueKeys: true,
    });
    if (parsed.errors.length > 0 || parsed.warnings.length > 0) {
      errors.push(
        diagnostic(
          'invalid_defaults_document',
          [],
          document.path,
          'Defaults document is not valid YAML',
        ),
      );
      return undefined;
    }
    return parsed.toJS({ maxAliasCount: ALIAS_LIMIT });
  } catch {
    errors.push(
      diagnostic(
        'invalid_defaults_document',
        [],
        document.path,
        'Defaults document is not valid YAML',
      ),
    );
    return undefined;
  }
}

function walkDefaults(
  value: Record<string, unknown>,
  path: readonly string[],
  fieldByDefaultsPath: ReadonlyMap<string, FieldIR>,
  fields: readonly FieldIR[],
  policies: CompileDefaultsPolicies,
  file: string,
  values: Record<string, unknown>,
  warnings: DefaultsDiagnostic[],
  errors: DefaultsDiagnostic[],
): void {
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }

    const field = fieldByDefaultsPath.get(toPathKey(childPath));
    if (field !== undefined) {
      compileField(
        field,
        child,
        childPath,
        policies,
        file,
        values,
        warnings,
        errors,
      );
      continue;
    }

    if (hasDefaultsDescendant(fields, childPath)) {
      if (!isRecord(child)) {
        errors.push(
          diagnostic(
            'invalid_default_value',
            childPath,
            file,
            'Expected an object for nested defaults',
          ),
        );
        continue;
      }
      walkDefaults(
        child,
        childPath,
        fieldByDefaultsPath,
        fields,
        policies,
        file,
        values,
        warnings,
        errors,
      );
      continue;
    }

    reportUnknownPath(childPath, policies.unknownKeys, file, warnings, errors);
  }
}

function collectUnsafeKeys(
  value: unknown,
  path: readonly string[],
  file: string,
  errors: DefaultsDiagnostic[],
  ancestors: Set<object>,
): void {
  if (!Array.isArray(value) && !isRecord(value)) {
    return;
  }

  if (ancestors.has(value)) {
    errors.push(
      diagnostic(
        'invalid_defaults_document',
        path,
        file,
        'Defaults document contains a recursive alias',
      ),
    );
    return;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      collectUnsafeKeys(
        child,
        [...path, String(index)],
        file,
        errors,
        ancestors,
      );
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (DANGEROUS_KEYS.has(key)) {
        errors.push(
          diagnostic(
            'unsafe_defaults_key',
            childPath,
            file,
            'Defaults path contains an unsafe key',
          ),
        );
      }
      collectUnsafeKeys(child, childPath, file, errors, ancestors);
    }
  }
  ancestors.delete(value);
}

function compileField(
  field: FieldIR,
  value: unknown,
  defaultsPath: readonly string[],
  policies: CompileDefaultsPolicies,
  file: string,
  values: Record<string, unknown>,
  warnings: DefaultsDiagnostic[],
  errors: DefaultsDiagnostic[],
): void {
  const validationMessage = validateTypedValue(field.kind, value);
  if (validationMessage !== undefined) {
    errors.push(
      diagnostic(
        'invalid_default_value',
        defaultsPath,
        file,
        validationMessage,
      ),
    );
    return;
  }

  if (field.secret) {
    if (policies.secretDefaults === 'error') {
      errors.push(
        diagnostic(
          'secret_default',
          defaultsPath,
          file,
          'Secret fields cannot have compiled defaults',
        ),
      );
      return;
    }
    if (policies.secretDefaults === 'warn') {
      warnings.push(
        diagnostic(
          'secret_default',
          defaultsPath,
          file,
          'Secret field has a compiled default',
        ),
      );
    }
  }

  if (!setValue(values, field.propertyPath, cloneValue(value))) {
    errors.push(
      diagnostic(
        'unsafe_defaults_key',
        defaultsPath,
        file,
        'Defaults path contains an unsafe key',
      ),
    );
  }
}

function reportUnknownPath(
  path: readonly string[],
  policy: UnknownKeysPolicy,
  file: string,
  warnings: DefaultsDiagnostic[],
  errors: DefaultsDiagnostic[],
): void {
  if (policy === 'ignore') {
    return;
  }

  const target = policy === 'warn' ? warnings : errors;
  target.push(
    diagnostic(
      'unknown_defaults_key',
      path,
      file,
      'Defaults path does not match a declared field',
    ),
  );
}

function hasDefaultsDescendant(
  fields: readonly FieldIR[],
  path: readonly string[],
): boolean {
  return fields.some(
    (field) =>
      field.defaultsPath.length > path.length &&
      path.every((part, index) => field.defaultsPath[index] === part),
  );
}

function setValue(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): boolean {
  if (path.length === 0 || path.some((part) => DANGEROUS_KEYS.has(part))) {
    return false;
  }

  let current = target;
  for (const [index, part] of path.entries()) {
    if (index === path.length - 1) {
      Object.defineProperty(current, part, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      return true;
    }

    const existing = current[part];
    if (isRecord(existing)) {
      current = existing;
      continue;
    }

    const next: Record<string, unknown> = {};
    Object.defineProperty(current, part, {
      configurable: true,
      enumerable: true,
      value: next,
      writable: true,
    });
    current = next;
  }

  return false;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (isRecord(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (!DANGEROUS_KEYS.has(key)) {
        Object.defineProperty(cloned, key, {
          configurable: true,
          enumerable: true,
          value: cloneValue(child),
          writable: true,
        });
      }
    }
    return cloned;
  }
  return value;
}

function diagnostic(
  code: DefaultsDiagnostic['code'],
  path: readonly string[],
  file: string,
  message: string,
): DefaultsDiagnostic {
  return { code, path: path.join('.'), file, message };
}

function toPathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
