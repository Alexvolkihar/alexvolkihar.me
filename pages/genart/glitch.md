---
title: Glitch - Generative Art - Alexvolkihar
display: Glitch
subtitle: Clean procedural pictures, broken on purpose
description: Glitch, a deterministic series of procedural images damaged by pixel sorting, datamoshing, channel shifts and corrupted JPEG, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as a clean picture painted from scratch: a sun setting over the sea, soft washes of colour, a modernist poster, a city at night or a television test card. Then it is damaged. Runs of pixels are sorted by brightness along rows or columns. Blocks of a video frame keep dragging their pixels along stale motion vectors. Slices of the picture are torn sideways with the red and blue channels pulled apart. Or the whole image goes through a JPEG encoder at a very low quality and a few stream errors. The damage stays inside bands and patches, so the source picture can still be read. Soft scanlines and grain finish every piece. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="glitch" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written.

<GenArtTraits series="glitch" />

## Credits

- Pixel sorting: Kim Asendorf's [ASDFPixelSort](https://github.com/kimasendorf/ASDFPixelSort) (Processing, 2010), which finds runs of pixels between brightness thresholds in every column and row and sorts each run in place. This version sorts by brightness and lets the length of the runs and the edges of the sorted band follow a smooth noise.
- Datamosh: imitates compressed video whose key frames are missing, so that predicted frames keep moving old pixels along their motion vectors. The technique comes from the glitch art and video art practice of the 2000s; here each macroblock re-applies its own vector over several frames, and some blocks lose their residual and go flat.
- Compression: a real JPEG round trip, written from the standard: YCbCr, the 8×8 discrete cosine transform (Nasir Ahmed, T. Natarajan and K. R. Rao, _Discrete Cosine Transform_, IEEE Transactions on Computers, 1974), the quantisation tables of ITU-T T.81 Annex K, scaled with the Independent JPEG Group's quality formula. Stream errors behave like real ones: DC terms are coded as differences, so one error shifts the colour of every later block, and a lost bit makes the rest of the scan slip by whole blocks.
- Test card: colour bars after the broadcast test patterns of the colour television era (SMPTE and EBU bars), tinted by the palette.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
