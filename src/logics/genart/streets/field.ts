// Tensor field for street modelling, after Chen, Esch, Wonka, Müller & Zhang,
// "Interactive Procedural Street Modeling" (SIGGRAPH 2008).
//
// A 2D symmetric traceless tensor T = R [[cos 2θ, sin 2θ], [sin 2θ, -cos 2θ]]
// has two orthogonal eigenvector fields: the major one points along θ, the
// minor one across it. Roads are traced along both. Basis fields (a grid of
// direction θ, or a radial pattern around a centre) are blended with weights
// that decay as exp(-decay·d²), then the sum is precomputed on a lattice and
// read back with bilinear interpolation of the tensor components (never of
// the angles, which wrap).

import type { Rng } from '../random'

export type Noise2 = (x: number, y: number) => number

/** Value noise in [0, 1] on an integer-hashed lattice (no trigonometry in the randomness). */
export function makeNoise(r: Rng): Noise2 {
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
  const v = (a: number, b: number) => val[perm[perm[a & 255] + (b & 255)]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(xi, yi) + u * (v(xi + 1, yi) - v(xi, yi))
    const b = v(xi, yi + 1) + u * (v(xi + 1, yi + 1) - v(xi, yi + 1))
    return a + w * (b - a)
  }
}

/** Two octaves of value noise, centred on 0 (about -1..1). */
export function fbm(n: Noise2, x: number, y: number): number {
  return (n(x, y) - 0.5) * 1.4 + (n(x * 2.1 + 17.3, y * 2.1 - 5.7) - 0.5) * 0.7
}

export interface Basis {
  kind: 'grid' | 'radial'
  x: number
  y: number
  /** Grid direction (radians); unused by radial fields. */
  theta: number
  weight: number
  decay: number
}

export class TensorField {
  readonly a: Float32Array
  readonly b: Float32Array
  readonly nx: number
  readonly ny: number
  readonly x0: number
  readonly y0: number
  readonly cell: number
  /** Output of `dir()`. */
  dx = 0
  dy = 0

  /**
   * Sum `bases` on a lattice of step `cell` over [x0, x1] x [y0, y1], then
   * turn each tensor by `rotate(x, y)` radians (optional, e.g. noise).
   */
  constructor(bases: readonly Basis[], x0: number, y0: number, x1: number, y1: number, cell: number, rotate?: (x: number, y: number) => number) {
    this.x0 = x0
    this.y0 = y0
    this.cell = cell
    this.nx = Math.ceil((x1 - x0) / cell) + 2
    this.ny = Math.ceil((y1 - y0) / cell) + 2
    this.a = new Float32Array(this.nx * this.ny)
    this.b = new Float32Array(this.nx * this.ny)
    const pre = bases.map(B => ({ ...B, c: Math.cos(2 * B.theta), s: Math.sin(2 * B.theta), cut: 14 / B.decay }))
    for (let j = 0; j < this.ny; j++) {
      const y = y0 + j * cell
      for (let i = 0; i < this.nx; i++) {
        const x = x0 + i * cell
        let a = 0
        let b = 0
        for (const B of pre) {
          const dx = x - B.x
          const dy = y - B.y
          const d2 = dx * dx + dy * dy
          if (d2 > B.cut)
            continue
          const w = B.weight * Math.exp(-B.decay * d2)
          if (B.kind === 'grid') {
            a += w * B.c
            b += w * B.s
          }
          else if (d2 > 1e-9) {
            // Radial: major eigenvector tangent to circles around the centre.
            a += w * (dy * dy - dx * dx) / d2
            b += w * (-2 * dx * dy) / d2
          }
        }
        if (rotate) {
          const phi = 2 * rotate(x, y)
          const c = Math.cos(phi)
          const s = Math.sin(phi)
          const na = a * c - b * s
          b = a * s + b * c
          a = na
        }
        this.a[j * this.nx + i] = a
        this.b[j * this.nx + i] = b
      }
    }
  }

  /**
   * Unit eigenvector at (x, y) into (this.dx, this.dy): the major one, or the
   * minor one when `minor`. Returns false near a degenerate point.
   */
  dir(x: number, y: number, minor: boolean): boolean {
    let fx = (x - this.x0) / this.cell
    let fy = (y - this.y0) / this.cell
    if (fx < 0)
      fx = 0
    if (fy < 0)
      fy = 0
    if (fx > this.nx - 1.001)
      fx = this.nx - 1.001
    if (fy > this.ny - 1.001)
      fy = this.ny - 1.001
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const u = fx - i
    const v = fy - j
    const k = j * this.nx + i
    const A = this.a
    const B = this.b
    const a = (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + this.nx] * (1 - u) + A[k + this.nx + 1] * u) * v
    const b = (B[k] * (1 - u) + B[k + 1] * u) * (1 - v) + (B[k + this.nx] * (1 - u) + B[k + this.nx + 1] * u) * v
    const l = Math.sqrt(a * a + b * b)
    if (l < 0.012)
      return false
    // Major eigenvector of [[a, b], [b, -a]]: (a + l, b), or (b, l - a) when a < 0.
    let ex: number
    let ey: number
    if (a >= 0) {
      ex = a + l
      ey = b
    }
    else {
      ex = b
      ey = l - a
    }
    const n = Math.sqrt(ex * ex + ey * ey)
    if (minor) {
      this.dx = -ey / n
      this.dy = ex / n
    }
    else {
      this.dx = ex / n
      this.dy = ey / n
    }
    return true
  }
}
