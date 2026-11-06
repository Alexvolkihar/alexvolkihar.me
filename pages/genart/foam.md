---
title: Foam - Generative Art - Alexvolkihar
display: Foam
subtitle: Soap films relaxed towards Plateau's laws
description: Foam, a deterministic soap-foam series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Soap foam follows a few strict rules, found by Joseph Plateau in the nineteenth century: films are smooth, they meet three at a time, and they meet at 120°. Here every bubble starts as a disc of a given size, all the same, spread out, in two families, or the mixed sizes of a foam that has aged. The discs push one another apart until neighbouring surfaces cross at Plateau's angle, and each bubble then becomes its power (Laguerre) cell, cut by its own disc. A dry foam closes into polygons, a wet one leaves round bubbles in the liquid. Each film is bent into an arc by the pressure difference across it, so a small bubble always bulges into a bigger one, and every junction swells into a Plateau border, a small concave triangle of liquid that grows with the liquid fraction. The foam fills the frame, floats as a raft on water, stands in a dish, or drains: dry and coarse at the top, wet near the foam line, with loose bubbles rising through the liquid below. The bubbles are painted in the interference colours of a thin soap film (computed from its thickness, thin at the top where the film drains), as clear bubbles lit from behind, or as an ink plate in which the cells that are not hexagons are hatched. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="foam" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="foam" />

## Credits

- Laws of the films: J. Plateau, _Statique expérimentale et théorique des liquides soumis aux seules forces moléculaires_ (1873), and D. Weaire and S. Hutzler, _The Physics of Foams_ (Oxford University Press, 1999), for the circular arcs of a 2D foam, their curvature set by the pressure difference (Laplace–Young), the Plateau borders of a wet foam and the role of cells with fewer or more than six sides.
- Cells: F. Aurenhammer, [Power diagrams: properties, algorithms and applications](https://doi.org/10.1137/0216006) (SIAM J. Comput. 16, 1987). Each cell is a Laguerre cell clipped by its own disc, computed by half-plane clipping.
- Packing: a soft-disc relaxation in the spirit of D. J. Durian's bubble model, [Foam mechanics at the bubble scale](https://doi.org/10.1103/PhysRevLett.75.4780) (Phys. Rev. Lett. 75, 1995), with the discs inflated during the run as in Lubachevsky and Stillinger's compression of hard discs.
- Hatching: by von Neumann's law (1952), a cell of a 2D foam with fewer than six sides shrinks and one with more than six grows as the foam coarsens.
- Film colours: the Airy reflectance of a soap film integrated against the CIE 1931 colour matching functions, using the fits of C. Wyman, P.-P. Sloan and P. Shirley, [Simple analytic approximations to the CIE XYZ color matching functions](https://jcgt.org/published/0002/02/01/) (JCGT 2(2), 2013).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
