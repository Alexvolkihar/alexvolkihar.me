---
title: Hilbert - Generative Art - Alexvolkihar
display: Hilbert
subtitle: One line through every cell
description: Hilbert, a deterministic series of space-filling curves where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A space-filling curve is a single line that passes through every cell of a square, and in its classic form it never crosses itself. Each piece draws one of five classic curves: Hilbert, Moore, Peano, Sierpinski, or the Gosper curve, which fills a hexagonal island instead of a square. The curve is built by repeated subdivision. At a fixed order every cell is divided the same number of times. At an adaptive order a seeded noise field decides where to go deeper, so the line packs tight in some places and opens into wide loops elsewhere, and it is still one unbroken line. The stroke can be a plain ink line, a colour gradient along the curve's length with a slowly swelling width, a hollow ribbon, a faint hairline with only some stretches inked, three orders of the same curve stacked on top of each other, or two or three copies of the curve interleaved and blended. On a wide or tall canvas, two or three square blocks are laid end to end, and the Hilbert and Peano curves run on from one block to the next. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="hilbert" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="hilbert" />

## Credits

- Curves: Giuseppe Peano's curve (1890), David Hilbert's (1891), E. H. Moore's closed variant of Hilbert's curve (1900), and Wacław Sierpiński's curve (1912), built here by bisecting right isosceles triangles, as in the Pólya and Sierpiński–Knopp construction. The Gosper curve, or flowsnake, was found by Bill Gosper and published by Martin Gardner in _Scientific American_ (1976). It is drawn here from its two-rule L-system, with 60° turns.
- Adaptive order: a cell is subdivided only as long as its depth stays below a target that a two-octave value-noise field sets at its centre. Consecutive cells always touch, so the curve never breaks. Stroke widths follow the local spacing of the line.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
