# AGENTS.md

This file provides critical guidance to AI agents (such as Google Antigravity, Gemini, or Claude) when working with code in this repository.

## Token Optimization (RTK)

Always prefix command-line operations with `rtk` to optimize token consumption and filter noise.
* Run git operations, installation, or linting using the proxy.

Examples:
```bash
rtk pnpm lint
pnpm dev
rtk git status
rtk git diff
```

### RTK Meta Commands
```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Project Overview

Personal website/blog (fork of antfu.me), built with Vue 3 + Vite + Vite-SSG as a fully static site. Content lives as Markdown files that are auto-routed; there is no backend/API — everything ships as static HTML/JS at build time.

## Commands

```bash
rtk pnpm install       # Install dependencies
pnpm dev           # Start dev server on :3333
rtk pnpm build         # Full production build
rtk pnpm preview       # Preview production build locally
rtk pnpm lint          # Run eslint check
rtk pnpm static        # Copy sponsor assets and static dependencies
```

> [!IMPORTANT]
> There is no test suite/runner configured in this repo. Do not try to run tests or invent test commands.
> `rtk pnpm lint` runs automatically on git staged files. Any lint issues will block commits.

## Architecture Guidelines

### 1. Auto-Imports & Components
This project heavily uses auto-imports for both Vue APIs and components.
* **Do NOT manually import** core APIs (e.g., `ref`, `computed`, `onMounted`, etc.) or components defined in `src/components/`.
* They are auto-imported via `unplugin-auto-import` and `unplugin-vue-components`.
* Refer to `auto-imports.d.ts` and `components.d.ts` if you want to verify if a function or component is auto-imported.

### 2. Routing & Content Pipeline
* **Auto-Routing**: Routes are auto-generated from `pages/` via `vue-router/vite`. Adding a `.vue` or `.md` file to `pages/` automatically makes it a route. No manual route mapping is needed.
* **Markdown rendering**: Markdown pages compile using `unplugin-vue-markdown`, styled via `WrapperDemo` or `WrapperPost`.
* **Shiki & Mermaid**: Shiki handles code formatting. Mermaid syntax blocks are converted into client-side `<Mermaid />` components.
* **OG Images**: Auto-generated in `vite.config.ts` via `scripts/og-template.svg` + `sharp`.

### 3. Styling & Icons
* **Primary system**: UnoCSS (config in `unocss.config.ts`).
* Custom vanilla CSS lives in `src/styles/` (`main.css`, `prose.css`, `markdown.css`).
* **Icons**: Unplugin-icons (Iconify) resolves icons directly by name with no prefix.

### 4. Standalone Scripts (`scripts/`)
* Standalone tasks run via `tsx` (e.g., RSS feed generation, redirect calculations, images compression, sponsor avatars data).

## Content Authoring
* **Posts**: Place markdown files under `pages/posts/` and set `lang: 'en'` for inclusion in RSS.
* **Standalone Pages**: Add `.md` or `.vue` files directly inside `pages/`.
