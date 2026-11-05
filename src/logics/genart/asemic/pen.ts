// Pen model for the "Asemic" series: turns control points into filled ink.
//
// Strokes are sampled as centripetal Catmull-Rom splines (Barry-Goldman
// pyramidal form) or as polylines, in "x-height units", then outlined:
// - Broad nib: the nib is a short segment held at a fixed angle and swept
//   along the path; every step is a parallelogram, so the stroke is thick
//   across the nib and thin along it, with slanted terminals.
// - Fine (pointed pen): a hairline that swells on downstrokes.
// - Brush: pressure that rises at the attack and tapers at the lift.
// Every outline piece is emitted with the same winding, so one non-zero fill
// per stroke is their union. Ink pools are recorded at the ends of strokes
// and filled at the end, so they darken where the pen lifted.
//
// The number of samples depends on the size in pixels, but no random draw
// does: the composition is the same at every size.

export type PenKind = 'Fine' | 'Broad nib' | 'Brush'

export interface Pen {
  kind: PenKind
  /** Half-width at full pressure (Fine, Brush) or half nib length (Broad). */
  base: number
  /** Half-width of a hairline. */
  hair: number
  /** Nib direction, unit vector in glyph space (Broad nib). */
  nx: number
  ny: number
  /** Direction of a downstroke in glyph space (slant aware), unit vector. */
  dx: number
  dy: number
}

/** Maps glyph space (x along the line, y down, in x-height units) to pixels. */
export interface Mapper {
  map: (x: number, y: number) => void
  /** Pixels per x-height unit around abscissa x. */
  scale: (x: number) => number
  /** Output of the last map() call. */
  X: number
  Y: number
}

export class Affine implements Mapper {
  X = 0
  Y = 0
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  k = 1
  /** Origin (px), direction of the baseline (unit), pixels per unit. */
  set(ox: number, oy: number, ux: number, uy: number, px: number): this {
    this.a = ux * px
    this.b = uy * px
    this.c = -uy * px
    this.d = ux * px
    this.e = ox
    this.f = oy
    this.k = px
    return this
  }

  map(x: number, y: number) {
    this.X = this.a * x + this.c * y + this.e
    this.Y = this.b * x + this.d * y + this.f
  }

  scale() {
    return this.k
  }
}

// Reusable sample buffers.
let SX = new Float64Array(4096)
let SY = new Float64Array(4096)
let SW = new Float64Array(4096)
let n = 0

function push(x: number, y: number) {
  if (n >= SX.length) {
    const grow = (a: Float64Array) => {
      const b = new Float64Array(a.length * 2)
      b.set(a)
      return b
    }
    SX = grow(SX)
    SY = grow(SY)
    SW = grow(SW)
  }
  SX[n] = x
  SY[n] = y
  n++
}

function sample(p: number[], smooth: boolean, px: number) {
  n = 0
  const m = p.length / 2
  push(p[0], p[1])
  for (let i = 0; i < m - 1; i++) {
    const x1 = p[i * 2]
    const y1 = p[i * 2 + 1]
    const x2 = p[i * 2 + 2]
    const y2 = p[i * 2 + 3]
    const len = Math.hypot(x2 - x1, y2 - y1) * px
    if (!smooth) {
      const k = Math.min(24, Math.max(1, Math.ceil(len / 7)))
      for (let j = 1; j <= k; j++)
        push(x1 + ((x2 - x1) * j) / k, y1 + ((y2 - y1) * j) / k)
      continue
    }
    // neighbours, extrapolated at the ends
    const x0 = i > 0 ? p[i * 2 - 2] : 2 * x1 - x2
    const y0 = i > 0 ? p[i * 2 - 1] : 2 * y1 - y2
    const x3 = i < m - 2 ? p[i * 2 + 4] : 2 * x2 - x1
    const y3 = i < m - 2 ? p[i * 2 + 5] : 2 * y2 - y1
    const t0 = 0
    const t1 = t0 + Math.max(1e-4, Math.hypot(x1 - x0, y1 - y0) ** 0.5)
    const t2 = t1 + Math.max(1e-4, Math.hypot(x2 - x1, y2 - y1) ** 0.5)
    const t3 = t2 + Math.max(1e-4, Math.hypot(x3 - x2, y3 - y2) ** 0.5)
    const k = Math.min(48, Math.max(2, Math.ceil(len / 2.5)))
    for (let j = 1; j <= k; j++) {
      const t = t1 + ((t2 - t1) * j) / k
      const a1x = ((t1 - t) * x0 + (t - t0) * x1) / (t1 - t0)
      const a1y = ((t1 - t) * y0 + (t - t0) * y1) / (t1 - t0)
      const a2x = ((t2 - t) * x1 + (t - t1) * x2) / (t2 - t1)
      const a2y = ((t2 - t) * y1 + (t - t1) * y2) / (t2 - t1)
      const a3x = ((t3 - t) * x2 + (t - t2) * x3) / (t3 - t2)
      const a3y = ((t3 - t) * y2 + (t - t2) * y3) / (t3 - t2)
      const b1x = ((t2 - t) * a1x + (t - t0) * a2x) / (t2 - t0)
      const b1y = ((t2 - t) * a1y + (t - t0) * a2y) / (t2 - t0)
      const b2x = ((t3 - t) * a2x + (t - t1) * a3x) / (t3 - t1)
      const b2y = ((t3 - t) * a2y + (t - t1) * a3y) / (t3 - t1)
      push(((t2 - t) * b1x + (t - t1) * b2x) / (t2 - t1), ((t2 - t) * b1y + (t - t1) * b2y) / (t2 - t1))
    }
  }
}

/** A quadrilateral, emitted with positive winding whatever its orientation. */
function quad(g: CanvasRenderingContext2D, m: Mapper, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  m.map(ax, ay)
  const Ax = m.X
  const Ay = m.Y
  m.map(bx, by)
  const Bx = m.X
  const By = m.Y
  m.map(cx, cy)
  const Cx = m.X
  const Cy = m.Y
  m.map(dx, dy)
  const Dx = m.X
  const Dy = m.Y
  const area = (Ax * By - Bx * Ay) + (Bx * Cy - Cx * By) + (Cx * Dy - Dx * Cy) + (Dx * Ay - Ax * Dy)
  if (area >= 0) {
    g.moveTo(Ax, Ay)
    g.lineTo(Bx, By)
    g.lineTo(Cx, Cy)
    g.lineTo(Dx, Dy)
  }
  else {
    g.moveTo(Dx, Dy)
    g.lineTo(Cx, Cy)
    g.lineTo(Bx, By)
    g.lineTo(Ax, Ay)
  }
  g.closePath()
}

function disc(g: CanvasRenderingContext2D, X: number, Y: number, R: number) {
  g.moveTo(X + R, Y)
  g.arc(X, Y, R, 0, Math.PI * 2)
}

export class Scribe {
  /** Ink pools, as [x, y, r] triples in pixels, keyed by colour. */
  pools = new Map<string, number[]>()

  constructor(public g: CanvasRenderingContext2D, public pen: Pen) {}

  private pool(fill: string, X: number, Y: number, R: number) {
    let a = this.pools.get(fill)
    if (!a) {
      a = []
      this.pools.set(fill, a)
    }
    a.push(X, Y, R)
  }

  /** Draws one stroke. Returns its length, in x-height units (ink spent). */
  stroke(p: number[], smooth: boolean, m: Mapper, fill: string, alpha: number, pool = 1): number {
    const g = this.g
    const pen = this.pen
    const px = m.scale(p[0])
    sample(p, smooth, px)
    if (n < 2)
      return 0
    // cumulative length
    let L = 0
    for (let i = 1; i < n; i++)
      L += Math.hypot(SX[i] - SX[i - 1], SY[i] - SY[i - 1])
    if (L <= 1e-6)
      return 0

    g.globalAlpha = alpha
    g.fillStyle = fill
    g.beginPath()
    if (pen.kind === 'Broad nib') {
      const nx = pen.nx * pen.base
      const ny = pen.ny * pen.base
      for (let i = 0; i < n - 1; i++) {
        const x0 = SX[i]
        const y0 = SY[i]
        const x1 = SX[i + 1]
        const y1 = SY[i + 1]
        quad(g, m, x0 - nx, y0 - ny, x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny)
        // where the path runs along the nib, keep a hairline
        const sl = Math.hypot(x1 - x0, y1 - y0)
        if (sl > 1e-9 && Math.abs((x1 - x0) * pen.ny - (y1 - y0) * pen.nx) / sl * pen.base < pen.hair) {
          const hx = (-(y1 - y0) / sl) * pen.hair
          const hy = ((x1 - x0) / sl) * pen.hair
          quad(g, m, x0 + hx, y0 + hy, x1 + hx, y1 + hy, x1 - hx, y1 - hy, x0 - hx, y0 - hy)
        }
      }
      g.fill()
      if (pool > 0) {
        m.map(SX[n - 1], SY[n - 1])
        this.pool(fill, m.X, m.Y, pen.base * 0.55 * px * pool)
      }
      return L
    }

    // pressure pens: a width per sample
    let s = 0
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0
      const i1 = i < n - 1 ? i + 1 : n - 1
      let tx = SX[i1] - SX[i0]
      let ty = SY[i1] - SY[i0]
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl
      ty /= tl
      if (i > 0)
        s += Math.hypot(SX[i] - SX[i - 1], SY[i] - SY[i - 1])
      const t = s / L
      const down = Math.max(0, tx * pen.dx + ty * pen.dy)
      let w: number
      if (pen.kind === 'Fine') {
        w = pen.hair + (pen.base - pen.hair) * down * down
      }
      else {
        // attack in the first 6% of the length, lift over the last 30%
        const att = Math.min(1, t / 0.06 + 0.25)
        const lift = Math.min(1, (1 - t) / 0.3 + 0.08)
        w = Math.max(pen.hair, pen.base * att * lift ** 0.8 * (0.45 + 0.55 * down))
      }
      SW[i] = w
    }
    // outline: one quad per step, using per-sample normals
    for (let i = 0; i < n - 1; i++) {
      const ia = i > 0 ? i - 1 : 0
      const ib = i + 2 < n ? i + 2 : n - 1
      let ax = SX[i + 1] - SX[ia]
      let ay = SY[i + 1] - SY[ia]
      let bx = SX[ib] - SX[i]
      let by = SY[ib] - SY[i]
      const al = Math.hypot(ax, ay) || 1
      const bl = Math.hypot(bx, by) || 1
      ax /= al
      ay /= al
      bx /= bl
      by /= bl
      const w0 = SW[i]
      const w1 = SW[i + 1]
      const x0 = SX[i]
      const y0 = SY[i]
      const x1 = SX[i + 1]
      const y1 = SY[i + 1]
      let l0x = x0 - ay * w0
      let l0y = y0 + ax * w0
      let l1x = x1 - by * w1
      let l1y = y1 + bx * w1
      let r0x = x0 + ay * w0
      let r0y = y0 - ax * w0
      let r1x = x1 + by * w1
      let r1y = y1 - bx * w1
      const ex = x1 - x0
      const ey = y1 - y0
      let fold = false
      // on a tight turn the inner side folds back: collapse it on the path
      if ((l1x - l0x) * ex + (l1y - l0y) * ey <= 0) {
        l0x = x0
        l0y = y0
        l1x = x1
        l1y = y1
        fold = true
      }
      if ((r1x - r0x) * ex + (r1y - r0y) * ey <= 0) {
        r0x = x0
        r0y = y0
        r1x = x1
        r1y = y1
        fold = true
      }
      quad(g, m, l0x, l0y, l1x, l1y, r1x, r1y, r0x, r0y)
      // sharp corners (polylines) and folds get a round joint
      if (fold || (i > 0 && ax * bx + ay * by < 0.85)) {
        m.map(x0, y0)
        disc(g, m.X, m.Y, w0 * px)
      }
    }
    m.map(SX[0], SY[0])
    disc(g, m.X, m.Y, SW[0] * px)
    m.map(SX[n - 1], SY[n - 1])
    const X = m.X
    const Y = m.Y
    disc(g, X, Y, SW[n - 1] * px)
    g.fill()
    if (pool > 0)
      this.pool(fill, X, Y, Math.max(SW[n - 1], pen.hair * 2.2) * (pen.kind === 'Brush' ? 1.05 : 1.35) * px * pool)
    return L
  }

  /** A single touch of the pen. */
  dot(x: number, y: number, m: Mapper, fill: string, alpha: number) {
    const pen = this.pen
    if (pen.kind === 'Broad nib') {
      // a short pull across the nib: a small lozenge
      const k = 0.55 * pen.base
      this.stroke([x - pen.ny * k, y + pen.nx * k, x + pen.ny * k, y - pen.nx * k], false, m, fill, alpha, 0.6)
      return
    }
    const g = this.g
    const r = pen.kind === 'Brush' ? pen.base * 0.85 : Math.max(pen.base * 0.7, pen.hair * 3)
    g.globalAlpha = alpha
    g.fillStyle = fill
    g.beginPath()
    m.map(x, y)
    const px = m.scale(x)
    g.ellipse(m.X, m.Y, r * px, r * px * 0.8, 0.6, 0, Math.PI * 2)
    g.fill()
    this.pool(fill, m.X, m.Y, r * px * 0.9)
  }

  /** Fills every recorded pool: ink gathered where the pen stopped. */
  flushPools(alpha: number) {
    const g = this.g
    g.globalAlpha = alpha
    for (const [fill, a] of this.pools) {
      g.fillStyle = fill
      g.beginPath()
      for (let i = 0; i < a.length; i += 3)
        disc(g, a[i], a[i + 1], a[i + 2])
      g.fill()
    }
    this.pools.clear()
    g.globalAlpha = 1
  }
}
