---
title: Isometric - Generative Art - Alexvolkihar
display: Isometric
subtitle: Tiny invented districts in isometric projection
description: Isometric, a deterministic series of small imaginary towns, islands and citadels where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece plans a small district on a square grid and sets it on a plinth, like a model on a table. It can be a town of streets and a square with a fountain, a hillside cut into terraces and joined by flights of steps, an island ringed with sand with a lighthouse and a jetty, a quarter crossed by canals and arched bridges, or a walled citadel around its keep. Every cell gets a hash-chosen height and at most one thing on it: a block of flats with a flat, hipped, gabled or domed roof, a slender tower, a few trees, a stair, an arch. Nothing copies a real place. The district is drawn back to front, every box in three tones (one for the top, one for each side) set by where the light comes from, and the shadows are computed from the buildings that cast them. At night some of the windows are lit. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="isometric" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="isometric" />

## Credits

- Isometric projection: the axonometric drawing of engineers and architects, here in its true isometric form (a vertical unit drawn √1.5 times the half-width of a cell), the same view that tile-based games and pixel artists have long used for small worlds.
- Painter's algorithm: cells are drawn from back to front in order of i + j, which is exact as long as every object stays inside its own cell.
- Shadows: each footprint is swept along the light direction (a Minkowski sum, built as a convex hull with Andrew's monotone chain), clipped to the receiving face with the Sutherland–Hodgman algorithm, and filled in three passes for a soft edge.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
