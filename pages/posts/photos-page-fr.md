---
title: La page Photos
date: 2026-07-29T12:00:00Z
lang: fr
duration: 3min
---

Comme tu l'as peut-être remarqué, j'ai ajouté une [page photos](/photos) sur ce site. C'est quelque chose que je voulais faire depuis un moment, sans jamais m'y mettre vraiment.

J'avais déjà une petite galerie maison hébergée sur un autre domaine, mais je me retrouvais avec mes photos éparpillées à trois endroits différents : Instagram, cette galerie à part, et mon site perso. Centraliser tout ça ici avait du sens : un seul endroit à maintenir, un seul design à soigner.

Le déclencheur, c'est surtout Instagram. C'était une appli sympa et minimaliste pour partager des photos, jusqu'au rachat par Meta qui a peu à peu tout changé. Les algorithmes, les pubs, les vidéos courtes partout, je faisais avec. Mais le [changement du ratio des grilles de profil, passées du carré au 4:5](https://www.standard.co.uk/news/tech/instagram-update-how-adjust-profile-grid-what-changes-coming-b1205890.html) a été la goutte de trop : une décision qui recadre le contenu de tout le monde sans vraiment donner d'alternative propre.

J'ai de la chance d'être développeur : je peux construire ma propre plateforme plutôt que de subir. J'ai [demandé l'export de toutes mes données Instagram](https://accountscenter.instagram.com/info_and_permissions/dyi/), récupéré ma galerie maison, et importé le tout sur le site. J'utilise [`sharp`](https://github.com/lovell/sharp) pour traiter les images et un [script de compression](https://github.com/Alexvolkihar/alexvolkihar.me/blob/main/scripts/photos-manage.ts) qui gère aussi les métadonnées, pour ne plus avoir à me soucier de la taille des fichiers hébergés.

Voici quelques-unes de [mes photos récentes](/photos) :

<div mb-8>
  <PhotoGalleryAll :limit="12" class="gap-1!" />
</div>

La qualité de certaines images en pâtit un peu, Instagram compressait pas mal à l'époque. Je remplacerai sûrement quelques clichés par leurs originaux en meilleure qualité au fil du temps, mais c'est déjà un bon point de départ.

J'espère prendre l'habitude de partager plus régulièrement, maintenant que j'ai enfin ma propre plateforme pour ça.

Merci de ta lecture, et j'espère que [mes photos](/photos) te plairont !
