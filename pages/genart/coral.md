---
title: Coral - Generative Art - Alexvolkihar
display: Coral
subtitle: Branches grown by space colonization
description: Coral, a deterministic branching-growth series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A cloud of invisible points is scattered inside a disc, a fan, a square or a crescent. One or several seeds then grow towards them, step by step: each branch tip turns towards the points it is closest to, and every point it reaches is consumed. Branches thicken towards the roots as their children pile up, change colour with each generation and end in a small polyp; the points nobody reached stay behind as dust. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="coral" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="coral" />

## Credits

- Growth: the space colonization algorithm of Runions, Lane & Prusinkiewicz, [Modeling Trees with a Space Colonization Algorithm](http://algorithmicbotany.org/papers/colonization.egwnp2007.html) (2007), first described for leaf venation by Runions et al. (2005). Nearest-node lookups use a uniform grid.
- Branch widths follow the pipe model, Leonardo da Vinci's rule that a branch is as thick as its children put together.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
