import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { getMDXComponents } from '@/components/mdx';
import { Eyebrow } from '@/components/eyebrow';
import { JsonLd } from '@/components/json-ld';
import { blogSource } from '@/lib/source';
import { pageMetadata } from '@/lib/seo';
import { appName, siteUrl } from '@/lib/shared';

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function BlogPostPage(
  props: PageProps<'/blog/[slug]'>,
) {
  const params = await props.params;
  const post = blogSource.getPage([params.slug]);
  if (!post) notFound();

  const MDX = post.data.body;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.data.title,
    description: post.data.description,
    datePublished: post.data.date,
    author: { '@type': 'Person', name: post.data.author },
    url: `${siteUrl}${post.url}`,
    publisher: { '@type': 'Organization', name: appName },
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <JsonLd data={jsonLd} />
      <Link
        href="/blog"
        className="text-sm font-medium text-fd-muted-foreground underline underline-offset-4 decoration-fd-border hover:decoration-current"
      >
        ← All posts
      </Link>
      <Eyebrow>Blog</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
        {post.data.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fd-muted-foreground">
        <time dateTime={post.data.date}>{formatDate(post.data.date)}</time>
        <span aria-hidden="true">·</span>
        <span>{post.data.author}</span>
        {post.data.tags.map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      {post.data.description && (
        <p className="mt-3 text-fd-muted-foreground">
          {post.data.description}
        </p>
      )}
      <InlineTOC items={post.data.toc} className="mt-8" />
      <article className="prose mt-8">
        <MDX components={getMDXComponents()} />
      </article>
    </main>
  );
}

export async function generateStaticParams() {
  return blogSource.getPages().map((post) => ({ slug: post.slugs[0] }));
}

export async function generateMetadata(
  props: PageProps<'/blog/[slug]'>,
): Promise<Metadata> {
  const params = await props.params;
  const post = blogSource.getPage([params.slug]);
  if (!post) notFound();

  return pageMetadata({
    title: post.data.title,
    description: post.data.description ?? '',
    path: post.url,
    article: {
      publishedTime: post.data.date,
      tags: post.data.tags,
    },
  });
}
