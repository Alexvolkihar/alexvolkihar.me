// Procedural heightmaps for the "Erosion" series, before any rain falls.
//
// Perlin's gradient noise (1985, improved 2002) on a hash-seeded permutation,
// summed into fractal Brownian motion or Musgrave's ridged multifractal, and
// shaped into one of four landforms. Coordinates are in canvas short-side
// units centred on the map, so a hash gives the same terrain at any size.

import type { Rng } from '../random'
import { int, range } from '../random'

export type Landform = 'Massif' | 'Ranges' | 'Plateau' | 'Cone'

export type Noise2 = (x: number, y: number) => number

/** 2D gradient noise in about [-1, 1], from a shuffled permutation table. */
export function makeNoise(r: Rng): Noise2 {
  const perm = new Uint8Array(512)
  const idx = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < 512; i++)
    perm[i] = idx[i & 255]
  // 8 unit gradients, picked by the low bits of the hashed corner
  const D = Math.SQRT1_2
  const GX = [1, -1, 0, 0, D, -D, D, -D]
  const GY = [0, 0, 1, -1, D, D, -D, -D]
  const grad = (h: number, x: number, y: number) => GX[h & 7] * x + GY[h & 7] * y
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  return (x: number, y: number) => {
    const xf = Math.floor(x)
    const yf = Math.floor(y)
    const X = xf & 255
    const Y = yf & 255
    const dx = x - xf
    const dy = y - yf
    const u = fade(dx)
    const v = fade(dy)
    const aa = perm[perm[X] + Y]
    const ab = perm[perm[X] + Y + 1]
    const ba = perm[perm[X + 1] + Y]
    const bb = perm[perm[X + 1] + Y + 1]
    const x1 = grad(aa, dx, dy) + u * (grad(ba, dx - 1, dy) - grad(aa, dx, dy))
    const x2 = grad(ab, dx, dy - 1) + u * (grad(bb, dx - 1, dy - 1) - grad(ab, dx, dy - 1))
    return (x1 + v * (x2 - x1)) * 1.42
  }
}

/** Fractal Brownian motion, about [-1, 1]. */
function fbm(n: Noise2, x: number, y: number, oct: number, lac = 2.03, gain = 0.5) {
  let s = 0
  let a = 1
  let norm = 0
  for (let o = 0; o < oct; o++) {
    s += a * n(x, y)
    norm += a
    a *= gain
    x = x * lac + 17.3
    y = y * lac - 9.1
  }
  return s / norm
}

/** Musgrave's ridged multifractal, about [0, 1]: sharp crests, rounded valleys. */
function ridged(n: Noise2, x: number, y: number, oct: number) {
  let s = 0
  let a = 1
  let w = 1
  let norm = 0
  for (let o = 0; o < oct; o++) {
    let v = 1 - Math.abs(n(x, y))
    v *= v
    v *= w
    w = Math.min(1, v * 1.6)
    s += a * v
    norm += a
    a *= 0.5
    x = x * 2.05 + 31.7
    y = y * 2.05 - 5.3
  }
  return s / norm
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Heights on a gw x gh grid whose short side spans `n` cells, normalised to [0, 1].
 * Consumes a fixed number of draws from `r`, whatever the grid size.
 */
export function buildTerrain(r: Rng, form: Landform, gw: number, gh: number, n: number): Float32Array {
  const n1 = makeNoise(r)
  const n2 = makeNoise(r)
  const n3 = makeNoise(r)
  // shared parameters, always drawn in the same order
  const cx = range(r, -0.12, 0.12)
  const cy = range(r, -0.12, 0.12)
  const ang = r() * Math.PI
  const ox = range(r, 0, 100)
  const oy = range(r, 0, 100)
  const cones = int(r, 1, 3)
  const coneAt: Array<[number, number, number]> = []
  for (let k = 0; k < 3; k++)
    coneAt.push([range(r, -0.28, 0.28), range(r, -0.28, 0.28), range(r, 0.55, 1)])
  const warp = range(r, 0.06, 0.16)

  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  const h = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    const v = (j + 0.5 - gh / 2) / n
    for (let i = 0; i < gw; i++) {
      const u = (i + 0.5 - gw / 2) / n
      // gentle domain warp shared by every landform: no straight features
      const wu = u + warp * fbm(n3, u * 1.7 + ox, v * 1.7 + oy, 2)
      const wv = v + warp * fbm(n3, u * 1.7 - oy, v * 1.7 + ox, 2)
      let z = 0
      if (form === 'Massif') {
        const d = Math.sqrt((wu - cx) ** 2 + (wv - cy) ** 2)
        const fall = 1 - smooth(0.12, 0.68, d)
        const rid = ridged(n1, wu * 2.4 + ox, wv * 2.4 + oy, 5)
        z = fall * (0.35 + 0.65 * rid) + 0.16 * fbm(n2, wu * 1.3, wv * 1.3, 3) + 0.09 * fbm(n2, wu * 5.5 + 3.1, wv * 5.5, 3)
      }
      else if (form === 'Ranges') {
        // ridges stretched along a hashed direction
        const a = wu * ca + wv * sa
        const b = -wu * sa + wv * ca
        const rid = ridged(n1, a * 1.2 + ox, b * 2.7 + oy, 5)
        const d = Math.sqrt((wu - cx) ** 2 + ((wv - cy) * 0.9) ** 2)
        z = rid * (0.55 + 0.45 * (1 - smooth(0.2, 0.8, d))) + 0.22 * fbm(n2, wu * 1.6, wv * 1.6, 4)
      }
      else if (form === 'Plateau') {
        // mesas: a high table with steep escarpments, notched by narrow
        // canyons (the crest lines of ridged noise, turned upside down), on a
        // regional tilt so that the canyons drain off the map
        const t = 0.5 + 0.5 * fbm(n2, wu * 1.7 + ox, wv * 1.7 + oy, 4)
        const mesa = smooth(0.47, 0.53, t)
        const can = ridged(n1, wu * 2.6 + ox, wv * 2.6 + oy, 3)
        const tilt = 0.18 * (wu * ca + wv * sa)
        z = 0.2 + 0.5 * mesa + tilt - 0.32 * mesa * smooth(0.78, 0.96, can) + 0.04 * fbm(n3, wu * 7, wv * 7, 3)
      }
      else {
        // volcanic cones with craters, rough flanks
        for (let k = 0; k < cones; k++) {
          const [px, py, s] = coneAt[k]
          const sc = k === 0 ? 1 : s * 0.7
          const x0 = k === 0 ? cx : px
          const y0 = k === 0 ? cy : py
          const d = Math.sqrt((wu - x0) ** 2 + (wv - y0) ** 2) / (0.5 * sc)
          let c = Math.max(0, 1 - d) ** 1.5 * sc
          c -= 0.22 * sc * Math.exp(-((d / 0.13) ** 2))
          z = Math.max(z, c)
        }
        z += 0.12 * fbm(n2, wu * 3, wv * 3, 5) * (0.3 + z) + 0.05 * ridged(n1, wu * 7 + ox, wv * 7 + oy, 3)
      }
      h[j * gw + i] = z
    }
  }
  let lo = Infinity
  let hi = -Infinity
  for (let k = 0; k < h.length; k++) {
    if (h[k] < lo)
      lo = h[k]
    if (h[k] > hi)
      hi = h[k]
  }
  const s = hi > lo ? 1 / (hi - lo) : 1
  for (let k = 0; k < h.length; k++)
    h[k] = (h[k] - lo) * s
  return h
}
