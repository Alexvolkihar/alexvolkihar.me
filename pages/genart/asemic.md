---
title: Asemic - Generative Art - Alexvolkihar
display: Asemic
subtitle: Pages of an invented script
description: Asemic, a deterministic series of handwritten pages in invented alphabets, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Every hash invents a script. Twenty to forty glyphs are built from a small stroke vocabulary (humps and loops, hooks and bars, rings and dots) under the rules of one hand: looped and cursive, angular, geometric, or hanging from a headline. A lexicon of words is drawn from that alphabet, with a few letters and words far more common than the rest, and the text is written out as lines of prose, vertical columns, a spiral or a codex page with a large initial and notes in the margin. The pen is a broad nib, a pointed pen or a brush; the hand trembles a little, the ink runs dry and is dipped again, and it pools where the pen lifts. It looks like writing, and none of it can be read. Press **New seed** for a fresh hash, then share the URL to show someone that exact page.

</div>

<GenArtGallery series="asemic" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="asemic" />

## Credits

- Asemic writing, wordless writing that keeps the look and gesture of script, is a long-standing practice of calligraphers, painters and poets. The alphabets here are invented from scratch by the code; no real script is copied and no font is used: every mark is a path.
- Strokes: centripetal Catmull-Rom splines in the pyramidal form of Barry & Goldman (1988). The broad nib is a short segment swept along the path; the pointed pen swells on downstrokes and the brush follows a pressure curve. Letter and word frequencies follow a Zipf-like law.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey. The hash seeding, named sub-streams and verification follow Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
