---
title: Lichtenberg - Generative Art - Alexvolkihar
display: Lichtenberg
subtitle: Discharges grown by the dielectric breakdown model
description: Lichtenberg, a deterministic electric-discharge series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A grid holds an electric potential: zero on the discharge, one on the far electrode, and in between the solution of Laplace's equation. At every step, a site next to the discharge breaks down with a probability that grows with the local field raised to a power, eta; the potential is then relaxed again around the new sites. A low eta gives bushy, almost solid figures, eta near one gives feathered ones, and a high eta leaves a few lone, forked bolts. The discharge starts from a point, rises from an edge towards a charged sphere, closes in from a ring onto a central pin, or grows from both sides of a spark gap until the two halves touch, and the channel that joins them carries the current. Each branch is as thick as its Horton–Strahler order. It is drawn as glowing plasma, burned into maple or walnut along the grain, or printed in silver. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="lichtenberg" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="lichtenberg" />

## Credits

- Growth: the dielectric breakdown model of L. Niemeyer, L. Pietronero & H. J. Wiesmann, [Fractal Dimension of Dielectric Breakdown](https://doi.org/10.1103/PhysRevLett.52.1033), Phys. Rev. Lett. 52, 1033 (1984), itself a generalisation of diffusion-limited aggregation (T. A. Witten & L. M. Sander, 1981).
- Laplace's equation is solved by red-black successive over-relaxation (D. M. Young, 1950), warm-started and only relaxed for a few sweeps per batch of new sites. T. Kim & M. C. Lin, [Fast Animation of Lightning Using an Adaptive Mesh](https://gamma.cs.unc.edu/FAST_LIGHTNING/) (2007), animate lightning with the same model and solve it exactly with conjugate gradients on adaptive grids; this series gives up that accuracy to draw a figure in a fraction of a second.
- Branch widths follow the stream order of R. E. Horton (1945) and A. N. Strahler (1957).
- The figures are named after Georg Christoph Lichtenberg, who first recorded such discharge patterns in 1777. The wood finish recalls fractal wood burning, where a high voltage is run across damp wood.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
