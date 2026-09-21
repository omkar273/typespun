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
    // ../packages/* are symlinked in; Vite must be allowed to read them.
    fs: { allow: [here('.'), here('..')] },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
