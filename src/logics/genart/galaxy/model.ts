// The galaxy model of the "Galaxy" series: stars on nested, progressively
// rotated ovals.
//
// The density-wave theory of C. C. Lin and F. H. Shu (1964) explains spiral
// arms as a pattern, not as material: stars keep orbiting and only crowd where
// their orbits pile up. A. Kalnajs (1973) drew it as a family of ellipses, each
// one turned a little more than the one inside it; where neighbouring ellipses
// come close the stars bunch up, and two arms appear without any arm being
// drawn. Ingo Berg's "Rendering a galaxy with the density wave theory"
// (beltoforion.de) turned the figure into a renderer; this file is written
// from that description, with a bar (orbits elongated and aligned inside the
// bar radius), m-fold ovals for three- and four-armed patterns, and an arm
// contrast map that tells young stars, dust and H II regions where the arms are.
//
// Galaxy units: the disc fades out around a = 1.

import type { Rng } from '../random'

export interface Galaxy {
  kind: 'spiral' | 'elliptical' | 'irregular'
  /** Arm multiplicity: 2 draws true ellipses, 3 and 4 draw m-fold ovals. */
  m: number
  /** Rotation of the orbits (radians) from a = 0 to a = 1. */
  twist: number
  /** Minor / major axis ratio of the disc orbits. */
  qArm: number
  /** Radius of the round core (no bar) or of the bar. */
  rCore: number
  aBar: number
  qBar: number
  /** Exponential disc scale length. */
  rd: number
  bulgeRe: number
  /** Sérsic index of the bulge (integer, 1 to 4). */
  bulgeN: number
  /** Intrinsic flattening of the bulge. */
  bulgeQ: number
  bulgeL: number
  discL: number
  youngL: number
  hii: number
  dust: number
  /** 0 = grand design, 1 = patchy flocculent arms. */
  flocc: number
  /** Clumps of an irregular galaxy: x, y, sigma, weight. */
  clumps: Array<[number, number, number, number]>
  /** Projection: centre and size in canvas short sides, inclination, position angle, handedness. */
  cx: number
  cy: number
  size: number
  incl: number
  pa: number
  spin: number
  phi0: number
  /** Shells left by an old merger around an elliptical (0 = none). */
  shells: number
  /** Seed of the patchiness noise. */
  noiseSeed: number
}

export function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// Sine table with linear interpolation: the orbit sampler calls it millions
// of times at 8K, and Math.sin/cos are the bulk of its cost.
const TN = 4096
const SIN = new Float64Array(TN + 1)
for (let i = 0; i <= TN; i++)
  SIN[i] = Math.sin(i / TN * Math.PI * 2)
const TWO_PI = Math.PI * 2

export function fsin(x: number) {
  let u = x / TWO_PI
  u -= Math.floor(u)
  const f = u * TN
  const i = f | 0
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i)
}

export const fcos = (x: number) => fsin(x + Math.PI / 2)

/** Position in the galaxy plane of the star at phase t on the orbit of semi-major axis a. */
export function orbit(G: Galaxy, a: number, t: number, out: Float64Array, soft = 1) {
  let q: number
  let phi: number
  if (G.aBar > 0) {
    const s = smooth(G.aBar * 0.75, G.aBar * 1.3, a)
    q = G.qBar + (G.qArm - G.qBar) * s
    const a0 = G.aBar * 0.8
    phi = a > a0 ? G.twist * (a - a0) * smooth(a0, a0 + 0.25, a) : 0
  }
  else {
    q = 1 + (G.qArm - 1) * smooth(0, G.rCore, a)
    phi = G.twist * a
  }
  // orbits round off again beyond the edge of the disc
  q += (1 - q) * smooth(1, 1.6, a)
  // soft < 1 rounds the orbit: a smoother population between the arms
  q = 1 - (1 - q) * soft
  phi += G.phi0
  let x: number
  let y: number
  const ct = fcos(t)
  const st = fsin(t)
  if (G.m === 2) {
    x = a * ct
    y = a * q * st
  }
  else {
    const rho = a * (1 - (1 - q) * 0.5 * (1 - fcos(G.m * t)))
    x = rho * ct
    y = rho * st
  }
  const c = fcos(phi)
  const s = fsin(phi)
  out[0] = x * c - y * s
  out[1] = (x * s + y * c) * G.spin
}

// Inverse cumulative distributions, tabulated once: one uniform draw per
// sample instead of a sum of several, and no logarithm in the hot loops.
const IC_N = 2048

function inverseCdf(cdf: (x: number) => number, lo: number, hi: number): Float64Array {
  const tab = new Float64Array(IC_N + 1)
  for (let i = 0; i <= IC_N; i++) {
    const u = Math.min(1 - 0.25 / IC_N, Math.max(0.25 / IC_N, i / IC_N))
    let a = lo
    let b = hi
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2
      if (cdf(m) < u)
        a = m
      else
        b = m
    }
    tab[i] = (a + b) / 2
  }
  return tab
}

function lookup(tab: Float64Array, u: number) {
  const f = u * IC_N
  const i = f | 0
  return tab[i] + (tab[i + 1] - tab[i]) * (f - i)
}

/** Gamma(k) CDF for an integer shape k. */
function gammaCdf(k: number) {
  return (x: number) => {
    let term = 1
    let sum = 1
    for (let j = 1; j < k; j++) {
      term *= x / j
      sum += term
    }
    return 1 - Math.exp(-x) * sum
  }
}

// Normal CDF through the error function of Abramowitz & Stegun (7.1.26).
function normalCdf(x: number) {
  const z = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * z)
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

const GAMMA = [1, 2, 4, 6, 8].map(k => inverseCdf(gammaCdf(k), 0, 80))
const NORMAL = inverseCdf(normalCdf, -6, 6)

/** Semi-major axis drawn from an exponential disc (surface density e^(-r / rd)): r / rd follows Gamma(2). */
export function discRadius(r: Rng, rd: number) {
  return rd * lookup(GAMMA[1], r())
}

/**
 * Radius drawn from a Sérsic profile of integer index n: with s = b (r / Re)^(1/n),
 * the projected mass in s follows a Gamma(2n) law.
 */
export function sersicRadius(r: Rng, re: number, n: number) {
  const s = lookup(GAMMA[n], r())
  const b = 2 * n - 1 / 3
  return re * (s / b) ** n
}

/** Standard normal from one draw. */
export const nearGauss = (r: Rng) => lookup(NORMAL, r())

// Hashed value noise on an integer lattice: no state, no draws.
function hash2(i: number, j: number, seed: number) {
  let h = Math.imul(i, 0x27D4EB2D) ^ Math.imul(j, 0x165667B1) ^ seed
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = x - xi
  const v = y - yi
  const fu = u * u * (3 - 2 * u)
  const fv = v * v * (3 - 2 * v)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv
}

export function fbm(x: number, y: number, seed: number, octaves: number) {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, seed + o * 1013)
    amp *= 0.5
    f *= 2.03
  }
  return sum
}

/**
 * Arm contrast in the galaxy plane: the old-star density divided by its mean
 * at the same radius. Above 1 lies an arm (or the bar), below 1 a gap.
 * Built from a fixed number of samples, so it does not depend on the canvas.
 */
export interface PlaneMap {
  n: number
  ext: number
  v: Float32Array
}

/** Tabulates fn over the square [-ext, ext]^2 of the galaxy plane. */
export function planeMap(ext: number, n: number, fn: (x: number, y: number) => number): PlaneMap {
  const v = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    const y = ((j + 0.5) / n * 2 - 1) * ext
    for (let i = 0; i < n; i++)
      v[j * n + i] = fn(((i + 0.5) / n * 2 - 1) * ext, y)
  }
  return { n, ext, v }
}

/** Bilinear lookup in a plane map, `outside` beyond its edge. */
export function mapAt(M: PlaneMap, x: number, y: number, outside = 0) {
  const fx = (x / M.ext * 0.5 + 0.5) * M.n - 0.5
  const fy = (y / M.ext * 0.5 + 0.5) * M.n - 0.5
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  if (i < 0 || j < 0 || i >= M.n - 1 || j >= M.n - 1)
    return outside
  const u = fx - i
  const v = fy - j
  const o = j * M.n + i
  const c = M.v
  const a = c[o] + (c[o + 1] - c[o]) * u
  const b = c[o + M.n] + (c[o + M.n + 1] - c[o + M.n]) * u
  return a + (b - a) * v
}

export interface ArmMap extends PlaneMap {
  /** Contrast reached by the brightest 12 % of the disc. */
  hi: number
}

export function armMap(G: Galaxy, r: Rng): ArmMap {
  const n = 128
  const ext = 1.35
  const d = new Float32Array(n * n)
  const p = new Float64Array(2)
  const samples = 26000
  for (let k = 0; k < samples; k++) {
    const a = discRadius(r, G.rd * 1.35)
    if (a > ext)
      continue
    orbit(G, a, r() * Math.PI * 2, p)
    const i = Math.floor((p[0] / ext * 0.5 + 0.5) * n)
    const j = Math.floor((p[1] / ext * 0.5 + 0.5) * n)
    if (i >= 0 && j >= 0 && i < n && j < n)
      d[j * n + i]++
  }
  // light smoothing, then divide by the mean of each ring
  const s = new Float32Array(n * n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let acc = 0
      let w = 0
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = i + di
          const jj = j + dj
          if (ii < 0 || jj < 0 || ii >= n || jj >= n)
            continue
          const ww = di === 0 && dj === 0 ? 4 : (di === 0 || dj === 0 ? 2 : 1)
          acc += d[jj * n + ii] * ww
          w += ww
        }
      }
      s[j * n + i] = acc / w
    }
  }
  const bins = 48
  const sum = new Float64Array(bins)
  const cnt = new Float64Array(bins)
  const binOf = (i: number, j: number) => {
    const x = ((i + 0.5) / n * 2 - 1) * ext
    const y = ((j + 0.5) / n * 2 - 1) * ext
    return Math.min(bins - 1, Math.floor(Math.sqrt(x * x + y * y) / ext * bins))
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const b = binOf(i, j)
      sum[b] += s[j * n + i]
      cnt[b]++
    }
  }
  const c = new Float32Array(n * n)
  const vals: number[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const b = binOf(i, j)
      const mean = sum[b] / Math.max(1, cnt[b])
      const v = mean > 0.05 ? s[j * n + i] / mean : 1
      c[j * n + i] = v
      const x = ((i + 0.5) / n * 2 - 1) * ext
      const y = ((j + 0.5) / n * 2 - 1) * ext
      const rr = Math.sqrt(x * x + y * y)
      if (rr > 0.15 && rr < 0.95)
        vals.push(v)
    }
  }
  vals.sort((a, b) => a - b)
  const hi = Math.max(1.08, vals[Math.floor(vals.length * 0.88)] ?? 1.2)
  return { n, ext, v: c, hi }
}

export const contrastAt = (M: ArmMap, x: number, y: number) => mapAt(M, x, y, 1)

/** Height above the plane, for a disc of scale height h. */
export const height = (r: Rng, h: number) => lookup(NORMAL, r()) * h
