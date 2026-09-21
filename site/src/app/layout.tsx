import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import { appName, appTagline, siteUrl } from '@/lib/shared';
import { socialCard } from '@/lib/seo';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // Every page ships a hand-written title; this is the fallback shape.
    default: `${appName} — ${appTagline}`,
    template: `%s — ${appName}`,
  },
  description:
    'Declare configuration once in TypeScript and generate a validated, committable loader with explicit source precedence and secret-aware diagnostics.',
  applicationName: appName,
  alternates: { canonical: siteUrl },
  openGraph: {
    type: 'website',
    siteName: appName,
    url: siteUrl,
    images: [socialCard],
  },
  twitter: { card: 'summary_large_image', images: [socialCard.url] },
  icons: {
    icon: [{ url: '/typespun-mark.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1524' },
  ],
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
