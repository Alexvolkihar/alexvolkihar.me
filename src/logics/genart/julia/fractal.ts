// Escape-time samplers for the "Julia" series.
//
// One family of loops per formula, each iterating with + - * / (and |x|,
// which is exact) only, so the orbit of a point is the same in every engine:
//
// - poly: z -> z^d + c, as a Julia set (z0 = point, c fixed) or a
//   Mandelbrot / Multibrot set (c = point).
// - ship: the Burning Ship, z -> (|x| + i|y|)^2 + c (Michelitsch & Rössler, 1992).
// - newton: Newton's method on a polynomial given by its roots, optionally
//   relaxed, z -> z - a p(z) / p'(z) (Cayley, 1879).
//
// Besides the smooth iteration count, the "deriv" loops carry the derivative
// of the orbit, which gives a distance estimate to the set (Milnor, Thurston;
// see Inigo Quilez, "distance to fractals") and a normal for 3D-like lighting
// (Arnaud Chéritat's normal-map shading). The "trap" loops keep the orbit-trap
// minimum instead (Pickover's orbit traps). The polynomial loops live in
// ./loops.ts, one per degree and variant.

import { ln, sqrt } from './exact'
import { BAIL, polyLoop, reset, shipLoop, trapDistance } from './loops'

export type Family = 'poly' | 'ship' | 'newton'
/** 0: none, 1: point, 2: cross, 3: ring. */
export type TrapKind = 0 | 1 | 2 | 3

export interface FractalSpec {
  family: Family
  /** poly: Julia set (true) or parameter-plane set (false). */
  julia: boolean
  degree: number
  cx: number
  cy: number
  /** newton: roots as [x0, y0, x1, y1, ...]. */
  roots: Float64Array
  /** newton: relaxation factor a. */
  relax: number
  maxIter: number
  trap: TrapKind
  tx: number
  ty: number
  tr: number
  /**
   * poly Julia sets with an attracting cycle: one cycle point q and the squared
   * radius of a ball around it inside the immediate basin (0: no cycle known).
   * An orbit entering the ball is bounded for sure.
   */
  qx: number
  qy: number
  qeps2: number
}

/** Result of the last call to a sampler (reused, never reallocated). */
export interface Sample {
  /** 1 if the point escaped (or converged, for Newton), 0 if it stayed bounded. */
  esc: number
  /** Smooth (continuous) iteration count. */
  nu: number
  /** Distance estimate to the boundary, in plane units (Infinity if unknown). */
  de: number
  /** Unit normal of the potential, for lighting. */
  ux: number
  uy: number
  /** Minimum distance of the orbit to the trap. */
  trap: number
  /** Newton: index of the root reached, else -1. */
  basin: number
  // Raw state left by the loop; finish() turns it into nu, de, ux, uy, trap.
  it: number
  r2: number
  zx: number
  zy: number
  dx: number
  dy: number
  prev: number
}

export type Sampler = (x: number, y: number, out: Sample) => void

const LN_BAIL_HALF = 0.5 * ln(BAIL)
const NEWTON_TOL2 = 1e-8

// Fields that hold doubles start as doubles, so the object never changes shape.
export function newSample(): Sample {
  return { esc: 0, nu: 0.5, de: Infinity, ux: 0.5, uy: 0.5, trap: Infinity, basin: -1, it: 0, r2: 0.5, zx: 0.5, zy: 0.5, dx: 0.5, dy: 0.5, prev: Infinity }
}

/**
 * Returns a sampler: sample(x, y, out) fills `out` for the plane point (x, y).
 * `deriv` asks for the distance estimate and the normal. A spec with a trap
 * gets a trap loop (and no derivative).
 */
export function makeSampler(spec: FractalSpec, deriv: boolean): Sampler {
  const { maxIter, trap, tx, ty, tr } = spec

  if (spec.family === 'poly')
    return polyLoop(spec, trap ? 'trap' : deriv ? 'deriv' : 'plain')
  if (spec.family === 'ship')
    return shipLoop(spec, trap ? 'trap' : deriv ? 'deriv' : 'plain')

  // Newton: p(z) = prod (z - r_k). With S1 = sum 1/(z - r_k) and
  // S2 = sum 1/(z - r_k)^2: p/p' = 1/S1 and N'(z) = 1 - a S2 / S1^2.
  const roots = spec.roots
  const nr = roots.length / 2
  const a = spec.relax
  const tr2 = tr * tr
  // Always the same work per step (trap and derivative included): a branch on
  // a flag inside this loop costs more than the arithmetic it skips.
  const tk: TrapKind = trap || 1
  return (px, py, out) => {
    reset(out, maxIter)
    const n = maxIter
    let tmin = Infinity
    let zx = px
    let zy = py
    let dx = 1
    let dy = 0
    let prev = Infinity
    for (let i = 0; i < n; i++) {
      tmin = Math.min(tmin, trapDistance(tk, zx, zy, tx, ty, tr2))
      let s1x = 0
      let s1y = 0
      let s2x = 0
      let s2y = 0
      let best = Infinity
      let kb = 0
      for (let k = 0; k < nr; k++) {
        const ex = zx - roots[2 * k]
        const ey = zy - roots[2 * k + 1]
        const e2 = ex * ex + ey * ey
        if (e2 < best) {
          best = e2
          kb = k
        }
        const inv = 1 / e2
        const ix = ex * inv
        const iy = -ey * inv
        s1x += ix
        s1y += iy
        s2x += ix * ix - iy * iy
        s2y += 2 * ix * iy
      }
      if (best < NEWTON_TOL2) {
        out.esc = 1
        out.basin = kb
        out.it = i
        out.r2 = best
        out.prev = prev
        out.zx = zx - roots[2 * kb]
        out.zy = zy - roots[2 * kb + 1]
        out.dx = dx
        out.dy = dy
        break
      }
      prev = best
      const s1r2 = s1x * s1x + s1y * s1y
      if (!(s1r2 > 0))
        break
      // q = 1 / S1, and S2 / S1^2 = S2 q^2
      const qx = s1x / s1r2
      const qy = -s1y / s1r2
      const q2x = qx * qx - qy * qy
      const q2y = 2 * qx * qy
      const npx = 1 - a * (s2x * q2x - s2y * q2y)
      const npy = -a * (s2x * q2y + s2y * q2x)
      const ndx = npx * dx - npy * dy
      dy = npx * dy + npy * dx
      dx = ndx
      zx -= a * qx
      zy -= a * qy
    }
    out.trap = tmin
  }
}

const LN_TOL = 0.5 * ln(NEWTON_TOL2)

/**
 * Turns the raw state left by a sampler into the smooth count, the distance
 * estimate, the normal and the trap distance. Kept apart from the loops: the
 * logarithms, inlined into a hot loop, slow it down several times over.
 */
export function makeFinish(spec: FractalSpec, deriv: boolean): (out: Sample) => void {
  const lnD = ln(spec.degree)
  const trap = spec.trap
  const newton = spec.family === 'newton'
  const ship = spec.family === 'ship'
  return (out) => {
    if (trap)
      out.trap = trap === 3 ? sqrt(sqrt(out.trap)) : sqrt(out.trap)
    if (!out.esc)
      return
    const r2 = out.r2
    let lr: number
    if (newton) {
      // smooth count from the convergence rate: f = log(L_n / L_tol) / log(L_n / L_{n-1})
      let f = 1
      lr = 0
      if (r2 > 0) {
        lr = 0.5 * ln(r2)
        f = 0
        if (out.prev < Infinity) {
          const den = ln(lr / (0.5 * ln(out.prev)))
          if (den > 0)
            f = ln(lr / LN_TOL) / den
        }
      }
      if (f < 0)
        f = 0
      if (f > 1)
        f = 1
      out.nu = out.it + 1 - f
      lr = -lr
    }
    else {
      // i - log_d(ln|z| / ln R)
      lr = 0.5 * ln(r2)
      out.nu = out.it - ln(lr / LN_BAIL_HALF) / lnD
    }
    if (!deriv)
      return
    const { zx, zy, dx, dy } = out
    const dr2 = dx * dx + dy * dy
    if (!(dr2 > 0) || !(r2 > 0))
      return
    if (ship) {
      // (dx, dy) is the gradient g = J^T z: ln|z| has gradient g / |z|^2,
      // so the distance estimate is ln|z| |z|^2 / |g| and the normal is g / |g|
      const g = sqrt(dr2)
      out.de = lr * r2 / g
      out.ux = dx / g
      out.uy = dy / g
      return
    }
    // distance estimate |z| ln|z| / |dz|, normal z / dz
    out.de = lr * sqrt(r2 / dr2)
    const ux = zx * dx + zy * dy
    const uy = zy * dx - zx * dy
    const n = sqrt(ux * ux + uy * uy)
    if (n > 0) {
      out.ux = ux / n
      out.uy = uy / n
    }
  }
}
