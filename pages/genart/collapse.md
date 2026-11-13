---
title: Collapse - Generative Art - Alexvolkihar
display: Collapse
subtitle: Little worlds solved by Wave Function Collapse
description: Collapse, a deterministic series of maps, dungeons, pipework and knotwork carpets solved tile by tile from adjacency rules, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a small hand-made set of tiles and the rules for which tile may sit next to which. A tile has a terrain at each corner and a feature on each edge, such as a river, a corridor, a pipe or a ribbon, and two tiles fit side by side when their shared corners and the feature on their shared edge agree. Every cell of the grid starts out allowing every tile. The solver collapses the most constrained cell to a single tile and passes the consequences on to its neighbours, then picks the next cell, until the whole grid is decided. No tile is placed by hand. Coasts, beaches, rivers that run down to the sea, rooms with doors, pipe networks and closed knots all come from those local rules.

There are four worlds. A **landscape** has shores, beaches, fields and forests, with rivers, roads, bridges and farms. A **dungeon** has rooms, corridors, doors and stairs. **Pipes** is a plant room of thin and thick pipes with valves, gauges, pumps and tanks. **Knotwork** is a carpet of ribbons and cords that cross over and under, loop back and meet in medallions. A mirror or kaleidoscope piece solves half or a quarter of the grid and reflects it. A reflected coastline only looks like an ink blot, so a symmetric landscape follows a plan instead: a parterre inside a moat, crossed by two canals and laid out with broderie, clipped trees, statues and fountains; a fortified town with a keep in its moat; or a canal garden running down to the sea, laid out as a cross, a goosefoot, a fork, a chain of basins, a cascade of terraces or a canal along the shore. The plan only says which terrain each corner should have and where roads are welcome. The tiles still come from the local rules. Every tile is drawn as vector shapes, so a piece stays crisp at any size. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="collapse" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="collapse" />

## Credits

- Wave Function Collapse: Maxim Gumin's [WaveFunctionCollapse](https://github.com/mxgmn/WaveFunctionCollapse) (2016), here in its simple tiled model. The next cell is the one with the lowest Shannon entropy, and constraints spread through the grid by arc consistency, stored as bitsets.
- Model synthesis: Paul Merrell, _Example-Based Model Synthesis_ (i3D 2007), his PhD thesis _Model Synthesis_ (UNC, 2009), and Merrell & Manocha, _Model Synthesis: A General Procedural Modeling Algorithm_ (IEEE TVCG, 2011). When the solver hits a contradiction, it forgets the choices in a small block around it and solves that block again, following his "modifying in blocks", as explained by Boris the Brave in [Model Synthesis and Modifying in Blocks](https://www.boristhebrave.com/2021/10/26/model-synthesis-and-modifying-in-blocks/) (2021).
- Corner terrains: tiles carry a terrain level at each corner, as in corner Wang tiles and marching squares, so coasts and room walls join smoothly from tile to tile. In the landscapes, a seeded relief adjusts the tile weights at each position (a weighted WFC) to shape the continents, or, in a symmetric piece, the plan of a garden, a fortress or a canal does. The local rules still decide every coast, beach, river and road.
- Tilesets, palettes and drawing are original to this series.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
