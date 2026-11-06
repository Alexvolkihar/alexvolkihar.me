---
title: Physarum - Generative Art - Alexvolkihar
display: Physarum
subtitle: Slime-mould transport networks
description: Physarum, a deterministic slime-mould simulation series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

From under a thousand to about five thousand agents crawl over a grid of trail for 200 steps. Each one has three sensors pointing ahead, to the left and to the right. At every step it turns towards the strongest trail it can smell, moves one cell if nobody is already there, and leaves a little trail behind. The trail spreads and fades. No agent knows anything about the network, yet the trail settles into the patterns of a slime mould: fine meshes, long veins, foam, worms or scattered spots, depending only on how wide the sensors are spread, how sharply the agents turn and how far ahead they sense. Oat flakes keep feeding trail and become the hubs of the network. Stones are cells no agent can enter, so the network flows around them. A culture either covers the whole canvas or grows in a Petri dish, where it creeps along the wall. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="physarum" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="physarum" />

## Credits

- Model: Jeff Jones's multi-agent approximation of _Physarum polycephalum_, [Characteristics of pattern formation and evolution in approximations of Physarum transport networks](https://doi.org/10.1162/artl.2010.16.2.16202) (Artificial Life 16(2), 2010). This includes his sensory and motor stages with sensor angle, rotation angle and sensor offset, the one-agent-per-cell rule, and a trail that diffuses through a 3×3 mean filter and decays.
- The oat flakes come from the real experiments in which a plasmodium links food sources into an efficient network, such as Tero et al., [Rules for Biologically Inspired Adaptive Network Design](https://doi.org/10.1126/science.1177894) (Science, 2010).
- The simulation is bit-exact. Headings live on a 256-step compass built from a Taylor series, and the loop uses only operations that IEEE 754 rounds exactly. Every engine therefore walks the agents along the same paths.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
