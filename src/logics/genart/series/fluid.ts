// "Fluid" — ink let into still water, simulated with Jos Stam's Stable Fluids.
//
// A tank of water is simulated on a fixed grid (../fluid/solver.ts): emitters
// placed by the hash push the water and release dye — rising plumes, sinking
// drops, jets fired at each other, a stirring spoon or a scatter of small
// bursts — and the dye is carried by the velocity field for a fixed number of
// steps, with vorticity confinement feeding the small eddies back in. The
// result is printed as soft washes of ink on paper or as smoke on a dark
// ground, with pigment that can pool at its edges or settle into the grain.
//
// Every length is a fraction of the canvas short side. The grid always has
// GRID cells on the short side and grows along the long side (up to 3:1), and
// the colour work happens on a refined grid of fixed size, so a hash gives
// the same picture at any resolution. On a wider or taller canvas the tank is
// wider or taller: the central square keeps its emitters and every extra tile
// on the sides gets its own, from its own stream.

import type { Rng } from '../random'
import type { Series } from '../types'
import { refine, resample } from '../fluid/image'
import { advectDye, advectVelocity, buoyancy, confine, diffuse, makeFluid, project, splatDye, splatForce, swirl } from '../fluid/solver'
import { chance, int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Sumi', 22], ['Indigo', 16], ['Marbled', 18], ['Smoke', 16], ['Ember', 14], ['Lagoon', 14]],
  Flow: [['Plumes', 24], ['Drops', 24], ['Collision', 18], ['Stir', 16], ['Scatter', 18]],
  Turbulence: [['Calm', 30], ['Curling', 45], ['Wild', 25]],
  Ink: [['Wash', 45], ['Pooled', 35], ['Granulated', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }
type Flow = Features['Flow']

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Flow: weighted(r, TRAITS.Flow),
    Turbulence: weighted(r, TRAITS.Turbulence),
    Ink: weighted(r, TRAITS.Ink),
  }
}

// ---------------------------------------------------------------------------
// Palettes: a ground and two or three inks with their odds per emitter.
// ---------------------------------------------------------------------------

interface Palette {
  ground: string
  dark: boolean
  inks: readonly string[]
  odds: readonly number[]
  /** Density at which an ink reaches its full colour. */
  strength: number
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Sumi: { ground: '#ede7da', dark: false, inks: ['#151413', '#5b5753'], odds: [0.7, 0.3], strength: 1 },
  Indigo: { ground: '#eef0ec', dark: false, inks: ['#1b2b57', '#4d7fa8', '#a8412f'], odds: [0.55, 0.37, 0.08], strength: 1 },
  Marbled: { ground: '#f2e9d7', dark: false, inks: ['#17656e', '#cf962f', '#a8362a'], odds: [0.4, 0.35, 0.25], strength: 1 },
  Smoke: { ground: '#0d0e11', dark: true, inks: ['#dfe3e8', '#7d8794'], odds: [0.6, 0.4], strength: 1 },
  Ember: { ground: '#130b09', dark: true, inks: ['#ff8a3a', '#ffd982', '#c42d24'], odds: [0.45, 0.3, 0.25], strength: 1 },
  Lagoon: { ground: '#05141c', dark: true, inks: ['#37cfc6', '#e6f1ef', '#de5e9c'], odds: [0.45, 0.33, 0.22], strength: 1 },
}

// ---------------------------------------------------------------------------
// Simulation constants
// ---------------------------------------------------------------------------

/** Velocity cells on the short side (the dye grid is twice as fine). */
const GRID = 72
/** Refinement of the dye grid for the colour pass (fixed: size-independent). */
const REFINE = 3
/** Fixed run: STEPS steps of DT time units (emitter times are in time units). */
const STEPS = 80
const DT = 1.25
const DURATION = STEPS * DT
const JACOBI = 14
const MAX_ASPECT = 3

/**
 * eps: vorticity confinement (cells per step squared); visc: viscosity of
 * the implicit diffusion; swirl: peak speed of the ambient eddies the water
 * starts with, in composition units per step.
 */
const TURBULENCE: Record<Features['Turbulence'], { eps: number, visc: number, swirl: number }> = {
  Calm: { eps: 0.06, visc: 0.015, swirl: 0.0012 },
  Curling: { eps: 0.14, visc: 0, swirl: 0.003 },
  Wild: { eps: 0.3, visc: 0, swirl: 0.0045 },
}

/** Buoyancy per unit of dye density, in composition units per step squared. */
const LIFT: Record<Flow, number> = {
  Plumes: 0.0006,
  Drops: -0.0002,
  Collision: 0,
  Stir: 0,
  Scatter: 0,
}

// ---------------------------------------------------------------------------
// Polynomial sine: exactly reproducible in every engine (Math.sin is not).
// ---------------------------------------------------------------------------

const PI = 3.141592653589793
const TAU = 2 * PI

function sinp(x: number): number {
  x -= TAU * Math.floor(x / TAU + 0.5)
  if (x > PI / 2)
    x = PI - x
  else if (x < -PI / 2)
    x = -PI - x
  const x2 = x * x
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110)))))
}
const cosp = (x: number) => sinp(x + PI / 2)

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

/** One source of dye and momentum. Positions and radii in composition units. */
interface Emitter {
  x: number
  y: number
  /** Dye radius. */
  r: number
  /** Ink channel. */
  c: number
  /** Dye added per step at the centre. */
  amt: number
  /** Push per step, composition units per step squared. */
  f: number
  /** Direction of the push (0 = right, PI / 2 = down). */
  ang: number
  /** Wobble of the direction: amplitude (radians), period (steps), phase. */
  swing: number
  period: number
  phase: number
  /** Turning force of a whirlpool of radius r (0 for an ordinary emitter). */
  spin: number
  /** Active from time s0 to s1 (excluded). */
  s0: number
  s1: number
}

interface Domain { x0: number, x1: number, y0: number, y1: number }

function ink(r: Rng, odds: readonly number[]): number {
  let x = r()
  for (let i = 0; i < odds.length; i++) {
    x -= odds[i]
    if (x < 0)
      return i
  }
  return odds.length - 1
}

/** Visible part of a unit tile: a strip when the tile sticks out of the tank. */
interface Rect { x: number, y: number, w: number, h: number }

function visible(kx: number, ky: number, dom: Domain): Rect | undefined {
  const x = Math.max(kx, dom.x0)
  const y = Math.max(ky, dom.y0)
  const w = Math.min(kx + 1, dom.x1) - x
  const h = Math.min(ky + 1, dom.y1) - y
  return w > 0.05 && h > 0.05 ? { x, y, w, h } : undefined
}

/**
 * Emitters of one tile, placed in its visible part. The central tile is the
 * primary one; side tiles of a long canvas get lighter versions.
 */
function tileEmitters(flow: Flow, r: Rng, odds: readonly number[], rect: Rect, dom: Domain, primary: boolean): Emitter[] {
  const out: Emitter[] = []
  // from tile-local coordinates (0..1 over the visible part) to the tank
  const X = (u: number) => rect.x + u * rect.w
  const Y = (v: number) => rect.y + v * rect.h
  // spreads shrink a little in a narrow strip
  const span = Math.max(0.5, Math.min(rect.w, rect.h))
  const base = (x: number, y: number): Emitter => ({
    x,
    y,
    r: 0.03,
    c: ink(r, odds),
    amt: 0.1,
    f: 0,
    ang: 0,
    swing: 0,
    period: 40,
    phase: r() * TAU,
    spin: 0,
    s0: 0,
    s1: DURATION,
  })
  if (flow === 'Plumes') {
    // sources along the bottom of the tank, rising and wavering
    const n = primary ? int(r, 3, 5) : int(r, 1, 3)
    for (let i = 0; i < n; i++) {
      const e = base(X((i + 0.5 + range(r, -0.3, 0.3)) / n), 0)
      e.y = dom.y1 - range(r, 0.04, 0.09)
      e.r = range(r, 0.03, 0.055)
      e.amt = range(r, 0.35, 0.55)
      e.f = range(r, 0.002, 0.0035)
      e.ang = -PI / 2 + range(r, -0.35, 0.35)
      e.swing = range(r, 0.2, 0.6)
      e.period = range(r, 20, 50)
      e.s0 = int(r, 0, 20)
      e.s1 = e.s0 + int(r, 55, 80)
      out.push(e)
    }
  }
  else if (flow === 'Drops') {
    // heavy drops let fall from above: they sink and curl into rings
    const n = primary ? int(r, 4, 7) : int(r, 2, 4)
    for (let i = 0; i < n; i++) {
      const e = base(X(range(r, 0.1, 0.9)), Y(range(r, 0.06, 0.55)))
      e.r = range(r, 0.04, 0.08)
      e.amt = range(r, 0.6, 1)
      e.f = range(r, 0.003, 0.005)
      e.ang = PI / 2 + range(r, -0.3, 0.3)
      e.s0 = int(r, 0, 50)
      e.s1 = e.s0 + int(r, 6, 12)
      out.push(e)
    }
  }
  else if (flow === 'Collision') {
    // pairs of jets fired at each other: mushroom-shaped vortex pairs
    const n = primary ? int(r, 2, 4) : int(r, 1, 2)
    for (let i = 0; i < n; i++) {
      const cx = X(range(r, 0.25, 0.75))
      const cy = Y(range(r, 0.25, 0.75))
      const a = r() * TAU
      const d = range(r, 0.25, 0.4) * span
      const f = range(r, 0.0018, 0.003)
      const s0 = int(r, 0, 25)
      const len = int(r, 40, 65)
      for (const side of [1, -1]) {
        const e = base(cx + side * d * cosp(a), cy + side * d * sinp(a))
        e.r = range(r, 0.035, 0.055)
        e.amt = range(r, 0.3, 0.45)
        e.f = f
        e.ang = a + (side > 0 ? PI : 0)
        e.swing = range(r, 0, 0.12)
        e.period = range(r, 20, 50)
        e.s0 = s0
        e.s1 = s0 + len
        out.push(e)
      }
    }
  }
  else if (flow === 'Stir') {
    // a spoon drawn round the bowl, ink let in on its path, and the whole
    // bowl turning slowly the same way
    const cx = X(primary ? range(r, 0.42, 0.58) : range(r, 0.3, 0.7))
    const cy = Y(primary ? range(r, 0.42, 0.58) : range(r, 0.3, 0.7))
    const R = (primary ? range(r, 0.2, 0.3) : range(r, 0.12, 0.2)) * span
    const dir = chance(r, 0.5) ? 1 : -1
    const eye = base(cx, cy)
    eye.r = R * 1.7
    eye.amt = 0
    eye.spin = dir * range(r, 0.00004, 0.0001)
    eye.s1 = int(r, 50, 80)
    out.push(eye)
    const m = int(r, 3, 5)
    const a0 = r() * TAU
    for (let i = 0; i < m; i++) {
      const a = a0 + i * TAU / m
      const e = base(cx + R * cosp(a), cy + R * sinp(a))
      e.r = range(r, 0.035, 0.06)
      e.amt = range(r, 0.25, 0.4)
      e.f = range(r, 0.0015, 0.0025)
      e.ang = a + dir * PI / 2
      e.s0 = int(r, 0, 15)
      e.s1 = e.s0 + int(r, 50, 75)
      out.push(e)
    }
    if (primary && chance(r, 0.5)) {
      // a counter-stir inside, later
      const k = int(r, 2, 3)
      const R2 = R * range(r, 0.35, 0.55)
      for (let i = 0; i < k; i++) {
        const a = a0 + (i + 0.5) * TAU / k
        const e = base(cx + R2 * cosp(a), cy + R2 * sinp(a))
        e.r = range(r, 0.03, 0.045)
        e.amt = range(r, 0.3, 0.45)
        e.f = range(r, 0.0015, 0.0022)
        e.ang = a - dir * PI / 2
        e.s0 = int(r, 40, 60)
        e.s1 = e.s0 + int(r, 20, 35)
        out.push(e)
      }
    }
  }
  else {
    // a scatter of short bursts in every direction
    const n = primary ? int(r, 8, 14) : int(r, 4, 7)
    for (let i = 0; i < n; i++) {
      const e = base(X(range(r, 0.08, 0.92)), Y(range(r, 0.08, 0.92)))
      e.r = range(r, 0.025, 0.045)
      e.amt = range(r, 0.35, 0.6)
      e.f = range(r, 0.002, 0.0035)
      e.ang = r() * TAU
      e.swing = range(r, 0, 0.6)
      e.period = range(r, 10, 30)
      e.s0 = int(r, 0, 60)
      e.s1 = e.s0 + int(r, 12, 28)
      out.push(e)
    }
  }
  return out
}

function emitters(hash: string, flow: Flow, odds: readonly number[], dom: Domain): Emitter[] {
  const all = tileEmitters(flow, stream(hash, 'emitters'), odds, { x: 0, y: 0, w: 1, h: 1 }, dom, true)
  // extra tiles along the long side, each from its own stream
  const tiles: [number, number][] = []
  for (let k = 1; k < 3; k++) {
    tiles.push([k, 0], [-k, 0], [0, k], [0, -k])
  }
  for (const [kx, ky] of tiles) {
    const rect = visible(kx, ky, dom)
    if (!rect)
      continue
    const r = stream(hash, `emitters:${kx}:${ky}`)
    for (const e of tileEmitters(flow, r, odds, rect, dom, false)) {
      if (e.x > dom.x0 + 0.02 && e.x < dom.x1 - 0.02 && e.y > dom.y0 + 0.02 && e.y < dom.y1 - 0.02)
        all.push(e)
    }
  }
  return all
}

interface Eddy { x: number, y: number, R: number, w: number }
interface Haze { x: number, y: number, R: number, c: number, amt: number }

/**
 * The water is never quite still nor quite clean: per unit tile, from its own
 * stream, a few broad eddies to start with and a few trails of older,
 * well-diluted ink.
 */
function ambient(hash: string, odds: readonly number[], dom: Domain): { eddies: Eddy[], haze: Haze[] } {
  const eddies: Eddy[] = []
  const haze: Haze[] = []
  for (let ky = -2; ky <= 2; ky++) {
    for (let kx = -2; kx <= 2; kx++) {
      const rect = visible(kx, ky, dom)
      if (!rect)
        continue
      const r = stream(hash, `ambient:${kx}:${ky}`)
      const n = int(r, 3, 5)
      for (let i = 0; i < n; i++) {
        eddies.push({
          x: rect.x + r() * rect.w,
          y: rect.y + r() * rect.h,
          R: range(r, 0.2, 0.4),
          w: (chance(r, 0.5) ? 1 : -1) * range(r, 0.5, 1),
        })
      }
      // older ink left as faint trails: beads along a wandering path
      const m = int(r, 1, 3)
      for (let i = 0; i < m; i++) {
        let x = rect.x + r() * rect.w
        let y = rect.y + r() * rect.h
        let a = r() * TAU
        const c = ink(r, odds)
        const amt = range(r, 0.06, 0.14)
        const beads = int(r, 8, 16)
        for (let b = 0; b < beads; b++) {
          haze.push({ x, y, R: range(r, 0.02, 0.04), c, amt })
          a += range(r, -0.5, 0.5)
          x += 0.025 * cosp(a)
          y += 0.025 * sinp(a)
        }
      }
    }
  }
  return { eddies, haze }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function hex(c: string): [number, number, number] {
  const n = Number.parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Integer lattice hash in [0, 1). */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y, 0x165667B1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Sum of smooth value-noise octaves over a gw x gh grid, each octave a lattice
 * of `cell` samples (with its weight and seed). The lattice is anchored at
 * sample (ox, oy), the corner of the central square, so the grain under the
 * square is the same whatever the canvas ratio.
 */
function noiseField(gw: number, gh: number, ox: number, oy: number, octaves: [number, number, number][]): Float32Array {
  const out = new Float32Array(gw * gh)
  for (const [cell, weight, seed] of octaves) {
    const i0 = Math.floor(-ox / cell)
    const j0 = Math.floor(-oy / cell)
    const lw = Math.floor((gw - 1 - ox) / cell) - i0 + 2
    const lh = Math.floor((gh - 1 - oy) / cell) - j0 + 2
    const lat = new Float32Array(lw * lh)
    for (let j = 0; j < lh; j++) {
      for (let i = 0; i < lw; i++)
        lat[j * lw + i] = hash2(i0 + i, j0 + j, seed)
    }
    for (let y = 0; y < gh; y++) {
      const fy = (y - oy) / cell
      const j = Math.floor(fy)
      let ty = fy - j
      ty = ty * ty * (3 - 2 * ty)
      const r0 = (j - j0) * lw
      for (let x = 0; x < gw; x++) {
        const fx = (x - ox) / cell
        const i = Math.floor(fx)
        let tx = fx - i
        tx = tx * tx * (3 - 2 * tx)
        const o = r0 + i - i0
        const a = lat[o] + (lat[o + 1] - lat[o]) * tx
        const b = lat[o + lw] + (lat[o + lw + 1] - lat[o + lw]) * tx
        out[y * gw + x] += weight * (a + (b - a) * ty)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const turb = TURBULENCE[f.Turbulence]
  const K = pal.inks.length

  // tank: GRID cells on the short side, the long side follows the canvas
  const S = Math.min(W, H)
  const aspect = Math.min(MAX_ASPECT, Math.max(W, H) / S)
  const long = Math.round(GRID * aspect)
  const nx = W >= H ? long : GRID
  const ny = W >= H ? GRID : long
  const dom: Domain = {
    x0: 0.5 - nx / GRID / 2,
    x1: 0.5 + nx / GRID / 2,
    y0: 0.5 - ny / GRID / 2,
    y1: 0.5 + ny / GRID / 2,
  }
  const em = emitters(hash, f.Flow, pal.odds, dom)
  const amb = ambient(hash, pal.odds, dom)

  // --- simulation, in velocity cells ---
  const fl = makeFluid(nx, ny, K)
  const cx = (x: number) => 0.5 + (x - dom.x0) * GRID
  const cy = (y: number) => 0.5 + (y - dom.y0) * GRID
  const lift = LIFT[f.Flow] * GRID
  const RAMP = 4
  for (const e of amb.eddies)
    swirl(fl, cx(e.x), cy(e.y), e.R * GRID, e.w * turb.swirl * GRID)
  for (const h of amb.haze)
    splatDye(fl, cx(h.x), cy(h.y), h.R * GRID, h.c, h.amt)
  project(fl, JACOBI * 4)
  for (let s = 0; s < STEPS; s++) {
    const t = s * DT
    for (const e of em) {
      if (t < e.s0 || t >= e.s1)
        continue
      const env = Math.min(1, (t - e.s0 + DT) / RAMP, (e.s1 - t) / RAMP) * DT
      const x = cx(e.x)
      const y = cy(e.y)
      if (e.spin !== 0) {
        swirl(fl, x, y, e.r * GRID, e.spin * GRID * env)
        continue
      }
      if (e.f > 0) {
        const a = e.ang + e.swing * sinp(TAU * t / e.period + e.phase)
        const k = e.f * GRID * env
        splatForce(fl, x, y, e.r * GRID * 1.4, k * cosp(a), k * sinp(a))
      }
      splatDye(fl, x, y, e.r * GRID, e.c, e.amt * env)
    }
    buoyancy(fl, lift * DT)
    confine(fl, turb.eps * DT)
    if (turb.visc > 0)
      diffuse(fl, turb.visc * DT, 4)
    advectVelocity(fl, DT)
    project(fl, JACOBI)
    advectDye(fl, DT)
  }

  // --- colour on the refined grid ---
  const gw = fl.dw * REFINE
  const gh = fl.dh * REFINE
  const per = GRID * 2 * REFINE // refined samples per composition unit
  const chans: Float32Array[] = []
  for (let c = 0; c < K; c++)
    chans.push(refine(fl.dye[c], fl.dw, fl.dh, REFINE))
  const n = gw * gh

  // edge pooling: pigment collects where the total density changes fast
  const pool = new Float32Array(f.Ink === 'Pooled' ? n : 0)
  if (f.Ink === 'Pooled') {
    const tot = new Float32Array(n)
    for (const ch of chans) {
      for (let i = 0; i < n; i++)
        tot[i] += ch[i]
    }
    for (let y = 0; y < gh; y++) {
      const up = (y > 0 ? y - 1 : 0) * gw
      const dn = (y < gh - 1 ? y + 1 : gh - 1) * gw
      for (let x = 0; x < gw; x++) {
        const l = x > 0 ? x - 1 : 0
        const r = x < gw - 1 ? x + 1 : gw - 1
        const gx = tot[y * gw + r] - tot[y * gw + l]
        const gy = tot[dn + x] - tot[up + x]
        // gradient per composition unit, softly saturated
        const g = Math.sqrt(gx * gx + gy * gy) * per * 0.5 * 0.06
        pool[y * gw + x] = g / (1 + g)
      }
    }
  }

  // paper or granulation noise, on lattice coordinates anchored to the square
  const seed = (stream(hash, 'grain')() * 4294967296) | 0
  const ox = Math.round(-dom.x0 * per)
  const oy = Math.round(-dom.y0 * per)

  const ground = hex(pal.ground)
  // per ink and colour channel: absorbance (paper) or emission (dark ground)
  const coef = pal.inks.map((c) => {
    const rgb = hex(c)
    return rgb.map((v, i) => {
      const g = ground[i]
      if (pal.dark)
        return Math.max(0, -Math.log(Math.max(1e-3, 1 - (v - g) / (255 - g))))
      return Math.max(0, -Math.log(Math.max(4, v) / g))
    })
  })

  const grain = f.Ink === 'Granulated'
    ? noiseField(gw, gh, ox, oy, [[2, 0.55, seed], [7, 0.45, seed ^ 0x5BD1E995]])
    : new Float32Array(0)
  const rgb = new Float32Array(n * 3)
  const cf = new Float64Array(K * 3)
  coef.forEach((c, k) => cf.set(c, k * 3))
  const [g0, g1, g2] = ground
  for (let i = 0; i < n; i++) {
    let mod = pal.strength
    if (f.Ink === 'Granulated')
      mod *= 0.8 + 0.4 * grain[i]
    else if (f.Ink === 'Pooled')
      mod *= 0.8 + 1.4 * pool[i]
    let a0 = 0
    let a1 = 0
    let a2 = 0
    for (let c = 0; c < K; c++) {
      const d = chans[c][i] * mod
      a0 += d * cf[c * 3]
      a1 += d * cf[c * 3 + 1]
      a2 += d * cf[c * 3 + 2]
    }
    const o = i * 3
    if (pal.dark) {
      rgb[o] = g0 + (255 - g0) * (1 - Math.exp(-a0))
      rgb[o + 1] = g1 + (255 - g1) * (1 - Math.exp(-a1))
      rgb[o + 2] = g2 + (255 - g2) * (1 - Math.exp(-a2))
    }
    else {
      rgb[o] = g0 * Math.exp(-a0)
      rgb[o + 1] = g1 * Math.exp(-a1)
      rgb[o + 2] = g2 * Math.exp(-a2)
    }
  }

  // --- pixels ---
  const spanW = nx / GRID * S
  const spanH = ny / GRID * S
  const img = ctx.createImageData(W, H)
  resample(rgb, gw, gh, img.data, W, H, (W - spanW) / 2, (H - spanH) / 2, spanW, spanH)
  ctx.putImageData(img, 0, 0)
}

export default {
  slug: 'fluid',
  title: 'Fluid',
  summary: 'Ink let into still water and carried by Stam\'s stable fluids: rising plumes, sinking drops, colliding jets and stirred bowls, in soft washes or smoke.',
  order: 440,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x0f1d0f1d ("gallery" stream): the first hash found for
  // each palette x flow pair, twelve pairs in all. The Ember plumes found
  // ninth lead as the cover; the others keep their order.
  gallery: [
    '0x0407ce5d3d140b5eaaf1443321d62e95956e97bfe4dc1fdcd0d2c36cafc74cad',
    '0x0503097e49cbfcf97f235d34116b68908a3502abd1322826935ee3351f0fd7ca',
    '0x18389d004561af35b33a0ca639b42d90ba0763ac24288221fe893a1d7d649f9f',
    '0x9d7e733c495629158f5d9374830d0cc7fa338d83d9cc18599d7ed9e6ef7bb5cf',
    '0x3847834daa65769380269303fc56708f5059bdaaa85739f952a95919e796a127',
    '0xf13a512ff9cfe09a1ced13e0494b66549b0ed9268c64addd25e2609a797ac5e5',
    '0x1d5f156068ee4af48100a05b449a603f057bfeb13a35a3bc709afdc2c7b7b98a',
    '0x50f9cc91bc8491639a92cf9601d35ef81420c27d97efed53dda6353e0644ac4e',
    '0xf9f033da1ab1cec4cc76dc7d587b69147cab96161161db17122855054acd0ae3',
    '0x7d8fc3860da706cb91048ef2f3e185f360ecf0738b6ec29c05c6443579896ddc',
    '0x3ec6a9348b3c2d994e4083e9e3810345266a5bfc6de2bcf1554b66b39741501a',
    '0xa427bf27d8dcd76f742932ea98bfd9213f23637be610e163366f918fcfbad916',
  ],
} satisfies Series
