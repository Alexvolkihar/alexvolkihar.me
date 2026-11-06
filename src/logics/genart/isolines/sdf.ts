// Signed distance functions in 2D, after Inigo Quilez's articles
// "2D distance functions" (https://iquilezles.org/articles/distfunctions2d/)
// and "smooth minimum" (https://iquilezles.org/articles/smin/).
//
// A figure is an ordered list of primitives, each combined with what came
// before it by a smooth union, a smooth subtraction or a smooth intersection.
// Every coordinate and length is a fraction of the canvas short side, with
// the origin at the centre of the canvas.

export type Kind = 'circle' | 'box' | 'capsule' | 'triangle'
export type Op = 'union' | 'cut' | 'meet'

export interface Prim {
  kind: Kind
  op: Op
  /** Centre (circle, box, triangle) or first end (capsule). */
  x: number
  y: number
  /** Radius (circle, capsule, triangle) or half width (box). */
  r: number
  /** Half height (box) or second end (capsule, with x2). */
  h: number
  x2: number
  y2: number
  /** Corner rounding of a box. */
  round: number
  /** Rotation (box, triangle), stored as cosine and sine. */
  cos: number
  sin: number
  /** When > 0, the shape is hollowed into a shell of this half thickness. */
  onion: number
  /** Smoothing radius of the combination. */
  k: number
  /** Evaluate at (|x|, y): the shape and its mirror image across the vertical axis. */
  mirror: boolean
  /** Bounding circle (set by `bound`): the distance is never below |p - centre| - radius. */
  bx: number
  by: number
  br: number
}

export function prim(kind: Kind, op: Op, x: number, y: number, r: number, extra: Partial<Prim> = {}): Prim {
  return { kind, op, x, y, r, h: r, x2: x, y2: y, round: 0, cos: 1, sin: 0, onion: 0, k: 0, mirror: false, bx: 0, by: 0, br: Infinity, ...extra }
}

/** Fills in each primitive's bounding circle, once the figure is complete. */
export function bound(prims: Prim[]): Prim[] {
  for (const p of prims) {
    let r: number
    if (p.kind === 'capsule') {
      p.bx = (p.x + p.x2) / 2
      p.by = (p.y + p.y2) / 2
      r = Math.hypot(p.x2 - p.x, p.y2 - p.y) / 2 + p.r
    }
    else {
      p.bx = p.x
      p.by = p.y
      r = p.kind === 'box' ? Math.hypot(p.r, p.h) : p.kind === 'triangle' ? 1.2 * p.r : p.r
    }
    p.br = r + p.onion
  }
  return prims
}

export function rotation(angle: number): { cos: number, sin: number } {
  return { cos: Math.cos(angle), sin: Math.sin(angle) }
}

const SQRT3 = Math.sqrt(3)

function distance(p: Prim, px: number, py: number): number {
  let x = (p.mirror ? Math.abs(px) : px) - p.x
  let y = py - p.y
  let d: number
  switch (p.kind) {
    case 'circle':
      d = Math.sqrt(x * x + y * y) - p.r
      break
    case 'box': {
      const rx = Math.abs(p.cos * x + p.sin * y) - p.r + p.round
      const ry = Math.abs(-p.sin * x + p.cos * y) - p.h + p.round
      const ox = Math.max(rx, 0)
      const oy = Math.max(ry, 0)
      d = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(rx, ry), 0) - p.round
      break
    }
    case 'capsule': {
      const bx = p.x2 - p.x
      const by = p.y2 - p.y
      const t = Math.max(0, Math.min(1, (x * bx + y * by) / (bx * bx + by * by)))
      const dx = x - bx * t
      const dy = y - by * t
      d = Math.sqrt(dx * dx + dy * dy) - p.r
      break
    }
    default: {
      // Equilateral triangle of circumradius-ish size r (sdEquilateralTriangle).
      const qx = p.cos * x + p.sin * y
      const qy = -p.sin * x + p.cos * y
      x = Math.abs(qx) - p.r
      y = qy + p.r / SQRT3
      if (x + SQRT3 * y > 0) {
        const nx = (x - SQRT3 * y) / 2
        const ny = (-SQRT3 * x - y) / 2
        x = nx
        y = ny
      }
      x -= Math.max(-2 * p.r, Math.min(0, x))
      const len = Math.sqrt(x * x + y * y)
      d = y < 0 ? len : -len
    }
  }
  if (p.onion > 0)
    d = Math.abs(d) - p.onion
  return d
}

/** Polynomial smooth minimum (quadratic), Quilez. k = 0 is the hard minimum. */
function smin(a: number, b: number, k: number): number {
  if (k <= 0)
    return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

/** The figure's distance at (x, y): the primitives folded left to right. */
export function evalFigure(prims: readonly Prim[], x: number, y: number): number {
  let d = distance(prims[0], x, y)
  for (let i = 1; i < prims.length; i++) {
    const p = prims[i]
    // Skip a primitive that cannot change the result: a union leaves d as it
    // is when the shape is at least k farther, a cut when it is k beyond -d.
    if (p.op !== 'meet') {
      const m = (p.op === 'union' ? d : -d) + p.k + p.br
      const dx = (p.mirror ? Math.abs(x) : x) - p.bx
      const dy = y - p.by
      if (m <= 0 || dx * dx + dy * dy >= m * m)
        continue
    }
    const s = distance(p, x, y)
    if (p.op === 'union')
      d = smin(d, s, p.k)
    else if (p.op === 'cut')
      d = -smin(-d, s, p.k)
    else
      d = -smin(-d, -s, p.k)
  }
  return d
}
