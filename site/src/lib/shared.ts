import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Typespun';

/**
 * Used for canonical URLs, OpenGraph and the sitemap.
 *
 * Resolved from the environment rather than hardcoded, because pointing a
 * canonical at a host that does not serve the page is worse than shipping no
 * canonical at all. Precedence:
 *
 *   1. NEXT_PUBLIC_SITE_URL   an explicit custom domain, once one exists
 *   2. VERCEL_PROJECT_PRODUCTION_URL  the stable production host on Vercel,
 *      which stays put across deployments (VERCEL_URL is per-deployment and
 *      would canonicalise every page at a throwaway host)
 *   3. localhost, for local builds
 */
export const siteUrl = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    'http://localhost:3000',
);

function normalizeSiteUrl(value: string): string {
  const withProtocol = /^https?:\/\//.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

/** One line that carries the category. Never ship the brand name bare. */
export const appTagline = 'typed configuration for TypeScript';

export const docsRoute = '/docs';
export const docsContentRoute = '/llms.mdx/docs';

export const gitConfig = {
  user: 'omkar273',
  repo: 'typespun',
  branch: 'main',
};

export const repoUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export const links = {
  repo: repoUrl,
  changelog: `${repoUrl}/blob/${gitConfig.branch}/CHANGELOG.md`,
  examples: `${repoUrl}/tree/${gitConfig.branch}/examples`,
  npmRuntime: 'https://www.npmjs.com/package/typespun',
  npmCodegen: 'https://www.npmjs.com/package/typespun-codegen',
  ci: `${repoUrl}/actions/workflows/ci.yml`,
  license: `${repoUrl}/blob/${gitConfig.branch}/LICENSE`,
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}
