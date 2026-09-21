import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import PlaygroundClient from '@/components/playground/client';

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: 'Playground',
    description:
      'Edit one TypeScript interface and watch Typespun generate a typed, validated configuration loader — the real analyzer and the real runtime, running in your browser with no server.',
    path: '/playground',
  });
}

export default function PlaygroundPage() {
  return <PlaygroundClient />;
}
