# Documentation guidance

- Treat current source, exported types, tests, package manifests, and runnable
  examples as the source of truth, in that order.
- Keep the root README scannable and init-first. Put exhaustive behavior in the
  focused pages under `concepts/`, `api/`, and `reference/`.
- Show both packages in installation instructions: `typespun` is the runtime;
  `typespun-codegen` supplies the `typespun` executable.
- Do not describe `npx typespun init` as a zero-install command. It is the local
  executable after `typespun-codegen` has been installed. For a zero-install npm
  invocation, name `typespun-codegen` explicitly.
- Prefer `bun typespun init` for an installed Bun project and
  `npx typespun init` for an installed npm project; both resolve the executable
  provided by `typespun-codegen`.
- Keep examples internally consistent from declaration through generation and
  runtime loading. Never invent APIs, flags, environment-variable names, or
  compatibility claims.
- Document source precedence from highest to lowest and describe secret handling
  as diagnostic redaction, not encryption or storage protection.
- Preserve useful alt text and ensure every concept expressed visually also has
  a text equivalent.
- Check local Markdown links after edits and run `bun run check` from the
  repository root before reporting completion.
