// Small numeric helpers shared by the Pelt modules.
//
// Per-cell randomness (initial morphogen, strand roots, clumps) comes from an
// integer hash of the cell indices and a seed drawn from a named stream, so a
// cell gets the same draws whatever the size or the aspect of the canvas.

/** Integer hash of three 32-bit values (murmur3 finaliser, applied in turn). */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(c ^ 0x9E3779B9, 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13) ^ a, 0xC2B2AE35)
  h = Math.imul(h ^ (h >>> 16) ^ b, 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Uniform in [0, 1) from three integers. */
export const rnd3 = (a: number, b: number, c: number) => hash3(a, b, c) / 4294967296

export const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export const mix = (a: number, b: number, t: number) => a + (b - a) * t

export type RGB = [number, number, number]

export function rgb(hex: string): RGB {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Value noise on an integer-hashed lattice, smooth, in [0, 1]. */
export function valueNoise(seed: number): (x: number, y: number) => number {
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    let u = x - xi
    let w = y - yi
    u = u * u * (3 - 2 * u)
    w = w * w * (3 - 2 * w)
    const a = rnd3(xi, yi, seed)
    const b = rnd3(xi + 1, yi, seed)
    const c = rnd3(xi, yi + 1, seed)
    const d = rnd3(xi + 1, yi + 1, seed)
    return a + (b - a) * u + (c - a + (a - b - c + d) * u) * w
  }
}
