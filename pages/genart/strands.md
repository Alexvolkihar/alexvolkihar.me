---
title: Strands - Generative Art - Alexvolkihar
display: Strands
subtitle: Stippled strands that grow until they touch
description: Strands, a deterministic series of stippled strands grown by colliding agents seeded in groups, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a handful to a few dozen small groups of walkers. A group is a tight knot that bursts outwards, a wider ring that its walkers set off around, or a small circle whose walkers all leave the same way, and the groups themselves are laid on a ring, on concentric rings, on a grid, at random, or along a spiral arm. Every walker then takes the same small step again and again, steered by its group's rule: a heading that sways to and fro, a constant turn that closes into circles, a curl that tightens into a coil, or a drift along the contour lines of a gentle noise relief. The walkers of one group sway and turn in step, so they leave together like a sheaf. Now and then a walker forks. Every step is written into an occupancy grid, and a walker stops as soon as it steps onto a cell that another trail already holds; only its own last few steps are ignored, so it does not stop on itself. Each step leaves a little cloud of dots: dark dots on the side away from a light in the top left, pale dots on the side facing it, a soft cast shadow beneath, and a strand that thins towards its end and along its forks. Some pieces are threaded with pearls instead, each one stippled like a small lit sphere. Seen from afar the result reads as loops, sheaves and confetti; up close it is tens to hundreds of thousands of dots. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="strands" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="strands" />

## Credits

- Stop-on-contact agents: after Jared Tarbell's [Substrate](http://www.complexification.net/gallery/machines/substrate/) (2003), where lines grow across a field and stop when they hit another line. The agents here are a new implementation: curved walkers with their own steering rules, seeded in groups, branching, and checked against a grid whose trails are kept 4-connected so that no walker can slip diagonally through another's trail.
- Drift: the walkers follow the contour lines of a value-noise relief (its gradient turned a quarter turn), a divergence-free flow in the spirit of Robert Bridson, Jim Hourihan and Marcus Nordenstam's "[Curl-Noise for Procedural Fluid Flow](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf)" (SIGGRAPH 2007), so strands neither bunch up nor pull apart.
- Inspired by Camille Roux's [INTRICADA](https://art.camilleroux.com/work/intricada/) (2023).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
