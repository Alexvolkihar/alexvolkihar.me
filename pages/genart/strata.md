---
title: Strata - Generative Art - Alexvolkihar
display: Strata
subtitle: Layered ridgelines fading into the haze
description: Strata, a deterministic series of layered landscapes where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A landscape seen from the side, built as a stack of ridgelines. Each ridge is a few octaves of one-dimensional noise, and the ridges are filled from the farthest to the nearest so that the near ones hide the far ones. Distance is shown by colour alone: far ridges fade into the haze at the horizon, near ones get darker. A piece can be dunes, rolling hills or sharp peaks, under a clear sky, a low sun or moon, or a banded screen-print sky. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="strata" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="strata" />

## Credits

- Ridgelines: one-dimensional gradient noise after Ken Perlin (1985), summed as fractal Brownian motion for the hills, folded into ridges for the dunes, and shaped with F. Kenton Musgrave's ridged multifractal for the peaks.
- Depth: painter's algorithm (back-to-front filling) and aerial perspective, a depth-weighted mix of every ridge towards the colour of the horizon.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
