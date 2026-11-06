---
title: Risograph - Generative Art - Alexvolkihar
display: Risograph
subtitle: Spot inks, halftone screens and loose registration
description: Risograph, a deterministic series of procedural prints separated into two or three spot inks and overprinted as halftone screens, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a small print run on a stencil duplicator that only exists in code. A subject is drawn from the hash: a poster of discs, bars, rings and dot grids, a bouquet in a vase or sprigs of leaves and flowers, a sunset over mountains or the sea, or a still life of fruit, bottles and bowls on a table. It is drawn as colour separations, one greyscale plate per ink, where every shape is a solid, a flat tint or a ramp. Some shapes overprint, so the inks mix where they cross. Others knock the other inks out, so thin slivers of paper show along their edges.

The press then screens each plate on its own: round dots, lines or square dots at the classic angles, or a clustered grain with no angle at all. Each plate lands slightly out of register, more or less depending on the piece, and the translucent inks multiply on cream paper, or lighten black stock. Coverage is never even. There are blotches, streaks along the feed direction, a fade towards the tail of the sheet, a few specks where the ink missed, and a white margin the press cannot print. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="risograph" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="risograph" />

## Credits

- Halftone screens: each plate is screened per pixel with a spot function over a rotated cell, as in the `setscreen` spot functions of Adobe's _PostScript Language Reference Manual_. The threshold for each ink density comes from ranking the spot function over the cell, so a 30% tint covers 30% of the paper (Robert Ulichney, _Digital Halftoning_, MIT Press, 1987). The screen angles (0°, 15° and 75°) follow the usual offset-printing convention for keeping the moiré between plates small.
- Grain: two octaves of value noise thresholded by rank, a simple stand-in for clustered stochastic screens in the spirit of Daniel L. Lau, Gonzalo R. Arce and Neal C. Gallagher, _Green-noise digital halftoning_ (Proceedings of the IEEE, 1998).
- Overprint: the inks are composited with the multiply blend mode (and screen on black stock) of the W3C _Compositing and Blending_ specification. The ink colours are original approximations of common stencil-duplicator spot inks, and the misregistration, streaks and specks imitate the quirks of the drum printers made by Riso Kagaku.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
