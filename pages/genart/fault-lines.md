---
title: Fault Lines - Generative Art - Alexvolkihar
display: Fault Lines
subtitle: A hash-seeded generative series, drawn with plain Canvas 2D
description: Fault Lines, a deterministic generative art system where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A square slab is cut again and again by straight faults until it breaks into convex shards. Each shard is pulled away from its neighbours and engraved with its own hatching. Every output comes from one 32-byte hash, so the same hash always gives the same artwork at any size. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="fault-lines" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="fault-lines" />

## Credits

- Recursive subdivision of convex polygons, with half-plane clipping after Sutherland & Hodgman (1974). Shards are inset by clipping them against their own shifted edges.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
