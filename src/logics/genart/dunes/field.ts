// Grid helpers for the "Dunes" series: periodic value noise, the initial sand
// bed, and wrapped (toroidal) sampling and resampling of the height grid.
//
// Werner's model runs on a torus, so every helper here wraps around both
// edges: the dune field tiles seamlessly, which the low-angle view relies on
// to reach the horizon.

import type { Rng } from '../random'

export type Noise2 = (x: number, y: number) => number

/**
 * Value noise with smoothstep blending on a px x py lattice that wraps:
 * x in [0, px) and y in [0, py) cover one period. Output in [0, 1].
 */
export function periodicNoise(r: Rng, px: number, py: number): Noise2 {
  const v = new Float32Array(px * py)
  for (let i = 0; i < v.length; i++)
    v[i] = r()
  return (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const tx = x - xf
    const ty = y - yf
    const u = tx * tx * (3 - 2 * tx)
    const w = ty * ty * (3 - 2 * ty)
    const x0 = ((xf % px) + px) % px
    const y0 = ((yf % py) + py) % py
    const x1 = x0 + 1 === px ? 0 : x0 + 1
    const y1 = y0 + 1 === py ? 0 : y0 + 1
    const a = v[y0 * px + x0] + u * (v[y0 * px + x1] - v[y0 * px + x0])
    const b = v[y1 * px + x0] + u * (v[y1 * px + x1] - v[y1 * px + x0])
    return a + w * (b - a)
  }
}

export interface Bed {
  /** Even sheet of sand under everything, in slabs. */
  sheet: number
  /** Amplitude of the slow undulation of the sheet, in slabs. */
  swell: number
  /** Heaps per 1000 cells, their height in slabs and radius in cells. */
  heaps: number
  heapHeight: number
  heapRadius: number
}

/**
 * The sand before the wind starts: a sheet that thickens and thins over a
 * few cells, some loose heaps, and one or two slabs of jitter per cell.
 * Draws from `r` in a fixed order.
 */
export function sandBed(r: Rng, gw: number, gh: number, bed: Bed): Int16Array {
  const cells = gw * gh
  const f = new Float32Array(cells)
  // slow swell: about one undulation per 10 cells, wrapping with the grid
  const px = Math.max(2, Math.round(gw / 10))
  const py = Math.max(2, Math.round(gh / 10))
  const n = periodicNoise(r, px, py)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++)
      f[y * gw + x] = bed.sheet + bed.swell * (2 * n(x / gw * px, y / gh * py) - 1)
  }
  const count = Math.round(bed.heaps * cells / 1000)
  for (let k = 0; k < count; k++) {
    const cx = r() * gw
    const cy = r() * gh
    const rad = bed.heapRadius * (0.65 + 0.7 * r())
    const amp = bed.heapHeight * (0.6 + 0.8 * r())
    const reach = Math.ceil(rad * 2.6)
    const inv = 1 / (rad * rad)
    for (let dy = -reach; dy <= reach; dy++) {
      const y = ((Math.floor(cy) + dy) % gh + gh) % gh
      const ey = Math.floor(cy) + dy - cy
      for (let dx = -reach; dx <= reach; dx++) {
        const x = ((Math.floor(cx) + dx) % gw + gw) % gw
        const ex = Math.floor(cx) + dx - cx
        f[y * gw + x] += amp * Math.exp(-(ex * ex + ey * ey) * inv)
      }
    }
  }
  // jitter seeds the instability, but never scatters sand on bare floor
  const h = new Int16Array(cells)
  for (let c = 0; c < cells; c++) {
    const j = r()
    h[c] = f[c] < 0.5 ? 0 : Math.max(0, Math.floor(f[c] + j * 1.6 - 0.3))
  }
  return h
}

/** Bilinear sample of a wrapped gw x gh grid at (x, y) in cell units. */
export function sampleWrap(g: Float32Array, gw: number, gh: number, x: number, y: number) {
  const xf = Math.floor(x)
  const yf = Math.floor(y)
  const tx = x - xf
  const ty = y - yf
  let x0 = xf % gw
  if (x0 < 0)
    x0 += gw
  let y0 = yf % gh
  if (y0 < 0)
    y0 += gh
  const x1 = x0 + 1 === gw ? 0 : x0 + 1
  const y1 = (y0 + 1 === gh ? 0 : y0 + 1) * gw
  const r0 = y0 * gw
  const a = g[r0 + x0] + tx * (g[r0 + x1] - g[r0 + x0])
  const b = g[y1 + x0] + tx * (g[y1 + x1] - g[y1 + x0])
  return a + ty * (b - a)
}

/** One pass of a wrapped 3 x 3 binomial blur. */
export function blurWrap(src: Float32Array, gw: number, gh: number) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < gh; y++) {
    const o = y * gw
    for (let x = 0; x < gw; x++) {
      const l = x === 0 ? gw - 1 : x - 1
      const r = x === gw - 1 ? 0 : x + 1
      tmp[o + x] = 0.25 * src[o + l] + 0.5 * src[o + x] + 0.25 * src[o + r]
    }
  }
  for (let y = 0; y < gh; y++) {
    const u = (y === 0 ? gh - 1 : y - 1) * gw
    const d = (y === gh - 1 ? 0 : y + 1) * gw
    const o = y * gw
    for (let x = 0; x < gw; x++)
      out[o + x] = 0.25 * tmp[u + x] + 0.5 * tmp[o + x] + 0.25 * tmp[d + x]
  }
  return out
}

/** Catmull-Rom taps of one wrapped axis: n grid cells onto m samples starting at `start`, `step` cells apart. */
function axis(n: number, m: number, start: number, step: number) {
  const idx = new Int32Array(m * 4)
  const wt = new Float32Array(m * 4)
  for (let p = 0; p < m; p++) {
    const g = start + p * step
    const j = Math.floor(g)
    const t = g - j
    const t2 = t * t
    const t3 = t2 * t
    const o = p * 4
    wt[o] = 0.5 * (-t3 + 2 * t2 - t)
    wt[o + 1] = 0.5 * (3 * t3 - 5 * t2 + 2)
    wt[o + 2] = 0.5 * (-3 * t3 + 4 * t2 + t)
    wt[o + 3] = 0.5 * (t3 - t2)
    for (let a = 0; a < 4; a++)
      idx[o + a] = (((j - 1 + a) % n) + n) % n
  }
  return { idx, wt }
}

/**
 * Separable Catmull-Rom resampling of a wrapped gw x gh grid onto rw x rh
 * samples: sample (p, q) sits at grid coordinate (p + 0.5) * gw / rw - 0.5.
 */
export function resampleWrap(src: Float32Array, gw: number, gh: number, rw: number, rh: number) {
  const X = axis(gw, rw, 0.5 * gw / rw - 0.5, gw / rw)
  const Y = axis(gh, rh, 0.5 * gh / rh - 0.5, gh / rh)
  const tmp = new Float32Array(gh * rw)
  for (let y = 0; y < gh; y++) {
    const so = y * gw
    const to = y * rw
    for (let p = 0; p < rw; p++) {
      const o = p * 4
      tmp[to + p] = X.wt[o] * src[so + X.idx[o]] + X.wt[o + 1] * src[so + X.idx[o + 1]]
        + X.wt[o + 2] * src[so + X.idx[o + 2]] + X.wt[o + 3] * src[so + X.idx[o + 3]]
    }
  }
  const out = new Float32Array(rw * rh)
  for (let q = 0; q < rh; q++) {
    const oo = q * rw
    for (let a = 0; a < 4; a++) {
      const w = Y.wt[q * 4 + a]
      const ro = Y.idx[q * 4 + a] * rw
      for (let p = 0; p < rw; p++)
        out[oo + p] += w * tmp[ro + p]
    }
  }
  return out
}

/** One pass of a wrapped [1, 2, 1] blur along the x axis (dir 0) or the y axis (dir 1). */
export function blurAxis(src: Float32Array, gw: number, gh: number, dir: 0 | 1) {
  const out = new Float32Array(src.length)
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const o = y * gw + x
      let a: number
      let b: number
      if (dir === 0) {
        a = y * gw + (x === 0 ? gw - 1 : x - 1)
        b = y * gw + (x === gw - 1 ? 0 : x + 1)
      }
      else {
        a = (y === 0 ? gh - 1 : y - 1) * gw + x
        b = (y === gh - 1 ? 0 : y + 1) * gw + x
      }
      out[o] = 0.25 * src[a] + 0.5 * src[o] + 0.25 * src[b]
    }
  }
  return out
}

/**
 * Value noise on an unbounded integer lattice (no period), smoothstep
 * blended, output in [0, 1]. Lattice values come from an integer hash of
 * the corner and a seed drawn from `r`: used where a pattern must never
 * repeat, such as the patchwork that hides the period of the torus.
 */
export function latticeNoise(r: Rng): Noise2 {
  const seed = (r() * 4294967296) >>> 0
  const at = (i: number, j: number) => {
    let h = Math.imul(i, 0x27D4EB2D) ^ Math.imul(j, 0x165667B1) ^ seed
    h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  return (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const tx = x - xf
    const ty = y - yf
    const u = tx * tx * (3 - 2 * tx)
    const w = ty * ty * (3 - 2 * ty)
    const a = at(xf, yf) + u * (at(xf + 1, yf) - at(xf, yf))
    const b = at(xf, yf + 1) + u * (at(xf + 1, yf + 1) - at(xf, yf + 1))
    return a + w * (b - a)
  }
}
