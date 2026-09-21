import type { MetadataRoute } from 'next';
import { pagesSource, source } from '@/lib/source';
import { siteUrl } from '@/lib/shared';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    { path: '/', priority: 1 },
    { path: '/compare', priority: 0.9 },
    { path: '/playground', priority: 0.5 },
  ];

  const docs = source.getPages().map((page) => ({
    url: `${siteUrl}${page.url}`,
    changeFrequency: 'weekly' as const,
    priority: page.url === '/docs' ? 0.9 : 0.8,
  }));

  return [
    ...staticRoutes.map((route) => ({
      url: route.path === '/' ? siteUrl : `${siteUrl}${route.path}`,
      changeFrequency: 'weekly' as const,
      priority: route.priority,
    })),
    ...docs,
    // `/compare` is rendered from `pagesSource`; it is already listed above.
    ...pagesSource
      .getPages()
      .filter((page) => page.url !== '/compare')
      .map((page) => ({
        url: `${siteUrl}${page.url}`,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
  ];
}
