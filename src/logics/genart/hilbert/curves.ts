// Space-filling curve generators for the "Hilbert" series.
//
// Every generator walks its curve recursively and asks a `split` predicate,
// at each cell, whether to go one level deeper. A constant predicate gives
// the classic curve of a fixed order; a predicate that reads a density field
// gives an adaptive curve, fine where the field is dense and coarse
// elsewhere, still one unbroken path because consecutive leaves always touch.
//
// All coordinates are in a unit block [0, 1]²; the caller maps them onto the
// canvas. Each leaf emits one point (its centre) and its size, the spacing
// between neighbouring strands of the curve around that point.

/** Should the cell centred on (cx, cy), of side `size`, at `depth`, be subdivided? */
export type Split = (cx: number, cy: number, size: number, depth: number) => boolean

export interface Polyline {
  xs: number[]
  ys: number[]
  /** Local strand spacing at each point, in the same units as xs/ys. */
  ss: number[]
  closed: boolean
}

export function polyline(closed: boolean): Polyline {
  return { xs: [], ys: [], ss: [], closed }
}

function emit(out: Polyline, x: number, y: number, s: number) {
  out.xs.push(x)
  out.ys.push(y)
  out.ss.push(s)
}

/**
 * Hilbert curve (D. Hilbert, 1891) over the square spanned by X = (xi, xj) and
 * Y = (yi, yj) from corner (x0, y0). It enters at that corner and leaves at
 * (x0 + yi, y0 + yj). Basis-vector form of the classic recursive definition.
 */
export function hilbert(out: Polyline, x0: number, y0: number, xi: number, xj: number, yi: number, yj: number, depth: number, split: Split): void {
  const cx = x0 + (xi + yi) / 2
  const cy = y0 + (xj + yj) / 2
  const size = Math.hypot(xi, xj)
  if (!split(cx, cy, size, depth)) {
    emit(out, cx, cy, size)
    return
  }
  const d = depth + 1
  hilbert(out, x0, y0, yi / 2, yj / 2, xi / 2, xj / 2, d, split)
  hilbert(out, x0 + xi / 2, y0 + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2, d, split)
  hilbert(out, x0 + xi / 2 + yi / 2, y0 + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2, yj / 2, d, split)
  hilbert(out, x0 + xi / 2 + yi, y0 + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2, -xj / 2, d, split)
}

/**
 * Moore curve (E. H. Moore, 1900): four Hilbert curves joined into a closed
 * loop around the centre of the unit square.
 */
export function moore(out: Polyline, split: Split): void {
  if (!split(0.5, 0.5, 1, 0)) {
    emit(out, 0.5, 0.5, 1)
    return
  }
  // Each quadrant: entry corner, then the exit direction X (enter -> exit) and the inward side Y.
  // hilbert() leaves at origin + its second vector, so the exit vector goes second.
  hilbert(out, 0.5, 0, -0.5, 0, 0, 0.5, 1, split)
  hilbert(out, 0.5, 0.5, -0.5, 0, 0, 0.5, 1, split)
  hilbert(out, 0.5, 1, 0.5, 0, 0, -0.5, 1, split)
  hilbert(out, 0.5, 0.5, 0.5, 0, 0, -0.5, 1, split)
}

/**
 * Peano curve (G. Peano, 1890) over the square spanned by X and Y from
 * corner (x0, y0): 3 × 3 sub-squares visited column by column in a
 * serpentine, entering at that corner and leaving at the opposite one.
 */
export function peano(out: Polyline, x0: number, y0: number, xi: number, xj: number, yi: number, yj: number, depth: number, split: Split): void {
  const cx = x0 + (xi + yi) / 2
  const cy = y0 + (xj + yj) / 2
  const size = Math.hypot(xi, xj)
  if (!split(cx, cy, size, depth)) {
    emit(out, cx, cy, size)
    return
  }
  const ai = xi / 3
  const aj = xj / 3
  const bi = yi / 3
  const bj = yj / 3
  let k = 0
  for (let i = 0; i < 3; i++) {
    const up = i % 2 === 0
    for (let jj = 0; jj < 3; jj++) {
      const j = up ? jj : 2 - jj
      const sx = k % 2 === 0 ? 1 : -1
      const sy = up ? 1 : -1
      // start corner of this sub-square
      const ox = x0 + i * ai + j * bi + (sx < 0 ? ai : 0) + (sy < 0 ? bi : 0)
      const oy = y0 + i * aj + j * bj + (sx < 0 ? aj : 0) + (sy < 0 ? bj : 0)
      peano(out, ox, oy, sx * ai, sx * aj, sy * bi, sy * bj, depth + 1, split)
      k++
    }
  }
}

/**
 * Sierpinski curve (W. Sierpiński, 1912), built by recursive bisection of
 * right isosceles triangles (the Pólya / Sierpiński–Knopp traversal). The
 * triangle has hypotenuse p -> q and right angle at r; its two halves are
 * visited p-side first. Strand spacing is about a third of the hypotenuse.
 */
function tri(out: Polyline, px: number, py: number, qx: number, qy: number, rx: number, ry: number, depth: number, split: Split): void {
  const cx = (px + qx + rx) / 3
  const cy = (py + qy + ry) / 3
  const hyp = Math.hypot(qx - px, qy - py)
  if (!split(cx, cy, hyp / 2, depth)) {
    emit(out, cx, cy, hyp / 3)
    return
  }
  const mx = (px + qx) / 2
  const my = (py + qy) / 2
  tri(out, px, py, rx, ry, mx, my, depth + 1, split)
  tri(out, rx, ry, qx, qy, mx, my, depth + 1, split)
}

/** Closed Sierpinski curve filling the unit square (two triangles around the diagonal). */
export function sierpinski(out: Polyline, split: Split): void {
  tri(out, 0, 0, 1, 1, 1, 0, 0, split)
  tri(out, 1, 1, 0, 0, 0, 1, 0, split)
}

// ---------------------------------------------------------------------------
// Gosper curve (flowsnake, Bill Gosper 1973, popularised by Martin Gardner in
// 1976). Edge rewriting: each segment, of type A or B, is replaced by seven
// segments 1/√7 as long. Both productions turn as much left as right, so the
// replacement is a fixed pattern in the frame of the segment, and segments
// of different depths still join end to end.
// ---------------------------------------------------------------------------

const GOSPER_RULES = {
  A: 'A-B--B+A++AA+B-',
  B: '+A-BB--B-A++A+B',
} as const

interface Pattern {
  /** Points 1..7 of the replacement in the frame of the segment, p = (0, 0), q = (1, 0). */
  u: number[]
  v: number[]
  types: (0 | 1)[]
}

function pattern(rule: string): Pattern {
  let x = 0
  let y = 0
  let h = 0
  const xs: number[] = []
  const ys: number[] = []
  const types: (0 | 1)[] = []
  for (const c of rule) {
    if (c === '+') {
      h += Math.PI / 3
    }
    else if (c === '-') {
      h -= Math.PI / 3
    }
    else {
      x += Math.cos(h)
      y += Math.sin(h)
      xs.push(x)
      ys.push(y)
      types.push(c === 'A' ? 0 : 1)
    }
  }
  // express in the frame where the endpoint is (1, 0)
  const l2 = x * x + y * y
  const u = xs.map((px, i) => (px * x + ys[i] * y) / l2)
  const v = xs.map((px, i) => (-px * y + ys[i] * x) / l2)
  return { u, v, types }
}

const PATTERNS = [pattern(GOSPER_RULES.A), pattern(GOSPER_RULES.B)] as const

function gosperSeg(out: Polyline, px: number, py: number, qx: number, qy: number, type: 0 | 1, depth: number, split: Split): void {
  const dx = qx - px
  const dy = qy - py
  const len = Math.hypot(dx, dy)
  if (!split((px + qx) / 2, (py + qy) / 2, len, depth)) {
    emit(out, qx, qy, len)
    return
  }
  const pat = PATTERNS[type]
  let ax = px
  let ay = py
  for (let i = 0; i < 7; i++) {
    const bx = px + pat.u[i] * dx - pat.v[i] * dy
    const by = py + pat.u[i] * dy + pat.v[i] * dx
    gosperSeg(out, ax, ay, bx, by, pat.types[i], depth + 1, split)
    ax = bx
    ay = by
  }
}

/** Gosper curve from p to q. */
export function gosper(out: Polyline, px: number, py: number, qx: number, qy: number, split: Split): void {
  const first = out.xs.length
  emit(out, px, py, Math.hypot(qx - px, qy - py))
  gosperSeg(out, px, py, qx, qy, 0, 0, split)
  // the first point takes the spacing of its neighbour
  if (out.ss.length > first + 1)
    out.ss[first] = out.ss[first + 1]
}

/** Placement of a Gosper curve in the unit square: its endpoints p and q. */
export interface GosperFit { px: number, py: number, qx: number, qy: number }

let probe: Polyline | null = null
let baseTurn: number | null = null

function bbox(a: number): [number, number, number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i < probe!.xs.length; i++) {
    const x = probe!.xs[i] * c - probe!.ys[i] * s
    const y = probe!.xs[i] * s + probe!.ys[i] * c
    x0 = Math.min(x0, x)
    x1 = Math.max(x1, x)
    y0 = Math.min(y0, y)
    y1 = Math.max(y1, y)
  }
  return [x0, x1, y0, y1]
}

/**
 * Where to put a flowsnake so that it fills the unit square: the rotation
 * of a level-4 curve whose bounding box is the most square, turned by
 * `extra` more radians, scaled to fit and centred. Pure geometry.
 */
export function gosperFit(extra: number): GosperFit {
  if (!probe) {
    probe = polyline(false)
    gosper(probe, 0, 0, 1, 0, (_x, _y, _s, d) => d < 4)
  }
  if (baseTurn === null) {
    let best = -1
    baseTurn = 0
    for (let k = 0; k < 36; k++) {
      const [x0, x1, y0, y1] = bbox((k * Math.PI) / 36)
      const score = Math.min(x1 - x0, y1 - y0) / Math.max(x1 - x0, y1 - y0)
      if (score > best + 1e-9) {
        best = score
        baseTurn = (k * Math.PI) / 36
      }
    }
  }
  const a = baseTurn + extra
  const [x0, x1, y0, y1] = bbox(a)
  const k = 1 / Math.max(x1 - x0, y1 - y0)
  const ox = 0.5 - ((x0 + x1) / 2) * k
  const oy = 0.5 - ((y0 + y1) / 2) * k
  return { px: ox, py: oy, qx: ox + Math.cos(a) * k, qy: oy + Math.sin(a) * k }
}
