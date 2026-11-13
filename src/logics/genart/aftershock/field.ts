// The calm surface of an Aftershock plate: a field of fine patterns computed
// pixel by pixel.
//
// Every pattern family is written as a signed distance to the ink, in units
// of the canvas short side: ruled lines and waves are the level sets of a
// (bent) linear coordinate, chevrons of a zigzag, contours the level sets of
// a value-noise relief, rings the level sets of the distance to a few
// centres, and dots the distance to the nearest lattice point minus a
// radius. A distance divided by the gradient of its field gives a line of
// even width (Inigo Quilez, "Distance estimation" and "Value noise
// derivatives", https://iquilezles.org/articles/), and comparing it to half
// a pixel gives an anti-aliased edge at any canvas size.

import type { Rng } from '../random'
import { int, range } from '../random'

/** Euclidean length; Math.hypot is much slower in the per-pixel loops. */
function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

export type RGB = readonly [number, number, number]

/** Value noise on a hashed 256-lattice, with its analytic derivatives. */
export class ValueNoise {
  private perm = new Uint8Array(512)
  private val = new Float32Array(256)
  /** Derivatives of the last `grad` call. */
  dx = 0
  dy = 0

  constructor(r: Rng) {
    const idx = Array.from({ length: 256 }, (_, i) => i)
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      const t = idx[i]
      idx[i] = idx[j]
      idx[j] = t
    }
    for (let i = 0; i < 512; i++)
      this.perm[i] = idx[i & 255]
    for (let i = 0; i < 256; i++)
      this.val[i] = r()
  }

  /** Smooth value in [0, 1]. */
  at(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const X = xi & 255
    const Y = yi & 255
    const p = this.perm
    const v = this.val
    const a = v[p[p[X] + Y]]
    const b = v[p[p[X + 1] + Y]]
    const c = v[p[p[X] + Y + 1]]
    const d = v[p[p[X + 1] + Y + 1]]
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
  }

  /** Same value, and stores its partial derivatives in `dx` and `dy`. */
  grad(x: number, y: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const X = xi & 255
    const Y = yi & 255
    const p = this.perm
    const v = this.val
    const a = v[p[p[X] + Y]]
    const k1 = v[p[p[X + 1] + Y]] - a
    const k2 = v[p[p[X] + Y + 1]] - a
    const k3 = v[p[p[X + 1] + Y + 1]] - a - k1 - k2
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    this.dx = 6 * fx * (1 - fx) * (k1 + k3 * uy)
    this.dy = 6 * fy * (1 - fy) * (k2 + k3 * ux)
    return a + k1 * ux + k2 * uy + k3 * ux * uy
  }
}

export const RULED = 0
export const WAVES = 1
export const CHEVRON = 2
export const DOTS = 3
export const CONTOURS = 4
export const RINGS = 5

/** One pattern: a family and its parameters, all lengths in short-side units. */
export interface Layer {
  family: number
  cos: number
  sin: number
  pitch: number
  /** Phase of the lines, as a fraction of the pitch. */
  shift: number
  /** Amplitude of the slow bend added to the coordinate. */
  bend: number
  /** Waves: amplitude, angular frequency, phase. */
  amp: number
  freq: number
  phase: number
  /** Chevron: half period of the zigzag. */
  zig: number
  /** Contours: relief frequency, level step, smallest gradient allowed. */
  relief: number
  step: number
  gmin: number
  /** Rings: centres. */
  cx: number[]
  cy: number[]
}

export function makeLayer(r: Rng, family: number, pitch: number, relief: ValueNoise): Layer {
  // Every layer draws the same number of values, whatever its family, so
  // the stream stays aligned when a family changes.
  const angle = r() * Math.PI
  const shift = r()
  const bend = range(r, 0.01, 0.045)
  const amp = range(r, 0.012, 0.04)
  const wavelength = range(r, 0.07, 0.2)
  const phase = r() * Math.PI * 2
  const zig = pitch * range(r, 3, 7)
  const reliefFreq = range(r, 2.2, 4.2)
  const n = int(r, 1, 3)
  const cx: number[] = []
  const cy: number[] = []
  for (let i = 0; i < 3; i++) {
    const x = range(r, -0.6, 0.6)
    const y = range(r, -0.6, 0.6)
    if (i < n) {
      cx.push(x)
      cy.push(y)
    }
  }
  const layer: Layer = {
    family,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    pitch: family === DOTS ? pitch * 1.45 : family === CONTOURS ? pitch * 1.25 : pitch,
    shift,
    bend,
    amp,
    freq: (Math.PI * 2) / wavelength,
    phase,
    zig,
    relief: reliefFreq,
    step: 0,
    gmin: 0,
    cx,
    cy,
  }
  if (family === CONTOURS) {
    // Measure the typical slope of the relief on a fixed grid, then pick the
    // level step that spaces the contours about one pitch apart there.
    const slopes: number[] = []
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 24; j++) {
        reliefAt(relief, layer, -1 + i / 11.5, -1 + j / 11.5)
        slopes.push(Math.hypot(relief.dx, relief.dy))
      }
    }
    slopes.sort((a, b) => a - b)
    const median = slopes[slopes.length >> 1]
    layer.step = median * layer.pitch
    // only guards the division: the true gradient keeps the contour width
    // constant, and the lines simply thin out over flat ground
    layer.gmin = median * 0.02
  }
  return layer
}

/** Two octaves of the relief; leaves the summed derivatives in noise.dx/dy. */
function reliefAt(noise: ValueNoise, L: Layer, x: number, y: number): number {
  const f = L.relief
  const a = noise.grad(x * f + 17.3, y * f + 5.1)
  const ax = noise.dx * f
  const ay = noise.dy * f
  const f2 = f * 2.07
  const b = noise.grad(x * f2 + 3.7, y * f2 + 41.9)
  noise.dx = ax + 0.45 * noise.dx * f2
  noise.dy = ay + 0.45 * noise.dy * f2
  return a + 0.45 * b
}

/** Distance from v to the nearest integer. */
function tri(v: number): number {
  return Math.abs(v - Math.round(v))
}

/**
 * Signed distance from (x, y) to the ink of a layer, in short-side units.
 * `tone` in [0, 1] sets the line weight, `warp` in [-1, 1] the slow bend.
 */
export function inkDistance(L: Layer, x: number, y: number, tone: number, warp: number, relief: ValueNoise): number {
  const xr = x * L.cos + y * L.sin
  const yr = y * L.cos - x * L.sin
  const p = L.pitch
  const hw = p * (0.1 + 0.18 * tone)
  switch (L.family) {
    case RULED: {
      const v = (yr + warp * L.bend) / p + L.shift
      return tri(v) * p - hw
    }
    case WAVES: {
      const arg = xr * L.freq + L.phase + warp * 1.5
      const v = (yr + L.amp * Math.sin(arg)) / p + L.shift
      const s = L.amp * L.freq * Math.cos(arg)
      return tri(v) * p / Math.sqrt(1 + s * s) - hw
    }
    case CHEVRON: {
      const z = xr / L.zig
      const t = Math.abs(z - 2 * Math.round(z / 2))
      const v = (yr + L.zig * t + warp * L.bend) / p + L.shift
      return tri(v) * p * Math.SQRT1_2 - hw
    }
    case DOTS: {
      const rowH = p * 0.866
      const yb = yr + warp * L.bend
      const j = Math.round(yb / rowH)
      const xo = xr - (j & 1) * p * 0.5
      const i = Math.round(xo / p)
      const radius = p * (0.14 + 0.28 * tone)
      return len(xo - i * p, yb - j * rowH) - radius
    }
    case CONTOURS: {
      const n = reliefAt(relief, L, x, y)
      const g = Math.max(L.gmin, len(relief.dx, relief.dy))
      return tri(n / L.step + L.shift) * L.step / g - hw
    }
    default: {
      let d = Infinity
      for (let k = 0; k < L.cx.length; k++)
        d = Math.min(d, len(x - L.cx[k], y - L.cy[k]))
      return tri((d + warp * L.bend * 0.5) / p + L.shift) * p - hw
    }
  }
}

/** The whole calm field: one layer, or a patchwork of layers in Voronoi cells. */
export interface Field {
  layers: Layer[]
  /** Patchwork sites, one per layer; empty for a single layer. */
  sx: number[]
  sy: number[]
  /** Half width of the bare gap between patches. */
  gap: number
  tone: ValueNoise
  warp: ValueNoise
  relief: ValueNoise
  /** Frequency of the line-weight noise. */
  toneFreq: number
}

/** Grid step of the baked tone and bend, in short-side units. */
const BAKE = 1 / 200

/**
 * The line weight and the bend vary slowly, so they are baked once on a
 * fixed grid (in short-side units, hence the same at every canvas size)
 * and read back with bilinear interpolation: several times cheaper than
 * evaluating the noise at every pixel of an 8K export.
 */
export class Baked {
  private nx: number
  private ny: number
  private tone: Float32Array
  private warp: Float32Array
  /** Values of the last `read`. */
  t = 0
  w = 0

  constructor(F: Field, private x0: number, private y0: number, x1: number, y1: number) {
    this.nx = Math.ceil((x1 - x0) / BAKE) + 2
    this.ny = Math.ceil((y1 - y0) / BAKE) + 2
    this.tone = new Float32Array(this.nx * this.ny)
    this.warp = new Float32Array(this.nx * this.ny)
    const tf = F.toneFreq
    for (let j = 0; j < this.ny; j++) {
      const y = y0 + j * BAKE
      for (let i = 0; i < this.nx; i++) {
        const x = x0 + i * BAKE
        const t0 = 0.7 * F.tone.at(x * tf + 3.1, y * tf + 7.7) + 0.3 * F.tone.at(x * tf * 2.3 + 40.2, y * tf * 2.3 + 9.4)
        this.tone[j * this.nx + i] = Math.min(1, Math.max(0, (t0 - 0.25) * 2))
        this.warp[j * this.nx + i] = F.warp.at(x * 1.6 + 11.5, y * 1.6 + 2.3) * 2 - 1
      }
    }
  }

  /** Tone and bend at (x, y), clamped to the baked area. */
  read(x: number, y: number): void {
    let gx = (x - this.x0) / BAKE
    let gy = (y - this.y0) / BAKE
    gx = Math.min(Math.max(gx, 0), this.nx - 1.001)
    gy = Math.min(Math.max(gy, 0), this.ny - 1.001)
    const i = gx | 0
    const j = gy | 0
    const fx = gx - i
    const fy = gy - j
    const k = j * this.nx + i
    const n = this.nx
    const T = this.tone
    const Wp = this.warp
    const ta = T[k] + (T[k + 1] - T[k]) * fx
    const tb = T[k + n] + (T[k + n + 1] - T[k + n]) * fx
    this.t = ta + (tb - ta) * fy
    const wa = Wp[k] + (Wp[k + 1] - Wp[k]) * fx
    const wb = Wp[k + n] + (Wp[k + n + 1] - Wp[k + n]) * fx
    this.w = wa + (wb - wa) * fy
  }
}
