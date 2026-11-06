---
title: "Generative art: eighteen more series"
date: 2026-11-09T00:00:00Z
lang: en
art: random
image: /og/genart.png
duration: 15min
description: The generative art section now has thirty-two series. This post goes through the eighteen that the first one did not cover, each with its algorithm in plain words, its credits and a live demo you can reseed, and explains what the last eight borrow from long-form work like Camille Roux's.
---

> **English Version** | [Version Française](/posts/genart-series-2-fr) | [日本語版](/posts/genart-series-2-ja)

The [first post](/posts/genart) about the [generative art](/genart) section covered its first fourteen series. The section now has thirty-two, and this post goes through the eighteen it did not cover.

Nothing has changed in how they are made. Every piece comes from one hash, the randomness follows Camille Roux's [genart skill](https://github.com/camilleroux/genart-skill), and your browser draws the piece with plain Canvas 2D when the page opens. The first post explains all of that, so this one goes straight to the series. Each section has a live piece: **Reseed** draws a new random one, and **Open the series** opens the series page on that exact piece.

## The second half: rules left to run

The last eight series, from Pelt to Patent, have a common aim. I admire the long-form work of [Camille Roux](https://art.camilleroux.com), whose genart skill already sets the rules of this section: simple local rules are left to run, the image comes out of the process rather than from a layout drawn by hand, and it is often built from a very large number of small marks. I wanted to try working that way.

In these eight, the composition is mostly the result of a process. The coat in Pelt comes from pigment cells that switch each other on and off, then from tens of thousands of hairs. Crackle is a network of cracks that stop when they meet. Meander is agents walking a lattice until they are stuck, and Swarm is a Reynolds boids simulation recorded as a long exposure. Bloom paints each petal in dozens of nearly transparent layers. Orbits, Isolines and Patent are less of a simulation: a grammar picks one ring after another, a distance field is cut into level lines, a machine is assembled one part at a time from parts that have to fit.

They are original series. None of them reproduces one of his works, and the only thing they take from him directly is the genart skill credited on every page. Bloom has another debt, which is technical: its watercolour is the layering technique Tyler Hobbs published as a public tutorial, [A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art), written again from his description.

## The series

In the order of the [index](/genart), after Girih.

### Moiré

Two or three regular gratings are printed on top of each other: parallel lines, rings, spokes, waves or a spiral. Each one is set slightly out of step with the one below it, turned by a few degrees, shifted, stretched or bent. No grating contains a large shape. The large bands you see appear where the stripes fall in and out of step: bars, hyperbolas, circles, pinwheels. On light paper the inks overprint like a risograph print, and on dark grounds the light stripes add up. Small canvases are drawn at two or three times their size and filtered down, so that the stripes do not alias into false fringes.

<GenArtDemo series="moire" />

Credits: Gerald Oster and Yasunori Nishijima, "Moiré Patterns" (_Scientific American_, 1963), and Isaac Amidror, _The Theory of the Moiré Phenomenon_ (2000). The rotation between two line gratings comes from the fringe-spacing formula, pitch / (2 sin(angle / 2)).

### Phyllotaxis

A sunflower places each new floret about 137.5° past the previous one, the golden angle, and a little further out. After a few hundred florets, two families of crossing spirals appear, and their counts are consecutive Fibonacci numbers: 21 and 34, or 34 and 55. Each piece grows one head, a pair, a cluster or a whole field from that rule, with florets drawn as seeds, petals, pine-cone scales, dots or the spiral lattice itself. Most heads use the golden angle. Some drift slightly off it, some use the Lucas angle of about 99.5°, and a rare few use a fraction close to golden, which breaks the spirals into straight spokes.

<GenArtDemo series="phyllotaxis" />

Credits: H. Vogel's model of the sunflower head (1979), the observations of Schimper, Braun and the Bravais brothers in the 1830s, and chapter 4 of Prusinkiewicz and Lindenmayer, [The Algorithmic Beauty of Plants](http://algorithmicbotany.org/papers/#abop) (1990).

### Growth

A small closed loop is seeded in the frame, or a pair, a colony, two nested rings, or a rim that hugs the wall. At every step each point is pushed away from the points around it and pulled towards its two neighbours, and the line gets longer where it grows fastest. It cannot cross itself, so the extra length has to fold: lichen rims, brain-coral mazes, fat lobes. The growth is recorded along the way, then drawn as filled growth rings, a ridged band, a time-lapse of contours or an inlay. The simulation uses only additions, multiplications, divisions and square roots, so it grows the same way in every browser.

<GenArtDemo series="growth" />

Credits: the differential line algorithm as described by Anders Hoff in [Differential Line](https://inconvergent.net/generative/differential-line/) and by Jason Webb in his [2D differential growth experiments](https://github.com/jasonwebb/2d-differential-growth-experiments), and the buckling of tissues that grow faster at their rim (Sharon, Marder and Swinney, 2004).

### Stipple

The subject is computed from the hash, never taken from a photograph: a lit orb resting on its shadow, folds of hanging cloth, a nebula, a turned vase or a nautilus shell. A few thousand points are scattered over it, more where it is dark, then moved again and again towards the centre of mass of the ink they cover until the grain is even. They are printed as dots, or threaded into one unbroken line that passes every point once and folds tightly in the dark areas, or both.

<GenArtDemo series="stipple" />

Credits: Adrian Secord, [Weighted Voronoi Stippling](https://www.cs.ubc.ca/labs/imager/tr/2002/secord2002b/) (2002), built on Stuart Lloyd's algorithm, and the [TSP Art](https://archive.bridgesmathart.org/2005/bridges2005-301.html) of Craig S. Kaplan and Robert Bosch (2005), with the tour shortened by 2-opt moves (G. A. Croes, 1958).

### Penrose

Thick and thin rhombs, or kites and darts, in a tiling that never repeats. It is grown by deflation: a five-fold "sun" much larger than the canvas is cut into Robinson triangles, then every triangle is replaced by two or three smaller ones, each step shrinking them by the golden ratio, until the tiles reach the size the hash asks for. Some pieces sit exactly on the five-fold centre and others drift away from it. The tiles are coloured by type, by orientation, by the larger tile they came from or by decagonal rings, and some carry the matching arcs that join into closed rings and endless worms.

<GenArtDemo series="penrose" />

Credits: Roger Penrose's tiles (1974), popularised by Martin Gardner in _Scientific American_ (1977); Robinson triangles as described by Grünbaum and Shephard in _Tilings and Patterns_ (1987); the matching arcs of Penrose and John H. Conway, whose curves Conway called worms.

### Arbor

Each plant starts as a single letter. A small grammar rewrites it again and again, picking each rule with its own weight, until the word describes a weed, a tree, a fern or an umbel. A turtle then reads the word: it draws a branch for each step, turns, saves its place at each fork and comes back to it, and thins its stroke as the branches divide. The wind bends the twigs more than the trunk, and the season decides whether the last buds become leaves, flowers, berries or nothing. The plants are mounted like a herbarium: one specimen on its sheet, a plate of numbered variations, or a meadow.

<GenArtDemo series="arbor" />

Credits: Aristid Lindenmayer's L-systems (1968), in the stochastic and bracketed forms of Prusinkiewicz and Lindenmayer's _The Algorithmic Beauty of Plants_ (1990), with the branching models of H. Honda and of Aono and Kunii. The cyanotype palette is a nod to Anna Atkins's plates (1843–1853).

### Automata

A grid of cells under one local rule, worked as cloth. A one-dimensional rule starts from a row, and each generation becomes the next row down. A two-dimensional rule starts from a random soup, often mirrored, and runs for a few dozen to a few hundred generations. Rules that end up blank, flat, striped or as plain noise are thrown out, and the next rule is drawn from the same stream. Each cell then becomes a cross-stitch, a knitted stitch, a loom bead or a quilt patch, coloured by its state and its age.

<GenArtDemo series="automata" />

Credits: Stephen Wolfram's elementary and totalistic automata (1983, 1984), John Horton Conway's Game of Life and the Life-like rules collected in Mirek Wójtowicz's MCell catalogue, and David Griffeath's cyclic automaton, studied with Robert Fisch and Janko Gravner (1991).

### Hilbert

One line that passes through every cell of a square. Each piece draws one of five classic curves, Hilbert, Moore, Peano, Sierpinski or Gosper (which fills a hexagonal island), by repeated subdivision. At an adaptive order, a noise field decides where to subdivide further, so the line packs tight in some places and opens into wide loops elsewhere while remaining a single line. It is drawn as plain ink, as a gradient with a slowly swelling width, as a hollow ribbon, as three orders of the same curve stacked, or as two or three copies interleaved.

<GenArtDemo series="hilbert" />

Credits: the curves of Giuseppe Peano (1890), David Hilbert (1891), E. H. Moore (1900) and Wacław Sierpiński (1912), and Bill Gosper's flowsnake, published by Martin Gardner (1976).

### Isometric

A small district is planned on a square grid and set on a plinth like a model: a town with a square and a fountain, terraces joined by flights of steps, an island with a lighthouse and a jetty, a quarter of canals and arched bridges, or a walled citadel. Every cell gets a height and at most one thing: a block with a flat, hipped, gabled or domed roof, a tower, a few trees, a stair, an arch. Nothing copies a real place. The district is drawn from back to front, every box in three tones, and the shadows are computed from the buildings that cast them. At night some windows are lit.

<GenArtDemo series="isometric" />

Credits: true isometric projection; the painter's algorithm in order of i + j; shadows swept along the light direction (a Minkowski sum built with Andrew's monotone chain) and clipped with the Sutherland–Hodgman algorithm.

### Knots

A plait of diagonal strands that cross at the middle of every edge of a square grid. Breaks are placed on the grid lines. Where a strand meets one, it turns back instead of crossing, and the plait becomes knotwork, with borders, corner terminals and closed loops. Every strand goes over, under, then over again all the way round, whatever the breaks. A piece is a single panel, a panel inside a knotwork border, a sampler of small panels, or a torus knot in a medallion, and the strands are drawn as tubes, split ribbons, flat bands or carving.

<GenArtDemo series="knots" />

Credits: George Bain's method of construction (1951), after J. Romilly Allen (1903), in the formulation of Peter R. Cromwell, "Celtic Knotwork: Mathematical Art" (1993). Insular knotwork is borrowed for its construction only, and no panel copies a historical one.

### Pelt

A patch of skin laid along a spine: a close-up of a back, a flank, or a whole body curled up with its tail wrapped around. Pigment cells switch each other on over short distances and off over longer ones, and from that rule alone the coat settles into spots, rosettes, stripes, a reticulated net or piebald patches. On a narrow tail the same rule can only make rings. Then tens of thousands of hairs grow. Each takes the pigment at its root and follows a combing field that parts along the spine, droops down the flanks and swirls around the whorls, and the hairs that lie across the light catch a sheen.

<GenArtDemo series="pelt" />

Credits: Alan Turing, [The Chemical Basis of Morphogenesis](https://doi.org/10.1098/rstb.1952.0012) (1952); J. D. Murray's work on coat patterns (1981, 1988), including the argument about tails; D. A. Young's activator–inhibitor model (1984); the two-stage rosettes of Liu, Liaw and Maini (2006); the sheen term of Kajiya and Kay's hair model (1989).

### Crackle

A layer that shrinks as it dries breaks into cells. Here each crack is a small agent: it leaves an older crack at about a right angle, wanders a little, turns to meet the next crack square on and stops there. A crack is kept only if the space it cuts is wider than a spacing set by the thickness of the layer, so the cells come out even, and finer where the layer is thin. The first cracks cross the whole slab and stay the widest. The cells are then finished as crackle glaze with dark and golden lines, flakes of old varnished paint, curled clay tiles or facets of ice.

<GenArtDemo series="crackle" />

Credits: Jared Tarbell's [Substrate](http://www.complexification.net/gallery/machines/substrate/) (2003), written again here with wandering, square-on meeting and the spacing rule; the crack hierarchies studied by Bohn, Pauchard and Couder (2005); the "iron wire and golden thread" crackle of Song dynasty Ge ware.

### Meander

The canvas is divided into rooms, each with a square lattice, where agents turn by 90°, or a triangular one, where they turn by 60° or 120°. Agents walk from node to node, never cross any path, and stop at walls and at a few round stones. A serpentine agent ploughs back and forth, a spiral agent always turns the same way, a key agent replays a short turtle program (a Greek-key hook, battlements, a spirolateral), and a wandering agent turns at random. When every agent is stuck, a new one starts on each free node, so each room ends up packed with parallel corridors. They are drawn as channels, double lines, broad-nib strokes or circuit traces with drilled pads.

<GenArtDemo series="meander" />

Credits: the Greek fret and the boustrophedon, borrowed as motifs only; the turtle geometry of Seymour Papert's Logo, as described by Abelson and diSessa (1980); Frank C. Odds's spirolaterals (1973).

### Isolines

A figure is assembled from circles, boxes, capsules and triangles, merged with soft unions, cut by subtractions or hollowed into shells. A signed distance field gives, at every point of the sheet, the distance to the figure's outline, and the series draws its level lines in a fixed rhythm (a few lines, then a band), so that the figure echoes out to the edges of the paper and in to its core. The bands are left blank, hatched or filled. Then a few events disturb the field locally: a seam where the lines step out of phase, a fold, a ripple.

<GenArtDemo series="isolines" />

Credits: Inigo Quilez's articles on [2D distance functions](https://iquilezles.org/articles/distfunctions2d/) and the [smooth minimum](https://iquilezles.org/articles/smin/); marching squares, the 2D case of Lorensen and Cline's marching cubes (1987).

### Orbits

Rings are stacked around a centre, from the inside out. A small grammar picks the next one each time: a groove of hairlines, a dashed ring, a dial scale, a few broken arcs, a dotted spiral, a gear rim, a string of beads or a solid band. The phases line up, twist into a swirl or fall anywhere. Past its nominal radius the stack carries on, fainter, to the farthest corner, so it fills a canvas of any shape. Satellites sit on some rings, and eccentric orbits cross the stack with their bodies placed at equal steps of time, so they crowd together far from the focus. The layout is one system, a binary pair, a planet with its moons, a system centred near a corner, or a stack that drifts off-centre.

<GenArtDemo series="orbits" />

Credits: an original ring grammar that borrows the look of astrolabes, dials and orreries without copying any of them; Kepler's first two laws (1609), with [Kepler's equation](https://en.wikipedia.org/wiki/Kepler%27s_equation) solved by Newton's method; dots spaced along an Archimedean spiral.

### Bloom

One petal shape, round, pointed, notched, fringed or long like a ribbon, is repeated three to twelve times around a centre, in one to four whorls. No brush is involved. Each petal is a small polygon whose edges are split again and again, each new point nudged by a random amount, and the result is filled dozens of times at a few percent opacity, deformed anew each time. The layers agree in the middle and disagree at the rim, so a petal gets a dense core and a soft, bleeding edge, and neighbouring petals blend where their layers overlap. Stamens, leaves, stems and the washes on the paper are painted the same way.

<GenArtDemo series="bloom" />

Credits: the layered translucent polygons described by Tyler Hobbs in [A Guide to Simulating Watercolor Paint with Generative Art](https://www.tylerxhobbs.com/words/a-guide-to-simulating-watercolor-paint-with-generative-art) (2017), implemented independently here and applied to petals; recursive midpoint displacement after Fournier, Fussell and Carpenter (1982); Sighack's tutorial [Generative Watercolor in Processing](https://sighack.com/post/generative-watercolor-in-processing) on the same technique.

### Swarm

A few hundred to a few thousand boids swim for 280 steps under three local rules: keep clear of close neighbours, match their heading, drift towards their centre. Nothing is drawn while they move. The piece is a long exposure of the whole run. Every trail is thin and translucent, so the places the school passed often build up like light on film. A shoal follows a stream round rocks, predators cut a river of boids open, schools mill round vortices, or lanes of migrants cross each other. A rear-curtain flash can freeze every boid at the end, or a strobe can catch them several times along the way.

<GenArtDemo series="swarm" />

Credits: Craig Reynolds, [Flocks, Herds, and Schools](https://www.red3d.com/cwr/boids/) (1987) and [Steering Behaviors For Autonomous Characters](https://www.red3d.com/cwr/steer/) (1999); the textbook potential flow past a cylinder for the stream round the rocks.

### Patent

A patent-office sheet for a machine that was never built. The machine is assembled one part at a time, each part attached to one already on the sheet. A gear meshes with another at the sum of their pitch radii, a belt runs on the tangents of two pulleys, a roller follower rides a cam, a crank drives a piston or a walking beam, a clock train ends in an escapement and a pendulum. A part that would overlap anything it is not attached to is rejected. Fig. 1 shows the machine with heavy shade lines on the edges turned away from the light, and some sheets add an exploded arbor and an enlarged tooth mesh. The inventor, title, number and date are invented, and the lettering is drawn with a small stroke font written for the series.

<GenArtDemo series="patent" />

Credits: the drafting conventions of nineteenth-century patent drawings; involute gear teeth (Euler in the 1750s, Robert Willis's _Principles of Mechanism_, 1841); Grashof four-bar linkages and their coupler curves (Hrones and Nelson, 1951).

## Thirty-two series

Here are all of them, in the order of the index. Each thumbnail opens its series page.

<GenArtStrip />

[The collection](/genart/collection) works as before. It holds the pieces I chose to keep, numbered in the order they joined, and a piece from any of the thirty-two series can join it. Every featured piece can be downloaded in eight ratios, from Full HD to 8K or at a custom size, as PNG, JPEG or WebP. Downloaded files carry the small monogram in their bottom-right corner, and PNG files also carry the title, author, licence and source URL. The pieces shown on the pages are never signed.

## Licences

The artworks are mine and licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/): you can share them with credit, but not sell them or publish modified versions. The code is in the [site repository](https://github.com/Alexvolkihar/alexvolkihar.me) under the MIT licence.

As with the first fourteen, I wrote the code with an AI assistant. Every piece is drawn by that code, and there are no AI-generated images anywhere in the section.

The section is at [/genart](/genart). If a piece in this post caught your eye, **Open the series** keeps its hash.
