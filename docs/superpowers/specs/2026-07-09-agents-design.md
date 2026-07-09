# Design: agents.md Configuration for AI Agents

This document defines the structure and contents of the new `agents.md` file, which guides AI agents (specifically Google Antigravity and Gemini) on project rules, architectures, and guidelines in this repository.

## 1. Objectives

- Provide clear guidance to AI agents about repo-specific constraints.
- Prevent agents from writing duplicate imports when components and APIs are auto-imported.
- Document token optimization rules (using the `rtk` proxy).
- Outline the project structure and build/compilation quirks.

## 2. File Structure of `agents.md`

The file will be located at the root of the repository: `/agents.md`.
It will contain:
1. **Introduction**: Explaining that it guides AI agents (e.g. Gemini, Antigravity).
2. **RTK Integration**: Shell command rules, prefixing all commands with `rtk` to save tokens.
3. **Project Stack & Commands**: `pnpm` workspace details, lack of test runner.
4. **Architectural Guardrails**:
   - Route Auto-Generation (under `pages/`).
   - Auto-Importing (referring to `auto-imports.d.ts` and `components.d.ts`).
   - Markdown parsing pipeline (Shiki dual theme, client-side Mermaid).
   - OG image auto-generation.
5. **Content Authoring Conventions**: How to add blog posts and pages.

## 3. Scope and Verification

- **Scope**: Write the new `agents.md` at the repository root.
- **Verification**: Run `rtk pnpm lint` to ensure no issues are introduced (though it's a markdown file, it's excluded from build/runtime but should not conflict with eslint).
