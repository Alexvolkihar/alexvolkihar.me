// Value noise on an integer-hashed lattice, seeded from a stream.

import type { Rng } from '../random'

export type Noise2 = (x: number, y: number) => number

export function valueNoise(r: Rng): Noise2 {
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
  return (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    let u = x - xi
    let w = y - yi
    u = u * u * (3 - 2 * u)
    w = w * w * (3 - 2 * w)
    const a = val[perm[perm[X] + Y]]
    const b = val[perm[perm[X + 1] + Y]]
    const c = val[perm[perm[X] + Y + 1]]
    const d = val[perm[perm[X + 1] + Y + 1]]
    const top = a + u * (b - a)
    return top + w * (c + u * (d - c) - top)
  }
}

/** Fractal sum of octaves, roughly in [0, 1]. */
export function fbm(n: Noise2, x: number, y: number, octaves: number): number {
  let s = 0
  let a = 0.5
  let tot = 0
  for (let o = 0; o < octaves; o++) {
    s += a * n(x, y)
    tot += a
    x = x * 2.03 + 17.1
    y = y * 2.03 + 5.3
    a *= 0.5
  }
  return s / tot
}
