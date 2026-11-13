// The shocks that struck an Aftershock plate, and the per-pixel sampler that
// replays them.
//
// A shock is a shape (circle, box, triangle, spike or a band across the
// plate), described by its signed distance function after Inigo Quilez's
// "2D distance functions" (https://iquilezles.org/articles/distfunctions2d/),
// and an effect on whatever lies inside it: a fault that slices the surface
// into strips and slides them along their cracks, a pixelation, a warp (a
// lens, a swirl or a turned plug), an erosion, or an inversion of ink and
// ground. Shocks are replayed oldest first, so each later one acts on the
// surface the earlier ones left: sampling a pixel walks the list backwards,
// mapping the point through each shock it falls in.

import type { Rng } from '../random'
import type { Baked, Field, RGB } from './field'
import { chance, int, range, weighted } from '../random'
import { inkDistance } from './field'

/** Euclidean length; Math.hypot is much slower in the per-pixel loops. */
function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

export const FAULT = 0
export const PIXEL = 1
export const WARP = 2
export const ERODE = 3
export const INVERT = 4

const CIRCLE = 0
const BOX = 1
const TRIANGLE = 2
const SPIKE = 3
const BAND = 4

/** Ordered-dither thresholds (Bayer 4 × 4), 0 to 15. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** Line-screen thresholds: whole rows (or columns) of blocks turn at once. */
const LINES = [2, 10, 6, 14]

const LENS = 0
const SWIRL = 1
const TURN = 2

export interface Shock {
  shape: number
  effect: number
  cx: number
  cy: number
  cos: number
  sin: number
  /** Size parameters: radius, half sizes, half base and height, half width. */
  a: number
  b: number
  /** Squared radius beyond which the shock (and its seam) cannot be reached. */
  reach2: number
  /** Half width of the outline seam, 0 for none. */
  seam: number
  seamColour: RGB
  /** Fault: crack direction, crack positions across it, slide of each strip. */
  fcos: number
  fsin: number
  cuts: number[]
  slides: number[]
  /** Fault: direction of the slide, at an angle to the cracks. */
  scos: number
  ssin: number
  /** Fault: turn of each strip about the shock centre. */
  tcos: number[]
  tsin: number[]
  /** Fault: scale of each strip's pattern (1 for none) and its shade towards the ground. */
  zoom: number[]
  shade: number[]
  /** Pixelation: block size, screen (0 Bayer dots, 1 row stripes, 2 column stripes), and the colours of the blocks already sampled. */
  block: number
  screen: number
  blocks: Map<number, number>
  /** Warp: lens, swirl or turn, and its strength. */
  mode: number
  power: number
  /** Erosion: noise frequency and offset. */
  freq: number
  ox: number
  /** Inversion: true paints the ground in the accent colour. */
  stain: boolean
}

const SHAPES: Record<number, ReadonlyArray<readonly [number, number]>> = {
  [FAULT]: [[CIRCLE, 18], [BOX, 20], [TRIANGLE, 14], [SPIKE, 14], [BAND, 34]],
  [PIXEL]: [[CIRCLE, 26], [BOX, 26], [TRIANGLE, 16], [SPIKE, 12], [BAND, 20]],
  [WARP]: [[CIRCLE, 60], [BOX, 22], [TRIANGLE, 18]],
  [ERODE]: [[CIRCLE, 34], [BOX, 18], [TRIANGLE, 14], [SPIKE, 14], [BAND, 20]],
  [INVERT]: [[CIRCLE, 26], [BOX, 24], [TRIANGLE, 20], [SPIKE, 20], [BAND, 10]],
}

export interface ShockColours {
  ink: RGB
  accent: RGB
}

/**
 * Builds `count` shocks, the main one first, each smaller than the last.
 * `dominant` is the effect of the main shock (and of most aftershocks), or
 * -1 for a mixed sequence. `ex`, `ey` bound the centres, in short-side units.
 * `rd` draws the finer details of each shock, so that adding one never
 * moves the shapes drawn from `r`.
 */
export function buildShocks(r: Rng, rd: Rng, dominant: number, count: number, pitch: number, ex: number, ey: number, col: ShockColours): Shock[] {
  // the main shock, then aftershocks that are each smaller than the last
  const sizes: number[] = [range(r, 0.22, 0.36)]
  for (let i = 1; i < count; i++)
    sizes.push(range(r, 0.08, 0.25) * (count > 4 ? 0.85 : 1))
  sizes.sort((a, b) => b - a)

  const shocks: Shock[] = []
  const xs: number[] = []
  const ys: number[] = []
  let previous = -1
  for (let i = 0; i < count; i++) {
    let effect: number
    const roll = int(r, 0, 4)
    if (dominant < 0)
      effect = roll === previous ? (roll + 1) % 5 : roll
    else if (i === 0 || chance(r, 0.6))
      effect = dominant
    else
      effect = (dominant + 1 + (roll % 4)) % 5
    previous = effect
    const size = sizes[i]

    // Place the centre away from the earlier shocks: six candidates are
    // always drawn, so the stream does not depend on which one is kept.
    let cx = 0
    let cy = 0
    let found = false
    for (let t = 0; t < 6; t++) {
      const x = (r() * 2 - 1) * ex
      const y = (r() * 2 - 1) * ey
      if (found)
        continue
      let ok = true
      for (let j = 0; j < xs.length; j++) {
        if (Math.hypot(x - xs[j], y - ys[j]) < 0.55 * (size + sizes[j]))
          ok = false
      }
      if (ok || t === 5) {
        cx = x
        cy = y
        found = true
      }
    }
    xs.push(cx)
    ys.push(cy)

    const shape = weighted(r, SHAPES[effect])
    const angle = r() * Math.PI * 2
    let a = size
    let b = size
    let reach = size
    if (shape === BOX) {
      a = size * range(r, 0.55, 1.05)
      b = size * range(r, 0.45, 0.95)
      reach = Math.hypot(a, b)
    }
    else if (shape === TRIANGLE) {
      a = size * 1.05
      reach = a * 1.2
    }
    else if (shape === SPIKE) {
      a = size * range(r, 0.13, 0.24)
      b = size * range(r, 2, 3)
      reach = Math.hypot(a, b / 2) + 0.01
    }
    else if (shape === BAND) {
      a = size * range(r, 0.12, 0.34)
      reach = Infinity
    }
    if (effect === ERODE) {
      // erosion reads best as a patch, never as a whole weathered plate
      a *= 0.78
      b *= 0.78
      reach *= 0.78
    }

    const accentSeam = chance(r, 0.7)
    const outline = r()
    let seam = 0
    if (effect === FAULT)
      seam = shape === BAND || outline < 0.45 ? 0.0016 : 0
    else if (effect === WARP)
      seam = outline < 0.75 ? 0.0016 : 0
    else if (effect === PIXEL)
      seam = outline < 0.3 ? 0.0016 : 0

    // Fault: the cracks follow a band, or cross the shape at any angle.
    const crack = shape === BAND ? angle : r() * Math.PI * 2
    const nCuts = shape === BAND ? int(r, 0, 2) : int(r, 1, 3)
    const across = shape === BAND ? a : reach
    const cuts: number[] = []
    for (let k = 0; k < 3; k++) {
      const c = range(r, -0.7, 0.7) * across
      if (k < nCuts)
        cuts.push(c)
    }
    cuts.sort((p, q) => p - q)
    const slides: number[] = []
    let slide = 0
    for (let k = 0; k < 4; k++) {
      const step = range(r, 0.02, 0.075) * (r() < 0.5 ? -1 : 1)
      slide += step
      slides.push(slide)
    }
    const slideAngle = crack + range(r, 0.35, 1.2) * (r() < 0.5 ? -1 : 1)
    const tcos: number[] = []
    const tsin: number[] = []
    for (let k = 0; k < 4; k++) {
      const tilt = range(r, -0.16, 0.16) * 2
      tcos.push(Math.cos(tilt))
      tsin.push(Math.sin(tilt))
    }

    // Every other strip is also rescaled and shaded, so the fault reads
    // even on a fine periodic pattern, where a slide alone barely shows.
    const zoom: number[] = []
    const shade: number[] = []
    const denser = rd() < 0.5
    for (let k = 0; k < 4; k++) {
      const z = denser ? range(rd, 1.35, 1.7) : range(rd, 0.55, 0.72)
      const sh = range(rd, 0.25, 0.4)
      // even strips, so a band without cuts (one strip) is changed too
      zoom.push(k & 1 ? 1 : z)
      shade.push(k & 1 ? 0 : sh)
    }
    const sr = rd()
    const screen = sr < 0.5 ? 0 : sr < 0.75 ? 1 : 2

    // blocks a little larger than the pattern pitch, so that sampling a
    // regular pattern on them aliases into a coarser stripe
    const block = pitch * range(r, 1.2, 2.6)
    let mode = shape === CIRCLE ? (chance(r, 0.5) ? LENS : SWIRL) : TURN
    if (shape === CIRCLE && mode === LENS && effect === WARP && chance(r, 0.25))
      mode = TURN
    let power = 0
    const pr = r()
    if (mode === LENS)
      power = 0.25 + 0.25 * pr
    else if (mode === SWIRL)
      power = (1.4 + 2.2 * pr) * (r() < 0.5 ? -1 : 1)
    else
      power = (0.3 + 0.9 * pr) * (r() < 0.5 ? -1 : 1)

    const freq = range(r, 6, 13)
    const ox = range(r, 0, 100)
    const stain = chance(r, 0.55)
    // a plain inversion can match the density of the pattern around it:
    // its outline then keeps it legible
    if (effect === INVERT)
      seam = stain && outline < 0.7 ? 0 : 0.0016

    shocks.push({
      shape,
      effect,
      cx,
      cy,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
      a,
      b,
      reach2: (reach + 0.004) ** 2,
      seam,
      seamColour: accentSeam ? col.accent : col.ink,
      fcos: Math.cos(crack),
      fsin: Math.sin(crack),
      cuts,
      slides,
      scos: Math.cos(slideAngle),
      ssin: Math.sin(slideAngle),
      tcos,
      tsin,
      zoom,
      shade,
      block,
      screen,
      blocks: new Map(),
      mode,
      power,
      freq,
      ox,
      stain,
    })
  }
  return shocks
}

/** Signed distance to a shock's shape, in short-side units. */
function shapeDistance(s: Shock, x: number, y: number): number {
  const dx = x - s.cx
  const dy = y - s.cy
  const lx = dx * s.cos + dy * s.sin
  const ly = dy * s.cos - dx * s.sin
  switch (s.shape) {
    case CIRCLE:
      return len(lx, ly) - s.a
    case BOX: {
      const qx = Math.abs(lx) - s.a
      const qy = Math.abs(ly) - s.b
      return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
    }
    case TRIANGLE: {
      // sdEquilateralTriangle
      const k = Math.sqrt(3)
      let px = Math.abs(lx) - s.a
      let py = ly + s.a / k
      if (px + k * py > 0) {
        const nx = (px - k * py) / 2
        py = (-k * px - py) / 2
        px = nx
      }
      px -= Math.min(Math.max(px, -2 * s.a), 0)
      return -len(px, py) * Math.sign(py)
    }
    case SPIKE: {
      // sdTriangleIsosceles, apex up, centred on its height
      const qx = s.a
      const qy = s.b
      const px = Math.abs(lx)
      const py = ly + s.b / 2
      const t = Math.min(Math.max((px * qx + py * qy) / (qx * qx + qy * qy), 0), 1)
      const ax = px - qx * t
      const ay = py - qy * t
      const u = Math.min(Math.max(px / qx, 0), 1)
      const bx = px - qx * u
      const by = py - qy
      const sgn = -Math.sign(qy)
      const d = Math.min(ax * ax + ay * ay, bx * bx + by * by)
      const sd = Math.min(sgn * (px * qy - py * qx), sgn * (py - qy))
      return -Math.sqrt(d) * Math.sign(sd)
    }
    default:
      return Math.abs(ly) - s.a
  }
}

export interface PlateColours {
  ground: RGB
  ink: RGB
  accent: RGB
}

/** Replays the shocks over the field, one point at a time. */
export class Plate {
  /** Colour of the last sample. */
  r = 0
  g = 0
  b = 0

  constructor(
    private field: Field,
    private shocks: Shock[],
    private col: PlateColours,
    /** Pixels per short-side unit, for the anti-aliased edges. */
    private px: number,
    private baked: Baked,
  ) {}

  /** The calm surface, before any shock. */
  base(x: number, y: number): void {
    const F = this.field
    this.baked.read(x, y)
    const tone = this.baked.t
    const warp = this.baked.w

    let layer = F.layers[0]
    let border = Infinity
    if (F.sx.length) {
      let i1 = 0
      let i2 = 0
      let d1 = Infinity
      let d2 = Infinity
      for (let i = 0; i < F.sx.length; i++) {
        const d = (x - F.sx[i]) ** 2 + (y - F.sy[i]) ** 2
        if (d < d1) {
          d2 = d1
          i2 = i1
          d1 = d
          i1 = i
        }
        else if (d < d2) {
          d2 = d
          i2 = i
        }
      }
      layer = F.layers[i1]
      // exact distance to the Voronoi edge between the two nearest sites
      border = (d2 - d1) / (2 * len(F.sx[i2] - F.sx[i1], F.sy[i2] - F.sy[i1]))
    }

    const d = inkDistance(layer, x, y, tone, warp, F.relief)
    let cov = Math.min(1, Math.max(0, 0.5 - d * this.px))
    if (border < F.gap + 2 / this.px)
      cov *= Math.min(1, Math.max(0, (border - F.gap) * this.px + 0.5))

    const { ground, ink } = this.col
    this.r = ground[0] + (ink[0] - ground[0]) * cov
    this.g = ground[1] + (ink[1] - ground[1]) * cov
    this.b = ground[2] + (ink[2] - ground[2]) * cov
  }

  /** Colour at (x, y) once the first k + 1 shocks have struck. */
  sample(x: number, y: number, k: number): void {
    if (k < 0) {
      this.base(x, y)
      return
    }
    const s = this.shocks[k]
    const dx = x - s.cx
    const dy = y - s.cy
    if (dx * dx + dy * dy > s.reach2) {
      this.sample(x, y, k - 1)
      return
    }
    const d = shapeDistance(s, x, y)
    if (d >= 0) {
      this.sample(x, y, k - 1)
      if (s.seam > 0 && d < s.seam + 1 / this.px)
        this.blend(s.seamColour, 0.5 + (s.seam - d) * this.px)
      return
    }

    switch (s.effect) {
      case FAULT: {
        const n = dy * s.fcos - dx * s.fsin
        let j = 0
        let gap = Infinity
        for (let i = 0; i < s.cuts.length; i++) {
          if (n > s.cuts[i])
            j = i + 1
          gap = Math.min(gap, Math.abs(n - s.cuts[i]))
        }
        const slide = s.slides[j]
        const z = s.zoom[j]
        const c = s.tcos[j] * z
        const sn = s.tsin[j] * z
        this.sample(s.cx + dx * c - dy * sn - slide * s.scos, s.cy + dx * sn + dy * c - slide * s.ssin, k - 1)
        if (s.shade[j] > 0)
          this.blend(this.col.ground, s.shade[j])
        // the crack opens on the bare ground, with a hairline down its middle
        if (gap < 0.008) {
          this.blend(this.col.ground, 0.5 + (0.0052 - gap) * this.px)
          this.blend(this.col.accent, 0.5 + (0.0011 - gap) * this.px)
        }
        break
      }
      case PIXEL: {
        const bx = Math.floor(dx / s.block)
        const by = Math.floor(dy / s.block)
        // a block is computed once (16 samples) and shared by all its pixels;
        // its colour is stored as packed 8-bit RGB, which is all it becomes
        const key = bx * 65536 + by
        let packed = s.blocks.get(key)
        if (packed === undefined) {
          this.pixel(s, bx, by, k)
          packed = (Math.round(this.r) << 16) | (Math.round(this.g) << 8) | Math.round(this.b)
          if (s.blocks.size > 200_000)
            s.blocks.clear()
          s.blocks.set(key, packed)
        }
        this.r = packed >> 16
        this.g = (packed >> 8) & 255
        this.b = packed & 255
        break
      }
      case WARP: {
        let mx = dx
        let my = dy
        if (s.mode === LENS) {
          const q = (dx * dx + dy * dy) / (s.a * s.a)
          const f = s.power + (1 - s.power) * q
          mx = dx * f
          my = dy * f
        }
        else {
          let angle = s.power
          if (s.mode === SWIRL) {
            const u = 1 - Math.sqrt(dx * dx + dy * dy) / s.a
            angle *= u * u
          }
          const c = Math.cos(angle)
          const sn = Math.sin(angle)
          mx = dx * c - dy * sn
          my = dx * sn + dy * c
        }
        this.sample(s.cx + mx, s.cy + my, k - 1)
        break
      }
      case ERODE: {
        this.sample(x, y, k - 1)
        // weathering: a fine grain, loosely clustered by a coarser mottle,
        // eats the pattern more and more towards the inside of the shape
        const depth = Math.min(1, -d / (Math.min(s.a, s.shape === BOX ? s.b : s.a) * 0.9))
        const coarse = this.field.warp.at(x * s.freq + s.ox, y * s.freq)
        const fine = this.field.tone.at(x * s.freq * 9.1, y * s.freq * 9.1 + s.ox)
        const n = 0.62 * coarse + 0.38 * fine
        // at most about half of the deepest part is worn away
        const keep = Math.min(1, Math.max(0, (n - 0.08 - depth * 0.42) * 20))
        const g = this.col.ground
        this.r = g[0] + (this.r - g[0]) * keep
        this.g = g[1] + (this.g - g[1]) * keep
        this.b = g[2] + (this.b - g[2]) * keep
        break
      }
      default: {
        this.sample(x, y, k - 1)
        // project on the ground-to-ink axis, then swap the two ends
        const { ground, ink, accent } = this.col
        const ax = ink[0] - ground[0]
        const ay = ink[1] - ground[1]
        const az = ink[2] - ground[2]
        let t = Math.min(1, Math.max(0, ((this.r - ground[0]) * ax + (this.g - ground[1]) * ay + (this.b - ground[2]) * az) / (ax * ax + ay * ay + az * az)))
        // a plain swap of a pattern near half coverage barely shows: thin
        // the swapped lines so the inverted shape reads as a block
        if (!s.stain)
          t *= t
        const bg = s.stain ? accent : ink
        this.r = bg[0] + (ground[0] - bg[0]) * t
        this.g = bg[1] + (ground[1] - bg[1]) * t
        this.b = bg[2] + (ground[2] - bg[2]) * t
      }
    }
    if (s.seam > 0 && d > -s.seam - 1 / this.px)
      this.blend(s.seamColour, 0.5 + (s.seam + d) * this.px)
  }

  /**
   * One block of a pixelation: the surface averaged over a 4 × 4 grid of
   * samples (a smoothed tone, free of the noise of a single sample), then
   * set to ground or ink by an ordered threshold indexed by the block: a
   * 4 × 4 Bayer matrix (dots) or a line screen (stripes), so the blocks form
   * a regular dither rather than random bits.
   * A block whose average is off the ground-to-ink axis (an accent seam or
   * stain) keeps its averaged colour.
   */
  private pixel(s: Shock, bx: number, by: number, k: number): void {
    let r = 0
    let g = 0
    let b = 0
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        this.sample(s.cx + (bx + (i + 0.5) / 4) * s.block, s.cy + (by + (j + 0.5) / 4) * s.block, k - 1)
        r += this.r
        g += this.g
        b += this.b
      }
    }
    this.r = r / 16
    this.g = g / 16
    this.b = b / 16
    const { ground, ink } = this.col
    const ax = ink[0] - ground[0]
    const ay = ink[1] - ground[1]
    const az = ink[2] - ground[2]
    const t = ((this.r - ground[0]) * ax + (this.g - ground[1]) * ay + (this.b - ground[2]) * az) / (ax * ax + ay * ay + az * az)
    const ex = this.r - ground[0] - ax * t
    const ey = this.g - ground[1] - ay * t
    const ez = this.b - ground[2] - az * t
    if (ex * ex + ey * ey + ez * ez > 900)
      return
    // stretch the tone a little: thin lines average to a pale grey
    const tone = Math.min(1, Math.max(0, (t - 0.12) * 1.6))
    let level: number
    if (s.screen === 0)
      level = BAYER[(by & 3) * 4 + (bx & 3)]
    else
      level = LINES[(s.screen === 1 ? by : bx) & 3]
    const c = tone * 16 > level + 0.5 ? ink : ground
    this.r = c[0]
    this.g = c[1]
    this.b = c[2]
  }

  private blend(c: RGB, cov: number): void {
    const a = Math.min(1, Math.max(0, cov))
    if (a <= 0)
      return
    this.r += (c[0] - this.r) * a
    this.g += (c[1] - this.g) * a
    this.b += (c[2] - this.b) * a
  }
}
