---
title: Truchet - Generative Art - Alexvolkihar
display: Truchet
subtitle: Winged tiles at every scale
description: Truchet, a deterministic series of multi-scale Truchet patterns where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A grid of squares is split into four, and the quarters split again, by a rule taken from the hash: plain chance, a drifting noise field, the pull of a few focal points, or the outline of a shape that the tiles fill. Every square then gets one of fifteen winged motifs (quarter-circle arcs, straight bars, dots, T junctions). At each step down in scale the two colours swap and the smaller tiles are laid over the larger ones. Their wings close every gap, so bands and dots of all sizes join into continuous light and dark regions. A colour ladder can shift the pair at each scale, and a gradient can tint the ink. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="truchet" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="truchet" />

## Credits

- Truchet tiles: Sébastien Truchet, _Mémoire sur les combinaisons_ (Mémoires de l'Académie Royale des Sciences, 1704), and the quarter-circle variant that Cyril Stanley Smith described in "The Tiling Patterns of Sebastien Truchet and the Topology of Structural Hierarchy" (with Pauline Boucher, _Leonardo_ 20(4), 1987).
- Multi-scale tiles: Christopher Carlson, ["Multi-Scale Truchet Patterns"](https://archive.bridgesmathart.org/2018/bridges2018-39.html) (Bridges 2018). The winged tile, the inversion of colours at each halving, the drawing of smaller tiles on top, the fifteen motifs and the subdivision fill of a shape (subdivision tested on the winged square) all come from that paper. The code here is my own implementation of it.
- Subdivision: a quadtree whose splits follow chance, value noise on an integer-hashed lattice, distance to focal points or signed distance functions of simple shapes. Per-tile choices hash the integer cell coordinates, so a wider canvas shows more of the same tiling.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
