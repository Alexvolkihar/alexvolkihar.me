# Homepage and Logo Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the homepage name to "Alexis Mabanza" and the animated SVG logo to draw "am".

**Architecture:** Edit `pages/index.md` for text updates, and modify `src/components/Logo.vue` and `src/components/LogoStroke.vue` to update the SVG path.

**Tech Stack:** Vue 3, SVG animation

---

### Task 1: Update homepage text content

**Files:**
- Modify: `pages/index.md:2-3`, `pages/index.md:8`

- [ ] **Step 1: Modify the homepage frontmatter and greeting**

Change:
```markdown
title: Anthony Fu
description: Anthony Fu's Portfolio
```
to:
```markdown
title: Alexis Mabanza
description: Alexis Mabanza's Portfolio
```

And change:
```markdown
Hey! I'm Anthony Fu, a fanatical open sourceror and design engineer.
```
to:
```markdown
Hey! I'm Alexis Mabanza, a fanatical open sourceror and design engineer.
```

- [ ] **Step 2: Commit the change**

Run:
```bash
git add pages/index.md
git commit -m "chore: update homepage name to Alexis Mabanza"
```

### Task 2: Update LogoStroke component

**Files:**
- Modify: `src/components/LogoStroke.vue`

- [ ] **Step 1: Edit LogoStroke.vue**

Update `<title>` to:
`Alexis Mabanza @ alexvolkihar.ovh`

Update the `<path>`'s `d` attribute to:
`M46.1438 41.1245C47.1438 32.6245 40.841 29.2545 33.341 38.0027C21.341 52 37.341 63 43.8251 46.6245C45.781 43.1245 46.1438 38.0027 46.1438 38.0027C45.5227 43.2757 44.3251 45.6045 44.3251 49.6245C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52`

- [ ] **Step 2: Commit the change**

Run:
```bash
git add src/components/LogoStroke.vue
git commit -m "feat: update LogoStroke path to draw cursive am"
```

### Task 3: Update Logo component

**Files:**
- Modify: `src/components/Logo.vue`

- [ ] **Step 1: Edit Logo.vue**

Replace the template in `src/components/Logo.vue` to render the path directly without the mask (since the mask was specific to "af").

New template structure:
```vue
<template>
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <title>Alexis Mabanza @ alexvolkihar.ovh</title>
    <path
      class="path1"
      d="M46.1438 41.1245C47.1438 32.6245 40.841 29.2545 33.341 38.0027C21.341 52 37.341 63 43.8251 46.6245C45.781 43.1245 46.1438 38.0027 46.1438 38.0027C45.5227 43.2757 44.3251 45.6045 44.3251 49.6245C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52"
      stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
    />
  </svg>
</template>
```

- [ ] **Step 2: Commit the change**

Run:
```bash
git add src/components/Logo.vue
git commit -m "feat: update Logo path to draw cursive am"
```
