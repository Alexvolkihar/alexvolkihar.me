---
title: "Dandan : des furigana qui s'effacent à mesure qu'on apprend"
date: 2026-11-05T00:00:00Z
lang: fr
art: random
image: /images/dandan-hero.png
duration: 7min
description: Dandan est une police japonaise qui dessine elle-même les furigana au-dessus des mots en kanji, et les retire pour les niveaux du JLPT que tu connais déjà. Comment marchent les ligatures, ce que les navigateurs empêchent, et où elle se trompe.
---

> [English Version](/posts/dandan) | **Version Française** | [日本語版](/posts/dandan-ja)

[Dandan](https://dandan.alexvolkihar.ovh) est une police japonaise qui dessine les furigana au-dessus des mots en kanji. Tu lui donnes du texte brut, elle affiche les lectures, sans balise `<ruby>` et sans JavaScript. Elle connaît aussi les listes du JLPT : indique le niveau que tu as atteint, et les mots de ce niveau et des niveaux plus faciles perdent leur lecture. Les mots plus difficiles la gardent.

Le nom vient de 段々 (*dandan*), « pas à pas ». La police est libre, sous SIL Open Font License, et elle repose sur Noto Sans JP.

![La page d'accueil de Dandan : le titre, le bouton de téléchargement et un spécimen avec toutes les lectures](/images/dandan-hero.png)

## D'où vient l'idée

Anthony Fu a créé [Furifont](https://furifont.antfu.me) ([code source](https://github.com/antfu/furifont)), une police qui pose les furigana toute seule. Elle a montré que l'idée tient dans un navigateur, et c'est grâce à lui que j'ai appris que les navigateurs mettent en forme les kanji et les kana dans des segments séparés. Dandan est une implémentation à part, écrite en Python avec fontTools, sans code commun avec Furifont.

Ce que je voulais en plus, c'était pouvoir dire ce que je sais déjà. Des furigana sur chaque mot, ça aide une semaine. Ensuite, les lectures de 学校 ou de 勉強 restent au-dessus de mots qu'on lit sans elles, et la ligne devient chargée. Un lecteur de niveau N3 a besoin de la lecture de 状況 et de 対策, pas de celle de 日曜日.

## L'essayer

- Site, bac à sable et téléchargements : [dandan.alexvolkihar.ovh](https://dandan.alexvolkihar.ovh)
- Code source (scripts de construction, données, tests) : [github.com/Alexvolkihar/dandan](https://github.com/Alexvolkihar/dandan)

Elle se charge comme n'importe quelle police web. Prévois une hauteur de ligne suffisante, car les furigana occupent l'espace au-dessus de la ligne :

```css
@font-face {
  font-family: "Dandan";
  src: url("Dandan.woff2") format("woff2");
}

.jp {
  font-family: "Dandan";
  line-height: 1.7;
}

/* masque les lectures N5 et N4 */
.knows-n4 { font-feature-settings: "ss04" 1; }

/* masque toutes les lectures */
.no-furigana { font-feature-settings: "calt" 0; }
```

Les niveaux sont des jeux stylistiques. `ss05` masque les mots N5, `ss04` les N5 et N4, et ainsi de suite jusqu'à `ss01`, qui masque tous les mots présents sur une liste du JLPT. Seuls les mots absents de toute liste gardent alors leur lecture. Désactiver `calt` retire tous les furigana. Tout tient dans un seul fichier : on change de niveau sans charger une autre police.

![Les trois mêmes phrases sans niveau, avec N4 acquis et avec N2 acquis](/images/dandan-levels.png)

Pour les logiciels qui n'exposent pas les jeux stylistiques, le générateur peut figer un niveau dans la police : `--level N4` produit une police qui masque déjà N5 et N4 par défaut.

![Le spécimen au niveau N3 : l'escalier, les cinq mots qui viennent de perdre leur lecture et la ligne CSS à copier](/images/dandan-specimen-n3.png)

## Un glyphe par mot

La police ne comprend pas la phrase. Elle sait seulement remplacer des glyphes. Chaque mot est donc dessiné à l'avance avec sa lecture, dans un glyphe à lui : les kanji côte à côte, et les kana à demi-taille au-dessus. Une ligature OpenType remplace les kanji nus par ce glyphe quand le mot apparaît.

Quand la lecture de chaque kanji tient au-dessus de lui, elle s'y place (日[に]本[ほん]語[ご]). Sinon, la lecture entière est centrée sur le mot et resserrée à sa largeur, pour ne jamais déborder sur le mot suivant. Les kana viennent d'une instance plus grasse de la police variable (600, contre 400 pour le texte), parce qu'à demi-taille la graisse normale paraît délavée.

Les règles s'appliquent dans cet ordre :

1. `words` : ligatures de deux kanji ou plus. La séquence la plus longue passe en premier, donc 日本語 l'emporte sur 日本.
2. `okurigana` : un kanji isolé suivi d'un kana donné prend la lecture de ce mot (食 + べ donne た au-dessus de 食).
3. `kanji` : un kanji isolé prend son unique lecture sans ambiguïté (見 dans 見る donne み).
4. `hide N5` à `hide N1` : des substitutions multiples qui ramènent le glyphe annoté d'un mot listé à ses kanji nus.

Les règles de masquage passent après les ligatures, exprès. Un mot connu doit quand même gagner la correspondance la plus longue, sinon 勉強 perdrait sa ligature et ses deux kanji pourraient recevoir chacun une lecture. Il devient donc d'abord le glyphe annoté, puis revient aux kanji nus.

![Le fonctionnement expliqué sur le site : le texte brut, la correspondance la plus longue, puis ss05 qui rend le mot connu nu](/images/dandan-how.png)

## Choisir une seule lecture

Les données viennent de trois sources. JMdict donne les formes écrites, les lectures et les marqueurs de fréquence. JmdictFurigana dit quels kana vont au-dessus de quel kanji. Les listes du JLPT de yomitan-jlpt-vocab donnent un niveau par mot.

Une suite de kanji peut avoir plusieurs lectures. Le générateur n'en garde une que si elle gagne nettement. Dans une même entrée JMdict, la première lecture listée l'emporte : 今日 se lit きょう et pas こんにち. D'une entrée à l'autre, une lecture n'est gardée que si elle est au moins trois fois plus fréquente que la suivante. 食 seul peut se lire た, く ou しょく, il reste donc nu. 2 166 segments finissent nus de cette façon. Je préfère un kanji sans lecture à une lecture fausse.

Certains kanji changent de lecture dans les composés. 都 se lit みやこ seul et と dans 東京都 : un kanji isolé reste donc nu aussi quand un suffixe ou un préfixe courant le lit autrement. Quelques compteurs après des chiffres (日, 月, 年, 時, 本, 分, 人) restent nus eux aussi.

## Le budget de glyphes

Une police OpenType contient au plus 65 535 glyphes. La police de base, réduite à JIS X 0208 (ses 6 355 kanji, plus les kana, le latin et la ponctuation) et aux kana des furigana, en prend 7 860. J'en garde 64 en réserve, ce qui laisse 57 611 glyphes pour les mots.

Le dictionnaire propose 136 639 candidats, donc plus de la moitié passe à la trappe. Les mots du JLPT d'abord, puis les mots courants de JMdict par fréquence, puis les autres, ceux écrits uniquement avec des kanji du niveau 1 de JIS et les plus courts en premier. La police finale compte 65 471 glyphes et le WOFF2 pèse environ 1,8 Mo. Une version limitée aux mots courants (`--dictionary common`) descend à environ 1,3 Mo.

Tous les niveaux ont les mêmes glyphes, puisqu'un mot connu a toujours besoin de sa ligature. Seules les règles changent, et les six versions ne diffèrent que de quelques centaines d'octets.

## Ce que les navigateurs empêchent

Avant la mise en forme, un navigateur découpe le texte par écriture. Dans 食べる, la police voit 食 dans un segment et べる dans un autre, et la règle des okurigana ne voit jamais les deux ensemble. HarfBuzz l'applique quand il reçoit la chaîne entière, et les tests le vérifient. Dans un navigateur, seule la règle du kanji isolé s'applique, donc les kanji à plusieurs lectures comme 食, 行 ou 話 y restent nus.

Le même problème se pose aux retours à la ligne. Si une ligne se coupe au milieu de 提案, chaque moitié est mise en forme seule et peut recevoir sa propre lecture. `word-break: auto-phrase` dans Chromium, avec `lang="ja"`, coupe plutôt entre les groupes de mots.

## Générer et tester

Le générateur fait environ 1 300 lignes de Python. Il télécharge Noto Sans JP et les dictionnaires, note leurs sommes de contrôle, compile les lectures, dessine les glyphes composites et ajoute les règles à la table GSUB de la police de base. La première génération prépare la police réduite et le cache du dictionnaire, les suivantes prennent environ une minute.

Il y a 20 tests. Ceux de mise en forme font tourner HarfBuzz sur les polices générées : 今日 est une seule ligature annotée, 日本語 l'emporte sur 日本, un mot N5 est nu dans la version N5 et annoté dans la version complète, les jeux stylistiques masquent les niveaux à l'exécution, `calt` désactivé laisse le texte nu, et le nombre de glyphes reste sous 65 535.

![Le bac à sable : un texte d'exemple, l'escalier des niveaux, la taille, l'interligne et le CSS correspondant](/images/dandan-playground.png)

## Limites

- Les lectures peuvent être fausses. La police voit une suite de kanji, pas la phrase. La correspondance la plus longue peut couper au mauvais endroit, et un mot à deux lectures (人気 : にんき ou ひとけ) reçoit toujours la plus fréquente.
- Les règles d'okurigana ne s'appliquent pas dans les navigateurs, pour la raison expliquée plus haut.
- Les niveaux du JLPT sont une estimation. Il n'y a plus de liste officielle depuis 2010, et les listes de Jonathan Waller placent 日本 en N3 et oublient 日本語. C'est pour ça que 日本語 garde sa lecture même en N2 sur l'image plus haut.
- 1,8 Mo, c'est lourd pour une police web.
- Texte horizontal seulement : les moteurs ignorent `calt` en écriture verticale. Les lectures sont en hiragana uniquement, et les mots qui contiennent des kanji hors JIS X 0208 n'en ont pas.

Vérifie les lectures qui comptent. Dandan aide à lire, et devine à partir d'un dictionnaire.

## Remerciements

- [Furifont](https://furifont.antfu.me) d'Anthony Fu, pour l'idée de furigana dessinés par la police et la découverte sur les segments d'écriture.
- [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) d'Adobe et Google, sous SIL OFL 1.1.
- [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) de l'EDRDG, [JmdictFurigana](https://github.com/Doublevil/JmdictFurigana) de Doublevil, et [yomitan-jlpt-vocab](https://github.com/stephenmk/yomitan-jlpt-vocab), construit sur les [listes du JLPT](http://www.tanos.co.uk/jlpt/) de Jonathan Waller. Les données de lecture contenues dans la police restent sous CC BY-SA 4.0.
- [fontTools](https://github.com/fonttools/fonttools) et [HarfBuzz](https://harfbuzz.github.io/).

La police, le bac à sable et les téléchargements sont sur [dandan.alexvolkihar.ovh](https://dandan.alexvolkihar.ovh). Le code source est public sur [GitHub](https://github.com/Alexvolkihar/dandan).
