import { llms, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docsRoute } from './shared';
import { defineCollections, defineDocs } from 'fumadocs-mdx/macro';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

// See https://fumadocs.dev/docs/headless/source-api for more info
export const source = loader({
  baseUrl: docsRoute,
  source: docs.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

/**
 * Standalone marketing pages that live outside `/docs` but still want MDX,
 * syntax highlighting and search indexing. Currently: `/compare`.
 */
const pages = defineCollections({
  type: 'doc',
  dir: 'content/pages',
  schema: pageSchema,
});

export const pagesSource = loader({
  baseUrl: '/',
  source: pages.toFumadocsSource(),
});

/**
 * Blog posts. One MDX file per post in `content/blog`; the filename becomes
 * the slug (`launch-week.mdx` -> `/blog/launch-week`). `date` drives listing
 * order; `draft` hides a post from the listing (not from a direct link) so a
 * post can be written ahead of publishing without a separate branch.
 */
export const blogSchema = pageSchema.extend({
  date: z.iso.date(),
  author: z.string().default('omkar273'),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
});

const blog = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: blogSchema,
});

export const blogSource = loader({
  baseUrl: '/blog',
  source: blog.toFumadocsSource(),
});

export const docsLlms = llms(source, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText('processed')}`,
});
