# Generative art series

Each file in `series/` default-exports one series (see `types.ts`); its page lives in `pages/genart/<slug>.md`. The registry in `index.ts` picks them up automatically.

## Known limitations

Status as of 2026-11-13, after the review pass on every series listed below. Each entry is a weakness seen on the contact sheets or in measurements and not fixed yet. Timings were taken while about ten agents were rendering at the same time (load average 6 to 15), so they are pessimistic. The budget is 250 ms for a 600×600 render, because the `/genart` index renders every cover at once.

### Aftershock

- A piece with only a few shocks on a fine Ruled or Rings surface stays quiet: the field dominates and the shocks read as thin cracks.
- 8K exports (7680×4320) take 7 to 9 s on the heaviest Patchwork/Swarm cases.

### Bristle

- 8K exports take 1.9 to 2.8 s.

### Caustics

- Pebbles with Soft focus in the Aqua palette stay the palest and softest pieces. This is intended (soft focus), but they are the weakest of the series.
- 8K exports take 3.5 to 4.7 s.

### Collapse

- The slowest piece (a fine, balanced, free pipes layout) takes up to about 175 ms at 600 px.

### Dunes

- Close-up dunes in the low-angle views, especially on Mars, are still slightly soft: the wind simulation runs on a coarse grid.
- Dunes is the slowest series at 600 px: about 145 to 160 ms on average, 200 to 225 ms in the worst case. It stays under the 250 ms budget, without much margin. Most of the time goes into the fixed sand simulation (about 80 ms for dense sand).

### Floorplan

- A few wide canvases still get a single front elevation beside the plan; it is drawn large, but the sheet is less rich than the ones that pair two drawings.

### Galaxy

- Ellipticals in the Ultraviolet palette are mostly a glowing ball: shells and blue globular clusters are barely visible.

### Kaleido

- With misregistration, faint light lines can show along the mirror edges (visible only when zoomed in).
- Busy Rings and Hexagonal pieces are the slowest, about 3 s at 8K.

### Rosette

- When a big ringed planet is the hero of a solar system, its ring is slightly cropped by the frame in about 5% of the pieces.

### Strands

- Renders became slower after the gap refill and the extra dots: 85 ms median at 600 px, 2.3 to 3 s at 8K.

### Wash

- Islands still read a little like an eye (an oval with a rim in the middle of the river).
- The paper texture is one shared tile. It is turned and shifted per piece, but still repeats about once per short side.
- 8K exports take 5 to 9 s.

### Ramify

- No known visual weakness after the review pass. 8K exports take 0.6 to 1.9 s.
