---
title: Quilt - Generative Art - Alexvolkihar
display: Quilt
subtitle: Patchwork quilts pieced from classic blocks
description: Quilt, a deterministic series of patchwork quilts pieced from traditional block patterns, where every output comes from a single hash.
---

<!-- @layout-full-width -->

<div class="prose m-auto mb-8">

Each piece is a quilt laid out on a wooden floor. The top is pieced from one traditional block: a log cabin, a nine-patch, flying geese, half-square triangles, an Ohio star or a drunkard's path. A sampler quilt mixes all of them. Each block is written as its piecing diagram, a list of patches with a fabric role for each: background, main colours, accent or dark. Blocks whose look changes when they are turned are set in the old arrangements. Log cabins can make concentric diamonds (barn raising), diagonal bands (straight furrows) or light and dark diamonds. Drunkard's path units can join into circles, with the colours swapped in alternate groups ("Robbing Peter to Pay Paul"), or wander from block to block. The blocks are joined with sashing and cornerstones, set edge to edge (sometimes alternating with plain squares), or arranged round a large central medallion inside a sawtooth frame. An inner border, an outer border and a binding finish the quilt.

The fabrics are printed for each piece: small calico florets, shirtings with sparse sprigs, pin dots, gingham, stripes, tone-on-tone scribbles and plain solids. A controlled quilt keeps one fabric for each role. A scrappy or solid one changes the colours from block to block, and every patch is cut from a different place in its print. The quilting goes over the top last: stitched in the ditch along the seams, echoed inside each patch, in a diagonal crosshatch, or in rows of Baptist fans. Every quilted line sinks a little into the batting. The side away from the light is shaded and the side facing it is lit, so the cloth puffs up between the lines, and a running stitch is drawn along each line. Press **New seed** for a fresh hash, then share the URL to show someone that exact piece.

</div>

<GenArtGallery series="quilt" />

<div class="prose m-auto mt-12">

## Traits

The weights were set before any drawing code was written. They were then checked against a census of 2,000 seeds.

<GenArtTraits series="quilt" />

## Credits

- Quilt blocks and settings: the piecing patterns of American patchwork as passed down by generations of quilters. The log cabin and its barn raising, straight furrow and light and dark settings; the nine-patch and double nine-patch; flying geese and Dutchman's puzzle; half-square triangle pinwheels; the Ohio star; the drunkard's path and its "Robbing Peter to Pay Paul" colouring; medallion quilts with sawtooth frames; and Baptist fan quilting. Barbara Brackman's _Encyclopedia of Pieced Quilt Patterns_ catalogues these blocks and their many names. The Jewel palette's dark grounds and saturated solids follow the Amish quilts of Lancaster County, Pennsylvania, and the Feedsack palette follows the printed cotton feed and flour sacks of the 1930s. The blocks are drawn from their traditional piecing diagrams. No particular quilt is copied.
- Echo quilting: each patch is offset inwards with mitred corners. The offset is limited by the patch's inradius (2·area / perimeter), and the line is dropped when the patch collapses.
- Crosshatch: diagonal lines clipped to the pieced field with the Liang–Barsky algorithm (You-Dong Liang and Brian A. Barsky, 1984).
- Baptist fan: concentric quarter arcs on a grid. A fan hides the arcs of the fans quilted before it, so each arc is sampled and broken where a later fan covers it.
- Randomness: [sfc32](https://pracrand.sourceforge.net/) by Chris Doty-Humphrey, seeded from the hash with named sub-streams, following Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT).
- The palettes and fabric prints are original. The code was written with an AI assistant. It draws everything itself: no AI-generated images.

</div>
