---
title: "Tsuta : un client Git qui reste natif"
date: 2026-10-14T00:00:00Z
lang: fr
art: random
image: /images/tsuta-history.png
duration: 7min
description: Tsuta est un client Git natif pour macOS, en Swift. Il pilote le git du système, indexe ligne par ligne, rebase sans éditeur et liste tes sessions Claude Code et Codex. Comment les pièces fonctionnent, et où il s'arrête.
---

> [English Version](/posts/tsuta) | [日本語版](/posts/tsuta-ja)

[Tsuta](https://github.com/Alexvolkihar/Tsuta) est un client Git pour macOS écrit en Swift. Il dessine l'historique en graphe, indexe des hunks et des lignes isolées, résout les conflits, rebase de façon interactive, relit les demandes GitHub et GitLab, et liste les conversations Claude Code et Codex menées dans un dépôt. Le binaire fait 4 Mo, la licence est MIT, et il n'y a pas de compte.

Le nom est le mot japonais pour le lierre (蔦), une plante qui grimpe et se ramifie en poussant.

![La vue historique de Tsuta : le graphe des commits, le commit sélectionné et son diff](/images/tsuta-history.png)

## L'essayer

- Code source : [GitHub](https://github.com/Alexvolkihar/Tsuta)
- Le compiler :

```bash
git clone https://github.com/Alexvolkihar/Tsuta.git
cd Tsuta
./scripts/build-app.sh
open build/Tsuta.app
```

Swift 6 et macOS 14 suffisent, et les Command Line Tools fonctionnent sans Xcode. L'app n'est pas notarisée : au premier lancement, il faut un clic droit puis Ouvrir.

## Il pilote git, il ne le remplace pas

Tsuta ne réimplémente pas Git. Chaque opération est un appel à `/usr/bin/git` dans un processus enfant, avec `--no-optional-locks` et sans invite. Les hooks, la config, les worktrees et les sous-modules se comportent comme dans un terminal, puisque c'est le même binaire.

Le vrai travail, c'est le parsing. La sortie de `log`, de `status --porcelain=v2 -z` et de `diff` devient des valeurs immuables, et les vues se contentent de les lire. Chaque commande apparaît dans une console (⌘J) : rien de ce que fait l'app n'est caché.

## Indexer une seule ligne

Pour indexer une seule ligne, Tsuta construit un patch et le donne à `git apply --cached --recount`.

Le patch garde l'en-tête du fichier et le hunk, et neutralise ce qui n'a pas été sélectionné. À l'indexation, une ligne ajoutée non sélectionnée est écartée, et une ligne supprimée non sélectionnée devient du contexte, puisqu'elle reste dans l'index. La désindexation est l'image miroir et applique le patch avec `-R`. Les compteurs de l'en-tête de hunk sont recalculés, et `--recount` fait que git se fie aux lignes plutôt qu'à l'en-tête.

Un test fait l'aller-retour sur un vrai dépôt : indexer le premier hunk, en désindexer une ligne, indexer une ligne du second hunk, committer, puis vérifier le contenu du commit.

L'indexation partielle exige le diff exact : elle est désactivée tant que « masquer les changements d'espaces » est activé.

Un fichier neuf est le seul cas que git ne sait pas encore diffuser. Tsuta l'enregistre en « intent to add » (`git add --intent-to-add`), ce qui en fait un diff ordinaire de lignes ajoutées, et le même constructeur de patch fait le reste. Rien n'est indexé tant que tu n'appliques pas une ligne. Abandonner un tel fichier oublie d'abord l'entrée, car le restaurer depuis l'index le viderait.

## Rebaser sans éditeur

Git ouvre un éditeur pour la liste des tâches, puis un autre à chaque reword. Tsuta remplace les deux. `GIT_SEQUENCE_EDITOR` pointe vers un `cp` d'un fichier que l'app a écrit, et un `reword` devient un `pick` suivi de `exec git commit --amend -F <fichier>`.

La fenêtre de rebase est une liste qu'on réordonne en glissant, avec pick, reword, squash, fixup et drop sur chaque ligne. Elle refuse un plan qui commence par un squash, puisqu'il n'y a aucun commit dans lequel fusionner.

## Blame, historique et annulation

Le blame, c'est `git blame --porcelain`, découpé en lignes groupées par commit, les lignes non commitées étant signalées. L'historique d'un fichier lance `git log --follow` deux fois : une pour les commits, une avec `--name-only` pour savoir quel nom portait le fichier à chaque commit, afin de lire le diff d'un ancien commit sous le bon chemin. Un clic sur une ligne du blame ouvre ce commit dans l'historique.

L'annulation part d'un instantané pris avant toute opération qui peut déplacer HEAD (rebase, merge, pull, reset, cherry-pick, revert, amend) : le commit, la branche et l'arbre de l'index (`git write-tree`). Annuler un rebase, un merge ou un pull, c'est `git reset --keep` vers l'ancien commit, qui conserve les changements non commités et s'arrête s'ils entrent en conflit. Annuler un reset ou un amend, c'est `git reset --soft` suivi d'un `git read-tree` de l'index sauvegardé : ce que tu avais indexé l'est de nouveau. Elle refuse si HEAD n'est plus là où l'action l'a laissé, ou si tu as changé de branche.

## Le graphe

Les commits arrivent enfant avant parent. Le calcul garde un tableau de lanes, chacune contenant le hash qu'elle attend. Un commit prend la première lane qui l'attend, ou la première libre. Son premier parent garde la lane et les autres parents reçoivent des lanes libres. Chaque ligne note quelles lanes arrivent au nœud, lesquelles passent et lesquelles repartent, et un `Canvas` SwiftUI trace les courbes entre elles.

Mon premier test de merge attendait que la deuxième lane se referme sur la première. L'algorithme avait raison et le test avait tort : la lane de la branche fusionnée rejoint celle du parent par une courbe, et le parent reste où il était.

## Surveiller le dossier

Un observateur FSEvents rafraîchit la vue quand quelque chose change dans l'arbre de travail, depuis un terminal ou un éditeur. Il ignore la comptabilité interne de git (objets, logs, fichiers de verrou), parce que lire un dépôt y touche et déclencherait une boucle de rafraîchissement, et il regroupe les rafales d'événements en un seul rafraîchissement.

La première version ne se déclenchait jamais. Sans `kFSEventStreamCreateFlagUseCFTypes`, le callback reçoit un tableau C de chaînes, et je le lisais comme un `NSArray`. Résultat : une liste vide, et aucune erreur.

Je l'ai trouvé parce que l'app sait dessiner sa propre fenêtre dans un PNG : `Tsuta --open <dépôt> --snapshot out.png`. Elle n'a besoin d'aucune autorisation d'enregistrement d'écran, puisqu'elle ne dessine que ses propres vues. J'ai créé un fichier pendant qu'elle tournait, et le fichier manquait dans la liste. Les captures de cet article viennent de cette commande.

![La vue changements : fichiers indexés et modifiés, une case sur chaque ligne modifiée et un bouton pour indexer tout le hunk](/images/tsuta-changes.png)

## Claude Code et Codex

Tsuta les utilise de deux façons.

La première est la génération : un message de commit à partir du diff indexé, l'explication d'un commit, le résumé d'une review, une suggestion pour un bloc de conflit. Tsuta lance `claude` (ou `codex`) comme processus enfant et écrit le prompt sur son entrée standard. Il n'a ni clé ni serveur. Claude tourne avec `-p --tools ""` depuis un dossier temporaire, donc une instruction cachée dans un diff ne peut ni lire ni modifier un fichier : le modèle ne peut que renvoyer du texte. Le diff est placé entre balises et présenté au modèle comme de la donnée.

La seconde est l'onglet Agents, qui liste les conversations menées dans le dépôt ou dans l'un de ses worktrees. Claude Code les garde en fichiers JSONL dans `~/.claude/projects/`, dans un dossier nommé d'après le chemin, où `/` et `.` sont remplacés par `-`. Tsuta lit le titre, la branche et la dernière activité, et Reprendre ouvre Terminal dans le bon dossier avec `claude --resume <id>`. L'identifiant vient d'un nom de fichier : il est donc validé avant d'entrer dans une commande shell.

## Sans Xcode

Je l'ai construit avec les seuls Command Line Tools, ce qui a coûté trois choses : pas de XCTest, pas de macros swift-testing, et pas de macro `@State`, dont le plugin est livré avec Xcode. Les tests sont devenus un exécutable, `tsuta-selftest` : 148 vérifications qui créent de vrais dépôts (un merge avec conflit, un rebase interactif, un stash, un worktree, de l'indexation partielle, un blame à travers un renommage, l'annulation d'un rebase). L'état local des vues passe par `@StateObject`.

## Limites

- L'app n'est pas notarisée.
- Les chemins GitLab (`glab`) et Codex sont couverts par des tests de parsing sur des sorties d'exemple. Je ne les ai pas exécutés contre les vrais outils.
- Le blame ne suit pas les lignes déplacées d'un fichier à l'autre.
- L'annulation ne fonctionne que tant que le dépôt est là où l'action l'a laissé, sur la même branche. Sinon, elle refuse.
- Cela fait environ 5 800 lignes de Swift, dont 1 600 dans le cœur. Il reste des aspérités.

Le code est sur [GitHub](https://github.com/Alexvolkihar/Tsuta), sous licence MIT.
