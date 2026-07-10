# Design: Projects Page and Sponsor Section Update

This document outlines the modifications required to comment out the sponsor section and update the active "Current Focus" projects on the projects page.

## 1. Objectives

- Hide the sponsor buttons section from the projects list component.
- Keep the old "Current Focus" projects in `projects.md` by commenting them out in the YAML frontmatter.
- Add the three new projects (`MovieCrush`, `kitsugi`, and `TeachHub`) under a new active `Current Focus` section.

## 2. Changes

### 2.1. `src/components/ListProjects.vue`
Comment out the `<SponsorButtons />` component at the bottom of the project list.
```vue
      <!-- <SponsorButtons /> -->
```

### 2.2. `pages/projects.md`
Comment out the existing list under `Current Focus` and add the new three projects: `MovieCrush` (MovieCrush Sunshine), `kitsugi`, and `TeachHub`.
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

## 3. Verification

- Run `rtk pnpm lint` to ensure ESLint rules pass.
- Run `rtk pnpm build` to verify the static site generator compiles successfully.
