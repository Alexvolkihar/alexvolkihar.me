---
title: Bloom - Generative Art - Alexvolkihar
display: Bloom
subtitle: Flowers painted in translucent layers of deformed polygons
description: Bloom, a deterministic series of radially symmetric flowers painted like watercolour, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each flower starts from a single petal shape, round, pointed, notched, fringed or long like a ribbon, repeated three to twelve times around a centre, in one to four whorls. Nothing here is drawn with a brush: every petal is a small polygon whose edges are split again and again, each new point nudged by a random amount, and the result is filled dozens of times at a few percent opacity, each layer deformed anew. The layers agree in the middle and disagree at the rim, so petals get a dense core and a soft, bleeding edge, and neighbouring petals blend where their layers overlap. Stamens, seeds, leaves, stems, loose petals and the washes on the paper are painted the same way. A piece holds one flower, a few on stems, a bouquet or a printed field of them. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="bloom" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="bloom" />

## Credits

- Layered translucent polygons: the watercolour technique described by Tyler Hobbs in [A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art) (2017): a base shape deformed a few times, then many nearly transparent layers, each deformed again, with more variation where the edge should be soft. The code here is an independent implementation applied to petals, with per-vertex variance growing from the petal base to its tip.
- Deformation: recursive midpoint displacement with roughly Gaussian offsets (a sum of three uniform draws) proportional to the edge length and to a per-vertex variance, after Fournier, Fussell & Carpenter, "Computer Rendering of Stochastic Models" (_Communications of the ACM_ 25, 1982).
- Further reading on the same technique: Sighack's tutorial [Generative Watercolor in Processing](https://sighack.com/post/generative-watercolor-in-processing).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The flowers and palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
