// Dithering of a tone grid (0 = darkest, 1 = lightest) to a few palette levels.
//
// Error diffusion: Floyd–Steinberg (1976), Atkinson (Bill Atkinson's MacPaint
// dither, which only spreads 6/8 of the error), Jarvis–Judice–Ninke (1976).
// Rows are scanned in serpentine order, the kernel mirrored on odd rows.
//
// Ordered dithering: the recursive Bayer matrix (Bryce Bayer, 1973) and a
// blue-noise threshold matrix built by Robert Ulichney's void-and-cluster
// method (1993). The blue-noise matrix does not depend on the hash: it is
// built once, with integer energies so that it is the same in every engine.

import { stream } from '../random'

export type DitherMethod = 'floyd' | 'atkinson' | 'jarvis' | 'bayer' | 'blue'

// [dx, dy, weight], weights over the divisor.
interface Kernel { taps: ReadonlyArray<readonly [number, number, number]>, div: number }

const KERNELS: Record<'floyd' | 'atkinson' | 'jarvis', Kernel> = {
  floyd: { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  atkinson: { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jarvis: {
    div: 48,
    taps: [
      [1, 0, 7],
      [2, 0, 5],
      [-2, 1, 3],
      [-1, 1, 5],
      [0, 1, 7],
      [1, 1, 5],
      [2, 1, 3],
      [-2, 2, 1],
      [-1, 2, 3],
      [0, 2, 5],
      [1, 2, 3],
      [2, 2, 1],
    ],
  },
}

function errorDiffusion(tone: Float32Array, w: number, h: number, levels: number, kernel: Kernel): Uint8Array {
  const buf = Float32Array.from(tone)
  const out = new Uint8Array(w * h)
  const L = levels - 1
  const taps = kernel.taps
  for (let y = 0; y < h; y++) {
    const rev = (y & 1) === 1
    for (let k = 0; k < w; k++) {
      const x = rev ? w - 1 - k : k
      const i = y * w + x
      const v = buf[i]
      let q = Math.round(v * L)
      if (q < 0)
        q = 0
      else if (q > L)
        q = L
      out[i] = q
      const err = (v - q / L) / kernel.div
      for (const [tdx, dy, wt] of taps) {
        const xx = rev ? x - tdx : x + tdx
        const yy = y + dy
        if (xx < 0 || xx >= w || yy >= h)
          continue
        buf[yy * w + xx] += err * wt
      }
    }
  }
  return out
}

function ordered(tone: Float32Array, w: number, h: number, levels: number, m: Float32Array, size: number, ox: number, oy: number): Uint8Array {
  const out = new Uint8Array(w * h)
  const L = levels - 1
  for (let y = 0; y < h; y++) {
    const row = ((y + oy) % size) * size
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const s = Math.min(1, Math.max(0, tone[i])) * L
      let q = Math.floor(s)
      if (s - q > m[row + ((x + ox) % size)])
        q++
      out[i] = q > L ? L : q
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Bayer 8×8: M(2n) = [[4M, 4M+2], [4M+3, 4M+1]].
// ---------------------------------------------------------------------------

let bayerCache: Float32Array | null = null

function bayer8(): Float32Array {
  if (bayerCache)
    return bayerCache
  let m = [0]
  let n = 1
  while (n < 8) {
    const next = Array.from<number>({ length: 4 * n * n })
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 4 * m[y * n + x]
        next[y * 2 * n + x] = v
        next[y * 2 * n + x + n] = v + 2
        next[(y + n) * 2 * n + x] = v + 3
        next[(y + n) * 2 * n + x + n] = v + 1
      }
    }
    m = next
    n *= 2
  }
  bayerCache = Float32Array.from(m, v => (v + 0.5) / 64)
  return bayerCache
}

// ---------------------------------------------------------------------------
// Void-and-cluster (Ulichney 1993), on a torus of BN×BN cells. The energy of a
// cell is the sum of a bell-shaped filter centred on every "one" pixel; the
// tightest cluster is the one with the highest energy, the largest void the
// zero with the lowest. The filter is (1 - d²/R²)^4 scaled to integers, a
// smooth stand-in for Ulichney's Gaussian (sigma = 1.5) that keeps every sum
// exact. With a fixed total filter mass, the "zeros" phase (more than half
// the cells set) reduces to filling the largest void, so phases 2 and 3 share
// one loop.
// ---------------------------------------------------------------------------

export const BN = 64
let blueCache: Float32Array | null = null

export function blueNoise(): Float32Array {
  if (blueCache)
    return blueCache
  const n = BN * BN
  const R = 5
  const taps: number[] = []
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 >= R * R)
        continue
      const f = 1 - d2 / (R * R)
      taps.push(dx, dy, Math.round(10000 * f * f * f * f))
    }
  }
  const energy = new Int32Array(n)
  const bits = new Uint8Array(n)
  const splat = (i: number, sign: number) => {
    const x = i % BN
    const y = (i - x) / BN
    for (let t = 0; t < taps.length; t += 3) {
      const xx = (x + taps[t] + BN) % BN
      const yy = (y + taps[t + 1] + BN) % BN
      energy[yy * BN + xx] += sign * taps[t + 2]
    }
  }
  const tightest = () => {
    let best = -1
    let bv = -1
    for (let i = 0; i < n; i++) {
      if (bits[i] && energy[i] > bv) {
        bv = energy[i]
        best = i
      }
    }
    return best
  }
  const largestVoid = () => {
    let best = -1
    let bv = 2147483647
    for (let i = 0; i < n; i++) {
      if (!bits[i] && energy[i] < bv) {
        bv = energy[i]
        best = i
      }
    }
    return best
  }

  // Initial binary pattern: one cell in ten, at fixed random places.
  const r = stream('0xb10e5e7b10e5e7', 'void-and-cluster')
  let ones = 0
  while (ones < n / 10) {
    const i = Math.floor(r() * n)
    if (bits[i])
      continue
    bits[i] = 1
    splat(i, 1)
    ones++
  }
  // Phase 0: move the tightest cluster into the largest void until stable.
  for (let guard = 0; guard < 4 * n; guard++) {
    const c = tightest()
    bits[c] = 0
    splat(c, -1)
    const v = largestVoid()
    bits[v] = 1
    splat(v, 1)
    if (v === c)
      break
  }
  const protoBits = Uint8Array.from(bits)
  const protoEnergy = Int32Array.from(energy)
  const rank = new Int32Array(n)
  // Phase 1: remove the tightest clusters, ranks ones-1 .. 0.
  for (let k = ones - 1; k >= 0; k--) {
    const c = tightest()
    bits[c] = 0
    splat(c, -1)
    rank[c] = k
  }
  // Phases 2 and 3: fill the largest voids, ranks ones .. n-1.
  bits.set(protoBits)
  energy.set(protoEnergy)
  for (let k = ones; k < n; k++) {
    const v = largestVoid()
    bits[v] = 1
    splat(v, 1)
    rank[v] = k
  }
  blueCache = Float32Array.from(rank, k => (k + 0.5) / n)
  return blueCache
}

/**
 * Dithers `tone` (w×h, row-major) to `levels` evenly spaced levels and
 * returns the level index of every cell. `ox`, `oy` shift the ordered
 * matrices so that two pieces do not share the same phase.
 */
export function dither(tone: Float32Array, w: number, h: number, levels: number, method: DitherMethod, ox = 0, oy = 0): Uint8Array {
  if (method === 'bayer')
    return ordered(tone, w, h, levels, bayer8(), 8, ox & 7, oy & 7)
  if (method === 'blue')
    return ordered(tone, w, h, levels, blueNoise(), BN, ox % BN, oy % BN)
  return errorDiffusion(tone, w, h, levels, KERNELS[method])
}
