// Grating primitives for the "Moiré" series.
//
// Every grating is a periodic family of stripes described in normalised
// units: the canvas centre is the origin and 1 is the canvas short side. The
// caller sets a transform that scales those units to pixels, so a stroke
// width written here (a fraction of the pitch) scales with the canvas and the
// composition is the same at any size.
//
// Each grating is built as one path and painted with one stroke() or fill()
// call: a single paint never composites over itself, so a grating drawn with
// a 'multiply' or 'screen' blend only blends with the gratings below it.

export interface Warp {
  /** Bulge pushes the stripes away from the centre (or pulls them in), twist turns them around it. */
  kind: 'bulge' | 'twist'
  x: number
  y: number
  /** Bulge: relative displacement at the centre (> -1). Twist: rotation in radians at the centre. */
  amount: number
  /** Gaussian radius of the warp. */
  radius: number
}

export type Grating
  = | { kind: 'lines', angle: number, pitch: number, phase: number, warp?: Warp }
    | { kind: 'waves', angle: number, pitch: number, phase: number, amp: number, wavelength: number, wavePhase: number }
    | { kind: 'rings', x: number, y: number, pitch: number, phase: number, squash: number, tilt: number }
    | { kind: 'spokes', x: number, y: number, count: number, turn: number }
    | { kind: 'spiral', x: number, y: number, pitch: number, arms: number, phase: number, hand: number }

/** Half extents of the visible area, in normalised units. */
export interface View { hx: number, hy: number }

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

const TAU = Math.PI * 2

type Point = readonly [number, number]

/**
 * Appends the curve t -> P(t), t0 <= t <= t1, as cubic Béziers through
 * points `step` apart (Hermite segments, tangents by central differences).
 * A few Béziers rasterise much faster than the hundreds of short segments a
 * polyline would need for the same smoothness.
 */
function curve(ctx: Ctx, P: (t: number) => Point, t0: number, t1: number, step: number) {
  const n = Math.max(1, Math.ceil((t1 - t0) / step))
  const h = (t1 - t0) / n
  const e = h * 1e-3
  const tangent = (t: number): Point => {
    const a = P(t - e)
    const b = P(t + e)
    return [(b[0] - a[0]) / (2 * e), (b[1] - a[1]) / (2 * e)]
  }
  let p0 = P(t0)
  let d0 = tangent(t0)
  ctx.moveTo(p0[0], p0[1])
  for (let i = 1; i <= n; i++) {
    const t = t0 + i * h
    const p1 = P(t)
    const d1 = tangent(t)
    ctx.bezierCurveTo(p0[0] + (d0[0] * h) / 3, p0[1] + (d0[1] * h) / 3, p1[0] - (d1[0] * h) / 3, p1[1] - (d1[1] * h) / 3, p1[0], p1[1])
    p0 = p1
    d0 = d1
  }
}

/** Distance from (x, y) to the farthest corner of the view. */
function reach(v: View, x: number, y: number): number {
  return Math.hypot(v.hx + Math.abs(x), v.hy + Math.abs(y))
}

function warpPoint(w: Warp, x: number, y: number): Point {
  const dx = x - w.x
  const dy = y - w.y
  const g = Math.exp(-(dx * dx + dy * dy) / (w.radius * w.radius))
  if (w.kind === 'bulge') {
    const s = 1 + w.amount * g
    return [w.x + dx * s, w.y + dy * s]
  }
  const a = w.amount * g
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [w.x + dx * c - dy * s, w.y + dx * s + dy * c]
}

/**
 * Parallel stripes, straight or bent by a warp. The k-th stripe sits at
 * (k + phase) * pitch along the normal of `angle`.
 */
function linesPath(ctx: Ctx, gr: Extract<Grating, { kind: 'lines' | 'waves' }>, v: View) {
  const dx = Math.cos(gr.angle)
  const dy = Math.sin(gr.angle)
  const nx = -dy
  const ny = dx
  const warp = gr.kind === 'lines' ? gr.warp : undefined
  const amp = gr.kind === 'waves' ? gr.amp : 0
  // a warp or a wave can bring stripes in from outside the view
  const margin = gr.pitch * 2 + amp + (warp ? Math.abs(warp.amount) * warp.radius + 0.05 : 0)
  const across = Math.abs(v.hx * nx) + Math.abs(v.hy * ny) + margin
  const along = Math.abs(v.hx * dx) + Math.abs(v.hy * dy) + margin
  const k0 = Math.floor(-across / gr.pitch - gr.phase)
  const k1 = Math.ceil(across / gr.pitch - gr.phase)
  for (let k = k0; k <= k1; k++) {
    const o = (k + gr.phase) * gr.pitch
    if (gr.kind === 'waves') {
      const w = TAU / gr.wavelength
      curve(ctx, (t) => {
        const off = o + gr.amp * Math.sin(w * t + gr.wavePhase)
        return [t * dx + off * nx, t * dy + off * ny]
      }, -along, along, gr.wavelength / 8)
    }
    else if (warp) {
      curve(ctx, t => warpPoint(warp, t * dx + o * nx, t * dy + o * ny), -along, along, warp.radius / 6)
    }
    else {
      ctx.moveTo(-along * dx + o * nx, -along * dy + o * ny)
      ctx.lineTo(along * dx + o * nx, along * dy + o * ny)
    }
  }
}

/** Concentric rings, optionally squashed into ellipses. */
function ringsPath(ctx: Ctx, gr: Extract<Grating, { kind: 'rings' }>, v: View) {
  const rmax = reach(v, gr.x, gr.y) / gr.squash + gr.pitch
  for (let k = 0; ; k++) {
    const r = (k + gr.phase) * gr.pitch
    if (r > rmax)
      break
    if (r <= 0)
      continue
    ctx.moveTo(gr.x + r * Math.cos(gr.tilt), gr.y + r * Math.sin(gr.tilt))
    ctx.ellipse(gr.x, gr.y, r, r * gr.squash, gr.tilt, 0, TAU)
  }
}

/** Radial wedges around a centre, `duty` of each period inked. */
function spokesPath(ctx: Ctx, gr: Extract<Grating, { kind: 'spokes' }>, v: View, duty: number) {
  const L = reach(v, gr.x, gr.y) + 0.1
  const step = TAU / gr.count
  for (let i = 0; i < gr.count; i++) {
    const a0 = gr.turn + i * step
    const a1 = a0 + duty * step
    ctx.moveTo(gr.x, gr.y)
    ctx.lineTo(gr.x + L * Math.cos(a0), gr.y + L * Math.sin(a0))
    ctx.lineTo(gr.x + L * Math.cos(a1), gr.y + L * Math.sin(a1))
    ctx.closePath()
  }
}

/** Archimedean spiral with `arms` interleaved arms: consecutive turns sit one pitch apart. */
function spiralPath(ctx: Ctx, gr: Extract<Grating, { kind: 'spiral' }>, v: View) {
  const rmax = reach(v, gr.x, gr.y) + gr.pitch
  // r grows by arms * pitch per turn on each arm
  const grow = (gr.arms * gr.pitch) / TAU
  for (let j = 0; j < gr.arms; j++) {
    const r0 = (j + gr.phase) * gr.pitch
    curve(ctx, (th) => {
      const r = r0 + grow * th
      return [gr.x + r * Math.cos(gr.hand * th), gr.y + r * Math.sin(gr.hand * th)]
    }, 0, (rmax - r0) / grow, Math.PI / 6)
  }
}

/** Paints one grating; `duty` is the inked fraction of each period. */
export function drawGrating(ctx: Ctx, gr: Grating, v: View, duty: number, ink: string) {
  ctx.beginPath()
  if (gr.kind === 'spokes') {
    spokesPath(ctx, gr, v, duty)
    ctx.fillStyle = ink
    ctx.fill()
    return
  }
  if (gr.kind === 'lines' || gr.kind === 'waves')
    linesPath(ctx, gr, v)
  else if (gr.kind === 'rings')
    ringsPath(ctx, gr, v)
  else
    spiralPath(ctx, gr, v)
  ctx.lineWidth = duty * gr.pitch
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'bevel'
  ctx.strokeStyle = ink
  ctx.stroke()
}
