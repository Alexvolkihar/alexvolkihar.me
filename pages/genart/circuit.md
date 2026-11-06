---
title: Circuit - Generative Art - Alexvolkihar
display: Circuit
subtitle: Printed circuit boards that were never made
description: Circuit, a deterministic series of imaginary printed circuit boards, placed, routed and fabricated from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a printed circuit board that was never sent to a fab. The parts go down first, on a routing grid of about 0.635 mm per cell, from footprints drawn in their real proportions: SOIC and TSOP chips, quad flat packs, QFNs with their thermal pad, 0603 and 1206 resistors and capacitors, SOT-23 transistors, electrolytic capacitors, crystals, pin headers, TO-220 regulators, power inductors and screw terminals. A netlist then ties the pins together. Two chips facing each other get a bus, pin for pin and in order. Decoupling capacitors sit between the chips' supply pins and ground, the main chip on a logic board gets a crystal with its two load capacitors, and every LED gets its resistor. Short point-to-point nets join the rest. On memory boards the chips stand in rows above a gold edge connector, and on power boards the regulators, inductors and bulk capacitors are chained by wide copper.

Each connection is then routed in turn, shortest first, by a maze router. It is an A\* search over the grid that charges for every bend and every via, so a track runs straight, turns at 45° (or at right angles on some boards) and steps around everything laid before it. A connection that finds no way through drops to an inner layer through a via, as it would on a real board. Two-layer boards are routed on both faces, and the bottom layer shows faintly through the mask. Then the board is fabricated: a solid or hatched ground pour with a clearance gap around every other net and thermal spokes on the ground pads, a solder mask in green, blue, black, purple or white, gold pads, and a silkscreen legend with outlines, pin-1 dots, polarity marks and reference designators numbered in reading order. Some boards come back from assembly with their parts on. The lettering is drawn with a small stroke font written for the series. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="circuit" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="circuit" />

## Credits

- Routing: the grid maze router of C. Y. Lee ("An Algorithm for Path Connections and Its Applications", _IRE Transactions on Electronic Computers_, 1961), run as an A\* search (P. E. Hart, N. J. Nilsson and B. Raphael, "A Formal Basis for the Heuristic Determination of Minimum Cost Paths", 1968) over states made of a cell, a layer and the direction of arrival, so that bends and vias can be priced. A 45° bend is cheap, a right angle dearer, and sharper turns are not allowed. Nets are routed one at a time, shortest first, and a diagonal step may not clip a pad or cross another diagonal.
- Footprints: package pitches from the JEDEC outlines (1.27 mm SOIC, 0.65 mm quad flat packs and TSOP, 2.54 mm DIP) and common connector pitches (2.54 mm pin headers, 5.08 mm screw terminals). The reference designator letters (R, C, U, J, Y, Q, D, L, TP) follow ASME Y14.44.
- Fabrication: ground pours with clearances and thermal reliefs, stitching vias, fiducials and mounting holes as they appear in ordinary PCB CAM output. The part numbers and markings are invented.
- Lettering: an original single-stroke font, in the manner of the vector fonts used by pen plotters and photoplotters (after A. V. Hershey's plotter fonts, 1967).
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and the stroke font are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
