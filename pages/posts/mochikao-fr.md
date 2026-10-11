---
title: "mochikao : un visage pour chaque nom"
date: 2026-10-11T00:00:00Z
lang: fr
art: random
image: /images/mochikao-home.png
duration: 6min
description: mochikao transforme n'importe quelle chaîne en un petit personnage SVG, toujours le même. Comment ça marche, pourquoi il reste petit, et comment je le publie sur npm.
---

> [English Version](/posts/mochikao) | [日本語版](/posts/mochikao-ja)

[mochikao](https://github.com/Alexvolkihar/mochikao) transforme n'importe quelle chaîne (un pseudo, un e-mail, un id) en un petit personnage SVG. La même chaîne donne toujours le même personnage, sur le serveur, dans le navigateur, dans un script. Pas d'appel réseau, pas de stockage, pas d'état.

Il sert à fabriquer des avatars par défaut qui ont de la personnalité et ne coûtent rien à faire tourner. [blobatar](https://blobatar.dev) l'a inspiré. Le nom associe *mochi* et *kao* (顔, « visage » en japonais). Le projet s'est d'abord appelé `bulle`, puis `bouille`.

![La page d'accueil de mochikao : un nom tapé, l'avatar généré et le choix d'expression](/images/mochikao-home.png)

## L'essayer

- Site et éditeur : [mochikao.alexvolkihar.ovh](https://mochikao.alexvolkihar.ovh)
- npm : [npmjs.com/package/mochikao](https://www.npmjs.com/package/mochikao)
- Code source : [GitHub](https://github.com/Alexvolkihar/mochikao)

Pour l'installer :

```bash
npm i mochikao
```

Pour l'utiliser en JavaScript :

```ts
import { mochikao, resolve } from 'mochikao';

const svg = mochikao({ name: 'alex@mail.com', size: 64, background: 'squircle' });
resolve('alex'); // { shape: 'boxy', eyes: 'dot', mouth: 'cat', extra: 'blush', hue: 348, ... }
```

Avec React (les mêmes props existent pour Vue, Svelte et Solid) :

```tsx
import { Mochikao } from 'mochikao/react';

<Mochikao name="alex" size={48} animate="hover" />
```

En ligne de commande, sans rien installer :

```bash
npx mochikao alex --bg circle --expression happy -o alex.svg
```

Ou comme simple URL d'image :

```html
<img src="https://mochikao.alexvolkihar.ovh/api/alex.svg?bg=circle" width="64" height="64" alt="alex">
```

## Même nom, même visage

Le nom est haché avec `cyrb53`, et le hash initialise un générateur `mulberry32`. Chaque trait (la forme du corps, les yeux, la bouche, l'accessoire, la teinte) est un tirage de ce générateur. Rien d'autre n'entre en jeu, donc il n'y a rien à stocker.

Le piège, c'est que les tirages dépendent de l'ordre. Si j'ajoute une bouche à la liste, ou si je tire un nombre de plus avant les yeux, tous les avatars existants changent. La graine porte donc un préfixe avec un numéro de génération (`GENERATION` dans `src/traits.ts`), et un test fige les traits de `alex` pour qu'un changement accidentel fasse échouer le build.

Avant la première publication, des changements visibles restaient acceptables. Après, toute modification de l'ordre des listes passe par une montée de génération, volontaire, en acceptant que les visages bougent.

## Ce qu'il y a dedans

- 10 formes de blobs, plus deux familles optionnelles : 6 animaux et 6 fruits et légumes.
- 5 yeux, 6 bouches, 11 accessoires, 8 expressions (`idle`, `happy`, `sad`, `mad`, `love`, `shy`, `sick`, `thinking`).
- 10 axes continus à épingler (taille du corps, carrure, écart des yeux, regard, taille de la bouche…) et 6 préréglages de couleur.
- Un contraste d'au moins 4.5:1 entre le visage et le corps, pour toute teinte et tout ton. Un test le vérifie sur toute la plage, donc le visage se détache toujours du corps.

![L'éditeur de mochikao en thème sombre : un lapin, d'autres noms avec les mêmes réglages, le panneau de réglages à épingler](/images/mochikao-editor.png)

Épingler un axe ne touche pas aux autres. On peut forcer la forme et garder la couleur et le visage qui viennent du nom.

## Petit exprès

La bibliothèque n'a aucune dépendance et pèse environ 7 Ko min+gzip. Les familles optionnelles sont des modules séparés qu'on importe et qu'on passe en option :

```ts
import { mochikao } from 'mochikao';
import { animals } from 'mochikao/animals';

mochikao({ name: 'alex', family: animals });
```

Une famille est un simple objet, pas une chaîne ni une inscription par effet de bord. Le cœur reste petit et les bundlers écartent ce qu'on n'utilise pas (`sideEffects: false`). Les animaux coûtent +1,1 Ko, les fruits et légumes +1,5 Ko, et seulement si on les importe.

Les composants de framework suivent la même idée. Sans animation, `<Mochikao>` rend un simple `<img>` avec une data URI : un nœud DOM au lieu d'une vingtaine, ce qui compte dans une longue liste. Avec `animate`, il passe en SVG en ligne, parce que l'animation en a besoin.

```tsx
import { Mochikao } from 'mochikao/react';

<Mochikao name="alex" size={48} animate="hover" />
```

La même API existe pour Vue, Svelte, Solid, un web component, un point d'accès HTTP (`/api/<nom>.svg`) et un CLI.

## La publication

Le paquet est publié depuis GitHub Actions avec le *trusted publishing* de npm : le workflow prouve son identité à npm par OIDC, donc aucun jeton npm n'est stocké nulle part, et chaque version porte une attestation de provenance.

Le workflow se contente de lancer `npm stage publish`, qui met la version dans une file d'attente : un workflow compromis ne peut donc pas publier seul. Rien n'est en ligne tant que je ne l'ai pas approuvée avec mon second facteur.

```bash
npm version patch
git push --follow-tags     # le workflow met la version en file
npm stage approve <id>     # j'approuve avec la 2FA
```

Ça ajoute quelques secondes par version, en échange d'un contrôle humain à chaque publication.

## Limites

- Une `<img>` ne peut pas s'animer : pas d'animation ni de transition d'expression sans `animate` ou `inline`.
- Deux noms différents peuvent se ressembler. mochikao est un remplaçant, pas une identité.
- Les yeux qui suivent le pointeur (`gaze`) ajoutent un écouteur par avatar. Ça va pour quelques dizaines, pas pour des centaines.
- Choisis une clé stable. Si un utilisateur peut changer de pseudo, hache son id, pas son pseudo.

Le code est sur [GitHub](https://github.com/Alexvolkihar/mochikao) et le paquet sur [npm](https://www.npmjs.com/package/mochikao), sous licence MIT.
