// Layered-polygon "watercolour" for the Bloom series.
//
// A shape is a closed polygon whose vertices each carry a variance weight.
// One deformation round inserts a vertex in the middle of every edge and
// pushes it away by a random, roughly Gaussian offset proportional to the edge length and to
// the variance of the edge (recursive midpoint displacement, Fournier,
// Fussell & Carpenter, "Computer Rendering of Stochastic Models", 1982).
// A few rounds give a base shape; every translucent layer then deforms that
// base again and is filled at a few percent opacity, so the stack builds a
// dense core with a soft, irregular rim. The layering approach follows Tyler
// Hobbs's essay "A Guide to Simulating Watercolor Paint with Generative Art"
// (2017); this is an independent implementation.

import type { Rng } from '../random'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Flat closed polygon: x0, y0, v0, x1, y1, v1, … (v = variance weight). */
export type Poly = Float64Array

/**
 * Approximately standard normal: the sum of three uniforms (Irwin–Hall),
 * rescaled to unit variance. Bounded to ±3, so a rare draw never throws a
 * spike across the canvas, and much cheaper than Box–Muller in this hot loop.
 * Always consumes exactly three draws.
 */
function normal3(r: Rng): number {
  return (r() + r() + r() - 1.5) * 2
}

/** `rounds` rounds of recursive midpoint displacement; `k` scales every offset. */
export function deform(p: Poly, rounds: number, k: number, r: Rng): Poly {
  let cur = p
  for (let n = 0; n < rounds; n++) {
    const m = cur.length / 3
    const out = new Float64Array(m * 6)
    for (let i = 0; i < m; i++) {
      const a = i * 3
      const b = i + 1 < m ? a + 3 : 0
      const ax = cur[a]
      const ay = cur[a + 1]
      const av = cur[a + 2]
      const bx = cur[b]
      const by = cur[b + 1]
      const v = (av + cur[b + 2]) * 0.5
      const sd = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) * k * v
      const o = i * 6
      out[o] = ax
      out[o + 1] = ay
      out[o + 2] = av
      out[o + 3] = (ax + bx) * 0.5 + normal3(r) * sd
      out[o + 4] = (ay + by) * 0.5 + normal3(r) * sd
      out[o + 5] = v * (0.85 + r() * 0.3)
    }
    cur = out
  }
  return cur
}

/** Adds the polygon to the current path (no beginPath, no fill). */
export function tracePoly(g: Ctx2D, p: Poly): void {
  g.moveTo(p[0], p[1])
  for (let i = 3; i < p.length; i += 3)
    g.lineTo(p[i], p[i + 1])
  g.closePath()
}

/** Regular n-gon of radius `rad` around (cx, cy), every vertex with variance v. */
export function ngon(cx: number, cy: number, rad: number, n: number, v: number, phase = 0): Poly {
  const p: Poly = new Float64Array(n * 3)
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2
    p[i * 3] = cx + Math.cos(a) * rad
    p[i * 3 + 1] = cy + Math.sin(a) * rad
    p[i * 3 + 2] = v
  }
  return p
}

/** Per-layer opacity so that `layers` full overlaps reach about `cover` opacity. */
export function layerAlpha(layers: number, cover: number): number {
  return 1 - (1 - cover) ** (1 / layers)
}

/**
 * Paints one shape as a watercolour stack: `layers` fills of the base polygon
 * deformed `rounds` more times each. The fill style must already be set.
 */
export function wash(g: Ctx2D, base: Poly, layers: number, rounds: number, k: number, cover: number, r: Rng): void {
  g.globalAlpha = layerAlpha(layers, cover)
  for (let l = 0; l < layers; l++) {
    g.beginPath()
    tracePoly(g, deform(base, rounds, k, r))
    g.fill()
  }
}
