---
title: Floorplan - Generative Art - Alexvolkihar
display: Floorplan
subtitle: Plans of houses that were never built
description: Floorplan, a deterministic series of architectural floor plans, with rooms, doors, walls and dimension lines, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is the plan of a building that does not exist. The footprint is a rectangle, an L, a U around a courtyard, or wings stepped against each other. A room program comes with it: a cottage with a living room, a kitchen and one or two bedrooms, a family house, a villa with a dressing room and a stair, or a block of flats along a corridor with a stair and lift core. The rooms are spread over the wings by area, the bedroom wing gets a corridor, and each wing is then cut into rooms, either by a squarified treemap or by halving it again and again, whichever gives better-proportioned rooms.

The bedrooms always go to a night wing, or to the night end of the house behind a hall, so none of them opens onto the living room. Doors follow the cheapest tree that reaches every room: a bedroom opens onto the corridor, a bathroom onto the hall or the main bedroom, and a closet that the tree missed still gets its own door. Windows go on the outside walls. The plan is then drafted the way an architect would: cut walls hatched or filled, door leaves with their swing, glazing, stairs with a walking line, furniture symbols, tiled bathrooms and kitchens, a terrace off the living room, dimension chains, a north arrow, a scale bar and a title block. All the lettering is tiny dashes. The construction sheets add the structural grid and section marks, and the schematic sheets colour the day, night and wet zones instead of furnishing them.

A plan seldom has the proportions of the sheet, so the rest of the sheet holds other drawings of the same building, at the same scale: a front elevation projected straight down from the plan, a cross-section along the cut marked on the plan, a side elevation, or a room schedule with a legend. The roof (gabled, hipped or flat) and the number of storeys come from the hash. Every candidate layout is scored on how large it draws the plan and how much of the sheet it covers, and the best one wins, so the same hash fills a square, a 16:9 or a 9:16 canvas. A tall canvas may also turn a wide plan a quarter turn, north arrow included. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="floorplan" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="floorplan" />

## Credits

- Room layout: the squarified treemap of Mark Bruls, Kees Huizing and Jarke J. van Wijk, [Squarified Treemaps](https://doi.org/10.2312/VisSym/VisSym00/033-042) (VisSym 2000), and its use for house plans by Fernando Marson and Soraia Raupp Musse, [Automatic Real-Time Generation of Floor Plans Based on Squarified Treemaps Algorithm](https://doi.org/10.1155/2010/624817) (International Journal of Computer Games Technology, 2010), where the room program is laid out by area and corridors are carved out of the private zone. Here the treemap competes with an area-weighted binary space partition on a 30 cm grid, and the layout with better-proportioned rooms wins. The code is a new implementation.
- Doors: a minimum spanning tree of the room adjacency graph, grown with Prim's algorithm (Vojtěch Jarník 1930, Robert C. Prim 1957). Each wall shared by two rooms is weighted by how natural a door there would be.
- Drawing: the usual conventions of architectural plans: poché for cut walls, door leaves drawn open at 90° with their swing arc, windows as three thin lines, dimension chains with oblique ticks, grid axes with bubbles, section marks, a north arrow and a scale bar. Elevations and sections follow orthographic projection in the third-angle arrangement (front view under the plan, right-hand view to its right), with level marks and drawing-number bubbles.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and the plans are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
