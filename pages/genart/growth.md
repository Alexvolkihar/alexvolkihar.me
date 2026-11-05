---
title: Growth - Generative Art - Alexvolkihar
display: Growth
subtitle: Closed lines that fold as they grow
description: Growth, a deterministic differential-growth series where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

One small loop is seeded in the frame, or a pair, a colony, two nested rings, or a wide rim that hugs the wall and can only fold inwards. At every step each point of the line is pushed away from the points around it, pulled towards its two neighbours, and the line gets a little longer where it is most vigorous. Since it cannot cross itself, the extra length has nowhere to go but into folds: lichen rims, brain-coral mazes, fat lobes. The growth runs for a fixed number of steps and is recorded along the way, then drawn as filled growth rings, a ridged band, a time-lapse of contours or an inlaid shape. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="growth" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="growth" />

## Credits

- Differential growth: the "differential line" algorithm as described by Anders Hoff in [Differential Line](https://inconvergent.net/generative/differential-line/) and his other writing on generative growth, and by Jason Webb in [2D differential growth experiments](https://github.com/jasonwebb/2d-differential-growth-experiments). The series takes the algorithm only; the drawing styles and palettes are its own.
- Biology: the buckling of thin tissues that grow faster at their rim than inside, as in lettuce leaves, lichens and corals; see E. Sharon, M. Marder and H. L. Swinney, _Leaves, Flowers and Garbage Bags: Making Waves_ (American Scientist, 2004).
- Neighbour search: a uniform grid of one repulsion radius, rebuilt by counting sort at every step. The simulation only uses additions, multiplications, divisions and square roots, so it grows the same way in every browser.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
