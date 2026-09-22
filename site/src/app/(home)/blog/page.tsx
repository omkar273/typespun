import Link from 'next/link';
import type { Metadata } from 'next';
import { Eyebrow } from '@/components/eyebrow';
import { blogSource } from '@/lib/source';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Blog',
    description:
      'Notes on Typespun: design decisions, release write-ups, and why configuration keeps drifting in the first place.',
    path: '/blog',
  });
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BlogIndexPage() {
  const posts = blogSource
    .getPages()
    .filter((post) => process.env.NODE_ENV !== 'production' || !post.data.draft)
    .sort((a, b) => b.data.date.localeCompare(a.data.date));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <Eyebrow>Blog</Eyebrow>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
        Notes on building Typespun
      </h1>
      <p className="mt-3 text-fd-muted-foreground">
        Design decisions, release write-ups, and the reasoning behind them.
      </p>

      {posts.length === 0 ? (
        <p className="mt-12 text-sm text-fd-muted-foreground">
          Nothing published yet. Check back soon.
        </p>
      ) : (
        <ol className="mt-10 space-y-8">
          {posts.map((post) => (
            <li
              key={post.url}
              className="border-b border-fd-border pb-8 last:border-b-0"
            >
              <Link href={post.url} className="group block">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fd-muted-foreground">
                  <time dateTime={post.data.date}>
                    {formatDate(post.data.date)}
                  </time>
                  {post.data.draft && (
                    <span className="rounded-full border border-fd-border px-2 py-0.5 font-medium uppercase tracking-wide">
                      Draft
                    </span>
                  )}
                  {post.data.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
                <h2 className="mt-2 font-display text-xl font-semibold group-hover:underline underline-offset-4">
                  {post.data.title}
                </h2>
                {post.data.description && (
                  <p className="mt-2 text-sm text-fd-muted-foreground">
                    {post.data.description}
                  </p>
                )}
                <p className="mt-2 text-sm font-medium text-fd-muted-foreground">
                  By {post.data.author}
                </p>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
