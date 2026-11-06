// The ring grammar of "Orbits": how a stack of rings is chosen around one
// centre, and how each kind of ring is drawn.
//
// A system is generated from the inside out as a list of rings, then drawn.
// Every radius and width is in canvas pixels, computed from fractions of the
// canvas short side by the caller, so the list is the same composition at
// any size. Generation only consumes the stream it is given, in a fixed order
// per ring, so the rings inside a given radius never depend on how far out the
// stack goes (a wider canvas only adds rings at the outside).

import type { Rng } from '../random'
import { range, weighted } from '../random'

export type Kind = 'hairlines' | 'dashed' | 'ticked' | 'broken' | 'spiral' | 'gear' | 'beads' | 'band'

/** Relative frequency of each ring kind, one table per grammar. */
export type KindWeights = ReadonlyArray<readonly [Kind, number]>

export interface Ink {
  color: string
  alpha: number
}

export interface Ring {
  kind: Kind
  /** Inner radius and band width, in pixels. */
  r: number
  h: number
  ink: Ink
  /** Start angle of dashes, arcs, teeth and ticks. */
  phase: number
  /** Kind-specific parameters, all drawn from the stream whatever the kind. */
  p: readonly [number, number, number, number]
}

export interface Satellite {
  x: number
  y: number
  s: number
  ink: Ink
  halo: string
  moonAngle: number
}

export interface StackOptions {
  /** Centre of the system, possibly drifting with the radius (eccentric stacks). */
  centre: (r: number) => readonly [number, number]
  /** Nominal radius of the system: past it, rings fade and stay light. */
  R: number
  /** Last radius worth drawing (the farthest visible point). */
  reach: number
  /** Width unit in pixels: every band and gap is a multiple of it. */
  u: number
  /** Thinnest line, in pixels (a fraction of the short side). */
  hair: number
  kinds: KindWeights
  gapScale: number
  satelliteChance: number
  phase: (draw: number, r: number) => number
  inks: readonly [string, string, string]
  accent: string
  bg: string
  /** Fade length past R, in pixels, and the alpha floor of the outer rings. */
  fade: number
  floor: number
}

// Band width range of each kind, in width units.
const BAND: Record<Kind, readonly [number, number]> = {
  hairlines: [0.016, 0.05],
  dashed: [0.006, 0.03],
  ticked: [0.022, 0.06],
  broken: [0.012, 0.065],
  spiral: [0.05, 0.13],
  gear: [0.016, 0.04],
  beads: [0.012, 0.034],
  band: [0.02, 0.075],
}

// Past the nominal radius the stack keeps going in a lighter register: heavy
// kinds turn into their light counterpart (no extra draw, so no shift).
const OUTER: Record<Kind, Kind> = {
  hairlines: 'hairlines',
  dashed: 'dashed',
  ticked: 'ticked',
  broken: 'dashed',
  spiral: 'spiral',
  gear: 'ticked',
  beads: 'beads',
  band: 'hairlines',
}

const ACCENTED: ReadonlySet<Kind> = new Set(['broken', 'band', 'beads', 'spiral', 'dashed'])
const CARRIES_SATELLITE: ReadonlySet<Kind> = new Set(['hairlines', 'dashed', 'broken', 'band'])

/** Builds the ring list of one system, from its hub outwards. */
export function buildStack(r: Rng, o: StackOptions): { rings: Ring[], satellites: Satellite[], hub: number } {
  const rings: Ring[] = []
  const satellites: Satellite[] = []
  const hub = o.R * range(r, 0.05, 0.12)
  let rad = hub * range(r, 1.4, 2.4)
  let guard = 0
  while (rad < o.reach && guard++ < 400) {
    // fixed consumption per ring: kind, band, colour (3), phase, params (4),
    // gap (2), satellite (3)
    const drawnKind = weighted(r, o.kinds)
    const outer = rad > o.R
    const kind = outer ? OUTER[drawnKind] : drawnKind
    const [b0, b1] = BAND[kind]
    let h = o.u * range(r, b0, b1)
    if (outer)
      h *= 0.8
    const accentRoll = r()
    const which = r()
    const alphaRoll = r()
    const phase = o.phase(r(), rad)
    const p = [r(), r(), r(), r()] as const
    const gapRoll = r()
    const bigGap = r() < 0.2
    const satRoll = r()
    const satAngle = r() * Math.PI * 2
    const satSize = r()

    let color: string
    if (!outer && ACCENTED.has(kind) && accentRoll < 0.13)
      color = o.accent
    else
      color = o.inks[which < 0.5 ? 0 : which < 0.8 ? 1 : 2]
    let alpha = 0.78 + alphaRoll * 0.22
    if (outer)
      alpha *= Math.max(o.floor, 1 - (rad - o.R) / o.fade)
    rings.push({ kind, r: rad, h: Math.max(h, o.hair), ink: { color, alpha }, phase, p })

    if (!outer && rad > o.R * 0.25 && CARRIES_SATELLITE.has(kind) && satRoll < o.satelliteChance) {
      const [cx, cy] = o.centre(rad + h / 2)
      const m = rad + h / 2
      satellites.push({
        x: cx + Math.cos(satAngle) * m,
        y: cy + Math.sin(satAngle) * m,
        s: o.u * (0.014 + satSize * 0.034),
        ink: { color: satSize < 0.35 ? o.accent : o.inks[0], alpha: 1 },
        halo: o.bg,
        moonAngle: satAngle * 2.7,
      })
    }

    let gap = o.u * (0.012 + gapRoll * 0.03) * o.gapScale
    if (bigGap)
      gap *= gapRoll < 0.25 ? 6 : 3
    // the outer register opens up as it fades, so the corners breathe
    if (outer)
      gap *= 1 + 3 * (rad - o.R) / o.fade
    rad += h + gap
  }
  return { rings, satellites, hub }
}

/** Extra state for drawing: thin line width and background colour. */
export interface DrawEnv {
  hair: number
  bg: string
}

const TAU = Math.PI * 2

/** Draws one ring around (cx, cy). */
export function drawRing(g: CanvasRenderingContext2D, cx: number, cy: number, ring: Ring, env: DrawEnv) {
  const { r, h, phase, p } = ring
  g.globalAlpha = ring.ink.alpha
  g.fillStyle = ring.ink.color
  g.strokeStyle = ring.ink.color
  g.lineCap = 'butt'
  g.lineJoin = 'miter'
  switch (ring.kind) {
    case 'hairlines': {
      // a groove of 2 to 6 fine concentric lines
      const n = 2 + Math.floor(p[0] * 5)
      g.lineWidth = env.hair * (1 + p[1] * 1.4)
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const rr = r + (h * i) / Math.max(1, n - 1)
        g.moveTo(cx + rr, cy)
        g.arc(cx, cy, rr, 0, TAU)
      }
      g.stroke()
      break
    }
    case 'dashed': {
      // a whole number of dashes, so the ring closes on itself
      const m = r + h / 2
      const dash = h * (1.5 + p[0] * 9) + env.hair * 4
      const n = Math.min(1600, Math.max(6, Math.round((TAU * m) / dash)))
      const duty = 0.25 + p[1] * 0.55
      const step = TAU / n
      g.lineWidth = h
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const a = phase + i * step
        g.moveTo(cx + Math.cos(a) * m, cy + Math.sin(a) * m)
        g.arc(cx, cy, m, a, a + step * duty)
      }
      g.stroke()
      // a fine guide line under some dashed rings
      if (p[2] < 0.35) {
        g.lineWidth = env.hair
        g.beginPath()
        g.moveTo(cx + m, cy)
        g.arc(cx, cy, m, 0, TAU)
        g.stroke()
      }
      break
    }
    case 'ticked': {
      // a dial scale: minor and major ticks on a base circle
      const m = r + h / 2
      const counts = [24, 36, 48, 60, 72, 90, 120, 180, 240, 360]
      const minSpace = env.hair * 4.5
      const fit = counts.filter(c => (TAU * m) / c >= minSpace)
      const n = fit.length ? fit[Math.floor(p[0] * fit.length)] : 12
      const majors = [3, 4, 5, 6, 10, 12].filter(k => n % k === 0)
      const every = majors.length ? majors[Math.floor(p[1] * majors.length)] : n
      const inward = p[2] < 0.5
      const base = inward ? r + h : r
      const dir = inward ? -1 : 1
      g.lineWidth = env.hair * 1.2
      g.beginPath()
      g.moveTo(cx + base, cy)
      g.arc(cx, cy, base, 0, TAU)
      for (let i = 0; i < n; i++) {
        if (i % every === 0)
          continue
        const a = phase + (i * TAU) / n
        const c = Math.cos(a)
        const s = Math.sin(a)
        // half-way ticks between two majors are a little longer
        const half = every % 2 === 0 && i % (every / 2) === 0
        const len = h * (half ? 0.62 : 0.42)
        g.moveTo(cx + c * base, cy + s * base)
        g.lineTo(cx + c * (base + dir * len), cy + s * (base + dir * len))
      }
      g.stroke()
      g.lineWidth = env.hair * 2.6
      g.beginPath()
      for (let i = 0; i < n; i += every) {
        const a = phase + (i * TAU) / n
        const c = Math.cos(a)
        const s = Math.sin(a)
        g.moveTo(cx + c * base, cy + s * base)
        g.lineTo(cx + c * (base + dir * h), cy + s * (base + dir * h))
      }
      g.stroke()
      break
    }
    case 'broken': {
      // one to six thick arcs with irregular gaps, as annular sectors
      const k = 1 + Math.floor(p[0] * 6)
      const cover = 0.35 + p[1] * 0.55
      const rounded = p[2] < 0.3
      // irregular partition of the turn from a tiny xorshift on p[3]
      let s = Math.floor(p[3] * 0xFFFFFF) | 1
      const next = () => {
        s ^= s << 13
        s ^= s >>> 17
        s ^= s << 5
        return ((s >>> 0) % 10000) / 10000
      }
      const parts: number[] = []
      let sum = 0
      for (let i = 0; i < k; i++) {
        const w = 0.4 + next()
        parts.push(w)
        sum += w
      }
      let a = phase
      const slot = TAU / sum
      if (rounded) {
        g.lineWidth = h
        g.lineCap = 'round'
        g.beginPath()
        for (const w of parts) {
          const len = w * slot * cover
          const m = r + h / 2
          const capAngle = Math.min(len * 0.45, h / 2 / m)
          g.moveTo(cx + Math.cos(a + capAngle) * m, cy + Math.sin(a + capAngle) * m)
          g.arc(cx, cy, m, a + capAngle, a + len - capAngle)
          a += w * slot
        }
        g.stroke()
      }
      else {
        g.beginPath()
        for (const w of parts) {
          const len = w * slot * cover
          g.moveTo(cx + Math.cos(a) * (r + h), cy + Math.sin(a) * (r + h))
          g.arc(cx, cy, r + h, a, a + len)
          g.arc(cx, cy, r, a + len, a, true)
          g.closePath()
          a += w * slot
        }
        g.fill()
      }
      break
    }
    case 'spiral': {
      // dots at an even arc-length spacing along an Archimedean spiral
      const turns = 1.5 + p[0] * 3.5
      const b = h / (TAU * turns)
      const spacing = Math.max(env.hair * 5, h * (0.08 + p[1] * 0.16))
      const dot = spacing * (0.16 + p[2] * 0.2)
      const sense = p[3] < 0.5 ? 1 : -1
      const end = TAU * turns
      g.beginPath()
      let t = 0
      let count = 0
      while (t <= end && count++ < 4000) {
        const rr = r + b * t
        const a = phase + sense * t
        const x = cx + Math.cos(a) * rr
        const y = cy + Math.sin(a) * rr
        const d = dot * (0.6 + 0.8 * (t / end))
        g.moveTo(x + d, y)
        g.arc(x, y, d, 0, TAU)
        // ds = sqrt(r^2 + b^2) dt for r = r0 + b t
        t += spacing / Math.sqrt(rr * rr + b * b)
      }
      g.fill()
      break
    }
    case 'gear': {
      // square or trapezoidal teeth on a rim, filled or outlined
      const pitch = h * (1.4 + p[0] * 2.2)
      const n = Math.min(720, Math.max(8, Math.round((TAU * (r + h)) / pitch)))
      const taper = p[1] < 0.5 ? 0 : 0.18
      const filled = p[2] < 0.55
      const rim = h * 0.55
      const step = TAU / n
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const a = phase + i * step
        const pts = [
          [r + rim, a],
          [r + rim, a + step * (0.25 - taper / 2)],
          [r + h, a + step * (0.25 + taper / 2)],
          [r + h, a + step * (0.75 - taper / 2)],
          [r + rim, a + step * (0.75 + taper / 2)],
        ] as const
        for (let j = 0; j < pts.length; j++) {
          const [rr, aa] = pts[j]
          const x = cx + Math.cos(aa) * rr
          const y = cy + Math.sin(aa) * rr
          if (i === 0 && j === 0)
            g.moveTo(x, y)
          else
            g.lineTo(x, y)
        }
      }
      g.closePath()
      if (filled) {
        g.moveTo(cx + r, cy)
        g.arc(cx, cy, r, 0, TAU, true)
        g.fill('evenodd')
      }
      else {
        g.lineWidth = env.hair * 1.3
        g.stroke()
        g.beginPath()
        g.moveTo(cx + r, cy)
        g.arc(cx, cy, r, 0, TAU)
        g.stroke()
      }
      break
    }
    case 'beads': {
      // a string of small circles, hollow, filled or alternating
      const m = r + h / 2
      const rad = h / 2
      const n = Math.min(900, Math.max(6, Math.floor((TAU * m) / (h * (1.3 + p[0] * 2)))))
      const mode = Math.floor(p[1] * 3)
      g.lineWidth = env.hair * 1.2
      const fillPath = new Path2D()
      const strokePath = new Path2D()
      for (let i = 0; i < n; i++) {
        const a = phase + (i * TAU) / n
        const x = cx + Math.cos(a) * m
        const y = cy + Math.sin(a) * m
        const filled = mode === 1 || (mode === 2 && i % 2 === 0)
        const target = filled ? fillPath : strokePath
        const rr = filled && mode === 2 ? rad * 0.6 : rad
        target.moveTo(x + rr, y)
        target.arc(x, y, rr, 0, TAU)
      }
      g.fill(fillPath)
      g.stroke(strokePath)
      break
    }
    case 'band': {
      // a solid annulus, sometimes split by a fine line of the ground colour
      g.beginPath()
      g.moveTo(cx + r + h, cy)
      g.arc(cx, cy, r + h, 0, TAU)
      g.moveTo(cx + r, cy)
      g.arc(cx, cy, r, 0, TAU, true)
      g.fill('evenodd')
      if (p[0] < 0.5) {
        g.globalAlpha = 1
        g.strokeStyle = env.bg
        g.lineWidth = env.hair * 1.2
        g.beginPath()
        const m = r + h * (0.3 + p[1] * 0.4)
        g.moveTo(cx + m, cy)
        g.arc(cx, cy, m, 0, TAU)
        g.stroke()
      }
      break
    }
  }
}

/** A small body sitting on a ring: a halo cut into the rings, a disc, a moon. */
export function drawSatellite(g: CanvasRenderingContext2D, sat: Satellite, env: DrawEnv) {
  const { x, y, s } = sat
  g.globalAlpha = 1
  g.fillStyle = sat.halo
  g.beginPath()
  g.arc(x, y, s * 2.1, 0, TAU)
  g.fill()
  g.globalAlpha = sat.ink.alpha
  g.fillStyle = sat.ink.color
  g.strokeStyle = sat.ink.color
  g.beginPath()
  g.arc(x, y, s, 0, TAU)
  g.fill()
  g.lineWidth = env.hair
  g.beginPath()
  g.arc(x, y, s * 1.65, 0, TAU)
  g.stroke()
  const mx = x + Math.cos(sat.moonAngle) * s * 1.65
  const my = y + Math.sin(sat.moonAngle) * s * 1.65
  g.fillStyle = sat.halo
  g.beginPath()
  g.arc(mx, my, s * 0.42, 0, TAU)
  g.fill()
  g.fillStyle = sat.ink.color
  g.beginPath()
  g.arc(mx, my, s * 0.26, 0, TAU)
  g.fill()
}
