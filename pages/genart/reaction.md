---
title: Reaction - Generative Art - Alexvolkihar
display: Reaction
subtitle: Gray–Scott reaction–diffusion grown from a seeded sketch
description: Reaction, a deterministic reaction–diffusion series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Two chemicals share a dish: a substrate that is fed in steadily, and a catalyst that feeds on it and slowly decays. A few drops of catalyst are placed by the hash (blobs, beaded strokes, a ring or a dusting of specks), then the Gray–Scott equations are run for a fixed number of steps. Depending on the feed and kill rates, the drops grow into spots, labyrinths, worms, coral or cells that keep dividing, and the rates can drift across the dish so one piece shows the passage from one regime to the next. The result is printed as two-plate ink, lit as a relief or cut into contour bands. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="reaction" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written.

<GenArtTraits series="reaction" />

## Credits

- Morphogenesis: Alan Turing, [The Chemical Basis of Morphogenesis](https://doi.org/10.1098/rstb.1952.0012) (1952), the first account of patterns arising from reaction and diffusion.
- Model: the Gray–Scott reaction, from Peter Gray and Stephen K. Scott's studies of autocatalytic reactions in a continuously fed reactor (1983–1985).
- Pattern map: John E. Pearson, [Complex Patterns in a Simple System](https://arxiv.org/abs/patt-sol/9304003) (Science, 1993), whose feed and kill regimes the series draws from; the Laplacian kernel follows Karl Sims' reaction–diffusion tutorial.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).

</div>
