# Typespun documentation and adoption strategy

Prepared 2026-09-22. All registry and GitHub figures were read from the npm and
GitHub APIs on that date.

Labels used throughout: **[FACT]** verified from the repo, an API, or a cited
page · **[REC]** recommendation · **[ASSUME]** a stated assumption I could not
verify · **[SPEC]** speculation about outcomes.

---

## 0. The short answer

> **If the goal is to turn Typespun from an npm package into a well-known
> developer tool, what should we build around the package besides the code?**

Four things, in this order. Everything else in this report is detail.

1. **Credibility repair (hours, not days).** Typespun currently ships broken
   trust signals: an empty GitHub description, a `rust` topic on a TypeScript
   repo, an npm `latest` tag pointing at `0.0.9` while a _higher_ `0.1.1` is
   already published, and GitHub releases that stop three versions behind npm.
   Every discovery channel you build funnels into those signals. Fix them
   first; they cost almost nothing and they poison everything downstream.

2. **A browser playground.** Typespun's pitch — "a TypeScript interface becomes
   a validated loader" — is not believable from prose. It is _obvious_ the
   moment someone types a type and watches the loader appear. I verified this
   is buildable: `analyzeProgram()` takes a `ts.Program`, and
   `emitGeneratedModule()` is pure, so neither touches the filesystem. This is
   the single highest-leverage artifact you can build, and it is the thing
   people link to.

3. **Standard Schema output.** Emitting a `StandardSchemaV1`-compliant object
   next to `loadConfig()` converts Typespun from _a competitor to t3-env_ into
   _an input to t3-env_, tRPC, TanStack Form, and Hono validators. It replaces
   an uphill "switch away from Zod" argument with a downhill "keep your stack,
   add this" one. This is a code change, but it is fundamentally a distribution
   decision.

4. **One honest comparison page, not fifteen SEO articles.** At 0 stars,
   content marketing has no foundation to stand on. A single rigorous
   "Typespun vs t3-env vs envalid vs plain Zod" page that is _fair to the
   alternatives_ is worth more than a dozen tutorials, because maintainers and
   aggregators link to fair comparisons and ignore promotional ones.

**What you should not build:** a large docs site with fifteen sections, a blog,
a newsletter, or a social calendar. You have ~230 lines of README and 13 docs
files that are already better than most packages at 100× the downloads. More
prose is not the constraint.

**Honest expectation [SPEC]:** with disciplined execution of the above, a
realistic six-month outcome is low-thousands of weekly downloads and a few
hundred stars. The 3M/week tier in this category took years and rode a
much larger host project. Plan against the realistic number.

---

## 1. Typespun documentation audit

### 1.1 What Typespun is **[FACT]**

A two-package Bun/npm workspace at `github.com/omkar273/typespun`:

| Package            | Role                                                   | Published | Unpacked            |
| ------------------ | ------------------------------------------------------ | --------- | ------------------- |
| `typespun`         | Runtime: inert decorators, `ConfigError`, resolver ABI | 0.0.9     | 46,437 B / 19 files |
| `typespun-codegen` | TypeScript analyzer + `init`/`generate`/`check` CLI    | 0.0.9     | —                   |

**The problem it solves.** A configuration field is typically described three
times — as a TypeScript type, as `process.env` parsing, and as a runtime
validation schema — and the three drift. Typespun makes the TypeScript
declaration the single build-time source of truth and emits the loader.

**Core model.** Mark exactly one exported root (`/** @typespun */` on an
interface, or `@Config()` on a schema-only class). `typespun generate`
statically analyzes it, validates and embeds optional JSON/YAML defaults, and
atomically writes a deterministic module exporting `Config` and `loadConfig()`.
At runtime `loadConfig()` resolves each leaf independently by fixed precedence —
typed `overrides` → explicit `source` (or ambient `process.env`) → dotenv files
→ compiled defaults → inline defaults — coerces environment strings, and either
returns `Config` or throws a single `ConfigError` aggregating every issue.

**Genuine differentiators.** Three things Typespun does that the obvious
alternatives do not:

- **A documented, fixed precedence chain across five source kinds.** Most
  env-validation libraries validate one source. This is under-served and
  under-written-about across the whole ecosystem.
- **Secret-aware diagnostics.** A field marked `@secret` omits its received
  value _and_ type-specific detail (such as allowed enum members) from
  Typespun's own error output. Honestly scoped in the docs as redaction, not
  encryption.
- **A deterministic, committable artifact with a CI staleness check.**
  `config:check` never writes and exits nonzero on stale output; generation is
  byte-stable given the same inputs and generator version.

**Target reader [ASSUME].** TypeScript backend developers on Node or Bun
(Fastify/Hono/NestJS/Express services, Bun servers) who already feel the
three-copies problem, are comfortable committing generated code, and value an
explicit precedence contract. Not a fit for frontend-only projects, dynamic or
runtime-fetched schemas, or async secret providers.

### 1.2 Current documentation — the surprise finding

**[FACT]** Documentation quality is _not_ Typespun's problem. Present today:

- Root `README.md` (~230 lines) with hero image, badges, runnable first path,
  architecture diagram, precedence, limitations, and a docs index.
- Distinct, correct per-package READMEs for npm, using absolute
  `raw.githubusercontent.com` image URLs — so images render on the npm page.
  (This is a common failure mode that Typespun already avoids.)
- `docs/getting-started.md` — a 276-line tutorial with exact console output and
  a 5-entry troubleshooting section.
- `docs/api/` — runtime, generated-loader, CLI, decorators/annotations.
- `docs/concepts/` — declarations, generated-code, source-precedence,
  validation-and-redaction.
- `docs/reference/configuration.md` — full `typespun.json` table.
- Two runnable examples (`examples/interface`, `examples/class`) with their own
  READMEs, exercised by CI.
- `docs/launch/marketing-kit.md` — 201 lines of launch copy already written,
  including a Show HN draft, an r/typescript draft, an FAQ, and an _honest_
  approach-comparison table that admits where Typespun is the wrong choice.
- Full community scaffolding: `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`,
  `SUPPORT`, issue templates, PR template, `CODEOWNERS`, Dependabot.
- CI running workspace checks on Bun 1.4.1 plus packed-artifact consumer tests
  on Node 22 and 24.

The prose is precise, honest about limitations, and free of the marketing
inflation typical of pre-1.0 projects. **The gap is distribution and trust
signals, not writing.**

### 1.3 Audit findings, worst first

| #   | Finding                                      | Evidence **[FACT]**                                                                                                                                                                                                                                    | Severity |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | **npm version ordering is broken**           | Publish order was `0.1.0`, `0.0.4`, `0.1.1`, `0.0.7`, `0.0.8`, `0.0.9`. `latest` = `0.0.9`, but `0.1.1` is published and higher. `npm i typespun` → 0.0.9; `npm i typespun@^0.1` → 0.1.1, a **3-file / 7,025 B stub** vs 19 files / 46,437 B in 0.0.9. | Critical |
| 2   | **GitHub description is empty**              | `gh repo view` returns `"description": ""`.                                                                                                                                                                                                            | Critical |
| 3   | **Repo is tagged `rust`**                    | Topics: `rust`, `typesafe`, `typescript`, `typescript-library`.                                                                                                                                                                                        | Critical |
| 4   | **`engines` excludes the current Node line** | `">=22 <23 \|\| >=24 <25"`. Node 26.9.0 shipped 2026-09-16 and is the Current line; Node 25 also excluded.                                                                                                                                             | High     |
| 5   | **Circular homepages**                       | GitHub `homepageUrl` → npm page; npm `homepage` → GitHub README. Neither points anywhere new.                                                                                                                                                          | High     |
| 6   | **README says 0.1.1, npm ships 0.0.9**       | README: "The current source targets pre-release version `0.1.1`". Registry `latest`: 0.0.9.                                                                                                                                                            | High     |
| 7   | **No CHANGELOG; releases 3 versions stale**  | No `CHANGELOG*` in repo. `gh release list` stops at `v0.0.6`; npm is at `0.0.9`.                                                                                                                                                                       | High     |
| 8   | **Thin npm keywords**                        | 4 keywords per package. No `env`, `dotenv`, `config`, `codegen`, `validation`, `bun`, `nodejs`, `12-factor`, `type-safe`.                                                                                                                              | Medium   |
| 9   | **No public programmatic API**               | `packages/codegen/src/index.ts` is literally `export {}`. Blocks the playground and any editor/build-tool integration.                                                                                                                                 | Medium   |
| 10  | **Two-package install friction**             | Every entry point requires two installs plus an `init`. Competitors are one install.                                                                                                                                                                   | Medium   |
| 11  | **No canonical domain**                      | Nothing to accumulate backlinks against; GitHub and npm links dilute each other.                                                                                                                                                                       | Medium   |
| 12  | **No provenance attestation**                | `dist` carries only a registry signature, no npm provenance. Cheap trust signal, currently unused.                                                                                                                                                     | Low      |

### 1.4 Verified architecture fact that unlocks the strategy **[FACT]**

```
packages/codegen/src/analyzer/analyze.ts
  analyzeProgram(program: ts.Program, inputPath: string, envPrefix?: string)
packages/codegen/src/emitter/emit.ts
  emitGeneratedModule(...)            // pure
packages/codegen/src/generate.ts      // ← all fs/ts.sys coupling lives here
packages/codegen/src/cli/init.ts      // ← and here
```

`grep` for `node:fs`, `ts.sys`, and `createProgram` across `packages/codegen/src`
returns hits only in `generate.ts`, `cli/init.ts`, `project/config.ts`, and
`project/discovery.ts`. The analyzer and emitter are filesystem-free.

**Consequence:** a browser playground needs `@typescript/vfs` to build a
`ts.Program`, then `analyzeProgram()` + `emitGeneratedModule()`. No
re-architecture. The only blocker is that `codegen`'s `index.ts` exports
nothing, so these functions are not reachable from outside the package.

### 1.5 Current traction **[FACT]**

988 downloads in the last month. 0 stars, 0 forks. Repo created 2026-09-13
(9 days ago), 60 commits. At this volume, download counts are dominated by
registry mirrors and scanners and should not be read as adoption.

---

## 2. Comparable-project research

### 2.1 Adoption data

Weekly npm downloads and GitHub stars, read from the npm and GitHub APIs on
2026-09-22 **[FACT]**:

| Package                |  Weekly downloads |       Stars | Category                      |
| ---------------------- | ----------------: | ----------: | ----------------------------- |
| `zod`                  |       213,873,599 |      43,984 | schema validation             |
| `dotenv`               |       131,386,828 |      20,538 | env loading                   |
| `@sinclair/typebox`    |        82,365,956 |       6,963 | JSON-Schema types             |
| `joi`                  |        19,571,079 |           — | validation                    |
| `valibot`              |        13,509,487 |           — | validation                    |
| **`@t3-oss/env-core`** |     **3,056,626** |   **4,004** | **env validation**            |
| `@t3-oss/env-nextjs`   |         2,164,917 | (same repo) | env validation                |
| `arktype`              |         1,379,945 |       7,864 | validation                    |
| `config` (node-config) |         1,232,387 |           — | config mgmt                   |
| **`convict`**          |       **883,532** |   **2,374** | **config mgmt**               |
| `nconf`                |           832,047 |           — | config mgmt                   |
| `dotenv-flow`          |           799,102 |           — | env loading                   |
| **`envalid`**          |       **508,955** |   **1,592** | **env validation**            |
| **`typia`**            |       **241,879** |   **5,911** | **TS-type → runtime codegen** |
| `znv`                  |            57,774 |           — | env validation                |
| **`typespun`**         | **~230** (988/mo) |       **0** | —                             |

> One correction worth noting: a widely-cited 2026 comparison article puts
> t3-env at "~400,000 weekly downloads." The registry says 3.06M for
> `env-core` alone. Prefer the API over blog figures — and expect the same
> staleness to work in your favor once Typespun is being written about.

### 2.2 The two reference projects that matter

**`typia` — the technique precedent.** 242k weekly downloads but **5,911
stars**: ~41 downloads per star. This is an _admired_ project more than a
widely-deployed one. It proves the "TypeScript type is the source of truth,
generate the runtime" idea earns serious attention. Its documentation lives at
`typia.io` on **Nextra**, with three top-level sections — Guide Documents, Blog
Articles, and **Playground** — plus benchmarks maintained in a separate repo
and linked from an appendix ([typia.io/docs](https://typia.io/docs/),
[github.com/samchon/typia](https://github.com/samchon/typia)).

**`t3-env` — the category incumbent.** 3.06M weekly downloads against 4,004
stars: ~765 downloads per star, the inverse ratio. This is a _deployed_
project. Its docs at `env.t3.gg` are compact — Getting Started (Introduction);
Framework Guides (Agnostic Core, Next.js, Nuxt); Further Reading (Recipes,
Standard Schema, Customization) — and the introduction spends most of its
length _steelmanning the naive Zod approach_ before explaining where it breaks,
notably that "transforms applied will make your types lie to you"
([env.t3.gg/docs/introduction](https://env.t3.gg/docs/introduction)).

### 2.3 Patterns worth copying (and the one worth refusing)

1. **Small docs sites beat large ones.** Both references run ~8–12 pages. Neither
   has the Home/Getting Started/Concepts/API/Config/Examples/Recipes/Advanced/
   Integrations/Migration/FAQ/Troubleshooting/Architecture superstructure.
2. **Interactive proof is the growth asset.** typia's playground is its most
   linked surface. For a codegen tool, "show the output" _is_ the pitch.
3. **The introduction argues against itself first.** t3-env's most effective
   page is the one that shows you the simpler alternative, honestly, then
   names the specific case where it fails.
4. **Standard Schema is the ecosystem hub.** `standardschema.dev`, authored by
   the maintainers of Zod, Valibot, and ArkType, defines `StandardSchemaV1`
   (`@standard-schema/spec`) so tools accept any compliant validator without
   adapters. t3-env consumes it. This is how a small library gets into large
   stacks without asking anyone to switch.
5. **Distribution rode a host project.** t3-env's volume traces to
   `create-t3-app`, not to SEO. **[ASSUME]** — the causation is inferred from
   the docs' own origin story, not measured.
6. **Refuse: the docs-site-as-manual pattern.** Copying a 14-section IA at 988
   downloads produces empty pages that signal abandonment. YAGNI applies.

---

## 3. Documentation architecture decision

| Option                          | Effort  | Maint. | SEO             | DX              | API ref    | Backlinks | Verdict                 |
| ------------------------------- | ------- | ------ | --------------- | --------------- | ---------- | --------- | ----------------------- |
| 1. README only                  | none    | none   | weak            | poor past 5 min | none       | none      | Insufficient            |
| 2. README + `/docs` (**today**) | done    | low    | GitHub-mediated | good            | manual     | weak      | Adequate, not a ceiling |
| 3. Static HTML                  | med     | high   | ok              | poor            | none       | ok        | No                      |
| 4. Bespoke site                 | high    | high   | good            | varies          | custom     | good      | No — YAGNI              |
| 5. **Docs platform**            | low-med | low    | **good**        | **good**        | manual/gen | **good**  | **Yes**                 |
| 6. + generated API ref          | +med    | med    | good            | good            | auto       | good      | Later, if ever          |
| 7. + playground                 | +med    | med    | good            | **best**        | —          | **best**  | **Yes — the point**     |

### 3.1 Recommendation **[REC]**

**Option 5 + 7: a small docs platform site on `typespun.dev`, whose reason for
existing is the playground and the canonical domain — not the prose.**

Be clear-eyed about _why_, because YAGNI says option 2 is already fine. A docs
site earns its keep for exactly three reasons, and no others:

1. It hosts the playground. GitHub markdown cannot.
2. It gives you one canonical domain to accumulate links against, instead of
   splitting authority between `github.com` and `npmjs.com`.
3. It lets you control `<title>`, meta description, OpenGraph, canonical URLs,
   and sitemap — none of which you control on GitHub.

**If you decide against the playground, do not build the site.** In that case
option 2 plus a sharper README is the correct answer, and the two days are
better spent on Standard Schema output.

### 3.2 Stack **[REC]**

**Fumadocs on Next.js, deployed to Vercel, at `typespun.dev`.**

Reasoning, not fashion: the playground needs Monaco (or CodeMirror),
`typescript`, and `@typescript/vfs` running in the browser inside a React tree.
Next.js/Fumadocs makes that an ordinary component; VitePress (Vue) makes it an
integration project. Fumadocs also consumes your existing markdown with minimal
rewriting, ships search, and is what the category incumbent uses.

**The honest alternative:** if the playground slips, **VitePress is the right
call** — it is roughly a one-day job from your existing `/docs` tree and its
defaults are excellent. Do not pick Docusaurus (heavier than needed here) or
Mintlify (hosted-vendor dependency on an MIT OSS project, and its free tier
terms are a future liability).

### 3.3 On the name **[REC]**

"Typespun" carries zero category signal. Every competitor's name says what it
does: `dotenv`, `envalid`, `t3-env`, `convict`, `node-config`. This is a real
cost — nobody discovers Typespun by searching its category.

**Recommendation: keep the name, but never ship it bare.** At 988 downloads and
0 stars a rename is _cheap_, but the name is not the bottleneck and generic
alternatives (`config-gen`, `ts-config-codegen`) are unbrandable and worse.
typia faced the same and did fine. Instead, make the category travel with the
brand on every surface: **"Typespun — typed configuration for TypeScript."**
Never "Typespun" alone in a title tag, npm description, or GitHub description.

---

## 4. Proposed site structure

Eight pages at launch. Resist adding more until traffic justifies them.

| #   | URL                             | Purpose                         | Reader          | Must contain                                                                          | Search intent                               | Source                                     |
| --- | ------------------------------- | ------------------------------- | --------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------ |
| 1   | `/`                             | 30-second pitch                 | Evaluator       | One-line value prop, before/after code, live playground embed, install, 4 proof links | Brand + "typescript config generator"       | Manual                                     |
| 2   | `/docs/getting-started`         | First working loader in <10 min | Trying it       | Prereqs, install, `init`, real console output, first `loadConfig()`, first failure    | "type safe env vars typescript tutorial"    | Port `docs/getting-started.md`             |
| 3   | `/docs/concepts/precedence`     | The strongest differentiator    | Deciding        | Precedence diagram, per-leaf resolution, `source: {}`, worked example                 | "config precedence env vs yaml vs defaults" | Port                                       |
| 4   | `/docs/concepts/generated-code` | Defuse the codegen objection    | Skeptic         | Determinism, fingerprint, why commit it, `check` in CI, review workflow               | "should you commit generated code"          | Port                                       |
| 5   | `/docs/concepts/secrets`        | Unique, underserved topic       | Security-minded | Redaction scope, what it does _not_ cover, `ConfigError` shape                        | "hide secrets config error messages node"   | Port                                       |
| 6   | `/docs/reference/*`             | Lookup                          | Implementing    | Runtime API, generated-loader API, CLI, annotations, `typespun.json`                  | Long-tail API queries                       | Port; generate later **only if** it drifts |
| 7   | `/playground`                   | **Proof**                       | Everyone        | Editor → live generated loader, shareable URL, 4 presets incl. a failure case         | Brand + referral                            | Build                                      |
| 8   | `/compare`                      | Capture comparison traffic      | Choosing        | Honest matrix vs t3-env / envalid / plain Zod / manual, incl. when Typespun loses     | "t3-env alternative", "envalid vs zod"      | Manual — expand `marketing-kit.md`         |

**Deliberately omitted at launch:** Recipes, Advanced Usage, Migration Guides,
Architecture, Case Studies, Blog. Add each only when a real question or real
traffic demands it. An empty section is a negative signal.

---

## 5. README structure

Keep it a landing page. Target ~120 lines, down from ~230. Your current README
is _good prose_ but is doing the docs site's job.

```
[logo] Typespun
> Declare configuration once in TypeScript. Generate the validated loader.
[badges: npm version · npm downloads · CI · license · Node/Bun]
[social card image]

▸ 3-sentence what/why
▸ ⚡ Try it in the playground → typespun.dev/playground     ← above the fold
▸ Install (bun / npm / pnpm tabs)
▸ 30-second example: interface in, generated loader out, typed usage out
▸ Why Typespun? — 5 bullets, one of which is an honest "when not to use this"
▸ Source precedence — the 5-item list (your sharpest differentiator)
▸ Supported declarations + explicit limitations  ← keep; it builds trust
▸ Documentation — 6 links to typespun.dev
▸ Compare to t3-env / envalid / plain Zod → /compare
▸ Contributing · Security · License
```

**Changes from today [REC]:**

- Add a playground link above the fold. It will become the most-clicked element.
- Add npm version and downloads badges (currently absent from the root README).
- Move the "How it works" 5-step compiler walkthrough to `/docs/concepts`. It
  is excellent content and wrong for a landing page.
- Cut "Compatibility and maturity" prose to one line + a link; it currently
  states `0.1.1` while npm ships `0.0.9`.
- Add the `/compare` link. Comparison intent is the highest-conversion traffic
  in this category and you already have the honest table written.
- Keep the limitations section. Stating what you _don't_ support is the
  cheapest credibility you will ever buy, and most packages won't do it.

---

## 6. API documentation strategy **[REC]**

**Keep the API reference hand-written. Do not add TypeDoc.**

The entire public surface is: 6 inert decorators, `ConfigError`, `ConfigIssue`,
`LoadConfigOptions`, `DeepPartial`, the `typespun/generated` ABI
(`createLoader`, `resolveConfig`, `validateTypedValue`), and three CLI commands.
`docs/api/` already covers all of it with better prose than any generator
produces, including behavioral contracts (exit codes, atomic writes, what
`source: {}` means) that TypeDoc cannot extract from signatures.

**What to automate instead** — the things that actually rot:

1. **Test the examples.** Extract fenced TypeScript from docs and typecheck it
   in CI against the built packages. This is the single highest-value docs
   automation for a codegen tool: it makes "examples work against the current
   API" a build invariant rather than a promise.
2. **Generate the CLI reference** from the same help strings the binary prints,
   so `docs/api/cli.md` cannot drift from `--help`.
3. **Generate the changelog** from conventional commits or Changesets.

Revisit generated API docs only if `typespun-codegen` ever exposes a real
programmatic surface.

---

## 7. SEO strategy **[REC]**

**Technical baseline** (mostly free with Fumadocs; verify each):

- Per-page `<title>` in the form `Page — Typespun` and a hand-written meta
  description. Never ship a templated description.
- OpenGraph + Twitter card per page. You already have
  `docs/assets/typespun-social-card.png`; generate per-page variants only later.
- `sitemap.xml`, `robots.txt`, self-referencing canonicals.
- `SoftwareApplication` / `TechArticle` JSON-LD on `/` and `/compare`. Skip
  elsewhere; marginal.
- URL convention: lowercase, hyphenated, no trailing slash, no dates in paths,
  stable forever. `/docs/<section>/<page>`.
- Permanent redirects for anything you move; never let a linked URL 404.
- Mobile: the playground needs a working narrow-viewport fallback (read-only
  output, editor collapsed) — half of link-click traffic is mobile **[ASSUME]**.
- Syntax highlighting with real TypeScript grammar, copy buttons on every block,
  and package-manager tabs (bun/npm/pnpm) that remember the choice.

**Positioning.** Do not chase head terms — `zod` and `dotenv` own them and you
will not outrank a 43k-star project. Target the specific, underserved queries
where Typespun is genuinely the best answer on the internet:

- configuration **precedence** across env + dotenv + YAML + overrides
- **redacting secrets in validation error output**
- **committing generated code** and checking staleness in CI

These have low competition because almost nobody has written them well, and
they are exactly what Typespun does.

**Also list on package-comparison aggregators** (PkgPulse, Best of JS, envtools
and similar). They rank for "X vs Y" queries and pull directly from npm and
GitHub metadata — which is another reason §1.3's fixes come first.

---

## 8. Distribution and backlinks

### High-value — genuinely useful things people link to

1. **The playground.** Shareable permalinks make it a citation target in Stack
   Overflow answers, issues, and Discord threads.
2. **Standard Schema compliance.** Earns a legitimate entry in the
   Standard Schema ecosystem and a real integration story with t3-env, tRPC,
   Hono, and TanStack Form.
3. **Awesome-list entries** where the category actually fits:
   `sindresorhus/awesome-nodejs`, `dzharii/awesome-typescript`,
   `awesomeeng/awesome-config`. Read each `CONTRIBUTING.md`; these are curated
   and a sloppy PR is a permanent rejection.
4. **GitHub topics** — `configuration`, `environment-variables`, `typescript`,
   `codegen`, `dotenv`, `bun`, `nodejs`, `type-safety`. The
   `environment-variables` and `configuration` topic pages are real, browsed
   discovery surfaces. (And delete `rust`.)
5. **Framework starter examples** in-repo: Hono, Fastify, NestJS, Next.js,
   Bun.serve — each a directory that runs, each a plausible link from those
   communities.
6. **Show HN + r/typescript.** Drafts already exist in
   `docs/launch/marketing-kit.md` and are appropriately non-promotional. Fire
   these _after_ §1.3 and the playground, not before — a 0-star repo with an
   empty description converts badly on HN, and you only get one shot.
7. **Answering real Stack Overflow / GitHub-discussion questions** about config
   precedence and typed env vars, where Typespun is honestly the best answer and
   you disclose authorship.
8. **A benchmark or comparison repo** (typia's model): a separate,
   reproducible repo others can run and cite.

### Low-value / avoid

- Cross-posting the same article to Dev.to, Hashnode, and Medium. Duplicate
  content, no authority, visible as spam.
- Directory-submission services and paid "dofollow" listings.
- Mass "N best TypeScript libraries" listicles you write yourself.
- Commenting Typespun links under unrelated posts.
- Any content whose only purpose is to carry a link.

The test: _would this page still be worth reading if Typespun did not exist?_
If no, don't write it.

---

## 9. Keyword and content map

**No search-volume figures appear below.** I have no keyword-tool access;
every priority is a **qualitative** judgment from SERP competition observed
during this research plus fit to Typespun's actual capabilities.

| Intent         | Example query                                          | Content type | Page                                 | Competition **[ASSUME]** | Priority |
| -------------- | ------------------------------------------------------ | ------------ | ------------------------------------ | ------------------------ | -------- |
| Problem        | "process.env is string undefined typescript"           | Guide        | `/docs/guides/process-env-types`     | High                     | High     |
| Problem        | "config precedence env vs yaml vs defaults node"       | Guide        | `/docs/concepts/precedence`          | **Low**                  | **High** |
| Problem        | "hide secret values in config validation errors"       | Guide        | `/docs/concepts/secrets`             | **Low**                  | **High** |
| Problem        | "detect stale generated code in CI"                    | Guide        | `/docs/guides/ci-check`              | **Low**                  | Medium   |
| Comparison     | "t3-env alternative"                                   | Comparison   | `/compare/t3-env`                    | Medium                   | **High** |
| Comparison     | "envalid vs zod env validation"                        | Comparison   | `/compare/envalid`                   | Medium                   | High     |
| Comparison     | "do I need a library for env vars"                     | Comparison   | `/compare`                           | High                     | Medium   |
| Comparison     | "should you commit generated code"                     | Opinion      | `/docs/concepts/generated-code`      | Medium                   | Medium   |
| Implementation | "type safe environment variables typescript"           | Tutorial     | `/docs/getting-started`              | **High**                 | High     |
| Implementation | "generate runtime validator from typescript interface" | Tutorial     | `/docs/guides/interface-to-loader`   | Medium                   | High     |
| Implementation | "typescript config yaml defaults env override"         | Tutorial     | `/docs/guides/layered-config`        | Low                      | High     |
| API            | "typespun loadConfig options"                          | Reference    | `/docs/reference/generated-loader`   | None                     | High     |
| API            | "typespun.json configuration"                          | Reference    | `/docs/reference/configuration`      | None                     | High     |
| API            | "ConfigError issues codes"                             | Reference    | `/docs/reference/runtime`            | None                     | Medium   |
| Integration    | "hono type safe config"                                | Guide        | `/docs/integrations/hono`            | Low                      | Medium   |
| Integration    | "fastify environment variable validation typescript"   | Guide        | `/docs/integrations/fastify`         | Medium                   | Medium   |
| Integration    | "nestjs config validation without class-validator"     | Guide        | `/docs/integrations/nestjs`          | Medium                   | Medium   |
| Integration    | "bun typed configuration"                              | Guide        | `/docs/integrations/bun`             | **Low**                  | High     |
| Integration    | "standard schema config"                               | Guide        | `/docs/integrations/standard-schema` | **Low**                  | High     |

The **Low**-competition rows are where Typespun can plausibly be the best page
on the internet. Weight effort there.

---

## 10. Content roadmap — first 14 pieces

Ordered by execution sequence, not by importance.

| #   | Title                                                                     | Intent      | Audience          | Why it can attract traffic                          | Feature shown          | Internal links              | Backlink potential          | Effort | Pri    |
| --- | ------------------------------------------------------------------------- | ----------- | ----------------- | --------------------------------------------------- | ---------------------- | --------------------------- | --------------------------- | ------ | ------ |
| 1   | Config precedence: the order your app should resolve settings in          | Problem     | Backend TS        | Near-nobody has written this well; library-agnostic | 5-level chain          | Getting started, playground | Aggregators, awesome-config | M      | **P0** |
| 2   | Typespun vs t3-env vs envalid vs plain Zod                                | Comparison  | Choosing          | Highest-conversion intent; table already drafted    | Whole model            | All docs                    | Comparison sites, Reddit    | M      | **P0** |
| 3   | Try it: generate a loader from a TypeScript interface (playground launch) | Brand       | Everyone          | Interactive demos get shared; typia's precedent     | End-to-end             | Everything                  | HN, Reddit, Discord         | L      | **P0** |
| 4   | Why `process.env` is `string \| undefined`, and the four ways out         | Problem     | All TS devs       | Universal pain, evergreen, honest survey            | Coercion               | Compare, getting started    | Stack Overflow              | M      | P0     |
| 5   | Keeping secrets out of your error messages                                | Problem     | Security-minded   | Genuinely underserved; a real differentiator        | `@secret`              | Validation docs             | Security newsletters        | M      | P1     |
| 6   | Catching stale generated code in CI                                       | Impl.       | Platform/DX       | Applies beyond Typespun; codegen users search it    | `config:check`         | Generated-code docs         | CI/DX writeups              | S      | P1     |
| 7   | Type-safe config for Hono                                                 | Integration | Hono users        | Growing community, thin config content              | Bun + loader           | Getting started             | Hono ecosystem docs         | S      | P1     |
| 8   | Type-safe config for Fastify                                              | Integration | Fastify users     | Large audience, established pattern                 | Node loader            | Getting started             | Fastify ecosystem           | S      | P1     |
| 9   | Typespun + Standard Schema: config that plugs into your stack             | Integration | Zod/Valibot users | Rides an ecosystem others are promoting             | Standard Schema export | Compare, reference          | standardschema.dev, t3-env  | M      | **P1** |
| 10  | Layered config: YAML defaults, dotenv, env, overrides                     | Impl.       | Multi-env teams   | 12-factor searches; concrete worked example         | Defaults + precedence  | Precedence, reference       | Deployment blogs            | M      | P1     |
| 11  | Should you commit generated code?                                         | Opinion     | Skeptics          | Perennial debate; defuses the main objection        | Determinism            | Generated-code docs         | HN, Reddit                  | M      | P2     |
| 12  | Type-safe config for NestJS without class-validator                       | Integration | NestJS users      | Large audience with a specific known pain           | Decorators             | Declarations docs           | NestJS community            | M      | P2     |
| 13  | Interfaces at runtime: what codegen can and can't recover                 | Deep tech   | Advanced TS       | Authority piece; cites typia; genuinely interesting | Analyzer               | Declarations, limits        | HN, TS newsletters          | L      | P2     |
| 14  | Typed config in Docker and 12-factor deployments                          | Impl.       | DevOps-ish        | Deployment searches; practical                      | Env + startup failure  | Precedence, CI              | Platform docs               | M      | P2     |

Every piece must satisfy: **useful even if the reader never installs Typespun.**
Pieces 1, 4, 6, and 11 pass that test most clearly — which is exactly why they
are the ones most likely to be linked.

---

## 11. GitHub + npm optimization checklist

### GitHub

- [ ] **Set the description.** Use the line already written in
      `marketing-kit.md`: _"Declare typed configuration once; generate a
      validated Node.js/Bun loader with explicit precedence and secret-aware
      diagnostics."_
- [ ] **Remove the `rust` topic.** Add: `configuration`,
      `environment-variables`, `dotenv`, `codegen`, `type-safety`, `nodejs`,
      `bun`, `config`.
- [ ] Point `homepageUrl` at `typespun.dev` (or the repo README until it exists)
      — anywhere but a circular npm link.
- [ ] Cut releases for `v0.0.7`–`v0.0.9` (or start clean at `0.1.2`) so GitHub
      releases match the registry.
- [ ] Add `CHANGELOG.md`; adopt Changesets or release-please.
- [ ] Enable Discussions as the support channel (`SUPPORT.md` exists; give it
      somewhere to point).
- [ ] Add a repo social preview image — `docs/assets/typespun-social-card.png`
      is already built and unused for this.
- [ ] Add 3–5 `good first issue`s. Contributor-readiness is a credibility
      signal even when nobody contributes.
- [ ] Pin the examples and playground in the repo sidebar.

### npm

- [ ] **Fix version ordering: publish `0.1.2` and set it as `latest`.** It is
      above every existing version and ends the `0.0.9`/`0.1.1` split.
- [ ] `npm deprecate typespun@0.1.0` and `@0.1.1` (3-file and 13-file stubs)
      with a message pointing to `0.1.2`. Same for `typespun-codegen`.
- [ ] Expand keywords to ~10 per package: `config`, `configuration`, `env`,
      `environment-variables`, `dotenv`, `typescript`, `type-safe`, `codegen`,
      `validation`, `bun`, `nodejs`, `12-factor`.
- [ ] **Re-examine `engines`.** `">=22 <23 || >=24 <25"` excludes Node 26.9.0,
      the Current line as of 2026-09-16, and Node 25. Unless there is a hard
      technical reason, `>=22` with documented tested lines is far less hostile.
      This silently blocks adopters and no amount of marketing fixes it.
- [ ] Publish with `--provenance` from CI. Free, visible trust badge.
- [ ] Reconcile the README's `0.1.1` claim with whatever `latest` actually is.
- [ ] Add npm version + downloads badges to the root README.
- [ ] **[REC]** Consider making `typespun` depend on `typespun-codegen` as an
      optional/peer dev dependency, or ship a single `typespun` package with the
      compiler behind a subpath — to collapse the two-install onboarding. This
      is a design decision with real trade-offs (the current split correctly
      keeps the TypeScript compiler out of production deps), so weigh it
      deliberately; but every competitor is one install and that gap is felt at
      exactly the moment someone is deciding whether to try you.

---

## 12. Documentation quality checklist

- [ ] Every fenced TypeScript block typechecks against the built packages, in CI.
- [ ] Every example is copy-pasteable with no elisions or `...` placeholders.
- [ ] Every install block offers bun / npm / pnpm.
- [ ] Console output shown in docs is real output, not paraphrase. _(Already
      true in `getting-started.md` — preserve this.)_
- [ ] Every page states its prerequisites or links to them.
- [ ] Limitations are stated on the same page as the capability, not buried.
      _(Already true — this is a genuine strength.)_
- [ ] Every page has a hand-written `<title>` and meta description.
- [ ] Search works and indexes code blocks.
- [ ] Mobile: no horizontal scroll; playground degrades gracefully.
- [ ] Dark mode on every page including the playground.
- [ ] Code blocks have copy buttons and language labels.
- [ ] External links open in place; no link-shorteners.
- [ ] Versioned docs **only once a breaking change ships** — not before.
- [ ] Changelog entries link to the PR and the docs page that changed.
- [ ] A docs link-checker runs in CI.
- [ ] Every "we recommend" is accompanied by "unless…".

---

## 13. Phased roadmap

### Phase 1 — Foundation (week 1)

| Work                                      | Effort | Impact   | Depends on       | Automatable          |
| ----------------------------------------- | ------ | -------- | ---------------- | -------------------- |
| GitHub description, topics, homepage      | 15 min | **High** | —                | No                   |
| npm `0.1.2` + deprecate stubs + dist-tags | 1 h    | **High** | Release decision | Partly               |
| `engines` decision                        | 1 h    | **High** | Testing on 26    | CI matrix            |
| CHANGELOG + release automation            | 3 h    | Med      | —                | **Yes** (Changesets) |
| Expand npm keywords/descriptions          | 30 min | Med      | —                | No                   |
| README trimmed to a landing page          | 4 h    | High     | —                | No                   |
| npm provenance publishing                 | 1 h    | Med      | CI               | **Yes**              |

_Nothing here requires a docs site. All of it raises conversion on traffic you
already get._

### Phase 2 — Proof (weeks 2–4)

| Work                                                                  | Effort | Impact      | Depends on   | Automatable        |
| --------------------------------------------------------------------- | ------ | ----------- | ------------ | ------------------ |
| Export `analyzeProgram`/`emitGeneratedModule` from codegen `index.ts` | 2 h    | Enabling    | —            | No                 |
| Playground (vfs + editor + live output + share links)                 | 3–5 d  | **Highest** | Export above | No                 |
| Fumadocs site on `typespun.dev`, 8 pages ported                       | 2–3 d  | High        | Domain       | Port is scriptable |
| `/compare` page                                                       | 1 d    | **High**    | Site         | No                 |
| SEO baseline (titles, OG, sitemap, canonicals)                        | 1 d    | Med         | Site         | **Mostly**         |
| Doc-example typecheck in CI                                           | 1 d    | Med         | —            | **Yes**            |

### Phase 3 — Distribution (weeks 5–8)

| Work                                                  | Effort | Impact             | Depends on              | Automatable |
| ----------------------------------------------------- | ------ | ------------------ | ----------------------- | ----------- |
| Standard Schema export                                | 3–5 d  | **High**           | Design decision         | No          |
| 4 framework example dirs (Hono, Fastify, NestJS, Bun) | 3 d    | Med                | —                       | CI-testable |
| Show HN + r/typescript (drafts exist)                 | 2 h    | **High, one-shot** | Phases 1–2 **complete** | No          |
| Awesome-list PRs                                      | 3 h    | Med                | Real traction           | No          |
| Articles 1, 4, 6                                      | 3 d    | Med                | Site                    | No          |

### Phase 4 — Authority (months 3–6)

| Work                             | Effort | Impact   | Depends on        | Automatable      |
| -------------------------------- | ------ | -------- | ----------------- | ---------------- |
| Benchmark/comparison repo        | 3 d    | Med      | Stable API        | **Yes** (CI-run) |
| Deep technical articles (11, 13) | 4 d    | Med      | Audience exists   | No               |
| Integration guides 7–9, 12       | 4 d    | Med      | Examples          | No               |
| 1.0 with a stability statement   | —      | **High** | Real usage        | No               |
| Case studies                     | —      | High     | An actual adopter | No               |

**Critical sequencing note:** Phase 3's Show HN post is a one-shot asset. Do not
fire it until Phase 1 and Phase 2 are genuinely finished. A front-page HN visit
landing on an empty GitHub description and a `rust` topic converts at a fraction
of what it should, and you cannot re-post.

---

## 14. Exact first-week action plan

Sequenced so the cheapest, highest-leverage work lands first. **No writing in
week one** — the writing is already done.

**Day 1 — Trust signals (≈2 hours, highest ROI in the whole report)**

1. Set the GitHub description to the `marketing-kit.md` line.
2. Remove `rust`; add `configuration`, `environment-variables`, `dotenv`,
   `codegen`, `config`, `type-safety`, `nodejs`, `bun`.
3. Set `homepageUrl` to the repo README (swap to `typespun.dev` later).
4. Upload the existing social card as the repo social preview.
5. Enable Discussions.

**Day 2 — Registry repair (≈3 hours)**

6. Decide and test the `engines` range against Node 26.9.0.
7. Publish `0.1.2` for both packages with `--provenance`; confirm `latest`.
8. `npm deprecate` `0.1.0` and `0.1.1` with a pointer to `0.1.2`.
9. Expand keywords and sharpen descriptions to carry the category words.
10. Cut matching GitHub releases so the two surfaces agree.

**Day 3 — Changelog and release hygiene (≈3 hours)**

11. Add `CHANGELOG.md` covering `0.0.4`→`0.1.2` honestly, including the
    version-ordering mistake. Owning it publicly is a credibility _gain_.
12. Wire up Changesets (or release-please) so this never recurs.

**Day 4 — README as a landing page (≈4 hours)**

13. Trim to ~120 lines per §5. Add npm version/downloads badges. Move "How it
    works" into `/docs`. Fix the `0.1.1` claim.
14. Add a "Compare to alternatives" section linking to
    `docs/launch/marketing-kit.md`'s honest table (promote it to
    `docs/compare.md` — it is too good to leave in a launch kit).

**Day 5 — Unblock the playground (≈4 hours)**

15. Export `analyzeProgram`, `emitGeneratedModule`, and the `contracts.ts` types
    from `packages/codegen/src/index.ts`, documented as unstable.
16. Spike it: `@typescript/vfs` + `analyzeProgram` + `emitGeneratedModule` in a
    browser page, producing generated output from a typed-in interface. Do not
    style it. The only question this spike answers is _does it work_ — and if it
    does, Phase 2 is de-risked and the rest of the plan follows.

**Explicitly not in week one:** the docs site, any article, any social post, any
awesome-list PR. Every one of those funnels into signals that are broken until
Day 3.

---

## Appendix — sources

- npm registry API (`registry.npmjs.org`, `api.npmjs.org`) — versions,
  dist-tags, sizes, download counts. Read 2026-09-22.
- GitHub REST API — stars, descriptions, topics, homepages. Read 2026-09-22.
- `nodejs.org/dist/index.json` — release lines. Read 2026-09-22.
- [typia.io/docs](https://typia.io/docs/) and
  [github.com/samchon/typia](https://github.com/samchon/typia)
- [env.t3.gg/docs/introduction](https://env.t3.gg/docs/introduction) and
  [github.com/t3-oss/t3-env](https://github.com/t3-oss/t3-env)
- [standardschema.dev](https://standardschema.dev/)
- [zod.dev](https://zod.dev), [arktype.io](https://arktype.io/),
  [sinclairzx81.github.io/typebox](https://sinclairzx81.github.io/typebox/)
- [github.com/af/envalid](https://github.com/af/envalid),
  [github.com/mozilla/node-convict](https://github.com/mozilla/node-convict),
  [github.com/motdotla/dotenv](https://github.com/motdotla/dotenv)
- [PkgPulse env-variable management guide, 2026](https://www.pkgpulse.com/guides/best-env-variable-management-nodejs-2026)
  — cited as an example of an aggregator that ranks for comparison queries, and
  as the source of the stale t3-env download figure corrected in §2.1.
- Repo audit: `packages/`, `docs/`, `.github/`, `examples/` at commit `c52b221`.
