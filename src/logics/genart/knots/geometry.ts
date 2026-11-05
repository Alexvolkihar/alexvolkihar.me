// Shared geometry for the Knots series: a strand is a closed chain of cubic
// Bézier segments, and a crossing is a point where one strand passes over
// another. The grid knotwork (./grid.ts) and the torus knots (./torus.ts)
// both produce these, so a single renderer draws them.

export interface Strand {
  /** 8 numbers per cubic segment: x0 y0 x1 y1 x2 y2 x3 y3, chained end to start. */
  seg: number[]
  /** Index of the strand within its knot, used to pick a colour. */
  colour: number
  /** Body width of the ribbon, in grid units. */
  width: number
}

export interface Crossing {
  x: number
  y: number
  /** Unit direction of the strand that passes over. */
  ox: number
  oy: number
  /** Unit direction of the strand that passes under. */
  ux: number
  uy: number
  /** The over strand, and the index of its segment that starts at the crossing. */
  strand: number
  seg: number
}

export function pushCubic(s: number[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
  s.push(x0, y0, x1, y1, x2, y2, x3, y3)
}

export function pushLine(s: number[], x0: number, y0: number, x1: number, y1: number): void {
  const dx = (x1 - x0) / 3
  const dy = (y1 - y0) / 3
  s.push(x0, y0, x0 + dx, y0 + dy, x1 - dx, y1 - dy, x1, y1)
}

/** Cubic Hermite segment between two points with unit tangents; handles are `k` times the chord. */
export function pushHermite(s: number[], x0: number, y0: number, tx0: number, ty0: number, x1: number, y1: number, tx1: number, ty1: number, k: number): void {
  const h = Math.hypot(x1 - x0, y1 - y0) * k
  s.push(x0, y0, x0 + tx0 * h, y0 + ty0 * h, x1 - tx1 * h, y1 - ty1 * h, x1, y1)
}

/** Adds the whole closed strand to a path. */
export function strandPath(path: Path2D, s: number[]): void {
  path.moveTo(s[0], s[1])
  for (let o = 0; o < s.length; o += 8)
    path.bezierCurveTo(s[o + 2], s[o + 3], s[o + 4], s[o + 5], s[o + 6], s[o + 7])
  path.closePath()
}

const STEPS = 12

function cubicAt(s: number[], o: number, t: number): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [
    a * s[o] + b * s[o + 2] + c * s[o + 4] + d * s[o + 6],
    a * s[o + 1] + b * s[o + 3] + c * s[o + 5] + d * s[o + 7],
  ]
}

/** Cumulative arc length at t = i / STEPS. */
function arcTable(s: number[], o: number): Float64Array {
  const tb = new Float64Array(STEPS + 1)
  let [px, py] = cubicAt(s, o, 0)
  for (let i = 1; i <= STEPS; i++) {
    const [x, y] = cubicAt(s, o, i / STEPS)
    tb[i] = tb[i - 1] + Math.hypot(x - px, y - py)
    px = x
    py = y
  }
  return tb
}

function tAt(tb: Float64Array, len: number): number {
  for (let i = 1; i <= STEPS; i++) {
    if (tb[i] >= len) {
      const span = tb[i] - tb[i - 1]
      const f = span > 0 ? (len - tb[i - 1]) / span : 0
      return (i - 1 + f) / STEPS
    }
  }
  return 1
}

/** Pushes the part of a cubic between t0 and t1 (de Casteljau, twice). */
function split(s: number[], o: number, t0: number, t1: number, out: number[]): void {
  // left part [0, t1]
  const x0 = s[o]
  const y0 = s[o + 1]
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  let ax = lerp(x0, s[o + 2], t1)
  let ay = lerp(y0, s[o + 3], t1)
  const bx = lerp(s[o + 2], s[o + 4], t1)
  const by = lerp(s[o + 3], s[o + 5], t1)
  const cx = lerp(s[o + 4], s[o + 6], t1)
  const cy = lerp(s[o + 5], s[o + 7], t1)
  let dx = lerp(ax, bx, t1)
  let dy = lerp(ay, by, t1)
  const ex = lerp(bx, cx, t1)
  const ey = lerp(by, cy, t1)
  const fx = lerp(dx, ex, t1)
  const fy = lerp(dy, ey, t1)
  if (t0 <= 0) {
    out.push(x0, y0, ax, ay, dx, dy, fx, fy)
    return
  }
  // right part of the left part, from t0 / t1
  const t = t0 / t1
  const gx = lerp(x0, ax, t)
  const gy = lerp(y0, ay, t)
  const hx = lerp(ax, dx, t)
  const hy = lerp(ay, dy, t)
  const ix = lerp(dx, fx, t)
  const iy = lerp(dy, fy, t)
  ax = lerp(gx, hx, t)
  ay = lerp(gy, hy, t)
  dx = lerp(hx, ix, t)
  dy = lerp(hy, iy, t)
  out.push(lerp(ax, dx, t), lerp(ay, dy, t), dx, dy, ix, iy, fx, fy)
}

/**
 * Adds the stretch of a strand that runs `len` before and `len` after the
 * start of segment `at`, as one open sub-path that follows the strand exactly.
 */
export function localPath(path: Path2D, s: number[], at: number, len: number): void {
  const n = s.length / 8
  const back: number[] = []
  let rem = len
  let k = (at - 1 + n) % n
  for (let guard = 0; rem > 1e-9 && guard < n; guard++) {
    const tb = arcTable(s, k * 8)
    const l = tb[STEPS]
    if (l >= rem) {
      split(s, k * 8, tAt(tb, l - rem), 1, back)
      rem = 0
    }
    else {
      split(s, k * 8, 0, 1, back)
      rem -= l
      k = (k - 1 + n) % n
    }
  }
  const fwd: number[] = []
  rem = len
  k = at % n
  for (let guard = 0; rem > 1e-9 && guard < n; guard++) {
    const tb = arcTable(s, k * 8)
    const l = tb[STEPS]
    if (l >= rem) {
      split(s, k * 8, 0, tAt(tb, rem), fwd)
      rem = 0
    }
    else {
      split(s, k * 8, 0, 1, fwd)
      rem -= l
      k = (k + 1) % n
    }
  }
  const last = back.length - 8
  path.moveTo(back[last], back[last + 1])
  for (let o = last; o >= 0; o -= 8)
    path.bezierCurveTo(back[o + 2], back[o + 3], back[o + 4], back[o + 5], back[o + 6], back[o + 7])
  for (let o = 0; o < fwd.length; o += 8)
    path.bezierCurveTo(fwd[o + 2], fwd[o + 3], fwd[o + 4], fwd[o + 5], fwd[o + 6], fwd[o + 7])
}
