---
title: Courants - Generative Art - Alexvolkihar
display: Courants
subtitle: Streamlines through a seeded noise field
description: Courants, a deterministic flow-field series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Hundreds of short streamlines are released at random points and follow the direction of a hash-seeded noise field until they reach the margin. The field can be laminar, swelling or full of eddies; a few strokes in each piece carry the accent colour. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="courants" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written.

<GenArtTraits series="courants" />

## Credits

- Flow field: streamlines integrated through two octaves of value noise on an integer-hashed lattice.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).

</div>
