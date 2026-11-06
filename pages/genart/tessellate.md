---
title: Tessellate - Generative Art - Alexvolkihar
display: Tessellate
subtitle: Interlocking creatures from isohedral tilings
description: Tessellate, a deterministic series of Escher-like interlocking tilings where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts from a simple polygon that tiles the plane under one symmetry: a parallelogram or hexagon moved only by translations, a quadrilateral whose alternate columns are mirrored by a glide reflection, a quadrilateral turned half a turn about each edge, a hexagon turning in threes, a square turning in fours, or a triangle turning in sixes. Then every straight edge is bent into a curve drawn from the hash, and each curve obeys its edge's rule: an edge that meets a translated copy gets the same curve, an edge shared with a half-turned neighbour becomes point-symmetric about its midpoint, an edge that turns onto its partner carries the turned curve. Whatever bulges out on one side dents in on the other, so the bent tile still fills the plane with no gap and no overlap. The tiles are coloured so that no two neighbours match, then given an inner life: an eye and gill lines, echoed outlines like growth rings, stripes, or a plain keyline. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="tessellate" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="tessellate" />

## Credits

- Tradition: M. C. Escher's periodic drawings of interlocking creatures, as catalogued and analysed by Doris Schattschneider in _Visions of Symmetry_ (1990). The series borrows the method only: no Escher motif is reproduced, and the shapes come from the hash.
- Tiling theory: isohedral tilings and their edge relations as presented by Craig S. Kaplan in _Introductory Tiling Theory for Computer Graphics_ (Morgan & Claypool, 2009), after Grünbaum & Shephard's classification in _Tilings and Patterns_ (1987) and the Heesch types of Heesch & Kienzle, _Flächenschluss_ (1963). The six families used are TTTT/TTTTTT, TGTG, CCCC, C3C3C3C3C3C3, C4C4C4C4 and CC6C6.
- Edges: sine series that vanish at both ends; a half-turn edge keeps only even harmonics, which makes it point-symmetric about its midpoint. A tile is kept only if it stays a simple polygon without thin necks.
- Colouring: linear colourings of the symmetry group, (aspect + q·i + r·j) mod k, checked against the neighbours found on the undeformed tiling.
- Inner lines: level sets of the tile's signed distance field, traced by marching squares (Lorensen & Cline, 1987).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
