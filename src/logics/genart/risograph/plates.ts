// Drawing on the plates of "Risograph". Each plate is a greyscale canvas
// where white is full ink and black is bare paper; the transform maps the
// central unit square of the composition onto it, so every coordinate below
// is a fraction of the canvas short side.

import type { Rng } from '../random'
import type { Ctx } from './print'

/** Visible extent of the canvas in composition units; the unit square is centred in it. */
export interface Frame { x0: number, y0: number, x1: number, y1: number }

export type Paint = (g: Ctx) => string | CanvasGradient

function grey(d: number) {
  const v = Math.round(Math.min(1, Math.max(0, d)) * 255)
  return `rgb(${v},${v},${v})`
}

export const tone = (d: number): Paint => () => grey(d)

/** A linear ramp of density between two points, with optional extra stops. */
export function ramp(ax: number, ay: number, bx: number, by: number, stops: ReadonlyArray<readonly [number, number]>): Paint {
  return (g) => {
    const gr = g.createLinearGradient(ax, ay, bx, by)
    for (const [t, d] of stops)
      gr.addColorStop(t, grey(d))
    return gr
  }
}

/** A radial ramp from a small circle (highlight) to a large one. */
export function radial(ax: number, ay: number, ar: number, bx: number, by: number, br: number, stops: ReadonlyArray<readonly [number, number]>): Paint {
  return (g) => {
    const gr = g.createRadialGradient(ax, ay, ar, bx, by, br)
    for (const [t, d] of stops)
      gr.addColorStop(t, grey(d))
    return gr
  }
}

export class Plates {
  constructor(readonly gs: Ctx[]) {}

  get K() {
    return this.gs.length
  }

  /** Overprints a shape on plate l. With knock, the shape is cleared from the other plates. */
  fill(l: number, path: Path2D, paint: Paint, knock = false, rule: CanvasFillRule = 'nonzero') {
    if (knock)
      this.clear(path, l, rule)
    const g = this.gs[l]
    g.fillStyle = paint(g)
    g.fill(path, rule)
  }

  /** Adds density without lowering what is already there (a shadow over a tint). */
  darken(l: number, path: Path2D, paint: Paint) {
    const g = this.gs[l]
    g.globalCompositeOperation = 'lighten'
    g.fillStyle = paint(g)
    g.fill(path)
    g.globalCompositeOperation = 'source-over'
  }

  stroke(l: number, path: Path2D, width: number, paint: Paint) {
    const g = this.gs[l]
    g.lineWidth = width
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = paint(g)
    g.stroke(path)
  }

  /** Clears a shape from every plate but `keep` (-1 clears all). */
  clear(path: Path2D, keep = -1, rule: CanvasFillRule = 'nonzero') {
    this.gs.forEach((g, i) => {
      if (i === keep)
        return
      g.fillStyle = '#000'
      g.fill(path, rule)
    })
  }

  /** A line of bare paper cut through plate l (or every plate). */
  cut(l: number, path: Path2D, width: number) {
    this.gs.forEach((g, i) => {
      if (l >= 0 && i !== l)
        return
      g.lineWidth = width
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.strokeStyle = '#000'
      g.stroke(path)
    })
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers.
// ---------------------------------------------------------------------------

/** A local frame: origin, rotation and scale. Maps local (x, y) to the page. */
export function frame(ox: number, oy: number, a: number, s = 1) {
  const c = Math.cos(a) * s
  const n = Math.sin(a) * s
  return (x: number, y: number): [number, number] => [ox + x * c - y * n, oy + x * n + y * c]
}

export type Xf = ReturnType<typeof frame>

export function poly(pts: ReadonlyArray<readonly [number, number]>): Path2D {
  const p = new Path2D()
  pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y))
  p.closePath()
  return p
}

export function rect(x: number, y: number, w: number, h: number): Path2D {
  const p = new Path2D()
  p.rect(x, y, w, h)
  return p
}

export function disc(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D()
  p.arc(cx, cy, r, 0, Math.PI * 2)
  return p
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D()
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2)
  return p
}

/** A leaf along the local x axis, from 0 to len, with a pointed tip. */
export function leaf(T: Xf, len: number, wid: number, belly = 0.4): Path2D {
  const p = new Path2D()
  const a = T(0, 0)
  const c1 = T(len * belly, -wid)
  const tip = T(len, 0)
  const c2 = T(len * belly, wid)
  p.moveTo(a[0], a[1])
  p.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1])
  p.quadraticCurveTo(c2[0], c2[1], a[0], a[1])
  p.closePath()
  return p
}

export function line(T: Xf, pts: ReadonlyArray<readonly [number, number]>): Path2D {
  const p = new Path2D()
  pts.forEach(([x, y], i) => {
    const [X, Y] = T(x, y)
    if (i)
      p.lineTo(X, Y)
    else
      p.moveTo(X, Y)
  })
  return p
}

export function curve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number): Path2D {
  const p = new Path2D()
  p.moveTo(ax, ay)
  p.quadraticCurveTo(cx, cy, bx, by)
  return p
}

/** Point and tangent angle on a quadratic Bézier. */
export function onCurve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number) {
  const u = 1 - t
  const x = u * u * ax + 2 * u * t * cx + t * t * bx
  const y = u * u * ay + 2 * u * t * cy + t * t * by
  const tx = 2 * u * (cx - ax) + 2 * t * (bx - cx)
  const ty = 2 * u * (cy - ay) + 2 * t * (by - cy)
  return { x, y, a: Math.atan2(ty, tx) }
}

/** Smooth 1D value noise with a few octaves, roughly in [-1, 1]. */
export function noise1(r: Rng, octaves = 4) {
  const N = 256
  const v = Float32Array.from({ length: N }, () => r() * 2 - 1)
  const at = (x: number) => {
    const i = Math.floor(x)
    const t = x - i
    const s = t * t * (3 - 2 * t)
    const a = v[i & (N - 1)]
    return a + (v[(i + 1) & (N - 1)] - a) * s
  }
  return (x: number) => {
    let sum = 0
    let amp = 1
    let f = 1
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += at(x * f + o * 17.3) * amp
      norm += amp
      amp *= 0.5
      f *= 2.03
    }
    return sum / norm
  }
}

/** Smooth 2D value noise on an integer-hashed lattice, in [0, 1]. */
export function noise2(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = Float32Array.from({ length: P }, () => r())
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]]
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  const v = (a: number, b: number) => val[perm[perm[a & 255] + (b & 255)]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = x - xi
    const w = y - yi
    const fu = u * u * (3 - 2 * u)
    const fw = w * w * (3 - 2 * w)
    const a = v(xi, yi) + fu * (v(xi + 1, yi) - v(xi, yi))
    const b = v(xi, yi + 1) + fu * (v(xi + 1, yi + 1) - v(xi, yi + 1))
    return a + fw * (b - a)
  }
}
