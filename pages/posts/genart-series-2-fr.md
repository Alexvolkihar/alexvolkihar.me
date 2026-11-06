---
title: "Art génératif : dix-huit séries de plus"
date: 2026-11-09T00:00:00Z
lang: fr
art: random
image: /og/genart.png
duration: 15min
description: La section d'art génératif compte maintenant trente-deux séries. Cet article passe en revue les dix-huit que le premier ne couvrait pas, chacune avec son algorithme expliqué simplement, ses crédits et une démo en direct qu'on peut relancer, et raconte ce que les huit dernières empruntent au travail long-form de Camille Roux.
---

> [English Version](/posts/genart-series-2) | **Version Française** | [日本語版](/posts/genart-series-2-ja)

Le [premier article](/posts/genart-fr) sur la section [art génératif](/genart) couvrait ses quatorze premières séries. La section en compte maintenant trente-deux, et cet article passe en revue les dix-huit qu'il ne couvrait pas.

La façon de faire n'a pas changé. Chaque œuvre vient d'un hash, l'aléatoire suit le [genart skill](https://github.com/camilleroux/genart-skill) de Camille Roux, et ton navigateur dessine l'œuvre en Canvas 2D quand tu ouvres la page. Le premier article explique tout ça, donc celui-ci va directement aux séries. Chaque section a une œuvre en direct : **Relancer** en tire une nouvelle au hasard, et **Ouvrir la série** ouvre la page de la série sur cette œuvre précise.

## La seconde moitié : des règles qu'on laisse tourner

Les huit dernières séries, de Pelt à Patent, ont un but commun. J'admire le travail long-form de [Camille Roux](https://art.camilleroux.com), dont le genart skill fixe déjà les règles de cette section : des règles locales simples qu'on laisse tourner, une image qui sort du processus plutôt que d'une mise en page dessinée à la main, et souvent un très grand nombre de petites marques. J'ai voulu essayer de travailler comme ça.

Dans ces huit séries, la composition est surtout le résultat d'un processus. Le pelage de Pelt vient de cellules pigmentaires qui s'activent et s'éteignent les unes les autres, puis de dizaines de milliers de poils. Crackle est un réseau de fissures qui s'arrêtent quand elles se rencontrent. Meander, ce sont des agents qui marchent sur un réseau jusqu'à être bloqués, et Swarm une simulation de boids de Reynolds enregistrée en pose longue. Bloom peint chaque pétale en dizaines de couches presque transparentes. Orbits, Isolines et Patent sont moins des simulations : une grammaire choisit un anneau après l'autre, un champ de distance est découpé en lignes de niveau, une machine est montée pièce par pièce avec des pièces qui doivent s'ajuster.

Ce sont des séries originales. Aucune ne reproduit une de ses œuvres, et la seule chose qu'elles lui prennent directement, c'est le genart skill crédité sur chaque page. Bloom a une autre dette, technique celle-là : son aquarelle reprend la technique de couches que Tyler Hobbs a publiée dans un tutoriel public, [A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art), réécrite à partir de sa description.

## Les séries

Dans l'ordre de l'[index](/genart), après Girih.

### Moiré

Deux ou trois trames régulières sont imprimées l'une sur l'autre : lignes parallèles, anneaux, rayons, vagues ou spirale. Chacune est légèrement décalée par rapport à celle du dessous, tournée de quelques degrés, déplacée, étirée ou courbée. Aucune trame ne contient de grande forme. Les grandes bandes que tu vois apparaissent là où les rayures se mettent en phase et s'en écartent : barres, hyperboles, cercles, moulinets. Sur papier clair, les encres se superposent comme en risographie, et sur fond sombre les rayures claires s'additionnent. Les petits canvas sont dessinés deux ou trois fois plus grands puis réduits, pour que les rayures ne créent pas de fausses franges par aliasing.

<GenArtDemo series="moire" />

Crédits : Gerald Oster et Yasunori Nishijima, « Moiré Patterns » (_Scientific American_, 1963), et Isaac Amidror, _The Theory of the Moiré Phenomenon_ (2000). La rotation entre deux trames de lignes vient de la formule de l'écart des franges, pas / (2 sin(angle / 2)).

### Phyllotaxis

Un tournesol place chaque nouveau fleuron environ 137,5° après le précédent, l'angle d'or, et un peu plus loin du centre. Après quelques centaines de fleurons, deux familles de spirales croisées apparaissent, et leurs nombres sont des nombres de Fibonacci consécutifs : 21 et 34, ou 34 et 55. Chaque œuvre fait pousser avec cette règle un capitule, une paire, un bouquet ou tout un champ, avec des fleurons dessinés en graines, pétales, écailles de pomme de pin, points ou en réseau de spirales. La plupart des capitules suivent l'angle d'or. Certains s'en écartent un peu, d'autres utilisent l'angle de Lucas, environ 99,5°, et quelques rares une fraction proche de l'angle d'or, qui casse les spirales en rayons droits.

<GenArtDemo series="phyllotaxis" />

Crédits : le modèle du capitule de tournesol de H. Vogel (1979), les observations de Schimper, Braun et des frères Bravais dans les années 1830, et le chapitre 4 de Prusinkiewicz et Lindenmayer, [The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/#abop) (1990).

### Growth

Une petite boucle fermée est semée dans le cadre, ou une paire, une colonie, deux anneaux emboîtés, ou un bord collé à la paroi. À chaque pas, chaque point est repoussé par les points autour de lui et tiré vers ses deux voisins, et la ligne s'allonge là où elle pousse le plus vite. Elle ne peut pas se croiser, donc la longueur en trop doit se plier : bords de lichen, labyrinthes de corail cerveau, gros lobes. La croissance est enregistrée en route, puis dessinée en anneaux de croissance pleins, en bande striée, en contours successifs ou en marqueterie. La simulation n'utilise que des additions, multiplications, divisions et racines carrées, donc elle pousse de la même façon dans tous les navigateurs.

<GenArtDemo series="growth" />

Crédits : l'algorithme de la ligne différentielle tel que le décrivent Anders Hoff dans [Differential Line](https://inconvergent.net/generative/differential-line/) et Jason Webb dans ses [2D differential growth experiments](https://github.com/jasonwebb/2d-differential-growth-experiments), et le flambage des tissus qui poussent plus vite sur leur bord (Sharon, Marder et Swinney, 2004).

### Stipple

Le sujet est calculé à partir du hash, jamais tiré d'une photo : une sphère éclairée posée sur son ombre, les plis d'un tissu suspendu, une nébuleuse, un vase tourné ou une coquille de nautile. Quelques milliers de points sont semés dessus, plus nombreux là où c'est sombre, puis déplacés encore et encore vers le centre de masse de l'encre qu'ils couvrent jusqu'à ce que le grain soit régulier. Ils sont imprimés en points, ou enfilés sur une seule ligne continue qui passe une fois par chaque point et se replie serré dans les zones sombres, ou les deux.

<GenArtDemo series="stipple" />

Crédits : Adrian Secord, [Weighted Voronoi Stippling](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/) (2002), construit sur l'algorithme de Stuart Lloyd, et le [TSP Art](https://archive.bridgesmathart.org/2005/bridges2005-301.html) de Craig S. Kaplan et Robert Bosch (2005), avec un circuit raccourci par des mouvements 2-opt (G. A. Croes, 1958).

### Penrose

Des losanges épais et fins, ou des cerfs-volants et des fléchettes, dans un pavage qui ne se répète jamais. Il pousse par déflation : un « soleil » à cinq branches bien plus grand que le canvas est découpé en triangles de Robinson, puis chaque triangle est remplacé par deux ou trois plus petits, chaque étape les réduisant du nombre d'or, jusqu'à ce que les tuiles atteignent la taille demandée par le hash. Certaines œuvres sont pile sur le centre à symétrie d'ordre cinq, d'autres s'en éloignent. Les tuiles sont colorées par type, par orientation, par la grande tuile dont elles viennent ou par anneaux décagonaux, et certaines portent les arcs assortis qui se rejoignent en anneaux fermés et en vers sans fin.

<GenArtDemo series="penrose" />

Crédits : les tuiles de Roger Penrose (1974), popularisées par Martin Gardner dans _Scientific American_ (1977) ; les triangles de Robinson tels que les décrivent Grünbaum et Shephard dans _Tilings and Patterns_ (1987) ; les arcs assortis de Penrose et John H. Conway, dont Conway appelait les courbes des vers.

### Arbor

Chaque plante commence par une seule lettre. Une petite grammaire la réécrit encore et encore, en choisissant chaque règle selon son propre poids, jusqu'à ce que le mot décrive une herbe, un arbre, une fougère ou une ombelle. Une tortue lit ensuite le mot : elle trace une branche à chaque pas, tourne, garde sa place à chaque fourche pour y revenir, et affine son trait à mesure que les branches se divisent. Le vent courbe les rameaux plus que le tronc, et la saison décide si les derniers bourgeons deviennent des feuilles, des fleurs, des baies ou rien. Les plantes sont montées comme dans un herbier : un spécimen sur sa planche, une planche de variantes numérotées, ou une prairie.

<GenArtDemo series="arbor" />

Crédits : les L-systèmes d'Aristid Lindenmayer (1968), sous les formes stochastiques et à crochets de _The Algorithmic Beauty of Plants_ de Prusinkiewicz et Lindenmayer (1990), avec les modèles de ramification de H. Honda et d'Aono et Kunii. La palette cyanotype est un clin d'œil aux planches d'Anna Atkins (1843–1853).

### Automata

Une grille de cellules soumise à une règle locale, travaillée comme du tissu. Une règle à une dimension part d'une rangée, et chaque génération devient la rangée suivante vers le bas. Une règle à deux dimensions part d'une soupe aléatoire, souvent en miroir, et tourne quelques dizaines à quelques centaines de générations. Les règles qui finissent vides, uniformes, rayées ou en simple bruit sont rejetées, et la règle suivante est tirée dans le même flux. Chaque cellule devient ensuite un point de croix, une maille de tricot, une perle tissée ou un carré de patchwork, coloré selon son état et son âge.

<GenArtDemo series="automata" />

Crédits : les automates élémentaires et totalistes de Stephen Wolfram (1983, 1984), le Jeu de la vie de John Horton Conway et les règles « Life-like » réunies dans le catalogue MCell de Mirek Wójtowicz, et l'automate cyclique de David Griffeath, étudié avec Robert Fisch et Janko Gravner (1991).

### Hilbert

Une seule ligne qui passe par chaque case d'un carré. Chaque œuvre trace une des cinq courbes classiques, Hilbert, Moore, Peano, Sierpinski ou Gosper (qui remplit une île hexagonale), par subdivisions successives. À ordre adaptatif, un champ de bruit décide où subdiviser davantage, si bien que la ligne se serre à certains endroits et s'ouvre en larges boucles ailleurs, tout en restant une seule ligne. Elle est tracée à l'encre simple, en dégradé avec une épaisseur qui gonfle lentement, en ruban creux, en trois ordres de la même courbe superposés, ou en deux ou trois copies entrelacées.

<GenArtDemo series="hilbert" />

Crédits : les courbes de Giuseppe Peano (1890), David Hilbert (1891), E. H. Moore (1900) et Wacław Sierpiński (1912), et le flowsnake de Bill Gosper, publié par Martin Gardner (1976).

### Isometric

Un petit quartier est dessiné sur une grille carrée et posé sur un socle comme une maquette : une ville avec une place et une fontaine, des terrasses reliées par des escaliers, une île avec un phare et une jetée, un quartier de canaux et de ponts en arc, ou une citadelle fortifiée. Chaque case reçoit une hauteur et au plus une chose : un immeuble au toit plat, en croupe, à pignon ou en dôme, une tour, quelques arbres, un escalier, une arche. Rien ne copie un lieu réel. Le quartier est dessiné du fond vers l'avant, chaque bloc en trois tons, et les ombres sont calculées à partir des bâtiments qui les projettent. La nuit, certaines fenêtres sont allumées.

<GenArtDemo series="isometric" />

Crédits : la vraie projection isométrique ; l'algorithme du peintre dans l'ordre i + j ; des ombres balayées le long de la lumière (une somme de Minkowski construite avec la chaîne monotone d'Andrew) et découpées avec l'algorithme de Sutherland–Hodgman.

### Knots

Une tresse de brins en diagonale qui se croisent au milieu de chaque arête d'une grille carrée. Des coupures sont placées sur les lignes de la grille. Quand un brin en rencontre une, il fait demi-tour au lieu de croiser, et la tresse devient un entrelacs, avec des bordures, des terminaisons d'angle et des boucles fermées. Chaque brin passe dessus, dessous, puis dessus encore tout du long, quelles que soient les coupures. Une œuvre est un panneau, un panneau dans une bordure d'entrelacs, un abécédaire de petits panneaux ou un nœud torique dans un médaillon, et les brins sont dessinés en tubes, en rubans fendus, en bandes plates ou en relief sculpté.

<GenArtDemo series="knots" />

Crédits : la méthode de construction de George Bain (1951), d'après J. Romilly Allen (1903), dans la formulation de Peter R. Cromwell, « Celtic Knotwork: Mathematical Art » (1993). L'entrelacs insulaire est emprunté pour sa construction seulement, et aucun panneau ne copie un panneau historique.

### Pelt

Un morceau de peau posé le long d'une colonne vertébrale : un gros plan de dos, un flanc, ou un corps entier enroulé, la queue autour. Des cellules pigmentaires s'activent les unes les autres à courte distance et s'éteignent à plus longue distance, et de cette seule règle le pelage se fixe en taches, rosettes, rayures, réseau réticulé ou grandes plaques pie. Sur une queue étroite, la même règle ne peut faire que des anneaux. Ensuite, des dizaines de milliers de poils poussent. Chacun prend le pigment à sa racine et suit un champ de peignage qui se sépare le long de la colonne, retombe sur les flancs et tourne autour des épis, et les poils couchés en travers de la lumière prennent un reflet.

<GenArtDemo series="pelt" />

Crédits : Alan Turing, [The Chemical Basis of Morphogenesis](https://doi.org/10.1098/rstb.1952.0012) (1952) ; les travaux de J. D. Murray sur les pelages (1981, 1988), dont l'argument sur les queues ; le modèle activateur–inhibiteur de D. A. Young (1984) ; les rosettes en deux étapes de Liu, Liaw et Maini (2006) ; le terme de reflet du modèle de cheveux de Kajiya et Kay (1989).

### Crackle

Une couche qui rétrécit en séchant se casse en cellules. Ici, chaque fissure est un petit agent : elle part d'une fissure plus ancienne à peu près à angle droit, dévie un peu, se tourne pour rencontrer la fissure suivante bien en face et s'arrête là. Une fissure n'est gardée que si l'espace qu'elle coupe est plus large qu'un écart fixé par l'épaisseur de la couche, donc les cellules sortent régulières, et plus fines là où la couche est mince. Les premières fissures traversent toute la dalle et restent les plus larges. Les cellules sont ensuite finies en émail craquelé aux lignes sombres et dorées, en écailles de vieille peinture vernie, en tuiles d'argile recourbées ou en facettes de glace.

<GenArtDemo series="crackle" />

Crédits : [Substrate](http://www.complexification.net/gallery/machines/substrate/) de Jared Tarbell (2003), réécrit ici avec la dérive, la rencontre bien en face et la règle d'écart ; les hiérarchies de fissures étudiées par Bohn, Pauchard et Couder (2005) ; le craquelé « fil de fer et fil d'or » des céramiques Ge de la dynastie Song.

### Meander

Le canvas est divisé en pièces, chacune avec un réseau carré, où les agents tournent de 90°, ou triangulaire, où ils tournent de 60° ou 120°. Les agents vont de nœud en nœud, ne croisent jamais aucun chemin, et s'arrêtent aux murs et à quelques pierres rondes. Un agent serpentin laboure en allers-retours, un agent spirale tourne toujours du même côté, un agent clé rejoue un petit programme de tortue (un crochet de grecque, des créneaux, un spirolatéral), et un agent errant tourne au hasard. Quand tous sont bloqués, un nouvel agent part de chaque nœud libre, si bien que chaque pièce finit remplie de couloirs parallèles. Ils sont tracés en canaux, en doubles lignes, en traits de plume large ou en pistes de circuit avec des pastilles percées.

<GenArtDemo series="meander" />

Crédits : la grecque et le boustrophédon, empruntés comme motifs seulement ; la géométrie de la tortue du Logo de Seymour Papert, telle que la décrivent Abelson et diSessa (1980) ; les spirolatéraux de Frank C. Odds (1973).

### Isolines

Une figure est assemblée à partir de cercles, de rectangles, de capsules et de triangles, fondus par des unions douces, entamés par des soustractions ou évidés en coques. Un champ de distance signée donne, en chaque point de la feuille, la distance au contour de la figure, et la série trace ses lignes de niveau selon un rythme fixe (quelques lignes, puis une bande), si bien que la figure résonne jusqu'aux bords du papier et jusqu'à son cœur. Les bandes restent vides, sont hachurées ou remplies. Puis quelques événements perturbent le champ localement : une couture où les lignes se décalent, un pli, une ondulation.

<GenArtDemo series="isolines" />

Crédits : les articles d'Inigo Quilez sur les [fonctions de distance 2D](https://iquilezles.org/articles/distfunctions2d/) et le [minimum doux](https://iquilezles.org/articles/smin/) ; marching squares, le cas 2D du marching cubes de Lorensen et Cline (1987).

### Orbits

Des anneaux sont empilés autour d'un centre, de l'intérieur vers l'extérieur. Une petite grammaire choisit le suivant à chaque fois : un sillon de traits fins, un anneau pointillé, une graduation de cadran, quelques arcs brisés, une spirale de points, une couronne dentée, un chapelet de perles ou une bande pleine. Les phases s'alignent, tournent en tourbillon ou tombent n'importe où. Au-delà de son rayon nominal, la pile continue, plus pâle, jusqu'au coin le plus éloigné, donc elle remplit un canvas de n'importe quelle forme. Des satellites se posent sur certains anneaux, et des orbites excentriques traversent la pile avec leurs corps placés à pas de temps égaux, donc ils se resserrent loin du foyer. La composition est un seul système, une paire binaire, une planète et ses lunes, un système centré près d'un coin, ou une pile qui se décentre.

<GenArtDemo series="orbits" />

Crédits : une grammaire d'anneaux originale, qui emprunte l'allure des astrolabes, des cadrans et des planétaires sans en copier aucun ; les deux premières lois de Kepler (1609), avec l'[équation de Kepler](https://fr.wikipedia.org/wiki/%C3%89quation_de_Kepler) résolue par la méthode de Newton ; des points espacés le long d'une spirale d'Archimède.

### Bloom

Une forme de pétale, ronde, pointue, échancrée, frangée ou longue comme un ruban, est répétée trois à douze fois autour d'un centre, sur une à quatre couronnes. Il n'y a pas de pinceau. Chaque pétale est un petit polygone dont les arêtes sont coupées encore et encore, chaque nouveau point déplacé d'une quantité aléatoire, et le résultat est rempli des dizaines de fois à quelques pour cent d'opacité, déformé à nouveau à chaque fois. Les couches s'accordent au milieu et divergent au bord, donc un pétale a un cœur dense et un bord doux qui bave, et les pétales voisins se mélangent là où leurs couches se chevauchent. Les étamines, les feuilles, les tiges et les lavis sur le papier sont peints de la même façon.

<GenArtDemo series="bloom" />

Crédits : les polygones translucides en couches décrits par Tyler Hobbs dans [A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art) (2017), implémentés ici de façon indépendante et appliqués aux pétales ; le déplacement récursif du point milieu d'après Fournier, Fussell et Carpenter (1982) ; le tutoriel de Sighack, [Generative Watercolor in Processing](https://sighack.com/post/generative-watercolor-in-processing), sur la même technique.

### Swarm

Quelques centaines à quelques milliers de boids nagent pendant 280 pas en suivant trois règles locales : garder ses distances avec les voisins proches, s'aligner sur leur direction, dériver vers leur centre. Rien n'est dessiné pendant qu'ils bougent. L'œuvre est une pose longue de toute la course. Chaque trace est fine et translucide, donc les endroits où le banc est souvent passé s'accumulent comme la lumière sur une pellicule. Un banc suit un courant autour de rochers, des prédateurs ouvrent une rivière de boids, des bancs tournent autour de tourbillons, ou des couloirs de migrateurs se croisent. Un flash sur le second rideau peut figer chaque boid à la fin de la course, ou un stroboscope les saisir plusieurs fois en route.

<GenArtDemo series="swarm" />

Crédits : Craig Reynolds, [Flocks, Herds, and Schools](https://www.red3d.com/cwr/boids/) (1987) et [Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/) (1999) ; l'écoulement potentiel autour d'un cylindre des manuels pour le courant autour des rochers.

### Patent

Une planche de brevet pour une machine qui n'a jamais été construite. La machine est montée pièce par pièce, chaque pièce attachée à une autre déjà sur la planche. Un engrenage s'engrène avec un autre à la somme de leurs rayons primitifs, une courroie court sur les tangentes de deux poulies, un galet suit une came, une manivelle entraîne un piston ou un balancier, un rouage d'horlogerie finit sur un échappement et un pendule. Une pièce qui chevaucherait quoi que ce soit auquel elle n'est pas attachée est rejetée. La Fig. 1 montre la machine avec des traits d'ombre épais sur les arêtes opposées à la lumière, et certaines planches ajoutent un axe en vue éclatée et un engrènement agrandi. L'inventeur, le titre, le numéro et la date sont inventés, et le lettrage est tracé avec une petite police de traits écrite pour la série.

<GenArtDemo series="patent" />

Crédits : les conventions de dessin des brevets du XIXᵉ siècle ; les dentures en développante de cercle (Euler dans les années 1750, _Principles of Mechanism_ de Robert Willis, 1841) ; les quadrilatères articulés de Grashof et leurs courbes de bielle (Hrones et Nelson, 1951).

## Trente-deux séries

Les voici toutes, dans l'ordre de l'index. Chaque vignette ouvre la page de sa série.

<GenArtStrip />

[La collection](/genart/collection) fonctionne comme avant. Elle réunit les œuvres que j'ai choisi de garder, numérotées dans l'ordre où elles sont entrées, et une œuvre de n'importe laquelle des trente-deux séries peut la rejoindre. Chaque œuvre mise en avant se télécharge en huit formats, du Full HD au 8K ou à une taille libre, en PNG, JPEG ou WebP. Les fichiers téléchargés portent le petit monogramme en bas à droite, et les PNG contiennent aussi le titre, l'auteur, la licence et l'URL source. Les œuvres affichées sur les pages ne sont jamais signées.

## Licences

Les œuvres sont de moi, sous licence [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.fr) : tu peux les partager en me citant, mais pas les vendre ni publier de versions modifiées. Le code est dans le [dépôt du site](https://github.com/Alexvolkihar/alexvolkihar.me), sous licence MIT.

Comme pour les quatorze premières, j'ai écrit le code avec un assistant IA. Chaque œuvre est dessinée par ce code, et il n'y a aucune image générée par IA dans la section.

La section est sur [/genart](/genart). Si une œuvre de cet article t'a plu, **Ouvrir la série** garde son hash.
