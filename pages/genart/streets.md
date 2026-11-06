---
title: Streets - Generative Art - Alexvolkihar
display: Streets
subtitle: Maps of cities that were never built
description: Streets, a deterministic series of imaginary city maps whose street networks follow a tensor field, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is the map of a city that does not exist. The streets follow a tensor field: a few basis fields are placed on the ground and blended. A grid field holds one direction, and a radial field makes ring roads and spokes around a centre. Along the river banks and the coast, more fields line the streets up with the shore. A tensor field gives two directions at every point, at right angles, and the streets are traced along both of them. The arterial roads come first, widely spaced. The main streets are traced between them, then the side streets in the built-up area. A new street stops at the water or a park, or when it comes too close to a street running the same way. Its loose end then reaches for the nearest road ahead, which closes the blocks. Main roads cross the river on bridges. A radial centre gets a round plaza with a monument.

Buildings are set along the streets as lots, deep and close together downtown and scattered at the edge of town. Beyond the town lie woods and ploughed fields, the fields turned to the same directions as the streets. The map is drawn in one of five styles: a vintage engraved map with water lining, a modern atlas, a blueprint, a night map with lit roads, or a black and white figure-ground plan. Every map has a zebra border, a compass rose and a scale bar. A wider canvas shows more of the same city. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="streets" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="streets" />

## Credits

- Street network: the tensor-field method of Guoning Chen, Gregory Esch, Peter Wonka, Pascal Müller and Eugene Zhang, [Interactive Procedural Street Modeling](https://doi.org/10.1145/1360612.1360702) (SIGGRAPH 2008). The grid and radial basis fields are blended with Gaussian decay, boundary fields follow the shore, and streets are hyperstreamlines of the major and minor eigenvector fields, traced with RK4 steps and a separation distance. Tracing roads in tiers, seeding new roads on the ones already traced and joining dangling ends follow the open-source [MapGenerator](https://github.com/ProbableTrain/MapGenerator) by ProbableTrain, which implements the same paper. The code here is a new implementation.
- Map drawing: water lining (lines that run parallel to the shore, as on engraved maps), the zebra border of survey maps, and, for the Ink style, the figure-ground plan, where buildings are black and open ground is white, as in Giambattista Nolli's 1748 map of Rome.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and the cities are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
