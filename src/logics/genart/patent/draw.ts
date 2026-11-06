// Pen primitives for the patent sheets: outlines filled with the paper colour
// (so nearer parts hide farther ones), section hatching clipped to a shape,
// and the heavy "shade lines" of patent-office drafting, drawn on the edges
// that face away from a light falling from the upper left.

import type { Pts } from './geom'

export type Shading = 'Outline' | 'Hatched' | 'Cross-hatched'

export interface View {
  g: CanvasRenderingContext2D
  /** Model unit to pixels, and the model origin on the canvas. */
  s: number
  ox: number
  oy: number
  /** Canvas short side: every pen width is a fraction of it. */
  S: number
  ink: string
  bg: string
  accent: string
  shading: Shading
  /** Base outline width in pixels. */
  lw: number
}

export const TAU = Math.PI * 2

export const sx = (v: View, x: number) => v.ox + x * v.s
export const sy = (v: View, y: number) => v.oy + y * v.s

/** Adds a closed polygon (model units, offset by cx, cy) to the current path. */
export function poly(v: View, p: Pts, cx = 0, cy = 0, close = true) {
  const g = v.g
  g.moveTo(sx(v, p[0] + cx), sy(v, p[1] + cy))
  for (let i = 2; i < p.length; i += 2)
    g.lineTo(sx(v, p[i] + cx), sy(v, p[i + 1] + cy))
  if (close)
    g.closePath()
}

export function circ(v: View, x: number, y: number, r: number) {
  v.g.moveTo(sx(v, x + r), sy(v, y))
  v.g.arc(sx(v, x), sy(v, y), Math.max(0.01, r * v.s), 0, TAU)
}

export function line(v: View, ax: number, ay: number, bx: number, by: number) {
  v.g.moveTo(sx(v, ax), sy(v, ay))
  v.g.lineTo(sx(v, bx), sy(v, by))
}

export interface FS {
  fill?: string | null
  stroke?: string | null
  lw?: number
  rule?: CanvasFillRule
  dash?: number[]
}

/** Builds a path once, fills it (paper by default) and strokes it (ink). */
export function fs(v: View, build: () => void, o: FS = {}) {
  const g = v.g
  g.beginPath()
  build()
  const fill = o.fill === undefined ? v.bg : o.fill
  if (fill) {
    g.fillStyle = fill
    g.fill(o.rule ?? 'nonzero')
  }
  const stroke = o.stroke === undefined ? v.ink : o.stroke
  if (stroke) {
    g.strokeStyle = stroke
    g.lineWidth = o.lw ?? v.lw
    if (o.dash)
      g.setLineDash(o.dash.map(d => d * v.S))
    g.stroke()
    if (o.dash)
      g.setLineDash([])
  }
}

/** Dashed stroke, dash lengths as fractions of the short side. */
export function dashed(v: View, build: () => void, dash: number[], lw = v.lw * 0.7, color = v.ink) {
  fs(v, build, { fill: null, stroke: color, lw, dash })
}

/**
 * Shade line: the part of a closed outline whose outward side faces the lower
 * right (or the upper left, for the inner edge of a hole) is redrawn heavier.
 */
export function shadePts(v: View, p: Pts, cx: number, cy: number, hole = false, k = 2.3) {
  const g = v.g
  const n = p.length / 2
  // centroid of the outline itself, so off-centre shapes shade correctly
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += p[i * 2] / n
    my += p[i * 2 + 1] / n
  }
  const sgn = hole ? -1 : 1
  const on = (i: number) => sgn * ((p[i * 2] - mx) + (p[i * 2 + 1] - my)) > 0
  g.beginPath()
  let pen = false
  for (let j = 0; j <= n; j++) {
    const i = j % n
    if (on(i)) {
      const x = sx(v, p[i * 2] + cx)
      const y = sy(v, p[i * 2 + 1] + cy)
      if (pen)
        g.lineTo(x, y)
      else
        g.moveTo(x, y)
      pen = true
    }
    else {
      pen = false
    }
  }
  g.strokeStyle = v.ink
  g.lineWidth = v.lw * k
  g.stroke()
}

export function shadeCircle(v: View, x: number, y: number, r: number, hole = false, k = 2.3) {
  const g = v.g
  const a0 = hole ? Math.PI * 0.75 : -Math.PI * 0.25
  g.beginPath()
  g.arc(sx(v, x), sy(v, y), Math.max(0.01, r * v.s), a0, a0 + Math.PI)
  g.strokeStyle = v.ink
  g.lineWidth = v.lw * k
  g.stroke()
}

/**
 * Parallel hatching clipped to a path. bbox in model units, angle in
 * radians, gap as a fraction of the short side.
 */
export function hatch(v: View, build: () => void, bx0: number, by0: number, bx1: number, by1: number, angle: number, gap: number, o: { rule?: CanvasFillRule, lw?: number, color?: string } = {}) {
  const g = v.g
  g.save()
  g.beginPath()
  build()
  g.clip(o.rule ?? 'nonzero')
  const x0 = sx(v, bx0)
  const y0 = sy(v, by0)
  const x1 = sx(v, bx1)
  const y1 = sy(v, by1)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const half = Math.hypot(x1 - x0, y1 - y0) / 2 + 2
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const step = Math.max(1.2, gap * v.S)
  g.beginPath()
  for (let t = -half; t <= half; t += step) {
    const px = cx - dy * t
    const py = cy + dx * t
    g.moveTo(px - dx * half, py - dy * half)
    g.lineTo(px + dx * half, py + dy * half)
  }
  g.strokeStyle = o.color ?? v.ink
  g.lineWidth = o.lw ?? v.lw * 0.45
  g.stroke()
  g.restore()
}

/** Hatch angle and density for a "section" surface, by shading trait. */
export function sectionHatch(v: View, build: () => void, b: [number, number, number, number], dir = 1, rule: CanvasFillRule = 'nonzero', dense = 1) {
  if (v.shading === 'Outline')
    return
  hatch(v, build, b[0], b[1], b[2], b[3], dir * Math.PI / 4, 0.0062 / dense, { rule })
  if (v.shading === 'Cross-hatched')
    hatch(v, build, b[0], b[1], b[2], b[3], -dir * Math.PI / 4, 0.0062 / dense, { rule })
}

// --- wheels seen face on ------------------------------------------------------

export interface Wheel {
  outline: Pts
  /** Root (or rim) radius, inside which the web or spokes live. */
  rRoot: number
  hubR: number
  boreR: number
  spokes?: number
  /** Spoke half width, model units. */
  spokeW?: number
  /** Twist of curved spokes, radians from hub to rim. */
  twist?: number
  /** Lightening holes in a solid web. */
  holes?: number
  /** Extra concentric rings (stepped pulley, barrel cover...). */
  rings?: number[]
  /** Angle of the first spoke. */
  rot?: number
}

/** Window between two spokes, as a polygon. */
function windowPts(a0: number, a1: number, r1: number, r2: number, w: number, twist: number): Pts {
  const out: Pts = []
  const N = 10
  const side = (rho: number) => Math.asin(Math.min(0.95, w / rho))
  const bend = (rho: number) => twist * (rho - r1) / (r2 - r1)
  // inner arc
  const i0 = a0 + side(r1)
  const i1 = a1 - side(r1)
  if (i1 <= i0)
    return out
  for (let k = 0; k <= N; k++) {
    const a = i0 + (i1 - i0) * k / N
    out.push(r1 * Math.cos(a), r1 * Math.sin(a))
  }
  for (let k = 1; k <= N; k++) {
    const rho = r1 + (r2 - r1) * k / N
    const a = a1 - side(rho) + bend(rho)
    out.push(rho * Math.cos(a), rho * Math.sin(a))
  }
  const o0 = a0 + side(r2) + bend(r2)
  const o1 = a1 - side(r2) + bend(r2)
  for (let k = 1; k <= N; k++) {
    const a = o1 + (o0 - o1) * k / N
    out.push(r2 * Math.cos(a), r2 * Math.sin(a))
  }
  for (let k = N - 1; k >= 1; k--) {
    const rho = r1 + (r2 - r1) * k / N
    const a = a0 + side(rho) + bend(rho)
    out.push(rho * Math.cos(a), rho * Math.sin(a))
  }
  return out
}

export function wheelWindows(w: Wheel): Pts[] {
  const out: Pts[] = []
  if (w.spokes) {
    const rim = w.rRoot * 0.86
    const r1 = w.hubR * 1.25
    if (rim - r1 > w.rRoot * 0.12) {
      for (let k = 0; k < w.spokes; k++) {
        const a0 = (w.rot ?? 0) + k * TAU / w.spokes
        const a1 = a0 + TAU / w.spokes
        const p = windowPts(a0, a1, r1, rim, w.spokeW ?? w.rRoot * 0.07, w.twist ?? 0)
        if (p.length)
          out.push(p)
      }
    }
  }
  else if (w.holes) {
    const rr = (w.rRoot * 0.78 + w.hubR * 1.3) / 2
    const hr = Math.min((w.rRoot * 0.78 - w.hubR * 1.3) / 2 * 0.8, rr * Math.sin(Math.PI / w.holes) * 0.7)
    if (hr > 0) {
      for (let k = 0; k < w.holes; k++) {
        const a = (w.rot ?? 0) + k * TAU / w.holes
        const p: Pts = []
        for (let i = 0; i < 24; i++) {
          const b = i * TAU / 24
          p.push(rr * Math.cos(a) + hr * Math.cos(b), rr * Math.sin(a) + hr * Math.sin(b))
        }
        out.push(p)
      }
    }
  }
  return out
}

/** A gear, pulley, flywheel or ratchet seen along its axis, centred at (x, y). */
export function drawWheel(v: View, x: number, y: number, w: Wheel, hatchDir = 1) {
  const wins = wheelWindows(w)
  const body = () => {
    poly(v, w.outline, x, y)
    for (const p of wins)
      poly(v, p, x, y)
  }
  const R = w.rRoot * 1.2
  // paper fill with the windows left open, so the frame shows through
  fs(v, body, { rule: 'evenodd', stroke: null })
  // hub in section; the rim or web gets the cross direction when cross-hatched
  const hub = () => {
    circ(v, x, y, w.hubR)
    circ(v, x, y, w.boreR)
  }
  if (v.shading !== 'Outline')
    hatch(v, hub, x - w.hubR, y - w.hubR, x + w.hubR, y + w.hubR, hatchDir * Math.PI / 4, 0.0055, { rule: 'evenodd' })
  if (v.shading !== 'Outline' && w.rRoot * v.s > 0.03 * v.S) {
    const rimIn = w.spokes ? w.rRoot * 0.86 : w.rRoot * 0.78
    const band = () => {
      circ(v, x, y, w.rRoot * 0.97)
      circ(v, x, y, rimIn)
    }
    hatch(v, band, x - R, y - R, x + R, y + R, -hatchDir * Math.PI / 4, v.shading === 'Hatched' ? 0.011 : 0.0075, { rule: 'evenodd', lw: v.lw * 0.35 })
  }
  v.g.beginPath()
  body()
  circ(v, x, y, w.hubR)
  if (!w.spokes)
    circ(v, x, y, w.rRoot * 0.78)
  for (const r of w.rings ?? [])
    circ(v, x, y, r)
  v.g.strokeStyle = v.ink
  v.g.lineWidth = v.lw
  v.g.stroke()
  shadePts(v, w.outline, x, y)
  for (const p of wins)
    shadePts(v, p, x, y, true, 1.9)
  shadeCircle(v, x, y, w.hubR, false, 1.8)
  // shaft end, cut: solid ink with its keyway
  fs(v, () => circ(v, x, y, w.boreR), { fill: v.ink, stroke: null })
  const k = w.boreR * 0.32
  fs(v, () => {
    const g = v.g
    g.rect(sx(v, x - k / 2), sy(v, y - w.boreR - k * 0.2), k * v.s, k * 1.2 * v.s)
  }, { stroke: null })
}

// --- linear parts ---------------------------------------------------------

/** Rod or link from a to b, half width w, filled and outlined, with rounded or square ends. */
export function rodPts(ax: number, ay: number, bx: number, by: number, wa: number, wb = wa, round = true): Pts {
  const a = Math.atan2(by - ay, bx - ax)
  const nx = -Math.sin(a)
  const ny = Math.cos(a)
  const out: Pts = []
  if (round) {
    for (let k = 0; k <= 10; k++) {
      const t = a + Math.PI / 2 + Math.PI * k / 10
      out.push(ax + wa * Math.cos(t), ay + wa * Math.sin(t))
    }
    for (let k = 0; k <= 10; k++) {
      const t = a - Math.PI / 2 + Math.PI * k / 10
      out.push(bx + wb * Math.cos(t), by + wb * Math.sin(t))
    }
  }
  else {
    out.push(ax + nx * wa, ay + ny * wa, ax - nx * wa, ay - ny * wa, bx - nx * wb, by - ny * wb, bx + nx * wb, by + ny * wb)
  }
  return out
}

export function drawRod(v: View, p: Pts, eyes: [number, number, number][] = []) {
  fs(v, () => poly(v, p))
  shadePts(v, p, 0, 0, false, 1.9)
  for (const [x, y, r] of eyes) {
    fs(v, () => circ(v, x, y, r))
    fs(v, () => circ(v, x, y, r * 0.45), { fill: v.ink, stroke: null })
  }
}

/** Rectangle polygon centred at (cx, cy), rotated by a. */
export function boxPts(cx: number, cy: number, hw: number, hh: number, a = 0): Pts {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const out: Pts = []
  for (const [u, w] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]])
    out.push(cx + u * c - w * s, cy + u * s + w * c)
  return out
}

/** Block in section: paper fill, hatching, outline and shade line. */
export function drawBlock(v: View, p: Pts, dir = 1, dense = 1) {
  fs(v, () => poly(v, p), { stroke: null })
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < p.length; i += 2) {
    x0 = Math.min(x0, p[i])
    x1 = Math.max(x1, p[i])
    y0 = Math.min(y0, p[i + 1])
    y1 = Math.max(y1, p[i + 1])
  }
  sectionHatch(v, () => poly(v, p), [x0, y0, x1, y1], dir, 'nonzero', dense)
  fs(v, () => poly(v, p), { fill: null })
  shadePts(v, p, 0, 0)
}

/**
 * Helical spring seen from the side along a -> b, coil radius r. The back
 * half of each turn is thin, the front half carries the pen weight.
 */
export function drawSpring(v: View, ax: number, ay: number, bx: number, by: number, r: number, turns: number) {
  const dx = bx - ax
  const dy = by - ay
  const L = Math.hypot(dx, dy)
  const ux = dx / L
  const uy = dy / L
  const nx = -uy
  const ny = ux
  const g = v.g
  const N = Math.ceil(turns * 16)
  const pt = (t: number): [number, number] => {
    const along = (t / N) * L
    const ang = (t / N) * turns * TAU
    // a slight lead makes the side view read as a helix
    const off = Math.cos(ang) * r
    const lead = Math.sin(ang) * r * 0.32
    return [ax + ux * (along + lead) + nx * off, ay + uy * (along + lead) + ny * off]
  }
  for (const front of [false, true]) {
    g.beginPath()
    let pen = false
    for (let t = 0; t <= N; t++) {
      const ang = (t / N) * turns * TAU
      const isFront = Math.sin(ang) >= 0
      const [x, y] = pt(t)
      if (isFront === front) {
        if (pen)
          g.lineTo(sx(v, x), sy(v, y))
        else
          g.moveTo(sx(v, x), sy(v, y))
        pen = true
      }
      else {
        if (pen)
          g.lineTo(sx(v, x), sy(v, y))
        pen = false
      }
    }
    g.strokeStyle = v.ink
    g.lineWidth = front ? v.lw * 1.5 : v.lw * 0.6
    g.stroke()
  }
}

/** Flat spiral (mainspring, hairspring): Archimedean, from r0 to r1. */
export function drawSpiral(v: View, x: number, y: number, r0: number, r1: number, turns: number, rot: number, lw = v.lw) {
  const g = v.g
  const N = Math.ceil(turns * 40)
  g.beginPath()
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const a = rot + t * turns * TAU
    const r = r0 + (r1 - r0) * t
    const px = sx(v, x + r * Math.cos(a))
    const py = sy(v, y + r * Math.sin(a))
    if (i)
      g.lineTo(px, py)
    else
      g.moveTo(px, py)
  }
  g.strokeStyle = v.ink
  g.lineWidth = lw
  g.stroke()
}

/** Hexagon bolt head seen end on. */
export function drawBolt(v: View, x: number, y: number, r: number, rot = 0) {
  const p: Pts = []
  for (let k = 0; k < 6; k++)
    p.push(r * Math.cos(rot + k * TAU / 6), r * Math.sin(rot + k * TAU / 6))
  fs(v, () => poly(v, p, x, y), { lw: v.lw * 0.8 })
  fs(v, () => circ(v, x, y, r * 0.62), { fill: null, lw: v.lw * 0.55 })
  shadePts(v, p, x, y, false, 1.6)
}

/** Curved rotation arrow around (x, y). */
export function drawArrow(v: View, x: number, y: number, r: number, a0: number, sweep: number) {
  const g = v.g
  g.beginPath()
  g.arc(sx(v, x), sy(v, y), r * v.s, a0, a0 + sweep, sweep < 0)
  g.strokeStyle = v.ink
  g.lineWidth = v.lw * 0.8
  g.stroke()
  const a = a0 + sweep
  const tx = x + r * Math.cos(a)
  const ty = y + r * Math.sin(a)
  const dir = sweep > 0 ? 1 : -1
  const tanx = -Math.sin(a) * dir
  const tany = Math.cos(a) * dir
  const h = 0.014 * v.S / v.s
  const nx = -tany
  const ny = tanx
  g.beginPath()
  g.moveTo(sx(v, tx + tanx * h), sy(v, ty + tany * h))
  g.lineTo(sx(v, tx + nx * h * 0.38), sy(v, ty + ny * h * 0.38))
  g.lineTo(sx(v, tx - nx * h * 0.38), sy(v, ty - ny * h * 0.38))
  g.closePath()
  g.fillStyle = v.ink
  g.fill()
}
