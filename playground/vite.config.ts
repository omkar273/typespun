import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // `typespun` and `typespun-codegen` are `file:` dependencies that resolve
    // to ../packages/*, so their transitive `typescript` would otherwise be a
    // second copy of the 10 MB compiler. One instance, always.
    dedupe: ['typescript', 'react', 'react-dom'],
    alias: [
      // `bun install` copies `file:` dependencies into node_modules rather
      // than symlinking them, so without these the playground would keep
      // serving whatever `packages/*/dist` looked like at install time. The
      // import specifiers in `src/typespun-engine.ts` stay at the package
      // root; only where they resolve from changes.
      {
        find: /^typespun-codegen$/,
        replacement: here('../packages/codegen/dist/index.js'),
      },
      {
        find: /^typespun\/generated$/,
        replacement: here('../packages/typespun/dist/generated.js'),
      },
      {
        find: /^typespun$/,
        replacement: here('../packages/typespun/dist/index.js'),
      },

      // The TypeSpun *runtime* (`typespun/generated`) is bundled by tsup with
      // its dotenv reader inlined. That branch is unreachable in the
      // playground because `loadConfig` is always called without `envFiles`,
      // but the static imports still have to resolve in a browser graph.
      { find: /^(node:)?fs$/, replacement: here('./src/shims/node-fs.ts') },
      { find: /^dotenv$/, replacement: here('./src/shims/dotenv.ts') },
    ],
  },
  optimizeDeps: {
    include: ['typescript', '@typescript/vfs'],
    exclude: ['typespun', 'typespun-codegen'],
  },
  server: {
    // The aliases above point outside the project root, so Vite must be
    // allowed to serve from ../packages.
    fs: { allow: [here('.'), here('..')] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
