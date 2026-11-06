---
title: Erosion - Generative Art - Alexvolkihar
display: Erosion
subtitle: Terrain carved by simulated rain
description: Erosion, a deterministic hydraulic-erosion series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as a landform that does not exist: a mountain massif, parallel ranges, a plateau of mesas or a group of volcanoes. Then it rains. Tens of thousands of drops are released one after another; each runs downhill, picks up sediment where it moves fast down a steep slope and lays it down where it slows, climbs or reaches the sea. Slopes are scored with gullies, valleys join into branching networks, and fans and deltas build up at their mouths. The worn terrain is then mapped from above: as tinted relief with its rivers, as a drainage sheet where the river network is the subject, as a shaded-relief print, or as a scour map of where the rain carried ground away and where it laid it down. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="erosion" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="erosion" />

## Credits

- Erosion: particle-based hydraulic erosion as described by Hans Theobald Beyer, _Implementation of a method for hydraulic erosion_ (bachelor's thesis, Technische Universität München, 2015), and by Sebastian Lague in [Coding Adventure: Hydraulic Erosion](https://github.com/SebLague/Hydraulic-Erosion) (2019). Drops carry sediment in proportion to their speed, water and slope, erode with a radial brush and deposit bilinearly. The implementation here is original, written from those descriptions.
- Drainage: depressions filled with the priority-flood algorithm of Barnes, Lehman & Mulla, [Priority-flood](https://arxiv.org/abs/1511.04463) (Computers & Geosciences, 2014), and flow accumulation after O'Callaghan & Mark (1984). River widths follow the drained area.
- Terrain: Ken Perlin's gradient noise, summed as fractal Brownian motion and as F. Kenton Musgrave's ridged multifractal, with a light domain warp.
- Mapping: Lambertian hillshade lit from the north-west, hypsometric tints, and the height-dependent contrast of Eduard Imhof's relief shading for the shaded prints. River lines are smoothed with Chaikin's corner cutting.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
