# Contributing to autodocs

Thanks for your interest in contributing! Here's how to get started.

## Setup

```bash
git clone https://github.com/skoppisetty/autodocs.git
cd autodocs
npm install
npm run build
```

## Development

```bash
npm run dev    # watch mode — recompiles on changes
```

Test your changes locally:

```bash
cd /path/to/any/project
node /path/to/autodocs/bin/autodocs.mjs init
node /path/to/autodocs/bin/autodocs.mjs generate
node /path/to/autodocs/bin/autodocs.mjs dev
```

## Project structure

```
src/
  cli.ts        — CLI command definitions (commander)
  config.ts     — Config loading, validation, types
  init.ts       — autodocs init command
  generate.ts   — Doc generation pipeline (source hashing, AI invocation)
  scaffold.ts   — Fumadocs app scaffolding (template copy, overlays)
  dev.ts        — Local preview server
  build.ts      — Production build
  deploy.ts     — Vercel deployment
  index.ts      — Public API exports
skill/
  SKILL.md      — System prompt for the AI doc generator
templates/
  fumadocs/     — Fumadocs app template (copied into .autodocs/)
```

## Key concepts

- **Template**: The Fumadocs app in `templates/fumadocs/` is copied into `.autodocs/` at scaffold time. We own this copy (shadcn-style) — modify it directly.
- **Overlays**: `global.css` and `lib/layout.shared.tsx` are generated from config during scaffold, overwriting the template copies.
- **Source cache**: File hashes in `.autodocs/cache/source-cache.json` track what changed between generations.
- **SKILL.md**: The prompt that tells the AI how to write docs. Changes here affect generation quality.

## Making changes

### Adding a config option

1. Add the field to `AutodocsConfig` in `src/config.ts`
2. Use it in the relevant source file (generate.ts, scaffold.ts, etc.)
3. Update `src/init.ts` if it should be in the default config
4. The AI will document it automatically on next generation

### Modifying the template

Edit files in `templates/fumadocs/` directly. Test with `autodocs dev` to see changes.

### Changing the AI prompt

Edit `skill/SKILL.md`. Test with `autodocs generate --force`.

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Run `npx tsc --noEmit` before submitting
- Include a brief description of what changed and why

## Questions?

Open an issue at https://github.com/skoppisetty/autodocs/issues
