import { extname } from 'node:path';
import { parseDocument } from 'yaml';
import { validateTypedValue } from 'typespun/schema';
import type {
  FieldIR,
  SecretDefaultsPolicy,
  UnknownKeysPolicy,
} from '../contracts.js';
import { attempt } from '../internal/attempt.js';

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

interface CompileContext {
  readonly fields: readonly FieldIR[];
  readonly fieldByDefaultsPath: ReadonlyMap<string, FieldIR>;
  readonly policies: CompileDefaultsPolicies;
  readonly file: string;
  readonly values: Record<string, unknown>;
  readonly warnings: DefaultsDiagnostic[];
  readonly errors: DefaultsDiagnostic[];
  readonly compiledPaths: Set<string>;
}

interface UnsafeKeyScan {
  readonly file: string;
  readonly errors: DefaultsDiagnostic[];
  readonly ancestors: Set<object>;
}

interface DiagnosticInput {
  readonly code: DefaultsDiagnostic['code'];
  readonly path: readonly string[];
  readonly file: string;
  readonly message: string;
}

interface FieldDefault {
  readonly field: FieldIR;
  readonly value: unknown;
  readonly defaultsPath: readonly string[];
}

const diagnostic = ({
  code,
  path,
  file,
  message,
}: DiagnosticInput): DefaultsDiagnostic => ({
  code,
  path: path.join('.'),
  file,
  message,
});

const toPathKey = (path: readonly string[]): string => JSON.stringify(path);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseDefaultsDocument = (
  document: DefaultsDocument,
  errors: DefaultsDiagnostic[],
): unknown => {
  if (extname(document.path) === '.json') {
    const json = attempt((): unknown => JSON.parse(document.content));

    if (json.ok) {
      return json.data;
    }

    errors.push(
      diagnostic({
        code: 'invalid_defaults_document',
        path: [],
        file: document.path,
        message: 'Defaults document is not valid JSON',
      }),
    );
    return undefined;
  }

  const yaml = attempt((): unknown => {
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
      throw new Error('invalid YAML');
    }

    return parsed.toJS({ maxAliasCount: ALIAS_LIMIT });
  });

  if (yaml.ok) {
    return yaml.data;
  }

  errors.push(
    diagnostic({
      code: 'invalid_defaults_document',
      path: [],
      file: document.path,
      message: 'Defaults document is not valid YAML',
    }),
  );
  return undefined;
};

const hasDefaultsDescendant = (
  fields: readonly FieldIR[],
  path: readonly string[],
): boolean =>
  fields.some(
    (field) =>
      field.defaultsPath.length > path.length &&
      path.every((part, index) => field.defaultsPath[index] === part),
  );

const setValue = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): boolean => {
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
};

const cloneValue = (value: unknown): unknown => {
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
};

const reportUnknownPath = (
  context: CompileContext,
  path: readonly string[],
): void => {
  const policy = context.policies.unknownKeys;

  if (policy === 'ignore') {
    return;
  }

  const target = policy === 'warn' ? context.warnings : context.errors;
  target.push(
    diagnostic({
      code: 'unknown_defaults_key',
      path,
      file: context.file,
      message: 'Defaults path does not match a declared field',
    }),
  );
};

const compileField = (
  context: CompileContext,
  { field, value, defaultsPath }: FieldDefault,
): void => {
  const { policies, file, values, warnings, errors } = context;
  context.compiledPaths.add(toPathKey(field.propertyPath));
  const validationMessage = validateTypedValue(field.kind, value);

  if (validationMessage !== undefined) {
    errors.push(
      diagnostic({
        code: 'invalid_default_value',
        path: defaultsPath,
        file,
        message: field.secret
          ? 'Secret default does not match its declared field type'
          : validationMessage,
      }),
    );
    return;
  }

  if (field.secret) {
    if (policies.secretDefaults === 'error') {
      errors.push(
        diagnostic({
          code: 'secret_default',
          path: defaultsPath,
          file,
          message: 'Secret fields cannot have compiled defaults',
        }),
      );
      return;
    }

    if (policies.secretDefaults === 'warn') {
      warnings.push(
        diagnostic({
          code: 'secret_default',
          path: defaultsPath,
          file,
          message: 'Secret field has a compiled default',
        }),
      );
    }
  }

  if (!setValue(values, field.propertyPath, cloneValue(value))) {
    errors.push(
      diagnostic({
        code: 'unsafe_defaults_key',
        path: defaultsPath,
        file,
        message: 'Defaults path contains an unsafe key',
      }),
    );
  }
};

const walkDefaults = (
  context: CompileContext,
  value: Record<string, unknown>,
  path: readonly string[],
): void => {
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];

    if (DANGEROUS_KEYS.has(key)) {
      continue;
    }

    const field = context.fieldByDefaultsPath.get(toPathKey(childPath));

    if (field !== undefined) {
      compileField(context, { field, value: child, defaultsPath: childPath });
      continue;
    }

    if (hasDefaultsDescendant(context.fields, childPath)) {
      if (!isRecord(child)) {
        context.errors.push(
          diagnostic({
            code: 'invalid_default_value',
            path: childPath,
            file: context.file,
            message: 'Expected an object for nested defaults',
          }),
        );
        continue;
      }

      walkDefaults(context, child, childPath);
      continue;
    }

    reportUnknownPath(context, childPath);
  }
};

const collectUnsafeKeys = (
  scan: UnsafeKeyScan,
  value: unknown,
  path: readonly string[],
): void => {
  if (!Array.isArray(value) && !isRecord(value)) {
    return;
  }

  if (scan.ancestors.has(value)) {
    scan.errors.push(
      diagnostic({
        code: 'invalid_defaults_document',
        path,
        file: scan.file,
        message: 'Defaults document contains a recursive alias',
      }),
    );
    return;
  }

  scan.ancestors.add(value);

  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      collectUnsafeKeys(scan, child, [...path, String(index)]);
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];

      if (DANGEROUS_KEYS.has(key)) {
        scan.errors.push(
          diagnostic({
            code: 'unsafe_defaults_key',
            path: childPath,
            file: scan.file,
            message: 'Defaults path contains an unsafe key',
          }),
        );
      }

      collectUnsafeKeys(scan, child, childPath);
    }
  }

  scan.ancestors.delete(value);
};

const applyInlineDefaults = (context: CompileContext): void => {
  const { policies, values, warnings, errors } = context;

  for (const field of context.fields) {
    const hasInlineDefault =
      field.hasDefault && field.defaultValue !== undefined;

    if (
      !hasInlineDefault ||
      context.compiledPaths.has(toPathKey(field.propertyPath))
    ) {
      continue;
    }

    if (field.secret) {
      if (policies.secretDefaults === 'error') {
        errors.push(
          diagnostic({
            code: 'secret_default',
            path: field.defaultsPath,
            file: field.location.file,
            message: 'Secret fields cannot have inline defaults',
          }),
        );
        continue;
      }

      if (policies.secretDefaults === 'warn') {
        warnings.push(
          diagnostic({
            code: 'secret_default',
            path: field.defaultsPath,
            file: field.location.file,
            message: 'Secret field has an inline default',
          }),
        );
      }
    }

    if (!setValue(values, field.propertyPath, cloneValue(field.defaultValue))) {
      errors.push(
        diagnostic({
          code: 'unsafe_defaults_key',
          path: field.defaultsPath,
          file: field.location.file,
          message: 'Defaults path contains an unsafe key',
        }),
      );
    }
  }
};

export const compileDefaults = (
  document: DefaultsDocument,
  fields: readonly FieldIR[],
  policies: CompileDefaultsPolicies,
): CompiledDefaultsResult => {
  const context: CompileContext = {
    fields,
    fieldByDefaultsPath: new Map(
      fields.map((field) => [toPathKey(field.defaultsPath), field]),
    ),
    policies,
    file: document.path,
    values: {},
    warnings: [],
    errors: [],
    compiledPaths: new Set<string>(),
  };
  const { values, warnings, errors } = context;

  const parsed = parseDefaultsDocument(document, errors);

  if (!isRecord(parsed)) {
    if (parsed !== undefined) {
      errors.push(
        diagnostic({
          code: 'invalid_defaults_document',
          path: [],
          file: document.path,
          message: 'Defaults document must contain an object at its root',
        }),
      );
    }

    applyInlineDefaults(context);
    return { values, warnings, errors };
  }

  collectUnsafeKeys(
    { file: document.path, errors, ancestors: new Set() },
    parsed,
    [],
  );
  walkDefaults(context, parsed, []);

  applyInlineDefaults(context);

  return { values, warnings, errors };
};
