---
title: Marbling - Generative Art - Alexvolkihar
display: Marbling
subtitle: Ink floated on a bath, combed and lifted onto paper
description: Marbling, a deterministic paper-marbling series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Paper marbling floats colour on a bath and then works it with a stylus or a rake before the sheet is laid on top. Here the bath is mathematical. Each ink drop is an exact circle that pushes every earlier boundary outwards, so earlier colours are squeezed into rings and veins around later ones. A rake drags the ink along its tines, a comb pulled along a wavy path makes bouquets, a stylus stirred in place makes the spirals of the nightingale's nest, and a breath of wind bends suminagashi rings. Each boundary is a polygon. Whenever an edge stretches too far it is refined from its own pre-image, so the curves stay smooth however far the ink has been pulled. The traditional patterns are written as sequences of these moves. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="marbling" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="marbling" />

- **Stone** (battal): layers of colour thrown one after another, with no combing.
- **Gel-git**: a rake drawn back and forth across the stone, sometimes in both directions.
- **Nonpareil**: gel-git both ways, then a fine comb in one direction.
- **Bouquet**: a nonpareil combed again along a wavy path.
- **Chevron**: thin stripes raked into arrowheads.
- **Suminagashi**: rings of ink and clear water dropped in turn, then fanned and blown.
- **Nightingale** (bülbül yuvası): a grid of spirals stirred into the stone.

## Credits

- Ink drops, tines and their displacement functions: Shufang Lu, Aubrey Jaffer, Xiaogang Jin, Hanli Zhao and Xiaoyang Mao, "Mathematical Marbling", _IEEE Computer Graphics and Applications_ 32(6), 2012, and Aubrey Jaffer's [marbling notes](https://people.csail.mit.edu/jaffer/Marbling/). Wavy combs are a tine composed between two opposite shears, and spirals are local rotations. Every move is one-to-one, so no two inks ever cross.
- Patterns: the Turkish ebru tradition (battal, gel-git, taraklı, bülbül yuvası), the European comb patterns (nonpareil, bouquet, chevron) and Japanese suminagashi.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
