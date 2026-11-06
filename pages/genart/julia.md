---
title: Julia - Generative Art - Alexvolkihar
display: Julia
subtitle: Escape-time fractals framed by the hash
description: Julia, a deterministic series of escape-time fractals (Julia and Mandelbrot sets, the Burning Ship, Newton basins) where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Every point of the plane is iterated through a formula until its orbit escapes, settles or runs out of steps. The formula is z² + c on a Julia set, a higher power on a Multi-Julia set, the parameter plane of the Mandelbrot set or of the Burning Ship, or Newton's method on a polynomial whose roots come from the hash. Julia constants are taken just inside or just outside the edge of the Mandelbrot set, where the sets are the most intricate. A wide frame shows the whole set. Deeper frames walk in towards the boundary, step by step. A frame that turns out flat, noisy or mostly filled is rejected and another is drawn, from the same hash. Colour comes from the smooth iteration count, as bands, as relief lit from one side, as glowing filaments, as orbit traps or as contour lines. The Burning Ship is always drawn in bands or contour lines: its fine grain turns to speckle under the other shadings. A wider canvas shows more of the plane. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="julia" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds. On the Burning Ship, the Relief, Filament and Trap draws are shown as Bands.

<GenArtTraits series="julia" />

## Credits

- Julia sets: Gaston Julia and Pierre Fatou (1918–1920). The Mandelbrot set: Benoit Mandelbrot (1980), after Robert Brooks and Peter Matelski (1978). Multibrot sets: z ↦ z^d + c, here for d from 3 to 5.
- Burning Ship: Michael Michelitsch and Otto Rössler, "The 'Burning Ship' and its quasi-Julia sets" (_Computers & Graphics_, 1992). Its folding |x|, |y| is not holomorphic, so its distance estimate follows the full 2 × 2 Jacobian of the orbit.
- Newton fractals: Newton's method on a complex polynomial, after Arthur Cayley's question (1879) and the work of John Hubbard, Dierk Schleicher and Scott Sutherland, "How to find all roots of complex polynomials by Newton's method" (_Inventiones_, 2001). Some pieces use the relaxed step z − a p(z)/p′(z).
- Smooth colouring: the renormalised iteration count n − log_d(ln|z| / ln R), as described by Linas Vepstas, ["Renormalizing the Mandelbrot escape"](https://linas.org/art-gallery/escape/escape.html).
- Distance estimation: |z| ln|z| / |z′|, after John Milnor and William Thurston; see Inigo Quilez, ["distance to fractals"](https://iquilezles.org/articles/distancefractals/). Relief lighting uses the normal z / z′ and a Lambert light, after Arnaud Chéritat's ["normal map effect"](https://www.math.univ-toulouse.fr/~cheritat/wiki-draw/index.php/Mandelbrot_set). Orbit traps: Clifford Pickover.
- Rendering: interior points are found by Brent-style periodicity checking or, for a Julia set, by a ball around its attracting cycle (found from the critical orbit, after Fatou). Smooth areas are filled by adaptive subdivision, and edges get extra samples within a budget. The orbits use + − × ÷ only, and the logarithms and square roots are rebuilt from the exact binary exponent and the same four operations, so a hash computes the same values in every browser. Canvases larger than 4K are computed at 4K and scaled up.
- Frame selection: a coarse preview is scored by the Shannon entropy of its iteration histogram.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
