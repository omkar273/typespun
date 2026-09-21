import Link from 'next/link';
import type { Metadata } from 'next';
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock';
import { Install } from '@/components/install';
import { JsonLd } from '@/components/json-ld';
import { pageMetadata, softwareApplicationJsonLd } from '@/lib/seo';
import { links } from '@/lib/shared';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Typespun — typed configuration for TypeScript',
    description:
      'Write one TypeScript interface and generate a committed loader that reads env vars, dotenv files and defaults in a fixed order, validates every field at startup, and keeps secrets out of error output.',
    path: '/',
    absoluteTitle: true,
  });
}

const BEFORE = `// The same field, described three times.
export interface AppConfig {
  server: { host: string; port: number };
  origins: string[];
}

const config: AppConfig = {
  server: {
    host: process.env.APP_SERVER_HOST ?? '127.0.0.1',
    port: Number(process.env.APP_SERVER_PORT ?? 3000),
  },
  origins: JSON.parse(process.env.APP_ORIGINS ?? '[]'),
};

// ...plus a runtime schema elsewhere to validate it.
// Three copies. They drift.`;

const AFTER_DECLARATION = `// src/config.ts — the only place it is described.
/** @typespun */
export interface AppConfig {
  server: { host: string; port: number };
  origins: string[];
  /** @env DATABASE_URL */
  databaseUrl?: string;
}`;

const AFTER_USAGE = `// src/index.ts — typed, validated at startup.
import { loadConfig } from './generated/typespun.js';

const config = loadConfig({
  envFiles: [{ path: '.env', optional: true }],
  source: process.env,
  overrides: { server: { port: 4000 } },
});`;

const FAILURE_INPUT = `loadConfig({ source: { APP_PORT: 'not-a-number' } });`;

const FAILURE_OUTPUT = `Configuration validation failed
invalid_value port (APP_PORT): Expected a finite number`;

const PRECEDENCE = [
  { n: '1', label: 'typed overrides', note: 'passed to loadConfig()' },
  {
    n: '2',
    label: 'source',
    note: 'an explicit record, or process.env when omitted',
  },
  { n: '3', label: 'dotenv files', note: 'later entries beat earlier ones' },
  {
    n: '4',
    label: 'compiled defaults',
    note: 'JSON or YAML, validated and embedded at generation',
  },
  {
    n: '5',
    label: 'inline defaults',
    note: 'JSDoc, decorator, or class initializer',
  },
];

const PROOF = [
  {
    title: 'Source on GitHub',
    note: 'MIT licensed. Two packages, one workspace, no hidden service.',
    href: links.repo,
  },
  {
    title: 'CI, every commit',
    note: 'Workspace checks on Bun 1.4.1, plus packed-package consumer tests on Node.js 22, 24 and 26.',
    href: links.ci,
  },
  {
    title: 'Runnable examples',
    note: 'An interface project and a class project, generated and checked by CI — not snippets.',
    href: links.examples,
  },
  {
    title: 'Changelog',
    note: 'Both packages are versioned and released together. Pin them during early adoption.',
    href: links.changelog,
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[13px] font-medium uppercase tracking-[0.12em] text-brand-accent dark:text-brand-accent-bright">
      {children}
    </p>
  );
}

export default function HomePage() {
  return (
    <main className="w-full">
      <JsonLd data={softwareApplicationJsonLd} />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-fd-border">
        <div
          aria-hidden="true"
          className="ts-grid pointer-events-none absolute inset-0 opacity-50"
        />
        <div className="relative mx-auto w-full max-w-5xl px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
          <Eyebrow>For TypeScript services on Bun and Node.js</Eyebrow>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-[1.08] sm:text-5xl lg:text-6xl">
            Your config, typed and validated.
            <br />
            <span className="text-brand-accent dark:text-brand-accent-bright">
              From one TypeScript interface.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-fd-muted-foreground sm:text-lg">
            Stop describing every setting three times: a type, some{' '}
            <code>process.env</code> parsing, and a runtime schema. Write one
            interface. Typespun generates the loader that reads your env vars
            and files, checks every field at startup, and fails with one clear
            error.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/playground"
              className="rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90"
            >
              Try it in 60 seconds
            </Link>
            <Link
              href="/docs"
              className="rounded-md border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium transition-colors hover:bg-fd-accent"
            >
              Read the docs
            </Link>
            <Link
              href="/compare"
              className="px-1 py-2.5 text-sm font-medium underline underline-offset-4 decoration-fd-border hover:decoration-current"
            >
              Compared with t3-env, envalid and Zod
            </Link>
          </div>

          <div className="mt-10 w-full min-w-0 max-w-xl">
            <p className="mb-2 text-sm text-fd-muted-foreground">
              Free and MIT-licensed. Two packages: the runtime, and the generator as a dev dependency.
            </p>
            <Install
              bun={`bun add typespun
bun add --dev typespun-codegen`}
              npm={`npm install typespun
npm install --save-dev typespun-codegen`}
              pnpm={`pnpm add typespun
pnpm add --save-dev typespun-codegen`}
            />
            <p className="mt-3 text-xs text-fd-muted-foreground">
              Bun 1.4.1 or newer, or Node.js 22 or newer.{' '}
              <a
                href={links.changelog}
                className="underline underline-offset-2"
              >
                See the changelog
              </a>{' '}
              for current versions.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Before / after */}
      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
        <Eyebrow>Before and after</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
          One declaration instead of three copies
        </h2>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-fd-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-fd-muted-foreground" />
              Hand-rolled
            </h3>
            <DynamicCodeBlock lang="ts" code={BEFORE} />
          </div>
          <div className="min-w-0">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-fd-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-brand-accent dark:bg-brand-accent-bright" />
              With Typespun
            </h3>
            <div className="space-y-3">
              <DynamicCodeBlock lang="ts" code={AFTER_DECLARATION} />
              <p className="px-1 text-sm text-fd-muted-foreground">
                <code>typespun generate</code> writes{' '}
                <code>src/generated/typespun.ts</code>. You commit it.
              </p>
              <DynamicCodeBlock lang="ts" code={AFTER_USAGE} />
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- Failure */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-14 sm:pb-20">
        <Eyebrow>When something is wrong</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
          You find out at startup, not in production
        </h2>
        <p className="mt-3 max-w-2xl text-fd-muted-foreground">
          Every field is checked before your app starts. A bad value stops the
          process with the field path and the environment key it came from, and
          when several fields fail, you see all of them at once.
        </p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <DynamicCodeBlock lang="ts" code={FAILURE_INPUT} />
          </div>
          <div className="min-w-0">
            <DynamicCodeBlock lang="text" code={FAILURE_OUTPUT} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Precedence */}
      <section className="border-y border-fd-border bg-fd-muted/40">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
          <Eyebrow>Predictable by design</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
            Overrides beat env vars. Env vars beat .env files. Always.
          </h2>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Most environment libraries validate a single source. Typespun
            merges five, in the order below, one field at a time. It picks the
            highest-priority value that exists, then validates it, so a bad
            value in a lower source can never break a good one above it.
          </p>

          <ol className="mt-8 space-y-px overflow-hidden rounded-xl border border-fd-border bg-fd-border">
            {PRECEDENCE.map((item) => (
              <li
                key={item.n}
                className="flex flex-col gap-1 bg-fd-background px-4 py-3.5 sm:flex-row sm:items-baseline sm:gap-4 sm:px-5"
              >
                <span className="font-mono text-xs text-brand-accent dark:text-brand-accent-bright">
                  {item.n}
                </span>
                <span className="font-display font-medium">{item.label}</span>
                <span className="text-sm text-fd-muted-foreground sm:ml-auto sm:text-right">
                  {item.note}
                </span>
              </li>
            ))}
          </ol>

          <Link
            href="/docs/concepts/precedence"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4"
          >
            Read how precedence resolves, per leaf
          </Link>
        </div>
      </section>

      {/* ----------------------------------------------------------------- Why */}
      <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
        <Eyebrow>What you get</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
          Small surface, fewer surprises
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-fd-border bg-fd-card p-5">
            <h3 className="font-display font-medium">One declaration</h3>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              The annotated interface — or a schema-only class — <em>is</em> the
              schema. There is nothing to keep in sync.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border bg-fd-card p-5">
            <h3 className="font-display font-medium">Reviewable output</h3>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              Generation is byte-stable for the same inputs, so the loader
              belongs in version control and <code>typespun check</code> fails
              CI when it goes stale.
            </p>
          </div>
          <div className="rounded-xl border border-fd-border bg-fd-card p-5">
            <h3 className="font-display font-medium">
              Secret-aware diagnostics
            </h3>
            <p className="mt-2 text-sm text-fd-muted-foreground">
              An invalid <code>@secret</code> field reports its path and
              environment key without the received value or type-specific
              detail. That is redaction inside Typespun&apos;s own errors — not
              encryption, and no protection from your application&apos;s logs.
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-dashed border-fd-muted-foreground/40 p-5 sm:flex sm:items-baseline sm:gap-6">
          <h3 className="shrink-0 font-display font-medium">
            When not to use it
          </h3>
          <p className="mt-2 text-sm text-fd-muted-foreground sm:mt-0">
            If you need custom transforms, dynamic or runtime-fetched schemas,
            async secret providers, or a broad validation ecosystem, use a
            schema library instead. Typespun asks you to accept a build step,
            committed output and a narrow type model.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- Proof */}
      <section className="border-t border-fd-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:py-20">
          <Eyebrow>Check it yourself</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold sm:text-3xl">
            New, so we show our work.
          </h2>
          <p className="mt-3 max-w-2xl text-fd-muted-foreground">
            Typespun is pre-1.0 and young, so there are no case studies or
            logos here. Everything below is something you can read and run
            yourself.
          </p>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border sm:grid-cols-2">
            {PROOF.map((item) => (
              <a
                key={item.title}
                href={item.href}
                className="group bg-fd-background p-5 transition-colors hover:bg-fd-accent"
              >
                <h3 className="font-display font-medium group-hover:underline underline-offset-4">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-fd-muted-foreground">
                  {item.note}
                </p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- Footer CTA */}
      <section className="border-t border-fd-border bg-fd-muted/40">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-14 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Stop maintaining three copies of your config.
            </h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              Not sure it fits?{' '}
              <Link
                href="/compare"
                className="underline underline-offset-4 decoration-fd-border hover:decoration-current"
              >
                The comparison page says plainly where Typespun loses.
              </Link>
            </p>
          </div>
          <Link
            href="/playground"
            className="self-start rounded-md bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition-opacity hover:opacity-90 sm:self-auto"
          >
            Open the playground
          </Link>
        </div>
      </section>
    </main>
  );
}
