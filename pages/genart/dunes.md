---
title: Dunes - Generative Art - Alexvolkihar
display: Dunes
subtitle: Dune fields grown slab by slab by the wind
description: Dunes, a deterministic series of aeolian dune fields grown with Werner's slab model, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as loose sand on a bare floor: an uneven sheet and a few heaps. Then the wind blows. Hundreds of thousands of times, a spot is picked at random; if it holds sand and is not sheltered behind a crest, one slab of sand is lifted and carried a few steps downwind, where it may settle or bounce on. Behind every crest lies a wind shadow where slabs always drop, and any slope steeper than the angle of repose slides down until it is stable again, which builds the steep slip faces. Nothing else is programmed: with one steady wind and little sand the heaps become crescent barchans whose horns point downwind; with more sand they fuse into barchanoid and transverse ridges; two seasonal winds stretch the sand into long linear seifs, and winds from all four quarters gather it into star dunes and networks. The field is then lit by a high, low or grazing sun, combed by wind ripples, and seen from straight above or from a low angle that runs to the horizon. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="dunes" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="dunes" />

## Credits

- Dunes: the slab model of Bradley T. Werner, "Eolian dunes: computer simulations and attractor interpretation" (_Geology_ 23, 1995): slabs picked at random, carried a fixed hop downwind, deposited with a higher probability on sand than on bare ground and always inside the 15° shadow zone of an upwind crest, with avalanching at the angle of repose, on a periodic grid. Werner's model reproduces barchans, transverse, linear and star dunes from the wind regime and the sand supply alone. The review by Jasper F. Kok, Eric J. R. Parteli, Timothy I. Michaels and Diana Bou Karam, "[The physics of wind-blown sand and dust](https://arxiv.org/abs/1201.4353)" (_Reports on Progress in Physics_ 75, 2012), describes the model and its descendants. The implementation here is original, written from those descriptions; the shadow zone is kept up to date incrementally, slabs are picked among the cells that hold sand (the same process as picking any cell and skipping bare ones, only faster), and several winds blow in turn, as seasons. The field is a torus, seen turned and gently warped from above. So that a wide canvas does not show the same dunes over and over, four copies of the torus, shifted by random fractions of a period, share the plane: the sand is split into dunes (two dunes stay apart where the neck between them is low), and each copy keeps the dunes whose centre falls where its own slow, never-repeating noise is the highest, so dunes are kept or dropped whole and only the middle of the canvas shows the field exactly as it grew.
- Low-angle view: the column-by-column heightmap renderer known as Voxel Space, from Kyle Freeman's engine for _Comanche_ (NovaLogic, 1992), as documented by Sebastian Macke in [VoxelSpace](https://github.com/s-macke/VoxelSpace). Heights are exaggerated one and a half times, the camera stands a little above the crests and is aimed at one of the tallest dunes, chosen among several placements for the clearest line of sight, and distance fades into an aerial haze.
- Light: Lambertian hillshade with shadows cast by marching towards the sun over the height grid. Slip faces are found where the model left steps at the angle of repose, and rebuilt at the resolution of the image as planes at that angle, with a crisp brink on convex crests; wind ripples are added to the surface normal across the main wind, on the stoss slopes and flats only, and the interdune floor is shaded nearly flat with a fine grain.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
