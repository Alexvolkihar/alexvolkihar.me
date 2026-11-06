---
title: Starchart - Generative Art - Alexvolkihar
display: Starchart
subtitle: Plates from atlases of a sky that does not exist
description: Starchart, a deterministic series of celestial atlas plates for an invented sky, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a plate from a star atlas, but the sky on it is invented. A few thousand stars are scattered on the celestial sphere, and their magnitudes follow the star-count law: every step fainter brings about three times as many stars. Fainter stars crowd along a randomly tilted galactic plane, where the Milky Way is painted as a band of noise. The band is wider and brighter toward the galactic centre and is split there by a dark rift. Open clusters and nebulae lie in the band, globular clusters gather around the centre, and galaxies are found away from it, as in a real sky.

The constellations are invented too. The sky is cut into cells along hour circles and parallels, and each cell goes to the nearest of about fifty centres. This gives the stepped boundaries of a modern atlas. The brightest stars of each constellation are joined into a stick figure: a minimum spanning tree, sometimes closed into one loop, or a nearest-neighbour chain that branches when a jump gets too long. The sky is then charted as a polar planisphere, a pair of hemispheres, an equatorial strip or a gnomonic atlas plate, with the coordinate grid, the ecliptic, a graduated rim, Greek letters on the brightest stars, catalogue numbers, a magnitude key and sometimes a compass rose. As on a real sky chart, east is on the left. Names, numbers and titles are pen strokes from a small vector font written for the series. No system font is used. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="starchart" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="starchart" />

## Credits

- Star magnitudes: drawn so that the number of stars brighter than magnitude m grows as 10^(0.45 m), close to the naked-eye slope of the classical star counts of the 1920s (F. H. Seares and P. J. van Rhijn).
- Constellation figures: minimum spanning trees by Prim's algorithm (Vojtěch Jarník, 1930; Robert C. Prim, 1957) on the angular distance between stars, and greedy nearest-neighbour walks. The constellation centres are spread with Don P. Mitchell's best-candidate sampling (1991). The stepped boundaries along hour circles and parallels follow the convention Eugène Delporte drew up for the International Astronomical Union in 1930, and the Greek letters follow Johann Bayer's _Uranometria_ (1603). The constellation names are made up from syllables, and any name equal to a real constellation is rejected.
- Projections: azimuthal equidistant, stereographic, equirectangular and gnomonic, as set out in John P. Snyder's _Map Projections: A Working Manual_ (USGS, 1987). The ecliptic is the great circle tilted 23.44° to the equator.
- Milky Way: three-dimensional value noise on an integer-hashed lattice, evaluated on the sphere through the inverse of each projection. The engraved plates add a stipple, with each dot kept with the probability of the local brightness.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and the stroke font are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
