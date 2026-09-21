import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { getMDXComponents } from '@/components/mdx';
import { JsonLd } from '@/components/json-ld';
import { pagesSource } from '@/lib/source';
import { pageMetadata, softwareApplicationJsonLd } from '@/lib/seo';

const SLUG = ['compare'];

const seo = {
  title: 'Typespun vs t3-env, envalid and plain Zod',
  description:
    'An honest comparison of Typespun with t3-env, envalid, plain Zod, node-config and manual process.env parsing — including the cases where Typespun is the wrong choice.',
  path: '/compare',
};

export function generateMetadata(): Metadata {
  return pageMetadata(seo);
}

export default function Page() {
  const page = pagesSource.getPage(SLUG);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <JsonLd data={softwareApplicationJsonLd} />
      <p className="font-display text-xs uppercase tracking-[0.18em] text-brand-accent dark:text-brand-accent-bright">
        Comparison
      </p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
        {page.data.title}
      </h1>
      <p className="mt-3 text-fd-muted-foreground">{page.data.description}</p>
      <InlineTOC items={page.data.toc} className="mt-8" />
      <article className="prose mt-8">
        <MDX components={getMDXComponents()} />
      </article>
    </main>
  );
}
