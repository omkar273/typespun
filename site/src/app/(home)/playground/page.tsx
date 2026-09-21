import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { links } from '@/lib/shared';

/*
 * ---------------------------------------------------------------------------
 * TODO(playground): this route is a placeholder.
 *
 * The real playground is being built separately at `playground/` in this repo
 * (React + Vite + Monaco). It runs `analyzeProgram()` and
 * `emitGeneratedModule()` from `typespun-codegen` over an in-memory
 * `ts.Program` built with `@typescript/vfs`, so no server is involved.
 *
 * To mount it here:
 *   1. Expose the playground as a React component (or a bundled iframe entry).
 *   2. Replace the <PlaygroundMountPoint /> block below with it. It must be a
 *      client component — Monaco and the TypeScript compiler are browser-only:
 *        const Playground = dynamic(() => import('@/components/playground'), {
 *          ssr: false,
 *        });
 *   3. Keep a narrow-viewport fallback (read-only generated output, editor
 *      collapsed) — see adoption-strategy.md §7.
 *   4. Delete `isPlaceholder` below and the "not built yet" copy with it.
 * ---------------------------------------------------------------------------
 */
const isPlaceholder = true;

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Playground',
    description:
      'An in-browser playground for Typespun: type a TypeScript interface and watch the generated configuration loader appear. Not built yet — follow the repository for progress.',
    path: '/playground',
  });
}

function PlaygroundMountPoint() {
  return (
    <div
      id="typespun-playground-root"
      data-playground-mount="pending"
      className="relative overflow-hidden rounded-xl border border-fd-border bg-fd-card"
    >
      <div className="flex items-center gap-2 border-b border-fd-border bg-fd-muted/60 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="size-2.5 rounded-full bg-fd-border" />
        <span className="ml-2 font-mono text-xs text-fd-muted-foreground">
          src/config.ts → src/generated/typespun.ts
        </span>
      </div>
      <div className="grid gap-px bg-fd-border sm:grid-cols-2">
        <div className="min-h-56 bg-fd-card p-4">
          <p className="font-mono text-xs text-fd-muted-foreground">
            editor mount point
          </p>
        </div>
        <div className="min-h-56 bg-fd-card p-4">
          <p className="font-mono text-xs text-fd-muted-foreground">
            generated output mount point
          </p>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-fd-background/70 backdrop-blur-[2px]">
        <span className="rounded-full border border-fd-border bg-fd-card px-4 py-1.5 font-display text-sm font-medium">
          Coming soon
        </span>
      </div>
    </div>
  );
}

export default function PlaygroundPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <p className="font-display text-xs uppercase tracking-[0.18em] text-brand-teal dark:text-brand-teal-bright">
        Playground
      </p>
      <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
        Type an interface. Watch the loader appear.
      </h1>
      <p className="mt-4 max-w-2xl text-fd-muted-foreground">
        {isPlaceholder
          ? 'This page is a placeholder. The in-browser playground is being built: it runs the real analyzer and emitter over an in-memory TypeScript program, so the module it shows you is the module the CLI would write.'
          : null}
      </p>

      <div className="mt-8">
        <PlaygroundMountPoint />
      </div>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          href="/docs"
          className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
        >
          Read the getting-started tutorial
        </Link>
        <a
          href={links.examples}
          className="rounded-md border border-fd-border px-4 py-2 font-medium transition-colors hover:bg-fd-accent"
        >
          Run the examples locally
        </a>
      </div>

      <p className="mt-6 text-sm text-fd-muted-foreground">
        Until it ships, the fastest way to see real generated output is{' '}
        <a href={links.examples} className="underline underline-offset-4">
          <code>examples/interface</code>
        </a>
        , which is generated and typechecked in CI.
      </p>
    </main>
  );
}
