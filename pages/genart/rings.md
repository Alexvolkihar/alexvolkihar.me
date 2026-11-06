---
title: Rings - Generative Art - Alexvolkihar
display: Rings
subtitle: Growth rings of trees that never grew
description: Rings, a deterministic series of log ends, sawn slices, woodpiles and floorboards where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts with a tree that never grew: a list of yearly ring widths, wide near the pith and narrowing with age, rising and falling with an invented climate, pinched by droughts and widened by a release. That wood is then cut. A log end shows the rings around an off-centre pith, with bark, medullary rays, knots and drying checks. A log can also be sawn through and spread into slices, or split and stacked into a woodpile. A board is the same cylinder of rings cut by a plane: nested cathedral arches when it is flat-sawn, straight stripes and silvery ray fleck when it is quarter-sawn. Oak, walnut, birch, cedar and ebony each have their own colours, vessels and rays. A piece can be left raw from the saw, oiled, spalted by fungi, or inked and printed like a woodblock. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="rings" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="rings" />

## Credits

- Wood as a solid texture: Darwyn Peachey, [Solid Texturing of Complex Surfaces](https://history.siggraph.org/?p=107417) (SIGGRAPH 1985), with the rings perturbed by lattice noise in the spirit of Ken Perlin's An Image Synthesizer (SIGGRAPH 1985). A board is a plane cut through a slowly tapering cylinder of rings, which is why flat-sawn faces show cathedral arches.
- Knots deflect the ring field around them, a much simplified take on Maria Larsson et al., [Procedural Texturing of Solid Wood with Knots](https://marialarsson.github.io/procedural_knots.html) (SIGGRAPH 2022). The anatomy (vessels, rays, early and late wood) follows the description of wood structure in Liu, Dong, Hasan & Marschner, [Simulating the Structure and Texture of Solid Wood](https://research.cs.cornell.edu/wood/) (SIGGRAPH Asia 2016), and ordinary wood identification keys.
- Ring widths: a juvenile trend, a slow age decline and a red-noise (AR(1)) climate series, with drought years and a release as dendrochronologists describe them.
- Spalting zone lines are level sets of noise, kept at a constant width with the first-order distance estimate |f| / |∇f| described by [Inigo Quilez](https://iquilezles.org/articles/distance).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
