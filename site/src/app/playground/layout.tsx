import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

/**
 * The same navbar the marketing pages use, minus the footer: the playground
 * is a full-height workbench, and a footer below it would only ever be
 * reachable by scrolling past a fixed-height editor.
 */
export default function Layout({ children }: LayoutProps<'/playground'>) {
  return <HomeLayout {...baseOptions()}>{children}</HomeLayout>;
}
