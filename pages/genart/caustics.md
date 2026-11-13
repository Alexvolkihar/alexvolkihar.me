---
title: Caustics - Generative Art - Alexvolkihar
display: Caustics
subtitle: Sunlight focused by moving water
description: Caustics, a deterministic light-refraction series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Sunlight falls on a wavy surface and every ray is bent by Snell's law on its way down to the floor. Under the crests the rays converge like they would under a lens, and the light piles up into the bright folded lines of a caustic network. Under the troughs it spreads thin. The surface can be a long swell, a short chop, a ruffled wind sea or a set of rings spreading from drops. The floor depth is set from the surface's own curvature: soft light before the first focus, sharp lines right at it, or a denser net past it. Pools are deeper at one end, so the lines sharpen across the picture. The floor is then seen from above through the same water, so the grout and lane lines wobble, and the water column tints it with depth. In the rarest scene the surface is a leaded window of coloured glass, and its light falls on a wall: each pane tints the light it lets through, and the uneven glass bends it into small caustics of its own. The light is added up in linear units, and each piece sets its own exposure from its brightest and its median light, so the cores of the lines roll off towards white instead of clipping flat. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="caustics" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="caustics" />

## Credits

- Light transport: one ray per lattice point of the surface, refracted with the vector form of Snell's law and followed down to the floor, its light gathered there in an illumination map, after James Arvo, [Backward Ray Tracing](https://courses.cs.washington.edu/courses/cse457/12sp/projects/trace/extra/Backward.pdf) (SIGGRAPH 1986 course notes, "Developments in Ray Tracing").
- Brightness by area ratio: each small triangle of the surface carries a fixed amount of light, spread over the triangle it becomes on the floor, as in Evan Wallace, [Rendering Realtime Caustics in WebGL](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c) (2016). Triangles that shrink are splatted as single photons, larger ones are cut into more photons or rasterised.
- Background: Jos Stam's [Random Caustics](https://www.dgp.toronto.edu/~stam/INRIA/caustics.html) (SIGGRAPH 1996 sketch) showed caustic textures on a pool floor at different depths; this series traces rays instead of Stam's wave optics.
- Exposure: the exposure is set from percentiles of a small fixed probe render, in the spirit of the key value of Erik Reinhard, Michael Stark, Peter Shirley and Jim Ferwerda, [Photographic Tone Reproduction for Digital Images](https://www-old.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf) (SIGGRAPH 2002). The highlights then roll off on an exponential shoulder, as filmic curves do: see John Hable, [Filmic Tonemapping Operators](https://filmicworlds.com/blog/filmic-tonemapping-operators/) (2010).
- Water: sums of plane waves, ring packets from drops, and Beer–Lambert absorption by the water column. The Prism light gives each colour channel its own refractive index, with the dispersion of water exaggerated so the fringes show. The implementation is original, written from these descriptions.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
