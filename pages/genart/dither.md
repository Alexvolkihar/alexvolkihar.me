---
title: Dither - Generative Art - Alexvolkihar
display: Dither
subtitle: Procedural scenes in two to four colours and big square pixels
description: Dither, a deterministic series of procedural scenes reduced to a few colours by error diffusion or ordered dithering, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as a grey picture computed from the hash, never from a photograph. Balls rest on a floor under an open sky, solids stand on a table against a wall, a plaster bust turns its head towards a side light, the sun sets over a sea with a headland and sometimes a sail, or flat shapes filled with smooth gradients make a poster. The 3D scenes are drawn by sphere tracing distance functions, with soft shadows and ambient occlusion. The coast and the poster are drawn in 2D from noise and simple shapes.

The picture is computed on a coarse grid, a fixed number of cells along the short side of the canvas, then reduced to the two, three or four colours of an old screen or a print. Error diffusion (Floyd–Steinberg, Atkinson, Jarvis–Judice–Ninke) pushes the rounding error of each cell onto the cells not yet visited. Ordered dithering compares each cell with a threshold matrix: Bayer's recursive cross-hatch, or a blue-noise matrix built by void-and-cluster. The palettes are a green handheld LCD, black on white, the four colours of CGA, an amber monitor, and two risograph inks printed on top of each other, the second slightly out of register. The grid is scaled up with nearest-neighbour sampling, so a hash gives the same pixels at any size. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="dither" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="dither" />

## Credits

- Error diffusion: Robert W. Floyd and Louis Steinberg, _An adaptive algorithm for spatial grey scale_ (Proceedings of the SID, 1976); J. F. Jarvis, C. N. Judice and W. H. Ninke, _A survey of techniques for the display of continuous tone pictures on bilevel displays_ (Computer Graphics and Image Processing, 1976); and Bill Atkinson's dither for the original Macintosh, which only passes on six eighths of the error. Rows are scanned in serpentine order.
- Ordered dithering: Bryce E. Bayer, _An optimum method for two-level rendition of continuous-tone pictures_ (IEEE ICC, 1973), and Robert Ulichney, _The void-and-cluster method for dither array generation_ (SPIE, 1993). The 64×64 blue-noise matrix is built once, with integer energies so that it comes out the same in every browser.
- Scenes: John C. Hart, _Sphere tracing_ (The Visual Computer, 1996), for the distance-field renderer. The primitives, smooth unions, soft shadows, tetrahedral normals and ambient occlusion follow Inigo Quilez's [articles](https://iquilezles.org/articles/). The shading is Lambert plus a Blinn–Phong highlight (James F. Blinn, 1977). The balls on a checkered floor recall Turner Whitted's _An improved illumination model for shaded display_ (1980). The coast uses fractal value noise.
- Palettes: CGA is the high-intensity palette 1 of the IBM Color Graphics Adapter's 320×200 mode (1981). The handheld green, the amber, the paper and the risograph inks are original approximations.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
