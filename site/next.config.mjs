import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/*
 * The playground runs the real TypeSpun pipeline in the browser, which means
 * the site has to resolve three things it does not depend on through npm.
 *
 *   1. `typespun-codegen` and `typespun/*` live in this repo, not in the
 *      registry. `bun install` copies `file:` dependencies rather than linking
 *      them, so depending on them that way would freeze whatever `dist`
 *      happened to exist at install time. Aliasing straight at the build
 *      output keeps `bun run build` at the repo root as the single source of
 *      truth.
 *   2. `typespun/generated` is bundled by tsup with its dotenv reader inlined.
 *      That branch is unreachable here (`loadConfig` is always called with an
 *      explicit `source` and never with `envFiles`) but the static imports
 *      still have to resolve in a browser graph, hence the two shims. They are
 *      scoped to the `browser` condition so the docs build — which very much
 *      does read the filesystem — keeps the real `fs`.
 *   3. `typescript` must be one instance. The site typechecks itself with its
 *      own newer compiler, while `typespun-codegen` is built against the 6.0.3
 *      the workspace pins; handing the analyzer a `ts.Program` built by a
 *      different copy of the compiler would be a subtle disaster, so the
 *      browser graph is pinned to the workspace's copy.
 */
const playgroundAliases = {
  'typespun-codegen': '../packages/codegen/dist/index.js',
  'typespun/generated': '../packages/typespun/dist/generated.js',
  'typespun/schema': '../packages/typespun/dist/schema.js',
  typescript: { browser: '../node_modules/typescript/lib/typescript.js' },
  fs: { browser: './src/lib/playground/shims/node-fs.ts' },
  dotenv: { browser: './src/lib/playground/shims/dotenv.ts' },
};

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repo already documents its own agent conventions; don't generate more.
  agentRules: false,
  // SEO: lowercase, hyphenated, no trailing slash. Keep this stable forever.
  trailingSlash: false,
  turbopack: {
    // The aliases above reach into `../packages`, so the workspace root — not
    // `site/` — is the boundary Turbopack has to resolve and watch within.
    root: fileURLToPath(new URL('..', import.meta.url)),
    resolveAlias: playgroundAliases,
  },
  async redirects() {
    return [
      // The docs tree is rooted at /docs; keep the obvious guess working.
      {
        source: '/docs/getting-started',
        destination: '/docs',
        permanent: true,
      },
      { source: '/docs/concepts/source-precedence', destination: '/docs/concepts/precedence', permanent: true },
      { source: '/docs/concepts/validation-and-redaction', destination: '/docs/concepts/secrets', permanent: true },
      { source: '/docs/api/runtime', destination: '/docs/reference/runtime', permanent: true },
      { source: '/docs/api/generated-loader', destination: '/docs/reference/generated-loader', permanent: true },
      { source: '/docs/api/cli', destination: '/docs/reference/cli', permanent: true },
      { source: '/docs/api/decorators-and-annotations', destination: '/docs/reference/annotations', permanent: true },
    ];
  },
};

export default withMDX(config);
