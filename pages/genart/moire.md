---
title: Moiré - Generative Art - Alexvolkihar
display: Moiré
subtitle: Interference fringes between overlaid gratings
description: Moiré, a deterministic op-art series of overprinted gratings where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece prints two or three regular gratings on top of each other: parallel lines, concentric rings, radial spokes, wavy lines or a many-armed spiral. Each one is set slightly out of step with the one below it, turned by a few degrees, shifted by a few stripes, stretched by a few percent, or bent by a bulge or a twist. None of the gratings has any large shape in it. The large bands you see appear where their stripes fall in and out of step: straight bars, hyperbolas, parabolas, circles, magnified waves or pinwheels. On light grounds the inks overprint like a risograph print, and on dark grounds the light stripes add up like light through slits. A lens can confine the upper gratings to a disc, or the whole field can be cut to a disc. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="moire" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="moire" />

## Credits

- Moiré fringes: the classic analysis of superposed periodic gratings, where the fringes follow the difference of the gratings' phases. Gerald Oster and Yasunori Nishijima, "Moiré Patterns" (_Scientific American_, May 1963), and Isaac Amidror, _The Theory of the Moiré Phenomenon_ (Springer, 2000/2009). The rotation between two line gratings is set from the classic fringe-spacing formula, spacing = pitch / (2 sin(angle / 2)).
- Op art: the series belongs to the long tradition of optical art built on line and ring interference. It follows no individual artist's work, and the palettes are original.
- Rendering: every grating is one vector path, overprinted with a multiply blend on light grounds and a screen blend on dark ones. Small canvases are drawn at two or three times their size and filtered down, so the stripes do not alias into false fringes.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
