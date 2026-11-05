---
title: Mosaic - Generative Art - Alexvolkihar
display: Mosaic
subtitle: Stained glass cut from a relaxed Voronoi diagram
description: Mosaic, a deterministic stained-glass series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Seed points are scattered over the window, more of them where the motif needs fine pieces, then nudged a few times towards the centre of their own cell until the pieces even out. Each cell becomes a piece of glass, its edges slightly bowed as if cut by hand. The colour of every piece comes from a larger pattern, a rose, a sunburst, rings, bands or loose patches, so a picture still reads from across the room. Light passes through each piece as a soft gradient with faint streaks and bubbles, and dark lead came with soldered joints holds it all together. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="mosaic" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="mosaic" />

## Credits

- Cells: the Voronoi diagram (Georgy Voronoi, 1908), computed by clipping each cell against the perpendicular bisectors of its neighbours (Sutherland & Hodgman, 1974), with neighbours found through a uniform grid.
- Relaxation: Lloyd's algorithm (Stuart Lloyd, "Least squares quantization in PCM", 1982), with centroids weighted by a density so that small pieces gather around the motif.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
