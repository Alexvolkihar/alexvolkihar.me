---
title: Contours - Generative Art - Alexvolkihar
display: Contours
subtitle: Topographic maps of terrain that does not exist
description: Contours, a deterministic series of imaginary survey maps where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a survey sheet of a place that was never surveyed. A noise heightfield, folded on itself by domain warping, is cut into level lines; every fifth line is drawn heavier, the way index contours are on printed maps. Some sheets are left as bare line work, some are tinted band by band from the shore to the summits under a light from the north-west, and some are engraved with hachures that run down the steep slopes. Water settles in the low ground as lakes, a coastline or a scatter of islands, edged by fading water lines. Press **New seed** for a fresh hash, then share the URL to show someone that exact map.

</div>

<GenArtGallery series="contours" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="contours" />

## Credits

- Terrain: gradient noise after Ken Perlin's "Improving Noise" (2002), summed as fractional Brownian motion with ridged octaves after F. Kenton Musgrave, and bent by domain warping as described by Inigo Quilez.
- Isolines: marching squares, the 2D case of Lorensen & Cline's marching cubes (1987), with linear interpolation along cell edges.
- Hill shading follows the usual cartographic convention of a light from the north-west; the hachures are drawn along the slope between two contours and thicken with steepness, after Johann Georg Lehmann's rule (1799).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
