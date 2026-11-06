---
title: Chladni - Generative Art - Alexvolkihar
display: Chladni
subtitle: Sand settling on the nodal lines of vibrating plates
description: Chladni, a deterministic series of sand figures on vibrating plates where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A square or round plate, clamped at its centre, is made to ring in one of its natural modes, or in two or three at once. Tens of thousands of grains of sand are strewn over it. At every bounce a grain jumps by an amount proportional to how hard the plate moves beneath it, so grains on the loops keep hopping while grains near a line that stands still barely move: the sand drains off the vibrating regions and draws the nodal lines. Fine lycopodium powder does the opposite and gathers in small heaps at the loops. Some pieces are specimen boards, a grid of plates read from the simplest figure to the busiest. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="chladni" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="chladni" />

## Credits

- The figures: Ernst Florens Friedrich Chladni, _Entdeckungen über die Theorie des Klanges_ (1787), who strewed sand on bowed metal plates and drew the patterns it formed.
- Square plates: the superposition of modes cos(nπx) cos(mπy) ± cos(mπx) cos(nπy), the approximation Charles Wheatstone (1833) and Lord Rayleigh (_The Theory of Sound_, 1877) used to explain Chladni's figures, later put on firm ground by Walther Ritz's variational method (1909). See also Gander & Wanner, [From Euler, Ritz, and Galerkin to Modern Computing](https://doi.org/10.1137/100804036) (SIAM Review, 2012).
- Round plates: the separable modes J<sub>n</sub>(kr) cos(nθ) with k a zero of J<sub>n</sub>′, the Bessel functions computed from Bessel's integral.
- Powder at the antinodes: Michael Faraday, _On a peculiar class of acoustical figures_ (Philosophical Transactions, 1831), after Félix Savart's observations with lycopodium.
- Sand: each grain random-walks with a step proportional to the local amplitude, plus a small drift down the slope of the vibration, until it rests on a nodal line.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
