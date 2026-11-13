// Drawing of one ribbon: an opaque body, interior hatching and an outline.
//
// The ribbon is cut into quads between consecutive centreline vertices (left
// and right offsets on the mitred normal). Hatching is a family of parallel
// lines m·p = offset + k·spacing; each quad clips the lines that cross it
// analytically, so neighbouring quads continue the same lines and no canvas
// clipping region is needed.

import type { Rng } from '../random'
import type { Ribbon } from './grow'

export interface Outline {
  lx: number[]
  ly: number[]
  rx: number[]
  ry: number[]
}

/** Left and right edges of a ribbon, in pixels. */
export function outline(rb: Ribbon, S: number, ox: number, oy: number): Outline {
  const n = rb.xs.length
  const o: Outline = { lx: [], ly: [], rx: [], ry: [] }
  const hw = rb.w / 2
  for (let i = 0; i < n; i++) {
    // mitred normal: mean heading of the two segments meeting at the vertex
    let h = rb.hs[i]
    let k = 1
    if (i > 0 && i < n - 1) {
      const h2 = rb.hs[i + 1]
      h = (h + h2) / 2
      k = 1 / Math.max(0.6, Math.cos((h2 - rb.hs[i]) / 2))
    }
    if (i === 0)
      h = rb.hs[Math.min(1, n - 1)]
    const nx = -Math.sin(h) * hw * k
    const ny = Math.cos(h) * hw * k
    o.lx.push(ox + (rb.xs[i] + nx) * S)
    o.ly.push(oy + (rb.ys[i] + ny) * S)
    o.rx.push(ox + (rb.xs[i] - nx) * S)
    o.ry.push(oy + (rb.ys[i] - ny) * S)
  }
  return o
}

export function tracePolygon(g: CanvasRenderingContext2D, o: Outline) {
  const n = o.lx.length
  g.moveTo(o.lx[0], o.ly[0])
  for (let i = 1; i < n; i++)
    g.lineTo(o.lx[i], o.ly[i])
  for (let i = n - 1; i >= 0; i--)
    g.lineTo(o.rx[i], o.ry[i])
  g.closePath()
}

const qx = [0, 0, 0, 0]
const qy = [0, 0, 0, 0]

function quad(o: Outline, i: number) {
  qx[0] = o.lx[i]
  qy[0] = o.ly[i]
  qx[1] = o.lx[i + 1]
  qy[1] = o.ly[i + 1]
  qx[2] = o.rx[i + 1]
  qy[2] = o.ry[i + 1]
  qx[3] = o.rx[i]
  qy[3] = o.ry[i]
}

/**
 * Add to the current path the hatch lines of angle `ang`, `sp` pixels apart,
 * with a lattice offset `off` in [0, 1). `jit` displaces the ends slightly.
 */
export function hatch(g: CanvasRenderingContext2D, o: Outline, ang: number, sp: number, off: number, jit: number, r: Rng) {
  const mx = -Math.sin(ang)
  const my = Math.cos(ang)
  const n = o.lx.length
  const px = [0, 0]
  const py = [0, 0]
  for (let i = 0; i < n - 1; i++) {
    quad(o, i)
    let lo = Infinity
    let hi = -Infinity
    const d = [0, 0, 0, 0]
    for (let c = 0; c < 4; c++) {
      d[c] = qx[c] * mx + qy[c] * my
      lo = Math.min(lo, d[c])
      hi = Math.max(hi, d[c])
    }
    const k0 = Math.ceil(lo / sp - off)
    const k1 = Math.floor(hi / sp - off)
    for (let k = k0; k <= k1; k++) {
      const v = (k + off) * sp
      let m = 0
      for (let c = 0; c < 4 && m < 2; c++) {
        const e = (c + 1) & 3
        const a = d[c] - v
        const b = d[e] - v
        if ((a <= 0 && b > 0) || (a > 0 && b <= 0)) {
          const t = a / (a - b)
          px[m] = qx[c] + (qx[e] - qx[c]) * t
          py[m] = qy[c] + (qy[e] - qy[c]) * t
          m++
        }
      }
      if (m === 2) {
        g.moveTo(px[0] + (r() - 0.5) * jit, py[0] + (r() - 0.5) * jit)
        g.lineTo(px[1] + (r() - 0.5) * jit, py[1] + (r() - 0.5) * jit)
      }
    }
  }
}

/** Add stipple dots (small squares of side `dot`) over the ribbon body. */
export function stipple(g: CanvasRenderingContext2D, o: Outline, sp: number, dot: number, r: Rng) {
  const n = o.lx.length
  for (let i = 0; i < n - 1; i++) {
    quad(o, i)
    const area = Math.abs((qx[2] - qx[0]) * (qy[3] - qy[1]) - (qx[3] - qx[1]) * (qy[2] - qy[0])) / 2
    const want = area / (sp * sp)
    let count = Math.floor(want)
    if (r() < want - count)
      count++
    for (let k = 0; k < count; k++) {
      const u = r()
      const v = r()
      const ax = qx[0] + (qx[1] - qx[0]) * u
      const ay = qy[0] + (qy[1] - qy[0]) * u
      const bx = qx[3] + (qx[2] - qx[3]) * u
      const by = qy[3] + (qy[2] - qy[3]) * u
      g.rect(ax + (bx - ax) * v - dot / 2, ay + (by - ay) * v - dot / 2, dot, dot)
    }
  }
}
