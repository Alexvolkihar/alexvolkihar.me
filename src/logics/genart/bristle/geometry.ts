// Convex-polygon helpers for "Bristle": the four ways of cutting the sheet
// into angular patches, plus the few queries the tuft emitters need.
//
// Every patch is a convex polygon in canvas units where the short side is 1,
// stored as a flat list of [x, y] corners. All cuts keep polygons convex, so
// insetting, clipping and ray casting stay simple half-plane arithmetic.

import type { Rng } from '../random'
import { range } from '../random'

export type Pt = [number, number]
export type Poly = Pt[]

export function area(p: Poly): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

export function centroid(p: Poly): Pt {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  if (Math.abs(a) < 1e-12)
    return [p[0][0], p[0][1]]
  return [cx / (3 * a), cy / (3 * a)]
}

export function bbox(p: Poly): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of p) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  return [x0, y0, x1, y1]
}

/** Keeps the part of `p` where nx * x + ny * y <= c (Sutherland-Hodgman, one edge). */
export function clipHalf(p: Poly, nx: number, ny: number, c: number): Poly {
  const out: Poly = []
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const da = nx * a[0] + ny * a[1] - c
    const db = nx * b[0] + ny * b[1] - c
    if (da <= 0)
      out.push(a)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Shrinks a convex polygon by `g` on every side; may return fewer than 3 corners. */
export function inset(p: Poly, g: number): Poly {
  const s = area(p) > 0 ? 1 : -1
  let q = p
  for (let i = 0; i < p.length && q.length >= 3; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const l = Math.hypot(x1 - x0, y1 - y0)
    if (l < 1e-9)
      continue
    // outward normal of a counter-clockwise (s = 1) edge
    const nx = s * (y1 - y0) / l
    const ny = -s * (x1 - x0) / l
    q = clipHalf(q, nx, ny, nx * x0 + ny * y0 - g)
  }
  return q
}

/** Signed distance to a convex polygon's boundary: negative inside. */
export function signedDist(p: Poly, x: number, y: number): number {
  const s = area(p) > 0 ? 1 : -1
  let d = -Infinity
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const l = Math.hypot(x1 - x0, y1 - y0)
    if (l < 1e-9)
      continue
    const nx = s * (y1 - y0) / l
    const ny = -s * (x1 - x0) / l
    d = Math.max(d, nx * (x - x0) + ny * (y - y0))
  }
  return d
}

/** Same as signedDist, with the edge normals computed once: for hot loops. */
export function distField(p: Poly): (x: number, y: number) => number {
  const s = area(p) > 0 ? 1 : -1
  const e: number[] = []
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const l = Math.hypot(x1 - x0, y1 - y0)
    if (l < 1e-9)
      continue
    const nx = s * (y1 - y0) / l
    const ny = -s * (x1 - x0) / l
    e.push(nx, ny, nx * x0 + ny * y0)
  }
  const n = e.length
  return (x: number, y: number) => {
    let d = -Infinity
    for (let i = 0; i < n; i += 3) {
      const v = e[i] * x + e[i + 1] * y - e[i + 2]
      if (v > d)
        d = v
    }
    return d
  }
}

/** Distance from an inside point to the boundary along a unit direction. */
export function rayExit(p: Poly, x: number, y: number, dx: number, dy: number): number {
  let best = Infinity
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const ex = x1 - x0
    const ey = y1 - y0
    const den = dx * ey - dy * ex
    if (Math.abs(den) < 1e-12)
      continue
    const t = ((x0 - x) * ey - (y0 - y) * ex) / den
    const u = ((x0 - x) * dy - (y0 - y) * dx) / den
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9)
      best = Math.min(best, t)
  }
  return best === Infinity ? 0 : best
}

const rect = (W: number, H: number): Poly => [[0, 0], [W, 0], [W, H], [0, H]]

/**
 * Voronoi cells of well-spread sites, each cell cut out of the sheet by the
 * bisector half-planes of every other site. Sites come from Mitchell's best
 * candidate sampling, so cells are even without being regular.
 */
export function shards(r: Rng, W: number, H: number, n: number): Poly[] {
  const sites: Pt[] = []
  for (let i = 0; i < n; i++) {
    let best: Pt = [0, 0]
    let bestD = -1
    for (let k = 0; k < 6; k++) {
      const c: Pt = [r() * W, r() * H]
      let d = Infinity
      for (const s of sites)
        d = Math.min(d, (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2)
      if (d > bestD) {
        bestD = d
        best = c
      }
    }
    sites.push(best)
  }
  const cells: Poly[] = []
  for (let i = 0; i < n; i++) {
    let cell = rect(W, H)
    const [xi, yi] = sites[i]
    for (let j = 0; j < n && cell.length >= 3; j++) {
      if (j === i)
        continue
      const [xj, yj] = sites[j]
      cell = clipHalf(cell, xj - xi, yj - yi, (xj * xj + yj * yj - xi * xi - yi * yi) / 2)
    }
    if (cell.length >= 3)
      cells.push(cell)
  }
  return cells
}

/** Recursive guillotine cuts: the largest block is split across its long side. */
export function blocks(r: Rng, W: number, H: number, n: number): Poly[] {
  const list: [number, number, number, number][] = [[0, 0, W, H]]
  while (list.length < n) {
    let k = 0
    let best = -1
    for (let i = 0; i < list.length; i++) {
      const [x0, y0, x1, y1] = list[i]
      const a = (x1 - x0) * (y1 - y0) * range(r, 0.6, 1.4)
      if (a > best) {
        best = a
        k = i
      }
    }
    const [x0, y0, x1, y1] = list[k]
    const t = range(r, 0.3, 0.7)
    list.splice(k, 1)
    if (x1 - x0 > (y1 - y0) * range(r, 0.8, 1.25)) {
      const xm = x0 + (x1 - x0) * t
      list.push([x0, y0, xm, y1], [xm, y0, x1, y1])
    }
    else {
      const ym = y0 + (y1 - y0) * t
      list.push([x0, y0, x1, ym], [x0, ym, x1, y1])
    }
  }
  return list.map(([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Poly)
}

/** Triangles: the sheet's two halves, then the largest triangle cut across its longest edge. */
export function facets(r: Rng, W: number, H: number, n: number): Poly[] {
  const tris: Poly[] = r() < 0.5
    ? [[[0, 0], [W, 0], [W, H]], [[0, 0], [W, H], [0, H]]]
    : [[[0, 0], [W, 0], [0, H]], [[W, 0], [W, H], [0, H]]]
  while (tris.length < n) {
    let k = 0
    let best = -1
    for (let i = 0; i < tris.length; i++) {
      const a = Math.abs(area(tris[i])) * range(r, 0.7, 1.3)
      if (a > best) {
        best = a
        k = i
      }
    }
    const t = tris[k]
    let e = 0
    let le = -1
    for (let i = 0; i < 3; i++) {
      const l = Math.hypot(t[(i + 1) % 3][0] - t[i][0], t[(i + 1) % 3][1] - t[i][1])
      if (l > le) {
        le = l
        e = i
      }
    }
    const a = t[e]
    const b = t[(e + 1) % 3]
    const c = t[(e + 2) % 3]
    const u = range(r, 0.35, 0.65)
    const m: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
    tris.splice(k, 1, [a, m, c], [m, b, c])
  }
  return tris
}

/** Horizontal bands of uneven height, each cut by one to three slanted seams. */
export function bands(r: Rng, W: number, H: number, n: number): Poly[] {
  const ws: number[] = []
  let tot = 0
  for (let i = 0; i < n; i++) {
    const w = range(r, 0.5, 1.6)
    ws.push(w)
    tot += w
  }
  const out: Poly[] = []
  let y = 0
  for (let i = 0; i < n; i++) {
    const y1 = y + ws[i] / tot * H
    const h = y1 - y
    const cuts = Math.floor(r() * 3.2 * W / Math.max(W, H) + 0.4)
    const xs: [number, number][] = [[0, 0]]
    for (let k = 0; k < cuts; k++) {
      const xc = W * (k + 1) / (cuts + 1) + range(r, -0.12, 0.12) * W / (cuts + 1)
      // bounded so that neighbouring seams never cross
      const lean = range(r, -1, 1) * Math.min(0.6 * h, 0.3 * W / (cuts + 1))
      xs.push([xc + lean, xc - lean])
    }
    xs.push([W, W])
    for (let k = 0; k + 1 < xs.length; k++) {
      const [ta, ba] = xs[k]
      const [tb, bb] = xs[k + 1]
      out.push([[ta, y], [tb, y], [bb, y1], [ba, y1]])
    }
    y = y1
  }
  return out
}
