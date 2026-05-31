# Architecture et fonctionnement du site antfu.me

Ce document décrit l'architecture, le flux de développement/build, la structure du contenu, les scripts d'automatisation et les points d'extension du site.

## Résumé rapide

- Stack : Vue 3 + Vite + Vite-SSG (site statique), TypeScript
- Routage : `vue-router` avec génération automatique des routes depuis `pages/` (plugin `vue-router/vite` / auto-routes)
- Contenu : fichiers Markdown (`.md`) dans `pages/` et `pages/posts/` traités par `unplugin-vue-markdown` + `markdown-it` + Shiki
- Style : UnoCSS + fichiers CSS personnalisés
- State : Pinia (store pour highlighter Shiki)
- Scripts utilitaires : dans `scripts/` (OG, RSS, redirects, compression d'images...)

---

## Commandes principales

- `pnpm dev` / `npm run dev` : lance Vite en mode développement (`vite --port 3333 --open`)
- `pnpm build` / `npm run build` : pipeline complet — génère site statique via `vite-ssg`, exécute scripts `copy-fonts.ts`, `rss.ts`, et copie `_dist_redirects` vers `dist/_redirects`.
- `pnpm preview` / `npm run preview` : preview local du build
- `pnpm static` : prépare `temp/` depuis `antfu/static` et copie sponsors

Les scripts sont définis dans `package.json` (section `scripts`).

## Arborescence importante (vue d'ensemble)

- `pages/` : contenu en Markdown servi comme routes. Les fichiers `.md` sont transformés en composants Vue et auto-routés.
- `pages/posts/` : billets de blog (utilisés pour le RSS).
- `src/` : code de l'application (App.vue, `main.ts`, composants, styles, store, logics).
- `scripts/` : utilitaires d'automatisation (OG generation, RSS, redirects, compression d'images...).
- `public/` : assets publics (favicon, images, logos, `og/` générés).
- `data/`, `photos/`, `demo/` : contenu et métadonnées consommés par les pages.
- `vite.config.ts` : configuration Vite + plugins (markdown pipeline, shiki, TOC, anchors, etc.)

## Détail des parties

### 1) Build & dev pipeline

- Vite + Vite-SSG (`vite-ssg`) : `src/main.ts` expose la fonction `createApp` via `ViteSSG(App, { routes }, ...)`. Le rendu statique est effectué par `vite-ssg build`.
- Plugins notables dans `vite.config.ts` :
  - `UnoCSS()` — utilitaires CSS (tailwind-like, configuré via `unocss.config.ts`).
  - `VueRouter(...)` — génère des routes depuis `pages/`, et dans `extendRoute` lit le frontmatter (via `gray-matter`) pour ajouter `frontmatter` en meta.
  - `@vitejs/plugin-vue` — support Vue + `.md` via `unplugin-vue-markdown`.
  - `Markdown()` (unplugin-vue-markdown) — conversion des `.md` en composants Vue. Configuration :
    - `MarkdownItShiki` pour coloration (thèmes `vitesse-dark` / `vitesse-light`) + transformers (twoslash, diff, highlight)
    - plugins `anchor`, `TOC`, `LinkAttributes`, `GitHubAlerts`, `MagicLink`.
    - `frontmatterPreprocess` : hook pour générer des images OG (via `generateOg`) et injecter `frontmatter.image`.
  - `Inspect()`, `Icons()`, `SVG()` etc.

Le `vite.config.ts` contient une logique qui collecte des promesses de génération d'images OG et attend leur résolution dans le plugin `closeBundle`.

#### Génération d'OG images

- `generateOg(title, output)` lit le template `scripts/og-template.svg`, remplit des variables (ligne 1..3) et utilise `sharp` pour produire une image PNG dans `public/og/`.
- `frontmatterPreprocess` appelle cette génération pour chaque page `.md` qui n'a pas d'`image` explicite.

### 2) Routage et contenu Markdown

- Routes auto-générées depuis `pages/` (extensions `.md` et `.vue`), grâce à `vue-router/vite` et `vue-router/auto-routes` importées dans `main.ts`.
- Chaque `.md` est transformé en composant Vue. La configuration `Markdown()` permet de :
  - Choisir le `wrapperComponent` (`WrapperDemo` pour `demo/`, sinon `WrapperPost`).
  - Ajouter des classes wrapper (ex : `prose m-auto slide-enter-content`).
  - Activer `headEnabled` pour que les pages fournissent du `head`.

Frontmatter : utilisé pour titre/date/lang/image/etc. `vite.config.ts` enrichit `frontmatter.image` si absent (OG).

### 3) Client app (src)

- `src/main.ts` : point d'entrée, configure `ViteSSG`, extensions (dayjs, FloatingVue, Pinia), configuration du scroll via `vue-router-better-scroller`, et NProgress pour les barres de progression.
- `src/App.vue` : layout global (barre de navigation, slot pour routes) — consultez le fichier pour détails de structure.
- `src/components/` : composants réutilisables (NavBar, Footer, Logo, ListPosts, WrapperPost/WrapperDemo, Embed components...).
- `src/logics/index.ts` : utilitaires UI (gestion dark mode, formatage de date, gallery view, preferences locales).
- `src/store/shiki.ts` : store Pinia qui initialise le `highlighter` Shiki côté client et expose le thème courant.

### 4) Scripts utilitaires (`scripts/`)

Voici les scripts importants et leur rôle :

- `slugify.ts` : utilitaire pour générer des slugs (diacritics handling).
- `rss.ts` : recherche `pages/posts/*.md`, génère `feed.xml`, `feed.atom` et `feed.json` dans `dist/` (utilise `feed` + `markdown-it` + `gray-matter`).
- `redirects.ts` : concatène `_redirects` et génère `_dist_redirects` en ajoutant des redirections dynamiques vers les repos GitHub (via Octokit + `GITHUB_TOKEN`).
- `copy-fonts.ts` & `copy-sponsors.ts` : copient des ressources dans le build (`static` / sponsors).
- `img-compress*.ts` : outils pour compresser les images (CLI et staged).
- `photos-manage.ts` : script pour manipuler les métadonnées de `photos/`.
- `sponsors-circles.ts` / `stars-rank.ts` : scripts de génération pour sponsors/écrans spécifiques.

Pour le détail voir les fichiers dans `scripts/`.

### 5) Assets et contenu

- `public/` : fichiers servis tels quels (favicon, logos, `og/` générés). Le dossier `public/og` contient les images OG par page.
- `photos/` : métadonnées JSON des photos (utilisé par `photos-manage.ts` et pages `photos.md`).
- `data/` : modules TypeScript exportant données (`media.ts`, `talks.ts`) potentiellement consommées par les pages.

### 6) Déploiement & redirections

- `netlify.toml` et `_redirects` à la racine contiennent les réglages de redirections et du déploiement Netlify. Le build génère `_dist_redirects` et le script `build` copie `_dist_redirects` dans `dist/_redirects`.

### 7) Ajout/édition de contenu

- Ajouter une page : créer `pages/mon-nouvel-article.md` avec frontmatter YAML (title, date, lang, tags, etc.). Le système génèrera automatiquement la route.
- Ajouter un billet de blog : créer `pages/posts/mon-post.md` (si `lang: 'en'` il sera inclus dans le RSS).
- Forcer une image OG : ajouter `image: /path/to/image.png` dans le frontmatter; sinon la génération automatique tentera de créer `public/og/<route>.png`.

### 8) Points d'extension et bonnes pratiques

- Pour ajouter un plugin Markdown : modifier `vite.config.ts` dans la partie `markdownItSetup`.
- Pour personnaliser le thème de Shiki : voir `src/store/shiki.ts` et les imports de thèmes dans `vite.config.ts` / `MarkdownItShiki`.
- Pour ajouter une route statique non-Markdown : créer un composant `.vue` dans `pages/`.

## Commandes de base pour contributor

```bash
# installer deps
pnpm install

# dev
pnpm dev

# build (production)
pnpm build

# preview du build
pnpm preview
```

## Références rapides vers fichiers clés

- Configuration Vite : `vite.config.ts`
- Entrée app / SSG : `src/main.ts`
- Composants : `src/components/`
- Pages Markdown : `pages/` et `pages/posts/`
- Scripts utilitaires : `scripts/`
- Assets publics : `public/`

---

Si vous voulez, je peux :

- détailler le contenu de chaque fichier dans `src/components/` et fournir un résumé fichier-par-fichier;
- générer un diagramme Mermaid de la pipeline de build;
- documenter les conventions frontmatter utilisées par les `.md`.

Fin du document.
