import { describe, expect, test } from 'vitest';
import type { GenerateDiagnostic } from '../generate.js';
import { formatDiagnostic } from './diagnostics.js';

const cwd = '/workspace/app';
const plain = { cwd, color: false };

describe('formatDiagnostic', () => {
  test('renders an analyzer diagnostic relative to the working directory', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'unsupported_type',
      message: 'This field type is not supported.',
      location: { file: `${cwd}/src/config.ts`, line: 12, column: 5 },
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      'src/config.ts:12:5 [unsupported_type] This field type is not supported.',
    );
  });

  test('keeps a path outside the working directory reachable', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'typescript_config',
      message: 'The TypeScript project configuration could not be loaded.',
      location: { file: '/workspace/shared/tsconfig.json', line: 1, column: 1 },
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      '../shared/tsconfig.json:1:1 [typescript_config] The TypeScript project configuration could not be loaded.',
    );
  });

  test('falls back to the absolute path when the file is the working directory', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'overlapping_paths',
      message: 'The schema input and generated output must be different files.',
      location: { file: cwd, line: 1, column: 1 },
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      '/workspace/app:1:1 [overlapping_paths] The schema input and generated output must be different files.',
    );
  });

  test('passes an already-relative file through unchanged', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'invalid_default_value',
      path: 'server.port',
      file: 'config/config.yaml',
      message: 'Expected a finite number',
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      'config/config.yaml:1:1 [invalid_default_value] path server.port: Expected a finite number',
    );
  });

  test('defaults the position to 1:1 for diagnostics without a source location', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'defaults_read_failed',
      file: `${cwd}/config.yaml`,
      path: '',
      message: 'The configured defaults file could not be read.',
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      'config.yaml:1:1 [defaults_read_failed] The configured defaults file could not be read.',
    );
  });

  test('labels a diagnostic with neither location nor file as project scoped', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'overlapping_paths',
      message: 'The schema input and generated output must be different files.',
    };

    expect(formatDiagnostic(diagnostic, plain)).toBe(
      '<project>:1:1 [overlapping_paths] The schema input and generated output must be different files.',
    );
  });

  test('appends a suggestion only when the diagnostic carries one', () => {
    const base = {
      code: 'invalid_annotation',
      message: 'Env must be a valid complete environment name.',
      location: { file: `${cwd}/src/config.ts`, line: 4, column: 3 },
    } as const;

    expect(
      formatDiagnostic({ ...base, suggestion: 'Use DATABASE_URL.' }, plain),
    ).toBe(
      'src/config.ts:4:3 [invalid_annotation] Env must be a valid complete environment name.\n  suggestion: Use DATABASE_URL.',
    );
    expect(formatDiagnostic(base, plain)).toBe(
      'src/config.ts:4:3 [invalid_annotation] Env must be a valid complete environment name.',
    );
  });

  test('omits the path prefix when the diagnostic path is empty', () => {
    const withPath = formatDiagnostic(
      {
        code: 'unknown_defaults_key',
        path: 'server.unknown',
        file: 'config.yaml',
        message: 'Defaults path does not match a declared field',
      },
      plain,
    );
    const withoutPath = formatDiagnostic(
      {
        code: 'invalid_defaults_document',
        path: '',
        file: 'config.yaml',
        message: 'Defaults document is not valid YAML',
      },
      plain,
    );

    expect(withPath).toContain('path server.unknown: ');
    expect(withoutPath).not.toContain('path ');
  });

  test('wraps only the diagnostic code in colour when colour is enabled', () => {
    const diagnostic: GenerateDiagnostic = {
      code: 'root_count',
      message: 'The input must export exactly one marked configuration root.',
      location: { file: `${cwd}/src/config.ts`, line: 1, column: 1 },
    };

    expect(formatDiagnostic(diagnostic, { cwd, color: true })).toBe(
      'src/config.ts:1:1 [36m[root_count][0m The input must export exactly one marked configuration root.',
    );
    expect(formatDiagnostic(diagnostic, plain)).not.toContain('[');
  });
});
