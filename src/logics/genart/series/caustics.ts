// "Caustics" — sunlight focused by a wavy surface onto the floor below it.
//
// A height field (a sum of plane waves, or rings spreading from drops) is
// sampled on a lattice. Each lattice point refracts a ray of sunlight with
// Snell's law down to the floor, and the light is gathered there by the area
// ratio of the triangles it travels in (see ../caustics/light.ts): where
// crests act as lenses the triangles collapse into the bright, folded lines
// of a caustic network. The floor depth is set from the surface's own
// curvature, so "Soft", "Sharp" and "Deep" mean the same thing for every
// surface: before, at, or well past the first focus.
//
// The floor is then seen from above through the same surface (so lane lines
// wobble), lit by ambient sky plus the gathered sunlight, and tinted by the
// water column with the Beer-Lambert law. In the Window scene the surface is
// a leaded window of coloured glass and the floor a plastered wall.
//
// Shading is in linear light (sRGB decoded and encoded through tables). The
// exposure of each piece comes from percentiles of a small probe render of
// the square composition, so it is the same at every size and aspect, and a
// highlight shoulder rolls the brightest lines off towards white.
//
// Everything is a pure function of the hash; every length is a fraction of
// the canvas short side, measured from the centre of the canvas.

import type { Albedo, Rgb } from '../caustics/floor'
import type { Sun } from '../caustics/light'
import type { SurfaceKind } from '../caustics/surface'
import type { Rng } from '../random'
import type { Series } from '../types'
import { pebbles, plaster, sand, tiles } from '../caustics/floor'
import { gather, refractor, soften } from '../caustics/light'
import { makeSurface } from '../caustics/surface'
import { int, pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Floor: [['Tiles', 32], ['Sand', 24], ['Pebbles', 18], ['Lanes', 16], ['Window', 10]],
  Surface: [['Chop', 36], ['Swell', 28], ['Ruffled', 20], ['Drops', 16]],
  Focus: [['Soft', 24], ['Sharp', 50], ['Deep', 26]],
  Light: [['Noon', 56], ['Slant', 30], ['Prism', 14]],
  Palette: [['Aqua', 30], ['Lagoon', 22], ['Amber', 18], ['Nocturne', 18], ['Ink', 12]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Floor: weighted(r, TRAITS.Floor),
    Surface: weighted(r, TRAITS.Surface),
    Focus: weighted(r, TRAITS.Focus),
    Light: weighted(r, TRAITS.Light),
    Palette: weighted(r, TRAITS.Palette),
  }
}

interface Palette {
  /** Sky light (intensity times tint) and sunlight. */
  amb: number
  ambTint: string
  sun: number
  sunTint: string
  /** Colour scattered by the water column, and its absorption per unit depth. */
  water: string
  sigma: Rgb
  tileA: string
  tileB: string
  accent: string
  grout: string
  lane: string
  sandA: string
  sandB: string
  speck: string
  stones: readonly string[]
  grit: string
  wall: string
  /** Wall lighting for the Window scene. */
  wallAmb: number
  wallSun: number
  /** Window glass, the pale one first. */
  glass: readonly string[]
  /** Range of linear light the exposure keeps the median floor in (key 0: no lower bound). */
  key: number
  ceil: number
  /** Share of the darkest floor (2nd percentile) taken as black: deeper blacks for the dark palettes. */
  black: number
}

const PAL: Record<Features['Palette'], Palette> = {
  Aqua: {
    amb: 0.13,
    ambTint: '#d2e8f2',
    sun: 0.72,
    sunTint: '#fff3d8',
    water: '#1d86a8',
    sigma: [0.55, 0.16, 0.1],
    tileA: '#b4e2e8',
    tileB: '#95d1dc',
    accent: '#3d8db4',
    grout: '#eef6f3',
    lane: '#1f3d7a',
    sandA: '#ead9b2',
    sandB: '#cfb78a',
    speck: '#8a7356',
    stones: ['#cbbda4', '#9c968c', '#e2dacb', '#7f766a', '#b79e7e'],
    grit: '#8c7f68',
    wall: '#eef0ea',
    wallAmb: 0.11,
    wallSun: 0.9,
    glass: ['#eef2e4', '#1f55d6', '#0f9aa0', '#f0ae1c', '#c8202e'],
    key: 0.2,
    ceil: 0.45,
    black: 0.15,
  },
  Lagoon: {
    amb: 0.13,
    ambTint: '#dcebe2',
    sun: 0.72,
    sunTint: '#fffbe6',
    water: '#1f8f7f',
    sigma: [0.6, 0.12, 0.22],
    tileA: '#c4e6d2',
    tileB: '#a9d8c2',
    accent: '#2f7d6d',
    grout: '#f3f1e6',
    lane: '#1f4f4a',
    sandA: '#efe2bd',
    sandB: '#d6c294',
    speck: '#7d6a4c',
    stones: ['#d3c7ae', '#8f9a8c', '#ebe3d1', '#6f7a6c', '#c2a684'],
    grit: '#857a62',
    wall: '#e7ecdc',
    wallAmb: 0.11,
    wallSun: 0.9,
    glass: ['#eef0dc', '#119a52', '#0c8f94', '#e9b51f', '#2c4fc4'],
    key: 0.2,
    ceil: 0.42,
    black: 0.15,
  },
  Amber: {
    amb: 0.11,
    ambTint: '#c9d5da',
    sun: 0.75,
    sunTint: '#ffd49a',
    water: '#2f6f68',
    sigma: [0.32, 0.22, 0.3],
    tileA: '#ecc29b',
    tileB: '#dca97e',
    accent: '#8c4a2c',
    grout: '#f5e8d3',
    lane: '#5a2a1c',
    sandA: '#e2c595',
    sandB: '#c79d68',
    speck: '#6e4a2c',
    stones: ['#d8b88e', '#a5826a', '#ead2b0', '#7a5a46', '#c49470'],
    grit: '#7c5e44',
    wall: '#eedbbc',
    wallAmb: 0.1,
    wallSun: 0.95,
    glass: ['#f4ead2', '#f0a514', '#e2661a', '#b8122a', '#16804e'],
    key: 0.2,
    ceil: 0.42,
    black: 0.15,
  },
  Nocturne: {
    amb: 0.07,
    ambTint: '#7f9cc8',
    sun: 1.05,
    sunTint: '#c4f2ff',
    water: '#04162a',
    sigma: [0.9, 0.45, 0.3],
    tileA: '#6d8fb3',
    tileB: '#5c7ea4',
    accent: '#86a6c8',
    grout: '#9cb2cc',
    lane: '#141f3a',
    sandA: '#8d9ab0',
    sandB: '#6c7a92',
    speck: '#3a4458',
    stones: ['#8592a8', '#5e6a80', '#a4afc2', '#4a5468', '#7a7f96'],
    grit: '#3c465a',
    wall: '#6c7890',
    wallAmb: 0.06,
    wallSun: 1.1,
    glass: ['#e4ecf2', '#2449d8', '#7a2cc2', '#c0172e', '#119c9c'],
    key: 0,
    ceil: 0.22,
    black: 0.5,
  },
  Ink: {
    amb: 0.03,
    ambTint: '#ffffff',
    sun: 0.8,
    sunTint: '#fff8ec',
    water: '#060607',
    sigma: [0.35, 0.35, 0.35],
    tileA: '#dcdad4',
    tileB: '#cdcbc4',
    accent: '#8e8c86',
    grout: '#f2f0ea',
    lane: '#3c3c3c',
    sandA: '#d6d1c6',
    sandB: '#bdb7aa',
    speck: '#6a665e',
    stones: ['#9c9a94', '#6a6864', '#b8b6b0', '#4c4a46', '#86827a'],
    grit: '#22211f',
    wall: '#e4e2dc',
    wallAmb: 0.035,
    wallSun: 1.0,
    glass: ['#f1eee4', '#c8142a', '#1d47d0', '#efa912', '#12935a'],
    key: 0,
    ceil: 0.22,
    black: 0.75,
  },
}

/** Floor depth in units of the focal depth of the 90th-percentile crest. */
const FOCUS: Record<Features['Focus'], number> = { Soft: 0.6, Sharp: 0.95, Deep: 1.35 }
/** RMS slope of the surface: small, so the refraction stays gentle. */
const SLOPE = 0.08
/** How far the floor appears shifted when seen through the surface. */
const VIEW = 0.6
/** Largest displacement of a ray, in composition units. */
const MAX_SHIFT = 0.16
/** Behind a window the glass is close to the wall: shorter throws. */
const MAX_SHIFT_GLASS = 0.075
/** Refractive indices, per channel for the Prism light (dispersion exaggerated some twentyfold). */
const N_WATER: Rgb = [1.22, 1.333, 1.5]
const N_GLASS: Rgb = [1.4, 1.52, 1.7]

const TAU = Math.PI * 2

function hex(c: string): Rgb {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

const clamp = (t: number, a: number, b: number) => t < a ? a : t > b ? b : t
function smooth(t: number) {
  const c = clamp(t, 0, 1)
  return c * c * (3 - 2 * c)
}

interface Window {
  cx: number
  cy: number
  hw: number
  hh: number
  skew: number
  cols: number
  rows: number
  bar: number
  /** Slope multiplier per pane, row-major over a 5 × 5 maximum. */
  panes: number[]
  /** Quarter turns of each pane's glass: every pane is its own piece. */
  turns: number[]
  /** Width of the border band of narrow panes (0: none). */
  border: number
  /** Border panes along each long side. */
  segs: number
  /** Diamond quarries in the field instead of rectangular panes. */
  quarry: boolean
  /** Glass of each pane: index into the palette's glass list (25 field panes, 2 border, 1 corner). */
  glass: number[]
}

/** Depth factor of the floor, around 1. */
type Depth = (x: number, y: number) => number

interface Scene {
  albedo: Albedo
  depth: Depth
  window: Window | null
}

function makeScene(f: Features, pal: Palette, r: Rng, aa: number): Scene {
  // fixed draw order: the shared draws first, then the floor's own
  const seed = (r() * 4294967296) | 0
  const theta = r() * TAU
  const slope = range(r, 0.25, 0.6)
  const vertical = r() < 0.5
  const size = range(r, 0.032, 0.062)
  const ox = r()
  const oy = r()
  const waves = [0, 1, 2].map(() => ({ k: TAU / range(r, 0.5, 1.3), a: r() * TAU, p: r() * TAU }))
  const ramp: Depth = (x, y) => clamp(1 + slope * (x * Math.cos(theta) + y * Math.sin(theta)), 0.55, 1.5)
  const tileOpts = {
    size,
    grout: 0.075,
    ox,
    oy,
    seed,
    tileA: hex(pal.tileA),
    tileB: hex(pal.tileB),
    accent: hex(pal.accent),
    groutColor: hex(pal.grout),
    accents: 0,
    lanes: [] as { at: number, width: number, end: number | null, cross: number }[],
    vertical,
    laneColor: hex(pal.lane),
    aa,
  }
  if (f.Floor === 'Tiles') {
    tileOpts.size = size * 0.75
    return { albedo: tiles(tileOpts), depth: ramp, window: null }
  }
  if (f.Floor === 'Lanes') {
    // pool tiles a little larger, one or two stripes two or three tiles wide
    tileOpts.size = size * 0.9
    const ts = tileOpts.size
    const width = int(r, 2, 3)
    const count = r() < 0.55 ? 1 : 2
    const gap = range(r, 0.42, 0.6)
    const tEnd = r() < 0.6
    const endAt = range(r, 0.22, 0.36) * (r() < 0.5 ? -1 : 1)
    const off = tileOpts.vertical ? ox : oy
    const offAlong = tileOpts.vertical ? oy : ox
    for (let i = 0; i < count; i++) {
      const centre = (count === 1 ? 0 : (i - 0.5) * gap)
      tileOpts.lanes.push({
        at: Math.round(centre / ts + off - width / 2),
        width,
        end: tEnd ? Math.round(endAt / ts + offAlong) : null,
        cross: width,
      })
    }
    // deeper along the lanes
    const along = tileOpts.vertical ? Math.PI / 2 : 0
    const dir = endAt < 0 ? 1 : -1
    const depth: Depth = (x, y) => clamp(1 + dir * slope * (x * Math.cos(along) + y * Math.sin(along)), 0.55, 1.5)
    return { albedo: tiles(tileOpts), depth, window: null }
  }
  if (f.Floor === 'Sand') {
    const albedo = sand({ seed, lambda: range(r, 0.035, 0.065), theta, a: hex(pal.sandA), b: hex(pal.sandB), speck: hex(pal.speck) })
    // shallow banks and hollows
    const depth: Depth = (x, y) => {
      let s = 0
      for (const w of waves)
        s += Math.sin(w.k * (x * Math.cos(w.a) + y * Math.sin(w.a)) + w.p)
      return clamp(1 + 0.16 * s, 0.6, 1.45)
    }
    return { albedo, depth, window: null }
  }
  if (f.Floor === 'Pebbles') {
    const albedo = pebbles({ seed, size: size * 1.3, stones: pal.stones.map(hex), grit: hex(pal.grit), aa })
    const w = waves[0]
    const depth: Depth = (x, y) => 1 + 0.18 * Math.sin(w.k * (x * Math.cos(w.a) + y * Math.sin(w.a)) + w.p)
    return { albedo, depth, window: null }
  }
  // Window: a leaded window of coloured glass, its light thrown on a wall
  // and skewed by the low sun
  const win: Window = {
    cx: range(r, -0.05, 0.05),
    cy: range(r, -0.05, 0.05),
    hw: range(r, 0.3, 0.4),
    hh: range(r, 0.32, 0.42),
    skew: range(r, -0.3, 0.3),
    cols: int(r, 2, 5),
    rows: int(r, 2, 5),
    bar: range(r, 0.012, 0.022),
    panes: Array.from({ length: 25 }, () => pick(r, [0.3, 0.75, 1, 1, 1.2])),
    turns: Array.from({ length: 25 }, () => int(r, 0, 3)),
    // drawn after the original window draws, which keep their values
    border: 0,
    segs: 0,
    quarry: false,
    glass: [],
  }
  win.border = r() < 0.65 ? range(r, 0.036, 0.056) : 0
  win.quarry = r() < 0.35
  const n = pal.glass.length
  // the first glass of each list is the pale one: a field of mostly pale
  // quarries, or of mostly coloured panes, around a coloured border
  win.glass = Array.from({ length: 28 }, (_, i) => {
    const paleShare = i >= 25 ? 0.1 : win.quarry ? 0.6 : 0.25
    return r() < paleShare ? 0 : int(r, 1, n - 1)
  })
  if (win.glass[25] === win.glass[26])
    win.glass[26] = 1 + (win.glass[25] % (n - 1))
  // keep the skewed patch inside the square
  win.hw = Math.min(win.hw, 0.45 - Math.abs(win.skew) * win.hh - Math.abs(win.cx))
  win.segs = Math.max(2, Math.round((2 * win.hh - 2 * win.border) / (win.border * 3.2 + 1e-9)))
  return { albedo: plaster(hex(pal.wall), seed), depth: () => 1, window: win }
}

/** Distance from t to the nearest integer. */
const fracDist = (t: number) => Math.abs(t - Math.round(t))

/**
 * Light let through by the window at (x, y): its share (0 on the lead and
 * outside), the pane (0..24 field, 25..26 border, 27 corner) and the distance
 * to the nearest lead.
 */
function windowAt(w: Window, x: number, y: number, soft: number): [number, number, number] {
  const v = (y - w.cy) / w.hh
  const u = (x - w.cx - w.skew * (y - w.cy)) / w.hw
  if (u <= -1 || u >= 1 || v <= -1 || v >= 1)
    return [0, 0, 0]
  const X = u * w.hw
  const Y = v * w.hh
  // distance to the frame: a little heavier than the glazing bars
  const fu = (1 - Math.abs(u)) * w.hw
  const fv = (1 - Math.abs(v)) * w.hh
  // came a little wider than drawn, so the leading reads at a glance
  const half = w.bar * 0.65
  let d = Math.min(fu, fv) - w.bar * 1.3
  let pane: number
  const bw = w.border
  if (bw > 0 && (fu < bw || fv < bw)) {
    // border band: corner squares, and the sides cut into short panes
    d = Math.min(d, Math.min(Math.abs(fu - bw), Math.abs(fv - bw)) - half)
    if (fu < bw && fv < bw) {
      pane = 27
    }
    else {
      const side = fu < bw
      const len = side ? w.hh - bw : w.hw - bw
      const t = ((side ? Y : X) + len) / (2 * len) * w.segs
      d = Math.min(d, fracDist(t) * 2 * len / w.segs - half)
      pane = 25 + (Math.floor(t) & 1)
    }
  }
  else {
    const iw = w.hw - bw
    const ih = w.hh - bw
    if (bw > 0)
      d = Math.min(d, Math.min(fu, fv) - bw - half)
    if (w.quarry) {
      // diamond lattice: lines a = const and b = const
      const qw = 2 * iw / (w.cols + 1)
      const qh = 2 * ih / (w.rows + 1)
      const a = X / qw + Y / qh
      const b = X / qw - Y / qh
      const g = 1 / Math.sqrt(1 / (qw * qw) + 1 / (qh * qh))
      d = Math.min(d, Math.min(fracDist(a), fracDist(b)) * g - half)
      pane = (((Math.floor(a) * 3 + Math.floor(b) * 7) % 25) + 25) % 25
    }
    else {
      const pu = (X + iw) / (2 * iw) * w.cols
      const pv = (Y + ih) / (2 * ih) * w.rows
      const iu = Math.min(w.cols - 1, Math.max(0, Math.floor(pu)))
      const iv = Math.min(w.rows - 1, Math.max(0, Math.floor(pv)))
      const du = Math.min(pu - iu, iu + 1 - pu) * 2 * iw / w.cols
      const dv = Math.min(pv - iv, iv + 1 - pv) * 2 * ih / w.rows
      d = Math.min(d, du - half, dv - half)
      pane = iv * 5 + iu
    }
  }
  return [smooth(d / soft + 0.5), pane, d]
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** sRGB transfer functions. */
const decode = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const encode = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
const lin = (c: string): Rgb => hex(c).map(decode) as unknown as Rgb

/**
 * Highlight shoulder: the identity up to KNEE (linear light), then an
 * exponential roll-off towards white with slope 1 at the knee, so mid tones
 * keep their colour and the cores of the caustics keep their gradient
 * instead of clipping flat. Channels roll off on their own: a bright
 * coloured line drifts towards white, as on film.
 */
const KNEE = 0.5
function shoulder(x: number) {
  return x < KNEE ? x : KNEE + (1 - KNEE) * (1 - Math.exp(-(x - KNEE) / (1 - KNEE)))
}
/** Linear light that the exposure puts at the high percentile of the piece: near white, still graded. */
const WHITE = KNEE + 2.6 * (1 - KNEE)
/** Percentile of the brightest channel that defines the highlights. */
const HI = 0.995

/** The light maps of one lattice and what the shading needs from it. */
interface Traced {
  nx: number
  ny: number
  c: number
  x0: number
  y0: number
  depth: Float32Array
  vdx: Float32Array | null
  vdy: Float32Array | null
  /** Gathered light per colour channel, on the (nx-1) × (ny-1) cells; may alias. */
  light: Float32Array[]
}

function paint(ctx: Ctx2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const isWindow = f.Floor === 'Window'

  // fixed stream order: surface, light, floor
  const surface = makeSurface(f.Surface as SurfaceKind, stream(hash, 'surface'))
  const lr = stream(hash, 'light')
  const azimuth = lr() * TAU
  const elevation = range(lr, 0.72, 0.95)
  const sunUp = f.Light === 'Slant' || isWindow
  const sun: Sun = sunUp
    ? { x: Math.cos(elevation) * Math.cos(azimuth), y: Math.cos(elevation) * Math.sin(azimuth), z: -Math.sin(elevation) }
    : { x: 0, y: 0, z: -1 }
  const nIdx = isWindow ? N_GLASS : N_WATER
  const prism = f.Light === 'Prism'
  const etas = prism ? nIdx.map(n => 1 / n) : [1 / nIdx[1]]
  // the scene's own antialiasing width is in output pixels; nothing else depends on S
  const scene = makeScene(f, pal, stream(hash, 'floor'), 0.5 / S)
  const glass = pal.glass.map(lin)

  // --- normalisation on a fixed lattice over the square composition -------
  const NC = 129
  const hc = 1 / (NC - 1)
  const cxs = new Float64Array(NC).map((_, i) => -0.5 + i * hc)
  const hgt = new Float32Array(NC * NC)
  surface.evaluate(cxs, cxs, hgt)
  let ss = 0
  let sn = 0
  const sxr = new Float32Array(NC * NC)
  const syr = new Float32Array(NC * NC)
  for (let j = 1; j < NC - 1; j++) {
    for (let i = 1; i < NC - 1; i++) {
      const o = j * NC + i
      sxr[o] = (hgt[o + 1] - hgt[o - 1]) / (2 * hc)
      syr[o] = (hgt[o + NC] - hgt[o - NC]) / (2 * hc)
      ss += sxr[o] * sxr[o] + syr[o] * syr[o]
      sn++
    }
  }
  const A = SLOPE / Math.sqrt(ss / sn + 1e-30)
  const rays = etas.map(eta => refractor(eta, sun))
  const mid = rays[prism ? 1 : 0]
  const view = refractor(1 / nIdx[1], { x: 0, y: 0, z: -1 })
  const gc = new Float32Array(NC * NC * 2)
  for (let j = 1; j < NC - 1; j++) {
    for (let i = 1; i < NC - 1; i++) {
      const o = j * NC + i
      mid(A * sxr[o], A * syr[o], gc, o * 2)
    }
  }
  const kap: number[] = []
  let maxG = 0
  for (let j = 2; j < NC - 2; j++) {
    for (let i = 2; i < NC - 2; i++) {
      const o = j * NC + i
      const j11 = (gc[(o + 1) * 2] - gc[(o - 1) * 2]) / (2 * hc)
      const j12 = (gc[(o + NC) * 2] - gc[(o - NC) * 2]) / (2 * hc)
      const j21 = (gc[(o + 1) * 2 + 1] - gc[(o - 1) * 2 + 1]) / (2 * hc)
      const j22 = (gc[(o + NC) * 2 + 1] - gc[(o - NC) * 2 + 1]) / (2 * hc)
      const b = (j12 + j21) * 0.5
      const lmin = (j11 + j22) * 0.5 - Math.sqrt(((j11 - j22) * 0.5) ** 2 + b * b)
      kap.push(lmin < 0 ? -lmin : 0)
      maxG = Math.max(maxG, Math.hypot(gc[o * 2], gc[o * 2 + 1]))
    }
  }
  kap.sort((a, b) => a - b)
  const k90 = Math.max(1e-6, kap[Math.floor(kap.length * surface.percentile)])
  let D0 = FOCUS[f.Focus] / k90
  // the deepest floor and the steepest pane bound how far a ray may travel
  const dMax = isWindow ? 1.25 : 1.5
  const cap = isWindow ? MAX_SHIFT_GLASS : MAX_SHIFT
  if (D0 * dMax * maxG * 1.08 > cap)
    D0 = cap / (dMax * maxG * 1.08)
  const shift = D0 * dMax * maxG * 1.1
  const viewScale = isWindow ? 0 : VIEW
  // seen from straight above, the view ray is the light ray of a noon sun
  const sameView = !sunUp && !prism

  /**
   * Traces a lattice of spacing 1 / G, anchored at the centre, that covers
   * the rectangle |x| <= halfW, |y| <= halfH plus the reach of the rays.
   */
  const trace = (G: number, halfW: number, halfH: number): Traced => {
    const c = 1 / G
    const margin = shift * (1 + viewScale) + 3 * c
    const iX = Math.ceil((halfW + margin) / c)
    const iY = Math.ceil((halfH + margin) / c)
    const nx = 2 * iX + 1
    const ny = 2 * iY + 1
    const xs = new Float64Array(nx).map((_, i) => (i - iX) * c)
    const ys = new Float64Array(ny).map((_, j) => (j - iY) * c)
    const h = new Float32Array(nx * ny)
    surface.evaluate(xs, ys, h)
    const nv = nx * ny
    const depth = new Float32Array(nv)
    const vdx = viewScale > 0 ? new Float32Array(nv) : null
    const vdy = viewScale > 0 ? new Float32Array(nv) : null
    // the window filters each channel through its glass
    const weight = scene.window ? [0, 1, 2].map(() => new Float32Array(nv)) : null
    const chans = etas.length
    const mapX = Array.from({ length: chans }, () => new Float32Array(nv))
    const mapY = Array.from({ length: chans }, () => new Float32Array(nv))
    const g = new Float32Array(2)
    const soft = Math.max(0.0025, 1.5 * c)
    // the depth varies slowly: evaluated every ST vertices, then interpolated
    const ST = 8
    const dnx = Math.ceil((nx - 1) / ST) + 1
    const dny = Math.ceil((ny - 1) / ST) + 1
    const coarse = new Float32Array(dnx * dny)
    for (let jj = 0; jj < dny; jj++) {
      for (let ii = 0; ii < dnx; ii++)
        coarse[jj * dnx + ii] = scene.depth((ii * ST - iX) * c, (jj * ST - iY) * c)
    }
    for (let j = 0; j < ny; j++) {
      const jj = Math.floor(j / ST)
      const ty = j / ST - jj
      for (let i = 0; i < nx; i++) {
        const ii = Math.floor(i / ST)
        const tx = i / ST - ii
        const o = jj * dnx + ii
        const a = coarse[o] + (coarse[o + 1] - coarse[o]) * tx
        const b = coarse[o + dnx] + (coarse[o + dnx + 1] - coarse[o + dnx]) * tx
        depth[j * nx + i] = a + (b - a) * ty
      }
    }
    for (let j = 0; j < ny; j++) {
      const jm = j > 0 ? j - 1 : j
      const jp = j < ny - 1 ? j + 1 : j
      for (let i = 0; i < nx; i++) {
        const o = j * nx + i
        const im = i > 0 ? i - 1 : i
        const ip = i < nx - 1 ? i + 1 : i
        let sx = A * (h[j * nx + ip] - h[j * nx + im]) / ((ip - im) * c)
        let sy = A * (h[jp * nx + i] - h[jm * nx + i]) / ((jp - jm) * c)
        if (scene.window && weight) {
          const [w, pane, edge] = windowAt(scene.window, xs[i], ys[j], soft)
          const tint = glass[scene.window.glass[pane]]
          weight[0][o] = w * tint[0]
          weight[1][o] = w * tint[1]
          weight[2][o] = w * tint[2]
          // the lead holds the glass flat along its edges
          const m = (0.4 + 0.6 * scene.window.panes[pane % 25]) * smooth(edge / 0.035)
          const t = scene.window.turns[pane % 25]
          const ax = sx * m
          const ay = sy * m
          sx = t === 0 ? ax : t === 1 ? -ay : t === 2 ? -ax : ay
          sy = t === 0 ? ay : t === 1 ? ax : t === 2 ? -ay : -ax
        }
        const d = D0 * depth[o]
        for (let ch = 0; ch < chans; ch++) {
          rays[ch](sx, sy, g, 0)
          mapX[ch][o] = i + d * g[0] / c
          mapY[ch][o] = j + d * g[1] / c
        }
        if (vdx && vdy) {
          if (!sameView)
            view(sx, sy, g, 0)
          vdx[o] = viewScale * d * g[0]
          vdy[o] = viewScale * d * g[1]
        }
      }
    }
    const light: Float32Array[] = []
    for (let ch = 0; ch < 3; ch++) {
      const m = prism ? ch : 0
      if (!weight && ch > 0 && !prism) {
        light.push(light[0])
        continue
      }
      const l = gather(mapX[m], mapY[m], weight ? weight[ch] : null, nx, ny, 2)
      soften(l, nx - 1, ny - 1)
      light.push(l)
    }
    return { nx, ny, c, x0: xs[0], y0: ys[0], depth, vdx, vdy, light }
  }

  // --- shading, in linear light -------------------------------------------
  const ambC = lin(pal.ambTint).map(v => v * (isWindow ? pal.wallAmb : pal.amb))
  const sunC = lin(pal.sunTint).map(v => v * (isWindow ? pal.wallSun : pal.sun))
  const water = lin(pal.water)
  const sigma = isWindow ? [0, 0, 0] : pal.sigma
  // per-depth transmission, tabulated on the depth factor
  const TD = 256
  const trans = new Float32Array((TD + 1) * 3)
  for (let i = 0; i <= TD; i++) {
    const dd = i / TD * 2
    for (let ch = 0; ch < 3; ch++)
      trans[i * 3 + ch] = Math.exp(-sigma[ch] * dd)
  }
  // the floors write display (sRGB) albedos: decoded through a table
  const DN = 2048
  const DMAX = 1.5
  const dec = new Float32Array(DN + 1).map((_, i) => decode(i / DN * DMAX))
  const toDec = DN / DMAX
  const alb = new Float32Array(3)
  const half = TD / 2

  /** The shading of one traced lattice: linear radiance of the floor seen at (xc, yc), into out. */
  const shader = (T: Traced) => {
    const nx = T.nx
    const cw = nx - 1
    const invC = 1 / T.c
    const x0 = T.x0
    const y0 = T.y0
    const vdx = T.vdx
    const vdy = T.vdy
    const dp = T.depth
    const lR = T.light[0]
    const lG = T.light[1]
    const lB = T.light[2]
    const mono = lG === lR
    const albedo = scene.albedo
    return (xc: number, yc: number, out: Float32Array) => {
      const fxv = (xc - x0) * invC
      const fyv = (yc - y0) * invC
      const iv = fxv | 0
      const jv = fyv | 0
      const tx = fxv - iv
      const ty = fyv - jv
      const o = jv * nx + iv
      const w00 = (1 - tx) * (1 - ty)
      const w10 = tx * (1 - ty)
      const w01 = (1 - tx) * ty
      const w11 = tx * ty
      let qx = xc
      let qy = yc
      if (vdx && vdy) {
        qx += vdx[o] * w00 + vdx[o + 1] * w10 + vdx[o + nx] * w01 + vdx[o + nx + 1] * w11
        qy += vdy[o] * w00 + vdy[o + 1] * w10 + vdy[o + nx] * w01 + vdy[o + nx + 1] * w11
      }
      const dm = dp[o] * w00 + dp[o + 1] * w10 + dp[o + nx] * w01 + dp[o + nx + 1] * w11
      // light at the floor point, on the cell centres
      const fx = (qx - x0) * invC - 0.5
      const fy = (qy - y0) * invC - 0.5
      const ia = fx | 0
      const ib = fy | 0
      const ua = fx - ia
      const ub = fy - ib
      const q = ib * cw + ia
      const e00 = (1 - ua) * (1 - ub)
      const e10 = ua * (1 - ub)
      const e01 = (1 - ua) * ub
      const e11 = ua * ub
      const eR = lR[q] * e00 + lR[q + 1] * e10 + lR[q + cw] * e01 + lR[q + cw + 1] * e11
      let eG = eR
      let eB = eR
      if (!mono) {
        eG = lG[q] * e00 + lG[q + 1] * e10 + lG[q + cw] * e01 + lG[q + cw + 1] * e11
        eB = lB[q] * e00 + lB[q + 1] * e10 + lB[q + cw] * e01 + lB[q + cw + 1] * e11
      }
      albedo(qx, qy, alb)
      let ti = (dm * half + 0.5) | 0
      ti = (ti > TD ? TD : ti) * 3
      const a0 = alb[0] * toDec
      const a1 = alb[1] * toDec
      const a2 = alb[2] * toDec
      const t0 = trans[ti]
      const t1 = trans[ti + 1]
      const t2 = trans[ti + 2]
      out[0] = dec[a0 > DN ? DN : a0 | 0] * (ambC[0] + sunC[0] * eR) * t0 + water[0] * (1 - t0)
      out[1] = dec[a1 > DN ? DN : a1 | 0] * (ambC[1] + sunC[1] * eG) * t1 + water[1] * (1 - t1)
      out[2] = dec[a2 > DN ? DN : a2 | 0] * (ambC[2] + sunC[2] * eB) * t2 + water[2] * (1 - t2)
    }
  }

  // --- exposure: measured on a small fixed lattice over the square ---------
  // composition, so it is the same at every output size and aspect ratio
  const probe = shader(trace(120, 0.5, 0.5))
  const PN = 96
  const lum = new Float32Array(PN * PN)
  const px3 = new Float32Array(3)
  for (let j = 0; j < PN; j++) {
    for (let i = 0; i < PN; i++) {
      probe(-0.5 + (i + 0.5) / PN, -0.5 + (j + 0.5) / PN, px3)
      // the brightest channel: a saturated colour must not clip either
      lum[j * PN + i] = Math.max(px3[0], px3[1], px3[2])
    }
  }
  lum.sort()
  const hi = Math.max(1e-4, lum[Math.floor(lum.length * HI)])
  const med = Math.max(1e-4, lum[lum.length >> 1])
  // highlights near white, unless that would sink the floor into murk: the
  // shoulder then takes the extra light
  const key = isWindow ? 0 : pal.key
  const black = isWindow ? 0 : pal.black * lum[Math.floor(lum.length * 0.02)]
  let exposure = Math.max(WHITE / (hi - black), key / (med - black))
  // and never a floor lit so evenly that it is mostly white
  if (!isWindow)
    exposure = Math.min(exposure, pal.ceil / (med - black))
  exposure = clamp(exposure, 0.45, 1.6)

  // tone curve and sRGB encoding in one table over the exposed linear light
  const LUT = 8192
  const LMAX = 6
  const tone = new Uint8ClampedArray(LUT + 1)
  for (let i = 0; i <= LUT; i++)
    tone[i] = Math.round(255 * encode(shoulder(i / LUT * LMAX)))

  // --- the picture's own lattice -------------------------------------------
  // three light maps for Prism and Window: a slightly coarser lattice keeps them as fast
  const G = Math.round(clamp(S * (prism || isWindow ? 0.42 : 0.5), 260, 1100))
  const shade = shader(trace(G, W / (2 * S), H / (2 * S)))

  const img = ctx.createImageData(W, H)
  const pix = new Uint32Array(img.data.buffer)
  const invS = 1 / S
  const colX = new Float64Array(W)
  const colV = new Float32Array(W)
  for (let px = 0; px < W; px++) {
    colX[px] = (px + 0.5 - W / 2) * invS
    const n = (px + 0.5 - W / 2) / (W / 2)
    colV[px] = 0.14 * n * n
  }
  const toLut = LUT / LMAX * exposure
  for (let py = 0; py < H; py++) {
    const yc = (py + 0.5 - H / 2) * invS
    const vyN = (py + 0.5 - H / 2) / (H / 2)
    const vigY = 1 - 0.14 * vyN * vyN
    const prow = py * W
    for (let px = 0; px < W; px++) {
      shade(colX[px], yc, px3)
      const vig = (vigY - colV[px]) * toLut
      const r0 = (px3[0] - black) * vig
      const r1 = (px3[1] - black) * vig
      const r2 = (px3[2] - black) * vig
      const i0 = r0 <= 0 ? 0 : r0 >= LUT ? LUT : r0 | 0
      const i1 = r1 <= 0 ? 0 : r1 >= LUT ? LUT : r1 | 0
      const i2 = r2 <= 0 ? 0 : r2 >= LUT ? LUT : r2 | 0
      // little-endian RGBA
      pix[prow + px] = 0xFF000000 | (tone[i2] << 16) | (tone[i1] << 8) | tone[i0]
    }
  }
  ctx.putImageData(img, 0, 0)
}

/**
 * Past this many pixels the piece is painted smaller and scaled up: the light
 * map is already capped at 1100 cells on the short side, so nothing is lost
 * but time.
 */
const MAX_PIXELS = 3600 * 3600

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  if (W * H <= MAX_PIXELS) {
    paint(ctx, W, H, hash)
    return
  }
  const k = Math.sqrt(MAX_PIXELS / (W * H))
  const w = Math.max(1, Math.round(W * k))
  const h = Math.max(1, Math.round(H * k))
  let g: Ctx2D | null
  let cv: OffscreenCanvas | HTMLCanvasElement
  if (typeof OffscreenCanvas !== 'undefined') {
    cv = new OffscreenCanvas(w, h)
    g = cv.getContext('2d')
  }
  else {
    cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    g = cv.getContext('2d')
  }
  if (!g) {
    paint(ctx, W, H, hash)
    return
  }
  paint(g, w, h, hash)
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cv, 0, 0, W, H)
  ctx.restore()
}

export default {
  slug: 'caustics',
  title: 'Caustics',
  summary: 'Sunlight refracted by a wavy surface and gathered on the floor below: caustic webs over pool tiles, lane lines, sand and pebbles, or the coloured light of a leaded window on a wall.',
  order: 610,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xca05710b ("gallery" stream, eight 32-bit words per hash):
  // the first hash found for each floor x palette pair, in the order found,
  // skipping the ones judged weak on a contact sheet (the 7th, a murky
  // Pebbles x Lagoon).
  gallery: [
    '0xfe515a357b8727f70e67fea959c7d1fb9e4a9d9ebf67a2c168646e1a88035023',
    '0xf1952a18d8be8091ead2086b57cad8dc642f096fd4c42098327f93c8feaf6b71',
    '0xc16efa459b3b88a48e73d909d3cafb21f8a33c7dc122e83c9c7b707995cadfdb',
    '0xa301b675e40f30de16cb95ee373aeb496e6ad7f5f701fb0d37c0057580c64acf',
    '0x7a9c7f5c205f2aca5296b96e2cb590b29303f08c6dbc946ef2bb7c7418eb0420',
    '0xf4115d8b9baea34a32b9bd997aa75992260eaa80d9040d41c8dbe3d7ee5b6e01',
    '0x91a10f04012680b646e9375051ea583be62b541042714376fd3f90299dc90543',
    '0x0a26b1efb2ee888655b47ec39f1b4e9b4782a4009c19749f0a5a70bbf5192cdd',
    '0xccc6d50dcf80d93b2c63db93d8b61483405456dfe8e9b82438bd5828afe57384',
    '0xa666dc0401f292f328820b3fc4c0acfe393942102066b7d4a46be18bbe7b33eb',
    '0x876b83630ee5ef8fdbd3618eea980cdef84d6ee2c4e28670e0588b761e5ecefa',
    '0x1b2928a46f472164cb6d2a546eeb74b5d899c74b14e63c0f289cd56be5050b9f',
  ],
} satisfies Series
