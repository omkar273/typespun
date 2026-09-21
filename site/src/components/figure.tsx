import type { ReactNode } from 'react';

/**
 * Frames the brand diagrams from `docs/assets`, which are drawn on a light
 * paper background, so they read as figures in dark mode too.
 */
export function Figure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: ReactNode;
}) {
  return (
    <figure className="my-6">
      <div className="ts-figure">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" />
      </div>
      {caption ? (
        <figcaption className="mt-2 text-sm text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
