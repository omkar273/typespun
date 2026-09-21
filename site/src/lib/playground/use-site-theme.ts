'use client';

import { useEffect, useState } from 'react';

/**
 * The resolved light/dark mode the site is currently showing.
 *
 * Monaco needs a concrete `'dark' | 'light'`, not a `'system'` preference, and
 * the playground used to own that choice itself. It no longer does: the site's
 * theme switch writes a `.dark` class onto `<html>` (next-themes, via the
 * Fumadocs `RootProvider`), so the playground just watches that class. Reading
 * the DOM rather than the provider keeps this decoupled from whichever theme
 * library Fumadocs ships with.
 *
 * The first render returns `'light'` on purpose — it runs during hydration,
 * when the server-rendered markup cannot know the client's preference. The
 * effect corrects it before paint matters.
 */
export function useSiteTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      );

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}
