---
title: Origami - Generative Art - Alexvolkihar
display: Origami
subtitle: Crease patterns and folded paper
description: Origami, a deterministic series of folding patterns drawn as crease diagrams or as lit paper relief, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece lays one classic folding pattern over the sheet. Miura-ori is the map fold of parallelograms between zigzags. Yoshimura is a field of diamonds that buckles a sheet into a vault. The waterbomb tessellation is made of offset waterbomb bases and bulges into a dome. Square and hexagonal twist tessellations are built by shrinking and rotating the tiles of a tiling, and radial pleats are concentric polygons joined by spokes. A pattern can be drawn as a crease-pattern diagram in origami notation, with mountain folds dash-dot and valley folds dashed. It can also be drawn as folded paper lit from one side, each facet shaded by the direction it faces, or as a sheet caught unfolding, flat diagram on one side and folded relief on the other. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="origami" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="origami" />

## Credits

- Miura-ori: the fold Koryo Miura developed in the 1970s for deployable structures and maps, here with the parallelogram angle and the zigzag depth drawn from the hash.
- Yoshimura pattern: the diamond buckling of a thin cylinder under axial load, described by Yoshimaru Yoshimura in 1955.
- Waterbomb tessellation: rows of waterbomb bases, each row shifted by half a base. Ron Resch's folded tessellations of the 1960s and 1970s explored this kind of tuck, and Tomohiro Tachi generalised them in _Freeform Origami Tessellations by Generalizing Resch's Patterns_ (2013).
- Twist tessellations: the flat twist folds of Shuzo Fujimoto, built here with Alex Bateman's shrink-and-rotate construction (from his Tess software) as analysed by Robert J. Lang and Alex Bateman in _Every Spider Web Has a Simple Flat Twist Tessellation_ (2011) and in Lang's _Twists, Tilings, and Tessellations_ (2017). Mountain and valley folds are assigned from the local flat-foldability conditions of each degree-4 vertex (Maekawa and Kawasaki, plus the rule that the two creases around the smallest angle differ), following Jun Mitani's _A system for flat-foldable pattern design based on the Voronoi diagram_. Hexagonal twists only admit such an assignment when the twist is steep enough, so their twist angle is kept above about 20°.
- Radial pleats: the concentric pleated square of the Bauhaus foundation course, generalised to other polygons. Erik Demaine, Martin Demaine, Vi Hart, Gregory Price and Tomohiro Tachi showed in _(Non)existence of Pleated Folds_ (2011) that it cannot fold with only these creases, so the paper quietly bends between them.
- Relief: not a physical simulation. Each facet is tilted away from its mountain creases and up from its valley creases, weighted by crease length, then the sheet as a whole is given a vault, a dome or a gentle sag. Each facet is shaded by its normal under a directional light.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
