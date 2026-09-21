import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repo already documents its own agent conventions; don't generate more.
  agentRules: false,
  // SEO: lowercase, hyphenated, no trailing slash. Keep this stable forever.
  trailingSlash: false,
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
