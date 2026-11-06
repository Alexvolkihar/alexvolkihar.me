// "Truchet" — winged multi-scale Truchet tiles on a quadtree.
//
// The canvas is cut into a grid of squares and each square is split into
// four, recursively, by a hash-chosen rule: plain chance, a drifting noise
// field, distance to a few focal points, or the outline of a shape that the
// tiles fill (Carlson's "subdivision fill"). Every resulting square receives
// one of the fifteen winged motifs of Christopher Carlson's "Multi-Scale
// Truchet Patterns" (Bridges 2018). Each step down in scale inverts the two
// colours and the smaller tiles are laid on top, so the domains stay
// continuous across scales (see ../truchet/tiles.ts). A colour ladder can
// also shift the pair at every scale, or a gradient can tint the ink.
//
// Everything is a pure function of the hash; every length is a fraction of
// the canvas short side. Per-tile choices hash the integer cell coordinates
// instead of drawing from a stream, so a wider canvas shows more of the same
// tiling around the same centre.

import type { MotifName, Tile } from '../truchet/tiles'
import type { Series } from '../types'
import { range, stream, weighted } from '../random'
import { cellRandom, makeNoise, smoothstep } from '../truchet/field'
import { drawScale, MOTIFS } from '../truchet/tiles'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Ink', 22], ['Indigo', 20], ['Terracotta', 18], ['Sage', 15], ['Night', 15], ['Saffron', 10]],
  Motifs: [['Smith arcs', 25], ['Frowns', 20], ['Bars', 15], ['Junctions', 15], ['All fifteen', 25]],
  Structure: [['Scattered', 25], ['Drifts', 30], ['Focus', 20], ['Silhouette', 25]],
  Colour: [['Two-tone', 50], ['Ladder', 30], ['Gradient', 20]],
  Scale: [['Coarse', 25], ['Medium', 50], ['Fine', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Motifs: weighted(r, TRAITS.Motifs),
    Structure: weighted(r, TRAITS.Structure),
    Colour: weighted(r, TRAITS.Colour),
    Scale: weighted(r, TRAITS.Scale),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original). `grad` tints the ink in the Gradient colourway: with
// 'lighten' on light papers every stop is darker than the paper on all three
// channels, with 'darken' on the dark one every stop is lighter, so the paper
// itself is never touched.
// ---------------------------------------------------------------------------

interface Palette {
  paper: string
  ink: string
  accents: readonly [string, string]
  grad: readonly [string, string, string]
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Ink: { paper: '#f1ebdd', ink: '#171615', accents: ['#b8432f', '#d9a441'], grad: ['#1c2b4a', '#9b2f2a', '#c7861f'], dark: false },
  Indigo: { paper: '#ece8de', ink: '#1d2c55', accents: ['#e0a33a', '#7ea7c4'], grad: ['#1d2c55', '#2f6f8f', '#b8573a'], dark: false },
  Terracotta: { paper: '#f2e4d0', ink: '#7a2d1c', accents: ['#d98a52', '#2f4b47'], grad: ['#5a1f14', '#b5532f', '#2f4b47'], dark: false },
  Sage: { paper: '#e7ebe1', ink: '#24392f', accents: ['#8fae8b', '#c9723f'], grad: ['#24392f', '#4e7a63', '#a4652f'], dark: false },
  Night: { paper: '#101218', ink: '#e8dcc0', accents: ['#d4a648', '#5a7bb0'], grad: ['#e3b55a', '#d5684a', '#6f9fd0'], dark: true },
  Saffron: { paper: '#f6e7b8', ink: '#2a1f3d', accents: ['#d2462f', '#2c6e86'], grad: ['#2a1f3d', '#b03a2e', '#1f5f73'], dark: false },
}

const MOTIF_SETS: Record<Features['Motifs'], readonly MotifName[]> = {
  'Smith arcs': ['\\', '/'],
  'Frowns': ['fne', 'fsw', 'fnw', 'fse', '\\', '/'],
  'Bars': ['-', '|', '+', '+.'],
  'Junctions': ['tn', 'ts', 'te', 'tw', 'x.', '+'],
  'All fifteen': Object.keys(MOTIFS) as MotifName[],
}

/** Root squares along the short side, and how many times they may split. */
const SCALE: Record<Features['Scale'], { cells: number, depth: number }> = {
  Coarse: { cells: 3, depth: 4 },
  Medium: { cells: 5, depth: 3 },
  Fine: { cells: 8, depth: 3 },
}

/** Split probability per depth for the Scattered structure. */
const SCATTER = [0.62, 0.5, 0.4, 0.32, 0.25]

const SHAPES = ['disc', 'ring', 'twin', 'square', 'arch'] as const
type Shape = typeof SHAPES[number]

/** Signed distance to the Silhouette shape, in short-side units around the centre. */
function shapeDistance(shape: Shape, x: number, y: number, angle: number): number {
  if (shape === 'disc')
    return Math.hypot(x, y) - 0.36
  if (shape === 'ring')
    return Math.abs(Math.hypot(x, y) - 0.27) - 0.14
  if (shape === 'twin') {
    const ax = Math.cos(angle) * 0.15
    const ay = Math.sin(angle) * 0.15
    return Math.min(Math.hypot(x - ax, y - ay), Math.hypot(x + ax, y + ay)) - 0.25
  }
  if (shape === 'square') {
    const qx = Math.abs(x) - 0.2
    const qy = Math.abs(y) - 0.2
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 0.1
  }
  // arch: a disc on top of a box, like a window or a tombstone
  const yy = y + 0.03
  const qx = Math.abs(x) - 0.27
  const qy = Math.abs(yy - 0.165) - 0.215
  const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  return Math.min(box, Math.hypot(x, yy + 0.05) - 0.27)
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const scale = SCALE[f.Scale]
  const motifs = MOTIF_SETS[f.Motifs]
  const silhouette = f.Structure === 'Silhouette'
  const S = Math.min(W, H)
  const cx = W / 2
  const cy = H / 2

  // Streams, always created and consumed in the same order.
  const nr = stream(hash, 'noise')
  const splitNoise = makeNoise(nr)
  const motifNoise = makeNoise(nr)
  const tileSeed = Math.floor(stream(hash, 'tiles')() * 4294967296)
  const lr = stream(hash, 'layout')
  const invert = lr() < (silhouette ? 0.6 : 0.3)
  const ladder = lr() < 0.5 ? 3 : 4
  const coherence = range(lr, 0.3, 0.85)
  const motifFreq = range(lr, 1.2, 3.2)
  const splitFreq = range(lr, 1.0, 2.6)
  const busy = range(lr, 0.85, 1.15)
  const ox = range(lr, 0, 64)
  const oy = range(lr, 0, 64)
  const foci = Array.from({ length: 3 }, () => [range(lr, -0.32, 0.32), range(lr, -0.32, 0.32)] as const)
    .slice(0, 1 + Math.floor(lr() * 3))
  const focusR = range(lr, 0.22, 0.42)
  const focusInvert = lr() < 0.35
  const shape = SHAPES[Math.floor(lr() * SHAPES.length)]
  const shapeAngle = lr() * Math.PI * 2
  const gradAngle = lr() * Math.PI * 2
  const gradShift = Math.floor(lr() * 3)

  // Colour of each scale: scale d is drawn `bg = C[d]` with `fg = C[d + 1]`,
  // so the next scale's ground is always this scale's ink.
  const colours = f.Colour === 'Ladder'
    ? [pal.paper, pal.ink, ...pal.accents].slice(0, ladder)
    : [pal.paper, pal.ink]
  const off = invert ? 1 : 0
  const colourAt = (d: number) => colours[(d + off) % colours.length]

  // Frame: a paper margin around a full-bleed panel, or the bare paper
  // around a Silhouette.
  const margin = silhouette ? 0 : 0.05 * S
  const inner = S - 2 * 0.05 * S
  const cell = inner / scale.cells
  const odd = scale.cells % 2 === 1 ? 0.5 : 0
  const ix0 = Math.floor((margin - cx) / cell - odd) - 1
  const ix1 = Math.ceil((W - margin - cx) / cell - odd) + 1
  const iy0 = Math.floor((margin - cy) / cell - odd) - 1
  const iy1 = Math.ceil((H - margin - cy) / cell - odd) + 1

  const maxD = scale.depth
  const levels: Tile[][] = Array.from({ length: maxD + 1 }, () => [])

  // Split probability of a square of side `s` (pixels) centred at (nx, ny)
  // in short-side units.
  // The Drifts field is stretched to its own range over the central square,
  // so every piece runs from coarse to fine whatever the noise offset.
  const drift = (nx: number, ny: number) => splitNoise(nx * splitFreq + ox, ny * splitFreq + oy)
  let dLo = Infinity
  let dHi = -Infinity
  for (let j = 0; j <= 16; j++) {
    for (let i = 0; i <= 16; i++) {
      const v = drift(i / 16 - 0.5, j / 16 - 0.5)
      dLo = Math.min(dLo, v)
      dHi = Math.max(dHi, v)
    }
  }
  const dSpan = Math.max(1e-3, dHi - dLo)

  const splitChance = (nx: number, ny: number, d: number) => {
    if (f.Structure === 'Scattered')
      return busy * SCATTER[d]
    let t: number
    if (f.Structure === 'Drifts') {
      t = smoothstep(0.1, 0.9, (drift(nx, ny) - dLo) / dSpan) ** 1.5
    }
    else {
      let dmin = Infinity
      for (const [fx, fy] of foci)
        dmin = Math.min(dmin, Math.hypot(nx - fx, ny - fy))
      t = Math.exp(-((dmin / focusR) ** 2))
      if (focusInvert)
        t = 1 - t
      t = t ** 1.3
    }
    // t = 1 reaches the finest scale only here and there, never wholesale;
    // the 0.9 cap leaves a few larger tiles even in the finest regions
    return Math.min(0.9, Math.max(0, busy * (0.2 + t * (maxD + 0.1) - d)))
  }

  const chooseMotif = (nx: number, ny: number, ix: number, iy: number, d: number): MotifName => {
    if (cellRandom(tileSeed, ix, iy, d, 2) < coherence) {
      // regions of one motif: the emergent wallpaper of single-motif tilings
      const n = motifNoise(nx * motifFreq + oy, ny * motifFreq + ox)
      const u = Math.min(0.9999, Math.max(0, (n - 0.2) / 0.6))
      return motifs[Math.floor(u * motifs.length)]
    }
    return motifs[Math.floor(cellRandom(tileSeed, ix, iy, d, 3) * motifs.length)]
  }

  const visit = (x: number, y: number, s: number, d: number, ix: number, iy: number) => {
    const nx = (x + s / 2 - cx) / S
    const ny = (y + s / 2 - cy) / S
    let split: boolean
    if (silhouette) {
      // Carlson's subdivision fill, tested on the winged square (the tile
      // plus s/3 all round) so the wings never overhang the outline unevenly.
      const dist = shapeDistance(shape, nx, ny, shapeAngle)
      const reach = (s / S) * (0.5 + 1 / 3) * Math.SQRT2
      if (dist > reach)
        return
      if (dist < -reach)
        split = d < maxD && cellRandom(tileSeed, ix, iy, d, 1) < busy * SCATTER[d + 1] * 0.8
      else if (d < maxD)
        split = true
      else if (dist >= 0)
        return
      else
        split = false
    }
    else {
      split = d < maxD && cellRandom(tileSeed, ix, iy, d, 1) < splitChance(nx, ny, d)
    }
    if (split) {
      const h = s / 2
      visit(x, y, h, d + 1, ix * 2, iy * 2)
      visit(x + h, y, h, d + 1, ix * 2 + 1, iy * 2)
      visit(x, y + h, h, d + 1, ix * 2, iy * 2 + 1)
      visit(x + h, y + h, h, d + 1, ix * 2 + 1, iy * 2 + 1)
      return
    }
    // only squares that touch the panel are laid: the panel edge is then a
    // tile edge, without a fringe of wings from tiles outside it
    const eps = 1e-6 * S
    if (x + s <= margin + eps || y + s <= margin + eps || x >= W - margin - eps || y >= H - margin - eps)
      return
    levels[d].push({ x, y, s, ix, iy, motif: chooseMotif(nx, ny, ix, iy, d) })
  }

  for (let iy = iy0; iy <= iy1; iy++) {
    for (let ix = ix0; ix <= ix1; ix++)
      visit(cx + (ix + odd) * cell, cy + (iy + odd) * cell, cell, 0, ix, iy)
  }

  // --- drawing --------------------------------------------------------------
  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.paper
  g.fillRect(0, 0, W, H)
  g.beginPath()
  g.rect(margin, margin, W - 2 * margin, H - 2 * margin)
  g.clip()

  for (let d = 0; d <= maxD; d++)
    drawScale(g, levels[d], colourAt(d), colourAt(d + 1))

  if (f.Colour === 'Gradient') {
    // tint the ink only: the paper is lighter (or darker) on every channel
    const L = Math.hypot(W, H) * 0.5
    const dx = Math.cos(gradAngle) * L
    const dy = Math.sin(gradAngle) * L
    const grad = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy)
    for (let i = 0; i < 3; i++)
      grad.addColorStop(i / 2, pal.grad[(i + gradShift) % 3])
    g.globalCompositeOperation = pal.dark ? 'darken' : 'lighten'
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  g.restore()
}

export default {
  slug: 'truchet',
  title: 'Truchet',
  summary: 'Carlson\'s winged multi-scale Truchet tiles on a quadtree: arcs, bars, dots and junctions that invert their colours at every scale and still join up.',
  order: 520,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7c4e7c4e ("gallery" stream, 64-hex candidates): the
  // first hash found for each Structure x Palette pair, twelve pairs in the
  // order found, except that the second one found leads as the cover.
  gallery: [
    '0xe1b42349508fe333b20e839391feea3642982e0622aec26d421a68cc8f33efed',
    '0x4c2c40f6457564c7eb601d3ed484ec4df5b6c6c86dd61d6080a5becf5e33014f',
    '0x9450fd974dcdff59d937ed892d6752a0fc2ad3abb9058eabc731ee1e8d385a59',
    '0x84db7809bee28b1e4607b56a9dbde5e719202bd22da4bf77201935327a7d0559',
    '0xf61e403325764418fd23bfe8087f8f30ab7afc07caeb3bf43237e4594c07c996',
    '0x38c3f377f5b70e2d24e800ce986851d39f16106717928bc84942adc7be4d65fb',
    '0x244d93ba96d51b8c43e762828b4d39bc2d69bd5452d8c2584223832127c7c92f',
    '0x6351d5bab31d22b8ba2e88ae4c09db195a2f79ef3a317b4798bf6c9cb32bf474',
    '0xabb05d69b00aa5f5f7fd0fee77aaa7043c9273408c31975b2dbd6a90867dc7a9',
    '0x524ae0f723e2f96da9ccef1ec9e45c38219563e32be53b0ddff498f28e34f305',
    '0x24ca904a433962f15fe854c10169865b2667d81509b176a2db9c1327ba7400c6',
    '0x49ec28257c52775b0cf14b4c1f79de113ed2887297a175e3a602d2cac424d214',
  ],
} satisfies Series
