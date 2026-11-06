// "Epicycles" — a closed curve taken apart into a Fourier series and drawn
// back by a chain of rotating circles.
//
// A curve is built from the hash: a symbol-like stroke, a wobbly outline, a
// star or an irregular shard (see ../epicycles/subjects.ts). Its complex
// Fourier coefficients (../epicycles/fourier.ts) become circles: each turns at
// its own whole number of revolutions and carries the next one on its rim, and
// the last arm holds the pen. Only some of the terms are kept, either the
// largest circles or the lowest frequencies, so the redrawn line is an
// approximation that rounds the corners and ripples next to them (the Gibbs
// phenomenon).
//
// The plate shows the machine frozen at one moment with the line half drawn,
// at several moments overlaid like a stroboscope, a fan of the partial sums
// with 1, 2, 4, 8... terms, a table of nine partial sums, or two real chains
// that drive the pen along x and y, as on a harmonic synthesiser.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { Box, Term } from '../epicycles/fourier'
import type { SubjectKind } from '../epicycles/subjects'
import type { Rng } from '../random'
import type { Series } from '../types'
import { boxOfChain, boxOfPoints, dft, emptyBox, joints, realTerms, select, synth } from '../epicycles/fourier'
import { makeSubject } from '../epicycles/subjects'
import { int, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Ink', 26], ['Chalkboard', 22], ['Blueprint', 20], ['Vellum', 18], ['Orrery', 14]],
  Subject: [['Glyph', 32], ['Blob', 26], ['Star', 24], ['Shard', 18]],
  Plate: [['Chain', 30], ['Fan', 24], ['Strobe', 18], ['Table', 14], ['Axes', 14]],
  Terms: [['Few', 25], ['Some', 45], ['Many', 30]],
  Order: [['By amplitude', 62], ['By frequency', 38]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Subject: weighted(r, TRAITS.Subject),
    Plate: weighted(r, TRAITS.Plate),
    Terms: weighted(r, TRAITS.Terms),
    Order: weighted(r, TRAITS.Order),
  }
}

interface Palette {
  bg: string
  /** The redrawn line and the arms. */
  ink: string
  /** Circles, frames, construction lines. */
  mid: string
  /** The pen, the target outline, one chain of a strobe. */
  accent: string
  grain: string
  edge: string
  dark: boolean
  /** Chalk dust eats into the strokes. */
  chalk: boolean
  /** Drafting grid colour, or null. */
  grid: string | null
}

const PAL: Record<Features['Palette'], Palette> = {
  Ink: { bg: '#f1ece0', ink: '#1d1c1a', mid: '#6f685b', accent: '#b5392b', grain: '#8a7e68', edge: '#b9a98a', dark: false, chalk: false, grid: null },
  Chalkboard: { bg: '#29322c', ink: '#eceadf', mid: '#a9b4aa', accent: '#f2cf63', grain: '#56625a', edge: '#121714', dark: true, chalk: true, grid: null },
  Blueprint: { bg: '#1a4877', ink: '#f0f6fb', mid: '#a3c8ea', accent: '#ffd27a', grain: '#0e2c4d', edge: '#0a2140', dark: true, chalk: false, grid: '#cfe2f4' },
  Vellum: { bg: '#ead8b4', ink: '#3b2414', mid: '#8a6440', accent: '#2c5f6e', grain: '#9c7f55', edge: '#a77f4c', dark: false, chalk: false, grid: null },
  Orrery: { bg: '#111319', ink: '#e7c47a', mid: '#8a7c5c', accent: '#eae4d2', grain: '#2a2b33', edge: '#000000', dark: true, chalk: false, grid: null },
}

/** Number of terms kept, drawn from the "plate" stream. */
const TERMS: Record<Features['Terms'], readonly [number, number]> = {
  Few: [9, 12],
  Some: [20, 32],
  Many: [60, 100],
}

/** Highest frequency of the analysis. */
const KMAX = 128
/** Samples of a redrawn line per revolution, whatever the canvas size. */
const T = 2048
const TAU = Math.PI * 2

/** Line widths, as fractions of the short side. */
const LW = { curve: 0.0026, arm: 0.0015, circle: 0.001, fine: 0.0007 }
/** Circles smaller than this (short side = 1) are left out: only their arm is drawn. */
const MIN_CIRCLE = 0.0016

function hexRgb(h: string): [number, number, number] {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: string, b: string, u: number): string {
  const p = hexRgb(a)
  const q = hexRgb(b)
  const c = p.map((v, i) => Math.round(v + (q[i] - v) * u))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/** Maps curve units to canvas pixels: origin at (ox, oy) and scale k, both in short sides from the centre. */
interface View { X: (x: number) => number, Y: (y: number) => number, k: number }

function makeView(W: number, H: number, S: number, ox: number, oy: number, k: number): View {
  return { X: x => W / 2 + S * (ox + k * x), Y: y => H / 2 + S * (oy + k * y), k: k * S }
}

/** Centres a box of curve units in the canvas centre, its larger side `size` short sides long. */
function fit(W: number, H: number, S: number, b: Box, size: number): View {
  const k = size / Math.max(b.x1 - b.x0, b.y1 - b.y0)
  return makeView(W, H, S, -k * (b.x0 + b.x1) / 2, -k * (b.y0 + b.y1) / 2, k)
}

function path(g: CanvasRenderingContext2D, pts: Float64Array, v: View, from = 0, to = pts.length / 2, closed = true) {
  const n = pts.length / 2
  g.beginPath()
  g.moveTo(v.X(pts[(from % n) * 2]), v.Y(pts[(from % n) * 2 + 1]))
  for (let i = from + 1; i <= to; i++)
    g.lineTo(v.X(pts[(i % n) * 2]), v.Y(pts[(i % n) * 2 + 1]))
  if (closed && from === 0 && to >= n)
    g.closePath()
}

interface ChainStyle {
  circle: string
  arm: string
  circleAlpha: number
  armAlpha: number
  /** Rotation of the whole chain (π/2 turns a real chain upright). */
  turn?: number
  /** Width multiplier. */
  weight?: number
}

/** Draws the chain frozen at time t from anchor (0, 0) of the view. Returns the tip, in curve units. */
function drawChain(g: CanvasRenderingContext2D, v: View, S: number, terms: readonly Term[], t: number, st: ChainStyle): [number, number] {
  const j = joints(terms, t)
  const c = Math.cos(st.turn ?? 0)
  const s = Math.sin(st.turn ?? 0)
  const at = (i: number): [number, number] => [j[i * 2] * c - j[i * 2 + 1] * s, j[i * 2] * s + j[i * 2 + 1] * c]
  const w = st.weight ?? 1

  g.strokeStyle = st.circle
  g.globalAlpha = st.circleAlpha
  g.lineWidth = LW.circle * S * w
  g.beginPath()
  terms.forEach((term, i) => {
    if (term.r * v.k < MIN_CIRCLE * S)
      return
    const [x, y] = at(i)
    g.moveTo(v.X(x) + term.r * v.k, v.Y(y))
    g.arc(v.X(x), v.Y(y), term.r * v.k, 0, TAU)
  })
  g.stroke()

  g.strokeStyle = st.arm
  g.globalAlpha = st.armAlpha
  g.lineWidth = LW.arm * S * w
  g.beginPath()
  g.moveTo(v.X(0), v.Y(0))
  for (let i = 1; i <= terms.length; i++) {
    const [x, y] = at(i)
    g.lineTo(v.X(x), v.Y(y))
  }
  g.stroke()

  // Pivots, shrinking down the chain.
  g.fillStyle = st.arm
  g.beginPath()
  for (let i = 0; i < terms.length; i++) {
    const [x, y] = at(i)
    const rad = S * w * Math.max(0.0011, 0.0034 * 0.86 ** i)
    g.moveTo(v.X(x) + rad, v.Y(y))
    g.arc(v.X(x), v.Y(y), rad, 0, TAU)
  }
  g.fill()
  return at(terms.length)
}

/** A graduated scale on the deferent (the first, largest circle): 120 ticks, every tenth one long. */
function deferentScale(g: CanvasRenderingContext2D, v: View, S: number, pal: Palette, terms: readonly Term[]) {
  // Only a circle large enough to carry the scale gets one.
  if (!terms.length || terms[0].r * v.k < S * 0.12)
    return
  const R = terms[0].r * v.k
  const x = v.X(0)
  const y = v.Y(0)
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.75
  g.lineWidth = LW.fine * S
  g.beginPath()
  for (let i = 0; i < 120; i++) {
    const a = (TAU * i) / 120
    const l = S * (i % 10 === 0 ? 0.014 : i % 5 === 0 ? 0.009 : 0.005)
    g.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R)
    g.lineTo(x + Math.cos(a) * (R - l), y + Math.sin(a) * (R - l))
  }
  g.stroke()
}

function penMark(g: CanvasRenderingContext2D, x: number, y: number, S: number, color: string) {
  g.strokeStyle = color
  g.fillStyle = color
  g.globalAlpha = 1
  g.lineWidth = LW.arm * S
  g.beginPath()
  g.arc(x, y, S * 0.009, 0, TAU)
  g.stroke()
  g.beginPath()
  g.arc(x, y, S * 0.0032, 0, TAU)
  g.fill()
}

function crosshair(g: CanvasRenderingContext2D, x: number, y: number, S: number, color: string, alpha: number) {
  const a = S * 0.014
  g.strokeStyle = color
  g.globalAlpha = alpha
  g.lineWidth = LW.fine * S
  g.beginPath()
  g.moveTo(x - a, y)
  g.lineTo(x + a, y)
  g.moveTo(x, y - a)
  g.lineTo(x, y + a)
  g.moveTo(x + a * 0.45, y)
  g.arc(x, y, a * 0.45, 0, TAU)
  g.stroke()
}

/** The redrawn line up to sample `upto`, solid, and the rest of it dotted. */
function tracedLine(g: CanvasRenderingContext2D, v: View, S: number, pal: Palette, pts: Float64Array, upto: number) {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (upto < T) {
    g.strokeStyle = pal.mid
    g.globalAlpha = 0.75
    g.lineWidth = LW.fine * S * 1.4
    g.setLineDash([S * 0.0012, S * 0.0075])
    path(g, pts, v, upto, T, false)
    g.stroke()
    g.setLineDash([])
  }
  g.strokeStyle = pal.ink
  g.globalAlpha = 1
  g.lineWidth = LW.curve * S
  path(g, pts, v, 0, upto, true)
  g.stroke()
  // Equal steps of time along the drawn part, like the hours of an orbit.
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.85
  g.lineWidth = LW.fine * S
  g.beginPath()
  const step = T / 64
  for (let i = step; i < upto; i += step) {
    const a = (i - 1) * 2
    const b = (i + 1) * 2
    const dx = pts[b] - pts[a]
    const dy = pts[b + 1] - pts[a + 1]
    const l = Math.hypot(dx, dy) || 1
    const L = S * 0.006
    const x = v.X(pts[i * 2])
    const y = v.Y(pts[i * 2 + 1])
    g.moveTo(x - (dy / l) * L, y + (dx / l) * L)
    g.lineTo(x + (dy / l) * L, y - (dx / l) * L)
  }
  g.stroke()
}

/** A count written in tally marks (groups of five), from (x, y) towards the right. */
function tally(g: CanvasRenderingContext2D, x: number, y: number, n: number, unit: number) {
  const h = unit * 2.6
  g.beginPath()
  for (let i = 0; i < n; i++) {
    const grp = Math.floor(i / 5)
    const k = i % 5
    const gx = x + grp * unit * 6
    if (k < 4) {
      g.moveTo(gx + k * unit, y)
      g.lineTo(gx + k * unit, y - h)
    }
    else {
      g.moveTo(gx - unit * 0.6, y - h * 0.2)
      g.lineTo(gx + unit * 3.6, y - h * 0.8)
    }
  }
  g.stroke()
}

/** Time of a sample index, so that a chain tip lands exactly on a drawn sample. */
const timeOf = (i: number) => (TAU * i) / T

function plateChain(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, terms: Term[], target: Float64Array, r: Rng) {
  const pts = synth(terms, T)
  const at = Math.round(range(r, 0.58, 0.9) * T)
  const t = timeOf(at)
  const b = emptyBox()
  boxOfPoints(b, pts)
  boxOfChain(b, terms, t)
  const detail = planInset(W, H, S, b, terms, pts, t)
  const v = detail?.view ?? fit(W, H, S, b, 0.8)
  // The target, faint, under everything.
  g.strokeStyle = pal.accent
  g.globalAlpha = 0.35
  g.lineWidth = LW.fine * S
  g.setLineDash([S * 0.004, S * 0.004])
  path(g, target, v)
  g.stroke()
  g.setLineDash([])
  // The orbits of the first joints: each one draws a partial sum.
  const trails = Math.min(4, terms.length - 1)
  for (let i = 2; i <= trails; i++) {
    g.strokeStyle = pal.mid
    g.globalAlpha = 0.8 - 0.15 * (i - 2)
    g.lineWidth = LW.circle * S
    g.setLineDash([S * 0.003, S * 0.003 * i])
    path(g, synth(terms.slice(0, i), T / 2), v)
    g.stroke()
  }
  g.setLineDash([])
  deferentScale(g, v, S, pal, terms)
  tracedLine(g, v, S, pal, pts, at)
  const style = { circle: pal.mid, arm: pal.ink, circleAlpha: 0.7, armAlpha: 0.95 }
  drawChain(g, v, S, terms, t, style)
  crosshair(g, v.X(0), v.Y(0), S, pal.ink, 0.9)
  penMark(g, v.X(pts[at * 2]), v.Y(pts[at * 2 + 1]), S, pal.accent)
  if (detail)
    inset(g, W, H, S, pal, v, terms, pts, at, detail, style)
}

/** Inset radius, short side = 1, and the corner offset of its centre. */
const INSET_R = 0.115
const INSET_AT = 0.345

interface Detail { view: View, cx: number, cy: number, rho: number }

/**
 * Where the detail view goes: a corner left free by the drawing, shrinking the
 * drawing a little towards the opposite corner if needed. Null when the small
 * circles are already large enough to read, or no corner is free.
 */
function planInset(W: number, H: number, S: number, b: Box, terms: Term[], pts: Float64Array, t: number): Detail | null {
  const n = terms.length
  if (n < 3)
    return null
  const j = joints(terms, t)
  const tx = j[n * 2]
  const ty = j[n * 2 + 1]
  // Everything from the third circle on.
  let rho = 0
  for (let i = 2; i < n; i++)
    rho = Math.max(rho, Math.hypot(j[i * 2] - tx, j[i * 2 + 1] - ty) + terms[i].r)
  rho *= 1.08
  for (const shrink of [1, 0.93, 0.86, 0.8]) {
    for (const [sx, sy] of [[1, -1], [-1, -1], [1, 1], [-1, 1]]) {
      const base = fit(W, H, S, b, 0.8 * shrink)
      const shift = 0.4 * (1 - shrink)
      const k = base.k / S
      const ox = (base.X(0) - W / 2) / S - sx * shift
      const oy = (base.Y(0) - H / 2) / S - sy * shift
      const v = makeView(W, H, S, ox, oy, k)
      if (INSET_R / (rho * k) < 2.2)
        return null
      const cx = W / 2 + sx * S * INSET_AT
      const cy = H / 2 + sy * S * INSET_AT
      const clear = INSET_R * S * 1.1 + LW.curve * S * 2
      let ok = true
      for (let i = 0; i < T && ok; i += 4)
        ok = Math.hypot(v.X(pts[i * 2]) - cx, v.Y(pts[i * 2 + 1]) - cy) > clear
      for (let i = 0; i <= n && ok; i++)
        ok = Math.hypot(v.X(j[i * 2]) - cx, v.Y(j[i * 2 + 1]) - cy) > clear
      if (ok)
        return { view: v, cx, cy, rho }
    }
  }
  return null
}

/**
 * A detail view, as on an engineering drawing: the small epicycles near the
 * pen, magnified in a round inset.
 */
function inset(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, v: View, terms: Term[], pts: Float64Array, at: number, d: Detail, style: ChainStyle) {
  const t = timeOf(at)
  const j = joints(terms, t)
  const n = terms.length
  const tx = j[n * 2]
  const ty = j[n * 2 + 1]
  const { cx, cy, rho } = d
  const R = INSET_R
  const zoom = R / (rho * v.k / S)
  const tipX = v.X(tx)
  const tipY = v.Y(ty)
  const rPix = rho * v.k
  const RPix = R * S
  // Leader from the detail circle round the pen to the inset.
  const dx = cx - tipX
  const dy = cy - tipY
  const L = Math.hypot(dx, dy) || 1
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.85
  g.lineWidth = LW.fine * S * 1.2
  g.beginPath()
  g.moveTo(tipX + rPix, tipY)
  g.arc(tipX, tipY, rPix, 0, TAU)
  if (L > rPix + RPix) {
    g.moveTo(tipX + (dx / L) * rPix, tipY + (dy / L) * rPix)
    g.lineTo(cx - (dx / L) * RPix, cy - (dy / L) * RPix)
  }
  g.stroke()

  const k = (v.k / S) * zoom
  const dv = makeView(W, H, S, (cx - W / 2) / S - k * tx, (cy - H / 2) / S - k * ty, k)
  g.save()
  g.beginPath()
  g.arc(cx, cy, RPix, 0, TAU)
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fill()
  g.clip()
  g.strokeStyle = pal.ink
  g.lineWidth = LW.curve * S
  g.globalAlpha = 1
  path(g, pts, dv, Math.max(0, at - T / 6), at, false)
  g.stroke()
  drawChain(g, dv, S, terms, t, style)
  penMark(g, dv.X(tx), dv.Y(ty), S, pal.accent)
  g.restore()
  g.strokeStyle = pal.ink
  g.globalAlpha = 0.9
  g.lineWidth = LW.arm * S
  g.beginPath()
  g.arc(cx, cy, RPix, 0, TAU)
  g.stroke()
  g.strokeStyle = pal.mid
  g.lineWidth = LW.fine * S
  g.beginPath()
  g.arc(cx, cy, RPix * 1.06, 0, TAU)
  g.stroke()
}

function plateStrobe(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, terms: Term[], r: Rng) {
  const pts = synth(terms, T)
  const m = int(r, 3, 5)
  const start = r()
  const at = Array.from({ length: m }, (_, i) => Math.round(((start + i / m) % 1) * T) % T)
  const b = emptyBox()
  boxOfPoints(b, pts)
  for (const i of at)
    boxOfChain(b, terms, timeOf(i))
  const v = fit(W, H, S, b, 0.8)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = pal.ink
  g.globalAlpha = 1
  g.lineWidth = LW.curve * S * 0.85
  path(g, pts, v)
  g.stroke()
  deferentScale(g, v, S, pal, terms)
  at.forEach((i, n) => {
    const last = n === m - 1
    const u = (n + 1) / m
    drawChain(g, v, S, terms, timeOf(i), {
      circle: last ? pal.accent : pal.mid,
      arm: last ? pal.accent : pal.ink,
      circleAlpha: last ? 0.8 : 0.25 + 0.35 * u,
      armAlpha: last ? 1 : 0.4 + 0.45 * u,
      weight: last ? 1 : 0.85,
    })
  })
  for (const i of at)
    penMark(g, v.X(pts[i * 2]), v.Y(pts[i * 2 + 1]), S, pal.accent)
  crosshair(g, v.X(0), v.Y(0), S, pal.ink, 0.9)
}

function plateFan(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, terms: Term[], target: Float64Array) {
  const N = terms.length
  const levels = [1, 2, 4, 8, 16, 32, 64].filter(n => n < N)
  levels.push(N)
  const partials = levels.map(n => synth(terms.slice(0, n), T))
  const b = emptyBox()
  boxOfPoints(b, target)
  for (const p of partials)
    boxOfPoints(b, p)
  const v = fit(W, H, S, b, 0.82)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.9
  g.lineWidth = LW.fine * S * 1.6
  g.setLineDash([S * 0.0012, S * 0.006])
  path(g, target, v)
  g.stroke()
  g.setLineDash([])
  const L = partials.length
  partials.forEach((p, i) => {
    const u = L > 1 ? i / (L - 1) : 1
    g.strokeStyle = mix(pal.accent, pal.ink, u ** 0.8)
    g.globalAlpha = 0.7 + 0.3 * u
    g.lineWidth = S * (LW.circle * 1.4 + (LW.curve - LW.circle * 1.4) * u ** 1.3)
    // Coarse partial sums are dashed, finer and finer up to the solid last one.
    const left = L - 1 - i
    if (left > 0)
      g.setLineDash([S * 0.0016 * (1 + left), S * 0.0035 * Math.sqrt(left)])
    path(g, p, v)
    g.stroke()
    g.setLineDash([])
  })
  crosshair(g, v.X(0), v.Y(0), S, pal.mid, 0.8)
}

function plateTable(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, terms: Term[], target: Float64Array, r: Rng) {
  const N = terms.length
  const counts: number[] = []
  for (let i = 0; i < 9; i++)
    counts.push(Math.max(i ? counts[i - 1] + 1 : 1, Math.round(N ** (i / 8))))
  counts[8] = N
  const t = timeOf(Math.round(range(r, 0.1, 0.9) * T))
  const partials = counts.map(n => synth(terms.slice(0, n), T))
  const b = emptyBox()
  partials.forEach((p, i) => {
    boxOfPoints(b, p)
    boxOfChain(b, terms.slice(0, counts[i]), t)
  })
  boxOfPoints(b, target)
  const span = 0.88
  const cell = span / 3
  const gap = cell * 0.06
  const k = (cell * 0.76) / Math.max(b.x1 - b.x0, b.y1 - b.y0)
  partials.forEach((p, i) => {
    const cx = -span / 2 + cell * ((i % 3) + 0.5)
    const cy = -span / 2 + cell * (Math.floor(i / 3) + 0.5)
    const left = W / 2 + S * (cx - cell / 2 + gap / 2)
    const top = H / 2 + S * (cy - cell / 2 + gap / 2)
    const side = S * (cell - gap)
    g.strokeStyle = pal.mid
    g.globalAlpha = 0.7
    g.lineWidth = LW.fine * S
    g.strokeRect(left, top, side, side)
    const v = makeView(W, H, S, cx - k * (b.x0 + b.x1) / 2, cy - cell * 0.055 - k * (b.y0 + b.y1) / 2, k)
    if (i === 8) {
      g.strokeStyle = pal.accent
      g.globalAlpha = 0.9
      g.setLineDash([S * 0.001, S * 0.004])
      path(g, target, v)
      g.stroke()
      g.setLineDash([])
    }
    drawChain(g, v, S, terms.slice(0, counts[i]), t, { circle: pal.mid, arm: pal.mid, circleAlpha: 0.45, armAlpha: 0.7, weight: 0.7 })
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = pal.ink
    g.globalAlpha = 1
    g.lineWidth = LW.curve * S * 0.8
    path(g, p, v)
    g.stroke()
    // The number of terms, in tally marks under the drawing.
    const n = counts[i]
    const unit = Math.min(S * 0.0024, (side * 0.8) / (Math.ceil(n / 5) * 6))
    g.strokeStyle = i === 8 ? pal.accent : pal.ink
    g.globalAlpha = 0.9
    g.lineWidth = Math.max(unit * 0.32, LW.fine * S)
    tally(g, left + side * 0.08, top + side * 0.94, n, unit)
  })
}

function plateAxes(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, target: Float64Array, nTerms: number, byAmp: boolean, r: Rng) {
  const M = target.length / 2
  const xs = new Float64Array(M * 2)
  const ys = new Float64Array(M * 2)
  for (let i = 0; i < M; i++) {
    xs[i * 2] = target[i * 2]
    ys[i * 2] = target[i * 2 + 1]
  }
  const n = Math.max(5, Math.ceil(nTerms / 2))
  const xT = select(realTerms(dft(xs, KMAX)), n, byAmp)
  const yT = select(realTerms(dft(ys, KMAX)), n, byAmp)
  const px = synth(xT, T)
  const py = synth(yT, T)
  const pts = new Float64Array(T * 2)
  for (let i = 0; i < T; i++) {
    pts[i * 2] = px[i * 2]
    pts[i * 2 + 1] = py[i * 2]
  }
  const at = Math.round(range(r, 0.58, 0.9) * T)
  const t = timeOf(at)
  const cb = emptyBox()
  boxOfPoints(cb, pts)
  const bx = emptyBox()
  boxOfChain(bx, xT, t)
  const byRaw = emptyBox()
  boxOfChain(byRaw, yT, t)
  // The y chain is turned a quarter turn, so that its real part runs downwards.
  const by: Box = { x0: -byRaw.y1, x1: -byRaw.y0, y0: byRaw.x0, y1: byRaw.x1 }
  const colX0 = Math.min(cb.x0, bx.x0)
  const colX1 = Math.max(cb.x1, bx.x1)
  const rowY0 = Math.min(cb.y0, by.y0)
  const rowY1 = Math.max(cb.y1, by.y1)
  const gap = 0.045
  const F = 0.84
  const wU = (by.x1 - by.x0) + (colX1 - colX0)
  const hU = (bx.y1 - bx.y0) + (rowY1 - rowY0)
  const k = Math.min((F - gap) / wU, (F - gap) / hU)
  const left = -(k * wU + gap) / 2
  const top = -(k * hU + gap) / 2
  const yAx = left - k * by.x0
  const ox = left + k * (by.x1 - by.x0) + gap - k * colX0
  const xAy = top - k * bx.y0
  const oy = top + k * (bx.y1 - bx.y0) + gap - k * rowY0
  const vCurve = makeView(W, H, S, ox, oy, k)
  const vX = makeView(W, H, S, ox, xAy, k)
  const vY = makeView(W, H, S, yAx, oy, k)

  // Axes of the two chains.
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.5
  g.lineWidth = LW.fine * S
  g.setLineDash([S * 0.006, S * 0.004])
  g.beginPath()
  g.moveTo(vX.X(colX0) - S * 0.02, vX.Y(0))
  g.lineTo(vX.X(colX1) + S * 0.02, vX.Y(0))
  g.moveTo(vY.X(0), vY.Y(rowY0) - S * 0.02)
  g.lineTo(vY.X(0), vY.Y(rowY1) + S * 0.02)
  g.stroke()
  g.setLineDash([])

  tracedLine(g, vCurve, S, pal, pts, at)
  const style = { circle: pal.mid, arm: pal.ink, circleAlpha: 0.7, armAlpha: 0.95 }
  const tipX = drawChain(g, vX, S, xT, t, style)
  const tipY = drawChain(g, vY, S, yT, t, { ...style, turn: Math.PI / 2 })
  const penX = vCurve.X(pts[at * 2])
  const penY = vCurve.Y(pts[at * 2 + 1])
  // Projection lines from each chain tip to the pen.
  g.strokeStyle = pal.accent
  g.globalAlpha = 0.85
  g.lineWidth = LW.fine * S * 1.4
  g.setLineDash([S * 0.005, S * 0.004])
  g.beginPath()
  g.moveTo(vX.X(tipX[0]), vX.Y(tipX[1]))
  g.lineTo(penX, penY)
  g.moveTo(vY.X(tipY[0]), vY.Y(tipY[1]))
  g.lineTo(penX, penY)
  g.stroke()
  g.setLineDash([])
  crosshair(g, vX.X(0), vX.Y(0), S, pal.ink, 0.9)
  crosshair(g, vY.X(0), vY.Y(0), S, pal.ink, 0.9)
  penMark(g, penX, penY, S, pal.accent)
}

function paper(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, r: Rng) {
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const area = (W * H) / (S * S)

  if (pal.chalk) {
    // Eraser smudges: soft, wide clouds of old chalk.
    const n = Math.round(10 * area)
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = r() * H
      const rad = S * range(r, 0.12, 0.38)
      const grad = g.createRadialGradient(x, y, 0, x, y, rad)
      grad.addColorStop(0, `${pal.ink}12`)
      grad.addColorStop(1, `${pal.ink}00`)
      g.fillStyle = grad
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  }

  if (pal.grid) {
    const step = S / 32
    g.strokeStyle = pal.grid
    g.lineWidth = S * 0.0006
    const nx = Math.ceil(W / step / 2)
    const ny = Math.ceil(H / step / 2)
    for (let k = -nx; k <= nx; k++) {
      g.globalAlpha = k % 4 === 0 ? 0.11 : 0.05
      g.beginPath()
      g.moveTo(W / 2 + k * step, 0)
      g.lineTo(W / 2 + k * step, H)
      g.stroke()
    }
    for (let k = -ny; k <= ny; k++) {
      g.globalAlpha = k % 4 === 0 ? 0.11 : 0.05
      g.beginPath()
      g.moveTo(0, H / 2 + k * step)
      g.lineTo(W, H / 2 + k * step)
      g.stroke()
    }
  }

  const count = Math.round(1500 * area)
  g.fillStyle = pal.grain
  for (let i = 0; i < count; i++) {
    const x = r() * W
    const y = r() * H
    const s = S * range(r, 0.0006, 0.0018)
    g.globalAlpha = range(r, 0.06, 0.2)
    g.fillRect(x, y, s, s)
  }

  const R = Math.hypot(W, H) / 2
  const grad = g.createRadialGradient(W / 2, H / 2, S * 0.32, W / 2, H / 2, R)
  grad.addColorStop(0, `${pal.edge}00`)
  grad.addColorStop(1, `${pal.edge}${pal.dark ? '80' : '48'}`)
  g.globalAlpha = 1
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  // Plate border: a double rule around the whole sheet, with corner crosses.
  const m1 = S * 0.028
  const m2 = S * 0.036
  g.strokeStyle = pal.mid
  g.globalAlpha = 0.6
  g.lineWidth = LW.circle * S
  g.strokeRect(m1, m1, W - 2 * m1, H - 2 * m1)
  g.lineWidth = LW.fine * S
  g.strokeRect(m2, m2, W - 2 * m2, H - 2 * m2)
  const c = S * 0.012
  g.beginPath()
  for (const [x, y] of [[m1, m1], [W - m1, m1], [m1, H - m1], [W - m1, H - m1]]) {
    g.moveTo(x - c, y)
    g.lineTo(x + c, y)
    g.moveTo(x, y - c)
    g.lineTo(x, y + c)
  }
  g.stroke()
}

/** Chalk dust: specks of board colour knocked out of the strokes. */
function chalkDust(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, r: Rng) {
  const n = Math.round(9000 * (W * H) / (S * S))
  g.fillStyle = pal.bg
  for (let i = 0; i < n; i++) {
    const x = r() * W
    const y = r() * H
    const s = S * range(r, 0.0007, 0.002)
    g.globalAlpha = range(r, 0.25, 0.7)
    g.fillRect(x, y, s, s)
  }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const fe = features(hash)
  const pal = PAL[fe.Palette]
  const S = Math.min(W, H)

  const sr = stream(hash, 'subject')
  const pr = stream(hash, 'plate')
  const gr = stream(hash, 'paper')

  const target = makeSubject(fe.Subject as SubjectKind, sr)
  const [lo, hi] = TERMS[fe.Terms]
  const N = int(pr, lo, hi)
  const byAmp = fe.Order === 'By amplitude'
  const terms = select(dft(target, KMAX), N, byAmp)

  paper(g, W, H, S, pal, gr)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (fe.Plate === 'Chain')
    plateChain(g, W, H, S, pal, terms, target, pr)
  else if (fe.Plate === 'Strobe')
    plateStrobe(g, W, H, S, pal, terms, pr)
  else if (fe.Plate === 'Fan')
    plateFan(g, W, H, S, pal, terms, target)
  else if (fe.Plate === 'Table')
    plateTable(g, W, H, S, pal, terms, target, pr)
  else
    plateAxes(g, W, H, S, pal, target, N, byAmp, pr)
  if (pal.chalk)
    chalkDust(g, W, H, S, pal, gr)

  g.setLineDash([])
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
}

export default {
  slug: 'epicycles',
  title: 'Epicycles',
  summary: 'A closed curve taken apart into a Fourier series and drawn back by chains of turning circles: frozen machines, stroboscopes and fans of partial sums.',
  order: 550,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xe91c7c1e ("gallery" stream): the first hash found for each
  // palette × plate pair, the Ink glyph stroboscope moved to the front as the cover.
  gallery: [
    '0x7cebea2ce1e64f1bbc08e9b8a996ce9cd9148f89c0eadbace69bbc4b3c3c126e',
    '0xecfe5bb505f3bcf942330c5971246e14fbeb2f93f62fd140bad817ea271c0a31',
    '0x586119d9bdcb8a100655a666c3cb04c5a9c843f9b4b7593cec1c0630c62bfae3',
    '0xf37afa120d7721b4ee9e961fafb186f3effd60561ab2de811e6696286f7fd4cd',
    '0x66be159cfbdca1c44ac555ef4f54f7c18f502bdfc2837a98b5df921a780402da',
    '0xd3f80979bee2e03e0df1badfb59a97f36a8dfacda35280cd4c7e4d59376a7560',
    '0xb2057b61867e8fc06f88b0b33e947025924b6226b73bf2951eac2c8af098dc1b',
    '0x7e3150c90aff82b3044b6b9170c05ed09f1362fa61a37e838c321470d82d8249',
    '0xde262885e6cfbf053457afe431df0cfccb754851dee7c0e2a746a4c54734cbcd',
    '0x098d40c6041fd822769de114ac5b0868b2c06e9c486b4b5e935540d1932ed67a',
    '0x4f0f327f711cf417a695311836c5afa1c91e081cf215f2bbd4ce2662116af7bb',
    '0x5944cff5989d33d4f9a803fa9f422f5f9d539e84c1edb1ee77cc6ea9146f7bcd',
  ],
} satisfies Series
