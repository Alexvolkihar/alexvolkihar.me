---
title: Crackle - Generative Art - Alexvolkihar
display: Crackle
subtitle: Craquelure grown by crack agents
description: Crackle, a deterministic craquelure series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A layer that shrinks as it dries, glaze on a pot, old oil paint, mud at the bottom of a pond, breaks into cells. Here every crack is a small agent. It leaves an older crack at about a right angle, wanders a little, turns to meet the next crack square on and stops as soon as it reaches it. A crack is only kept if the space it cuts is wider than a critical spacing that follows the thickness of the layer, so the cells come out even, and finer where the layer is thin. The first cracks cross the whole slab and stay the widest; the later ones only divide what is left between them. The closed cells are then finished one by one as the chosen material: glossy crackle glaze with stained dark and golden lines, cupped flakes of a varnished painting, curled tiles of clay over their own shadows, or facets of ice with white fracture planes. The layer fills the whole frame, sits on a cloth as a round piece (a bowl, a tondo, a dried puddle, a frozen pool), or is laid as square tiles, and then the cracks start from the grout lines. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="crackle" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="crackle" />

## Credits

- Crack agents: after Jared Tarbell's [Substrate](http://www.complexification.net/gallery/machines/substrate/) (2003), where lines grow from a random point of an older line at a right angle and stop when they hit another one. The agents here are a new implementation with wandering, square-on meeting and a spacing rule.
- Hierarchy: S. Bohn, L. Pauchard and Y. Couder, [Hierarchical crack pattern as formed by successive domain divisions](https://hal.archives-ouvertes.fr/hal-00016468) (Phys. Rev. E 71, 2005), which reads the crack networks of ceramic glazes and dried mud as a family tree of successive domain divisions.
- Glaze: the two orders of dark and golden lines recall the "iron wire and golden thread" crackle of Song dynasty Ge ware.
- Cells: the faces of the planar crack network, found by walking the half-edges around each junction.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
