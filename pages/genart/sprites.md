---
title: Sprites - Generative Art - Alexvolkihar
display: Sprites
subtitle: Pixel creatures from mirrored random masks
description: Sprites, a deterministic pixel-art series where every critter, robot and spaceship comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Every sprite starts as half a mask: a few shapes drawn from the hash (a body ellipse and a head for a critter, stacked boxes for a robot, a tapered hull and swept wings for a ship) mark each cell as empty, maybe body, body or dark detail, or always body. The mask is sampled at random, mirrored around its axis and outlined, and only its largest connected piece is kept. Body pixels are then shaded from their place in the sprite and from the sides they show to the light, in ramps taken from the fixed palettes of old consoles and home computers.

The sprites are pinned to a numbered specimen sheet, sent marching in a parade where each lane is one family (one mask, a new sampling for each member), or posed alone as a hero in a pixel landscape or in front of a planet. The short side always holds the same number of art pixels, so a hash gives the same crisp picture at any size. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="sprites" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="sprites" />

## Credits

- Sprites: the mirrored random-mask method of Dave Bollinger's [Pixel Robots and Pixel Spaceships](http://web.archive.org/web/20080228054410/http://www.davebollinger.com/works/pixelspaceships/) (2007), as written up and generalised by Zelimir Fedoran in [pixel-sprite-generator](https://github.com/zfedoran/pixel-sprite-generator) (MIT): cells that are always empty, maybe body, body or border, or always body; random sampling, mirroring, then an outline around the body. The masks here are new: they are built from hash-drawn shapes for each sprite or family, not taken from either project, and the shading and scenes are original.
- Shading follows Fedoran's idea of brightness rising towards the middle of the sprite, with extra light on the top edges and shade on the bottom ones. Sky gradients use ordered dithering with Bryce Bayer's 4 × 4 matrix (1973).
- Palettes: colours from the fixed hardware palettes of the Famicom (NES), the PICO-8 fantasy console, the original Game Boy, the Commodore 64 (Philip "Pepto" Timmermann's measured values), the ZX Spectrum and IBM CGA.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
