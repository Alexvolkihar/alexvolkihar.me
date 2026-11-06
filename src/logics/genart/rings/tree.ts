// Small deterministic helpers for "Rings": object-local generators, integer
// hashing, value noise, periodic noise and the ring-width table of one tree.
//
// Nothing here reads Math.random, the clock or the environment.

import type { Rng } from '../random'
import { gaussian, int, range, sfc32 } from '../random'

export type Growth = 'Steady' | 'Drought' | 'Reaction' | 'Ancient'

/**
 * A private generator for one object of the scene (a log, a board...), keyed
 * by a seed drawn from the layout stream. Objects outside the canvas never
 * touch it, so cropping the canvas never shifts the randomness of the others.
 */
export function subRng(seed: number, salt: number): Rng {
  const r = sfc32([seed >>> 0, Math.imul(salt + 1, 0x9E3779B1) >>> 0, 0x6A09E667, (seed ^ 0x5BE0CD19) >>> 0])
  for (let i = 0; i < 12; i++)
    r()
  return r
}

/** Integer hash of a lattice cell, as an unsigned 32-bit integer. */
export function hash2i(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27D4EB2D) ^ Math.imul(y | 0, 0x165667B1) ^ s
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Integer hash of a lattice cell, in [0, 1). Used for pores and fleck. */
export function hash2(x: number, y: number, s: number): number {
  return hash2i(x, y, s) / 4294967296
}

export type Noise2 = (x: number, y: number) => number

/** Value noise in [0, 1] on an integer-hashed lattice, smoothstep-interpolated. */
export function makeNoise(r: Rng): Noise2 {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const tmp = idx[i]
    idx[i] = idx[j]
    idx[j] = tmp
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    let u = x - xi
    let w = y - yi
    u = u * u * (3 - 2 * u)
    w = w * w * (3 - 2 * w)
    const p0 = perm[X]
    const p1 = perm[X + 1]
    const a0 = val[perm[p0 + Y]]
    const a1 = val[perm[p1 + Y]]
    const b0 = val[perm[p0 + Y + 1]]
    const b1 = val[perm[p1 + Y + 1]]
    const a = a0 + u * (a1 - a0)
    const b = b0 + u * (b1 - b0)
    return a + w * (b - a)
  }
}

/** Two octaves of value noise, still in [0, 1]. */
export function fbm(n: Noise2, x: number, y: number): number {
  return (n(x, y) * 2 + n(x * 2.03 + 17.1, y * 2.03 + 5.3)) / 3
}

/** Smooth periodic noise of `cells` lattice cells around a turn (input in turns). */
export function periodic(r: Rng, cells: number): (turn: number) => number {
  const v = Float32Array.from({ length: cells }, () => r())
  return (turn: number) => {
    let x = (turn - Math.floor(turn)) * cells
    const i = Math.floor(x)
    x -= i
    x = x * x * (3 - 2 * x)
    const a = v[i % cells]
    return a + (v[(i + 1) % cells] - a) * x
  }
}

// ---------------------------------------------------------------------------
// Ring widths. A tree is a list of yearly increments: wide juvenile rings near
// the pith, a slow narrowing as the stem gets thicker, a red-noise "climate"
// series (AR(1)), and for the drought trait a few runs of suppressed years
// and one release. The table `year` maps the normalised radius t in [0, 1]
// (pith to cambium) to a fractional year index, so a pixel finds its ring and
// its position inside that ring with a single lookup.
// ---------------------------------------------------------------------------

export interface Tree {
  n: number
  /** year[k] = fractional ring index at t = k / TABLE. */
  year: Float32Array
  /** Ring width as a fraction of the radius. */
  width: Float32Array
  /** Where latewood starts inside each ring (0..1). */
  late: Float32Array
  /** Brightness factor of each ring. */
  tone: Float32Array
}

export const TABLE = 4096

export function growTree(r: Rng, growth: Growth, lateStart: number, ringScale = 1): Tree {
  let n: number
  let sigma: number
  let phi: number
  let narrowing: number
  switch (growth) {
    case 'Steady':
      n = int(r, 26, 50)
      sigma = 0.1
      phi = 0.5
      narrowing = 0.3
      break
    case 'Drought':
      n = int(r, 38, 70)
      sigma = 0.24
      phi = 0.6
      narrowing = 0.35
      break
    case 'Reaction':
      n = int(r, 30, 58)
      sigma = 0.16
      phi = 0.55
      narrowing = 0.4
      break
    default:
      n = int(r, 105, 165)
      sigma = 0.2
      phi = 0.65
      narrowing = 0.6
  }
  n = Math.round(n * ringScale)
  const w = new Float64Array(n)
  const juvenile = range(r, 0.6, 1.4)
  let e = 0
  for (let i = 0; i < n; i++) {
    e = phi * e + sigma * gaussian(r)
    w[i] = (1 + juvenile * Math.exp(-i / (0.15 * n + 1))) * (1 - narrowing * i / n) * Math.exp(e)
  }
  if (growth === 'Drought') {
    const episodes = int(r, 2, 4)
    for (let k = 0; k < episodes; k++) {
      const start = int(r, 3, n - 4)
      const len = int(r, 3, 8)
      const f = range(r, 0.22, 0.42)
      for (let i = start; i < Math.min(n, start + len); i++)
        w[i] *= f
    }
    const rel = int(r, Math.floor(n * 0.3), n - 6)
    const rlen = int(r, 4, 9)
    const rf = range(r, 1.5, 2.1)
    for (let i = rel; i < Math.min(n, rel + rlen); i++)
      w[i] *= rf
  }
  let sum = 0
  for (let i = 0; i < n; i++)
    sum += w[i]
  let mean = 0
  const width = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    width[i] = w[i] / sum
    mean += width[i] / n
  }
  const late = new Float32Array(n)
  const tone = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const narrow = 1 - Math.min(1.6, width[i] / mean)
    // narrow years put a larger share of their wood into latewood
    late[i] = Math.min(0.92, Math.max(0.08, lateStart + range(r, -0.06, 0.06) - 0.18 * narrow))
    tone[i] = 1 + 0.035 * gaussian(r) - 0.05 * Math.max(0, narrow)
  }
  const year = new Float32Array(TABLE + 1)
  let c = 0
  let i = 0
  for (let k = 0; k <= TABLE; k++) {
    const t = k / TABLE
    while (i < n - 1 && t >= c + width[i]) {
      c += width[i]
      i++
    }
    year[k] = Math.min(n - 1e-4, i + (t - c) / width[i])
  }
  return { n, year, width, late, tone }
}
