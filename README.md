# autodocs

[![npm](https://img.shields.io/npm/v/@cueframe/autodocs.svg)](https://www.npmjs.com/package/@cueframe/autodocs)
[![CI](https://github.com/skoppisetty/autodocs/actions/workflows/ci.yml/badge.svg)](https://github.com/skoppisetty/autodocs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

AI-powered documentation generator. Reads your source code, writes MDX docs, and serves them with a beautiful docs site — no API keys required.

Uses the AI CLI tools you already have installed (Claude Code, Codex, or Gemini CLI) via your existing subscription.

## Quick start

```bash
npx @cueframe/autodocs init
npx @cueframe/autodocs generate
npx @cueframe/autodocs dev
```

## How it works

1. **`init`** — creates `autodocs.config.json` and a `docs/` directory
2. **`generate`** — spawns your AI CLI to read source code and write MDX documentation
3. **`dev`** — starts a local preview at localhost:3000
4. **`build`** — builds the docs site for deployment

The generated docs site includes full-text search, dark mode, OG images, and LLM-friendly routes (`/llms.txt`).

## Prerequisites

At least one AI CLI installed:

| CLI | Install |
|-----|---------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex | `npm install -g @openai/codex` |
| Gemini CLI | `npm install -g @google/gemini-cli` |

## Configuration

`autodocs.config.json`:

```json
{
  "output": "docs",
  "include": ["src/**"],
  "exclude": ["**/test*", "**/node_modules/**", "**/dist/**"],
  "theme": "black",
  "title": "My Project",
  "github": {
    "user": "your-username",
    "repo": "your-repo"
  }
}
```

### Options

| Field | Default | Description |
|-------|---------|-------------|
| `output` | `"docs"` | Directory for generated MDX files |
| `include` | `["src/**"]` | Glob patterns for source files to document |
| `exclude` | `["**/test*", ...]` | Glob patterns to skip |
| `theme` | `"black"` | Fumadocs theme: black, neutral, ocean, purple, dusk, catppuccin, vitepress, solar, emerald, ruby, aspen |
| `title` | `"Documentation"` | Site title shown in nav and OG images |
| `github` | — | GitHub repo for header link and "Edit on GitHub" |
| `instructions` | — | Additional instructions for the AI when generating docs |

## CLI usage

```bash
# Generate docs (incremental — only updates changed files)
autodocs generate

# Force regenerate all docs
autodocs generate --force

# Use a specific AI CLI
autodocs generate --cli claude

# Start local preview
autodocs dev

# Build for deployment
autodocs build
```

## Features

- **Incremental generation** — only regenerates docs when source files change (tracked via git)
- **Full-text search** — built-in search powered by Fumadocs
- **Dark mode** — automatic light/dark theme switching
- **OG images** — auto-generated social preview images for every page
- **LLM routes** — `/llms.txt` and `/llms-full.txt` for AI consumption
- **11 themes** — choose from Fumadocs built-in themes
- **Any AI CLI** — works with Claude Code, Codex, or Gemini CLI

## Built with

- [Fumadocs](https://fumadocs.dev) — documentation framework
- [cli-agents](https://github.com/skoppisetty/cli-agents-rs) — unified AI CLI interface
- [Next.js](https://nextjs.org) — React framework

## License

MIT
