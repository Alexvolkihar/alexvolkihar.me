---
title: Bristle - Generative Art - Alexvolkihar
display: Bristle
subtitle: Angular patches of tufts, bursts, waves and combs drawn stroke by stroke
description: Bristle, a deterministic series of abstract tuft fields made of tens of thousands of fine strokes, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts by cutting the sheet into angular patches: the cells of a Voronoi diagram, blocks split again and again across their long side, triangles cut across their longest edge, or horizontal bands broken by slanted seams. Every patch then gets its own way of planting strokes. A grid of tufts sends short strokes out in every direction from evenly spaced points; a burst sends them out from a single centre to the edges of the patch, in rings; wave rows plant them along stacked sine lines so they rise like crests; a comb plants them on both sides of parallel spines, slanted like the barbs of a feather. A local motion then bends every stroke the same way, swirls them around a point, lets them droop, pushes them sideways with a gust, or pinches their tips together. Tens of thousands of thin, tapered, half-transparent strokes are drawn this way, and their overlaps build the density. One light shines on the whole sheet: a stroke that faces it is longer and brighter, a stroke that turns away is shorter and darker, so each tuft reads as a small dome, each burst as a rippled cone and each comb as a gabled ridge. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="bristle" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="bristle" />

## Credits

- Patches: Voronoi cells (Georgy Voronoi, 1908) computed by cutting the sheet with the bisector half-planes of every other site, with the sites spread by Don P. Mitchell's best-candidate sampling ("Spectrally optimal sampling for distribution ray tracing", _SIGGRAPH_ 1991); guillotine splits of rectangles; triangles split across their longest edge; Sutherland-Hodgman clipping of convex polygons (Ivan Sutherland and Gary Hodgman, "Reentrant polygon clipping", _Communications of the ACM_ 17, 1974).
- Strokes: stroke-based rendering in the sense of Aaron Hertzmann's survey "A Survey of Stroke-Based Rendering" (_IEEE Computer Graphics and Applications_ 23, 2003): each mark is a quadratic Bézier curve, split in two halves with de Casteljau's algorithm so the tip half is drawn thinner than the root half. The lighting of a stroke from its direction against one light follows the idea of the hair shading model of James T. Kajiya and Timothy L. Kay ("Rendering fur with three dimensional textures", _SIGGRAPH_ 1989), reduced to two dimensions.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- Inspired by Camille Roux's [FOLRADURA](https://art.camilleroux.com/work/folradura/) (2022).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
