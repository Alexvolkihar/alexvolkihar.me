---
title: Rosette - Generative Art - Alexvolkihar
display: Rosette
subtitle: An imaginary star system stitched as ornament
description: Rosette, a deterministic series of imaginary star systems drawn as layered rosettes on deep cloth, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a star system made of ornaments rather than a chart of the sky. Every body is a rosette built from the outside in, layer by layer. Some layers fill a whole disc up to an edge that is plain, scalloped, petalled, star-pointed or crenellated; the others only add a ring of small motifs on the colour below: dots, alternating beads, rays, teardrops, chevrons, a zigzag or a thread. The counts of these motifs are taken from one base number, its double and its half, and successive rings are often turned by half a step, so each ring sits between the motifs of the next. A thin cut in the ground colour sometimes separates two layers, like the metal walls of cloisonné enamel. The sun gets a double corona of interleaved points. Planets sit on orbits spaced by the size of what they carry, and some have moons on a dotted thread or a tilted ring. Small planets and moons carry a crescent of shade on the side away from their sun, so they read as lit worlds rather than flowers. A system has one sun, two suns, a large sun pushed towards an edge, or no orbits at all, in which case the planets are packed loosely around the sun. A single-sun system can drift off-centre, have its orbits squashed into tilted ellipses as if seen at an angle or cut down to arcs tied off with a knot, and sometimes gives the lead role to a large ringed planet. Orbits are stitched as a plain or dotted thread, a beaded zigzag or a wave, or left out. Small rosettes and sparkles fill the room that is left, topped up until the central square holds a minimum number of visible bodies, and some skies carry a comet with a beaded tail that stays inside the central square. The system is laid out on a field larger than the square, so wide and tall canvases show more of it. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="rosette" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="rosette" />

## Credits

- Rosettes: concentric layers in the manner of folk embroidery and enamel medallions, with motif counts chosen among the divisors and multiples of one base count so the rings stay in step. The layer grammar, the scallop and petal curves and the colour rules are original.
- Layout: planets are threaded on orbits whose radii are spaced by the clearance of each planet system; the cluster layout, the small filler rosettes and the sparkles use greedy random-placement circle packing (try a random position, keep it if it touches nothing), as shown in Daniel Shiffman's [Coding Challenge #50: Circle Packing](https://thecodingtrain.com/challenges/50-animated-circle-packing) on The Coding Train, here with radii that shrink as the attempts go on.
- Inspired by Camille Roux's [The Destination](https://art.camilleroux.com/work/the-destination/) (2024).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
