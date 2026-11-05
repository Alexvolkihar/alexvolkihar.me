---
title: Harmonograph - Generative Art - Alexvolkihar
display: Harmonograph
subtitle: One pen line drawn by damped pendulums
description: Harmonograph, a deterministic series of pendulum drawings where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

A harmonograph hangs a pen and a small drawing table from pendulums. Two of them swing at right angles, and sometimes a third pendulum under the table moves it in an ellipse, a fourth adds a second swing on each axis, or the table turns in a circle. Their frequencies sit close to a musical interval: unison, octave, fifth, fourth, major third, or a rarer one. Because the tuning is never quite exact, the figure slowly turns as it is drawn. Friction shrinks every swing, so the line spirals inwards and gets tighter towards the centre. The pen presses less as the run goes on, and the ink fades with it. Some pieces have a second or third run on top of the first, each in its own ink and each started a few swings later. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="harmonograph" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="harmonograph" />

## Credits

- The harmonograph: usually credited to Hugh Blackburn, who described a compound pendulum in 1844, and popular as a parlour instrument in Victorian Britain. Each pendulum adds a damped sine, A sin(2πft + p) e^(−dt), to the pen position.
- Jules Antoine Lissajous, whose 1857 figures (two perpendicular vibrations at a frequency ratio) are the undamped case of these drawings.
- Rendering: every point of the line is computed directly from time, never stepped from the previous one. The line is stroked half a swing at a time so that its width and opacity can follow the pen pressure. The palettes are original.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
