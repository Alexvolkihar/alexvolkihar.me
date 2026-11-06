---
title: Bauhaus - Generative Art - Alexvolkihar
display: Bauhaus
subtitle: Geometric posters from a few primary forms
description: Bauhaus, a deterministic series of modernist geometric posters where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a poster made from a few primary forms: discs, half and quarter discs, squares, triangles, rings and bars, in a few flat colours on paper. Five layouts place them. Modular snaps them to a square grid with gutters, around one large form that sets the scale. Golden cuts the sheet again and again at the golden section, usually cutting a square off a rectangle, and gives each piece a form or leaves it blank. Diagonal lays a heavy bar on a tilted axis, with discs, domes and cross bars resting on it or straddling it. Axis builds a symmetrical figure row by row on the centre line and breaks it with one small mark off the axis. Totem stacks blocks, domes, discs and gables on a ground line. Where forms overlap they can stay flat, overprint like transparent inks or cut each other out back to paper. A last layer adds thin rules, a block of bars standing in for text, or a field of dots, placed in the emptiest part of the sheet. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="bauhaus" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="bauhaus" />

## Credits

- Tradition: the posters and printed matter of the Bauhaus (Weimar 1919, Dessau 1925 to 1932) and of the Swiss International Typographic Style that followed it. The series follows the movement's general rules (primary forms, flat colour, asymmetric balance, bars in place of type) and does not copy any single designer's work.
- Colours: when a form takes "its" colour, it follows the answers expected from the questionnaire Wassily Kandinsky handed out at the Bauhaus in 1923: a yellow triangle, a red square and a blue circle. How often a piece obeys the rule is drawn from the hash.
- Modular grid: forms snapped to square modules separated by gutters, as set out in Josef Müller-Brockmann's _Grid Systems in Graphic Design_ (1981).
- Golden layout: recursive subdivision of the sheet at the golden ratio φ = (1 + √5) / 2, mostly by cutting the largest square off a rectangle, which turns a golden rectangle into a smaller golden rectangle (the "whirling squares").
- Diagonal layout: the tilted axis of Constructivist and Bauhaus posters, and Kandinsky's analysis of point, line and plane in _Punkt und Linie zu Fläche_ (1926).
- Overlaps: overprint uses the multiply (or, on the dark palette, screen) blend modes of the W3C _Compositing and Blending_ specification. Cut-out clips each form to every earlier form it touches and fills the overlap with paper.
- Accent placement: the text bars and dots go to the candidate position, on a 25 × 25 grid of positions, that overlaps the forms' bounding boxes least.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
