import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export default function NotFound() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-24">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.12em] text-brand-accent dark:text-brand-accent-bright">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
          That page is not in the schema.
        </h1>
        <p className="mt-3 text-fd-muted-foreground">
          The link may be old, or mistyped. These are the places most people
          are looking for:
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/playground"
            className="rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          >
            Open the playground
          </Link>
          <Link
            href="/docs"
            className="rounded-md border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          >
            Read the docs
          </Link>
          <Link
            href="/"
            className="rounded-md border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"
          >
            Home
          </Link>
        </div>
      </main>
    </HomeLayout>
  );
}
