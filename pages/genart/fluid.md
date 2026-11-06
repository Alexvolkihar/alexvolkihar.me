---
title: Fluid - Generative Art - Alexvolkihar
display: Fluid
subtitle: Ink in still water, carried by stable fluids
description: Fluid, a deterministic fluid-simulation series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A tank of still water is simulated on a small grid. The hash places a few emitters that push the water and let ink into it: plumes rising from the floor, heavy drops that sink and curl into rings, jets fired at each other, a spoon stirred round the bowl or a scatter of short bursts. For a fixed number of steps the water carries itself and the ink along, stays incompressible, and is kept from settling too quickly by feeding its small eddies back in. The ink is then printed as a soft wash on paper or as smoke on a dark ground; it can also pool at its edges or settle into the grain. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="fluid" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="fluid" />

## Credits

- Solver: Jos Stam, [Stable Fluids](https://doi.org/10.1145/311535.311548) (SIGGRAPH 1999) and [Real-Time Fluid Dynamics for Games](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf) (GDC 2003): semi-Lagrangian advection, implicit viscous diffusion and pressure projection on a collocated grid with reflecting walls.
- Pressure: the Poisson equation is relaxed with Jacobi iterations, warm-started from the previous step, as in Mark J. Harris, [Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu) (GPU Gems, 2004).
- Eddies and buoyancy: vorticity confinement and density-driven buoyancy after Ronald Fedkiw, Jos Stam and Henrik Wann Jensen, [Visual Simulation of Smoke](https://doi.org/10.1145/383259.383260) (SIGGRAPH 2001).
- Printing: inks mix by the Beer–Lambert law on paper and as emission on dark grounds; the dye grid is refined with a Catmull–Rom spline. The implementation is original, written from these descriptions.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
