---
title: Threads - Generative Art - Alexvolkihar
display: Threads
subtitle: String art between nails on a board
description: Threads, a deterministic string-art series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Nails are set round a circle, a square, a polygon or two concentric rings, and thread is stretched from nail to nail. In a times table, nail i is tied to nail k·i, and the straight threads wrap a cardioid, a nephroid or a rosette. In a curve stitch, every thread skips the same number of nails, give or take a little, and the threads trace parabolas in the corners or caustics in a ring. A layered board overlays two or three of these in different threads. A greedy image is one long thread that goes, nail after nail, wherever the figure is still missing thread, until a sphere, a crescent, an eclipse, mountain peaks or a spiral appears. The board is birch, walnut, velvet or linen. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="threads" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="threads" />

## Credits

- Times tables: joining point i to point k·i on a circle of n points, a classic of recreational mathematics, popularised by Mathologer's video [Times Tables, Mandelbrot and the Heart of Mathematics](https://www.youtube.com/watch?v=qhbuKbxJsk8) (2015). The envelope of the chords is an epicycloid with k − 1 cusps: the cardioid for k = 2, the nephroid for k = 3.
- Curve stitching: straight threads whose envelope is a curve, taught to children by Mary Everest Boole in the early 1900s (_The Preparation of the Child for Science_, 1904) and the origin of string art as a craft.
- Greedy images: the method Petros Vrellis published with [A New Way to Knit](https://artof01.com/vrellis/works/knit.html) (2016). From the current nail the thread goes to the nail whose line still covers the most darkness, that darkness is partly removed, and the search starts again. It is studied as a discrete optimisation by Michael Birsak, Florian Rist, Peter Wonka and Przemyslaw Musialski in [String Art: Towards Computational Fabrication of String Images](https://doi.org/10.1111/cgf.13359) (Computer Graphics Forum 37(2), 2018). Here the targets are procedural figures, never photographs, computed on a small fixed grid so that a hash gives the same thread path at any size.
- The wood grain, velvet and linen are drawn from integer hashes of each grain line or yarn, so a wider canvas shows more of the same board. The palettes are original.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
