---
title: Knots - Generative Art - Alexvolkihar
display: Knots
subtitle: Interlace from a plait and its breaks
description: Knots, a deterministic series of Celtic-style knotwork and torus knots where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts as a plait: diagonal strands laid on a square grid that cross at the midpoint of every edge. Breaks are then placed on the grid lines. Where a strand meets one, it turns back along it instead of crossing, and the plait becomes knotwork, with borders, pointed or rounded corner terminals and closed loops. The breaks are mirrored about the centre lines, repeated as a small lattice or scattered freely. Every strand passes over, then under, then over again, all the way round. The form is a single panel, a panel inside a knotwork border, a sampler of small panels, or a torus knot set in a medallion cut out of a panel. Each strand takes its own colour and is drawn as a ribbon: outlined, shaded like a tube, split by a centre line, or carved in relief. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="knots" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="knots" />

## Credits

- Insular knotwork: the interlace of early medieval Irish, Scottish, Pictish and Northumbrian stone carving, metalwork and illuminated manuscripts. The series borrows its construction only. No panel copies a historical one, and the palettes are original.
- Construction: the grid of breaks taught by George Bain in _Celtic Art: The Methods of Construction_ (1951), building on J. Romilly Allen's analysis of interlace in _The Early Christian Monuments of Scotland_ (1903). The formulation here, with a plait whose crossings sit on the edges of a square grid and breaks that turn the strands back, follows Peter R. Cromwell, "Celtic Knotwork: Mathematical Art", _The Mathematical Intelligencer_ 15(1), 1993.
- Over and under: every diamond of the plait is walked the same way round, and each side passes over where it starts and under where it ends. Over and under then alternate along every strand, whatever the breaks.
- Torus knots: the curve r = R + a cos(qt) at angle pt on a torus, with p and q coprime. Its q(p − 1) crossings have a closed form, and at each one the strand higher on the torus passes over.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
