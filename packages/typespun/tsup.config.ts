import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/generated.ts', 'src/schema.ts', 'src/bin.ts'],
  format: ['esm', 'cjs'],
  splitting: true,
  dts: {
    compilerOptions: {
      composite: false,
      ignoreDeprecations: '6.0',
    },
  },
  clean: true,
});
