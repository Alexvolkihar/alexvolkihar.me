---
title: Ramify - Generative Art - Alexvolkihar
display: Ramify
subtitle: Hatched ribbons that branch and stop just short of each other
description: Ramify, a deterministic series of hatched ribbons grown by colliding agents into columns, arches and rooms, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a seed structure: a void circle, a plinth along the bottom edge, a frame, or a few hubs. Wide agents leave it and walk forward, each one sweeping a ribbon as wide as itself. Along the way they sprout narrower children from their flanks at a birth angle, which is either a right angle, one oblique angle kept for the whole piece, or a fresh angle for every child. An agent dies as soon as its front would come within a small gap of another ribbon, a wall or its own older body, so the ribbons never touch and leave thin paper channels between them. Most agents go straight; in some pieces they turn slowly inside one half of the canvas, bend into quarter and half turns that read as arches, or orbit around the centre. A second pass starts new branches from points along the finished ribbons, wherever there is room left. The ribbons are then drawn from the thinnest to the widest, so every branch tucks under its parent like a beam into a column: an opaque body, an ink outline, and inside it parallel hatching, cross-hatching or stipple at an angle tied to the ribbon's heading. A few ribbons are filled with an accent colour, a few are left blank and the thinnest are sometimes solid ink. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="ramify" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="ramify" />

## Credits

- Colliding agents: Jared Tarbell's [Substrate](http://www.complexification.net/gallery/machines/substrate/) (2003), where agents draw straight lines, branch off existing lines and stop when they meet another one. The agents here have a width, keep a gap from everything they meet, and test collisions on an occupancy grid that records which agent stamped each cell and when, so that a branch can leave its parent and an agent can tell its own fresh trail from its older body.
- Hatching: each ribbon is cut into quads between consecutive centreline vertices, and a family of parallel lines is clipped against each quad analytically, so the lines run on unbroken from one quad to the next without a canvas clipping region. Cross-hatching adds a second family at right angles; stipple scatters dots at a fixed density per unit area.
- Inspired by Camille Roux's [ARTERIA](https://art.camilleroux.com/work/arteria/) (2022).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
