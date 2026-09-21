import type { Metadata } from 'next';
import { appName, siteUrl } from './shared';

export interface PageSeo {
  /** Rendered as `<title>Title — Typespun</title>`. Hand-written per page. */
  title: string;
  /** Hand-written per page. Never templated from the title. */
  description: string;
  /** Route path, e.g. `/docs/concepts/precedence`. No trailing slash. */
  path: string;
  /**
   * Skip the `%s — Typespun` template. Used by the landing page, whose title
   * already carries the brand and the category.
   */
  absoluteTitle?: boolean;
}

const socialCard = {
  url: `${siteUrl}/typespun-social-card.png`,
  width: 1200,
  height: 630,
  alt: 'Typespun — typed configuration for TypeScript, from one interface.',
};

/**
 * Builds a self-referencing canonical, OpenGraph and Twitter card for one page.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: PageSeo): Metadata {
  const canonical = path === '/' ? siteUrl : `${siteUrl}${path}`;
  const socialTitle = absoluteTitle ? title : `${title} — ${appName}`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: appName,
      url: canonical,
      title: socialTitle,
      description,
      images: [socialCard],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [socialCard.url],
    },
  };
}

export { socialCard };

/**
 * `SoftwareApplication` JSON-LD. Used on `/` and `/compare` only — it is
 * marginal elsewhere. Deliberately carries no rating or install counts:
 * Typespun has no adoption to report and inventing some would be a lie.
 */
export const softwareApplicationJsonLd: Record<string, unknown> = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Typespun',
  alternateName: 'typespun',
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Configuration management',
  operatingSystem: 'Node.js 22 or newer, Bun 1.4.1 or newer',
  url: siteUrl,
  description:
    'Typespun turns one annotated TypeScript declaration into a committed, validated configuration loader with a fixed five-source precedence chain and secret-aware diagnostics.',
  license: 'https://opensource.org/licenses/MIT',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  codeRepository: 'https://github.com/omkar273/typespun',
  programmingLanguage: 'TypeScript',
  softwareHelp: `${siteUrl}/docs`,
  author: {
    '@type': 'Person',
    name: 'omkar273',
    url: 'https://github.com/omkar273',
  },
};
