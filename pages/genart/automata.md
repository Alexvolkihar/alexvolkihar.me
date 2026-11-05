---
title: Automata - Generative Art - Alexvolkihar
display: Automata
subtitle: Cellular automata worked as cloth
description: Automata, a deterministic series of cellular-automaton patterns stitched, knitted, beaded and pieced, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a grid of cells that follow one simple local rule. One-dimensional rules start from a row (a single seed, a few, or a random scatter) and each new generation is worked as the next row down the cloth, so the pattern grows from the top edge. Two-dimensional rules start from a random soup, often folded into a mirror or four-fold symmetry, and run for a few dozen to a few hundred generations before the final state is worked. The rule, the seed and the boundary all come from the hash. The boundary decides how the repeat meets itself: wrapped into a seamless repeat, reflected at every repeat, or closed by a wall so that the panels are separated by a selvedge. Rules that end up blank, flat, striped or as plain noise are thrown out, and the next rule is drawn from the same stream. Each cell is then worked as a cross-stitch on aida, a knitted stitch, a cylinder bead on a loom or a quilt patch, and its colour comes from its state and its age. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="automata" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="automata" />

## Credits

- Elementary cellular automata: the 256 two-state, nearest-neighbour rules and their numbering, from Stephen Wolfram's "Statistical Mechanics of Cellular Automata" (_Reviews of Modern Physics_, 1983). Three-state totalistic rules follow his "Universality and Complexity in Cellular Automata" (_Physica D_, 1984).
- Life-like rules: the B/S notation for outer-totalistic rules on the Moore neighbourhood, after John Horton Conway's Game of Life (made public by Martin Gardner in _Scientific American_, 1970). HighLife is Nathan Thompson's rule; Day & Night, Maze, Coral, Anneal, Diamoeba, Walled Cities and Move are named rules collected by the Life community, notably in Mirek Wójtowicz's MCell catalogue.
- Cyclic cellular automaton: David Griffeath's cyclic rule, studied with Robert Fisch and Janko Gravner in "Cyclic Cellular Automata in Two Dimensions" (1991), in which a cell moves on to the next of n states when enough of its neighbours are already there, and turbulence settles into spirals.
- Rejection test: entropy of 2×2 blocks against the entropy of single cells (with the Miller–Madow bias correction), plus a check that a one-dimensional rule is not just its own past shifted.
- Textiles: counted cross-stitch, stockinette colourwork, loom beadwork and pieced quilts with half-square triangles. The series borrows only their grids; the patterns come from the automata and the palettes are original.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
