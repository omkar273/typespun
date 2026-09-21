import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { appName, appTagline, repoUrl } from './shared';

export function Mark({
  size = 22,
  className,
  strokeWidth = 5,
}: {
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={className ?? 'shrink-0'}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Inline so the mark inherits currentColor in both themes. */}
      <Mark />
      <span className="font-display font-semibold tracking-tight">
        {appName}
      </span>
      <span className="ts-tagline hidden text-xs font-normal text-fd-muted-foreground md:inline">
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
