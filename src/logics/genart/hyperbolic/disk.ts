// Poincaré-disk geometry for the regular hyperbolic tilings {p,q}.
//
// The fundamental triangle of {p,q} has its corners at the centre O of a tile
// (angle π/p), at a vertex V of the tiling (angle π/q) and at the midpoint M
// of an edge (right angle): H. S. M. Coxeter's (2,p,q) triangle group. With
// the central tile centred on the origin, its corners lie at the hyperbolic
// distances
//   cosh(OV) = cot(π/p) cot(π/q)      (circumradius)
//   cosh(OM) = cos(π/q) / sin(π/p)    (inradius)
// and a point at hyperbolic distance h from the origin sits at radius
// tanh(h/2) in the disk.
//
// Every tile is the image of the central one under an orientation-preserving
// isometry of the disk, a Möbius map z -> (az + b) / (cz + d) stored as a
// complex 2x2 matrix. Crossing edge k of a tile is the reflection in that
// edge's geodesic (a circle orthogonal to the unit circle) composed with the
// reflection in the real axis, which is a mirror of the central tile: the
// product is a Möbius map, so the neighbour across edge k of the tile M is
// simply M·N_k. Composing with orientation-preserving maps only keeps chiral
// decorations consistent from tile to tile.

/** A Möbius map as [Re a, Im a, Re b, Im b, Re c, Im c, Re d, Im d], normalised to det 1. */
export type Mat = Float64Array

export type Pt = readonly [number, number]

export function mat(ar: number, ai: number, br: number, bi: number, cr: number, ci: number, dr: number, di: number): Mat {
  return normalise(Float64Array.of(ar, ai, br, bi, cr, ci, dr, di))
}

export const IDENTITY: Mat = Float64Array.of(1, 0, 0, 0, 0, 0, 1, 0)

/** Divide by a square root of the determinant, so entries stay small along long products. */
function normalise(r: Mat): Mat {
  const dr = r[0] * r[6] - r[1] * r[7] - (r[2] * r[4] - r[3] * r[5])
  const di = r[0] * r[7] + r[1] * r[6] - (r[2] * r[5] + r[3] * r[4])
  const mod = Math.hypot(dr, di)
  const sr = Math.sqrt((mod + dr) / 2)
  let si = Math.sqrt(Math.max(0, (mod - dr) / 2))
  if (di < 0)
    si = -si
  const n2 = sr * sr + si * si
  for (let k = 0; k < 8; k += 2) {
    const x = r[k]
    const y = r[k + 1]
    r[k] = (x * sr + y * si) / n2
    r[k + 1] = (y * sr - x * si) / n2
  }
  return r
}

export function mul(A: Mat, B: Mat): Mat {
  const r = new Float64Array(8)
  r[0] = A[0] * B[0] - A[1] * B[1] + A[2] * B[4] - A[3] * B[5]
  r[1] = A[0] * B[1] + A[1] * B[0] + A[2] * B[5] + A[3] * B[4]
  r[2] = A[0] * B[2] - A[1] * B[3] + A[2] * B[6] - A[3] * B[7]
  r[3] = A[0] * B[3] + A[1] * B[2] + A[2] * B[7] + A[3] * B[6]
  r[4] = A[4] * B[0] - A[5] * B[1] + A[6] * B[4] - A[7] * B[5]
  r[5] = A[4] * B[1] + A[5] * B[0] + A[6] * B[5] + A[7] * B[4]
  r[6] = A[4] * B[2] - A[5] * B[3] + A[6] * B[6] - A[7] * B[7]
  r[7] = A[4] * B[3] + A[5] * B[2] + A[6] * B[7] + A[7] * B[6]
  return normalise(r)
}

/** Apply M to (x, y); the result goes to out[o], out[o + 1]. */
export function apply(M: Mat, x: number, y: number, out: Float64Array, o: number): void {
  const nr = M[0] * x - M[1] * y + M[2]
  const ni = M[0] * y + M[1] * x + M[3]
  const dr = M[4] * x - M[5] * y + M[6]
  const di = M[4] * y + M[5] * x + M[7]
  const n2 = dr * dr + di * di
  out[o] = (nr * dr + ni * di) / n2
  out[o + 1] = (ni * dr - nr * di) / n2
}

/** Rotation about the origin by t. */
export function rotation(t: number): Mat {
  return mat(Math.cos(t / 2), Math.sin(t / 2), 0, 0, 0, 0, Math.cos(t / 2), -Math.sin(t / 2))
}

/** The disk isometry that takes a to the origin: z -> (z - a) / (1 - conj(a) z). */
export function toOrigin(a: Pt): Mat {
  return mat(1, 0, -a[0], -a[1], -a[0], a[1], 1, 0)
}

/** Its inverse, which takes the origin to a. */
export function fromOrigin(a: Pt): Mat {
  return mat(1, 0, a[0], a[1], a[0], -a[1], 1, 0)
}

// ---------------------------------------------------------------------------
// Point helpers for building the decoration of the central tile (run once per
// render, so plain tuples are fine here).
// ---------------------------------------------------------------------------

function cdiv(a: Pt, b: Pt): Pt {
  const n = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / n, (a[1] * b[0] - a[0] * b[1]) / n]
}

/** (z - a) / (1 - conj(a) z) */
function phi(a: Pt, z: Pt): Pt {
  return cdiv([z[0] - a[0], z[1] - a[1]], [1 - (a[0] * z[0] + a[1] * z[1]), -(a[0] * z[1] - a[1] * z[0])])
}

/** (z + a) / (1 + conj(a) z) */
function phiInv(a: Pt, z: Pt): Pt {
  return cdiv([z[0] + a[0], z[1] + a[1]], [1 + (a[0] * z[0] + a[1] * z[1]), a[0] * z[1] - a[1] * z[0]])
}

export function polar(r: number, t: number): Pt {
  return [r * Math.cos(t), r * Math.sin(t)]
}

/** Disk radius of a point at hyperbolic distance h from the origin. */
export function radius(h: number): number {
  return Math.tanh(h / 2)
}

export function hdist(a: Pt, b: Pt): number {
  return 2 * Math.atanh(Math.min(0.999999999999, Math.hypot(...phi(a, b))))
}

/** Point at hyperbolic distance h from a, on the geodesic towards b, turned by `turn` radians. */
export function geoAt(a: Pt, b: Pt, h: number, turn = 0): Pt {
  const w = phi(a, b)
  const t = Math.atan2(w[1], w[0]) + turn
  return phiInv(a, polar(Math.tanh(h / 2), t))
}

/** Hyperbolic midpoint of the geodesic segment ab. */
export function geoMid(a: Pt, b: Pt): Pt {
  return geoAt(a, b, hdist(a, b) / 2)
}

/** Point at distance h from a, perpendicular to the geodesic ab (to its left for h > 0). */
export function geoPerp(a: Pt, b: Pt, h: number): Pt {
  return geoAt(a, b, Math.abs(h), h >= 0 ? Math.PI / 2 : -Math.PI / 2)
}

/** Angle at a between the geodesics towards b and towards c. */
export function geoAngle(a: Pt, b: Pt, c: Pt): number {
  const u = phi(a, b)
  const v = phi(a, c)
  let d = Math.abs(Math.atan2(u[1], u[0]) - Math.atan2(v[1], v[0]))
  if (d > Math.PI)
    d = 2 * Math.PI - d
  return d
}

// ---------------------------------------------------------------------------
// The regular tiling.
// ---------------------------------------------------------------------------

export interface Regular {
  p: number
  q: number
  /** Hyperbolic circumradius OV, inradius OM and half edge MV. */
  R: number
  r: number
  a: number
  /** Vertices V_k (angle 2πk/p) and edge midpoints M_k (angle (2k+1)π/p) of the central tile. */
  V: Pt[]
  M: Pt[]
  /** gens[k] takes the central tile to its neighbour across edge k (V_k V_{k+1}). */
  gens: Mat[]
  /** Rotation by 2π/q about V_0. */
  turnV: Mat
}

export function regular(p: number, q: number): Regular {
  const R = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)))
  const r = Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p))
  const a = Math.acosh(Math.cos(Math.PI / p) / Math.sin(Math.PI / q))
  const rv = radius(R)
  const rm = radius(r)
  const V: Pt[] = []
  const M: Pt[] = []
  const gens: Mat[] = []
  // centre of the circle carrying edge k, orthogonal to the unit circle
  const c = (1 + rm * rm) / (2 * rm)
  for (let k = 0; k < p; k++) {
    V.push(polar(rv, (2 * Math.PI * k) / p))
    M.push(polar(rm, ((2 * k + 1) * Math.PI) / p))
    const C = polar(c, ((2 * k + 1) * Math.PI) / p)
    // z -> (C z - 1) / (z - conj C): reflection in the edge after the reflection in the real axis
    gens.push(mat(C[0], C[1], -1, 0, 1, 0, -C[0], C[1]))
  }
  const turnV = mul(fromOrigin(V[0]), mul(rotation((2 * Math.PI) / q), toOrigin(V[0])))
  return { p, q, R, r, a, V, M, gens, turnV }
}

export interface Tile {
  m: Mat
  /** Number of edge crossings from the nearest seed tile. */
  layer: number
}

/**
 * Breadth-first growth of the tiling from the seed tiles. `probe` returns -1
 * for a tile that is not on the canvas, else its size on screen; a tile is
 * kept when it is on the canvas and expanded while it is larger than `minSize`.
 * Tiles are told apart by their centre M(0) = b / d.
 */
export function grow(g: Regular, seeds: Mat[], probe: (m: Mat) => number, minSize: number, maxTiles: number): Tile[] {
  const seen = new Set<number>()
  const key = (m: Mat) => {
    const n = m[6] * m[6] + m[7] * m[7]
    const x = (m[2] * m[6] + m[3] * m[7]) / n
    const y = (m[3] * m[6] - m[2] * m[7]) / n
    return (Math.round(x * 1e7) + 20000000) * 40000000 + Math.round(y * 1e7) + 20000000
  }
  const out: Tile[] = []
  let queue: Tile[] = []
  for (const m of seeds) {
    const k = key(m)
    if (seen.has(k))
      continue
    seen.add(k)
    queue.push({ m, layer: 0 })
  }
  while (queue.length && out.length < maxTiles) {
    const next: Tile[] = []
    for (const t of queue) {
      const size = probe(t.m)
      if (size < 0 && t.layer > 0)
        continue
      if (size >= 0)
        out.push(t)
      if (size < minSize && t.layer > 0)
        continue
      for (const gen of g.gens) {
        const m = mul(t.m, gen)
        const k = key(m)
        if (seen.has(k))
          continue
        seen.add(k)
        next.push({ m, layer: t.layer + 1 })
      }
    }
    queue = next
  }
  return out
}
