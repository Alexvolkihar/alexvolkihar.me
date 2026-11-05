---
title: Arbor - Generative Art - Alexvolkihar
display: Arbor
subtitle: Plants grown by stochastic L-systems
description: Arbor, a deterministic series of L-system plants where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Every plant here starts as a single letter. A small grammar rewrites it again and again, each rule picked at random with its own weight, until the word describes a whole weed, tree, fern or umbel. A turtle then reads the word: it draws a branch for each step, turns, saves and restores its place at each fork, and thins its stroke as the branches divide. The wind bends the thin twigs more than the trunk, and the last buds become leaves, flowers, berries or nothing at all, depending on the season. The plants are then mounted like a herbarium: one specimen on its sheet, a plate of numbered variations, or a meadow along a ground line. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="arbor" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="arbor" />

## Credits

- L-systems: Aristid Lindenmayer's parallel rewriting systems (1968), in their stochastic, parametric and bracketed forms as described by Przemysław Prusinkiewicz and Aristid Lindenmayer in [The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/#abop) (1990). The weeds follow the stochastic plants of its chapter 1, the trees the monopodial and sympodial branching models it credits to H. Honda and to M. Aono & T. L. Kunii, and the bending under wind and gravity its tropism rule.
- The grammar is derived depth-first and read by the turtle as it goes, which gives the same word as parallel rewriting without storing it.
- Cyanotype: a nod to Anna Atkins's cyanotype plates of algae and ferns (1843–1853), the first books illustrated with photographs.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
