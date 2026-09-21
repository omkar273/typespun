import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Typespun';

/** Used for canonical URLs, OpenGraph and the sitemap. */
export const siteUrl = 'https://typespun.dev';

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
