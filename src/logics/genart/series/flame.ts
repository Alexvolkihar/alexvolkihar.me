// "Flame" — fractal flames, after Scott Draves and Erik Reckase.
//
// A flame is an iterated function system: two to five transforms, each an
// affine map followed by a blend of nonlinear variations (swirl, spherical,
// julia, heart, disc...), plus symmetry transforms and sometimes a final
// transform (see ../flame/genome.ts). A single point jumps from transform to
// transform millions of times; every landing adds a hit and a colour index to
// a cell of a histogram. The histogram is then developed as in the paper:
// log-density tone mapping with gamma, colour from the average index of each
// cell, a two-level density estimation that smooths the sparse wisps into a
// haze but keeps the dense filaments sharp, and, for the "Glow" finish, a
// soft bloom.
//
// Most random genomes are dull (a dot, a line, a flat fog, a lone hot spot,
// a featureless halo, or points flung to infinity), so a short probe run
// measures each candidate on a coarse grid and the hash draws again until one
// fills the frame with structure. The probe also frames the flame: its centre
// and size come from robust percentiles of the probe points, so the outer
// dust may spill past the margin.
//
// The histogram covers the whole canvas: a wider canvas shows more of the
// flame's outer wisps around the same square composition. The hit budget
// follows the area of that square, so a piece has the same exposure at 300 px
// and at 8K; very large exports use larger cells, upsampled.

import type { Camera, Family, Genome, GenomePlan } from '../flame/genome'
import type { Rng } from '../random'
import type { Series } from '../types'
import { compile, drawGenome, newState, plot } from '../flame/genome'
import { PI, tatan2, tcos, tsin } from '../flame/trig'
import { stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Ember', 22], ['Abyss', 20], ['Orchid', 18], ['Aurum', 15], ['Prism', 13], ['Vellum', 12]],
  Variation: [['Spherical', 24], ['Silk', 22], ['Spiral', 20], ['Petal', 19], ['Chimera', 15]],
  Symmetry: [['None', 40], ['Mirror', 18], ['Rotational', 30], ['Dihedral', 12]],
  Finish: [['Velvet', 35], ['Glow', 40], ['Etched', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Variation: weighted(r, TRAITS.Variation),
    Symmetry: weighted(r, TRAITS.Symmetry),
    Finish: weighted(r, TRAITS.Finish),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site). `stops` is the gradient the colour
// indices read; `peak` is where the densest cells end up.
// ---------------------------------------------------------------------------

interface Palette {
  light: boolean
  bg: string
  stops: readonly string[]
  peak: string
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Ember: { light: false, bg: '#0b0605', stops: ['#7a1a0c', '#b8300f', '#e2601e', '#f6a935', '#ffe09a'], peak: '#fff6e2' },
  Abyss: { light: false, bg: '#03070d', stops: ['#1d4f8c', '#1784b0', '#26bdb6', '#8ee6d2', '#dcf3ff'], peak: '#f6fdff' },
  Orchid: { light: false, bg: '#0a0510', stops: ['#6a24a0', '#a63aa8', '#de5a92', '#f7a08a', '#ffdcb8'], peak: '#fff4ec' },
  Aurum: { light: false, bg: '#0a0806', stops: ['#6e4520', '#a06a2a', '#cf9a46', '#eccd84', '#f9efd6'], peak: '#fffbf2' },
  Prism: { light: false, bg: '#05050a', stops: ['#e8456b', '#f2a93b', '#e3df57', '#4fd18b', '#3fa7e0', '#8a5be0'], peak: '#ffffff' },
  Vellum: { light: true, bg: '#efe8da', stops: ['#1d2b4f', '#41538a', '#7a2f2a', '#b4652e', '#2e5a52'], peak: '#0e0f17' },
}

/**
 * Development of the negative. gamma: tone curve exponent (Draves's gamma);
 * de: density below which a cell borrows from its blurred neighbourhood;
 * hl: how far the densest cells move towards the palette's peak; bloom:
 * strength of the halo; gain: brightness of the log curve.
 */
interface Finish {
  gamma: number
  de: number
  hl: number
  bloom: number
  gain: number
}

const FINISH: Record<Features['Finish'], Finish> = {
  Velvet: { gamma: 2.4, de: 3, hl: 0.3, bloom: 0, gain: 1.2 },
  Glow: { gamma: 2.1, de: 2, hl: 0.55, bloom: 0.6, gain: 1 },
  Etched: { gamma: 1.7, de: 0.8, hl: 0.2, bloom: 0, gain: 1.4 },
}

// Hits per cell of the composition square, and the caps for large exports:
// beyond them, cells grow and the histogram is upsampled.
const SPP = 2.5
const MAX_ITERATIONS = 16_000_000
const MAX_CELLS = 7_000_000
const MARGIN = 0.07
/** Radius of the density-estimation and bloom blurs, as fractions of the short side. */
const DE_RADIUS = 0.0012
const BLOOM_RADIUS = 0.008
/** Below this fraction of the white point's log density, the tone curve is linear. */
const GAMMA_THRESHOLD = 0.2

// ---------------------------------------------------------------------------
// Probe: a short run that rejects dull genomes and frames the good ones
// ---------------------------------------------------------------------------

interface Frame {
  cx: number
  cy: number
  half: number
}

interface Probe {
  ok: boolean
  frame: Frame
  bad: number
  fill: number
  entropy: number
  /** Coefficient of variation of the occupied bins: low means a flat fog. */
  contrast: number
  /** Share of the points in the densest twentieth of the occupied bins: high means a lone hot spot in dust. */
  core: number
  /** Angular contrast around the centre (symmetric flames only, 9 otherwise): low means a featureless ring or halo. */
  angular: number
  aspect: number
}

const PROBE_N = 12000
/** Share of the probe points left out of the frame on each side: the outer dust may spill over the margin. */
const FRAME_TAIL = 0.03
const PROBE_BINS = 48

function percentile(sorted: Float64Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
}

export function probeGenome(g: Genome, plan: GenomePlan): Probe {
  const pts = new Float64Array(PROBE_N * 3)
  const st = newState([0x9E3779B9, 0x243F6A88, 0xB7E15162, 0x6A09E667])
  plot(g, st, PROBE_N, null, pts)
  const xs = new Float64Array(PROBE_N)
  const ys = new Float64Array(PROBE_N)
  let n = 0
  for (let i = 0; i < PROBE_N; i++) {
    const x = pts[i * 3]
    const y = pts[i * 3 + 1]
    if (!Number.isNaN(x) && !Number.isNaN(y)) {
      xs[n] = x
      ys[n++] = y
    }
  }
  const bad = st.bad / PROBE_N
  const fail: Probe = { ok: false, frame: { cx: 0, cy: 0, half: 1 }, bad, fill: 0, entropy: 0, contrast: 0, core: 1, angular: 0, aspect: 0 }
  if (n < PROBE_N * 0.9 || bad > 0.01)
    return fail
  const px = xs.slice(0, n)
  const py = ys.slice(0, n)
  const sx = px.slice().sort()
  const sy = py.slice().sort()
  const x0 = percentile(sx, FRAME_TAIL)
  const x1 = percentile(sx, 1 - FRAME_TAIL)
  const y0 = percentile(sy, FRAME_TAIL)
  const y1 = percentile(sy, 1 - FRAME_TAIL)
  const w = x1 - x0
  const h = y1 - y0
  if (!(w > 1e-3 && h > 1e-3 && w < 1e6 && h < 1e6))
    return fail
  let cx = (x0 + x1) / 2
  let cy = (y0 + y1) / 2
  let half = Math.max(w, h) / 2
  if (plan.order > 1) {
    // rotational symmetry is about the origin: centre there, size by radius
    const rad = new Float64Array(n)
    for (let i = 0; i < n; i++)
      rad[i] = Math.sqrt(px[i] * px[i] + py[i] * py[i])
    rad.sort()
    cx = 0
    cy = 0
    half = percentile(rad, 1 - 2 * FRAME_TAIL)
  }
  else if (plan.mirror) {
    cx = 0
    half = Math.max(Math.max(-x0, x1), h / 2)
  }
  if (!(half > 1e-3))
    return fail
  const hist = new Uint32Array(PROBE_BINS * PROBE_BINS)
  let inside = 0
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(((px[i] - cx) / half + 1) * 0.5 * PROBE_BINS)
    const by = Math.floor(((py[i] - cy) / half + 1) * 0.5 * PROBE_BINS)
    if (bx >= 0 && by >= 0 && bx < PROBE_BINS && by < PROBE_BINS) {
      hist[by * PROBE_BINS + bx]++
      inside++
    }
  }
  let used = 0
  let ent = 0
  let sq = 0
  for (let i = 0; i < hist.length; i++) {
    if (!hist[i])
      continue
    used++
    const p = hist[i] / inside
    ent -= p * Math.log(p)
    sq += hist[i] * hist[i]
  }
  const mean = inside / Math.max(1, used)
  const sorted = hist.slice().sort().reverse()
  let top = 0
  for (let i = 0; i < Math.ceil(used / 20); i++)
    top += sorted[i]
  // a rotationally symmetric cloud with no structure along the rings: the
  // mean, over rings, of the coefficient of variation of the angular counts
  let angular = 9
  if (plan.order > 1) {
    const RINGS = 8
    const SECTORS = 48
    const polar = new Uint32Array(RINGS * SECTORS)
    for (let i = 0; i < n; i++) {
      const rr = Math.sqrt(px[i] * px[i] + py[i] * py[i]) / half
      if (rr >= 1)
        continue
      const a = (tatan2(py[i], px[i]) / (2 * PI) + 1) % 1
      polar[Math.floor(rr * RINGS) * SECTORS + Math.min(SECTORS - 1, Math.floor(a * SECTORS))]++
    }
    let wsum = 0
    let csum = 0
    for (let ring = 0; ring < RINGS; ring++) {
      let m = 0
      let q = 0
      for (let k = 0; k < SECTORS; k++) {
        const v = polar[ring * SECTORS + k]
        m += v
        q += v * v
      }
      if (m < SECTORS * 4)
        continue
      const mu = m / SECTORS
      csum += m * (Math.sqrt(Math.max(0, q / SECTORS - mu * mu)) / mu)
      wsum += m
    }
    angular = wsum > 0 ? csum / wsum : 0
  }
  return {
    ok: true,
    frame: { cx, cy, half },
    angular,
    bad,
    fill: used / hist.length,
    entropy: ent / Math.log(hist.length),
    contrast: Math.sqrt(Math.max(0, sq / Math.max(1, used) - mean * mean)) / mean,
    core: top / Math.max(1, inside),
    aspect: Math.min(w, h) / Math.max(w, h),
  }
}

/** Thresholds set by eye on contact sheets, then checked on a census of 2,000 seeds. */
function accept(p: Probe): boolean {
  return p.ok && p.fill > 0.2 && p.fill < 0.8 && p.entropy > 0.62 && p.entropy < 0.89 && p.contrast > 1.15 && p.core < 0.6 && p.angular > 0.45 && p.aspect > 0.3
}

export function chooseFlame(hash: string, f: Features): { g: Genome, plan: GenomePlan, probe: Probe, tries: number } {
  const r = stream(hash, 'genome')
  let last: { g: Genome, plan: GenomePlan, probe: Probe } | null = null
  for (let tries = 1; tries <= 80; tries++) {
    const plan = drawGenome(r, f.Variation as Family, f.Symmetry)
    const g = compile(plan.specs, plan.fin)
    const probe = probeGenome(g, plan)
    if (accept(probe))
      return { g, plan, probe, tries }
    if (probe.ok && (!last || probe.entropy > last.probe.entropy))
      last = { g, plan, probe }
  }
  // never seen in the census, but a hash must always give a picture
  if (last)
    return { ...last, tries: 0 }
  const plan = fallbackPlan()
  const g = compile(plan.specs, plan.fin)
  return { g, plan, probe: probeGenome(g, plan), tries: -1 }
}

/** A plain Sierpinski-like flame with swirl, which always converges. */
function fallbackPlan(): GenomePlan {
  return {
    specs: [
      { affine: [0.5, 0, 0, 0, 0.5, 0], color: 0.1, speed: 0.5, weight: 1, vars: [['linear', 0.7], ['swirl', 0.3]] },
      { affine: [0.5, 0, 0.5, 0, 0.5, 0], color: 0.5, speed: 0.5, weight: 1, vars: [['linear', 0.7], ['swirl', 0.3]] },
      { affine: [0.5, 0, 0, 0, 0.5, 0.5], color: 0.9, speed: 0.5, weight: 1, vars: [['linear', 0.7], ['swirl', 0.3]] },
    ],
    fin: null,
    order: 1,
    mirror: false,
  }
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

type RGB = [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

const LUT_N = 256

/** Gradient lookup: LUT_N colours, read from a hash-chosen offset as a triangle wave (no seam). */
function gradient(pal: Palette, shift: number, span: number): Float32Array {
  const stops = pal.stops.map(hex)
  const out = new Float32Array(LUT_N * 3)
  for (let i = 0; i < LUT_N; i++) {
    let u = ((i / (LUT_N - 1)) * span + shift * 2) % 2
    if (u > 1)
      u = 2 - u
    const pos = u * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(pos))
    const t = smooth(0, 1, pos - k)
    for (let ch = 0; ch < 3; ch++)
      out[i * 3 + ch] = stops[k][ch] + (stops[k + 1][ch] - stops[k][ch]) * t
  }
  return out
}

/**
 * Box blur of a w x h grid of `ch` interleaved channels, returned as a new
 * grid; the edges are treated as empty. Both passes walk the memory in order
 * (the vertical one keeps a running sum per column), which matters on the
 * grids of large exports.
 */
function boxBlur(src: Float32Array, w: number, h: number, ch: number, r: number): Float32Array {
  const norm = 1 / (2 * r + 1)
  const row = w * ch
  const tmp = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    const base = y * row
    for (let c = 0; c < ch; c++) {
      let acc = 0
      for (let x = 0; x <= r && x < w; x++)
        acc += src[base + x * ch + c]
      for (let x = 0; x < w; x++) {
        tmp[base + x * ch + c] = acc * norm
        if (x + r + 1 < w)
          acc += src[base + (x + r + 1) * ch + c]
        if (x - r >= 0)
          acc -= src[base + (x - r) * ch + c]
      }
    }
  }
  const out = new Float32Array(src.length)
  const col = new Float64Array(row)
  for (let y = 0; y <= r && y < h; y++) {
    for (let i = 0; i < row; i++)
      col[i] += tmp[y * row + i]
  }
  for (let y = 0; y < h; y++) {
    const o = y * row
    const add = (y + r + 1) * row
    const sub = (y - r) * row
    for (let i = 0; i < row; i++)
      out[o + i] = col[i] * norm
    if (y + r + 1 < h) {
      for (let i = 0; i < row; i++)
        col[i] += tmp[add + i]
    }
    if (y - r >= 0) {
      for (let i = 0; i < row; i++)
        col[i] -= tmp[sub + i]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function seedWords(r: Rng): number[] {
  return [0, 1, 2, 3].map(() => (r() * 4294967296) >>> 0)
}

/** Log-density bins: bin b holds densities around 2^(b / LOG_STEPS - LOG_MIN). */
const LOG_BINS = 2048
const LOG_STEPS = 64
const LOG_MIN = 14

interface Developed {
  /** Log-density bin per cell (0: empty) and gradient index per cell. */
  bin: Uint16Array
  idx: Uint8Array
  /** Tone (alpha) per bin. */
  tone: Float32Array
}

/**
 * Chaos game into a histogram, then density estimation and tone curve.
 * Kept apart from render() so the large float grids can be collected before
 * the colour grids are allocated.
 */
function develop(g: Genome, cam: Camera, iterations: number, seed: number[], sc: number, S: number, cell: number, fin: Finish): Developed {
  const { gw, gh } = cam
  const cells = gw * gh
  const acc = new Float32Array(cells * 2)
  plot(g, newState(seed), iterations, { cam, acc }, null)

  // density estimation, a cheap stand-in for the paper's variable-width
  // kernel: dense cells keep their own detail, sparser ones borrow from a
  // blurred copy of the histogram, and the sparsest (the dust around a flame)
  // from a copy blurred three times wider, which turns it into a soft haze
  const de = Math.max(1, Math.round((DE_RADIUS * S) / cell))
  const near = boxBlur(acc, gw, gh, 2, de)
  const far = boxBlur(near, gw, gh, 2, 3 * de)

  // relative density: 1 is the mean density over the composition square
  const norm = (sc * sc) / iterations
  const invDe = 1 / fin.de
  const invFar = 2 / fin.de
  const bin = new Uint16Array(cells)
  const idx = new Uint8Array(cells)
  const hist = new Uint32Array(LOG_BINS)
  let occupied = 0
  for (let i = 0; i < cells; i++) {
    const j = i * 2
    const raw = acc[j]
    const mid = near[j]
    const wide = far[j]
    if (raw === 0 && mid < 1e-4 && wide < 1e-4)
      continue
    let t = raw * norm * invDe
    t = t >= 1 ? 1 : t * t * (3 - 2 * t)
    let u = mid * norm * invFar
    u = u >= 1 ? 1 : u * u * (3 - 2 * u)
    const wn = 1 - t
    const n = raw * t + wn * (mid * u + wide * (1 - u))
    const dn = n * norm
    if (dn < 1e-4)
      continue
    const csum = acc[j + 1] * t + wn * (near[j + 1] * u + far[j + 1] * (1 - u))
    const b = Math.max(1, Math.min(LOG_BINS - 1, Math.round((Math.log2(dn) + LOG_MIN) * LOG_STEPS)))
    bin[i] = b
    idx[i] = Math.max(0, Math.min(LUT_N - 1, Math.round((csum / n) * (LUT_N - 1))))
    hist[b]++
    occupied++
  }

  // white point: a high percentile of the occupied cells
  let white = 1
  let cum = 0
  for (let b = 1; b < LOG_BINS; b++) {
    cum += hist[b]
    if (cum >= occupied * 0.997) {
      white = 2 ** (b / LOG_STEPS - LOG_MIN)
      break
    }
  }
  // Draves's tone curve: log density, normalised to the white point, then
  // gamma; below a threshold the curve turns linear (flam3's gamma_threshold),
  // so the sparse noise is not lifted along with the faint wisps
  const tone = new Float32Array(LOG_BINS)
  const logW = Math.log1p(white * fin.gain)
  const invGamma = 1 / fin.gamma
  const knee = GAMMA_THRESHOLD ** invGamma / GAMMA_THRESHOLD
  for (let b = 1; b < LOG_BINS; b++) {
    const dn = 2 ** (b / LOG_STEPS - LOG_MIN)
    const l = Math.min(1, Math.log1p(dn * fin.gain) / logW)
    tone[b] = l < GAMMA_THRESHOLD ? l * knee : l ** invGamma
  }
  return { bin, idx, tone }
}

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const fin = FINISH[f.Finish]
  const { g, probe: pr } = chooseFlame(hash, f)

  // --- frame: camera turn, gradient offset, chaos seed -----------------------
  const fr = stream(hash, 'frame')
  // mirrored flames stand upright (or upside down); the others turn freely
  const spin = fr()
  const angle = f.Symmetry === 'Mirror' || f.Symmetry === 'Dihedral' ? (spin < 0.5 ? 0 : PI) : spin * 2 * PI
  const shift = fr()
  const span = 0.75 + fr() * 0.5
  const chaosSeed = seedWords(fr)

  // --- histogram over the whole canvas ------------------------------------------
  const S = Math.min(W, H)
  const cell = Math.max(1, Math.sqrt((S * S * SPP) / MAX_ITERATIONS), Math.sqrt((W * H) / MAX_CELLS))
  const gw = Math.max(2, Math.ceil(W / cell))
  const gh = Math.max(2, Math.ceil(H / cell))
  const sc = S / cell
  const cells = gw * gh
  const { cx, cy, half } = pr.frame
  const k = (sc * (1 - 2 * MARGIN)) / (2 * half)
  const cs = tcos(angle)
  const sn = tsin(angle)
  const A = k * cs
  const B = -k * sn
  const C = k * sn
  const D = k * cs
  const cam: Camera = { A, B, C, D, OX: gw / 2 - (A * cx + B * cy), OY: gh / 2 - (C * cx + D * cy), gw, gh }
  // large exports have bigger cells: up to 1.5 times the hits per cell there,
  // within the cap, so their sparse parts are not grainier than a preview
  const iterations = Math.round(Math.min(MAX_ITERATIONS, sc * sc * SPP * Math.min(1.5, cell * cell)))
  const { bin, idx, tone } = develop(g, cam, iterations, chaosSeed, sc, S, cell, fin)

  // --- colour per cell, as an offset from the background -----------------------
  const lut = gradient(pal, shift, span)
  const bg = hex(pal.bg)
  const peak = hex(pal.peak)
  // the highlight towards the peak colour depends on the tone only
  const lift = new Float32Array(LOG_BINS)
  for (let b = 0; b < LOG_BINS; b++)
    lift[b] = smooth(0.7, 1, tone[b]) * fin.hl
  const F = new Float32Array(cells * 3)
  for (let i = 0; i < cells; i++) {
    const b = bin[i]
    if (!b)
      continue
    const a = tone[b]
    const h = lift[b]
    const li = idx[i] * 3
    const o = i * 3
    F[o] = (lut[li] + (peak[0] - lut[li]) * h - bg[0]) * a
    F[o + 1] = (lut[li + 1] + (peak[1] - lut[li + 1]) * h - bg[1]) * a
    F[o + 2] = (lut[li + 2] + (peak[2] - lut[li + 2]) * h - bg[2]) * a
  }

  // --- bloom ---------------------------------------------------------------------
  if (fin.bloom > 0) {
    // on a grid of q x q blocks, about 3 blocks per bloom radius, added back bilinearly
    const rb = (BLOOM_RADIUS * S) / cell
    const q = Math.max(2, Math.round(rb / 3))
    const bw = Math.ceil(gw / q)
    const bh = Math.ceil(gh / q)
    let bl: Float32Array = new Float32Array(bw * bh * 3)
    for (let y = 0; y < gh; y++) {
      const row = ((y / q) | 0) * bw
      for (let x = 0; x < gw; x++) {
        const o = (row + ((x / q) | 0)) * 3
        const i = (y * gw + x) * 3
        bl[o] += F[i]
        bl[o + 1] += F[i + 1]
        bl[o + 2] += F[i + 2]
      }
    }
    const br = Math.max(1, Math.round(rb / q))
    // three box passes: close to a gaussian
    for (let p = 0; p < 3; p++)
      bl = boxBlur(bl, bw, bh, 3, br)
    const amt = fin.bloom / (q * q)
    for (let y = 0; y < gh; y++) {
      const fy = Math.max(0, (y + 0.5) / q - 0.5)
      const y0 = Math.min(bh - 1, fy | 0)
      const y1 = Math.min(bh - 1, y0 + 1)
      const ty = fy - y0
      for (let x = 0; x < gw; x++) {
        const fx = Math.max(0, (x + 0.5) / q - 0.5)
        const x0 = Math.min(bw - 1, fx | 0)
        const x1 = Math.min(bw - 1, x0 + 1)
        const tx = fx - x0
        const w00 = (1 - tx) * (1 - ty) * amt
        const w10 = tx * (1 - ty) * amt
        const w01 = (1 - tx) * ty * amt
        const w11 = tx * ty * amt
        const o00 = (y0 * bw + x0) * 3
        const o10 = (y0 * bw + x1) * 3
        const o01 = (y1 * bw + x0) * 3
        const o11 = (y1 * bw + x1) * 3
        const i = (y * gw + x) * 3
        F[i] += bl[o00] * w00 + bl[o10] * w10 + bl[o01] * w01 + bl[o11] * w11
        F[i + 1] += bl[o00 + 1] * w00 + bl[o10 + 1] * w10 + bl[o01 + 1] * w01 + bl[o11 + 1] * w11
        F[i + 2] += bl[o00 + 2] * w00 + bl[o10 + 2] * w10 + bl[o01 + 2] * w01 + bl[o11 + 2] * w11
      }
    }
  }

  // --- pixels ----------------------------------------------------------------------
  const img = ctx.createImageData(W, H)
  const px = img.data
  const vig = pal.light ? 0.1 : 0.4
  const exact = cell === 1 && gw === W && gh === H
  const inv = 1 / cell
  const lastX = gw - 1
  const lastY = gh - 1
  // horizontal bilinear taps, the same for every row
  const tx0 = new Int32Array(W)
  const tx1 = new Int32Array(W)
  const twx = new Float32Array(W)
  const vx2 = new Float32Array(W)
  for (let x = 0; x < W; x++) {
    const fx = Math.max(0, (x + 0.5) * inv - 0.5)
    const x0 = Math.min(lastX, fx | 0)
    tx0[x] = x0 * 3
    tx1[x] = Math.min(lastX, x0 + 1) * 3
    twx[x] = fx - x0
    const vx = (x + 0.5 - W / 2) / S
    vx2[x] = vx * vx
  }
  for (let y = 0; y < H; y++) {
    const vy = (y + 0.5 - H / 2) / S
    const vy2 = vy * vy
    const fy = Math.max(0, (y + 0.5) * inv - 0.5)
    const y0 = Math.min(lastY, fy | 0)
    const r0 = y0 * gw * 3
    const r1 = Math.min(lastY, y0 + 1) * gw * 3
    const ty = fy - y0
    let o = y * W * 4
    for (let x = 0; x < W; x++) {
      const shade = 1 - vig * Math.min(1, (vx2[x] + vy2) * 1.5)
      let r: number
      let gg: number
      let b: number
      if (exact) {
        const i = (y * W + x) * 3
        r = F[i]
        gg = F[i + 1]
        b = F[i + 2]
      }
      else {
        const a0 = tx0[x]
        const a1 = tx1[x]
        const t = twx[x]
        const top0 = F[r0 + a0] + (F[r0 + a1] - F[r0 + a0]) * t
        const bot0 = F[r1 + a0] + (F[r1 + a1] - F[r1 + a0]) * t
        const top1 = F[r0 + a0 + 1] + (F[r0 + a1 + 1] - F[r0 + a0 + 1]) * t
        const bot1 = F[r1 + a0 + 1] + (F[r1 + a1 + 1] - F[r1 + a0 + 1]) * t
        const top2 = F[r0 + a0 + 2] + (F[r0 + a1 + 2] - F[r0 + a0 + 2]) * t
        const bot2 = F[r1 + a0 + 2] + (F[r1 + a1 + 2] - F[r1 + a0 + 2]) * t
        r = top0 + (bot0 - top0) * ty
        gg = top1 + (bot1 - top1) * ty
        b = top2 + (bot2 - top2) * ty
      }
      px[o] = bg[0] * shade + r
      px[o + 1] = bg[1] * shade + gg
      px[o + 2] = bg[2] * shade + b
      px[o + 3] = 255
      o += 4
    }
  }
  ctx.putImageData(img, 0, 0)
}

export default {
  slug: 'flame',
  title: 'Flame',
  summary: 'Fractal flames after Draves and Reckase: millions of jumps through swirling, spherical and julia transforms, developed into silky, coloured veils.',
  order: 330,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xf1a3e5ed ("gallery" stream): the first hash found for each
  // Palette x Variation pair, twelve pairs in the order found, except that the
  // twelfth one (an Abyss rotational flame) is moved first to serve as the cover.
  gallery: [
    '0xa7174f8677aac6c24b9b27cc56074dac92172cb47ed5921b4e8e391d6411b84f',
    '0x5a02196f31b892c266e0a3e0d2a477c03baa095aecefc08f87f3e490feaa7383',
    '0x41390381607bcec5541408b9760e7ec9113fd0271e7158f9a7262be8dc342e47',
    '0x4705f88a5791e101ed59b1831518bc6380e6708fb9c3ae7b11f045fbf5c300b7',
    '0xd100b1d73d3da76bcc6b34447be8d46ae1b598ef578043da09b3386ac7be5e47',
    '0x3e2d6c7b3fbb1cd7db56e82f9e2f7296372cfa890bfeb5a3f3e1707d9ecfacd2',
    '0x3408e31e291d2740b4ca793e3407670dfe5d2a3d6f09b97b4487251d4cd8cfd1',
    '0x584d65e21f7bb2f65ea4d77ec8aeb093d01535f218baeb7ae869ae16aaeec2e6',
    '0xe1953e2ddc2ba05e4008b7edd5e76d4a0f9d7e5e574194d83569ef3006359578',
    '0xe917477b972ba29c44f993d5f4f2c361305038a452ce97a2202b79e0f46767bf',
    '0x80d956f7a819b046ea4f3bac767d30679cfcfa2c783d97debfe69b373194f97a',
    '0xae4f3fb28fd0658e53bf44d8b7b389f6c764c6f3b5c740452d6ad5db742282e9',
  ],
} satisfies Series
