<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles: Placeholder principles -> Content-First Markdown; Placeholder principles -> Static-First Builds; Placeholder principles -> Intentional Visual Craft; Placeholder principles -> Media, Routes, and Metadata Integrity; Placeholder principles -> Small, Idempotent Automation
Added sections: Additional Constraints; Development Workflow
Removed sections: none
Templates requiring updates: ✅ reviewed .specify/templates/plan-template.md; ✅ reviewed .specify/templates/spec-template.md; ✅ reviewed .specify/templates/tasks-template.md; ⚠ no .specify/templates/commands/*.md files exist in this repo
Deferred items: TODO(RATIFICATION_DATE) original adoption date is not available in the repository history
-->

# antfu.me Constitution

## Core Principles

### I. Content-First Markdown
All public pages and posts MUST originate from Markdown content in `pages/` or
from explicit Vue components in `pages/` when Markdown is not sufficient.
Frontmatter, `data/` modules, and content files are the source of truth.
Generated artifacts such as RSS, OG images, redirects, and build output MUST
never be edited manually.

Rationale: the site stays easy to review, easy to diff, and easy to regenerate
from source.

### II. Static-First Builds
The site MUST remain buildable as a reproducible static site using the checked-in
pnpm scripts and the Vite/Vite-SSG pipeline. Any new build step, content
transform, or generation script MUST be deterministic and runnable from a clean
checkout.

Rationale: the published site must match the repository state, not local drift.

### III. Intentional Visual Craft
User-facing changes MUST preserve readability, responsive layout, and the
existing visual language of the site. New UI MUST use the established design
primitives and MUST NOT introduce a framework overhaul or new interaction model
without an explicit redesign plan.

Rationale: the site is a personal portfolio and publication surface; cohesion is
part of the product.

### IV. Media, Routes, and Metadata Integrity
Content, media, and URLs MUST stay consistent. When source content changes,
pages, posts, frontmatter, feed entries, OG images, redirects, and photo metadata
MUST be updated together. External assets MUST carry the correct license or
attribution context before they are published.

Rationale: broken previews, stale feeds, and incorrect licensing are publishing
errors, not minor polish issues.

### V. Small, Idempotent Automation
Scripts and automation in `scripts/` MUST be narrow, idempotent, and reviewable.
Changes that affect feeds, redirects, image compression, or generated assets
MUST include a validation step in docs or commands. Destructive or broad scripts
are forbidden unless the plan explicitly justifies them.

Rationale: automation touches published artifacts and must fail safely.

## Additional Constraints

### Technology Stack
The implementation stack is Vue 3, Vite, Vite-SSG, TypeScript, UnoCSS, Pinia,
and the Markdown pipeline already defined in the repository. New work MUST stay
compatible with this stack unless a migration plan is explicitly approved.

### Content and Licensing
Code in this repository is licensed under MIT, and words and images are licensed
under CC BY-NC-SA 4.0 unless a file states otherwise. Any third-party media,
embeds, or generated assets MUST be checked for licensing and attribution before
merge.

## Development Workflow

### Validation Gates
Any change touching `pages/`, `src/`, `scripts/`, `vite.config.ts`, or public
assets MUST run the relevant focused checks and MUST pass `pnpm build` before
release or merge. Markdown-only content edits MUST still be previewed on the
affected route.

### Documentation Sync
If a change alters routes, feeds, redirects, OG image behavior, or content
structure, the supporting docs in `README.md` or `SITE-ARCHITECTURE.md` MUST be
updated in the same change.

### Quality Bar
No change MAY introduce a broken route, missing asset, failing lint step, or
failing build. If a change cannot be validated locally, it MUST remain out of
merge scope until the validation path is restored.

## Governance

This constitution supersedes other process guidance when there is a conflict.
Amendments require an explicit update to this file, a short rationale, and a
version bump recorded below.

Versioning policy:
- MAJOR: principle removal, redefinition, or other backward-incompatible
	governance changes.
- MINOR: new principle, new section, or materially expanded guidance.
- PATCH: clarifications, wording fixes, and other non-semantic refinements.

Compliance review expectations:
- Every relevant change review MUST check the work against the principles above.
- Any intentional exception MUST be documented in the plan or change notes.
- If a principle cannot be satisfied, the plan MUST explain why the exception is
	necessary and what compensating control is used.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE) | **Last Amended**:
2026-05-31
