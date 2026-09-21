import type { ReactNode } from 'react';
import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
import { appName, links } from '@/lib/shared';

function Footer() {
  return (
    <footer className="border-t border-fd-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 text-sm sm:flex-row sm:justify-between">
        <div>
          <p className="font-display font-semibold">{appName}</p>
          <p className="mt-1 text-fd-muted-foreground">
            Typed configuration for TypeScript. MIT licensed.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-2 text-fd-muted-foreground">
          <Link href="/docs" className="hover:text-fd-foreground">
            Docs
          </Link>
          <Link href="/compare" className="hover:text-fd-foreground">
            Compare
          </Link>
          <Link href="/playground" className="hover:text-fd-foreground">
            Playground
          </Link>
          <a href={links.repo} className="hover:text-fd-foreground">
            GitHub
          </a>
          <a href={links.changelog} className="hover:text-fd-foreground">
            Changelog
          </a>
          <a href={`${links.repo}/issues`} className="hover:text-fd-foreground">
            Issues
          </a>
          <a href={links.npmRuntime} className="hover:text-fd-foreground">
            npm: typespun
          </a>
          <a href={links.npmCodegen} className="hover:text-fd-foreground">
            npm: typespun-codegen
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </HomeLayout>
  );
}
