---
title: "The Canon a raison : un an de code assisté par agents sous contraintes réelles"
date: 2026-08-05T00:00:00Z
lang: fr
art: random
duration: 7min
description: « The Canon » de Federico Bartoli pose douze règles pour travailler avec des agents de code IA. Écrire du Symfony pour du logiciel médical m'a fait adhérer à chacune d'entre elles.
---

> [English Version](/posts/canon-ai-coding-agents) | [日本語版](/posts/canon-ai-coding-agents-ja)

Il y a quelques jours, j'ai lu [*The Canon*](https://federicobartoli.it/canon/) de Federico Bartoli, un court manifeste qui pose douze règles pour travailler avec des agents de code IA. C'est dense, tranché, et ça se referme sur la phrase qui l'ouvre : « Aucune de ces règles n'est nouvelle. Toutes sont désormais obligatoires. » Je l'ai lu deux fois d'affilée, ce qui, pour moi, est le vrai test pour savoir si un texte sur la discipline en ingénierie vaut quelque chose.

Les douze motifs de Bartoli se regroupent grosso modo en quatre gestes : décider de la forme de la solution avant d'ouvrir le prompt, avancer par petites tranches revues une à une plutôt que par une génération massive, vérifier chaque affirmation de l'agent au lieu de faire confiance au résumé, et coucher ses standards quelque part où l'agent ira réellement les lire plutôt que de les retaper à chaque session. Je passe mes journées à écrire du Symfony pour du logiciel médical, et cette liste ne m'a pas appris grand-chose de nouveau : elle décrivait des habitudes que je ne peux déjà plus me permettre de sauter. L'IEC 62304 et un analyseur statique qui fait échouer le build ne laissent pas beaucoup de place au raccourci, si bien que chacune des douze règles de Bartoli m'avait déjà été imposée par autre chose que la bonne volonté.

## Décider avant de prompter

Le deuxième motif de Bartoli, « décider avant de demander », recoupe directement une exigence que l'ingénierie du dispositif médical impose depuis des décennies : on ne touche pas au code avant de connaître les pré-conditions, les modes de défaillance et les critères d'acceptation. Un agent IA générera sans sourciller une implémentation plausible pour une idée à moitié formée, et c'est exactement pour ça que la règle tient. Si je ne peux pas énoncer, en une phrase, ce que la fonction doit rejeter avant même d'avoir le droit de réussir, je ne suis pas prêt à prompter quoi que ce soit. Je ferais mieux d'aller chercher le vrai besoin d'abord.

L'agent ne sait pas que cette discipline existe pour des raisons de sécurité. Il fait simplement du pattern-matching sur le prompt. Un prompt flou donne une implémentation floue habillée d'une syntaxe pleine d'assurance, et on ne remarque le flou qu'au moment où il devient l'incident de quelqu'un d'autre.

## Petits lots, et le diff comme seul témoin fiable

« Petits lots » et « lire le diff » sont plutôt en dessous de la réalité. Sur un projet où chaque écriture passe par un gestionnaire de transaction et où chaque objet ne peut être construit que via sa fabrique, un changement qui touche douze fichiers d'un coup n'est tout simplement pas relisable. J'ai pris l'habitude de demander aux agents une couche à la fois (objet du domaine, puis loader, puis writer, puis handler) pour que le diff de chaque étape reste assez petit et tienne dans ma tête, confronté à la règle réelle plutôt qu'à mon souvenir approximatif de cette règle.

La formule de Bartoli qui me reste en tête, c'est « dette de compréhension » : chaque ligne acceptée sans être lue est un petit emprunt contracté contre un futur incident, et contrairement à une dette financière, on ne connaît pas le taux d'intérêt à l'avance. C'est la meilleure explication que j'aie lue de pourquoi « ça compile » n'a jamais suffi comme critère.

## La vérification, la partie qui ne se compresse pas

« Exécute-le avant d'y croire » semble une évidence, jusqu'à ce qu'on remarque à quel point c'est souvent sauté sous pression de deadline, avec ou sans agent. Ce qui a changé avec les agents, ce n'est pas le principe, c'est le volume : on passe en revue davantage d'affirmations de « c'est fait » par heure qu'avant, donc la tentation de vérifier en diagonale plutôt qu'en profondeur grandit d'autant. Je me suis fixé une règle un peu brute mais efficace : s'il n'y a ni test, ni log, ni trace que je peux montrer du doigt, « ça marche » reste une hypothèse, pas un fait, quelle que soit la fluidité avec laquelle l'agent le formule.

## Coder les règles

Le onzième motif de Bartoli, c'est « coder les règles » : mettre ses conventions dans un fichier que l'agent chargera, plutôt que dans du texte de prompt retapé à chaque session. Mon métier est le cas extrême qui montre pourquoi ça marche. Le règlement n'y est pas une simple recommandation, il est appliqué. Les contraintes d'architecture (quelle couche peut dépendre de quelle autre, quelles classes ne peuvent être instanciées que via leur fabrique, quels champs ne doivent jamais atterrir dans une ligne de log) reposent sur des règles d'analyse statique maison, chacune avec son propre identifiant, vérifiées à chaque commit. La convention écrite et le contrôle automatisé sont les deux moitiés de la même idée : un guide de style qu'un agent peut ignorer reste une suggestion, et un guide de style qu'un linter fait respecter devient un contrat. La version de Bartoli de cette règle est le cas général ; la mienne montre à quoi ça ressemble une fois que les enjeux la rendent non négociable.

## Ce que j'en retiens

Les douze motifs tiennent la route. Dans le logiciel réglementé, à enjeu de sécurité, ils cessent d'être un choix et deviennent la raison pour laquelle le logiciel a le droit d'exister, ce qui est une chose curieuse à constater dans un manifeste écrit pour un public bien plus large que le mien. Si tu codes avec un agent, ne serait-ce qu'un peu, lis l'original : c'est court, et c'est le genre de court qui l'a vraiment mérité.
