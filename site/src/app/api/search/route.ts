import { pagesSource, source } from '@/lib/source';
import {
  type AdvancedIndex,
  createSearchAPI,
} from 'fumadocs-core/search/server';

type StructuredData = AdvancedIndex['structuredData'];
type StructuredDataSource = StructuredData | (() => Promise<StructuredData>);

/**
 * Index both the `/docs` tree and the standalone MDX pages (`/compare`) so a
 * search for "t3-env" or "envalid" finds the comparison, not nothing.
 */
async function buildIndexes(): Promise<AdvancedIndex[]> {
  const pages = [...source.getPages(), ...pagesSource.getPages()];

  return Promise.all(
    pages.map(async (page): Promise<AdvancedIndex> => {
      const raw = page.data.structuredData as StructuredDataSource;
      const structuredData = typeof raw === 'function' ? await raw() : raw;

      return {
        id: page.url,
        title: page.data.title,
        description: page.data.description,
        url: page.url,
        structuredData,
      };
    }),
  );
}

export const { GET } = createSearchAPI('advanced', { indexes: buildIndexes });
