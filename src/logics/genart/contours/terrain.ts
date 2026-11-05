// The imaginary terrain: a domain-warped gradient-noise heightfield sampled
// on a fixed grid, so the same hash gives the same landscape at any size.
//
// Techniques: gradient noise after Ken Perlin ("Improving Noise", 2002),
// fractional Brownian motion and ridged multifractal octaves after Musgrave,
// domain warping after Inigo Quilez's article "Domain Warping".
// Only +, *, floor and sqrt are used, so every JS engine computes the same bits.

import type { Rng } from '../random'
import type { Features } from './traits'
import { range } from '../random'

// 16 unit gradients at multiples of 22.5°, written out instead of computed.
const A = 0.9238795
const B = 0.3826834
const C = 0.7071068
const GX = new Float32Array([1, A, C, B, 0, -B, -C, -A, -1, -A, -C, -B, 0, B, C, A])
const GY = new Float32Array([0, B, C, A, 1, A, C, B, 0, -B, -C, -A, -1, -A, -C, -B])

export type Noise = (x: number, y: number) => number

export function makeNoise(r: Rng): Noise {
  const idx = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++)
    perm[i] = idx[i & 255]
  return (x, y) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const X = xf & 255
    const Y = yf & 255
    const dx = x - xf
    const dy = y - yf
    const u = dx * dx * dx * (dx * (dx * 6 - 15) + 10)
    const v = dy * dy * dy * (dy * (dy * 6 - 15) + 10)
    const h00 = perm[perm[X] + Y] & 15
    const h10 = perm[perm[X + 1] + Y] & 15
    const h01 = perm[perm[X] + Y + 1] & 15
    const h11 = perm[perm[X + 1] + Y + 1] & 15
    const n00 = GX[h00] * dx + GY[h00] * dy
    const n10 = GX[h10] * (dx - 1) + GY[h10] * dy
    const n01 = GX[h01] * dx + GY[h01] * (dy - 1)
    const n11 = GX[h11] * (dx - 1) + GY[h11] * (dy - 1)
    const a = n00 + u * (n10 - n00)
    const b = n01 + u * (n11 - n01)
    return a + v * (b - a)
  }
}

// Each octave is rotated by a fixed angle (0.6 / 0.8) to hide the lattice.
function fbm(n: Noise, x: number, y: number, octaves: number, gain: number): number {
  let sum = 0
  let amp = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * n(x, y)
    const nx = 0.8 * x - 0.6 * y
    y = (0.6 * x + 0.8 * y) * 2.03 + 3.1
    x = nx * 2.03 + 1.7
    amp *= gain
  }
  return sum
}

// Ridged octaves: sharp crests where the noise crosses zero.
function ridged(n: Noise, x: number, y: number, octaves: number, gain: number): number {
  let sum = 0
  let amp = 1
  for (let o = 0; o < octaves; o++) {
    const v = 1 - Math.abs(n(x, y)) * 1.6
    sum += amp * v * v
    const nx = 0.8 * x - 0.6 * y
    y = (0.6 * x + 0.8 * y) * 2.07 + 5.3
    x = nx * 2.07 + 2.9
    amp *= gain
  }
  return sum * 0.5
}

interface ReliefParams { freq: number, octaves: number, gain: number, warp: number, ridge: number, sharpen: number }

const RELIEF: Record<Features['Relief'], ReliefParams> = {
  Gentle: { freq: 1.25, octaves: 4, gain: 0.42, warp: 0.55, ridge: 0, sharpen: 0 },
  Hilly: { freq: 1.75, octaves: 5, gain: 0.5, warp: 0.75, ridge: 0.3, sharpen: 0.3 },
  Alpine: { freq: 1.85, octaves: 5, gain: 0.5, warp: 0.6, ridge: 0.75, sharpen: 1 },
}

/** Share of the map under water, per Water trait. */
const SEA_SHARE: Record<Features['Water'], number> = { None: 0, Lakes: 0.1, Coast: 0.36, Archipelago: 0.56 }

export interface Terrain {
  /** Heights in [0, 1], (nx + 1) × (ny + 1) grid nodes, row-major. */
  h: Float32Array
  nx: number
  ny: number
  /** Water level; below 0 when the map is dry. */
  sea: number
}

/**
 * Samples the heightfield on an nx × ny cell grid covering ax × ay
 * normalised units (the short side of the map is 1).
 */
export function buildTerrain(r: Rng, f: Features, nx: number, ny: number, ax: number, ay: number): Terrain {
  const noise = makeNoise(r)
  const rel = RELIEF[f.Relief]
  // Fixed consumption order: every value is drawn whatever the traits are.
  const freq = rel.freq * range(r, 0.85, 1.15)
  const warp = rel.warp * range(r, 0.75, 1.25)
  const ox = range(r, 0, 200)
  const oy = range(r, 0, 200)
  let dx = 0
  let dy = 0
  let d2 = 0
  while (d2 < 0.04 || d2 > 1) {
    dx = r() * 2 - 1
    dy = r() * 2 - 1
    d2 = dx * dx + dy * dy
  }
  const dl = Math.sqrt(d2)
  dx /= dl
  dy /= dl
  const cx = range(r, 0.35, 0.65) * ax
  const cy = range(r, 0.35, 0.65) * ay

  const W = nx + 1
  const h = new Float32Array(W * (ny + 1))
  let lo = Infinity
  let hi = -Infinity
  for (let j = 0; j <= ny; j++) {
    const y = j / ny * ay
    for (let i = 0; i <= nx; i++) {
      const x = i / nx * ax
      let px = x * freq + ox
      let py = y * freq + oy
      const qx = fbm(noise, px + 5.2, py + 1.3, 3, 0.5)
      const qy = fbm(noise, px + 1.7, py + 9.2, 3, 0.5)
      px += warp * qx
      py += warp * qy
      let v = fbm(noise, px, py, rel.octaves, rel.gain)
      if (rel.ridge > 0)
        v = v * (1 - rel.ridge) + rel.ridge * (ridged(noise, px * 0.9 + 31, py * 0.9 + 17, rel.octaves, rel.gain) - 0.45)
      h[j * W + i] = v
      if (v < lo)
        lo = v
      if (v > hi)
        hi = v
    }
  }

  // Normalise to [0, 1] and sharpen the peaks (h * sqrt(h) is h^1.5).
  const inv = 1 / (hi - lo || 1)
  const N = h.length
  for (let k = 0; k < N; k++) {
    const v = Math.max(0, (h[k] - lo) * inv)
    h[k] = v + rel.sharpen * (v * Math.sqrt(v) - v)
  }

  // Large-scale shape of the water. e is the distance to the map edge.
  for (let j = 0; j <= ny; j++) {
    const y = j / ny * ay
    for (let i = 0; i <= nx; i++) {
      const x = i / nx * ax
      const k = j * W + i
      const e = Math.min(x, ax - x, y, ay - y)
      if (f.Water === 'Lakes') {
        // a shallow bowl: the low basins gather towards the middle as lakes
        const rx = (x - cx) / ax
        const ry = (y - cy) / ay
        h[k] += 0.9 * (rx * rx + ry * ry)
      }
      else if (f.Water === 'Coast') {
        h[k] += 0.85 * ((x - cx) * dx + (y - cy) * dy)
      }
      else if (f.Water === 'Archipelago') {
        const t = Math.max(0, 1 - e / 0.25)
        h[k] -= 0.35 * t * t
      }
    }
  }

  lo = Infinity
  hi = -Infinity
  for (let k = 0; k < N; k++) {
    if (h[k] < lo)
      lo = h[k]
    if (h[k] > hi)
      hi = h[k]
  }
  const inv2 = 1 / (hi - lo || 1)
  for (let k = 0; k < N; k++)
    h[k] = (h[k] - lo) * inv2

  return { h, nx, ny, sea: seaLevel(h, SEA_SHARE[f.Water]) }
}

/** Height below which `share` of the grid lies (histogram quantile). */
function seaLevel(h: Float32Array, share: number): number {
  if (share <= 0)
    return -1
  const BINS = 1024
  const hist = new Uint32Array(BINS)
  for (let k = 0; k < h.length; k++)
    hist[Math.min(BINS - 1, Math.floor(h[k] * BINS))]++
  const target = share * h.length
  let acc = 0
  for (let b = 0; b < BINS; b++) {
    acc += hist[b]
    if (acc >= target)
      return (b + 1) / BINS
  }
  return 1
}
