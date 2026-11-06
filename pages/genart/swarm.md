---
title: Swarm - Generative Art - Alexvolkihar
display: Swarm
subtitle: Boids photographed with the shutter open
description: Swarm, a deterministic flocking series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A few hundred to a few thousand boids swim for 280 steps, each following three local rules: keep clear of close neighbours, match their heading, drift towards their centre. Nothing is drawn while they move. The piece is the long exposure of the whole run: every trail is laid down thin and translucent, so where the school passed often the image builds up like light on film. A shoal is carried by a stream that bends round rocks, a river of boids is cut open by wide-turning predators, schools mill round vortex centres, or lanes of migrants cross each other. A rear-curtain flash can freeze every boid at the end, or a strobe catch it several times along the way. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="swarm" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="swarm" />

## Credits

- Flocking: Craig Reynolds' boids, [Flocks, Herds, and Schools: A Distributed Behavioral Model](https://www.red3d.com/cwr/boids/) (SIGGRAPH 1987): separation, alignment and cohesion. Wander, obstacle avoidance, flee and pursuit follow his [Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/) (GDC 1999). Neighbours are found with a uniform grid.
- The stream round the rocks is the textbook ideal [potential flow past a circular cylinder](https://en.wikipedia.org/wiki/Potential_flow_around_a_circular_cylinder) (a uniform flow plus a doublet), superposed for every rock.
- The simulation uses only addition, multiplication, division and square roots, which IEEE 754 rounds exactly, so the run does not depend on how an engine implements sine or cosine.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
