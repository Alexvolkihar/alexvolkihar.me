---
title: Epicycles - Generative Art - Alexvolkihar
display: Epicycles
subtitle: A closed curve redrawn by chains of turning circles
description: Epicycles, a deterministic series of Fourier plates where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Any closed line can be redrawn by a chain of circles. Each circle turns a whole number of times per revolution and carries the next one on its rim, and the last arm holds the pen. The circles are the terms of the curve's Fourier series. Each piece starts from a curve made from the hash: a stroke that looks like a letter, a wobbly outline, a star or an irregular shard. Only some of the circles are kept, either the largest ones or the slowest ones. The pen therefore rounds the corners and leaves small ripples next to them.

The plates are drawn like old astronomy or engineering diagrams. A frozen machine shows the line half drawn, with a magnified detail of the small circles near the pen. A stroboscope overlays the same chain at several moments. A fan stacks the approximations with 1, 2, 4, 8… circles. A table shows nine of them side by side, with the number of circles counted in tally marks. On a harmonic synthesiser plate, two chains drive the pen, one along each axis. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="epicycles" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="epicycles" />

## Credits

- Epicycles: the deferent-and-epicycle models of Greek astronomy, from Apollonius of Perga and Hipparchus to Ptolemy's _Almagest_, which describe the motion of a planet as circles carried on circles.
- Fourier series: Joseph Fourier, _Théorie analytique de la chaleur_ (1822). Here the curve is sampled at 1,024 equal steps of arc length, and its complex coefficients c_k for k = −128…128 come from a direct discrete Fourier transform. Each coefficient becomes one circle of radius |c_k| that turns k times per revolution.
- Harmonic synthesisers: Lord Kelvin's tide-predicting machine (1872–73), and A. A. Michelson and S. W. Stratton's _A new harmonic analyser_ (Philosophical Magazine, 1898). Both add up rotating components mechanically. The axes plate follows the same idea, with one chain for x and one for y.
- The ripples next to the corners of a truncated series: the Gibbs phenomenon, first described by Henry Wilbraham (1848), then by J. Willard Gibbs (1898–99), and named by Maxime Bôcher (1906).
- The epicycle drawings of Fourier series are well known from Grant Sanderson's 3Blue1Brown video _But what is a Fourier series?_ (2019) and Daniel Shiffman's Coding Train challenge _Drawing with Fourier Transform and Epicycles_ (2019). The code here is original.
- Subjects: the letter-like strokes are centripetal Catmull–Rom splines (Catmull and Rom, 1974; centripetal form by Yuksel, Schaefer and Keyser, 2011) through a few cells of a 4 × 4 grid. The other subjects are a polar outline, star polygons and irregular polygons. The palettes are original.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
