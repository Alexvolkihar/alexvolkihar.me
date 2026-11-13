// Mirror geometry for the Kaleido series.
//
// Every symmetry used here is a reflection group: the whole picture is the
// fundamental domain reflected again and again in its own edges, the way the
// mirrors of a kaleidoscope do it. Two mirrors meeting at pi / n give the
// dihedral rosette D_n (Brewster's two-mirror tube); a triangle or a rectangle
// of mirrors whose angles are pi / p, pi / q, pi / r with 1/p + 1/q + 1/r = 1
// tiles the plane, which leaves exactly four planar kaleidoscopes, written
// *442, *632, *333 and *2222 in Conway's orbifold notation.
//
// Matrices are canvas-style [a, b, c, d, e, f]: x' = a x + c y + e,
// y' = b x + d y + f.

export type Pt = readonly [number, number]
export type Mat = readonly [number, number, number, number, number, number]

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]

/** A ∘ B: apply B first, then A. */
export function mul(A: Mat, B: Mat): Mat {
  return [
    A[0] * B[0] + A[2] * B[1],
    A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3],
    A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ]
}

export function apply(M: Mat, p: Pt): Pt {
  return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]
}

export function rotation(a: number): Mat {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [c, s, -s, c, 0, 0]
}

export function translation(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y]
}

export function scaling(k: number): Mat {
  return [k, 0, 0, k, 0, 0]
}

/** Reflection in the line through p and q. */
export function reflection(p: Pt, q: Pt): Mat {
  let ux = q[0] - p[0]
  let uy = q[1] - p[1]
  const l = Math.hypot(ux, uy)
  ux /= l
  uy /= l
  const a = ux * ux - uy * uy
  const b = 2 * ux * uy
  // x' = p + R (x - p)
  return [a, b, b, -a, p[0] - a * p[0] - b * p[1], p[1] - b * p[0] + a * p[1]]
}

/**
 * Grows a convex polygon by `e` along every edge normal. The clip of each
 * mirrored copy is grown by a fraction of a pixel, so that two neighbouring
 * copies overlap a little instead of meeting edge to edge, where the two
 * antialiased borders would let the ground show through as a hairline.
 */
export function grow(poly: readonly Pt[], e: number): Pt[] {
  const n = poly.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i]
    const [x1, y1] = poly[(i + 1) % n]
    area += x0 * y1 - x1 * y0
  }
  const sgn = area > 0 ? 1 : -1
  // edge lines as n . x = c, n pointing outwards
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const l = Math.hypot(dx, dy)
    const nx = (sgn * dy) / l
    const ny = (-sgn * dx) / l
    return [nx, ny, nx * p[0] + ny * p[1] + e] as const
  })
  return poly.map((_, i) => {
    const [a1, b1, c1] = lines[(i + n - 1) % n]
    const [a2, b2, c2] = lines[i]
    const det = a1 * b2 - a2 * b1
    return [(c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det] as Pt
  })
}

/**
 * All mirrored copies of a polygonal domain that touch the rectangle
 * [x0, x1] x [y0, y1], found by reflecting the domain in its mirror edges,
 * breadth first. `M0` places the domain; every returned matrix maps domain
 * coordinates to canvas pixels.
 */
export function reflectCopies(
  poly: readonly Pt[],
  mirrors: readonly boolean[],
  M0: Mat,
  rect: readonly [number, number, number, number],
  unit: number,
  limit = 6000,
): Mat[] {
  const [x0, y0, x1, y1] = rect
  const n = poly.length
  const out: Mat[] = []
  const seen = new Set<string>()
  const key = (pts: Pt[]) => {
    let cx = 0
    let cy = 0
    for (const p of pts) {
      cx += p[0]
      cy += p[1]
    }
    return `${Math.round((cx / pts.length) / unit * 4000)},${Math.round((cy / pts.length) / unit * 4000)}`
  }
  const touches = (pts: Pt[]) => {
    let ax = Infinity
    let ay = Infinity
    let bx = -Infinity
    let by = -Infinity
    for (const p of pts) {
      ax = Math.min(ax, p[0])
      ay = Math.min(ay, p[1])
      bx = Math.max(bx, p[0])
      by = Math.max(by, p[1])
    }
    return bx >= x0 && ax <= x1 && by >= y0 && ay <= y1
  }
  const queue: Mat[] = [M0]
  seen.add(key(poly.map(p => apply(M0, p))))
  while (queue.length && out.length < limit) {
    const M = queue.shift()!
    const pts = poly.map(p => apply(M, p))
    out.push(M)
    for (let i = 0; i < n; i++) {
      if (!mirrors[i])
        continue
      const R = reflection(pts[i], pts[(i + 1) % n])
      const M2 = mul(R, M)
      const pts2 = poly.map(p => apply(M2, p))
      const k = key(pts2)
      if (seen.has(k))
        continue
      seen.add(k)
      if (touches(pts2))
        queue.push(M2)
    }
  }
  return out
}

/** The 2n copies of a wedge of angle pi / n about the origin, turned by `phase`. */
export function rosetteCopies(n: number, phase: number): Mat[] {
  const out: Mat[] = []
  const flip: Mat = [1, 0, 0, -1, 0, 0]
  for (let k = 0; k < n; k++) {
    const R = rotation(phase + (2 * Math.PI * k) / n)
    out.push(R, mul(R, flip))
  }
  return out
}
