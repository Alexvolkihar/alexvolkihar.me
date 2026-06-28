# Design Spec: Homepage and Logo Update

Update the name on the homepage from "Anthony Fu" to "Alexis Mabanza", and update the animated SVG logo in the header from "af" to "am".

## Context

The portfolio is being personalized for Alexis Mabanza. The homepage greeting and the animated signature logo in the header need to reflect the user's name and initials ("am" instead of "af").

## Proposed Changes

### 1. Homepage (`pages/index.md`)

Update the title, description, and greeting text to use "Alexis Mabanza".

```diff
- title: Anthony Fu
- description: Anthony Fu's Portfolio
+ title: Alexis Mabanza
+ description: Alexis Mabanza's Portfolio
```

```diff
- Hey! I'm Anthony Fu, a fanatical open sourceror and design engineer.
+ Hey! I'm Alexis Mabanza, a fanatical open sourceror and design engineer.
```

### 2. Animated SVG Logo (`src/components/Logo.vue` & `src/components/LogoStroke.vue`)

- Update SVG `<title>` to `Alexis Mabanza @ alexvolkihar.ovh`.
- Update the SVG path to draw a cursive "am" instead of "af":
  `d="M46.1438 41.1245C47.1438 32.6245 40.841 29.2545 33.341 38.0027C21.341 52 37.341 63 43.8251 46.6245C45.781 43.1245 46.1438 38.0027 46.1438 38.0027C45.5227 43.2757 44.3251 45.6045 44.3251 49.6245C46.5 42 48.5 35 51.5 35C53.5 35 53 52 54 58C55 51 57 35 60 35C62.5 35 62 52 63 58C64 51 66 35 69 35C71.5 35 71 52 72 58C72.5 61 74 61 77 52"`
- For `Logo.vue`, remove the original mask (which clips the strokes to fit "af" only) and render the path directly.

## Verification Plan

1. Run `pnpm dev` to check the local rendering.
2. Verify the SVG paths are syntactically valid and draw correctly.
