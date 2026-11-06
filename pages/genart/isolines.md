---
title: Isolines - Generative Art - Alexvolkihar
display: Isolines
subtitle: Level lines of figures built from distance functions
description: Isolines, a deterministic series of banded level lines around constructed figures, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a figure assembled out of a few plain shapes: circles, boxes, capsules and triangles, merged with soft unions, bitten by subtractions or hollowed into shells. A signed distance field measures, at every point of the sheet, how far it lies from that figure's outline. The series draws the field's level lines in a fixed rhythm (a few lines, then a band) so that the figure echoes outwards to the edges of the paper and inwards to its core. The bands are left blank, ruled with hatching that turns where it crosses the outline, or filled flat. Then a few events, chosen by the hash, disturb the field locally: a seam where the lines step by a phase, a fold that creases them, a ripple that makes them wave. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="isolines" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="isolines" />

## Credits

- Figures: signed distance functions for the circle, box, rounded box, segment and equilateral triangle, the "onion" shell and smooth combinations, after Inigo Quilez's articles [2D distance functions](https://iquilezles.org/articles/distfunctions2d/) and [smooth minimum](https://iquilezles.org/articles/smin/), written here in TypeScript.
- Level lines: marching squares, the 2D case of Lorensen & Cline's marching cubes (1987), with linear interpolation along cell edges and saddles resolved by the cell average. The bands are filled pixel by pixel from the same grid, antialiased by the local gradient.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
