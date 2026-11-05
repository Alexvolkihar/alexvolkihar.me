// Mathematical marbling: the surface deformations of Lu, Jaffer, Jin, Zhao &
// Mao, "Mathematical Marbling" (IEEE Computer Graphics and Applications, 2012),
// after Aubrey Jaffer's marbling notes (https://people.csail.mit.edu/jaffer/Marbling/).
//
// Every operation is a one-to-one map of the plane, so ink boundaries never
// cross: a drop pushes the ink around it outwards, a tine drags it along its
// path, a vortex turns it in place. Boundaries are closed polygons; after
// each operation, any edge that has been stretched too much is subdivided by
// mapping the in-between points of its pre-image, so curves stay smooth even
// after a fine comb has pulled them across the tray.

export interface Op {
  /** Writes the image of (x, y) into o[0], o[1]. */
  map: (x: number, y: number, o: Float64Array) => void
  /** The same map over n interleaved points, src into dst, in one tight loop. */
  mapAll: (src: Float64Array, dst: Float64Array, n: number) => void
  /** Conservative: false only if no point of the box can move. */
  touches: (x0: number, y0: number, x1: number, y1: number) => boolean
}

const always = () => true

/**
 * Ink drop of radius r at (cx, cy): P' = C + (P - C) * sqrt(1 + r^2 / |P - C|^2).
 * The new circle takes exactly the area it covers; everything else is pushed out.
 */
export function drop(cx: number, cy: number, r: number): Op {
  const r2 = r * r
  return {
    map(x, y, o) {
      const dx = x - cx
      const dy = y - cy
      const k = Math.sqrt(1 + r2 / Math.max(dx * dx + dy * dy, 1e-24))
      o[0] = cx + dx * k
      o[1] = cy + dy * k
    },
    mapAll(src, dst, n) {
      for (let i = 0; i < 2 * n; i += 2) {
        const dx = src[i] - cx
        const dy = src[i + 1] - cy
        const k = Math.sqrt(1 + r2 / Math.max(dx * dx + dy * dy, 1e-24))
        dst[i] = cx + dx * k
        dst[i + 1] = cy + dy * k
      }
    },
    touches: always,
  }
}

/**
 * A rake of parallel straight tines moving along `angle`, one every `spacing`
 * (Infinity: a single stylus), passing `offset` across the motion.
 * Displacement z = alpha * lambda / (d + lambda), d = distance to the nearest tine.
 */
export function comb(angle: number, offset: number, spacing: number, alpha: number, lambda: number): Op {
  const mx = Math.cos(angle)
  const my = Math.sin(angle)
  const nx = -my
  const ny = mx
  const sp = Number.isFinite(spacing) ? spacing : 1e9
  const al = alpha * lambda
  return {
    map(x, y, o) {
      let u = x * nx + y * ny - offset
      u -= sp * Math.round(u / sp)
      const z = al / (Math.abs(u) + lambda)
      o[0] = x + z * mx
      o[1] = y + z * my
    },
    mapAll(src, dst, n) {
      for (let i = 0; i < 2 * n; i += 2) {
        const x = src[i]
        const y = src[i + 1]
        let u = x * nx + y * ny - offset
        u -= sp * Math.round(u / sp)
        const z = al / (Math.abs(u) + lambda)
        dst[i] = x + z * mx
        dst[i + 1] = y + z * my
      }
    },
    touches: always,
  }
}

/** A shear along `angle`: P' = P + amp * sin(2 pi (P . N) / wavelength + phase) M. */
export function wave(angle: number, wavelength: number, amp: number, phase: number): Op {
  const mx = Math.cos(angle)
  const my = Math.sin(angle)
  const nx = -my * 2 * Math.PI / wavelength
  const ny = mx * 2 * Math.PI / wavelength
  return {
    map(x, y, o) {
      const s = amp * Math.sin(x * nx + y * ny + phase)
      o[0] = x + s * mx
      o[1] = y + s * my
    },
    mapAll(src, dst, n) {
      for (let i = 0; i < 2 * n; i += 2) {
        const x = src[i]
        const y = src[i + 1]
        const s = amp * Math.sin(x * nx + y * ny + phase)
        dst[i] = x + s * mx
        dst[i + 1] = y + s * my
      }
    },
    touches: always,
  }
}

/** Turns the ink around (cx, cy) by omega * exp(-rho^2 / R^2): a stylus stirred in place. */
export function vortex(cx: number, cy: number, omega: number, R: number): Op {
  const reach = 3.2 * R
  const reach2 = reach * reach
  const iR2 = 1 / (R * R)
  return {
    map(x, y, o) {
      const dx = x - cx
      const dy = y - cy
      const d2 = dx * dx + dy * dy
      if (d2 > reach2) {
        o[0] = x
        o[1] = y
        return
      }
      const t = omega * Math.exp(-d2 * iR2)
      const c = Math.cos(t)
      const s = Math.sin(t)
      o[0] = cx + dx * c - dy * s
      o[1] = cy + dx * s + dy * c
    },
    mapAll(src, dst, n) {
      for (let i = 0; i < 2 * n; i += 2) {
        const dx = src[i] - cx
        const dy = src[i + 1] - cy
        const d2 = dx * dx + dy * dy
        if (d2 > reach2) {
          dst[i] = src[i]
          dst[i + 1] = src[i + 1]
          continue
        }
        const t = omega * Math.exp(-d2 * iR2)
        const c = Math.cos(t)
        const s = Math.sin(t)
        dst[i] = cx + dx * c - dy * s
        dst[i + 1] = cy + dx * s + dy * c
      }
    },
    touches: (x0, y0, x1, y1) => {
      const qx = Math.max(x0, Math.min(cx, x1)) - cx
      const qy = Math.max(y0, Math.min(cy, y1)) - cy
      return qx * qx + qy * qy <= reach2
    },
  }
}

/** A circular tine of radius r0 around (cx, cy): the ink turns by z / rho, z = alpha * lambda / (|rho - r0| + lambda). */
export function circularTine(cx: number, cy: number, r0: number, alpha: number, lambda: number): Op {
  const al = alpha * lambda
  return {
    map(x, y, o) {
      const dx = x - cx
      const dy = y - cy
      const rho = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9)
      const t = al / (Math.abs(rho - r0) + lambda) / rho
      const c = Math.cos(t)
      const s = Math.sin(t)
      o[0] = cx + dx * c - dy * s
      o[1] = cy + dx * s + dy * c
    },
    mapAll(src, dst, n) {
      for (let i = 0; i < 2 * n; i += 2) {
        const dx = src[i] - cx
        const dy = src[i + 1] - cy
        const rho = Math.max(Math.sqrt(dx * dx + dy * dy), 1e-9)
        const t = al / (Math.abs(rho - r0) + lambda) / rho
        const c = Math.cos(t)
        const s = Math.sin(t)
        dst[i] = cx + dx * c - dy * s
        dst[i + 1] = cy + dx * s + dy * c
      }
    },
    touches: always,
  }
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

export interface Poly {
  /** Interleaved x, y. */
  p: Float64Array
  n: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export function circle(cx: number, cy: number, r: number, maxLen: number): Poly {
  const n = Math.max(20, Math.ceil(2 * Math.PI * r / maxLen))
  const p = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n
    p[i * 2] = cx + r * Math.cos(a)
    p[i * 2 + 1] = cy + r * Math.sin(a)
  }
  return { p, n, x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }
}

/** Where detail is kept. Outside it, edges are not refined and points are thinned. */
export interface Detail {
  x0: number
  y0: number
  x1: number
  y1: number
  maxLen: number
  minLen: number
  /** Spacing of the points kept outside the box. */
  coarse: number
  /** Most vertices in one polygon. */
  cap: number
}

// Scratch buffers, shared by every call (render is synchronous).
let mapped = new Float64Array(1 << 15)
let out = new Float64Array(1 << 15)
const pt = new Float64Array(2)

/** Most new points inserted in one edge. */
const MAX_SPLIT = 64

/** Applies `op` to a polygon in place, refining stretched edges from their pre-image. */
export function transform(poly: Poly, op: Op, dt: Detail) {
  if (!op.touches(poly.x0, poly.y0, poly.x1, poly.y1))
    return
  const { p, n } = poly
  if (mapped.length < n * 2)
    mapped = new Float64Array(n * 4)
  op.mapAll(p, mapped, n)

  // Fast path: nothing to refine nor thin.
  const max2 = dt.maxLen * dt.maxLen
  const min2 = n > 24 ? dt.minLen * dt.minLen : 0
  const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = dt
  const outside = (x: number, y: number) => x < bx0 || x > bx1 || y < by0 || y > by1
  let clean = true
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < 2 * n; i += 2) {
    const ax = mapped[i]
    const ay = mapped[i + 1]
    if (ax < x0)
      x0 = ax
    if (ax > x1)
      x1 = ax
    if (ay < y0)
      y0 = ay
    if (ay > y1)
      y1 = ay
    const j = i + 2 < 2 * n ? i + 2 : 0
    const dx = mapped[j] - ax
    const dy = mapped[j + 1] - ay
    const d2 = dx * dx + dy * dy
    if (d2 < min2 || (d2 > max2 && !(outside(ax, ay) && outside(mapped[j], mapped[j + 1])))) {
      clean = false
      break
    }
  }
  if (clean) {
    p.set(mapped.subarray(0, n * 2))
    poly.x0 = x0
    poly.y0 = y0
    poly.x1 = x1
    poly.y1 = y1
    return
  }

  const coarse2 = dt.coarse * dt.coarse
  let m = 0
  let lx = Number.NaN
  let ly = Number.NaN
  let lOut = false
  x0 = Infinity
  y0 = Infinity
  x1 = -Infinity
  y1 = -Infinity
  const need = n * 2 + 2
  if (out.length < need * 2)
    out = new Float64Array(need * 4)
  for (let i = 0; i < n; i++) {
    const ax = mapped[i * 2]
    const ay = mapped[i * 2 + 1]
    const aOut = outside(ax, ay)
    const d2 = (ax - lx) * (ax - lx) + (ay - ly) * (ay - ly)
    if (!(m > 0 && (d2 < min2 || (aOut && lOut && d2 < coarse2)))) {
      if (m * 2 + 2 > out.length) {
        const bigger = new Float64Array(out.length * 2)
        bigger.set(out)
        out = bigger
      }
      out[m * 2] = ax
      out[m * 2 + 1] = ay
      m++
      lx = ax
      ly = ay
      lOut = aOut
      if (ax < x0)
        x0 = ax
      if (ax > x1)
        x1 = ax
      if (ay < y0)
        y0 = ay
      if (ay > y1)
        y1 = ay
    }
    const j = i + 1 < n ? i + 1 : 0
    const bx = mapped[j * 2]
    const by = mapped[j * 2 + 1]
    const dx = bx - ax
    const dy = by - ay
    const e2 = dx * dx + dy * dy
    if (e2 > max2 && m < dt.cap && !(aOut && outside(bx, by))) {
      const k = Math.min(MAX_SPLIT, Math.ceil(Math.sqrt(e2) / dt.maxLen))
      if ((m + k) * 2 + 2 > out.length) {
        const bigger = new Float64Array((m + k) * 4 + out.length)
        bigger.set(out)
        out = bigger
      }
      const px = p[i * 2]
      const py = p[i * 2 + 1]
      const qx = p[j * 2] - px
      const qy = p[j * 2 + 1] - py
      for (let t = 1; t < k; t++) {
        const u = t / k
        op.map(px + qx * u, py + qy * u, pt)
        const x = pt[0]
        const y = pt[1]
        out[m * 2] = x
        out[m * 2 + 1] = y
        m++
        if (x < x0)
          x0 = x
        if (x > x1)
          x1 = x
        if (y < y0)
          y0 = y
        if (y > y1)
          y1 = y
      }
      lx = out[m * 2 - 2]
      ly = out[m * 2 - 1]
      lOut = outside(lx, ly)
    }
  }
  poly.p = out.slice(0, m * 2)
  poly.n = m
  poly.x0 = x0
  poly.y0 = y0
  poly.x1 = x1
  poly.y1 = y1
}
