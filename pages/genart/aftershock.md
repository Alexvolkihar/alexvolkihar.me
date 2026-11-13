---
title: Aftershock - Generative Art - Alexvolkihar
display: Aftershock
subtitle: A patterned surface after a main shock and its aftershocks
description: Aftershock, a deterministic series of fine pattern fields struck by a few shapes that slice, pixelate, warp, erode or invert them, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as a calm surface: a field of fine patterns computed pixel by pixel. Ruled lines and waves are the level lines of a slowly bent coordinate, chevrons follow a zigzag, contours trace a noise relief, rings spread from a few centres, dots sit on a hexagonal lattice, and a patchwork splits the plate into cells that each carry their own pattern. Every pattern is written as a distance to the ink, so the lines keep an even weight, and a slow noise makes that weight swell and thin across the plate. Then a main shock strikes, followed by smaller aftershocks. Each one is a shape (a circle, a box, a triangle, a spike or a band across the plate) with an effect on whatever lies inside it: the surface is cut along cracks that open on the bare ground, and the strips slide, tilt and change scale and shade, or it is averaged into coarse blocks and dithered into dots or stripes, seen through a lens, swirled or turned like a plug, worn away by a fine grain, or inverted, sometimes onto a coloured ground. The shocks are replayed in order, so a later one acts on what the earlier ones left: a crack can itself be pixelated, and an inverted shape can be swirled. The plate sits in a paper margin. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="aftershock" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="aftershock" />

## Credits

- Shapes and patterns: signed distance functions after Inigo Quilez's articles "[2D distance functions](https://iquilezles.org/articles/distfunctions2d/)" (circle, box, equilateral and isosceles triangles) and "[Distance estimation](https://iquilezles.org/articles/distance/)" (dividing a field by its gradient to keep the level lines evenly spaced).
- Contours: value noise with analytic derivatives, after Inigo Quilez's "[Value noise derivatives](https://iquilezles.org/articles/morenoise/)", so the relief's gradient comes with its value.
- Patchwork: a Voronoi partition, with the exact distance to the edge between the two nearest sites to leave a bare gap between cells.
- Pixelation: each block's average tone is set to ground or ink by an ordered dither, either Bryce Bayer's 4 × 4 matrix ("An optimum method for two-level rendition of continuous-tone pictures", 1973) or a line screen.
- Shocks: each pixel is mapped back through the shocks in reverse order (a slide, a turn, a change of scale and a shade per strip for a fault, a 4 × 4 average per block for a pixelation, a radial lens, a swirl or a rigid turn for a warp), then eroded with a two-scale noise threshold or inverted along the ground-to-ink axis. The implementation is original.
- Inspired by Camille Roux's [Résilience](https://art.camilleroux.com/work/resilience/) (2024).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
