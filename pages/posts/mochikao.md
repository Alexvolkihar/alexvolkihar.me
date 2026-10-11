---
title: "mochikao: a face for every name"
date: 2026-10-11T00:00:00Z
lang: en
art: random
image: /images/mochikao-home.png
duration: 6min
description: mochikao turns any string into a small SVG character, the same one every time. How it works, why it stays small, and what its limits are.
---

> [Version Française](/posts/mochikao-fr) | [日本語版](/posts/mochikao-ja)

[mochikao](https://github.com/Alexvolkihar/mochikao) turns any string (a username, an email, an ID) into a small SVG character. The same string always gives the same character, on the server, in the browser, in a script. There is no network call, no storage and no state.

Use it for default avatars that have some personality and cost nothing to run. [blobatar](https://blobatar.dev) inspired it. The name combines *mochi* and *kao* (顔, "face" in Japanese). The project was first called `bulle`, then `bouille`.

![The mochikao home page: a typed name, the generated avatar and the expression picker](/images/mochikao-home.png)

## Try it

- Website and editor: [mochikao.alexvolkihar.ovh](https://mochikao.alexvolkihar.ovh)
- npm: [npmjs.com/package/mochikao](https://www.npmjs.com/package/mochikao)
- Source: [GitHub](https://github.com/Alexvolkihar/mochikao)

Install it:

```bash
npm i mochikao
```

Use it from JavaScript:

```ts
import { mochikao, resolve } from 'mochikao';

const svg = mochikao({ name: 'alex@mail.com', size: 64, background: 'squircle' });
resolve('alex'); // { shape: 'boxy', eyes: 'dot', mouth: 'cat', extra: 'blush', hue: 348, ... }
```

In React (the same props exist for Vue, Svelte and Solid):

```tsx
import { Mochikao } from 'mochikao/react';

<Mochikao name="alex" size={48} animate="hover" />
```

From the command line, without installing anything:

```bash
npx mochikao alex --bg circle --expression happy -o alex.svg
```

Or as a plain image URL:

```html
<img src="https://mochikao.alexvolkihar.ovh/api/alex.svg?bg=circle" width="64" height="64" alt="alex">
```

## Same name, same face

The name is hashed with `cyrb53`, and the hash seeds a `mulberry32` generator. Every trait (the body shape, the eyes, the mouth, the accessory, the hue) is a draw from that generator. Nothing else is involved, so nothing has to be stored.

The catch is that the draws are order-sensitive. If I add a new mouth to the list, or draw one more number before the eyes, every existing avatar changes. So the seed carries a prefix with a generation number (`GENERATION` in `src/traits.ts`), and a test pins the traits of `alex` so that an accidental change fails the build.

Before the first release, visible changes were fine. After it, any change to the order of the lists means bumping the generation on purpose, and accepting that faces move.

## What is in the box

- 10 blob shapes, plus two optional families: 6 animals and 6 fruits and vegetables.
- 5 eyes, 6 mouths, 11 accessories, 8 expressions (`idle`, `happy`, `sad`, `mad`, `love`, `shy`, `sick`, `thinking`).
- 10 continuous axes you can pin (body size, squareness, eye spacing, gaze, mouth size…) and 6 color presets.
- A contrast of at least 4.5:1 between the face and the body, for every hue and tone. A test checks it across the whole range, so the face always stands out from the body.

![The mochikao editor in dark mode: a bunny, other names with the same settings, and the panel of pinnable settings](/images/mochikao-editor.png)

Pinning one axis leaves the others alone. You can force the shape and keep the color and the face that come from the name.

## Small on purpose

The library has no dependencies and weighs about 7 KB min+gzip. The optional families are separate modules you import and pass as an option:

```ts
import { mochikao } from 'mochikao';
import { animals } from 'mochikao/animals';

mochikao({ name: 'alex', family: animals });
```

A family is a plain object, not a string and not a side-effect registration. That keeps the core small and lets bundlers drop what you don't use (`sideEffects: false`). The animals cost +1.1 KB, the produce +1.5 KB, and only if you import them.

The framework components follow the same idea. Without animation, `<Mochikao>` renders a plain `<img>` with a data URI: one DOM node instead of about twenty, which matters in a long list. With `animate`, it switches to inline SVG, because the animation needs it.

```tsx
import { Mochikao } from 'mochikao/react';

<Mochikao name="alex" size={48} animate="hover" />
```

The same API exists for Vue, Svelte, Solid, a web component, an HTTP endpoint (`/api/<name>.svg`) and a CLI.

## Limits

- An `<img>` cannot animate, so no animation and no expression transition without `animate` or `inline`.
- Two different names can look alike. mochikao is a stand-in, not an identity.
- Pointer-tracking eyes (`gaze`) add a listener per avatar. That is fine for a few dozen, not for hundreds.
- Choose a stable key. If a user can rename themselves, hash their ID, not their pseudonym.

The code is on [GitHub](https://github.com/Alexvolkihar/mochikao) and the package on [npm](https://www.npmjs.com/package/mochikao), MIT licensed.
