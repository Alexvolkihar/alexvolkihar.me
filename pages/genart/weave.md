---
title: Weave - Generative Art - Alexvolkihar
display: Weave
subtitle: Ribbons woven over and under
description: Weave, a deterministic series of woven ribbon swatches where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a small swatch of cloth. Warp ribbons run down the canvas and weft ribbons run across it. Where they cross, a weave structure decides which one goes on top: plain weave, a twill (sometimes broken into a herringbone), a basket, a satin with long floats, or a draft written the way a hand-loom is set up, with a threading, a treadling and a tie-up. Every ribbon rises over the crossings it covers and dips under the others, so light and cast shadows show the depth. Coloured stripes in the warp and the weft then meet through the structure as checks and plaids. The cloth may lie flat, bend gently or ripple, and its ends may fray. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="weave" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="weave" />

## Credits

- Structures: plain weave, twills, basket weave and satins, together with the loom draft notation (threading, treadling and tie-up) that hand-weavers have used for centuries and that Jacquard's punched-card loom later automated. The drafts here are generated from the hash, and floats longer than five crossings are broken up.
- The stripe sequences are mirrored about a pivot the way tartan setts are, but they are generated. None of them copies a real tartan, and the palettes are original.
- Rendering: every pixel is mapped back into flat cloth space through a low-frequency displacement field, then shaded from a smoothstep height profile along each ribbon, with analytic edge coverage for anti-aliasing.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
