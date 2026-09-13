import { ConfigError } from '../schema.js';
import type {
  ConfigIssue,
  FieldSchema,
  GeneratedSchema,
  LoadConfigOptions,
} from '../schema.js';
import { coerceEnvironmentValue, validateTypedCandidate } from './coerce.js';
import { readDotenvFiles } from './dotenv.js';
import {
  collectOverrideEntries,
  formatPath,
  getOwnPath,
  hasUnsafePathSegment,
  setOwnPath,
} from './object.js';

interface Candidate {
  readonly source: string;
  readonly value: unknown;
  readonly environmentValue: boolean;
}

export function resolveConfig<T>(
  schema: GeneratedSchema,
  options: LoadConfigOptions<T> = {},
): T {
  const issues: ConfigIssue[] = [];
  const fields = validateSchema(schema, issues);
  const dotenv = readDotenvFiles(options.envFiles);
  for (const failure of dotenv.failures) {
    issues.push({
      code: 'source_read_failed',
      path: failure.path,
      source: 'dotenv',
      message: failure.message,
    });
  }

  const overrides = options.overrides as unknown;
  const overrideEntries = collectOverrideEntries(overrides);
  const fieldPaths = new Set(
    fields.map((field) => formatPath(field.propertyPath)),
  );
  for (const entry of overrideEntries) {
    const path = formatPath(entry.path);
    if (hasUnsafePathSegment(entry.path)) {
      issues.push(
        incompatibleSchemaIssue(
          path,
          'Override path contains an unsafe segment',
        ),
      );
    } else if (!fieldPaths.has(path)) {
      issues.push({
        code: 'unknown_override',
        path,
        source: 'overrides',
        message: `Unknown override path: ${path}`,
      });
    }
  }

  const activeParents = new Set<string>();
  const resolved: { field: FieldSchema; value: unknown }[] = [];

  for (const field of fields) {
    const candidate = findCandidate(field, options, dotenv.sources, overrides);
    if (candidate !== undefined) {
      for (const parent of field.optionalParents) {
        activeParents.add(formatPath(parent));
      }

      const result = candidate.environmentValue
        ? coerceEnvironmentValue(field.kind, candidate.value as string)
        : validateTypedCandidate(field.kind, candidate.value);
      if ('error' in result) {
        issues.push(invalidValueIssue(field, candidate, result.error));
      } else {
        resolved.push({ field, value: result.value });
      }
    } else if (field.required && isFieldActive(field, activeParents)) {
      issues.push({
        code: 'missing_value',
        path: formatPath(field.propertyPath),
        envKey: field.envName,
        message: `Missing required value for ${formatPath(field.propertyPath)}`,
      });
    }
  }

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  const output = Object.create(null) as Record<string, unknown>;
  for (const { field, value } of resolved) {
    if (!setOwnPath(output, field.propertyPath, value)) {
      throw new ConfigError([
        incompatibleSchemaIssue(
          formatPath(field.propertyPath),
          'Schema paths cannot be reconstructed safely',
        ),
      ]);
    }
  }

  return output as T;
}

function validateSchema(
  schema: GeneratedSchema,
  issues: ConfigIssue[],
): readonly FieldSchema[] {
  if (schema.protocolVersion !== 1) {
    issues.push(
      incompatibleSchemaIssue('$schema', 'Unsupported schema protocol version'),
    );
    return [];
  }

  const seen = new Set<string>();
  const fields: FieldSchema[] = [];
  for (const field of schema.fields) {
    const path = formatPath(field.propertyPath);
    if (
      field.propertyPath.length === 0 ||
      hasUnsafePathSegment(field.propertyPath)
    ) {
      issues.push(
        incompatibleSchemaIssue(path, 'Schema path contains an unsafe segment'),
      );
      continue;
    }
    if (seen.has(path)) {
      issues.push(
        incompatibleSchemaIssue(
          path,
          'Schema declares the same property twice',
        ),
      );
      continue;
    }
    if (field.optionalParents.some(hasUnsafePathSegment)) {
      issues.push(
        incompatibleSchemaIssue(
          path,
          'Schema optional-parent path contains an unsafe segment',
        ),
      );
      continue;
    }

    seen.add(path);
    fields.push(field);
  }

  return fields;
}

function findCandidate<T>(
  field: FieldSchema,
  options: LoadConfigOptions<T>,
  dotenvSources: readonly {
    name: string;
    values: Readonly<Record<string, string>>;
  }[],
  overrides: unknown,
): Candidate | undefined {
  const override = getOwnPath(overrides, field.propertyPath);
  if (override.found && override.value !== undefined) {
    return {
      source: 'overrides',
      value: override.value,
      environmentValue: false,
    };
  }

  if (options.source !== undefined) {
    const value = options.source[field.envName];
    if (value !== undefined) {
      return { source: 'source', value, environmentValue: true };
    }
  }

  for (let index = dotenvSources.length - 1; index >= 0; index -= 1) {
    const source = dotenvSources[index]!;
    const value = source.values[field.envName];
    if (value !== undefined) {
      return { source: source.name, value, environmentValue: true };
    }
  }

  if (options.source === undefined) {
    const value = process.env[field.envName];
    if (value !== undefined) {
      return { source: 'process.env', value, environmentValue: true };
    }
  }

  if (field.hasDefault && field.defaultValue !== undefined) {
    return {
      source: 'default',
      value: field.defaultValue,
      environmentValue: false,
    };
  }

  return undefined;
}

function isFieldActive(
  field: FieldSchema,
  activeParents: ReadonlySet<string>,
): boolean {
  return field.optionalParents.every((parent) =>
    activeParents.has(formatPath(parent)),
  );
}

function invalidValueIssue(
  field: FieldSchema,
  candidate: Candidate,
  message: string,
): ConfigIssue {
  return {
    code: 'invalid_value',
    path: formatPath(field.propertyPath),
    source: candidate.source,
    envKey: field.envName,
    message,
    ...(field.secret ? {} : { received: candidate.value }),
  };
}

function incompatibleSchemaIssue(path: string, message: string): ConfigIssue {
  return { code: 'incompatible_schema', path, message };
}
