// Escape loops for the "Julia" series, one straight-line loop per degree and
// per variant. A loop over the degree, or a branch on a run-time flag, inside
// the hot loop makes V8 box the orbit and run three times slower once several
// samplers exist, so every variant is written out (by a small template; edit
// all of them together). Only + - * / and sign flips touch the orbit.

import type { FractalSpec, Sample, Sampler, TrapKind } from './fractal'

export const BAIL = 1e8 // |z| > 1e4: a large radius keeps the smooth count continuous
export const PERIOD_EPS = 1e-18

export type Variant = 'plain' | 'deriv' | 'trap'

export function reset(out: Sample, maxIter: number) {
  out.esc = 0
  out.nu = maxIter
  out.de = Infinity
  out.ux = 0
  out.uy = 0
  out.trap = Infinity
  out.basin = -1
  out.dx = 0
  out.dy = 0
}

/** Escaped orbit: keep the raw state for finish(). */
export function escaped(out: Sample, i: number, r2: number, zx: number, zy: number, dx: number, dy: number) {
  out.esc = 1
  out.it = i
  out.r2 = r2
  out.zx = zx
  out.zy = zy
  out.dx = dx
  out.dy = dy
}

/** Squared distance to the trap (ring: squared offset of |z - t|^2 from r^2). */
export function trapDistance(kind: TrapKind, zx: number, zy: number, tx: number, ty: number, tr2: number): number {
  const dx = zx - tx
  const dy = zy - ty
  if (kind === 1)
    return dx * dx + dy * dy
  if (kind === 2) {
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    return ax < ay ? ax * ax : ay * ay
  }
  const v = dx * dx + dy * dy - tr2
  return v * v
}

/** Main cardioid and period-2 bulb of the Mandelbrot set. */
function inMainBulbs(x: number, y: number): boolean {
  const xq = x - 0.25
  const q = xq * xq + y * y
  if (q * (q + xq) <= 0.25 * y * y)
    return true
  return (x + 1) * (x + 1) + y * y <= 0.0625
}

/**
 * z -> z^d + c, d in 2..5: a Julia set (z0 = point) or a parameter-plane set
 * (c = point, starting at z1 = c with dz1/dc = 1).
 */
export function polyLoop(spec: FractalSpec, mode: Variant): Sampler {
  const { maxIter, trap, tx, ty, tr } = spec
  const d = spec.degree
  const julia = spec.julia
  const jx = spec.cx
  const jy = spec.cy
  const add = julia ? 0 : 1
  const bulbs = !julia && d === 2
  // Known attracting cycle: compare with the cycle point q, never move it.
  // Otherwise: Brent-style periodicity check against a saved orbit point.
  const s0 = spec.qeps2 > 0
  const qx = spec.qx
  const qy = spec.qy
  const eps = s0 ? spec.qeps2 : PERIOD_EPS
  const len0 = s0 ? Infinity : 8

  if (d === 2 && mode === 'plain') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const wx = zx
        const wy = zy
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 2 && mode === 'deriv') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let dx = 1
      let dy = 0
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, dx, dy)
          break
        }
        const wx = zx
        const wy = zy
        const ndx = 2 * (wx * dx - wy * dy) + add
        dy = 2 * (wx * dy + wy * dx)
        dx = ndx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 2 && mode === 'trap') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      const tk = trap
      const ttx = tx
      const tty = ty
      const tr2 = tr * tr
      let tmin = Infinity
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const t = trapDistance(tk, zx, zy, ttx, tty, tr2)
        if (t < tmin)
          tmin = t
        const wx = zx
        const wy = zy
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
      out.trap = tmin
    }
  }
  if (d === 3 && mode === 'plain') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const wx = zx * zx - zy * zy
        const wy = 2 * zx * zy
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 3 && mode === 'deriv') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let dx = 1
      let dy = 0
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, dx, dy)
          break
        }
        const wx = zx * zx - zy * zy
        const wy = 2 * zx * zy
        const ndx = 3 * (wx * dx - wy * dy) + add
        dy = 3 * (wx * dy + wy * dx)
        dx = ndx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 3 && mode === 'trap') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      const tk = trap
      const ttx = tx
      const tty = ty
      const tr2 = tr * tr
      let tmin = Infinity
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const t = trapDistance(tk, zx, zy, ttx, tty, tr2)
        if (t < tmin)
          tmin = t
        const wx = zx * zx - zy * zy
        const wy = 2 * zx * zy
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
      out.trap = tmin
    }
  }
  if (d === 4 && mode === 'plain') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * zx - y2 * zy
        const wy = x2 * zy + y2 * zx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 4 && mode === 'deriv') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let dx = 1
      let dy = 0
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, dx, dy)
          break
        }
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * zx - y2 * zy
        const wy = x2 * zy + y2 * zx
        const ndx = 4 * (wx * dx - wy * dy) + add
        dy = 4 * (wx * dy + wy * dx)
        dx = ndx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 4 && mode === 'trap') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      const tk = trap
      const ttx = tx
      const tty = ty
      const tr2 = tr * tr
      let tmin = Infinity
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const t = trapDistance(tk, zx, zy, ttx, tty, tr2)
        if (t < tmin)
          tmin = t
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * zx - y2 * zy
        const wy = x2 * zy + y2 * zx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
      out.trap = tmin
    }
  }
  if (d === 5 && mode === 'plain') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * x2 - y2 * y2
        const wy = 2 * x2 * y2
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 5 && mode === 'deriv') {
    return (px, py, out) => {
      reset(out, maxIter)
      if (bulbs && inMainBulbs(px, py))
        return
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      let dx = 1
      let dy = 0
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, dx, dy)
          break
        }
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * x2 - y2 * y2
        const wy = 2 * x2 * y2
        const ndx = 5 * (wx * dx - wy * dy) + add
        dy = 5 * (wx * dy + wy * dx)
        dx = ndx
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (d === 5 && mode === 'trap') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      const cx = julia ? jx : px
      const cy = julia ? jy : py
      const e2 = eps
      let zx = px
      let zy = py
      const tk = trap
      const ttx = tx
      const tty = ty
      const tr2 = tr * tr
      let tmin = Infinity
      let sx = s0 ? qx : zx
      let sy = s0 ? qy : zy
      let check = 0
      let checkLen = len0
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const t = trapDistance(tk, zx, zy, ttx, tty, tr2)
        if (t < tmin)
          tmin = t
        const x2 = zx * zx - zy * zy
        const y2 = 2 * zx * zy
        const wx = x2 * x2 - y2 * y2
        const wy = 2 * x2 * y2
        const nzx = wx * zx - wy * zy + cx
        zy = wx * zy + wy * zx + cy
        zx = nzx
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < e2)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
      out.trap = tmin
    }
  }
  throw new Error(`Unsupported degree ${d}`)
}

/**
 * The Burning Ship, z -> (|x| + i|y|)^2 + c (Michelitsch & Rössler, 1992).
 * The fold is not holomorphic, so the "deriv" loop carries the full 2 x 2
 * Jacobian and hands finish() the gradient J^T z instead of a complex dz.
 */
export function shipLoop(spec: FractalSpec, mode: Variant): Sampler {
  const { maxIter, trap, tx, ty, tr } = spec
  if (mode === 'plain') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      let zx = px
      let zy = py
      let sx = zx
      let sy = zy
      let check = 0
      let checkLen = 8
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const sgx = zx < 0 ? -1 : 1
        const sgy = zy < 0 ? -1 : 1
        const ax = zx * sgx
        const ay = zy * sgy
        zx = ax * ax - ay * ay + px
        zy = 2 * ax * ay + py
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < PERIOD_EPS)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (mode === 'deriv') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      let zx = px
      let zy = py
      // Jacobian of the orbit w.r.t. c (the fold is not holomorphic)
      let j11 = 1
      let j12 = 0
      let j21 = 0
      let j22 = 1
      let sx = zx
      let sy = zy
      let check = 0
      let checkLen = 8
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          // gradient of ln|z|, up to 1/|z|^2: J^T z
          escaped(out, i, r2, zx, zy, j11 * zx + j21 * zy, j12 * zx + j22 * zy)
          break
        }
        const sgx = zx < 0 ? -1 : 1
        const sgy = zy < 0 ? -1 : 1
        const ax = zx * sgx
        const ay = zy * sgy
        const s11 = sgx * j11
        const s12 = sgx * j12
        const s21 = sgy * j21
        const s22 = sgy * j22
        j11 = 2 * (ax * s11 - ay * s21) + 1
        j12 = 2 * (ax * s12 - ay * s22)
        j21 = 2 * (ay * s11 + ax * s21)
        j22 = 2 * (ay * s12 + ax * s22) + 1
        zx = ax * ax - ay * ay + px
        zy = 2 * ax * ay + py
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < PERIOD_EPS)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
    }
  }
  if (mode === 'trap') {
    return (px, py, out) => {
      reset(out, maxIter)
      const n = maxIter
      let zx = px
      let zy = py
      const tk = trap
      const ttx = tx
      const tty = ty
      const tr2 = tr * tr
      let tmin = Infinity
      let sx = zx
      let sy = zy
      let check = 0
      let checkLen = 8
      for (let i = 0; i < n; i++) {
        const r2 = zx * zx + zy * zy
        if (r2 > BAIL) {
          escaped(out, i, r2, zx, zy, 0, 0)
          break
        }
        const t = trapDistance(tk, zx, zy, ttx, tty, tr2)
        if (t < tmin)
          tmin = t
        const sgx = zx < 0 ? -1 : 1
        const sgy = zy < 0 ? -1 : 1
        const ax = zx * sgx
        const ay = zy * sgy
        zx = ax * ax - ay * ay + px
        zy = 2 * ax * ay + py
        const ex = zx - sx
        const ey = zy - sy
        if (ex * ex + ey * ey < PERIOD_EPS)
          break
        if (++check === checkLen) {
          check = 0
          checkLen *= 2
          sx = zx
          sy = zy
        }
      }
      out.trap = tmin
    }
  }
  throw new Error(`Unknown variant ${mode}`)
}
