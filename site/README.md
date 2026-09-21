# Typespun documentation site

The website for [Typespun](https://github.com/omkar273/typespun) — typed
configuration for TypeScript. Deploy target: **Vercel**. The canonical host comes from `NEXT_PUBLIC_SITE_URL` or Vercel's `VERCEL_PROJECT_PRODUCTION_URL`; no domain is hardcoded.

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
bun install && bun run build   # at the REPO ROOT first: /playground needs packages/*/dist
cd site
bun install
bun run dev      # http://localhost:3000
bun run build    # production build (also typechecks)
bun run start    # serve the production build
```

`bun run types:check` runs `next typegen && tsc --noEmit` on its own.

## Layout

```
content/docs/           MDX for /docs/** — ported from the repo's docs/ tree
content/pages/          standalone MDX pages rendered outside /docs (currently /compare)
src/app/(home)/         landing page and /compare
src/app/docs/           the Fumadocs docs layout
src/app/playground/     /playground — navbar without the footer, full-height workbench
src/components/playground/  the playground UI (client-only)
src/lib/playground/     the TypeSpun engine, sample source, share links, browser shims
src/lib/seo.ts          per-page title/description/canonical/OG helper, JSON-LD
src/lib/source.ts       the two content collections
public/                 brand assets copied from ../docs/assets (do not edit the originals)
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

`/playground` is a real route in this app, not a separate bundle: same navbar,
same search, same light/dark switch. It runs the shipped analyzer, emitter and
runtime over an in-memory `ts.Program`, so nothing about it is a mock.

Three things make it work, and all three are in `next.config.mjs`:

- **It imports the workspace's build output.** `typespun-codegen`,
  `typespun/schema` and `typespun/generated` are aliased straight at
  `../packages/*/dist`. `bun install` *copies* `file:` dependencies instead of
  linking them, so depending on them through npm would pin whatever `dist`
  existed at install time. The cost is a build-order dependency: **`bun run
  build` at the repo root must run before `bun run build` here.** `vercel.json`
  does both, in that order.
- **Two browser shims.** `typespun/generated` has tsup's dotenv reader inlined,
  so `fs` and `dotenv` appear in its static import graph even though the
  playground never passes `envFiles`. Both are aliased to throwing stubs under
  the `browser` condition only — the docs build keeps the real `fs`.
- **One TypeScript.** The site typechecks itself with its own compiler; the
  analyzer is built against the 6.0.3 the workspace pins. The browser graph is
  aliased to the workspace copy so the analyzer never receives a `ts.Program`
  built by a different compiler instance.

Neither Monaco nor the TypeScript compiler is in the initial bundle: Monaco
arrives through a `lazy()` boundary and the compiler through `loadEngine()`.
Measured on the production build, `/` pulls ~1.7 MB of JS and `/playground`
~7.9 MB.

The original standalone Vite app still exists at `../playground`. Nothing here
imports from it.

## Duplicate content

Every page under `content/` also exists as Markdown in `../docs`, which GitHub
renders. Canonicals here point at the deployed host, but GitHub will not honour
them. The options, roughly in order of effort: (1) leave it and accept that
GitHub ranks for some queries; (2) reduce `../docs` to stubs that link here;
(3) make this site build directly from `../docs` so there is one copy on disk.
