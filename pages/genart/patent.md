---
title: Patent - Generative Art - Alexvolkihar
display: Patent
subtitle: Drawings filed for machines that never existed
description: Patent, a deterministic series of nineteenth-century patent drawings of imaginary contraptions, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a patent-office sheet for a machine that was never built. The machine is put together one part at a time, and each new part is attached to one already on the sheet. A gear meshes with a gear already placed: their centres are the sum of the two pitch radii apart, they share the same module, and their teeth interlock. A belt runs on the tangents of two pulleys. A roller follower rides on a cam, its rod held in guides and pushed back by a spring onto a punch, a hammer or a pump plunger. A crank drives a piston or a walking beam. A clock train ends in an escape wheel, an anchor and a pendulum. A part that would overlap anything it is not attached to is rejected, and the next direction is tried. The result is mounted on a cast frame or on standards above a hatched ground line.

The sheet is laid out in the manner of the period. Fig. 1 shows the machine in elevation, with heavy shade lines on the edges turned away from a light coming from the upper left. Dashed lines give a second position of the crank or the beam, and dotted ones trace a path of motion. On some sheets one arbor is taken apart along its axis in Fig. 2, and one tooth mesh is enlarged in Fig. 3 with its pitch circles, base circles and line of action. Numerals on curved leader lines name the parts, and a part keeps the same numeral from one figure to the next. A title block carries an invented inventor, title, number and date. The lettering and numerals are pen strokes from a small vector font written for the series, and the signatures are drawn the same way, as pen scribbles. No system font is used. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="patent" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="patent" />

## Credits

- Patent drawings: the drafting conventions of nineteenth-century patent drawings: shade lines on edges turned away from the light, section hatching, reference numerals, "Fig." captions, witnesses and inventor. The inventors, titles, numbers and dates are invented. The numbers only follow the rough rate at which patents were issued in those years.
- Gear teeth: involute spur gears with a 20° pressure angle. Each flank follows the involute of the base circle through the involute function inv(α) = tan α − α, as in standard gear geometry (Leonhard Euler proposed the involute profile in the 1750s, and Robert Willis set out the theory of tooth contact in _Principles of Mechanism_, 1841). Two gears mesh at a centre distance equal to the sum of their pitch radii, with their tooth phases offset by half a pitch at the line of centres.
- Cams and linkages: a cycloidal rise-and-return cam, a uniform-motion (heart) cam and an eccentric, read by a roller follower. The follower's position is the farthest contact of the roller along its rod. The beam engines are Grashof crank-rocker four-bar linkages, solved by circle intersection, and the dotted lines are their coupler curves (see Hrones and Nelson, _Analysis of the Four-Bar Linkage_, 1951). Belts run on the open or crossed common tangents of two circles.
- Exploded view: an orthographic oblique projection, in which each part is drawn as a prism (back face, body, visible side edges, then the front face) from the farthest to the nearest, with hidden lines removed by the paper-coloured fill.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and the stroke font are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
