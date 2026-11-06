---
title: Sandpile - Generative Art - Alexvolkihar
display: Sandpile
subtitle: Grains toppled until every site is stable
description: Sandpile, a deterministic series of abelian sandpiles, their identity elements and plateaus, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is the final state of an abelian sandpile. Grains are dropped on a lattice whose edge is a sink. Any site that holds as many grains as it has neighbours topples and passes one grain to each neighbour, and grains pushed over the edge are lost. When no site can topple any more, the pile is stable. The result does not depend on the order of the topplings, so the same drop always settles into the same picture. The hash picks the lattice (four neighbours, eight, or six on a hexagonal grid), the shape of the tray, and where the grains go: a heap at a single site, a symmetric ring of heaps, a heap dropped onto a tray already filled to a uniform plateau, or the identity element of the tray's sandpile group, which is the configuration that leaves every recurrent configuration unchanged when added to it. The identity depends only on the tray, so its size varies from piece to piece and half of the trays have a round hole in the middle that drains into the sink like the edge. The stable heights, from empty to almost full, are painted as tiles, as dots that grow with the height, or as a relief lit from the upper left, in which the checkerboards and stripes of the pile flatten into tones. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="sandpile" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="sandpile" />

## Credits

- Sandpile model: Per Bak, Chao Tang and Kurt Wiesenfeld, "Self-organized criticality: an explanation of 1/f noise" (_Physical Review Letters_, 1987). The abelian property and the sandpile group are from Deepak Dhar, "Self-organized critical state of sandpile automaton models" (_Physical Review Letters_, 1990).
- Identity element: computed as the stabilization of 2c<sub>max</sub> − (2c<sub>max</sub>)°, the standard construction (see David Perkinson, Jacob Perlman and John Wilmes, "[Primer for the algebraic geometry of sandpiles](https://arxiv.org/abs/1112.6163)", 2011). Its fractal patterns were made famous by Michael Creutz ("Abelian sandpiles", _Computers in Physics_, 1991) and studied by Yvan Le Borgne and Dominique Rossin ("On the identity of the sandpile group", _Discrete Mathematics_, 2002).
- Piles grown from a point and on a uniform background: Lionel Levine and Yuval Peres, "Laplacian growth, sandpiles, and scaling limits" (_Bulletin of the AMS_, 2017), and Anne Fey, Lionel Levine and Yuval Peres, "Growth rates and explosions in sandpiles" (_Journal of Statistical Physics_, 2010), whose background of height two on the square lattice is the plateau used here (two grains below the toppling threshold, on every lattice).
- Speed: a site holding h grains fires floor(h / T) times at once, and when the tray and the drop share symmetries of the lattice, the grid is folded so that only one site per orbit is toppled (an eighth of the square, a twelfth of the hexagon). The count of topplings is fixed by the drop (it is the odometer of the least action principle described by Fey, Levine and Peres), so the grid size never depends on the size of the image. Tobias Friedrich and Lionel Levine's "Fast simulation of large-scale growth models" (2013) is the reference for faster odometer methods; it is not used here.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
