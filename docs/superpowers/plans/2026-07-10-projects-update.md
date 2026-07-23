# Projects Page Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the sponsorship section and update the active projects in the "Current Focus" section, preserving the old focus commented out.

**Architecture:** Comment out the `<SponsorButtons />` tag in the `ListProjects.vue` component, and modify the YAML frontmatter in `projects.md` to comment out previous focus items and define new projects.

**Tech Stack:** Vue 3 / SFC, UnoCSS, Markdown/YAML

---

### Task 1: Update ListProjects.vue

**Files:**
- Modify: `/Users/alexvolkihar/Documents/projetsPersos/alexvolkihar.me/src/components/ListProjects.vue`

- [ ] **Step 1: Comment out SponsorButtons component**

In `/Users/alexvolkihar/Documents/projetsPersos/alexvolkihar.me/src/components/ListProjects.vue`, replace line 101:
```vue
      <SponsorButtons />
```
with:
```vue
      <!-- <SponsorButtons /> -->
```

- [ ] **Step 2: Verify lint rules**

Run: `rtk pnpm lint`
Expected: Success with no lint errors on staged/modified files.

- [ ] **Step 3: Commit the changes**

Run:
```bash
rtk git add src/components/ListProjects.vue
rtk git commit -m "chore: comment out SponsorButtons on projects page"
```
Expected: Successfully committed.

---

### Task 2: Update projects.md Frontmatter

**Files:**
- Modify: `/Users/alexvolkihar/Documents/projetsPersos/alexvolkihar.me/pages/projects.md`

- [ ] **Step 1: Update Current Focus projects**

In `/Users/alexvolkihar/Documents/projetsPersos/alexvolkihar.me/pages/projects.md`, comment out the old `Current Focus` items and add the new three projects (`MovieCrush`, `kitsugi`, and `TeachHub`):

Replace lines 7-21:
```yaml
projects:
  Current Focus:
    - name: 'Vite DevTools'
      link: 'https://github.com/vitejs/devtools'
      desc: 'Inspect the intermediate state of Vite bundle and pipeline'
      icon: 'i-simple-icons-vite'
    - name: 'Nuxt DevTools'
      link: 'https://github.com/nuxt/devtools'
      desc: 'Unleash Nuxt Developer Experience'
      icon: 'i-logos-nuxt-icon saturate-0'
    - name: 'Nuxt Playground'
      link: 'https://github.com/nuxt/learn.nuxt.com'
      desc: 'Interactive Playground for learning Nuxt'
      icon: 'i-logos-nuxt-icon saturate-0'
```
with:
```yaml
projects:
  Current Focus:
    - name: 'MovieCrush'
      link: '#'
      desc: 'MovieCrush Sunshine - A movie tracking and recommendation web application.'
      icon: 'i-mdi-movie-open-outline'
    - name: 'kitsugi'
      link: '#'
      desc: 'A personal space for reflection, mental well-being, and resilience.'
      icon: 'i-mdi-heart-outline'
    - name: 'TeachHub'
      link: '#'
      desc: 'An educational hub for managing courses, resources, and learning materials.'
      icon: 'i-mdi-school-outline'

#   Old Current Focus:
#     - name: 'Vite DevTools'
#       link: 'https://github.com/vitejs/devtools'
#       desc: 'Inspect the intermediate state of Vite bundle and pipeline'
#       icon: 'i-simple-icons-vite'
#     - name: 'Nuxt DevTools'
#       link: 'https://github.com/nuxt/devtools'
#       desc: 'Unleash Nuxt Developer Experience'
#       icon: 'i-logos-nuxt-icon saturate-0'
#     - name: 'Nuxt Playground'
#       link: 'https://github.com/nuxt/learn.nuxt.com'
#       desc: 'Interactive Playground for learning Nuxt'
#       icon: 'i-logos-nuxt-icon saturate-0'
```

- [ ] **Step 2: Verify lint rules**

Run: `rtk pnpm lint`
Expected: Success with no lint errors on modified files.

- [ ] **Step 3: Commit the changes**

Run:
```bash
rtk git add pages/projects.md
rtk git commit -m "feat(projects): update current focus projects and comment out old ones"
```
Expected: Successfully committed.
