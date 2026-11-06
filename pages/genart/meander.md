---
title: Meander - Generative Art - Alexvolkihar
display: Meander
subtitle: Corridors walked by agents that only turn at fixed angles
description: Meander, a deterministic series of rooms packed with corridors, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

The canvas is first divided into rooms. It can stay one large hall, be cut into a few rooms or many small cells by repeated straight cuts, or be laid out as long terraces. Each room gets its own lattice, either square, where agents turn by 90°, or triangular, where they turn by 60° or 120°. It also gets a scale and a rule. Agents walk from node to node, never cross their own path or anyone else's, and stop at walls and at a few round stones. A serpentine agent ploughs back and forth like a field or a circuit-board trace. A spiral agent always turns the same way, so it winds inwards. A key agent replays a short turtle program, such as a Greek-key hook, battlements or a spirolateral, until something blocks it. A wandering agent turns at random after a minimum run. When every agent is stuck, a new agent starts on each node that is still free, so each room ends up packed with parallel corridors. The paths are drawn as filled channels, hollow double lines, thick-and-thin strokes that change width with their heading as if drawn with a broad nib, or thin traces with drilled pads at their ends. A wider or taller canvas holds more rooms. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="meander" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="meander" />

## Credits

- Meanders: the running key, or Greek fret, of Geometric-period Greek pottery and its many relatives around the world, and the boustrophedon, the back-and-forth of a plough or of early Greek writing, as seen in field strips, rice terraces and serpentine circuit traces. The series borrows the motifs only. No piece copies a historical one, and the palettes are original.
- Turtle programs: the turtle geometry of Seymour Papert's Logo, as described by Harold Abelson and Andrea diSessa in _Turtle Geometry_ (MIT Press, 1980). [Spirolaterals](https://en.wikipedia.org/wiki/Spirolateral) were devised by Frank C. Odds and published as "Spirolaterals", _The Mathematics Teacher_ 66, 1973, pp. 121–124. A spirolateral walks 1, 2, 3, … n steps with a fixed turn after each, with some turns reversed.
- Agents: every agent is a self-avoiding walk on a square or triangular lattice. It keeps its heading until a local rule makes it turn, and it dies when all its neighbours are taken. The agents move one node per round, in a fixed order. The rooms come from recursive guillotine cuts of the canvas.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
