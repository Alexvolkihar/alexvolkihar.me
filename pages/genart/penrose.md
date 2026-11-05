---
title: Penrose - Generative Art - Alexvolkihar
display: Penrose
subtitle: Aperiodic tilings with five-fold symmetry
description: Penrose, a deterministic series of aperiodic rhomb and kite-and-dart tilings where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a Penrose tiling. It is made of thick and thin rhombs or of kites and darts, and it never repeats, yet the same few neighbourhoods come back everywhere. The tiling is grown by deflation. It starts as a five-fold "sun" much larger than the canvas, cut into Robinson triangles. Then every triangle is replaced, again and again, by two or three smaller ones, each step shrinking them by the golden ratio, until the tiles reach the size the hash asks for. Around the centre of the sun the pattern keeps an exact five-fold symmetry, and some pieces sit right on it. Others drift away from it. The tiles are coloured by type, by orientation, by the larger tile they came from a few deflations back, or by decagonal rings around the centre. Then they are outlined, set as tesserae in grout, creased along their seam, or decorated with matching arcs that join up into closed rings and endless worms. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="penrose" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="penrose" />

## Credits

- Tiles: Roger Penrose's aperiodic sets, the kites and darts (P2) and the thick and thin rhombs (P3), from his 1974 paper "The Role of Aesthetics in Pure and Applied Mathematical Research" and popularised by Martin Gardner in _Scientific American_ (January 1977).
- Construction: deflation of Robinson triangles (Raphael Robinson), as described by Branko Grünbaum and G. C. Shephard in _Tilings and Patterns_ (1987). The rhomb subdivision follows Jeff Preshing's and Christian Hill's write-ups. The kite-and-dart rules were derived in the same form, and both were checked: every shared edge of the result is matched.
- Arcs: the matching arcs that Penrose and John H. Conway drew on the tiles. Conway's "worms" are the curves they form. Their radii were chosen so that every arc meets its neighbour on the shared edge.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
