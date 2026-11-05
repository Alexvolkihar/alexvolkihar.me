---
title: Packing - Generative Art - Alexvolkihar
display: Packing
subtitle: Circles packed into a shape, each with its own motif
description: Packing, a deterministic circle-packing series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Circles are dropped one by one into a square, a disc or a cloud of overlapping discs. Each new circle grows until it touches a neighbour, and the size limit shrinks as the shape fills up, so a few large circles come first and smaller ones fill the gaps. Every circle then gets its own small motif: concentric rings, a single arc, a dot, radial spokes, a half moon or nested tangent circles. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="packing" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="packing" />

## Credits

- Circle packing by random sequential addition (the dart-throwing scheme behind Poisson-disc sampling), with a decaying radius cap and a uniform grid for the collision checks.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
