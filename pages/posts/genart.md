---
title: "Generative art: fourteen series, one hash each"
date: 2026-11-05T00:00:00Z
lang: en
art: random
image: /og/genart.png
duration: 13min
description: How the generative art section of this site works. Every piece comes from one hash, the rules come from Camille Roux's genart skill, and each of the fourteen series is explained in plain words with a live demo you can reseed.
---

> [Version Française](/posts/genart-fr) | [日本語版](/posts/genart-ja)

The [generative art](/genart) section of this site has fourteen series. Each series is a small program, and each piece is that program run on one hash. The pieces are not stored anywhere as images: your browser draws them when you open the page, with plain Canvas 2D and no library.

This post explains the rules I followed, how the pages are built, and then goes through the series one by one. Every series section has a live piece. **Reseed** draws a new random one, and **Open the series** takes you to the series page with that exact piece.

## Hash-seeded, long-form

The style comes from long-form generative art, the kind published on platforms like Art Blocks or fxhash. The artist writes one program and publishes it, and every collector gets a piece made from a random hash, usually 32 bytes written in hex. The program has to stay good on the thousandth output as much as on the first, because the artist does not pick the outputs.

Here nobody mints anything. I kept the constraint because it makes the programs better. A series that only works on a handful of seeds I picked by hand is not finished.

A hash looks like this:

```
0x042cc9624e9138c88de67c9664c949ec594832f859655277625b96e7d80aaaeb
```

Same hash, same piece, at any size, in any browser.

## The rules, borrowed from Camille Roux

I did not invent the method. It follows Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill) (MIT), a set of notes on how to write long-form generative code that stays deterministic. Here is what I took from it.

All variation comes from the hash. A series never calls `Math.random()`, never reads the clock, the screen size or the user agent. The only unseeded random on the whole section is the one that picks _which_ hash to look at when you press "New seed".

One generator feeds several named streams. The 32 bytes of the hash are mixed into a 128-bit seed with `Math.imul` (mixing, not XOR-folding, which cancels out on patterned hashes). That seed feeds [sfc32](https://pracrand.sourceforge.net/), Chris Doty-Humphrey's small fast counting generator from PractRand. Each part of a piece gets its own stream, named by a label: `stream(hash, 'features')`, `stream(hash, 'layout')`, `stream(hash, 'color')`. The label is hashed with FNV-1a and mixed into the seed, and each stream throws away its first twelve values. The point of the named streams is stability: if I add a draw to the colour code, the composition of every existing piece stays where it was.

Features come before rendering. Every series exposes a `features(hash)` function that returns the traits of a piece (its palette, its terrain, its rig) without drawing anything. The renderer then reads those traits. That is how the gallery can list the traits of a piece, and how the census below can run on thousands of seeds without drawing them.

The drawing does not depend on resolution. Every length is a fraction of the short side of the canvas. A piece drawn at 400 pixels and the same piece exported at 8K are the same picture.

Rarity tables are decided before the code. Each series starts with a table of traits and weights, written before any drawing code. For Strata:

```ts
const TRAITS = {
  Palette: [['Dawn', 22], ['Dusk', 22], ['Ink', 20], ['Glacier', 16], ['Night', 12], ['Ember', 8]],
  Terrain: [['Dunes', 30], ['Hills', 40], ['Peaks', 30]],
  Layers: [['Few', 25], ['Many', 50], ['Deep', 25]],
  Texture: [['Clean', 35], ['Strata', 40], ['Stipple', 25]],
  Sky: [['Clear', 30], ['Orb', 50], ['Banded', 20]],
} as const
```

The table is never reordered afterwards, because moving a line re-rolls every piece. Once a series was drawing, I ran a census of 2,000 seeds and checked the counts against the weights. The tables are shown on each series page, rendered from the code, so the page and the program cannot disagree.

Determinism has to be checked. Deterministic code can still give different pictures in two browsers, because `Math.sin` and `Math.exp` are allowed to differ in the last bit. That does not matter when a value is used once. It matters a lot when an orbit runs for millions of steps and every step feeds the next. So the series that iterate avoid those functions: Attractor uses its own sine table, filled with a Taylor series, and the Reaction simulation only uses `+ - * /` on `Float32Array`s, which round the same way everywhere. Harmonograph computes every point directly from time, so a tiny difference never compounds.

## How the section is built

Each series is one file in `src/logics/genart/series/`. It exports a slug, a title, the trait table, `features`, `render` and a short gallery of hashes I liked. An `import.meta.glob` collects them, so adding a series means adding a file and its page in `pages/genart/`. There is no list to edit.

One Vue component, `GenArtCanvas`, draws every piece on the site. It sizes the canvas buffer to the element's CSS width times the device pixel ratio, calls the series' `render`, and redraws when the element is resized. It only draws in `onMounted`, so the static HTML that Vite-SSG generates contains an empty canvas and no random state. The canvas has `role="img"` and an `aria-label` made of the series name, the short hash and the traits.

A series page shows its selected pieces. Click one, or press **New seed**, and the hash goes into the URL: `/genart/strata?hash=0x…`. That URL is the piece. You can send it to someone and they will see the same image.

Under the featured piece there is an export control: eight ratios (1:1, 4:5, 2:3, 3:2, 16:9, 9:16, 21:9 and A4), sizes from Full HD to 8K or a custom long side, and PNG, JPEG or WebP. Since every series draws in a normalised space, a 16:9 export is the same piece extended or centred on its own background, not a crop. Exported files get a small monogram in the bottom-right corner, dark or light depending on the pixels under it, and PNG files carry title, author, copyright with the licence, and source URL as text chunks. The pieces on the pages themselves are never signed.

[The collection](/genart/collection) holds the pieces I chose to keep, numbered in the order they joined: n°01, n°02… Each entry is a name, a series, a hash, a ratio and a date, and the piece is drawn live like everything else. The hash is never shown there. A piece is addressed by a slug of its name (`/genart/collection?piece=<name>`), and its downloads are named after its number and name. The collection never hands out its seeds.

The site is static except for one thing. When I am signed in with GitHub, a series page shows **Add to collection** under the featured piece. A few Vercel Functions check the session (only my account is accepted), check the origin and the input, and commit the new entry to `data/genart-collection.ts` through the GitHub API. The site redeploys a minute later. The sign-in is the small lock at the end of the licence line on every `/genart` page. Anyone else who signs in is turned away by the server.

## The series

In the order of the [index](/genart). Each thumbnail opens the series page.

<GenArtStrip />

### Courants

Hundreds of short lines are dropped at random points and follow the direction of a noise field until they leave the margin. The field is two octaves of value noise, and depending on the hash it is calm and laminar, swelling, or full of eddies. A few strokes in each piece take the accent colour.

<GenArtDemo series="courants" />

Credits: streamlines integrated through value noise on an integer-hashed lattice.

### Fault Lines

A square slab is cut by straight faults, again and again, until it breaks into convex shards. Each cut clips a polygon by a half-plane (the Sutherland–Hodgman method), and each shard is then pulled away from its neighbours by clipping it against its own shifted edges. Every shard gets its own hatching.

<GenArtDemo series="fault-lines" />

Credits: recursive subdivision of convex polygons, half-plane clipping after Sutherland and Hodgman (1974).

### Contours

Topographic maps of places that do not exist. A heightfield of gradient noise is bent by domain warping, then cut into level lines with marching squares, and every fifth line is heavier, as on printed maps. Some sheets stay as line work, some are tinted band by band under a light from the north-west, and some are engraved with hachures that run down the slopes and thicken where it is steep. Water settles in the low ground as lakes, a coast or islands.

<GenArtDemo series="contours" />

Credits: Ken Perlin's improved noise (2002), F. Kenton Musgrave's ridged octaves, Inigo Quilez's domain warping, marching squares (the 2D case of Lorensen and Cline's marching cubes, 1987), and Johann Georg Lehmann's hachure rule (1799).

### Packing

Circles are dropped one at a time into a square, a disc or a cloud of discs. Each one grows until it touches a neighbour. The maximum radius shrinks as the shape fills, so the big circles land first and the small ones fill the gaps. Then each circle gets a motif: rings, an arc, a dot, spokes, a half moon or nested circles.

<GenArtDemo series="packing" />

Credits: random sequential addition, the dart-throwing scheme behind Poisson-disc sampling, with a uniform grid for the collision checks.

### Strata

A landscape seen from the side, as a stack of ridgelines. Each ridge is one-dimensional noise: smooth fractal noise for hills, folded noise for dunes, Musgrave's ridged multifractal for peaks. The ridges are filled from the back to the front, so the near ones hide the far ones, and distance is shown only by colour, the far ridges fading into the haze of the horizon.

<GenArtDemo series="strata" />

Credits: Ken Perlin's gradient noise (1985), fractal Brownian motion, Musgrave's ridged multifractal, the painter's algorithm and aerial perspective.

### Coral

Invisible points are scattered inside a disc, a fan, a square or a crescent. One or more seeds grow towards them step by step: each branch tip turns towards the points closest to it, and a point that a branch reaches is removed. Branches get thicker towards the roots as their children add up, change colour with each generation, and end in a small polyp. The points no branch reached stay behind as dust.

<GenArtDemo series="coral" />

Credits: the [space colonization algorithm](http://algorithmicbotany.org/papers/colonization.egwnp2007.html) of Runions, Lane and Prusinkiewicz (2007), and the pipe model, Leonardo's rule that a branch is as thick as its children together.

### Attractor

A point is moved again and again by a formula made of a few sines and cosines, with four coefficients from the hash: a Clifford, de Jong, Svensson or "dream" map. After a few steps it settles on a strange attractor and stays on it without ever repeating. The program follows it for millions of steps and counts how often it lands in each cell of a grid, then develops the counts like a photograph with a logarithmic curve. Most coefficients give a dot or a small loop, so each candidate gets a short test run (positive Lyapunov exponent, enough spread, enough entropy) and new coefficients are drawn from the hash until one passes.

<GenArtDemo series="attractor" />

Credits: Clifford Pickover's maps (1994), Peter de Jong's map as shown by A. K. Dewdney (1987), Johnny Svensson's variant as collected by [Paul Bourke](https://paulbourke.net/fractals/peterdejong/), J. C. Sprott's Lyapunov test (1993), and the log-density rendering of Scott Draves's [fractal flames](https://flam3.com/flame_draves.pdf).

### Mosaic

Stained glass. Seed points are scattered over the window, more densely where the motif needs small pieces, then moved a few times towards the centre of their own Voronoi cell so that the pieces even out (Lloyd's relaxation). Each cell is a piece of glass with slightly bowed edges. The colours come from a larger pattern, a rose, a sunburst, rings or bands, so the picture reads from a distance. Each piece has a soft gradient with streaks and bubbles, and the lead between them has soldered joints.

<GenArtDemo series="mosaic" />

Credits: Georgy Voronoi (1908), Stuart Lloyd's algorithm (1982), Sutherland–Hodgman clipping.

### Weave

A swatch of cloth. Warp ribbons run down, weft ribbons run across, and at each crossing a weave structure decides which one is on top: plain weave, twill or herringbone, basket, satin, or a draft generated the way a hand loom is set up, with a threading, a treadling and a tie-up. The ribbons rise over the crossings they cover and dip under the others, with shadows. Coloured stripes are mirrored about a pivot like tartan setts, though none copies a real tartan. The cloth can bend or ripple, and its ends can fray.

<GenArtDemo series="weave" />

Credits: the weave structures and loom draft notation of hand weavers, later automated by Jacquard's punched cards.

### Asemic

Every hash invents a script. Twenty to forty glyphs are built from a small set of strokes under the rules of one hand: looped, angular, geometric, or hanging from a headline. A lexicon is drawn from that alphabet, with a few letters and words much more frequent than the rest, and written out as prose, columns, a spiral, or a codex page with a large initial. The pen trembles, runs dry and is dipped again. It looks like writing, and none of it can be read.

<GenArtDemo series="asemic" />

Credits: asemic writing, a long practice of calligraphers and poets. Strokes are centripetal Catmull–Rom splines (Barry and Goldman, 1988), and the frequencies follow a Zipf-like law. No real script is copied and no font is used.

### Reaction

Two chemicals share a dish. One is fed in steadily, the other feeds on it and slowly decays. The hash places a few drops (blobs, beaded strokes, a ring, specks), then the Gray–Scott equations run for a fixed number of steps. Depending on the feed and kill rates, the drops become spots, mazes, worms or cells that keep dividing, and the rates can drift across the dish to show one regime turning into another. The result is printed as two-colour ink, as a relief, or as contour bands.

<GenArtDemo series="reaction" />

Credits: Alan Turing's [paper on morphogenesis](https://doi.org/10.1098/rstb.1952.0012) (1952), Peter Gray and Stephen K. Scott's reaction (1983–1985), John E. Pearson's [map of its patterns](https://arxiv.org/abs/patt-sol/9304003) (1993), and Karl Sims's tutorial for the Laplacian kernel.

### Marbling

Paper marbling floats ink on a bath and works it with a stylus or a rake. Here the bath is maths: each ink drop is an exact circle that pushes every earlier boundary outwards, a rake drags the ink along its tines, a wavy comb makes bouquets, a stylus turned in place makes the spirals of the nightingale's nest. Each boundary is a polygon, and an edge that stretches too far is refined from its own pre-image, so the curves stay smooth. Every move is one-to-one, so two inks never cross. The traditional patterns are written as sequences of these moves.

<GenArtDemo series="marbling" />

Credits: Lu, Jaffer, Jin, Zhao and Mao, "Mathematical Marbling" (2012), and Aubrey Jaffer's [marbling notes](https://people.csail.mit.edu/jaffer/Marbling/); the Turkish ebru tradition, European comb patterns and Japanese suminagashi.

### Harmonograph

A pen and a small table hang from pendulums. Two swing at right angles; sometimes a third moves the table in an ellipse, a fourth adds a second swing on each axis, or the table turns. Their frequencies sit near a musical interval, never exactly on it, so the figure slowly turns as it is drawn. Friction shrinks every swing and the line spirals inwards. The pen presses less as the run goes on, and some pieces have a second or third run in another ink.

<GenArtDemo series="harmonograph" />

Credits: Hugh Blackburn's compound pendulum (1844) and the Victorian parlour harmonograph; Jules Antoine Lissajous's figures (1857), the undamped case.

### Girih

Star patterns. The program starts from a tiling by regular polygons (squares, hexagons, octagons with squares, dodecagons with triangles, and a few others). From the middle of every edge, two rays leave at the same angle and stop where they meet the rays of the next edge. Then the tiling is erased, and each tile is left with a star and each vertex with a rosette. The lines are drawn as interlaced straps going over and under, as glazed pieces in grout, or as a fine drawing over the faint tiling. A narrow angle gives open stars, a wide one sharp points.

<GenArtDemo series="girih" />

Credits: the star patterns of Islamic geometric art, borrowed for their geometry only (no inscriptions, original palettes), E. H. Hankin's "polygons in contact" method (1925) and Craig S. Kaplan's generalisation (2005).

## Licences

The artworks are mine and licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/): you can share them with credit, not sell them or publish modified versions. The code is in the [site repository](https://github.com/Alexvolkihar/alexvolkihar.me), under the MIT licence, like the rest of the site. The randomness code follows Camille Roux's genart skill, also MIT.

I wrote the code with an AI assistant. Every piece is drawn by that code, line by line and pixel by pixel. There are no AI-generated images anywhere in the section.

## What's next

More series, and more numbered pieces in the collection as I find them while browsing seeds.

The section is at [/genart](/genart). If a piece in this post caught your eye, the **Open the series** button keeps its hash.
