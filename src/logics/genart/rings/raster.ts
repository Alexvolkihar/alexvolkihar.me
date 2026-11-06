// Pixel pass of "Rings".
//
// Every piece of wood is a scalar field t: 0 at the pith, 1 at the cambium
// (the solid-texture idea of Peachey, "Solid Texturing of Complex Surfaces",
// SIGGRAPH 1985, with rings perturbed by noise). A log end is t = r / R(θ)
// around an off-centre pith; a sawn board is the same cylinder of rings cut by
// a plane at a distance d from the pith, slowly tapering along its length, so
// the rings come out as nested cathedral arches (flat-sawn) or as parallel
// stripes (quarter-sawn, d ≈ 0). Knots deflect t around them, a little like
// the knot fields of Larsson et al., "Procedural Texturing of Solid Wood with
// Knots" (SIGGRAPH 2022), much simplified.
//
// The smooth part of each field is sampled on a coarse grid (a few hundred
// cells across the short side) and interpolated per pixel. The colour of the
// rings along t is tabulated once per object, so the per-pixel work is one
// table lookup, a few hashes for vessels and fleck, and some mixing.

import type { RGB, Species } from './species'
import type { Noise2, Tree } from './tree'
import { fbm, hash2, hash2i, TABLE } from './tree'

export type Finish = 'Raw' | 'Oiled' | 'Ink'

export interface RoundKnot { th: number, t0: number, t1: number, w: number, defl: number }
export interface BoardKnot { u: number, v: number, r: number, el: number, defl: number }

/** Part of a round actually shown: a rectangle of its local frame, moved by (dx, dy). */
export interface Piece { dx: number, dy: number, x0: number, x1: number, y0: number, y1: number }

export interface Grid { x0: number, y0: number, step: number, nx: number, ny: number, v: Float32Array }

export interface Round {
  kind: 'round'
  cx: number
  cy: number
  /** Rotation of the local frame. */
  rot: number
  R: number
  /** Pith, relative to the centre of the outline. */
  px: number
  py: number
  /** Outline harmonics a·cos(kθ + φ) for k = 2, 3...: stored as a·cos φ, a·sin φ. */
  harm: number[]
  barkT: number
  fiss: (turn: number) => number
  barkVar: (turn: number) => number
  /** Fine radial streaks of the bark plates. */
  streak: (turn: number) => number
  wob: number
  knots: RoundKnot[]
  deadKnots: boolean
  /** Ring widths, grown only for the objects that end up visible. */
  tree?: Tree
  heart: number
  tone: number
  offs: number[]
  /** Centre of the circular saw that cut this face (local frame), or null. */
  saw: [number, number] | null
  pieces: Piece[]
  /** Room around the outline for the cast shadow. */
  margin: number
  seed: number
  grid?: Grid
}

export interface Board {
  kind: 'board'
  x0: number
  y0: number
  x1: number
  y1: number
  horiz: boolean
  vMid: number
  mirror: number
  v0: number
  d: number
  Rlog: number
  taper: number
  uRef: number
  sweep: number
  amp: number
  knots: BoardKnot[]
  deadKnots: boolean
  quarter: boolean
  /** The log this board was sawn from; boards of one log share its rings. */
  logSeed: number
  tree?: Tree
  heart: number
  tone: number
  offs: number[]
  seed: number
  grid?: Grid
}

export type Wood = Round | Board

export interface Scene {
  W: number
  H: number
  S: number
  sp: Species
  finish: Finish
  spalted: boolean
  /** 'single' draws a ground with a vignette and cast shadows. */
  ground: 'single' | 'deep'
  objects: Wood[]
}

/** Grid channels: t, bark edge, crevice, knot, figure, spalt distance, bark streak, spalt value. */
const CH = 8
const TAU = Math.PI * 2

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x
function smooth(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** Distance from the pith to the outline along the direction (cu, su) = (cos θ, sin θ). */
export function rayRadius(o: Round, cu: number, su: number): number {
  const b = o.px * cu + o.py * su
  const rp = -b + Math.sqrt(o.R * o.R - o.px * o.px - o.py * o.py + b * b)
  // harmonics k = 2.. by the Chebyshev recurrence: no trigonometry per sample
  const hm = o.harm
  let c1 = cu
  let s1 = su
  let h = 0
  for (let k = 0; k < hm.length; k += 2) {
    const c2 = c1 * cu - s1 * su
    const s2 = s1 * cu + c1 * su
    h += hm[k] * c2 - hm[k + 1] * s2
    c1 = c2
    s1 = s2
  }
  return rp * (1 + h)
}

let edgeFiss = 0

/** Outer bark edge in t units at an angle; the crevice value is left in edgeFiss. */
export function barkEdge(o: Round, th: number): number {
  const turn = th / TAU + 0.5
  const v = o.fiss(turn)
  const fiss = v > 0.45 ? ((v - 0.45) / 0.55) ** 1.3 : 0
  edgeFiss = fiss
  return 1 + o.barkT * (0.65 + 0.7 * o.barkVar(turn)) * (1 - 0.6 * fiss)
}

/** Three octaves: the zone lines of spalting wander at every scale. */
function spaltField(n: Noise2, x: number, y: number) {
  return (n(x, y) * 4 + n(x * 2.1 + 3.7, y * 2.1 + 9.2) * 2 + n(x * 4.7 + 11.3, y * 4.7 + 1.9) * 1.2
    + n(x * 10.3 + 5.1, y * 10.3 + 7.7) * 0.45) / 7.65
}

const LEVELS = [0.42, 0.57]

/**
 * Spalting: distance (canvas units) to the nearest zone line, a level set of
 * the noise, estimated as |s - level| / |∇s| so lines keep a constant width.
 */
function spaltAt(n: Noise2, x: number, y: number, f: number, out: Float32Array, at: number) {
  const e = 0.01
  const s = spaltField(n, x, y)
  const gx = (spaltField(n, x + e, y) - s) / e * f
  const gy = (spaltField(n, x, y + e) - s) / e * f
  const g = Math.max(0.05, Math.sqrt(gx * gx + gy * gy))
  // signed, so that the bilinear interpolation stays exact across a line
  let best = LEVELS[0]
  for (const l of LEVELS) {
    if (Math.abs(s - l) < Math.abs(s - best))
      best = l
  }
  out[at + 5] = Math.max(-1, Math.min(1, (s - best) / g))
  out[at + 7] = s
}

function roundField(o: Round, nz: Noise2[], spalted: boolean, lx: number, ly: number, out: Float32Array, at: number) {
  const dx = lx - o.px
  const dy = ly - o.py
  let r = Math.sqrt(dx * dx + dy * dy)
  if (r < 1e-7)
    r = 1e-7
  const th = Math.atan2(dy, dx)
  const rp = rayRadius(o, dx / r, dy / r)
  const t0 = r / rp
  const f1 = 2.3 / o.R
  const f2 = 7.5 / o.R
  const of = o.offs
  let t = t0 + ((fbm(nz[0], lx * f1 + of[0], ly * f1 + of[1]) - 0.5) * o.wob
    + (nz[1](lx * f2 + of[2], ly * f2 + of[3]) - 0.5) * o.wob * 0.25) * Math.min(1, t0 * 5)
  let kk = -1
  for (const kn of o.knots) {
    const s = (t0 - kn.t0) / (kn.t1 - kn.t0)
    if (s <= 0 || s >= 1)
      continue
    let dth = th - kn.th
    dth -= TAU * Math.round(dth / TAU)
    const lat = dth * r
    const env = Math.sin(Math.PI * s)
    const hw = kn.w * Math.sqrt(env) + 1e-5
    const kv = 1 - Math.abs(lat) / hw
    if (kv > kk)
      kk = kv
    const q = lat / (2.6 * hw)
    t += kn.defl * env * Math.exp(-q * q)
  }
  out[at] = t
  out[at + 1] = barkEdge(o, th)
  out[at + 2] = edgeFiss
  out[at + 3] = Math.max(-1, kk)
  out[at + 4] = nz[2](lx * 1.6 / o.R + of[4], ly * 1.6 / o.R + of[5])
  out[at + 6] = t0 > 0.9 ? o.streak(th / TAU + 0.5) : 0
  if (spalted)
    spaltAt(nz[3], lx * 1.3 / o.R + of[6], ly * 1.3 / o.R + of[7], 1.3 / o.R, out, at)
}

function boardField(o: Board, nz: Noise2[], spalted: boolean, xn: number, yn: number, out: Float32Array, at: number) {
  const u = o.horiz ? xn : yn
  const v = o.horiz ? yn : xn
  const vv = (v - o.vMid) * o.mirror + o.v0
  const r = Math.sqrt(vv * vv + o.d * o.d)
  const th = Math.atan2(vv, o.d)
  const of = o.offs
  const rz = o.Rlog * (1 + o.taper * (u - o.uRef) + o.sweep * (fbm(nz[0], u * 0.9 + of[0], of[1]) - 0.5))
  let t = r / rz + (fbm(nz[1], u * 1.4 + of[2], th * 2.2 + of[3]) - 0.5) * o.amp
  let kk = -1
  for (const kn of o.knots) {
    const du = (u - kn.u) / (kn.r * kn.el)
    const dv = (v - kn.v) / kn.r
    const e = Math.sqrt(du * du + dv * dv)
    if (1 - e > kk)
      kk = 1 - e
    const q = e / 2.4
    t += kn.defl * Math.exp(-q * q)
  }
  out[at] = t
  out[at + 1] = Math.max(-1, kk)
  out[at + 4] = nz[2](u * 2.2 + of[4], v * 9 + of[5])
  if (spalted)
    spaltAt(nz[3], xn * 2.6 + of[6], yn * 2.6 + of[7], 2.6, out, at)
}

/** Local-frame bounding half-size of a round, bark and shadow included. */
export function roundExtent(o: Round): number {
  let h = 0
  for (let k = 0; k < o.harm.length; k += 2)
    h += Math.hypot(o.harm[k], o.harm[k + 1])
  return o.R * (1 + h) * (1 + o.barkT * 1.4) + o.margin
}

export function buildGrid(o: Wood, nz: Noise2[], spalted: boolean, step: number) {
  let x0: number, y0: number, x1: number, y1: number
  let e = 0
  if (o.kind === 'round') {
    e = roundExtent(o)
    x0 = -e
    y0 = -e
    x1 = e
    y1 = e
  }
  else {
    x0 = o.x0
    y0 = o.y0
    x1 = o.x1
    y1 = o.y1
  }
  x0 -= step
  y0 -= step
  const nx = Math.ceil((x1 - x0) / step) + 3
  const ny = Math.ceil((y1 - y0) / step) + 3
  const v = new Float32Array(nx * ny * CH)
  const e2 = (e + 2 * step) ** 2
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * step
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step
      const at = (j * nx + i) * CH
      v[at + 5] = 1
      if (o.kind === 'round') {
        // corners of the box lie outside the bark: mark them far outside
        if (x * x + y * y > e2) {
          v[at] = 3
          v[at + 1] = 1
          v[at + 3] = -1
          continue
        }
        roundField(o, nz, spalted, x, y, v, at)
      }
      else {
        boardField(o, nz, spalted, x, y, v, at)
      }
    }
  }
  o.grid = { x0, y0, step, nx, ny, v }
}

// ---------------------------------------------------------------------------
// Colour tables
// ---------------------------------------------------------------------------

type C3 = [number, number, number]

/** The species palette after the finish (raw or oiled) is applied. */
interface Pal {
  earlyHeart: C3
  lateHeart: C3
  earlySap: C3
  lateSap: C3
  pore: C3
  ray: C3
  pith: C3
  knot: C3
  knotDark: C3
  barkInner: C3
  barkA: C3
  barkB: C3
  crevice: C3
  spalt: C3
  bleach: C3
  paper: C3
  ink: C3
  accent: C3
}

// oiled finish: a darkening curve, tabulated
const GAMMA = Float32Array.from({ length: 256 }, (_, i) => 255 * (i / 255) ** 1.22)

function finishColour(c: RGB, finish: Finish): C3 {
  let [r, g, b] = c
  if (finish === 'Raw') {
    const l = 0.3 * r + 0.59 * g + 0.11 * b
    return [(l + (r - l) * 0.86) * 0.97 + 9, (l + (g - l) * 0.86) * 0.97 + 9, (l + (b - l) * 0.86) * 0.97 + 9]
  }
  if (finish === 'Oiled') {
    r = GAMMA[r]
    g = GAMMA[g]
    b = GAMMA[b]
    const l = 0.3 * r + 0.59 * g + 0.11 * b
    return [l + (r - l) * 1.16, l + (g - l) * 1.16, l + (b - l) * 1.16]
  }
  return [r, g, b]
}

function palette(sp: Species, finish: Finish): Pal {
  const f = (c: RGB) => finishColour(c, finish)
  return {
    earlyHeart: f(sp.earlyHeart),
    lateHeart: f(sp.lateHeart),
    earlySap: f(sp.earlySap),
    lateSap: f(sp.lateSap),
    pore: f(sp.pore),
    ray: f(sp.ray),
    pith: f(sp.pith),
    knot: f(sp.knot),
    knotDark: f(sp.knotDark),
    barkInner: f(sp.barkInner),
    barkA: f(sp.barkA),
    barkB: f(sp.barkB),
    crevice: f(sp.crevice),
    spalt: f(sp.spalt),
    bleach: f(sp.bleach),
    paper: [...sp.paper] as C3,
    ink: [...sp.ink] as C3,
    accent: [...sp.accent] as C3,
  }
}

/** Colour of clear wood along t, tabulated at two entries per pixel of radius. */
interface Lut {
  scale: number
  last: number
  heart: Float32Array
  sap: Float32Array
  /** Position inside the ring (0 = earlywood start), for vessels. */
  f: Float32Array
  ink: Float32Array
}

function buildLut(sp: Species, pal: Pal, tree: Tree, rpx: number, ink: boolean): Lut {
  const n = Math.max(512, Math.ceil(rpx * 2) + 2)
  const heart = new Float32Array(n * 3)
  const sap = new Float32Array(n * 3)
  const fa = new Float32Array(n)
  const inkA = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    const t = Math.min(0.9999, k / (n - 1))
    const yk = t * TABLE
    const k0 = yk | 0
    const y = tree.year[k0] + (tree.year[k0 + 1] - tree.year[k0]) * (yk - k0)
    const i = y | 0
    const f = y - i
    fa[k] = f
    const px = tree.width[i] * rpx
    const ls = tree.late[i]
    if (ink) {
      // one printed line per ring, holding the same share of ink at every
      // size; rings too fine to print fade to that mean tone instead
      const cov = Math.min(0.5, Math.max(0.25, 1 - Math.max(0.45, ls + sp.lateRamp * 0.4)))
      const lw = Math.max(0.9, cov * px)
      const line = 1 - smooth(lw - 0.5, lw + 0.5, (1 - f) * px)
      const sharp = clamp01((px - 1.5) / 2.5)
      inkA[k] = line * sharp + cov * (1 - sharp)
      continue
    }
    const con = px < 1 ? 0.1 : Math.min(1, 0.1 + (px - 1) * 0.3)
    let late = smooth(ls, Math.min(1, ls + sp.lateRamp), f)
    // the late-to-early boundary is sharp: soften it over one pixel only
    if (f > 1 - 1 / Math.max(1, px))
      late *= (1 - f) * Math.max(1, px)
    const avg = Math.max(0.05, 1 - ls - sp.lateRamp * 0.5)
    late = late * con + avg * (1 - con)
    const tone = 1 + (tree.tone[i] - 1) * con
    for (let c = 0; c < 3; c++) {
      heart[k * 3 + c] = (pal.earlyHeart[c] + (pal.lateHeart[c] - pal.earlyHeart[c]) * late) * tone
      sap[k * 3 + c] = (pal.earlySap[c] + (pal.lateSap[c] - pal.earlySap[c]) * late) * tone
    }
  }
  return { scale: n - 1, last: n - 1, heart, sap, f: fa, ink: inkA }
}

// ---------------------------------------------------------------------------
// Shared per-pixel state: the helpers below are tiny and the hot loops stay
// free of allocations.
// ---------------------------------------------------------------------------

// Output of the colour helpers: red, green, blue, then the ink density and
// the accent density of the relief-print finish. A typed array keeps the
// numbers unboxed.
const O = new Float64Array(5)

function mixTo(c: C3, a: number) {
  O[0] += (c[0] - O[0]) * a
  O[1] += (c[1] - O[1]) * a
  O[2] += (c[2] - O[2]) * a
}

/** Ring colour at t: heartwood or sapwood with an irregular boundary, figure, tone. */
function woodAt(lut: Lut, t: number, fig: number, heart: number, figure: number, tone: number, ink: boolean): number {
  let k = (t * lut.scale) | 0
  if (k < 0)
    k = 0
  else if (k > lut.last)
    k = lut.last
  if (ink) {
    O[3] = lut.ink[k]
    O[4] = 0
    if (t < heart + (fig - 0.5) * 0.08)
      O[3] = Math.max(O[3], 0.07)
    return lut.f[k]
  }
  const tj = t + (fig - 0.5) * 0.08
  let hm = 1
  if (tj < heart - 0.012)
    hm = 0
  else if (tj < heart + 0.012)
    hm = smooth(heart - 0.012, heart + 0.012, tj)
  const m = tone * (1 + (fig - 0.5) * figure * (2 - hm))
  const k3 = k * 3
  const h = lut.heart
  const s = lut.sap
  O[0] = (h[k3] + (s[k3] - h[k3]) * hm) * m
  O[1] = (h[k3 + 1] + (s[k3 + 1] - h[k3 + 1]) * hm) * m
  O[2] = (h[k3 + 2] + (s[k3 + 2] - h[k3 + 2]) * hm) * m
  return lut.f[k]
}

/** Spalting: thin black zone lines, a bleached zone between the inner ones. */
function spalt(pal: Pal, d: number, s: number, fig: number, S: number, ink: boolean) {
  // half-width in canvas units; below a pixel the line fades instead of thickening
  const w = 0.0016 * (0.3 + 1.4 * fig * fig)
  const wp = Math.max(w, 0.5 / S)
  const line = (1 - smooth(wp - 0.6 / S, wp + 0.6 / S, Math.abs(d))) * Math.min(1, w / wp)
  if (ink) {
    if (line > O[4])
      O[4] = line
    return
  }
  if (s > 0.42 && s < 0.57)
    mixTo(pal.bleach, 0.16)
  if (line > 0)
    mixTo(pal.spalt, line * 0.9)
}

// soft highlight of the oiled finish, as a function of a signed distance
const SHEEN = Float32Array.from({ length: 1024 }, (_, i) => {
  const q = (i - 512) / 64
  return Math.exp(-q * q) * 0.13
})

// one period of a cosine, for the arcs left by a circular saw
const WAVE = Float32Array.from({ length: 1024 }, (_, i) => Math.cos(i / 1024 * TAU))

// grain of every surface: a small tile of hashed noise is enough at ±2.5 %
const TILE = Float32Array.from({ length: 128 * 128 }, (_, i) => hash2(i & 127, i >> 7, 0x6B0))

function finishPixel(sc: Scene, xn: number, yn: number, px: number, py: number) {
  if (sc.finish === 'Oiled') {
    let q = ((xn * 0.55 + yn * 0.84 + 0.25) / 0.32 * 64 + 512) | 0
    q = q < 0 ? 0 : q > 1023 ? 1023 : q
    const sh = SHEEN[q]
    O[0] += (255 - O[0]) * sh
    O[1] += (255 - O[1]) * sh
    O[2] += (255 - O[2]) * sh
  }
  const n = 0.975 + 0.05 * TILE[((py & 127) << 7) | (px & 127)]
  O[0] *= n
  O[1] *= n
  O[2] *= n
}

function inkPixel(pal: Pal, px: number, py: number) {
  let d = O[3]
  // relief prints never take the ink evenly
  if (TILE[(((py >> 1) & 127) << 7) | ((px >> 1) & 127)] < 0.06)
    d *= 0.35
  if (d > 1)
    d = 1
  O[0] = pal.paper[0] + (pal.ink[0] - pal.paper[0]) * d
  O[1] = pal.paper[1] + (pal.ink[1] - pal.paper[1]) * d
  O[2] = pal.paper[2] + (pal.ink[2] - pal.paper[2]) * d
  if (O[4] > 0)
    mixTo(pal.accent, O[4] * 0.9)
}

// ---------------------------------------------------------------------------
// The pass, band by band to bound memory at 8K.
// ---------------------------------------------------------------------------

export function paint(ctx: CanvasRenderingContext2D, sc: Scene) {
  const { W, H, S, sp } = sc
  const ink = sc.finish === 'Ink'
  const pal = palette(sp, sc.finish)
  const luts = sc.objects.map(o => buildLut(sp, pal, o.tree!, (o.kind === 'round' ? o.R : o.Rlog) * S, ink))
  const bandH = Math.max(1, Math.min(H, Math.floor(3_000_000 / W)))
  const H2 = H / 2
  const W2 = W / 2
  const bgA = ink ? sp.paper : sc.ground === 'single' ? sp.bg : sp.deep
  const bgB = ink ? sp.paper : sc.ground === 'single' ? sp.bg2 : sp.deep
  const flat = sc.ground === 'deep' && !ink
  for (let by0 = 0; by0 < H; by0 += bandH) {
    const bh = Math.min(bandH, H - by0)
    const img = ctx.createImageData(W, bh)
    const data = img.data
    // ground, one 32-bit write per pixel (canvas pixels are little-endian RGBA)
    const d32 = new Uint32Array(data.buffer, data.byteOffset, W * bh)
    // piles and floors cover almost everything: a plain fill is enough there
    if (flat)
      d32.fill(0xFF000000 | (bgA[2] << 16) | (bgA[1] << 8) | bgA[0])
    for (let yy = 0; yy < (flat ? 0 : bh); yy++) {
      const yn = (by0 + yy + 0.5 - H2) / S
      const trow = (((by0 + yy) >> 1) & 127) << 7
      let o = yy * W
      for (let x = 0; x < W; x++, o++) {
        const xn = (x + 0.5 - W2) / S
        let v = (xn * xn + yn * yn - 0.12) * 0.75
        v = v < 0 ? 0 : v > 1 ? 1 : v
        const n = 0.985 + 0.03 * TILE[trow + ((x >> 1) & 127)]
        const r = (bgA[0] + (bgB[0] - bgA[0]) * v) * n
        const g = (bgA[1] + (bgB[1] - bgA[1]) * v) * n
        const b = (bgA[2] + (bgB[2] - bgA[2]) * v) * n
        d32[o] = 0xFF000000 | (b << 16) | (g << 8) | r
      }
    }
    if (sc.ground === 'single' && !ink) {
      for (const ob of sc.objects) {
        if (ob.kind === 'round')
          shadowRound(sc, ob, data, by0, bh)
      }
    }
    sc.objects.forEach((ob, i) => {
      if (ob.kind === 'round')
        paintRound(sc, pal, luts[i], ob, data, by0, bh)
      else
        paintBoard(sc, pal, luts[i], ob, data, by0, bh)
    })
    ctx.putImageData(img, 0, by0)
  }
}

function pieceBox(sc: Scene, o: Round, p: Piece): [number, number, number, number] {
  const e = roundExtent(o)
  const cx = sc.W / 2 + (o.cx + p.dx) * sc.S
  const cy = sc.H / 2 + (o.cy + p.dy) * sc.S
  return [Math.floor(cx - e * sc.S), Math.floor(cy - e * sc.S), Math.ceil(cx + e * sc.S), Math.ceil(cy + e * sc.S)]
}

function shadowRound(sc: Scene, o: Round, data: Uint8ClampedArray, by0: number, bh: number) {
  const { W, H, S, sp } = sc
  const g = o.grid!
  const gv = g.v
  const cr = Math.cos(o.rot)
  const sr = Math.sin(o.rot)
  const sdx = 0.009
  const sdy = 0.016
  // well inside the outline the shadow is hidden under the wood: skip it
  let hs = 0
  for (let k = 0; k < o.harm.length; k += 2)
    hs += Math.hypot(o.harm[k], o.harm[k + 1])
  const rIn = Math.max(0, (o.R - Math.hypot(o.px, o.py)) * (1 - hs) * 0.9 - 0.04)
  const rIn2 = rIn * rIn
  for (const p of o.pieces) {
    const [ax, ay, bx, byy] = pieceBox(sc, o, p)
    const ys = Math.max(by0, ay)
    const ye = Math.min(by0 + bh, byy)
    const xs = Math.max(0, ax)
    const xe = Math.min(W, bx)
    for (let y = ys; y < ye; y++) {
      const yn = (y + 0.5 - H / 2) / S - o.cy - p.dy - sdy
      let off = ((y - by0) * W + xs) * 4
      for (let x = xs; x < xe; x++, off += 4) {
        const xn = (x + 0.5 - W / 2) / S - o.cx - p.dx - sdx
        const lx = xn * cr + yn * sr
        const ly = -xn * sr + yn * cr
        if (lx * lx + ly * ly < rIn2 && p.x0 < -5 && p.x1 > 5)
          continue
        const bc = clamp01((lx - p.x0) * S / 6 + 0.5) * clamp01((p.x1 - lx) * S / 6 + 0.5)
          * clamp01((ly - p.y0) * S / 6 + 0.5) * clamp01((p.y1 - ly) * S / 6 + 0.5)
        if (bc <= 0)
          continue
        // bilinear sample of t and of the bark edge
        let gx = (lx - g.x0) / g.step
        let gy = (ly - g.y0) / g.step
        gx = gx < 0 ? 0 : gx
        gy = gy < 0 ? 0 : gy
        let i = gx | 0
        let j = gy | 0
        if (i > g.nx - 2)
          i = g.nx - 2
        if (j > g.ny - 2)
          j = g.ny - 2
        const fx = Math.min(1, gx - i)
        const fy = Math.min(1, gy - j)
        const a = (j * g.nx + i) * CH
        const b = a + g.nx * CH
        const p0 = gv[a] + (gv[a + CH] - gv[a]) * fx
        const t = p0 + (gv[b] + (gv[b + CH] - gv[b]) * fx - p0) * fy
        const p1 = gv[a + 1] + (gv[a + CH + 1] - gv[a + 1]) * fx
        const tOut = p1 + (gv[b + 1] + (gv[b + CH + 1] - gv[b + 1]) * fx - p1) * fy
        const dist = (t - tOut) * o.R
        if (dist > 0.03)
          continue
        const sa = 0.42 * (1 - smooth(-0.008, 0.03, dist)) * bc
        if (sa < 0.004)
          continue
        data[off] += (sp.shadow[0] - data[off]) * sa
        data[off + 1] += (sp.shadow[1] - data[off + 1]) * sa
        data[off + 2] += (sp.shadow[2] - data[off + 2]) * sa
      }
    }
  }
}

function paintRound(sc: Scene, pal: Pal, lut: Lut, o: Round, data: Uint8ClampedArray, by0: number, bh: number) {
  const { W, H, S, sp } = sc
  const ink = sc.finish === 'Ink'
  const g = o.grid!
  const gv = g.v
  const cr = Math.cos(o.rot)
  const sr = Math.sin(o.rot)
  const rpx = o.R * S
  const poreCell = 0.0026
  const poreSeed = o.seed ^ 0x2F1
  const porePx = poreCell * S * sp.poreSize
  const poreA = sp.poreAlpha * clamp01((porePx - 0.4) / 1.6)
  const poreOn = sp.poreDensity > 0 && poreA > 0
  const sawA = o.saw && !ink ? 0.022 * clamp01((0.011 * S - 2) / 4) : 0
  const pile = sc.ground === 'deep' && !ink
  const layerK = 3.2 / o.barkT
  for (const p of o.pieces) {
    const [ax, ay, bx, byy] = pieceBox(sc, o, p)
    const ys = Math.max(by0, ay)
    const ye = Math.min(by0 + bh, byy)
    const xs = Math.max(0, ax)
    const xe = Math.min(W, bx)
    const whole = p.x0 < -5 && p.x1 > 5 && p.y0 < -5 && p.y1 > 5
    for (let y = ys; y < ye; y++) {
      const yn0 = (y + 0.5 - H / 2) / S
      const yn = yn0 - o.cy - p.dy
      let off = ((y - by0) * W + xs) * 4
      for (let x = xs; x < xe; x++, off += 4) {
        const xn0 = (x + 0.5 - W / 2) / S
        const xn = xn0 - o.cx - p.dx
        const lx = xn * cr + yn * sr
        const ly = -xn * sr + yn * cr
        let bc = 1
        if (!whole) {
          bc = clamp01((lx - p.x0) * S + 0.5) * clamp01((p.x1 - lx) * S + 0.5)
            * clamp01((ly - p.y0) * S + 0.5) * clamp01((p.y1 - ly) * S + 0.5)
          if (bc <= 0)
            continue
        }
        // bilinear sample of the grid
        let gx = (lx - g.x0) / g.step
        let gy = (ly - g.y0) / g.step
        gx = gx < 0 ? 0 : gx
        gy = gy < 0 ? 0 : gy
        let i = gx | 0
        let j = gy | 0
        if (i > g.nx - 2)
          i = g.nx - 2
        if (j > g.ny - 2)
          j = g.ny - 2
        const fx = Math.min(1, gx - i)
        const fy = Math.min(1, gy - j)
        const a = (j * g.nx + i) * CH
        const b = a + g.nx * CH
        const w00 = (1 - fx) * (1 - fy)
        const w10 = fx * (1 - fy)
        const w01 = (1 - fx) * fy
        const w11 = fx * fy
        const t = gv[a] * w00 + gv[a + CH] * w10 + gv[b] * w01 + gv[b + CH] * w11
        const tOut = gv[a + 1] * w00 + gv[a + CH + 1] * w10 + gv[b + 1] * w01 + gv[b + CH + 1] * w11
        const cover = clamp01((tOut - t) * rpx + 0.5) * bc
        if (cover <= 0)
          continue
        const fig = gv[a + 4] * w00 + gv[a + CH + 4] * w10 + gv[b + 4] * w01 + gv[b + CH + 4] * w11
        if (t < 1) {
          const f = woodAt(lut, t, fig, o.heart, sp.figure, o.tone, ink)
          // vessels: round pores in the earlywood band
          if (poreOn && f < sp.poreBand) {
            const qx = lx / poreCell
            const qy = ly / poreCell
            const ix = Math.floor(qx)
            const iy = Math.floor(qy)
            const hi = hash2i(ix, iy, poreSeed)
            const h = hi / 4294967296
            if (h < sp.poreDensity * (1 - f / Math.max(0.01, sp.poreBand) * 0.6)) {
              // the low bits of the same hash place the vessel in its cell
              const jx = qx - ix - 0.3 - 0.4 * ((hi & 255) / 255)
              const jy = qy - iy - 0.3 - 0.4 * (((hi >>> 8) & 255) / 255)
              const rr = sp.poreSize * 0.5 * (0.55 + 0.45 * h / sp.poreDensity)
              if (jx * jx + jy * jy < rr * rr) {
                if (ink)
                  O[3] = Math.max(O[3], 0.9 * clamp01(porePx / 1.5))
                else
                  mixTo(pal.pore, poreA)
              }
            }
          }
          // knots crossing the section
          const kk = gv[a + 3] * w00 + gv[a + CH + 3] * w10 + gv[b + 3] * w01 + gv[b + CH + 3] * w11
          if (kk > -0.02) {
            const ka = clamp01((kk + 0.02) * 14)
            // the branch's own growth layers run along it: streaks parallel to its axis
            const s = (kk * 6.5) % 1
            if (ink) {
              O[3] += ((s > 0.7 ? 0.2 : 0.9) - O[3]) * ka
            }
            else {
              // darker, resinous wood of the same species, with a bark rim if the branch was dead
              const dark = 0.3 + 0.3 * smooth(0.55, 0.9, s) + 0.15 * kk + (o.deadKnots && kk < 0.18 ? 0.45 : 0)
              mixTo(pal.knot, ka * 0.55)
              mixTo(pal.knotDark, ka * Math.min(0.95, dark))
            }
          }
          // pith
          if (t < 0.02) {
            const pa = 1 - smooth(0.008, 0.02, t)
            if (ink)
              O[3] += (1 - O[3]) * pa
            else
              mixTo(pal.pith, pa * 0.8)
          }
          // cambium: a fine line under the bark
          if (t > 0.992) {
            const ca = smooth(0.992, 1, t) * 0.5
            if (ink)
              O[3] += (1 - O[3]) * ca
            else
              mixTo(pal.barkInner, ca)
          }
          if (sc.spalted) {
            const d = gv[a + 5] * w00 + gv[a + CH + 5] * w10 + gv[b + 5] * w01 + gv[b + CH + 5] * w11
            const s = gv[a + 7] * w00 + gv[a + CH + 7] * w10 + gv[b + 7] * w01 + gv[b + CH + 7] * w11
            spalt(pal, d, s, fig, S, ink)
          }
          if (sawA > 0) {
            const dxs = lx - o.saw![0]
            const dys = ly - o.saw![1]
            const m = 1 + sawA * WAVE[((Math.sqrt(dxs * dxs + dys * dys) * (1024 / 0.011)) | 0) & 1023]
            O[0] *= m
            O[1] *= m
            O[2] *= m
          }
        }
        else {
          // bark: phloem, then layered plates split by crevices and streaks
          const fiss = gv[a + 2] * w00 + gv[a + CH + 2] * w10 + gv[b + 2] * w01 + gv[b + CH + 2] * w11
          const st = gv[a + 6] * w00 + gv[a + CH + 6] * w10 + gv[b + 6] * w01 + gv[b + CH + 6] * w11
          const bb = (t - 1) / Math.max(1e-4, tOut - 1)
          const layer = ((t - 1) * layerK + fiss * 1.5 + st * 0.6) % 1
          if (ink) {
            O[3] = bb < 0.15 ? 0.95 : fiss > 0.4 ? 0.1 : layer < 0.18 ? 0.35 : 0.92
            O[4] = 0
          }
          else if (bb < 0.16) {
            O[0] = pal.barkInner[0]
            O[1] = pal.barkInner[1]
            O[2] = pal.barkInner[2]
            mixTo(pal.crevice, smooth(0.1, 0.18, bb) * 0.35)
          }
          else {
            O[0] = pal.barkA[0]
            O[1] = pal.barkA[1]
            O[2] = pal.barkA[2]
            if (sp.paperBark) {
              mixTo(pal.barkB, smooth(0.3, 0.7, layer) * 0.7)
              mixTo(pal.crevice, Math.min(0.9, (layer < 0.08 ? 0.7 : 0) + fiss * 0.7 + (st > 0.8 ? 0.5 : 0)))
            }
            else {
              mixTo(pal.barkB, smooth(0.2, 0.8, layer) * 0.8 + st * 0.2)
              mixTo(pal.crevice, Math.min(0.92, fiss * 1.2 * (0.35 + bb) + smooth(0.62, 0.85, st) * 0.55 * bb))
            }
            const hn = 0.9 + 0.2 * TILE[(((y >> 1) & 127) << 7) | ((x >> 1) & 127)]
            O[0] *= hn
            O[1] *= hn
            O[2] *= hn
          }
        }
        if (ink) {
          inkPixel(pal, x, y)
        }
        else {
          finishPixel(sc, xn0, yn0, x, y)
          if (pile) {
            // ambient occlusion towards the rim of logs stacked in a pile
            const ao = 1 - 0.3 * smooth(0.85, 1.06, t / tOut)
            O[0] *= ao
            O[1] *= ao
            O[2] *= ao
          }
        }
        data[off] += (O[0] - data[off]) * cover
        data[off + 1] += (O[1] - data[off + 1]) * cover
        data[off + 2] += (O[2] - data[off + 2]) * cover
      }
    }
  }
}

function paintBoard(sc: Scene, pal: Pal, lut: Lut, o: Board, data: Uint8ClampedArray, by0: number, bh: number) {
  const { W, H, S, sp } = sc
  const ink = sc.finish === 'Ink'
  const g = o.grid!
  const gv = g.v
  // vessels of a long-grain face are short dashes along the fibres
  const cu = 0.016
  const cv = 0.0024
  const poreSeed = o.seed ^ 0x77
  const porePx = cv * S * sp.poreSize
  const poreA = sp.poreAlpha * 0.6 * clamp01((porePx - 0.4) / 1.6)
  const poreOn = sp.poreDensity > 0 && poreA > 0
  const xs = Math.max(0, Math.floor(W / 2 + o.x0 * S))
  const xe = Math.min(W, Math.ceil(W / 2 + o.x1 * S))
  const ys = Math.max(by0, Math.floor(H / 2 + o.y0 * S))
  const ye = Math.min(by0 + bh, Math.ceil(H / 2 + o.y1 * S))
  const fleckOn = o.quarter && sp.rays > 0
  const fleckA = sp.rayWidth > 0.0015 ? 0.6 : 0.28
  for (let y = ys; y < ye; y++) {
    const yn = (y + 0.5 - H / 2) / S
    const ey = Math.min(yn - o.y0, o.y1 - yn)
    let off = ((y - by0) * W + xs) * 4
    for (let x = xs; x < xe; x++, off += 4) {
      const xn = (x + 0.5 - W / 2) / S
      const ex = Math.min(xn - o.x0, o.x1 - xn)
      const cover = clamp01(ex * S + 0.5) * clamp01(ey * S + 0.5)
      if (cover <= 0)
        continue
      let gx = (xn - g.x0) / g.step
      let gy = (yn - g.y0) / g.step
      gx = gx < 0 ? 0 : gx
      gy = gy < 0 ? 0 : gy
      let i = gx | 0
      let j = gy | 0
      if (i > g.nx - 2)
        i = g.nx - 2
      if (j > g.ny - 2)
        j = g.ny - 2
      const fx = Math.min(1, gx - i)
      const fy = Math.min(1, gy - j)
      const a = (j * g.nx + i) * CH
      const b = a + g.nx * CH
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      const t = gv[a] * w00 + gv[a + CH] * w10 + gv[b] * w01 + gv[b + CH] * w11
      const kk = gv[a + 1] * w00 + gv[a + CH + 1] * w10 + gv[b + 1] * w01 + gv[b + CH + 1] * w11
      const fig = gv[a + 4] * w00 + gv[a + CH + 4] * w10 + gv[b + 4] * w01 + gv[b + CH + 4] * w11
      const u = o.horiz ? xn : yn
      const v = o.horiz ? yn : xn
      const f = woodAt(lut, t, fig, o.heart, sp.figure, o.tone, ink)
      if (poreOn && f < sp.poreBand) {
        const iu = Math.floor(u / cu)
        const qv = v / cv
        const iv = Math.floor(qv)
        const h = hash2(iu, iv, poreSeed)
        if (h < sp.poreDensity * 0.7) {
          const ju = Math.abs(u / cu - iu - 0.5) * 2
          const jv = Math.abs(qv - iv - 0.5) * 2
          if (ju < 0.4 + 0.5 * h / sp.poreDensity && jv < sp.poreSize) {
            if (ink)
              O[3] = Math.max(O[3], 0.85 * clamp01(porePx / 1.5))
            else
              mixTo(pal.pore, poreA)
          }
        }
      }
      // ray fleck of a quarter-sawn face: ragged flakes across the stripes
      if (fleckOn) {
        const qu = (u - v * 0.35) / 0.026
        const qv = v / 0.06
        const iu = Math.floor(qu)
        const iv = Math.floor(qv)
        const hi = hash2i(iu, iv, poreSeed + 9)
        const h = hi / 4294967296
        // flakes come in drifts: dense where the figure is high
        if (h < 0.65 * fig * fig) {
          const sl = ((hi & 255) / 255 - 0.5) * 0.9
          const jv = (qv - iv - 0.5) * 2
          const ju = (qu - iu - 0.5) * 2 + jv * sl
          const len = 0.3 + ((hi >>> 8) & 255) / 255 * 0.7
          // the width wavers along the flake
          const wid = 0.1 + 0.3 * hash2(iu, Math.floor(qv * 4), poreSeed + 4) * (1 - jv * jv)
          const e = ju * ju / (wid * wid) + jv * jv / (len * len)
          if (e < 1) {
            const fa = fleckA * clamp01((1 - e) * 3) * (0.6 + 0.4 * ((hi >>> 16) & 255) / 255)
            if (ink)
              O[3] *= 1 - fa
            else
              mixTo(pal.ray, fa)
          }
        }
      }
      if (kk > -0.02) {
        const ka = clamp01((kk + 0.02) * 12)
        const s = ((1 - kk) * 7) % 1
        if (ink) {
          O[3] += ((s > 0.7 ? 0.2 : 0.85) - O[3]) * ka
        }
        else {
          const sR = O[0]
          const sG = O[1]
          const sB = O[2]
          O[0] = pal.knot[0]
          O[1] = pal.knot[1]
          O[2] = pal.knot[2]
          mixTo(pal.knotDark, Math.min(1, 0.2 + 0.5 * smooth(0.55, 0.95, s) + (o.deadKnots && kk < 0.14 ? 0.55 : 0)))
          O[0] = sR + (O[0] - sR) * ka
          O[1] = sG + (O[1] - sG) * ka
          O[2] = sB + (O[2] - sB) * ka
        }
      }
      if (sc.spalted) {
        const d = gv[a + 5] * w00 + gv[a + CH + 5] * w10 + gv[b + 5] * w01 + gv[b + CH + 5] * w11
        const s = gv[a + 7] * w00 + gv[a + CH + 7] * w10 + gv[b + 7] * w01 + gv[b + CH + 7] * w11
        spalt(pal, d, s, fig, S, ink)
      }
      if (ink) {
        inkPixel(pal, x, y)
      }
      else {
        finishPixel(sc, xn, yn, x, y)
        // eased edges catch less light
        const e = ex < ey ? ex : ey
        if (e < 0.007) {
          const bev = 1 - 0.22 * (1 - smooth(0, 0.007, e))
          O[0] *= bev
          O[1] *= bev
          O[2] *= bev
        }
      }
      data[off] += (O[0] - data[off]) * cover
      data[off + 1] += (O[1] - data[off + 1]) * cover
      data[off + 2] += (O[2] - data[off + 2]) * cover
    }
  }
}
