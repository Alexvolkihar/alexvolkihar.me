// "Reaction" — Gray–Scott reaction–diffusion, grown from a seeded sketch.
//
// A few drops of catalyst (blobs, strokes, a ring or a dusting of specks) are
// placed in a dish of substrate, then the Gray–Scott model is integrated for
// a fixed number of steps on a small grid (../reaction/sim.ts). Feed and kill
// rates come from known regions of Pearson's map (spots, labyrinths, worms,
// coral, mitosis, holes) and can drift across the dish from one regime to a
// neighbouring one, so a single piece shows the transition between them.
//
// The simulation never depends on the output size: it always runs on a grid
// of 108 cells on the short side, which is refined with a Catmull-Rom spline
// and then sampled per pixel. Edges are anti-aliased with the local gradient,
// so they stay one pixel wide at any size while the composition stays put. On
// a non-square canvas the dish grows along the long side (up to 3:1).

import type { Rng } from '../random'
import type { Series } from '../types'
import { int, pick, range, stream, weighted } from '../random'
import { axisMap, gradient, refine } from '../reaction/field'
import { grayScott, makeGrid } from '../reaction/sim'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Agar', 22], ['Cyanotype', 18], ['Kelp', 18], ['Ember', 16], ['Lichen', 14], ['Orchid', 12]],
  Regime: [['Spots', 18], ['Labyrinth', 22], ['Worms', 16], ['Coral', 18], ['Mitosis', 12], ['Holes', 14]],
  Gradient: [['Uniform', 45], ['Drift', 35], ['Radial', 20]],
  Render: [['Ink', 40], ['Relief', 35], ['Bands', 25]],
  Seed: [['Blobs', 35], ['Strokes', 25], ['Ring', 15], ['Dust', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }
type Regime = Features['Regime']

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Regime: weighted(r, TRAITS.Regime),
    Gradient: weighted(r, TRAITS.Gradient),
    Render: weighted(r, TRAITS.Render),
    Seed: weighted(r, TRAITS.Seed),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site). `ramp` runs from the bare substrate to
// the densest catalyst; `ink` and `accent` are the two plates of the print.
// ---------------------------------------------------------------------------

interface Palette {
  light: boolean
  bg: string
  ink: string
  accent: string
  ramp: readonly [string, string, string, string, string]
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Agar: { light: true, bg: '#eee6d6', ink: '#1f2526', accent: '#c8452c', ramp: ['#eee6d6', '#dcc9a8', '#b98b62', '#7d3b28', '#2a1d1a'] },
  Cyanotype: { light: false, bg: '#1b3f73', ink: '#eef3f5', accent: '#6fa6d6', ramp: ['#16365f', '#1f4d87', '#4f86bf', '#a9cde6', '#f2f6f8'] },
  Kelp: { light: false, bg: '#0c1815', ink: '#bfdca3', accent: '#e3b55b', ramp: ['#0c1815', '#143d34', '#2f735b', '#93c08a', '#e9ecc4'] },
  Ember: { light: false, bg: '#140b09', ink: '#f2903f', accent: '#8f2a17', ramp: ['#140b09', '#4c1711', '#a6361b', '#ee8c3b', '#ffe2a3'] },
  Lichen: { light: true, bg: '#e8e5d1', ink: '#3f4f26', accent: '#c58f33', ramp: ['#e8e5d1', '#c9cf9f', '#8b9a58', '#4a5c2c', '#24301a'] },
  Orchid: { light: false, bg: '#150f20', ink: '#eca9cb', accent: '#5fbfb4', ramp: ['#150f20', '#3c255b', '#81498f', '#dc86b4', '#fadbe9'] },
}

// ---------------------------------------------------------------------------
// Regimes: feed f and kill k for Karl Sims' scaling of the model (diffusion
// 1 and 0.5 at dt = 1), points of Pearson's and Munafo's f-k maps. Here the
// diffusion rates are scaled by 0.4 and dt is 2.5: the same patterns, a
// little finer, in 40% of the steps (dt * DA * 1.6 = 1.6 keeps the explicit
// scheme stable; dt = 3 already shows checkerboard ripples).
// ---------------------------------------------------------------------------

interface RegimeSpec {
  f: number
  k: number
  steps: number
  /** Neighbouring regimes a gradient may blend into. */
  partners: readonly Regime[]
}

const REGIMES: Record<Regime, RegimeSpec> = {
  Spots: { f: 0.025, k: 0.06, steps: 880, partners: ['Labyrinth', 'Mitosis'] },
  Labyrinth: { f: 0.029, k: 0.057, steps: 800, partners: ['Spots', 'Holes'] },
  Worms: { f: 0.052, k: 0.0635, steps: 1200, partners: ['Coral', 'Mitosis'] },
  Coral: { f: 0.0545, k: 0.062, steps: 1300, partners: ['Worms', 'Labyrinth'] },
  Mitosis: { f: 0.035, k: 0.0638, steps: 1200, partners: ['Spots', 'Coral'] },
  Holes: { f: 0.039, k: 0.058, steps: 800, partners: ['Labyrinth', 'Spots'] },
}

const GRID = 108 // cells on the short side
const MAX_ASPECT = 3
const REFINE = 4
const DA = 0.4
const DB = 0.2
const DT = 2.5

/** Unit vectors as literals: no trigonometry anywhere near the simulation. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.7071067811865476, 0.7071067811865476],
  [0, 1],
  [-0.7071067811865476, 0.7071067811865476],
  [-1, 0],
  [-0.7071067811865476, -0.7071067811865476],
  [0, -1],
  [0.7071067811865476, -0.7071067811865476],
  [0.9238795325112867, 0.3826834323650898],
  [0.3826834323650898, 0.9238795325112867],
  [-0.3826834323650898, 0.9238795325112867],
  [-0.9238795325112867, 0.3826834323650898],
]

// ---------------------------------------------------------------------------
// Seeds, in composition units: the short side spans 1, centred on 0.
// ---------------------------------------------------------------------------

// Seeds are discs: lines and rings are strings of beads, which survive in
// the spot regimes where a continuous stroke would simply fade away.
interface Disc { x: number, y: number, r: number }

/** A point of the [-1.5, 1.5] plane outside the central square (the flanks seen on wide canvases). */
function flankPoint(r: Rng): [number, number] | undefined {
  const x = range(r, -1.5, 1.5)
  const y = range(r, -1.5, 1.5)
  return Math.abs(x) < 0.5 && Math.abs(y) < 0.5 ? undefined : [x, y]
}

/** Beads along a segment of half-length `len` through (x, y), in direction d (a unit vector). */
function beadLine(out: Disc[], x: number, y: number, d: readonly [number, number], len: number, r: number, gap: number): void {
  const n = Math.max(1, Math.floor((2 * len) / (r * gap)))
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 - 1
    out.push({ x: x + d[0] * len * t, y: y + d[1] * len * t, r })
  }
}

// a 3.75° rotation (1/96 turn), applied by recurrence: rings need no trigonometry
const ROT_C = 0.9978589232386035
const ROT_S = 0.06540312923014306
const RING_DIVISORS = [2, 3, 4, 6, 8, 12] as const

/** Beads around a circle, starting in direction d. */
function beadRing(out: Disc[], x: number, y: number, d: readonly [number, number], radius: number, r: number, gap: number): void {
  const ideal = (96 * r * gap) / (2 * Math.PI * radius)
  let every: number = RING_DIVISORS[0]
  for (const k of RING_DIVISORS) {
    if (Math.abs(k - ideal) < Math.abs(every - ideal))
      every = k
  }
  let ux = d[0]
  let uy = d[1]
  for (let i = 0; i < 96; i++) {
    if (i % every === 0)
      out.push({ x: x + ux * radius, y: y + uy * radius, r })
    const nx = ROT_C * ux - ROT_S * uy
    uy = ROT_S * ux + ROT_C * uy
    ux = nx
  }
}

function seedDiscs(r: Rng, seed: Features['Seed']): Disc[] {
  const discs: Disc[] = []
  switch (seed) {
    case 'Blobs': {
      const n = int(r, 4, 10)
      for (let i = 0; i < n; i++)
        discs.push({ x: range(r, -0.4, 0.4), y: range(r, -0.4, 0.4), r: range(r, 0.025, 0.065) })
      for (let i = 0; i < 4 * n; i++) {
        const p = flankPoint(r)
        const rad = range(r, 0.025, 0.06)
        if (p)
          discs.push({ x: p[0], y: p[1], r: rad })
      }
      break
    }
    case 'Strokes': {
      const n = int(r, 3, 6)
      const gap = range(r, 2.4, 3)
      for (let i = 0; i < n; i++) {
        const x = range(r, -0.28, 0.28)
        const y = range(r, -0.28, 0.28)
        const d = pick(r, DIRS)
        beadLine(discs, x, y, d, range(r, 0.1, 0.3), range(r, 0.024, 0.032), gap)
      }
      for (let i = 0; i < 3 * n; i++) {
        const p = flankPoint(r)
        const d = pick(r, DIRS)
        const len = range(r, 0.1, 0.3)
        const rad = range(r, 0.024, 0.03)
        if (p)
          beadLine(discs, p[0], p[1], d, len, rad, gap)
      }
      break
    }
    case 'Ring': {
      const x = range(r, -0.06, 0.06)
      const y = range(r, -0.06, 0.06)
      const radius = range(r, 0.18, 0.32)
      const gap = range(r, 2.4, 3)
      beadRing(discs, x, y, pick(r, DIRS), radius, range(r, 0.026, 0.034), gap)
      if (r() < 0.6)
        beadRing(discs, x, y, pick(r, DIRS), radius * range(r, 0.4, 0.6), range(r, 0.024, 0.03), gap)
      else
        discs.push({ x, y, r: range(r, 0.03, 0.05) })
      break
    }
    default: {
      // Dust: specks over the whole plane, so every aspect ratio fills up
      const n = int(r, 25, 60) * 9
      for (let i = 0; i < n; i++)
        discs.push({ x: range(r, -1.5, 1.5), y: range(r, -1.5, 1.5), r: range(r, 0.015, 0.024) })
    }
  }
  return discs
}

/** Integer hash of a lattice point, in [0, 1). */
function latticeNoise(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smoothstep = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)

// ---------------------------------------------------------------------------
// Simulation: a pure function of the hash and the aspect ratio
// ---------------------------------------------------------------------------

function alive(b: Float32Array): boolean {
  for (let i = 0; i < b.length; i++) {
    if (b[i] > 0.1)
      return true
  }
  return false
}

export interface Dish {
  w: number
  h: number
  /** Catalyst concentration B, w x h, normalised so the densest 0.5% reach 1. */
  v: Float32Array
  /** True when the first culture died out and the dish was sown again. */
  rescued: boolean
}

export function grow(hash: string, f: Features, gw: number, gh: number): Dish {
  const pr = stream(hash, 'params')
  const sr = stream(hash, 'seeds')
  const reg = REGIMES[f.Regime]
  const partner = REGIMES[pick(pr, reg.partners)]
  const dir = pick(pr, DIRS)
  const span = range(pr, 0.8, 1.3)
  const radius = range(pr, 0.5, 0.75)
  const noiseSeed = (pr() * 4294967296) | 0

  const g = makeGrid(gw, gh)
  const s = gw + 2
  const cx = gw / 2
  const cy = gh / 2
  // feed and kill per cell, blended towards the partner regime
  for (let y = 0; y < gh; y++) {
    const uy = (y + 0.5 - cy) / GRID
    for (let x = 0; x < gw; x++) {
      const ux = (x + 0.5 - cx) / GRID
      let t = 0
      if (f.Gradient === 'Drift')
        t = smoothstep((ux * dir[0] + uy * dir[1]) / span + 0.5)
      else if (f.Gradient === 'Radial')
        t = smoothstep((ux * ux + uy * uy) / (radius * radius))
      const fe = reg.f + (partner.f - reg.f) * t
      const k = reg.k + (partner.k - reg.k) * t
      const i = (y + 1) * s + x + 1
      g.feed[i] = fe
      g.decay[i] = fe + k
    }
  }
  // seeds: catalyst drops in the substrate
  const plant = (discs: Disc[]) => {
    g.a.fill(1)
    g.b.fill(0)
    const ox = Math.floor(gw / 2)
    const oy = Math.floor(gh / 2)
    for (const d of discs) {
      const ix0 = Math.max(0, Math.floor((d.x - d.r) * GRID + cx))
      const iy0 = Math.max(0, Math.floor((d.y - d.r) * GRID + cy))
      const ix1 = Math.min(gw - 1, Math.ceil((d.x + d.r) * GRID + cx))
      const iy1 = Math.min(gh - 1, Math.ceil((d.y + d.r) * GRID + cy))
      for (let y = iy0; y <= iy1; y++) {
        const dy = (y + 0.5 - cy) / GRID - d.y
        for (let x = ix0; x <= ix1; x++) {
          const dx = (x + 0.5 - cx) / GRID - d.x
          if (dx * dx + dy * dy <= d.r * d.r) {
            const i = (y + 1) * s + x + 1
            g.a[i] = 0.5
            g.b[i] = 0.25 + 0.25 * latticeNoise(x - ox, y - oy, noiseSeed)
          }
        }
      }
    }
    grayScott(g, reg.steps, DA, DB, DT)
  }
  plant(seedDiscs(sr, f.Seed))
  // a culture that died out (seeds too small for the regime, or all of
  // them outside the canvas) is sown again with dust from its own stream
  const rescued = !alive(g.b)
  if (rescued)
    plant(seedDiscs(stream(hash, 'rescue'), 'Dust'))

  // normalise by a high percentile of B
  const BINS = 1024
  const hist = new Uint32Array(BINS)
  for (let y = 1; y <= gh; y++) {
    for (let x = 1; x <= gw; x++)
      hist[Math.min(BINS - 1, (g.b[y * s + x] * BINS) | 0)]++
  }
  let acc = 0
  let top = BINS - 1
  const target = gw * gh * 0.995
  for (let i = 0; i < BINS; i++) {
    acc += hist[i]
    if (acc >= target) {
      top = i
      break
    }
  }
  const vmax = Math.max(0.08, (top + 1) / BINS)
  const v = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++)
      v[y * gw + x] = g.b[(y + 1) * s + x + 1] / vmax
  }
  return { w: gw, h: gh, v, rescued }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

function hex(c: string): RGB {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rampAt(ramp: readonly RGB[], t: number): RGB {
  const p = Math.max(0, Math.min(1, t)) * (ramp.length - 1)
  const i = Math.min(ramp.length - 2, Math.floor(p))
  return mix(ramp[i], ramp[i + 1], p - i)
}

const LUT = 1024

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const look = stream(hash, 'look')
  const shift = pick(look, DIRS)
  const shiftLen = range(look, 0.003, 0.006)
  const light = pick(look, DIRS.slice(4, 7))
  const bands = int(look, 4, 7)
  const inkLevel = range(look, 0.38, 0.5)
  const accentLevel = inkLevel * 0.55

  // grid: GRID cells on the short side, the long side follows the canvas
  const S = Math.min(W, H)
  const aspect = Math.max(W, H) / S
  const long = Math.min(Math.round(GRID * aspect), GRID * MAX_ASPECT)
  const gw = W >= H ? long : GRID
  const gh = W >= H ? GRID : long
  const dish = grow(hash, f, gw, gh)

  // refined field and its gradient, per composition unit
  const Wd = gw * REFINE
  const Hd = gh * REFINE
  const v = refine(dish.v, gw, gh, gw, 0, REFINE)
  const { gx, gy } = gradient(v, Wd, Hd)
  const perUnit = GRID * REFINE
  const aux = new Float32Array(Wd * Hd)
  const aux2 = new Float32Array(f.Render === 'Relief' ? Wd * Hd : 0)
  if (f.Render === 'Relief') {
    // faux lighting: the field is a height map, lit from one side
    let lx = light[0]
    let ly = light[1]
    let lz = 1.1
    const ln = Math.sqrt(lx * lx + ly * ly + lz * lz)
    lx /= ln
    ly /= ln
    lz /= ln
    let hx = lx
    let hy = ly
    let hz = lz + 1
    const hn = Math.sqrt(hx * hx + hy * hy + hz * hz)
    hx /= hn
    hy /= hn
    hz /= hn
    const height = 0.022
    for (let i = 0; i < aux.length; i++) {
      const nx = -gx[i] * perUnit * height
      const ny = -gy[i] * perUnit * height
      const nn = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const lambert = (nx * lx + ny * ly + lz) * nn
      aux[i] = Math.max(0.25, lambert / lz)
      const sp = Math.max(0, (nx * hx + ny * hy + hz) * nn)
      aux2[i] = sp ** 40
    }
  }
  else {
    for (let i = 0; i < aux.length; i++)
      aux[i] = Math.max(1e-4, Math.sqrt(gx[i] * gx[i] + gy[i] * gy[i]) * perUnit)
  }

  // pixel mapping: the dish is centred, one composition unit = S pixels
  const regionW = gw * S / GRID
  const regionH = gh * S / GRID
  const startX = (W - regionW) / 2
  const startY = (H - regionH) / 2
  const cols = axisMap(W, startX, regionW, Wd)
  const rows = axisMap(H, startY, regionH, Hd)
  const scols = axisMap(W, startX, regionW, Wd, shift[0] * shiftLen * S)
  const srows = axisMap(H, startY, regionH, Hd, shift[1] * shiftLen * S)
  const px = 1 / S

  // colour tables
  const bg = hex(pal.bg)
  const ink = hex(pal.ink)
  const accent = hex(pal.accent)
  const ramp = pal.ramp.map(hex)
  const lut = new Uint8ClampedArray(LUT * 3)
  for (let i = 0; i < LUT; i++) {
    const t = i / (LUT - 1)
    const c = f.Render === 'Bands'
      ? rampAt(ramp, (Math.min(bands - 1, Math.floor(t * bands)) + 0.5) / bands)
      : rampAt(ramp, t ** 0.9)
    lut[i * 3] = c[0]
    lut[i * 3 + 1] = c[1]
    lut[i * 3 + 2] = c[2]
  }
  const line = pal.light ? ink : mix(bg, [0, 0, 0], 0.5)

  // vignette, separable in composition units
  const vig = pal.light ? 0.08 : 0.3
  const vx = new Float32Array(W)
  const vy = new Float32Array(H)
  for (let x = 0; x < W; x++) {
    const d = (x + 0.5 - W / 2) * px
    vx[x] = d * d
  }
  for (let y = 0; y < H; y++) {
    const d = (y + 0.5 - H / 2) * px
    vy[y] = d * d
  }

  const img = ctx.createImageData(W, H)
  const out = img.data
  const lineHalf = 0.0011
  const ci = cols.i0
  const ct = cols.t
  const sci = scols.i0
  const sct = scols.t
  // pixels whose centre lies on the dish (every pixel up to a 3:1 canvas)
  const xs = Math.max(0, Math.ceil(startX - 0.5))
  const xe = Math.min(W, Math.floor(startX + regionW - 0.5) + 1)
  const ys = Math.max(0, Math.ceil(startY - 0.5))
  const ye = Math.min(H, Math.floor(startY + regionH - 0.5) + 1)
  // rows are interpolated vertically once, then each pixel only lerps along x
  const rv = new Float32Array(Wd)
  const ra = new Float32Array(Wd)
  const rb = new Float32Array(Wd)
  const srv = new Float32Array(Wd)
  const sra = new Float32Array(Wd)
  const lerpRow = (dst: Float32Array, src: Float32Array, r: number, t: number) => {
    for (let c = 0; c < Wd; c++)
      dst[c] = src[r + c] + (src[r + Wd + c] - src[r + c]) * t
  }
  const ground = (o: number, x: number, sy: number) => {
    const k = 1 - vig * vx[x] - sy
    out[o] = bg[0] * k
    out[o + 1] = bg[1] * k
    out[o + 2] = bg[2] * k
    out[o + 3] = 255
  }

  for (let y = 0; y < H; y++) {
    const sy = vig * vy[y]
    const rowO = y * W * 4
    if (y < ys || y >= ye) {
      for (let x = 0; x < W; x++)
        ground(rowO + x * 4, x, sy)
      continue
    }
    for (let x = 0; x < xs; x++)
      ground(rowO + x * 4, x, sy)
    for (let x = xe; x < W; x++)
      ground(rowO + x * 4, x, sy)
    const r0 = rows.i0[y] * Wd
    const ty = rows.t[y]
    let o = rowO + xs * 4
    lerpRow(rv, v, r0, ty)
    lerpRow(ra, aux, r0, ty)
    if (f.Render === 'Ink') {
      lerpRow(srv, v, srows.i0[y] * Wd, srows.t[y])
      lerpRow(sra, aux, srows.i0[y] * Wd, srows.t[y])
      for (let x = xs; x < xe; x++, o += 4) {
        const i = ci[x]
        const tx = ct[x]
        const val = rv[i] + (rv[i + 1] - rv[i]) * tx
        const g = ra[i] + (ra[i + 1] - ra[i]) * tx
        // accent plate, slightly off register, printed under the ink plate
        const j = sci[x]
        const sx = sct[x]
        const sv = srv[j] + (srv[j + 1] - srv[j]) * sx
        const sg = sra[j] + (sra[j + 1] - sra[j]) * sx
        // coverage from the signed distance to the threshold, in pixels
        let k1 = 0.5 + (sv - accentLevel) / (sg * px)
        k1 = k1 < 0 ? 0 : k1 > 0.92 ? 0.92 : k1
        let k2 = 0.5 + (val - inkLevel) / (g * px)
        k2 = k2 < 0 ? 0 : k2 > 1 ? 1 : k2
        const R = bg[0] + (accent[0] - bg[0]) * k1
        const G = bg[1] + (accent[1] - bg[1]) * k1
        const B = bg[2] + (accent[2] - bg[2]) * k1
        const k = 1 - vig * vx[x] - sy
        out[o] = (R + (ink[0] - R) * k2) * k
        out[o + 1] = (G + (ink[1] - G) * k2) * k
        out[o + 2] = (B + (ink[2] - B) * k2) * k
        out[o + 3] = 255
      }
    }
    else if (f.Render === 'Relief') {
      lerpRow(rb, aux2, r0, ty)
      for (let x = xs; x < xe; x++, o += 4) {
        const i = ci[x]
        const tx = ct[x]
        const val = rv[i] + (rv[i + 1] - rv[i]) * tx
        const lit = ra[i] + (ra[i + 1] - ra[i]) * tx
        const spec = (rb[i] + (rb[i + 1] - rb[i]) * tx) * 150 * (val < 1 ? val : 1)
        let li = (val * (LUT - 1)) | 0
        li = (li < 0 ? 0 : li > LUT - 1 ? LUT - 1 : li) * 3
        const k = 1 - vig * vx[x] - sy
        out[o] = (lut[li] * lit + spec) * k
        out[o + 1] = (lut[li + 1] * lit + spec) * k
        out[o + 2] = (lut[li + 2] * lit + spec) * k
        out[o + 3] = 255
      }
    }
    else {
      for (let x = xs; x < xe; x++, o += 4) {
        const i = ci[x]
        const tx = ct[x]
        const val = rv[i] + (rv[i + 1] - rv[i]) * tx
        let li = (val * (LUT - 1)) | 0
        li = (li < 0 ? 0 : li > LUT - 1 ? LUT - 1 : li) * 3
        let R = lut[li]
        let G = lut[li + 1]
        let B = lut[li + 2]
        // contour lines between the bands, a constant width in composition units
        const xb = val * bands
        const kb = Math.round(xb)
        if (kb >= 1 && kb < bands) {
          const d = Math.abs(xb - kb) / (bands * (ra[i] + (ra[i + 1] - ra[i]) * tx))
          let k = 0.5 + (lineHalf - d) / px
          k = k < 0 ? 0 : k > 0.85 ? 0.85 : k
          R += (line[0] - R) * k
          G += (line[1] - G) * k
          B += (line[2] - B) * k
        }
        const k = 1 - vig * vx[x] - sy
        out[o] = R * k
        out[o + 1] = G * k
        out[o + 2] = B * k
        out[o + 3] = 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

export default {
  slug: 'reaction',
  title: 'Reaction',
  summary: 'Gray–Scott reaction–diffusion grown from a seeded sketch: spots, labyrinths, worms, coral and dividing cells, printed in ink, relief or contour bands.',
  order: 110,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7eac7104 ("gallery" stream): the first hash found for each
  // palette x regime pair, until twelve pairs are covered; the fifth one (a
  // ring of worms grown into a cell) was moved first as the cover.
  gallery: [
    '0x2236f09b3a2b62d71f49bb5c7fa1e7724b8202403f552f08d10c870edfe4d51f',
    '0xe311afcf6cc78352b911ed7528cd87dcf74430bf04e89a3810b132a3411daf1a',
    '0x6549b2c6f826e9585c8cedd37ca6266c6e5dcf258463b45b5fa4c4ab001db352',
    '0x92d20c91b79cf5eca3f501efeb9f29686449a3d11e81725b5a9112c44d5485aa',
    '0xcb46510433cfe38b67e320eff8270f044821ca5089138717a898fb4a38eba4f0',
    '0xfda88b7d8948005a765842162a5876cac1dc0afbc037f868358b702297b9b733',
    '0x02b7179c0bf55273c0461c04b458e11cae3472b6caad99703c2afdb58ba8dc2e',
    '0xfa3fe2e1448fe4b8dc050df2ba2e8efa5b4e0cf139965cdae6e3676460a291d6',
    '0x97721c9aa8eb9172b5f9517a6fce34042c0ad48af086bffd5ba88bd0922dd3e1',
    '0x8fb7441b15d9652f13efbbca890b4499fab4d057cb889c6e6a401fb61b7f85ea',
    '0x770eb413015fb6e39047fe1874263b08418d93f45ef0a0ea4365a63b6d33a320',
    '0x747207436c91b965989885aa2c0e69de38bec2347a8181dfd8a1270744a1acae',
  ],
} satisfies Series
