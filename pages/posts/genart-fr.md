---
title: "Art génératif : quatorze séries, un hash par œuvre"
date: 2026-11-05T00:00:00Z
lang: fr
art: random
image: /og/genart.png
duration: 13min
description: Comment fonctionne la section d'art génératif de ce site. Chaque œuvre vient d'un seul hash, les règles viennent du genart skill de Camille Roux, et chacune des quatorze séries est expliquée simplement, avec une démo en direct qu'on peut relancer.
---

> [English Version](/posts/genart) | **Version Française** | [日本語版](/posts/genart-ja)

La section [art génératif](/genart) de ce site compte quatorze séries. Chaque série est un petit programme, et chaque œuvre est ce programme lancé sur un hash. Les œuvres ne sont stockées nulle part sous forme d'images : ton navigateur les dessine quand tu ouvres la page, en Canvas 2D, sans bibliothèque.

Cet article explique les règles que j'ai suivies, comment les pages sont construites, puis passe les séries en revue une par une. Chaque section de série a une œuvre en direct. **Relancer** en tire une nouvelle au hasard, et **Ouvrir la série** ouvre la page de la série sur cette œuvre précise.

## Hash, long-form

Le genre vient de l'art génératif « long-form », celui qu'on publie sur des plateformes comme Art Blocks ou fxhash. L'artiste écrit un programme et le publie, et chaque collectionneur reçoit une œuvre tirée d'un hash aléatoire, en général 32 octets écrits en hexadécimal. Le programme doit rester bon sur la millième sortie comme sur la première, parce que l'artiste ne choisit pas les sorties.

Ici, personne ne mint quoi que ce soit. J'ai gardé la contrainte parce qu'elle rend les programmes meilleurs. Une série qui ne marche que sur une poignée de graines choisies à la main n'est pas finie.

Un hash ressemble à ça :

```
0x042cc9624e9138c88de67c9664c949ec594832f859655277625b96e7d80aaaeb
```

Même hash, même œuvre, à n'importe quelle taille, dans n'importe quel navigateur.

## Les règles, empruntées à Camille Roux

Je n'ai pas inventé la méthode. Elle suit le [genart skill](https://github.com/camilleroux/genart-skill) de Camille Roux (MIT), un ensemble de notes sur la façon d'écrire du code génératif long-form qui reste déterministe. Voici ce que j'en ai repris.

Toute la variation vient du hash. Une série n'appelle jamais `Math.random()`, ne lit jamais l'horloge, la taille de l'écran ni le user agent. Le seul tirage de toute la section qui ne vient pas d'un hash est celui qui choisit _quel_ hash regarder quand tu appuies sur « New seed ».

Un générateur alimente plusieurs flux nommés. Les 32 octets du hash sont mélangés en une graine de 128 bits avec `Math.imul` (un vrai mélange, pas un repli par XOR, qui s'annule sur les hash répétitifs). Cette graine alimente [sfc32](https://pracrand.sourceforge.net/), le « small fast counting » de Chris Doty-Humphrey, issu de PractRand. Chaque partie d'une œuvre a son propre flux, désigné par une étiquette : `stream(hash, 'features')`, `stream(hash, 'layout')`, `stream(hash, 'color')`. L'étiquette est hachée avec FNV-1a et mélangée à la graine, et chaque flux jette ses douze premières valeurs. Les flux nommés servent à la stabilité : si j'ajoute un tirage dans le code des couleurs, la composition de toutes les œuvres existantes reste en place.

Les traits viennent avant le rendu. Chaque série expose une fonction `features(hash)` qui renvoie les traits d'une œuvre (sa palette, son relief, son montage) sans rien dessiner. Le rendu lit ensuite ces traits. C'est ce qui permet à la galerie d'afficher les traits d'une œuvre, et au recensement plus bas de tourner sur des milliers de graines sans les dessiner.

Le dessin ne dépend pas de la résolution. Chaque longueur est une fraction du petit côté du canvas. Une œuvre dessinée sur 400 pixels et la même exportée en 8K sont la même image.

Les tables de rareté sont décidées avant le code. Chaque série commence par une table de traits et de poids, écrite avant toute ligne de dessin. Pour Strata :

```ts
const TRAITS = {
  Palette: [['Dawn', 22], ['Dusk', 22], ['Ink', 20], ['Glacier', 16], ['Night', 12], ['Ember', 8]],
  Terrain: [['Dunes', 30], ['Hills', 40], ['Peaks', 30]],
  Layers: [['Few', 25], ['Many', 50], ['Deep', 25]],
  Texture: [['Clean', 35], ['Strata', 40], ['Stipple', 25]],
  Sky: [['Clear', 30], ['Orb', 50], ['Banded', 20]],
} as const
```

La table n'est jamais réordonnée ensuite, parce que déplacer une ligne change le tirage de toutes les œuvres. Une fois la série capable de dessiner, j'ai fait un recensement sur 2 000 graines et comparé les effectifs aux poids. Les tables sont affichées sur chaque page de série, générées depuis le code, donc la page et le programme ne peuvent pas se contredire.

Le déterminisme se vérifie. Un code déterministe peut quand même donner deux images différentes dans deux navigateurs, parce que `Math.sin` et `Math.exp` ont le droit de différer sur le dernier bit. Ça ne compte pas pour une valeur utilisée une fois. Ça compte beaucoup quand une orbite tourne pendant des millions de pas et que chaque pas nourrit le suivant. Les séries qui itèrent évitent donc ces fonctions : Attractor utilise sa propre table de sinus, remplie avec une série de Taylor, et la simulation de Reaction n'utilise que `+ - * /` sur des `Float32Array`, qui arrondissent pareil partout. Harmonograph calcule chaque point directement à partir du temps, pour qu'une infime différence ne s'accumule jamais.

## Comment la section est construite

Chaque série est un fichier dans `src/logics/genart/series/`. Il exporte un slug, un titre, la table de traits, `features`, `render` et une courte galerie de hash que j'ai aimés. Un `import.meta.glob` les rassemble : ajouter une série, c'est ajouter un fichier et sa page dans `pages/genart/`. Il n'y a pas de liste à tenir à jour.

Un seul composant Vue, `GenArtCanvas`, dessine toutes les œuvres du site. Il dimensionne le tampon du canvas à la largeur CSS de l'élément multipliée par le device pixel ratio, appelle le `render` de la série et redessine quand l'élément change de taille. Il ne dessine que dans `onMounted`, donc le HTML statique que génère Vite-SSG contient un canvas vide et aucun état aléatoire. Le canvas a `role="img"` et un `aria-label` composé du nom de la série, du hash court et des traits.

Une page de série montre ses œuvres choisies. Clique sur l'une d'elles, ou appuie sur **New seed**, et le hash passe dans l'URL : `/genart/strata?hash=0x…`. Cette URL, c'est l'œuvre. Tu peux l'envoyer à quelqu'un, il verra la même image.

Sous l'œuvre mise en avant, il y a un module d'export : huit formats (1:1, 4:5, 2:3, 3:2, 16:9, 9:16, 21:9 et A4), des tailles du Full HD au 8K ou un grand côté libre, et PNG, JPEG ou WebP. Comme chaque série dessine dans un espace normalisé, un export en 16:9 est la même œuvre étendue ou centrée sur son propre fond, pas un recadrage. Les fichiers exportés reçoivent un petit monogramme en bas à droite, sombre ou clair selon les pixels en dessous, et les PNG portent le titre, l'auteur, le copyright avec la licence et l'URL source dans des blocs de texte. Les œuvres affichées sur les pages ne sont jamais signées.

[La collection](/genart/collection) réunit les œuvres que j'ai choisi de garder, numérotées dans l'ordre où elles sont entrées : n°01, n°02… Chaque entrée est un nom, une série, un hash, un format et une date, et l'œuvre est dessinée en direct comme le reste. Le hash n'y apparaît jamais. Une œuvre est désignée par un slug de son nom (`/genart/collection?piece=<nom>`), et ses téléchargements portent son numéro et son nom. La collection ne donne jamais ses graines.

Le site est statique, à une exception près. Quand je suis connecté avec GitHub, une page de série affiche **Add to collection** sous l'œuvre mise en avant. Quelques Vercel Functions vérifient la session (seul mon compte est accepté), l'origine et les données, puis commitent la nouvelle entrée dans `data/genart-collection.ts` via l'API GitHub. Le site se redéploie une minute plus tard. La connexion, c'est le petit cadenas au bout de la ligne de licence sur chaque page `/genart`. Toute autre personne qui se connecte est refusée par le serveur.

## Les séries

Dans l'ordre de l'[index](/genart). Chaque vignette ouvre la page de la série.

<GenArtStrip />

### Courants

Des centaines de traits courts partent de points au hasard et suivent la direction d'un champ de bruit jusqu'à la marge. Le champ est fait de deux octaves de bruit de valeur, et selon le hash il est calme et laminaire, ondulant, ou plein de tourbillons. Quelques traits par œuvre prennent la couleur d'accent.

<GenArtDemo series="courants" />

Crédits : lignes de courant intégrées dans un bruit de valeur sur une grille hachée par entiers.

### Fault Lines

Une dalle carrée est coupée par des failles droites, encore et encore, jusqu'à se briser en éclats convexes. Chaque coupe découpe un polygone par un demi-plan (la méthode de Sutherland–Hodgman), puis chaque éclat est écarté de ses voisins en le découpant contre ses propres bords décalés. Chaque éclat reçoit ses propres hachures.

<GenArtDemo series="fault-lines" />

Crédits : subdivision récursive de polygones convexes, découpage par demi-plans d'après Sutherland et Hodgman (1974).

### Contours

Des cartes topographiques de lieux qui n'existent pas. Un champ de hauteurs en bruit de gradient est tordu par domain warping, puis découpé en courbes de niveau avec marching squares, et une courbe sur cinq est plus épaisse, comme sur les cartes imprimées. Certaines feuilles restent au trait, d'autres sont teintées bande par bande sous une lumière venue du nord-ouest, d'autres sont gravées de hachures qui descendent les pentes et s'épaississent là où ça monte fort. L'eau se pose dans les creux en lacs, en côte ou en îles.

<GenArtDemo series="contours" />

Crédits : le bruit amélioré de Ken Perlin (2002), les octaves en crête de F. Kenton Musgrave, le domain warping d'Inigo Quilez, marching squares (le cas 2D du marching cubes de Lorensen et Cline, 1987) et la règle des hachures de Johann Georg Lehmann (1799).

### Packing

Des cercles sont posés un par un dans un carré, un disque ou un nuage de disques. Chacun grandit jusqu'à toucher un voisin. Le rayon maximal diminue à mesure que la forme se remplit : les grands cercles arrivent d'abord, les petits comblent les trous. Ensuite chaque cercle reçoit un motif : anneaux, arc, point, rayons, demi-lune ou cercles emboîtés.

<GenArtDemo series="packing" />

Crédits : addition séquentielle aléatoire, le « lancer de fléchettes » derrière l'échantillonnage de Poisson, avec une grille uniforme pour tester les collisions.

### Strata

Un paysage vu de côté, en pile de lignes de crête. Chaque crête est un bruit à une dimension : bruit fractal doux pour les collines, bruit replié pour les dunes, multifractal en crête de Musgrave pour les pics. Les crêtes sont remplies du fond vers l'avant, les proches cachent les lointaines, et la distance n'est rendue que par la couleur, les crêtes lointaines se fondant dans la brume de l'horizon.

<GenArtDemo series="strata" />

Crédits : le bruit de gradient de Ken Perlin (1985), le mouvement brownien fractal, le multifractal en crête de Musgrave, l'algorithme du peintre et la perspective atmosphérique.

### Coral

Des points invisibles sont semés dans un disque, un éventail, un carré ou un croissant. Une ou plusieurs graines poussent vers eux pas à pas : chaque bout de branche se tourne vers les points les plus proches, et un point atteint par une branche disparaît. Les branches s'épaississent vers les racines à mesure que leurs enfants s'additionnent, changent de couleur à chaque génération et se terminent par un petit polype. Les points qu'aucune branche n'a atteints restent en poussière.

<GenArtDemo series="coral" />

Crédits : l'[algorithme de colonisation de l'espace](http://algorithmicbotany.org/papers/colonization.egwnp2007.html) de Runions, Lane et Prusinkiewicz (2007), et le modèle des tuyaux, la règle de Léonard selon laquelle une branche est aussi épaisse que ses enfants réunis.

### Attractor

Un point est déplacé encore et encore par une formule faite de quelques sinus et cosinus, avec quatre coefficients tirés du hash : une application de Clifford, de Jong, Svensson ou « dream ». Après quelques pas, il se pose sur un attracteur étrange et y reste sans jamais se répéter. Le programme le suit pendant des millions de pas et compte combien de fois il tombe dans chaque case d'une grille, puis développe ces comptes comme une photo, avec une courbe logarithmique. La plupart des coefficients ne donnent qu'un point ou une petite boucle : chaque candidat passe donc un court essai (exposant de Lyapunov positif, assez d'étendue, assez d'entropie), et de nouveaux coefficients sont tirés du hash jusqu'à ce que l'un d'eux passe.

<GenArtDemo series="attractor" />

Crédits : les applications de Clifford Pickover (1994), celle de Peter de Jong telle que l'a montrée A. K. Dewdney (1987), la variante de Johnny Svensson recueillie par [Paul Bourke](https://paulbourke.net/fractals/peterdejong/), le test de Lyapunov de J. C. Sprott (1993) et le rendu en densité logarithmique des [fractal flames](https://flam3.com/flame_draves.pdf) de Scott Draves.

### Mosaic

Du vitrail. Des points sont semés sur la fenêtre, plus serrés là où le motif demande de petites pièces, puis déplacés quelques fois vers le centre de leur propre cellule de Voronoï pour que les pièces s'égalisent (la relaxation de Lloyd). Chaque cellule est une pièce de verre aux bords légèrement bombés. Les couleurs viennent d'un motif plus grand, une rose, un soleil, des anneaux ou des bandes, pour que l'image se lise de loin. Chaque pièce a un dégradé doux avec des stries et des bulles, et le plomb entre elles a des soudures.

<GenArtDemo series="mosaic" />

Crédits : Gueorgui Voronoï (1908), l'algorithme de Stuart Lloyd (1982), le découpage de Sutherland–Hodgman.

### Weave

Un échantillon de tissu. Les rubans de chaîne descendent, ceux de trame traversent, et à chaque croisement une armure décide lequel passe dessus : toile, sergé ou chevron, natté, satin, ou une mise en carte générée comme on monte un métier à bras, avec un rentrage, une marchure et un liage. Les rubans se soulèvent aux croisements qu'ils couvrent et plongent sous les autres, avec des ombres. Les rayures de couleur sont symétriques autour d'un pivot comme les setts des tartans, sans copier aucun tartan réel. Le tissu peut se courber ou onduler, et ses bords peuvent s'effilocher.

<GenArtDemo series="weave" />

Crédits : les armures et la notation des tisserands à la main, automatisées plus tard par les cartes perforées de Jacquard.

### Asemic

Chaque hash invente une écriture. Vingt à quarante glyphes sont construits à partir d'un petit ensemble de traits, selon les règles d'une main : bouclée, anguleuse, géométrique, ou suspendue à une ligne de tête. Un lexique est tiré de cet alphabet, avec quelques lettres et quelques mots bien plus fréquents que les autres, puis écrit en prose, en colonnes, en spirale ou en page de codex avec une grande lettrine. La plume tremble, s'assèche et repart dans l'encrier. Ça ressemble à de l'écriture, et rien ne peut s'y lire.

<GenArtDemo series="asemic" />

Crédits : l'écriture asémique, une pratique ancienne de calligraphes et de poètes. Les traits sont des splines de Catmull–Rom centripètes (Barry et Goldman, 1988), et les fréquences suivent une loi proche de Zipf. Aucune écriture réelle n'est copiée et aucune police n'est utilisée.

### Reaction

Deux produits chimiques partagent une boîte de Petri. L'un est versé en continu, l'autre s'en nourrit et se dégrade lentement. Le hash place quelques gouttes (taches, traits perlés, anneau, poussière), puis les équations de Gray–Scott tournent un nombre fixe de pas. Selon les taux d'alimentation et de disparition, les gouttes deviennent des taches, des labyrinthes, des vers ou des cellules qui se divisent sans fin, et les taux peuvent varier à travers la boîte pour montrer un régime qui passe à un autre. Le résultat est imprimé en deux encres, en relief ou en bandes de niveau.

<GenArtDemo series="reaction" />

Crédits : l'[article d'Alan Turing sur la morphogenèse](https://doi.org/10.1098/rstb.1952.0012) (1952), la réaction de Peter Gray et Stephen K. Scott (1983–1985), la [carte de ses motifs](https://arxiv.org/abs/patt-sol/9304003) par John E. Pearson (1993) et le tutoriel de Karl Sims pour le noyau du laplacien.

### Marbling

Le papier marbré fait flotter de l'encre sur un bain et la travaille au stylet ou au peigne. Ici le bain est mathématique : chaque goutte d'encre est un cercle exact qui repousse toutes les frontières précédentes, un râteau tire l'encre le long de ses dents, un peigne ondulé fait des bouquets, un stylet tourné sur place fait les spirales du nid de rossignol. Chaque frontière est un polygone, et une arête trop étirée est raffinée à partir de sa propre préimage, pour que les courbes restent lisses. Chaque mouvement est bijectif, donc deux encres ne se croisent jamais. Les motifs traditionnels s'écrivent comme des suites de ces mouvements.

<GenArtDemo series="marbling" />

Crédits : Lu, Jaffer, Jin, Zhao et Mao, « Mathematical Marbling » (2012), et les [notes sur le marbrage](https://people.csail.mit.edu/jaffer/Marbling/) d'Aubrey Jaffer ; la tradition turque de l'ebru, les motifs au peigne européens et le suminagashi japonais.

### Harmonograph

Une plume et une petite table sont suspendues à des pendules. Deux oscillent à angle droit ; parfois un troisième fait décrire une ellipse à la table, un quatrième ajoute une seconde oscillation sur chaque axe, ou la table tourne. Leurs fréquences sont proches d'un intervalle musical sans jamais tomber pile dessus, alors la figure tourne lentement pendant qu'elle se dessine. Le frottement réduit chaque oscillation et la ligne s'enroule vers le centre. La plume appuie de moins en moins au fil du tracé, et certaines œuvres ont un deuxième ou un troisième tracé dans une autre encre.

<GenArtDemo series="harmonograph" />

Crédits : le pendule composé de Hugh Blackburn (1844) et l'harmonographe de salon victorien ; les figures de Jules Antoine Lissajous (1857), le cas sans amortissement.

### Girih

Des motifs d'étoiles. Le programme part d'un pavage par polygones réguliers (carrés, hexagones, octogones et carrés, dodécagones et triangles, et quelques autres). Du milieu de chaque arête partent deux rayons au même angle, qui s'arrêtent où ils rencontrent les rayons de l'arête voisine. Puis le pavage est effacé : chaque tuile garde une étoile et chaque sommet une rosace. Les lignes sont dessinées en entrelacs qui passent dessus et dessous, en pièces émaillées dans un joint, ou en trait fin sur le pavage pâle. Un angle étroit donne des étoiles ouvertes, un angle large des pointes aiguës.

<GenArtDemo series="girih" />

Crédits : les motifs d'étoiles de l'art géométrique islamique, empruntés pour leur seule géométrie (sans inscriptions, palettes originales), la méthode des « polygones en contact » d'E. H. Hankin (1925) et sa généralisation par Craig S. Kaplan (2005).

## Licences

Les œuvres sont de moi, sous licence [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr) : tu peux les partager en me citant, pas les vendre ni publier de versions modifiées. Le code est dans le [dépôt du site](https://github.com/Alexvolkihar/alexvolkihar.me), sous licence MIT comme le reste du site. Le code d'aléatoire suit le genart skill de Camille Roux, lui aussi sous MIT.

J'ai écrit le code avec un assistant IA. Chaque œuvre est dessinée par ce code, trait par trait et pixel par pixel. Il n'y a aucune image générée par IA dans la section.

## La suite

D'autres séries, et d'autres œuvres numérotées dans la collection, au fil des graines que je parcours.

La section est sur [/genart](/genart). Si une œuvre de cet article t'a plu, le bouton **Ouvrir la série** garde son hash.
