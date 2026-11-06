---
title: Snowflake - Generative Art - Alexvolkihar
display: Snowflake
subtitle: Snow crystals grown on a hexagonal cellular automaton
description: Snowflake, a deterministic series of snow crystals grown cell by cell on a hexagonal grid, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Every crystal starts as a single frozen cell in the middle of a hexagonal grid filled with water vapour. At each step the vapour spreads from cell to cell, and the cells that touch the ice catch a little of it, plus a constant trickle from the air above and below. Once a cell holds enough water it freezes, and its neighbours start catching vapour in turn. Three numbers set the shape: how humid the air is, how much vapour comes from the third dimension, and how fast the vapour spreads. Dry air grows fern-like dendrites. Damper air grows broad stellar plates. A falling snowflake passes through layers of air with different humidity, so the numbers can change while a crystal grows: a plate may sprout arms, or a dendrite may end in plates. A crystal grown from one cell keeps the twelve symmetries of the hexagon, so only one twelfth of it is computed and the rest is mirrored.

Each grown crystal is drawn in one of three ways. Ice shows clear ice that is brighter where it slopes, along the ridge of every branch and at the rim, as under dark-field lighting. Paper cut shows a folded paper cut-out with its twelve folds and a few inset cuts. Chronicle colours each cell by the moment it froze. A piece holds a single crystal, a trio or a whole flurry. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="snowflake" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="snowflake" />

## Credits

- Growth: Clifford A. Reiter's local cellular model, [A local cellular model for snow crystal growth](https://doi.org/10.1016/j.chaos.2004.06.071) (_Chaos, Solitons & Fractals_ 23, 2005), with its parameters alpha (diffusion), beta (background humidity) and gamma (vapour added from the third dimension). Reiter also studied what happens when the growth conditions change. Colouring each cell by the time it froze follows the figures of Janko Gravner and David Griffeath, "Modeling snow crystal growth II: a mesoscopic lattice map with plausible dynamics" (_Physica D_ 237, 2008).
- The habit names (dendrites, fern-like crystals, stellar and sectored plates) come from the snow-crystal classification of Magono and Lee (1966), as surveyed in Kenneth G. Libbrecht's "The physics of snow crystals" (_Reports on Progress in Physics_ 68, 2005).
- Rendering: the ice is interpolated over the triangles of the hexagonal lattice, and its relief comes from the distance to the crystal's edge, so plates show the ridges that run to their corners.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
