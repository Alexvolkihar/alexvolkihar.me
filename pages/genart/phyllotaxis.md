---
title: Phyllotaxis - Generative Art - Alexvolkihar
display: Phyllotaxis
subtitle: Flower heads grown from the golden angle
description: Phyllotaxis, a deterministic series of sunflower heads, rosettes and pine cones where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A sunflower places each new floret a fixed turn of about 137.5° past the previous one, the golden angle, and a little further out than the last. Repeat that a few hundred times and the florets settle into two families of crossing spirals, 21 one way and 34 the other, or 34 and 55: consecutive Fibonacci numbers. Each piece grows one head, a pair, a cluster or a whole field of them from that rule. The florets are drawn as seeds inside a ring of ray petals, as overlapping petals, as the scales of a pine cone, as dots, or as the lattice of spirals itself, and they grow with their distance from the centre. Most heads use the golden angle. Some drift slightly off it, some use the Lucas angle of about 99.5° and its 4, 7, 11, 18 spirals, and a rare few use a fraction close to golden, which breaks the spirals into straight spokes. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="phyllotaxis" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="phyllotaxis" />

## Credits

- Floret placement: H. Vogel's model of the sunflower head, floret _n_ at angle _n_ × 137.508° and radius c·√n, from "A better way to construct the sunflower head" (_Mathematical Biosciences_ 44, 1979). Here the radius exponent can rise above ½, so florets grow towards the rim.
- Phyllotaxis and parastichies: the observations of Schimper and Braun (1830s) and of the Bravais brothers (1837), and the account in Prusinkiewicz & Lindenmayer, [The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/#abop) (1990), chapter 4. The Lucas angle follows the rarer Lucas-number phyllotaxis described in the botanical literature (Jean, _Phyllotaxis: A Systemic Study in Plant Morphogenesis_, 1994).
- Spirals: each floret is joined to its nearest neighbours among the Fibonacci and Lucas offsets, and each segment is coloured by the direction its spiral turns.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
