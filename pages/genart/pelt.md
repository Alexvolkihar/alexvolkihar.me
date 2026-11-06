---
title: Pelt - Generative Art - Alexvolkihar
display: Pelt
subtitle: Animal coats grown hair by hair
description: Pelt, a deterministic fur series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece starts with a patch of skin laid along a spine: a close-up of a back, a flank seen from the side with the spine above the frame, or a whole body curled up on itself with its tail wrapped around. Pigment cells on the skin turn each other on over short distances and off over longer ones, and from that rule alone the coat settles into spots, rosettes, stripes, a reticulated net or large piebald patches. On a narrow tail the same rule can only make rings.

Tens of thousands of hairs then grow out of the skin. Each one takes the pigment found at its root and follows a combing field: it leans away from the parting along the spine, droops further down the flanks, swirls around the whorls and waves a little. Long coats gather into locks, every hair tapers and lightens towards its tip, and the hairs that lie across the light catch a sheen. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="pelt" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="pelt" />

## Credits

- Morphogenesis: Alan Turing, [The Chemical Basis of Morphogenesis](https://doi.org/10.1098/rstb.1952.0012) (1952).
- Coat patterns: J. D. Murray, "A pre-pattern formation mechanism for animal coat markings" (Journal of Theoretical Biology, 1981) and "How the leopard gets its spots" (Scientific American, 1988), including the argument that a tapering tail can only carry rings.
- Pattern model: D. A. Young's discrete activator–inhibitor model, [A local activator-inhibitor model of vertebrate skin patterns](<https://doi.org/10.1016/0025-5564(84)90060-9>) (Mathematical Biosciences, 1984), with Gaussian neighbourhoods approximated by box blurs.
- Rosettes: the two-stage idea of R. T. Liu, S. S. Liaw and P. K. Maini, [Two-stage Turing model for generating pigment patterns on the leopard and the jaguar](https://doi.org/10.1103/PhysRevE.74.011914) (Physical Review E, 2006). The reticulated patches are grown with a chamfer distance transform (Gunilla Borgefors, 1986).
- Sheen: the diffuse term of James Kajiya and Timothy Kay's hair model, "Rendering Fur with Three Dimensional Textures" (SIGGRAPH 1989).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
