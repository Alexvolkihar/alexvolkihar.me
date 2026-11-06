---
title: Orbits - Generative Art - Alexvolkihar
display: Orbits
subtitle: Concentric systems from a grammar of rings
description: Orbits, a deterministic series of concentric orbital systems, dial scales and Keplerian orbits where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a system of rings stacked around a centre, from the inside out. A small grammar picks the next ring at each step: a groove of hairlines, a dashed ring, a dial scale with major and minor ticks, a few broken arcs, a spiral of dots, a gear-tooth rim, a string of beads or a solid band. Widths, gaps and phases come from the hash. The phases can line up along one axis, twist into a swirl or fall anywhere. Lined-up pieces sometimes lose a wedge, like a sectioned drawing. Past its nominal radius the stack carries on, fainter and more open, out to the farthest corner, so the system fills any canvas shape. Small satellites sit on some rings, cut into them by a halo. Eccentric orbits cross the stack with the centre at one focus, their bodies spaced at equal steps of time. The layout is a single system, a binary pair whose rings run through each other, a primary carrying moon systems, a vast system centred near a corner, or an eccentric stack whose rings drift off-centre as they grow. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="orbits" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="orbits" />

## Credits

- Ring grammar: an original set of ring types, chosen one after the other by weighted draws. The look borrows from the engraved scales of astrolabes, dials and orreries. It copies no instrument, and the palettes are original.
- Eccentric orbits: Kepler's first and second laws (_Astronomia Nova_, 1609). Each orbit is an ellipse with the system centre at one focus. Bodies are placed at equal steps of the mean anomaly M, and [Kepler's equation](https://en.wikipedia.org/wiki/Kepler%27s_equation) M = E − e sin E is solved for the eccentric anomaly E with Newton's method. Bodies therefore crowd together far from the focus and spread out near it.
- Dotted spirals: dots at an even spacing along an [Archimedean spiral](https://en.wikipedia.org/wiki/Archimedean_spiral) r = r₀ + bθ, stepping by ds / √(r² + b²) in angle.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
