// Value noise for the Wash series, on an integer-hashed lattice seeded from a
// named stream (no sin() hashing, no Math.random).

import type { Rng } from '../random'

export type Noise2 = (x: number, y: number) => number

/** Smooth value noise in [0, 1], period 256 lattice cells. */
export function makeNoise(r: Rng): Noise2 {
  const perm = new Uint8Array(512)
  const val = new Float32Array(256)
  const idx = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < 512; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < 256; i++)
    val[i] = r()
  return (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const X = xf & 255
    const Y = yf & 255
    let u = x - xf
    let w = y - yf
    u = u * u * (3 - 2 * u)
    w = w * w * (3 - 2 * w)
    const p0 = perm[X]
    const p1 = perm[X + 1]
    const a = val[perm[p0 + Y]]
    const b = val[perm[p1 + Y]]
    const c = val[perm[p0 + Y + 1]]
    const d = val[perm[p1 + Y + 1]]
    const top = a + u * (b - a)
    const bot = c + u * (d - c)
    return top + w * (bot - top)
  }
}

/** Fractal sum of `oct` octaves, normalised back to [0, 1]. */
export function fbm(n: Noise2, x: number, y: number, oct: number): number {
  let s = 0
  let amp = 0.5
  let tot = 0
  let f = 1
  for (let o = 0; o < oct; o++) {
    s += amp * n(x * f + o * 17.3, y * f - o * 9.1)
    tot += amp
    amp *= 0.5
    f *= 2.03
  }
  return s / tot
}
