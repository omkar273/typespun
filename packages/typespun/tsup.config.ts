import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/generated.ts'],
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
