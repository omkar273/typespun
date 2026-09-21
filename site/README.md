# Typespun documentation site

The website for [Typespun](https://github.com/omkar273/typespun) — typed
configuration for TypeScript. Deploy target: **Vercel**, at `typespun.dev`.

This directory is **standalone**: it is deliberately not part of the root
`package.json` workspaces, so installing or building the site never touches the
published packages.

## Stack

| Piece    | Version                                 |
| -------- | --------------------------------------- |
| Next.js  | 16.3.5 (App Router, Turbopack)          |
| Fumadocs | 16.15.12 (`fumadocs-ui` → `@fumadocs/base-ui`), `fumadocs-mdx` 15.4.3 |
| React    | 19.3                                    |
| Tailwind | 4.3                                     |
| Runtime  | Bun 1.4.1                               |

## Run it

```sh
cd site
bun install
bun run dev      # http://localhost:3000
bun run build    # production build (also typechecks)
bun run start    # serve the production build
```

`bun run types:check` runs `next typegen && tsc --noEmit` on its own.

## Layout

```
content/docs/     MDX for /docs/** — ported from the repo's docs/ tree
content/pages/    standalone MDX pages rendered outside /docs (currently /compare)
src/app/(home)/   landing page, /compare, /playground
src/app/docs/     the Fumadocs docs layout
src/lib/seo.ts    per-page title/description/canonical/OG helper, JSON-LD
src/lib/source.ts the two content collections
public/           brand assets copied from ../docs/assets (do not edit the originals)
```

## Conventions

- **Titles and descriptions are hand-written per page.** Docs pages take them
  from MDX frontmatter; `/`, `/compare` and `/playground` set them in the route.
  Nothing is templated — see `docs/launch/adoption-strategy.md` §7.
- **URLs are lowercase, hyphenated, with no trailing slash**, and are meant to
  be stable forever. `next.config.mjs` holds permanent redirects for the old
  `docs/`-tree paths.
- **The OG image is the single shared social card** (`public/typespun-social-card.png`).
  Per-page OG generation is deliberately not wired up yet.
- **`SoftwareApplication` JSON-LD appears on `/` and `/compare` only.**
- Content is ported faithfully from `../docs`. When the source prose changes,
  update both — see "Duplicate content" below.

## Playground

`/playground` is a **placeholder**. The real app is being built at
`../playground` (React + Vite + Monaco). `src/app/(home)/playground/page.tsx`
marks the mount point and lists the steps to swap it in.

## Duplicate content

Every page under `content/` also exists as Markdown in `../docs`, which GitHub
renders. Canonicals here point at `typespun.dev`, but GitHub will not honour
them. The options, roughly in order of effort: (1) leave it and accept that
GitHub ranks for some queries; (2) reduce `../docs` to stubs that link here;
(3) make this site build directly from `../docs` so there is one copy on disk.
