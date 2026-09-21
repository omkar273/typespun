import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, appTagline, repoUrl } from './shared';

function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Inline so the mark inherits currentColor in both themes. */}
      <svg
        viewBox="0 0 64 64"
        width="22"
        height="22"
        aria-hidden="true"
        className="shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h9c8 0 9 12 18 12" />
        <path d="M5 24h11c6 0 8 4 16 4" />
        <path d="M5 36h11c6 0 8-4 16-4" />
        <path d="M5 48h9c8 0 9-12 18-12" />
        <circle cx="34" cy="30" r="4" fill="currentColor" stroke="none" />
        <path d="M48 15h-5c-4 0-5 3-5 7v20c0 4 1 7 5 7h5M54 15h5v34h-5" />
      </svg>
      <span className="font-display font-semibold tracking-tight">
        {appName}
      </span>
      <span className="ts-tagline hidden text-xs font-normal text-fd-muted-foreground sm:inline">
        {appTagline}
      </span>
    </span>
  );
}

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <Logo />,
      transparentMode: 'top',
    },
    githubUrl: repoUrl,
    links: [
      { text: 'Docs', url: '/docs', active: 'nested-url' },
      { text: 'Compare', url: '/compare', active: 'url' },
      { text: 'Playground', url: '/playground', active: 'url' },
    ],
  };
}
