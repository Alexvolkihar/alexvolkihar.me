// "Swarm" — boids photographed with the shutter open.
//
// A few hundred to a few thousand boids (Reynolds 1987: separation, alignment,
// cohesion) swim for a fixed number of steps, and every position they pass
// through is kept. The piece is the long exposure of that run: each trail is
// stroked thinly and translucently, so where the school went often the image
// builds up like light on film (dark palettes add light, light ones lay ink).
//
// Four scenes set the forces: a shoal carried by a stream that bends round
// hash-placed rocks (ideal potential flow past cylinders), a river of boids
// cut again and again by one to three wide-turning predators, schools milling
// round one or more vortex centres, and lanes of migrants crossing each other.
// The shutter trait decides whether the boids are also frozen at the end by a
// flash, or several times along the way by a strobe.
//
// Everything is measured in units of the canvas short side and the world takes
// the canvas aspect, so a hash gives the same piece at any size, and a wide or
// tall export is a wider or taller scene rather than a letterboxed square.

import type { Rng } from '../random'
import type { Herd, Lane, Mill, Rock, SimConfig, Track } from '../swarm/sim'
import type { Series } from '../types'
import { int, range, stream, weighted } from '../random'
import { simulate } from '../swarm/sim'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Graphite', 20], ['Abyss', 22], ['Ember', 15], ['Cyanotype', 13], ['Tidepool', 18], ['Kelp', 12]],
  Scene: [['Shoal', 32], ['Pursuit', 26], ['Mill', 22], ['Crossing', 20]],
  Population: [['Sparse', 25], ['School', 50], ['Throng', 25]],
  Temper: [['Calm', 40], ['Restless', 35], ['Tight', 25]],
  Shutter: [['Open', 35], ['Rear curtain', 45], ['Strobe', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Scene: weighted(r, TRAITS.Scene),
    Population: weighted(r, TRAITS.Population),
    Temper: weighted(r, TRAITS.Temper),
    Shutter: weighted(r, TRAITS.Shutter),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original to this site)
// ---------------------------------------------------------------------------

interface Palette {
  dark: boolean
  bg: string
  /** Centre of the background glow (dark) or paper tone (light). */
  glow: string
  /** One ink per school, cycled. */
  inks: readonly string[]
  /** Predators. */
  accent: string
  /** Flash and strobe marks. */
  flash: string
  rock: string
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Graphite: { dark: false, bg: '#ebe7de', glow: '#f5f2ea', inks: ['#1c1d21', '#3b4250', '#5d5a55'], accent: '#c0392b', flash: '#111114', rock: '#d6d0c3' },
  Abyss: { dark: true, bg: '#040d14', glow: '#0b2230', inks: ['#2fb3a4', '#7fd8e6', '#3d7fd1'], accent: '#ff7b54', flash: '#e8fbff', rock: '#0a1a24' },
  Ember: { dark: true, bg: '#0f0806', glow: '#24120b', inks: ['#e0611f', '#f6b443', '#b7321b'], accent: '#8fd3ff', flash: '#fff1cf', rock: '#1d0f0a' },
  Cyanotype: { dark: true, bg: '#123a6b', glow: '#1d4f8a', inks: ['#dfeaf6', '#a7c6e8', '#f2f6fb'], accent: '#f4cf63', flash: '#ffffff', rock: '#0f3260' },
  Tidepool: { dark: false, bg: '#e6ece6', glow: '#f1f4ef', inks: ['#1b4b57', '#3b8a8a', '#203040'], accent: '#d4542f', flash: '#102a33', rock: '#cfd8cf' },
  Kelp: { dark: false, bg: '#efe6d2', glow: '#f7f0e0', inks: ['#2d3a1c', '#7a5a22', '#4f6b33'], accent: '#1f4f7a', flash: '#1d2412', rock: '#ddd1b6' },
}

// ---------------------------------------------------------------------------
// Behaviour tables
// ---------------------------------------------------------------------------

/** Boids per unit of area (the short side of the canvas is 1). */
const DENSITY: Record<Features['Population'], number> = { Sparse: 170, School: 330, Throng: 580 }

const TEMPER: Record<Features['Temper'], { wSep: number, wAli: number, wCoh: number, wWander: number, jitter: number }> = {
  Calm: { wSep: 0.9, wAli: 0.1, wCoh: 0.006, wWander: 0.012, jitter: 0.22 },
  Restless: { wSep: 1.1, wAli: 0.035, wCoh: 0.004, wWander: 0.04, jitter: 0.6 },
  Tight: { wSep: 0.8, wAli: 0.07, wCoh: 0.018, wWander: 0.018, jitter: 0.3 },
}

const STEPS = 280
/** Steps per stroke when a trail brightens in time (rear curtain). */
const CHUNK = 70
const SPEED = 0.006

// Stream directions, as exact constants (no trig in the simulation):
// the long axis of the canvas tilted by 0, ±10 or ±20 degrees.
const TILTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0.984807753, 0.173648178],
  [0.984807753, -0.173648178],
  [0.939692621, 0.342020143],
  [0.939692621, -0.342020143],
]

/** A uniformly random unit vector, by rejection in the disc (sqrt only). */
function unit(r: Rng): [number, number] {
  for (let k = 0; k < 64; k++) {
    const a = r() * 2 - 1
    const b = r() * 2 - 1
    const d2 = a * a + b * b
    if (d2 > 0.04 && d2 <= 1) {
      const d = Math.sqrt(d2)
      return [a / d, b / d]
    }
  }
  return [1, 0]
}

/** Stream direction: along the long axis of the canvas, either way, slightly tilted. */
function streamDir(r: Rng, w: number, h: number): [number, number] {
  const [c, s] = TILTS[int(r, 0, TILTS.length - 1)]
  const sign = r() < 0.5 ? -1 : 1
  if (w >= h)
    return [c * sign, s]
  return [s, c * sign]
}

interface Layout {
  cfg: SimConfig
  herd: Herd
  hunters: Herd
  school: Uint16Array
}

function layout(hash: string, f: Features, w: number, h: number): Layout {
  const r = stream(hash, 'layout')
  const area = w * h
  const temper = TEMPER[f.Temper]
  const cfg: SimConfig = {
    w,
    h,
    steps: STEPS,
    speed: SPEED,
    rNb: 0.04,
    rSep: 0.019,
    ...temper,
    maxForce: 0.09,
    vMin: 0.6,
    vMax: 1.25,
    wrap: false,
    pad: 0.08,
    wall: 0,
    current: 0,
    cx: 1,
    cy: 0,
    wDrift: 0,
    rocks: [],
    mills: [],
    wMill: 0,
    wBand: 0,
    bx: 0,
    by: 0,
    lanes: [],
    wLane: 0,
    rFear: 0.13,
    wFlee: 0.5,
    predatorSpeed: 1.7,
    predatorTurn: 0.035,
  }

  // --- scene ----------------------------------------------------------------
  const hunters: Herd = { x: new Float64Array(0), y: new Float64Array(0), vx: new Float64Array(0), vy: new Float64Array(0), group: new Uint8Array(0) }
  const rocks: Rock[] = []
  const mills: Mill[] = []
  const lanes: Lane[] = []
  let groups = 1
  if (f.Scene === 'Shoal') {
    [cfg.cx, cfg.cy] = streamDir(r, w, h)
    cfg.wrap = true
    cfg.current = 0.7
    cfg.wDrift = 0.025
    const want = Math.max(1, Math.round(int(r, 2, 5) * Math.sqrt(area)))
    for (let tries = 0; tries < 300 && rocks.length < want; tries++) {
      const rr = range(r, 0.045, 0.12)
      const rx = range(r, 0.12, w - 0.12)
      const ry = range(r, 0.12, h - 0.12)
      let ok = true
      for (const k of rocks) {
        const dx = k.x - rx
        const dy = k.y - ry
        const gap = k.r + rr + 0.09
        if (dx * dx + dy * dy < gap * gap)
          ok = false
      }
      if (ok)
        rocks.push({ x: rx, y: ry, r: rr })
    }
  }
  else if (f.Scene === 'Pursuit') {
    // a river of boids crossing the canvas, cut again and again by fast hunters
    // that turn wide: the band splashes open round each pass and closes behind
    [cfg.cx, cfg.cy] = streamDir(r, w, h)
    cfg.wrap = true
    cfg.wDrift = 0.04
    cfg.wBand = 0.1
    cfg.wWander = Math.min(cfg.wWander, 0.025)
    cfg.bx = w / 2 + range(r, -0.08, 0.08)
    cfg.by = h / 2 + range(r, -0.08, 0.08)
    const np = Math.max(1, Math.round(weighted(r, [[1, 45], [2, 40], [3, 15]] as const) * Math.sqrt(area)))
    const make = () => new Float64Array(np)
    hunters.x = make()
    hunters.y = make()
    hunters.vx = make()
    hunters.vy = make()
    hunters.group = new Uint8Array(np)
    for (let p = 0; p < np; p++) {
      // start beside the band, heading into it
      const side = r() < 0.5 ? -1 : 1
      const along = range(r, -0.35, 0.35)
      const across = range(r, 0.25, 0.4) * side
      hunters.x[p] = cfg.bx + cfg.cx * along - cfg.cy * across
      hunters.y[p] = cfg.by + cfg.cy * along + cfg.cx * across
      hunters.vx[p] = cfg.cy * side
      hunters.vy[p] = -cfg.cx * side
    }
  }
  else if (f.Scene === 'Mill') {
    cfg.wall = 0.06
    cfg.wMill = 0.05
    const want = Math.max(1, Math.round(weighted(r, [[1, 50], [2, 35], [3, 15]] as const) * Math.sqrt(area)))
    for (let tries = 0; tries < 300 && mills.length < want; tries++) {
      const mr = range(r, 0.13, want === 1 ? 0.3 : 0.22)
      const mx = range(r, mr + 0.08, w - mr - 0.08)
      const my = range(r, mr + 0.08, h - mr - 0.08)
      let ok = true
      for (const m of mills) {
        const dx = m.x - mx
        const dy = m.y - my
        const gap = (m.r + mr) * 0.95
        if (dx * dx + dy * dy < gap * gap)
          ok = false
      }
      if (ok)
        mills.push({ x: mx, y: my, r: mr, spin: r() < 0.5 ? -1 : 1 })
    }
  }
  else {
    // lanes from one edge to (roughly) the opposite one, crossing mid-canvas
    cfg.wLane = 0.05
    groups = int(r, 2, 4)
    const per = 2 * (w + h)
    // a point on the border, by its position along the perimeter (0..1)
    const border = (u: number): [number, number] => {
      let d = (((u % 1) + 1) % 1) * per
      if (d < w)
        return [d, 0]
      d -= w
      if (d < h)
        return [w, d]
      d -= h
      if (d < w)
        return [w - d, h]
      return [0, h - (d - w)]
    }
    // ends pushed off the canvas, away from its centre: the release and
    // arrival zones stay out of the picture
    const outside = (p: [number, number], by: number): [number, number] => {
      const dx = p[0] - w / 2
      const dy = p[1] - h / 2
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      return [p[0] + (dx / d) * by, p[1] + (dy / d) * by]
    }
    const u0 = r()
    for (let g = 0; g < groups; g++) {
      const u = u0 + g / (groups * 2) + range(r, -0.04, 0.04)
      const [sx, sy] = outside(border(u), 0.05)
      const [tx, ty] = outside(border(u + 0.5 + range(r, -0.12, 0.12)), 0.14)
      lanes.push({ sx, sy, tx, ty, spread: range(r, 0.08, 0.2) })
    }
    cfg.pad = 0.2
    cfg.wWander *= 0.6
  }
  cfg.rocks = rocks
  cfg.mills = mills
  cfg.lanes = lanes

  // --- schools --------------------------------------------------------------
  // a band holds fewer boids than a canvas-wide shoal
  const n = Math.round(DENSITY[f.Population] * area * (f.Scene === 'Pursuit' ? 0.6 : 1))
  const herd: Herd = { x: new Float64Array(n), y: new Float64Array(n), vx: new Float64Array(n), vy: new Float64Array(n), group: new Uint8Array(n) }
  const school = new Uint16Array(n)
  if (f.Scene === 'Crossing') {
    // already under way: spread along each lane, narrowing towards its end
    for (let i = 0; i < n; i++) {
      const g = i % groups
      const ln = lanes[g]
      const lx = ln.tx - ln.sx
      const ly = ln.ty - ln.sy
      const l = Math.sqrt(lx * lx + ly * ly) || 1
      const t = r() * 0.95
      const s = (r() * 2 - 1) * ln.spread * (1 - t * 0.7)
      herd.x[i] = ln.sx + lx * t - (ly / l) * s
      herd.y[i] = ln.sy + ly * t + (lx / l) * s
      herd.vx[i] = lx / l
      herd.vy[i] = ly / l
      herd.group[i] = g
      school[i] = g
    }
    return { cfg, herd, hunters, school }
  }
  if (f.Scene === 'Pursuit') {
    // spread along the whole band (and its wrapped length), one school per stretch
    const span = Math.abs(cfg.cx) * (w + 2 * cfg.pad) + Math.abs(cfg.cy) * (h + 2 * cfg.pad)
    const half = 0.1
    for (let i = 0; i < n; i++) {
      const along = (r() - 0.5) * span
      const across = (r() * 2 - 1) * half
      herd.x[i] = cfg.bx + cfg.cx * along - cfg.cy * across
      herd.y[i] = cfg.by + cfg.cy * along + cfg.cx * across
      herd.vx[i] = cfg.cx + (r() - 0.5) * 0.3
      herd.vy[i] = cfg.cy + (r() - 0.5) * 0.3
      school[i] = Math.floor((along / span + 0.5) * 3)
    }
    return { cfg, herd, hunters, school }
  }
  const k = Math.max(1, Math.round(int(r, 3, 6) * Math.sqrt(area)))
  const centres: number[] = []
  for (let s = 0; s < k; s++) {
    let hx: number
    let hy: number
    if (f.Scene === 'Shoal') {
      hx = cfg.cx
      hy = cfg.cy
    }
    else {
      [hx, hy] = unit(r)
    }
    centres.push(range(r, 0.15, w - 0.15), range(r, 0.15, h - 0.15), hx, hy)
  }
  const per = n / k
  // a school of `per` boids packed at about 9000 per unit area
  const radius = Math.sqrt(per / (Math.PI * 9000))
  for (let i = 0; i < n; i++) {
    const s = Math.min(k - 1, Math.floor(i / per))
    const o = s * 4
    let a = 0
    let b = 0
    for (let t = 0; t < 32; t++) {
      a = r() * 2 - 1
      b = r() * 2 - 1
      if (a * a + b * b <= 1)
        break
    }
    herd.x[i] = centres[o] + a * radius
    herd.y[i] = centres[o + 1] + b * radius
    herd.vx[i] = centres[o + 2] + (r() - 0.5) * 0.3
    herd.vy[i] = centres[o + 3] + (r() - 0.5) * 0.3
    school[i] = s
  }
  return { cfg, herd, hunters, school }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Unit heading of track i at step t, from the last two unbroken steps. */
function heading(tr: Track, i: number, t: number): [number, number] | null {
  const n = tr.n
  if (t < 2 || tr.brk[t * n + i] || tr.brk[(t - 1) * n + i])
    return null
  const dx = tr.xs[t * n + i] - tr.xs[(t - 2) * n + i]
  const dy = tr.ys[t * n + i] - tr.ys[(t - 2) * n + i]
  const d = Math.sqrt(dx * dx + dy * dy)
  if (d < 1e-9)
    return null
  return [dx / d, dy / d]
}

/** A small fish-like chevron at (x, y) pointing along (ux, uy), added to the current path. */
function chevron(g: CanvasRenderingContext2D, x: number, y: number, ux: number, uy: number, L: number) {
  const nx = -uy
  const ny = ux
  g.moveTo(x + ux * L, y + uy * L)
  g.lineTo(x - ux * L * 0.7 + nx * L * 0.42, y - uy * L * 0.7 + ny * L * 0.42)
  g.lineTo(x - ux * L * 0.35, y - uy * L * 0.35)
  g.lineTo(x - ux * L * 0.7 - nx * L * 0.42, y - uy * L * 0.7 - ny * L * 0.42)
  g.closePath()
}

/**
 * Strokes track i from step t0 to t1 as quadratic curves through the
 * midpoints of every other step: half the path verbs, and smoother at 8K.
 */
function strokeTrack(g: CanvasRenderingContext2D, tr: Track, i: number, t0: number, t1: number, S: number) {
  const n = tr.n
  let px = tr.xs[t0 * n + i] * S
  let py = tr.ys[t0 * n + i] * S
  g.beginPath()
  g.moveTo(px, py)
  let t = t0 + 1
  while (t <= t1) {
    const o = t * n + i
    const x = tr.xs[o] * S
    const y = tr.ys[o] * S
    if (tr.brk[o]) {
      g.lineTo(px, py)
      g.moveTo(x, y)
      px = x
      py = y
      t++
      continue
    }
    const q = o + n
    if (t + 1 > t1 || tr.brk[q]) {
      g.lineTo(x, y)
      px = x
      py = y
      t++
      continue
    }
    const x2 = tr.xs[q] * S
    const y2 = tr.ys[q] * S
    // control point at step t, ending halfway to the step after
    g.quadraticCurveTo(x, y, (x + x2) * 0.5, (y + y2) * 0.5)
    px = x2
    py = y2
    t += 2
    if (t > t1)
      g.lineTo(x2, y2)
  }
  g.stroke()
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const S = Math.min(W, H)
  const w = W / S
  const h = H / S

  const { cfg, herd, hunters, school } = layout(hash, f, w, h)
  const { boids, hunters: preds } = simulate(cfg, herd, hunters, stream(hash, 'sim'))
  const pr = stream(hash, 'paint')

  // --- ground ---------------------------------------------------------------
  g.save()
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const glow = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) * 0.55)
  glow.addColorStop(0, pal.glow)
  glow.addColorStop(1, pal.bg)
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)

  // --- trails ---------------------------------------------------------------
  const n = boids.n
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over'
  const popScale = { Sparse: 1.35, School: 1, Throng: 0.78 }[f.Population]
  // below a pixel the stroke is widened and dimmed by the same factor, so a
  // small canvas gets the same exposure as a large one
  const width = 0.00105 * S * popScale
  g.lineWidth = Math.max(1, width)
  const baseAlpha = (pal.dark ? 0.2 : 0.32) * popScale * Math.min(1, width)
  const fade = f.Shutter === 'Rear curtain'
  const chunks = fade ? Math.ceil(STEPS / CHUNK) : 1
  const span = fade ? CHUNK : STEPS
  const jitter = new Float32Array(n)
  for (let i = 0; i < n; i++)
    jitter[i] = 0.7 + pr() * 0.6
  for (let i = 0; i < n; i++) {
    g.strokeStyle = pal.inks[school[i] % pal.inks.length]
    for (let c = 0; c < chunks; c++) {
      const t0 = c * span
      const t1 = Math.min(STEPS, t0 + span)
      let a = baseAlpha * jitter[i]
      if (fade)
        a *= 0.2 + 0.8 * ((c + 1) / chunks) ** 1.6
      g.globalAlpha = Math.min(1, a)
      strokeTrack(g, boids, i, t0, t1, S)
    }
  }

  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  // rocks: irregular stones laid over the trails, just covering the collision circle
  for (const k of cfg.rocks) {
    const sides = 48
    const phase = pr() * 6.283
    const a1 = range(pr, 0.03, 0.07)
    const a2 = range(pr, 0.02, 0.05)
    g.beginPath()
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2
      const rr = k.r * (1.13 + a1 * Math.sin(a * 2 + phase) + a2 * Math.sin(a * 3 - phase * 1.7))
      const X = (k.x + Math.cos(a) * rr) * S
      const Y = (k.y + Math.sin(a) * rr) * S
      if (s === 0)
        g.moveTo(X, Y)
      else
        g.lineTo(X, Y)
    }
    g.closePath()
    g.fillStyle = pal.rock
    g.fill()
  }

  // --- marks: flash and strobe ----------------------------------------------
  g.globalCompositeOperation = 'source-over'
  if (f.Shutter !== 'Open') {
    const L = 0.0062 * S * Math.sqrt(popScale)
    const times = f.Shutter === 'Strobe' ? [56, 112, 168, 224, STEPS] : [STEPS]
    for (const t of times) {
      const last = t === STEPS
      g.globalAlpha = last ? 0.9 : 0.4
      g.fillStyle = pal.flash
      g.beginPath()
      for (let i = 0; i < n; i++) {
        const u = heading(boids, i, t)
        if (!u)
          continue
        const X = boids.xs[t * n + i] * S
        const Y = boids.ys[t * n + i] * S
        if (X < -L || Y < -L || X > W + L || Y > H + L)
          continue
        chevron(g, X, Y, u[0], u[1], last ? L : L * 0.8)
      }
      g.fill()
    }
  }

  // --- predators ------------------------------------------------------------
  if (preds.n) {
    g.globalAlpha = 0.9
    g.strokeStyle = pal.accent
    g.lineWidth = Math.max(1, 0.0026 * S)
    for (let p = 0; p < preds.n; p++)
      strokeTrack(g, preds, p, 0, STEPS, S)
    g.fillStyle = pal.accent
    g.beginPath()
    for (let p = 0; p < preds.n; p++) {
      const u = heading(preds, p, STEPS)
      if (u)
        chevron(g, preds.xs[STEPS * preds.n + p] * S, preds.ys[STEPS * preds.n + p] * S, u[0], u[1], 0.016 * S)
    }
    g.fill()
  }
  g.restore()
}

export default {
  slug: 'swarm',
  title: 'Swarm',
  summary: 'Boids swimming round rocks, fleeing predators, milling and crossing, photographed as a long exposure of their trails.',
  order: 310,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5ba4f00d ("gallery" stream): the first hash found for each
  // of twelve scene x palette pairs; the Ember shoal is moved up as the cover.
  gallery: [
    '0x7a9fac868840a46c1375865cdbd363869f1c1692866a9058235b02fd6881f109',
    '0xe6778d3a86f4e39d192c3fadc8704bf5de90ad4bf3d0191bd12cadb41fda54a0',
    '0xcdfc08de3d4b3c8ec7a336b87639078b28e49b5bc8c2ba9183f2d442e4a04306',
    '0x8d8427a198c23f573ca1613f5354daa23ffcd3177c65c2ec39286fa60570a5ea',
    '0xba217cc468763e1e22de0b23e0256827e659183c26f09acbec2c0be711b1b5bd',
    '0x087a00941e97f933b7d8cb0199900016392b06d3bf6ff7ee295c36d49a06ed72',
    '0xdc66bb2aebf90f54ce3137da44304278b94e01c7cb97e403d36ea215299032d3',
    '0x3e8f1cc550d00d067a3758b2e6f94fc51aa98d1fa9f99ee53a56681d16aed4ea',
    '0xd6269de5f2ea8143783ef7972dbdbc80786b5a160ad84c16bf8aa2ba522a1e0e',
    '0x22c65b41ee8183f3f0dc441345da7427c94a90a9eabb54de1ead6db1f5dd25ed',
    '0xae47af55defa9f09fc39b0b9c3e18f6fe3996f980aade09d5138991e28c0215a',
    '0xbf1e90689dcec54091751a77fd0cd6b2fe845cfa418ac3d27f216acbe539445f',
  ],
} satisfies Series
