import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'examples/**'],

    // Packing tarballs, installing them, and compiling real TypeScript programs
    // all run well past Vitest's 5s default.
    testTimeout: 120_000,
    hookTimeout: 300_000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',

      // Listing sources explicitly is what makes untested files count as 0%
      // instead of vanishing from the report entirely.
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/dist/**',
        // Test-only helper; already excluded from the published package.
        'packages/codegen/src/testing/**',
        // Type-only modules that erase to nothing at runtime.
        'packages/codegen/src/contracts.ts',
        'packages/codegen/src/analyzer/ir.ts',
        // Process entry points: top-level-await scripts that can only run as a
        // subprocess, so execution never registers here. Both are thin -- they
        // parse argv and delegate -- and their logic lives in measured modules
        // (cli/main.ts, cli-shim.ts). Behaviour is covered by the subprocess
        // suites in cli.test.ts, bin.test.ts, and tests/consumer.
        'packages/*/src/bin.ts',
      ],

      thresholds: {
        // Per-file, so a well-covered large file cannot mask a poor small one.
        perFile: true,
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
