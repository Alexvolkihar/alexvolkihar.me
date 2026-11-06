---
title: Flame - Generative Art - Alexvolkihar
display: Flame
subtitle: Fractal flames, developed from millions of chaotic jumps
description: Flame, a deterministic fractal-flame series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A fractal flame is a handful of transforms, each one a stretch, turn and shift of the plane followed by a blend of curved "variations": swirl, spherical inversion, julia's square root, heart, disc, spiral. A single point is sent through a transform picked at random, then another, millions of times; wherever it lands, it leaves a hit in a grid and a trace of the colour that transform carries, so every region is coloured by the path that led there. Symmetry comes from extra transforms that only turn or mirror the point, and some pieces get a final transform that bends the whole picture once more. The grid is then developed like a photograph: logarithmic density, a gamma curve, sparse wisps smoothed into haze, and for some pieces a soft glow. Most random flames are a dot, a line or a fog, so a short test run measures every candidate and the hash draws again until it finds one with structure. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="flame" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="flame" />

## Credits

- Algorithm: the fractal flame of Scott Draves and Erik Reckase, [_The Fractal Flame Algorithm_](https://flam3.com/flame_draves.pdf) (2003, revised 2008): the chaos game over affine transforms and nonlinear variations, colour indices blended at each jump, symmetry and final transforms, log-density tone mapping with gamma, and density estimation. The variation formulas follow the paper's appendix; the random genomes (coefficients in [-1, 1]) follow its reference implementation, [flam3](https://github.com/scottdraves/flam3). The chaos game itself is Michael Barnsley's, from _Fractals Everywhere_ (1988).
- This implementation is written from the paper, with simplifications of its own: a cheap two-level blur in place of the variable-width density kernel, a linear foot on the tone curve in the spirit of flam3's gamma threshold, and a probe that rejects dull genomes. Sines come from a table filled with a Taylor series and the arctangent from the polynomial of Abramowitz and Stegun (4.4.49), so a flame is the same in every browser.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
