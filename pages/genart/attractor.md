---
title: Attractor - Generative Art - Alexvolkihar
display: Attractor
subtitle: The orbit of a strange attractor, developed like a photograph
description: Attractor, a deterministic strange-attractor series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A point is moved again and again by a simple formula made of a few sines and cosines: a Clifford, de Jong, Svensson or "dream" map with four coefficients taken from the hash. After a few steps it settles on a strange attractor, a shape it never leaves and never quite repeats. The point is followed for millions of steps and every position is counted in a grid of cells; the counts are then developed like a photograph, with a logarithmic tone curve, and each cell takes its colour from how fast the orbit moves through it. Most coefficients give nothing to look at (a single point, a small loop, a flat haze), so a short test run checks every candidate and the hash draws again until it finds a real attractor. Some pieces are mirrored or repeated in four quarter turns. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="attractor" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="attractor" />

## Credits

- Maps: the Clifford map and the "fractal dream" map from Clifford A. Pickover's _Chaos in Wonderland_ (1994); Peter de Jong's map, made known by A. K. Dewdney in _Scientific American_ (1987); Johnny Svensson's variant, as collected by [Paul Bourke](https://paulbourke.net/fractals/peterdejong/).
- Selection: a candidate is kept when its largest Lyapunov exponent is positive (the test J. C. Sprott uses in _Strange Attractors: Creating Patterns in Chaos_, 1993) and when its points spread over enough of a coarse grid with enough entropy.
- Rendering: log-density tone mapping with a gamma curve, the technique popularised by Scott Draves's [fractal flames](https://flam3.com/flame_draves.pdf). Sines come from a table filled with a Taylor series, so an orbit is the same in every browser.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
