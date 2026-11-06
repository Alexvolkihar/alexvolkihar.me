// Order-free randomness and smooth fields for the Truchet series.
//
// The quadtree is walked over a grid whose size depends on the canvas aspect,
// so per-tile decisions must not depend on the order tiles are visited:
// `cellRandom` hashes integer cell coordinates instead of drawing from a
// stream. A given cell then makes the same choice on every canvas.

import type { Rng } from '../random'

/** Uniform [0, 1) from a seed and four integers (murmur3-style finaliser). */
export function cellRandom(seed: number, a: number, b: number, c: number, d: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ (a | 0), 0x85EBCA6B)
  h ^= h >>> 15
  h = Math.imul(h ^ (b | 0), 0xC2B2AE35)
  h ^= h >>> 13
  h = Math.imul(h ^ (c | 0), 0x27D4EB2F)
  h ^= h >>> 16
  h = Math.imul(h ^ (d | 0), 0x165667B1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85EBCA6B)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Value noise on an integer-hashed lattice, in [0, 1]. Consumes 512 draws. */
export function makeNoise(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (a: number, b: number) => val[perm[perm[a] + b]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(X, Y) + u * (v(X + 1, Y) - v(X, Y))
    const b = v(X, Y + 1) + u * (v(X + 1, Y + 1) - v(X, Y + 1))
    return a + w * (b - a)
  }
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
