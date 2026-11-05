---
title: Girih - Generative Art - Alexvolkihar
display: Girih
subtitle: Star patterns from polygons in contact
description: Girih, a deterministic series of geometric star-and-rosette patterns where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a periodic tiling by regular polygons: squares, hexagons or triangles alone, or octagons with squares (4.8.8), dodecagons with triangles (3.12.12), dodecagons with hexagons and squares (4.6.12), or hexagons with triangles (3.6.3.6). From the midpoint of every edge, two rays leave at the same contact angle and stop where they meet the rays of the neighbouring edges. Then the tiling is erased. Each tile is left with a star, each vertex with a rosette, and the lines run on from tile to tile as long strands. The pattern is drawn as interlaced strapwork, with every strand passing alternately over and under, or as glazed pieces set in grout, or as a fine line drawing over the faint construction tiling. A narrow contact angle gives open, blunt stars and a wide one gives sharp, slender points. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="girih" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="girih" />

## Credits

- Islamic geometric art: the star-and-rosette patterns of mosaic, carved wood, stucco and glazed tile (zellige) that craftsmen developed over many centuries, from Persia and Anatolia to Andalusia and the Maghreb. The series borrows their geometry only. It contains no inscriptions or calligraphy, and the palettes are original.
- Construction: E. H. Hankin's "polygons in contact" method, published in _The Drawing of Geometric Patterns in Saracenic Art_ (1925), as generalised by Craig S. Kaplan in _Islamic Star Patterns from Polygons in Contact_ (Graphics Interface, 2005) and his other work on Islamic star patterns. Here it is applied to tilings by regular polygons, where every pair of rays meets on the bisector of the corner between them.
- Interlace: every strand crosses at edge midpoints only, so it is enough for each corner of a tile, taken counter-clockwise, to pass over at the crossing where it starts and under at the one where it ends. Over and under then alternate along every strand.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
