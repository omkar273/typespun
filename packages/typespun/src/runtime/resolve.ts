import {
  ConfigError,
  type ConfigIssue,
  type FieldSchema,
  type GeneratedSchema,
  type LoadConfigOptions,
} from '../schema.js';
import { coerceEnvironmentValue, validateTypedCandidate } from './coerce.js';
import { type DotenvSource, readDotenvFiles } from './dotenv.js';
import {
  collectOverrideEntries,
  formatPath,
  getOwnPath,
  hasUnsafePathSegment,
  nullPrototypeRecord,
  type OverrideEntry,
  setOwnPath,
} from './object.js';

interface Candidate {
  readonly source: string;
  readonly value: unknown;
  readonly environmentValue: boolean;
}

interface CandidateSources {
  readonly schema: GeneratedSchema;
  readonly source: LoadConfigOptions<unknown>['source'];
  readonly dotenvSources: readonly DotenvSource[];
  readonly overrides: unknown;
}

interface Selection {
  readonly field: FieldSchema;
  readonly candidate: Candidate | undefined;
}

interface ResolvedField {
  readonly field: FieldSchema;
  readonly value: unknown;
}

const incompatibleSchemaIssue = (
  path: string,
  message: string,
): ConfigIssue => ({ code: 'incompatible_schema', path, message });

const validateSchema = (
  schema: GeneratedSchema,
  issues: ConfigIssue[],
): readonly FieldSchema[] => {
  // Generated files from another release can carry another version at runtime.
  const protocolVersion: number = schema.protocolVersion;

  if (protocolVersion !== 1) {
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
};

// A blank value counts as unset, so a `.env.example`-style `KEY=` line
// falls through to the next level instead of failing coercion.
const isPresent = (value: string | undefined): value is string =>
  value !== undefined && value !== '';

const overrideCandidate = (
  field: FieldSchema,
  overrides: unknown,
): Candidate | undefined => {
  const override = getOwnPath(overrides, field.propertyPath);

  return override.found && override.value !== undefined
    ? { source: 'overrides', value: override.value, environmentValue: false }
    : undefined;
};

const environmentCandidate = (
  field: FieldSchema,
  source: LoadConfigOptions<unknown>['source'],
): Candidate | undefined => {
  const values = source ?? process.env;
  const value = Object.hasOwn(values, field.envName)
    ? values[field.envName]
    : undefined;

  if (!isPresent(value)) {
    return undefined;
  }

  return {
    source: source === undefined ? 'process.env' : 'source',
    value,
    environmentValue: true,
  };
};

const dotenvCandidate = (
  field: FieldSchema,
  dotenvSources: readonly DotenvSource[],
): Candidate | undefined => {
  for (const source of dotenvSources.toReversed()) {
    const value = source.values[field.envName];

    if (isPresent(value)) {
      return { source: source.name, value, environmentValue: true };
    }
  }

  return undefined;
};

const defaultCandidate = (
  field: FieldSchema,
  schema: GeneratedSchema,
): Candidate | undefined => {
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
};

const findCandidate = (
  field: FieldSchema,
  sources: CandidateSources,
): Candidate | undefined =>
  overrideCandidate(field, sources.overrides) ??
  environmentCandidate(field, sources.source) ??
  dotenvCandidate(field, sources.dotenvSources) ??
  defaultCandidate(field, sources.schema);

const cloneResolvedValue = (value: unknown): unknown =>
  Array.isArray(value) ? Array.from(value) : value;

const isFieldActive = (
  field: FieldSchema,
  activeParents: ReadonlySet<string>,
): boolean =>
  field.optionalParents.every((parent) =>
    activeParents.has(formatPath(parent)),
  );

const invalidValueIssue = (
  field: FieldSchema,
  candidate: Candidate,
  message: string,
): ConfigIssue => ({
  code: 'invalid_value',
  path: formatPath(field.propertyPath),
  source: candidate.source,
  envKey: field.envName,
  message: field.secret ? 'Invalid value for secret field' : message,
  ...(field.secret ? {} : { received: candidate.value }),
});

const collectContainerPaths = (
  fields: readonly FieldSchema[],
): ReadonlySet<string> => {
  const paths = new Set<string>();

  for (const field of fields) {
    for (let length = 1; length < field.propertyPath.length; length += 1) {
      paths.add(formatPath(field.propertyPath.slice(0, length)));
    }
  }

  return paths;
};

const optionalAncestorsAreActive = (
  path: readonly string[],
  optionalPaths: ReadonlySet<string>,
  activeParents: ReadonlySet<string>,
): boolean => {
  for (let length = 1; length <= path.length; length += 1) {
    const ancestor = formatPath(path.slice(0, length));

    if (optionalPaths.has(ancestor) && !activeParents.has(ancestor)) {
      return false;
    }
  }

  return true;
};

const containersToReconstruct = (
  fields: readonly FieldSchema[],
  activeParents: ReadonlySet<string>,
): readonly (readonly string[])[] => {
  const optionalPaths = new Set(
    fields.flatMap((field) =>
      field.optionalParents.map((path) => formatPath(path)),
    ),
  );
  const containers = new Map<string, readonly string[]>();

  for (const field of fields) {
    for (let length = 1; length < field.propertyPath.length; length += 1) {
      const path = field.propertyPath.slice(0, length);

      // The ancestor check includes `path` itself, so an inactive optional
      // container is skipped here too.
      if (!optionalAncestorsAreActive(path, optionalPaths, activeParents)) {
        continue;
      }

      containers.set(formatPath(path), path);
    }
  }

  return [...containers.values()].toSorted(
    (left, right) => left.length - right.length,
  );
};

const overrideIssues = (
  fields: readonly FieldSchema[],
  entries: readonly OverrideEntry[],
): ConfigIssue[] => {
  const fieldPaths = new Set(
    fields.map((field) => formatPath(field.propertyPath)),
  );
  const containerPaths = collectContainerPaths(fields);
  const issues: ConfigIssue[] = [];

  for (const entry of entries) {
    const path = formatPath(entry.path);
    const isKnownContainer =
      entry.kind === 'container' && containerPaths.has(path);
    const isKnownPath = fieldPaths.has(path) || isKnownContainer;

    if (hasUnsafePathSegment(entry.path)) {
      issues.push(
        incompatibleSchemaIssue(
          path,
          'Override path contains an unsafe segment',
        ),
      );
    } else if (entry.kind === 'cycle' || !isKnownPath) {
      issues.push({
        code: 'unknown_override',
        path,
        source: 'overrides',
        message: `Unknown override path: ${path}`,
      });
    }
  }

  return issues;
};

const collectActiveParents = (
  selections: readonly Selection[],
): ReadonlySet<string> => {
  const activeParents = new Set<string>();

  for (const { field, candidate } of selections) {
    if (candidate !== undefined) {
      for (const parent of field.optionalParents) {
        activeParents.add(formatPath(parent));
      }
    }
  }

  return activeParents;
};

const resolveSelections = (
  selections: readonly Selection[],
  activeParents: ReadonlySet<string>,
  issues: ConfigIssue[],
): readonly ResolvedField[] => {
  const resolved: ResolvedField[] = [];

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

  return resolved;
};

const reconstructionError = (path: readonly string[]): ConfigError =>
  new ConfigError([
    incompatibleSchemaIssue(
      formatPath(path),
      'Schema paths cannot be reconstructed safely',
    ),
  ]);

const buildOutput = (
  fields: readonly FieldSchema[],
  activeParents: ReadonlySet<string>,
  resolved: readonly ResolvedField[],
): Record<string, unknown> => {
  const output = nullPrototypeRecord<unknown>();

  for (const path of containersToReconstruct(fields, activeParents)) {
    if (!setOwnPath(output, path, nullPrototypeRecord())) {
      throw reconstructionError(path);
    }
  }

  for (const { field, value } of resolved) {
    if (!setOwnPath(output, field.propertyPath, value)) {
      throw reconstructionError(field.propertyPath);
    }
  }

  return output;
};

export const resolveConfig = <T>(
  schema: GeneratedSchema,
  options: LoadConfigOptions<T> = {},
): T => {
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
  issues.push(...overrideIssues(fields, collectOverrideEntries(overrides)));

  const sources: CandidateSources = {
    schema,
    source: options.source,
    dotenvSources: dotenv.sources,
    overrides,
  };
  const selections = fields.map((field) => ({
    field,
    candidate: findCandidate(field, sources),
  }));
  const activeParents = collectActiveParents(selections);
  const resolved = resolveSelections(selections, activeParents, issues);

  if (issues.length > 0) {
    throw new ConfigError(issues);
  }

  const output = buildOutput(fields, activeParents, resolved);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- public generic return; every field of T was validated above
  return output as T;
};
