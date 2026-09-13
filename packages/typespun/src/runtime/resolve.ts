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
  const containerPaths = collectContainerPaths(fields);
  for (const entry of overrideEntries) {
    const path = formatPath(entry.path);
    if (hasUnsafePathSegment(entry.path)) {
      issues.push(
        incompatibleSchemaIssue(
          path,
          'Override path contains an unsafe segment',
        ),
      );
    } else if (
      entry.kind === 'cycle' ||
      (!fieldPaths.has(path) &&
        !(entry.kind === 'container' && containerPaths.has(path)))
    ) {
      issues.push({
        code: 'unknown_override',
        path,
        source: 'overrides',
        message: `Unknown override path: ${path}`,
      });
    }
  }

  const selections = fields.map((field) => ({
    field,
    candidate: findCandidate(field, schema, options, dotenv.sources, overrides),
  }));
  const activeParents = new Set<string>();
  for (const { field, candidate } of selections) {
    if (candidate !== undefined) {
      for (const parent of field.optionalParents) {
        activeParents.add(formatPath(parent));
      }
    }
  }
  for (const entry of overrideEntries) {
    const path = formatPath(entry.path);
    if (entry.kind === 'container' && containerPaths.has(path)) {
      for (const field of fields) {
        for (const parent of field.optionalParents) {
          if (isPathPrefix(parent, entry.path)) {
            activeParents.add(formatPath(parent));
          }
        }
      }
    }
  }

  const resolved: { field: FieldSchema; value: unknown }[] = [];
  for (const { field, candidate } of selections) {
    if (candidate !== undefined) {
      const result = candidate.environmentValue
        ? coerceEnvironmentValue(field.kind, candidate.value)
        : validateTypedCandidate(field.kind, candidate.value);
      if ('error' in result) {
        issues.push(invalidValueIssue(field, candidate, result.error));
      } else {
        resolved.push({ field, value: cloneResolvedValue(result.value) });
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
  for (const path of containersToReconstruct(fields, activeParents)) {
    if (!setOwnPath(output, path, Object.create(null))) {
      throw new ConfigError([
        incompatibleSchemaIssue(
          formatPath(path),
          'Schema paths cannot be reconstructed safely',
        ),
      ]);
    }
  }
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
  schema: GeneratedSchema,
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
    const value = Object.hasOwn(options.source, field.envName)
      ? options.source[field.envName]
      : undefined;
    if (value !== undefined) {
      return { source: 'source', value, environmentValue: true };
    }
  }

  if (options.source === undefined) {
    const value = process.env[field.envName];
    if (value !== undefined) {
      return { source: 'process.env', value, environmentValue: true };
    }
  }

  for (let index = dotenvSources.length - 1; index >= 0; index -= 1) {
    const source = dotenvSources[index]!;
    const value = source.values[field.envName];
    if (value !== undefined) {
      return { source: source.name, value, environmentValue: true };
    }
  }

  const compiledDefault = getOwnPath(
    schema.compiledDefaults,
    field.propertyPath,
  );
  if (compiledDefault.found && compiledDefault.value !== undefined) {
    return {
      source: 'compiled default',
      value: compiledDefault.value,
      environmentValue: false,
    };
  }

  if (field.hasDefault && field.defaultValue !== undefined) {
    return {
      source: 'inline default',
      value: field.defaultValue,
      environmentValue: false,
    };
  }

  return undefined;
}

function cloneResolvedValue(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value;
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
    message: field.secret ? 'Invalid value for secret field' : message,
    ...(field.secret ? {} : { received: candidate.value }),
  };
}

function collectContainerPaths(
  fields: readonly FieldSchema[],
): ReadonlySet<string> {
  const paths = new Set<string>();
  for (const field of fields) {
    for (let length = 1; length < field.propertyPath.length; length += 1) {
      paths.add(formatPath(field.propertyPath.slice(0, length)));
    }
  }
  return paths;
}

function containersToReconstruct(
  fields: readonly FieldSchema[],
  activeParents: ReadonlySet<string>,
): readonly (readonly string[])[] {
  const optionalPaths = new Set(
    fields.flatMap((field) =>
      field.optionalParents.map((path) => formatPath(path)),
    ),
  );
  const containers = new Map<string, readonly string[]>();

  for (const field of fields) {
    for (let length = 1; length < field.propertyPath.length; length += 1) {
      const path = field.propertyPath.slice(0, length);
      const formatted = formatPath(path);
      if (
        (optionalPaths.has(formatted) && !activeParents.has(formatted)) ||
        !optionalAncestorsAreActive(path, optionalPaths, activeParents)
      ) {
        continue;
      }
      containers.set(formatted, path);
    }
  }

  return [...containers.values()].sort(
    (left, right) => left.length - right.length,
  );
}

function optionalAncestorsAreActive(
  path: readonly string[],
  optionalPaths: ReadonlySet<string>,
  activeParents: ReadonlySet<string>,
): boolean {
  for (let length = 1; length <= path.length; length += 1) {
    const ancestor = formatPath(path.slice(0, length));
    if (optionalPaths.has(ancestor) && !activeParents.has(ancestor)) {
      return false;
    }
  }
  return true;
}

function isPathPrefix(
  prefix: readonly string[],
  path: readonly string[],
): boolean {
  return (
    prefix.length <= path.length &&
    prefix.every((segment, index) => path[index] === segment)
  );
}

function incompatibleSchemaIssue(path: string, message: string): ConfigIssue {
  return { code: 'incompatible_schema', path, message };
}
