// A sheet of cold-pressed paper for the Wash series: one tile, the same for
// every piece (a painter keeps to one paper), built once and kept.
//
// The height is a sum of three octaves of value noise on lattices that wrap
// around the tile, so the tile repeats seamlessly; it spans the short side of
// the canvas. The relief shading is the height's slope towards a light from
// the top left.

import { stream } from '../random'

export interface Paper {
  paperH: Float32Array
  paperS: Float32Array
  /** Tile size in texels; the tile spans one world unit. */
  pn: number
}

const N = 1024
let cached: Paper | undefined

export function coldPressed(): Paper {
  if (cached)
    return cached
  const r = stream('0x00000000000000000000000000000000000000000000000000000000c01d9e55', 'paper')
  const h = new Float32Array(N * N)
  const octaves = [[70, 0.45], [150, 0.35], [320, 0.2]] as const
  for (const [f, amp] of octaves) {
    const lat = new Float32Array(f * f)
    for (let i = 0; i < lat.length; i++)
      lat[i] = r()
    for (let j = 0; j < N; j++) {
      const y = j * f / N
      const yi = Math.floor(y)
      let w = y - yi
      w = w * w * (3 - 2 * w)
      const r0 = yi * f
      const r1 = ((yi + 1) % f) * f
      for (let i = 0; i < N; i++) {
        const x = i * f / N
        const xi = Math.floor(x)
        let u = x - xi
        u = u * u * (3 - 2 * u)
        const x1 = (xi + 1) % f
        const top = lat[r0 + xi] + u * (lat[r0 + x1] - lat[r0 + xi])
        const bot = lat[r1 + xi] + u * (lat[r1 + x1] - lat[r1 + xi])
        h[j * N + i] += amp * (top + w * (bot - top))
      }
    }
  }
  const sh = new Float32Array(N * N)
  const k = 0.00032 * N / 2
  for (let j = 0; j < N; j++) {
    const up = ((j + N - 1) % N) * N
    const dn = ((j + 1) % N) * N
    for (let i = 0; i < N; i++) {
      const l = (i + N - 1) % N
      const rr = (i + 1) % N
      sh[j * N + i] = 1 + k * (h[j * N + l] - h[j * N + rr] + h[up + i] - h[dn + i])
    }
  }
  cached = { paperH: h, paperS: sh, pn: N }
  return cached
}
