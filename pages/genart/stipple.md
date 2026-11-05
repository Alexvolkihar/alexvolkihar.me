---
title: Stipple - Generative Art - Alexvolkihar
display: Stipple
subtitle: Weighted Voronoi stippling, in dots or one unbroken line
description: Stipple, a deterministic stippling series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a subject computed from the hash, never from a photograph: a lit orb resting on its shadow, folds of hanging cloth, a nebula, a turned vase or a nautilus shell. A few thousand points are scattered over it in proportion to how dark it is, then nudged again and again towards the centre of mass of the ink they cover until they settle into an even, organic grain. They are printed as dots, or threaded into one unbroken line that winds past every point once, folding tightly where the subject is dark, or both. Toned papers also get white highlights. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="stipple" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="stipple" />

## Credits

- Stippling: Adrian Secord, [Weighted Voronoi Stippling](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/) (NPAR 2002), a density-weighted version of Lloyd's algorithm (Stuart Lloyd, _Least squares quantization in PCM_, 1957/1982). Voronoi regions are never built: each cell of a density grid is credited to its nearest point, found through a bucket grid, then by a short walk along the points' nearest-neighbour graph.
- Single line: the travelling-salesman drawings of Craig S. Kaplan and Robert Bosch, [TSP Art](https://archive.bridgesmathart.org/2005/bridges2005-301.html) (Bridges 2005). The tour is built by the nearest-neighbour heuristic and shortened with 2-opt moves (G. A. Croes, 1958) over each point's nearest neighbours, with Jon Bentley's "don't look" bits (_Fast Algorithms for Geometric Traveling Salesman Problems_, 1992).
- Subjects: Lambert shading of a sphere, of a height field of folds and of a surface of revolution, domain-warped value noise, and a logarithmic spiral.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
