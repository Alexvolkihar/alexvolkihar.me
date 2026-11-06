// The closed curves that the epicycles redraw. Each one is built from the
// "subject" stream, resampled at equal arc length (the pen moves at constant
// speed), centred on its mean point (so c_0 = 0 and the chain starts at the
// centre) and scaled to a largest radius of 1.

import type { Rng } from '../random'
import { int, range } from '../random'

export type SubjectKind = 'Glyph' | 'Blob' | 'Star' | 'Shard'

const TAU = Math.PI * 2

/** Samples per revolution: a power of two, independent of the canvas size. */
export const SAMPLES = 1024

function resample(dense: number[], M: number): Float64Array {
  const n = dense.length / 2
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    cum[i + 1] = cum[i] + Math.hypot(dense[j * 2] - dense[i * 2], dense[j * 2 + 1] - dense[i * 2 + 1])
  }
  const total = cum[n]
  const out = new Float64Array(M * 2)
  let seg = 0
  for (let m = 0; m < M; m++) {
    const s = (total * m) / M
    while (seg < n - 1 && cum[seg + 1] <= s)
      seg++
    const j = (seg + 1) % n
    const u = (s - cum[seg]) / Math.max(1e-12, cum[seg + 1] - cum[seg])
    out[m * 2] = dense[seg * 2] + u * (dense[j * 2] - dense[seg * 2])
    out[m * 2 + 1] = dense[seg * 2 + 1] + u * (dense[j * 2 + 1] - dense[seg * 2 + 1])
  }
  let mx = 0
  let my = 0
  for (let m = 0; m < M; m++) {
    mx += out[m * 2]
    my += out[m * 2 + 1]
  }
  mx /= M
  my /= M
  let rmax = 0
  for (let m = 0; m < M; m++) {
    out[m * 2] -= mx
    out[m * 2 + 1] -= my
    rmax = Math.max(rmax, Math.hypot(out[m * 2], out[m * 2 + 1]))
  }
  for (let i = 0; i < out.length; i++)
    out[i] /= rmax
  return out
}

/** Closed centripetal Catmull–Rom spline through the points. */
function catmull(ps: ReadonlyArray<readonly [number, number]>, per: number): number[] {
  const n = ps.length
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const p0 = ps[(i - 1 + n) % n]
    const p1 = ps[i]
    const p2 = ps[(i + 1) % n]
    const p3 = ps[(i + 2) % n]
    const d = (a: readonly [number, number], b: readonly [number, number]) => Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5)
    const t0 = 0
    const t1 = t0 + d(p0, p1)
    const t2 = t1 + d(p1, p2)
    const t3 = t2 + d(p2, p3)
    for (let s = 0; s < per; s++) {
      const t = t1 + ((t2 - t1) * s) / per
      const pt = (c: 0 | 1) => {
        const a1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0)
        const a2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1)
        const a3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2)
        const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0)
        const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
        return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)
      }
      out.push(pt(0), pt(1))
    }
  }
  return out
}

/** Share of a grid over the bounding box that lies inside the curve (even–odd rule). */
function fillRatio(pts: number[]): number {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i])
    x1 = Math.max(x1, pts[i])
    y0 = Math.min(y0, pts[i + 1])
    y1 = Math.max(y1, pts[i + 1])
  }
  const G = 16
  const n = pts.length / 2
  let inside = 0
  for (let gy = 0; gy < G; gy++) {
    const y = y0 + ((gy + 0.5) / G) * (y1 - y0)
    for (let gx = 0; gx < G; gx++) {
      const x = x0 + ((gx + 0.5) / G) * (x1 - x0)
      let odd = false
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = pts[i * 2 + 1]
        const yj = pts[j * 2 + 1]
        if ((yi > y) !== (yj > y) && x < pts[j * 2] + ((y - yj) / (yi - yj)) * (pts[i * 2] - pts[j * 2]))
          odd = !odd
      }
      if (odd)
        inside++
    }
  }
  return inside / (G * G)
}

/** Total absolute turning of a closed polyline, in full turns: 1 for any convex loop. */
function turning(pts: number[]): number {
  const n = pts.length / 2
  let sum = 0
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n
    const c = (i + 1) % n
    const a1 = Math.atan2(pts[i * 2 + 1] - pts[a * 2 + 1], pts[i * 2] - pts[a * 2])
    const a2 = Math.atan2(pts[c * 2 + 1] - pts[i * 2 + 1], pts[c * 2] - pts[i * 2])
    let d = a2 - a1
    d -= Math.round(d / TAU) * TAU
    sum += Math.abs(d)
  }
  return sum / TAU
}

/**
 * A symbol-like closed stroke. Strokes that fold back into a bare scribble,
 * or round off into a plain oval, are drawn again, a fixed number of times at
 * most; otherwise the best attempt is kept.
 */
function glyph(r: Rng): number[] {
  let best: number[] = []
  let bestScore = -1
  for (let tries = 0; tries < 8; tries++) {
    const g = glyphOnce(r)
    const fill = fillRatio(g)
    const turn = turning(g)
    if (fill >= 0.25 && turn >= 1.6)
      return g
    const score = Math.min(fill, 0.3) + 0.1 * Math.min(turn, 3)
    if (score > bestScore) {
      best = g
      bestScore = score
    }
  }
  return best
}

/** A closed stroke through a few cells of a 4 × 4 grid. */
function glyphOnce(r: Rng): number[] {
  const n = int(r, 6, 9)
  const cells = Array.from({ length: 16 }, (_, i) => i)
  for (let i = 15; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]]
  }
  const chosen = cells.slice(0, n).map(c => [((c % 4) - 1.5) / 1.5 + range(r, -0.18, 0.18), (Math.floor(c / 4) - 1.5) / 1.5 + range(r, -0.18, 0.18)] as [number, number])
  // Mostly a nearest-neighbour walk (a legible loop), now and then a jump
  // across the glyph, which crosses the stroke.
  const order: Array<[number, number]> = [chosen.shift()!]
  while (chosen.length) {
    const last = order[order.length - 1]
    let best = 0
    if (r() < 0.72) {
      let bd = Infinity
      chosen.forEach((p, i) => {
        const d = Math.hypot(p[0] - last[0], p[1] - last[1])
        if (d < bd) {
          bd = d
          best = i
        }
      })
    }
    else {
      best = Math.floor(r() * chosen.length)
    }
    order.push(chosen.splice(best, 1)[0])
  }
  const out = catmull(order, 48)
  // A glyph squeezed into a sliver reads as a line: open it up to a fair aspect.
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < out.length; i += 2) {
    x0 = Math.min(x0, out[i])
    x1 = Math.max(x1, out[i])
    y0 = Math.min(y0, out[i + 1])
    y1 = Math.max(y1, out[i + 1])
  }
  const w = x1 - x0
  const h = y1 - y0
  const sx = w < 0.6 * h ? (0.6 * h) / w : 1
  const sy = h < 0.6 * w ? (0.6 * w) / h : 1
  for (let i = 0; i < out.length; i += 2) {
    out[i] *= sx
    out[i + 1] *= sy
  }
  return out
}

/** A smooth, wobbly closed outline in polar form, sometimes with a rippled rim. */
function blob(r: Rng): number[] {
  const harm: Array<[number, number, number]> = []
  for (let k = 2; k <= 7; k++)
    harm.push([k, range(r, 0.03, 0.26) / (k - 1) ** 0.55, r() * TAU])
  if (r() < 0.6)
    harm.push([int(r, 11, 23), range(r, 0.025, 0.06), r() * TAU])
  const out: number[] = []
  const N = 720
  for (let i = 0; i < N; i++) {
    const th = (TAU * i) / N
    let rad = 1
    for (const [k, a, p] of harm)
      rad += a * Math.cos(k * th + p)
    rad = Math.max(0.3, rad)
    out.push(rad * Math.cos(th), rad * Math.sin(th))
  }
  return out
}

function polygon(vs: ReadonlyArray<readonly [number, number]>, per: number): number[] {
  const out: number[] = []
  vs.forEach((p, i) => {
    const q = vs[(i + 1) % vs.length]
    for (let s = 0; s < per; s++)
      out.push(p[0] + ((q[0] - p[0]) * s) / per, p[1] + ((q[1] - p[1]) * s) / per)
  })
  return out
}

/** A regular star polygon: its spectrum only holds the frequencies 1 + m·points. */
function star(r: Rng): number[] {
  const points = int(r, 3, 9)
  const inner = range(r, 0.36, 0.74)
  const rot = r() * TAU
  const vs: Array<[number, number]> = []
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? inner : 1
    const th = rot + (Math.PI * i) / points
    vs.push([rad * Math.cos(th), rad * Math.sin(th)])
  }
  return polygon(vs, 60)
}

/** An irregular polygon with sharp corners, like a shard or a stone outline. */
function shard(r: Rng): number[] {
  const n = int(r, 5, 9)
  const gaps = Array.from({ length: n }, () => range(r, 0.45, 1.55))
  const sum = gaps.reduce((s, x) => s + x, 0)
  const rot = r() * TAU
  let th = rot
  const vs: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    const rad = range(r, 0.42, 1)
    vs.push([rad * Math.cos(th), rad * Math.sin(th)])
    th += (TAU * gaps[i]) / sum
  }
  return polygon(vs, 80)
}

const BUILDERS: Record<SubjectKind, (r: Rng) => number[]> = { Glyph: glyph, Blob: blob, Star: star, Shard: shard }

export function makeSubject(kind: SubjectKind, r: Rng): Float64Array {
  return resample(BUILDERS[kind](r), SAMPLES)
}
