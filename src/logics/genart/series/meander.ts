// "Meander" — rooms filled with corridors by turning agents.
//
// The canvas is first cut into rooms: one hall, a few rooms or many cells by
// recursive (guillotine) splits, or long terraces. Each room gets its own
// lattice, square (90° turns) or triangular (60° turns), its own scale and
// its own rule: serpentine, spiral, Greek-key program or wandering walk
// (../meander/lattice.ts). Agents walk the lattice, never cross one another
// and stop at walls and at a few round obstacles; when they are all stuck,
// filler agents are started on every node left free, so the room ends up
// packed with parallel corridors. The paths are then drawn as filled
// channels, hollow double lines, thick-and-thin nib strokes or thin traces
// with pads.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider or taller canvas holds more rooms.

import type { Program, Rule } from '../meander/lattice'
import type { Rng } from '../random'
import type { Series } from '../types'
import { makeLattice, Walkers } from '../meander/lattice'
import { chance, int, pick, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Terracotta', 22], ['Paddy', 20], ['Ink', 20], ['Lacquer', 12], ['Indigo', 14], ['Circuit', 12]],
  Plan: [['Hall', 15], ['Rooms', 35], ['Cells', 25], ['Terraces', 25]],
  Lattice: [['Square', 60], ['Triangular', 25], ['Mixed', 15]],
  Line: [['Channel', 35], ['Double', 25], ['Nib', 20], ['Trace', 20]],
  Grain: [['Coarse', 25], ['Medium', 50], ['Fine', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Plan: weighted(r, TRAITS.Plan),
    Lattice: weighted(r, TRAITS.Lattice),
    Line: weighted(r, TRAITS.Line),
    Grain: weighted(r, TRAITS.Grain),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original): ground, inks (most used first) and the obstacle colour.
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  inks: readonly string[]
  accent: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Terracotta: { bg: '#cf7c4b', inks: ['#1b1310', '#3a2117', '#f0dfc2'], accent: '#f0dfc2' },
  Paddy: { bg: '#ece9d6', inks: ['#3f6b35', '#7fa04a', '#24402a', '#b9a34e'], accent: '#4f86a0' },
  Ink: { bg: '#f1ede4', inks: ['#151515', '#3b3b3b', '#6e6a63'], accent: '#c43d2b' },
  Lacquer: { bg: '#ebdfca', inks: ['#a3281e', '#181414', '#c4902f'], accent: '#1d4c5c' },
  Indigo: { bg: '#0f1a33', inks: ['#e9ecf2', '#8fb2d8', '#4f74b0'], accent: '#e3b448' },
  Circuit: { bg: '#0d2a20', inks: ['#d18b4f', '#e8c46a', '#a9b8b0'], accent: '#e05a3a' },
}

/** Base node spacing, as a fraction of the short side. */
const GRAIN: Record<Features['Grain'], number> = { Coarse: 1 / 34, Medium: 1 / 50, Fine: 1 / 72 }

const RULES: Record<Features['Plan'], ReadonlyArray<readonly [Rule, number]>> = {
  Hall: [['serpentine', 20], ['spiral', 20], ['key', 25], ['wander', 35]],
  Rooms: [['serpentine', 25], ['spiral', 20], ['key', 25], ['wander', 30]],
  Cells: [['serpentine', 30], ['spiral', 25], ['key', 15], ['wander', 30]],
  Terraces: [['serpentine', 55], ['spiral', 5], ['key', 30], ['wander', 10]],
}

// Greek-key programs on the square lattice: (length, turn) pairs, +1 turning
// clockwise. Started heading "up", they advance to the right one period at a
// time. `h` is the band height in nodes.
const KEYS: ReadonlyArray<{ prog: Program, h: number }> = [
  // the running hook: up 3, right 2, down 1, left 1, down 2, right 3
  { prog: [[3, 1], [2, 1], [1, 1], [1, -1], [2, -1], [3, -1]], h: 4 },
  // a deeper hook; the filler later doubles it from inside
  { prog: [[5, 1], [4, 1], [3, 1], [2, -1], [2, -1], [4, -1]], h: 6 },
  // battlements
  { prog: [[3, 1], [1, 1], [3, -1], [1, -1]], h: 4 },
]

interface Rect { x0: number, y0: number, x1: number, y1: number }

interface Obstacle { x: number, y: number, r: number }

// ---------------------------------------------------------------------------
// Plan: rooms as rectangles, in units of the short side.
// ---------------------------------------------------------------------------

function guillotine(r: Rng, outer: Rect, count: number, minSide: number): Rect[] {
  const rooms = [outer]
  for (let k = 1; k < count; k++) {
    // split the largest room that can still be split
    let best = -1
    let bestA = 0
    for (let i = 0; i < rooms.length; i++) {
      const q = rooms[i]
      const w = q.x1 - q.x0
      const h = q.y1 - q.y0
      if (Math.max(w, h) < 2 * minSide)
        continue
      if (w * h > bestA) {
        bestA = w * h
        best = i
      }
    }
    if (best < 0)
      break
    const q = rooms[best]
    const w = q.x1 - q.x0
    const h = q.y1 - q.y0
    const vertical = w > h * 1.25 || (h <= w * 1.25 && r() < 0.5)
    const len = vertical ? w : h
    const lo = Math.max(minSide / len, 0.28)
    const t = range(r, lo, 1 - lo)
    if (vertical) {
      const x = q.x0 + w * t
      rooms.splice(best, 1, { ...q, x1: x }, { ...q, x0: x })
    }
    else {
      const y = q.y0 + h * t
      rooms.splice(best, 1, { ...q, y1: y }, { ...q, y0: y })
    }
  }
  return rooms
}

function terraces(r: Rng, outer: Rect, c: number): Rect[] {
  const rooms: Rect[] = []
  let y = outer.y0
  const W = outer.x1 - outer.x0
  while (y < outer.y1 - 1e-9) {
    let bh = c * int(r, 5, 12)
    if (outer.y1 - (y + bh) < c * 5)
      bh = outer.y1 - y
    // a band is cut into a few fields, more on a wide canvas
    const cuts = Math.max(0, Math.round(W * range(r, 0, 2.2)))
    let x = outer.x0
    for (let k = 0; k <= cuts; k++) {
      let x1 = k === cuts ? outer.x1 : x + (outer.x1 - x) * range(r, 0.3, 0.7) / (cuts - k + 1) * 2
      if (outer.x1 - x1 < c * 6)
        x1 = outer.x1
      rooms.push({ x0: x, y0: y, x1, y1: y + bh })
      x = x1
      if (x >= outer.x1)
        break
    }
    y += bh
  }
  return rooms
}

// ---------------------------------------------------------------------------
// Filling one room.
// ---------------------------------------------------------------------------

interface Filled {
  kind: 'square' | 'tri'
  step: number
  x: Float64Array
  y: Float64Array
  D: number
  paths: number[][]
}

function spirolateral(r: Rng, D: number): Program {
  const n = int(r, 3, 7)
  const turn = D === 4 ? 1 : pick(r, [1, 2])
  const prog: Array<readonly [number, number]> = []
  for (let i = 1; i <= n; i++)
    prog.push([i, chance(r, 0.3) ? -turn : turn])
  return prog
}

function fillRoom(r: Rng, q: Rect, kind: 'square' | 'tri', step: number, rule: Rule, obstacles: Obstacle[]): Filled | null {
  const L = makeLattice(kind, q.x0, q.y0, q.x1, q.y1, step)
  if (!L)
    return null
  const n = L.cols * L.rows
  for (const o of obstacles) {
    const rr = (o.r + step * 0.75) ** 2
    for (let k = 0; k < n; k++) {
      if ((L.x[k] - o.x) ** 2 + (L.y[k] - o.y) ** 2 < rr)
        L.state[k] = 0
    }
  }
  const wk = new Walkers(L, r)
  const id = (i: number, j: number) => j * L.cols + i
  // most rooms run along their long side, some across it
  const along = (L.cols >= L.rows) === chance(r, 0.7)
  // heading along the long side, and the corner it starts from
  const flipX = chance(r, 0.5)
  const flipY = chance(r, 0.5)
  const ci = flipX ? L.cols - 1 : 0
  const cj = flipY ? L.rows - 1 : 0
  const corner = id(ci, cj)
  const sideOf = (at: number, d: number) => (wk.inside(at, d + 1) >= 0 ? 1 : -1)

  if (rule === 'serpentine' && n > 1800) {
    // a large field is ploughed by several teams at once, each its own way
    const teams = int(r, 3, 6)
    for (let k = 0; k < teams; k++) {
      const at = Math.floor(r() * n)
      const d = L.D === 4 ? Math.floor(r() * 4) : (chance(r, 0.5) ? 0 : 3)
      wk.spawn('serpentine', at, d, chance(r, 0.5) ? 1 : -1)
    }
    wk.run()
  }
  else if (rule === 'serpentine' || rule === 'spiral') {
    let d: number
    if (L.D === 4)
      d = along ? (flipX ? 2 : 0) : (flipY ? 3 : 1)
    else
      d = flipX ? 3 : 0
    wk.spawn(rule, corner, d, sideOf(corner, d))
    if (rule === 'spiral' && chance(r, 0.5)) {
      // a second arm from the opposite corner, winding the other way round
      const far = id(L.cols - 1 - ci, L.rows - 1 - cj)
      const d2 = (d + L.D / 2) % L.D
      wk.spawn(rule, far, d2, sideOf(far, d2))
    }
    wk.run()
  }
  else if (rule === 'key' && L.D === 4 && Math.min(L.cols, L.rows) >= 5) {
    // friezes: bands of a Greek-key program, every other band mirrored
    const fit = KEYS.filter(k => k.h + 1 <= (along ? L.rows : L.cols))
    const key = pick(r, fit.length ? fit : KEYS)
    const cross = along ? L.rows : L.cols
    const bands = Math.max(1, Math.floor((cross + 1) / (key.h + 1)))
    const pad = Math.floor((cross - (bands * (key.h + 1) - 1)) / 2)
    const mirrorAll = chance(r, 0.5)
    for (let b = 0; b < bands; b++) {
      const lo = pad + b * (key.h + 1)
      const hi = lo + key.h - 1
      const mirror = (b % 2 === 1) !== mirrorAll
      const prog: Program = mirror ? key.prog.map(([l, t]) => [l, -t] as const) : key.prog
      if (along) {
        // advance east; rise north (or south when mirrored)
        const j = Math.max(0, Math.min(L.rows - 1, mirror ? lo : hi))
        wk.spawn('key', id(0, j), mirror ? 1 : 3, 1, prog)
      }
      else {
        // advance south; rise east (or west when mirrored)
        const i = Math.max(0, Math.min(L.cols - 1, mirror ? hi : lo))
        const p: Program = prog.map(([l, t]) => [l, -t] as const)
        wk.spawn('key', id(i, 0), mirror ? 2 : 0, 1, p)
      }
    }
    wk.run()
  }
  else {
    // wanderers (or spirolaterals on the triangular lattice) from scattered nodes
    const count = Math.max(2, Math.round(n / (rule === 'key' ? 90 : 55)))
    const prog = rule === 'key' ? spirolateral(r, L.D) : undefined
    for (let k = 0; k < count; k++) {
      const at = Math.floor(r() * n)
      wk.spawn(rule === 'key' ? 'key' : 'wander', at, Math.floor(r() * L.D), chance(r, 0.5) ? 1 : -1, prog)
    }
    wk.run()
  }

  // fill every pocket left free, in reading order (or the reverse)
  const order = new Int32Array(n)
  const rev = chance(r, 0.5)
  for (let k = 0; k < n; k++)
    order[k] = rev ? n - 1 - k : k
  wk.fill(order, rule === 'serpentine' || rule === 'key' ? 'serpentine' : 'spiral')

  return { kind, step, x: L.x, y: L.y, D: L.D, paths: wk.paths }
}

// ---------------------------------------------------------------------------
// Drawing.
// ---------------------------------------------------------------------------

/** Turning points of a path, in pixels (straight runs collapsed). */
function corners(f: Filled, path: number[], S: number): number[] {
  const out: number[] = []
  const m = path.length
  for (let k = 0; k < m; k++) {
    const a = path[k]
    if (k > 0 && k < m - 1) {
      const p = path[k - 1]
      const q = path[k + 1]
      const ux = f.x[a] - f.x[p]
      const uy = f.y[a] - f.y[p]
      const vx = f.x[q] - f.x[a]
      const vy = f.y[q] - f.y[a]
      if (Math.abs(ux * vy - uy * vx) < 1e-12)
        continue
    }
    out.push(f.x[a] * S, f.y[a] * S)
  }
  return out
}

function polyline(g: CanvasRenderingContext2D, pts: number[]) {
  g.moveTo(pts[0], pts[1])
  for (let k = 2; k < pts.length; k += 2)
    g.lineTo(pts[k], pts[k + 1])
}

/** The same polyline with its corners cut at 45°, like a circuit trace. */
function chamfered(g: CanvasRenderingContext2D, pts: number[], cut: number) {
  g.moveTo(pts[0], pts[1])
  for (let k = 2; k < pts.length - 2; k += 2) {
    const ax = pts[k - 2]
    const ay = pts[k - 1]
    const px = pts[k]
    const py = pts[k + 1]
    const bx = pts[k + 2]
    const by = pts[k + 3]
    const la = Math.hypot(px - ax, py - ay)
    const lb = Math.hypot(bx - px, by - py)
    const ca = Math.min(cut, la / 2)
    const cb = Math.min(cut, lb / 2)
    g.lineTo(px - (px - ax) / la * ca, py - (py - ay) / la * ca)
    g.lineTo(px + (bx - px) / lb * cb, py + (by - py) / lb * cb)
  }
  g.lineTo(pts[pts.length - 2], pts[pts.length - 1])
}

function drawChannel(g: CanvasRenderingContext2D, f: Filled, S: number, ink: string, width: number) {
  const w = f.step * S * width
  const sq = f.kind === 'square'
  g.strokeStyle = ink
  g.fillStyle = ink
  g.lineWidth = w
  g.lineJoin = sq ? 'miter' : 'round'
  g.lineCap = sq ? 'square' : 'round'
  g.beginPath()
  for (const p of f.paths) {
    if (p.length > 1)
      polyline(g, corners(f, p, S))
  }
  g.stroke()
  g.beginPath()
  for (const p of f.paths) {
    if (p.length !== 1)
      continue
    const x = f.x[p[0]] * S
    const y = f.y[p[0]] * S
    if (sq) {
      g.rect(x - w / 2, y - w / 2, w, w)
    }
    else {
      g.moveTo(x + w / 2, y)
      g.arc(x, y, w / 2, 0, Math.PI * 2)
    }
  }
  g.fill()
}

function drawDouble(g: CanvasRenderingContext2D, f: Filled, S: number, ink: string, bg: string) {
  drawChannel(g, f, S, ink, 0.74)
  const w = f.step * S * 0.34
  g.strokeStyle = bg
  g.fillStyle = bg
  g.lineWidth = w
  g.lineCap = 'butt'
  g.beginPath()
  for (const p of f.paths) {
    if (p.length > 1)
      polyline(g, corners(f, p, S))
  }
  g.stroke()
  g.beginPath()
  for (const p of f.paths) {
    if (p.length !== 1)
      continue
    const x = f.x[p[0]] * S
    const y = f.y[p[0]] * S
    g.moveTo(x + w / 3, y)
    g.arc(x, y, w / 3, 0, Math.PI * 2)
  }
  g.fill()
}

/** Thick-and-thin: the width of a run depends on its heading, as with a broad nib. */
function drawNib(g: CanvasRenderingContext2D, f: Filled, S: number, ink: string, nib: number) {
  const thick = 0.7
  const thin = 0.16
  const width = (dx: number, dy: number) => f.step * S * (thin + (thick - thin) * Math.abs(Math.sin(Math.atan2(dy, dx) - nib)))
  g.fillStyle = ink
  g.strokeStyle = ink
  if (f.kind === 'square') {
    // axis-aligned runs as rectangles; each end reaches half the width of the run it meets
    g.beginPath()
    for (const p of f.paths) {
      const pts = corners(f, p, S)
      const runs = pts.length / 2 - 1
      if (runs < 1) {
        const w = width(1, 0)
        const h = width(0, 1)
        g.rect(pts[0] - h / 2, pts[1] - w / 2, h, w)
        continue
      }
      const ws: number[] = []
      for (let k = 0; k < runs; k++)
        ws.push(width(pts[2 * k + 2] - pts[2 * k], pts[2 * k + 3] - pts[2 * k + 1]))
      for (let k = 0; k < runs; k++) {
        const ax = pts[2 * k]
        const ay = pts[2 * k + 1]
        const bx = pts[2 * k + 2]
        const by = pts[2 * k + 3]
        const w = ws[k]
        const ea = (k > 0 ? ws[k - 1] : w) / 2
        const eb = (k < runs - 1 ? ws[k + 1] : w) / 2
        if (Math.abs(by - ay) < 1e-9) {
          const x0 = Math.min(ax, bx) - (ax < bx ? ea : eb)
          const x1 = Math.max(ax, bx) + (ax < bx ? eb : ea)
          g.rect(x0, ay - w / 2, x1 - x0, w)
        }
        else {
          const y0 = Math.min(ay, by) - (ay < by ? ea : eb)
          const y1 = Math.max(ay, by) + (ay < by ? eb : ea)
          g.rect(ax - w / 2, y0, w, y1 - y0)
        }
      }
    }
    g.fill()
    return
  }
  // triangular lattice: three headings, one stroke per width
  const byWidth = new Map<number, number[][]>()
  for (const p of f.paths) {
    const pts = corners(f, p, S)
    if (pts.length < 4) {
      pts.push(pts[0] + 1e-3, pts[1])
    }
    for (let k = 0; k + 3 < pts.length; k += 2) {
      const w = Math.round(width(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]) * 100) / 100
      let list = byWidth.get(w)
      if (!list)
        byWidth.set(w, list = [])
      list.push([pts[k], pts[k + 1], pts[k + 2], pts[k + 3]])
    }
  }
  g.lineCap = 'round'
  for (const [w, segs] of byWidth) {
    g.lineWidth = w
    g.beginPath()
    for (const s of segs) {
      g.moveTo(s[0], s[1])
      g.lineTo(s[2], s[3])
    }
    g.stroke()
  }
}

function drawTrace(g: CanvasRenderingContext2D, f: Filled, S: number, ink: string, bg: string) {
  const u = f.step * S
  g.strokeStyle = ink
  g.fillStyle = ink
  g.lineWidth = u * 0.26
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.beginPath()
  for (const p of f.paths) {
    if (p.length < 2)
      continue
    const pts = corners(f, p, S)
    if (f.kind === 'square')
      chamfered(g, pts, u * 0.32)
    else
      polyline(g, pts)
  }
  g.stroke()
  // pads at both ends, drilled
  const ends: number[] = []
  for (const p of f.paths) {
    ends.push(p[0])
    if (p.length > 1)
      ends.push(p[p.length - 1])
  }
  g.beginPath()
  for (const e of ends) {
    g.moveTo(f.x[e] * S + u * 0.34, f.y[e] * S)
    g.arc(f.x[e] * S, f.y[e] * S, u * 0.34, 0, Math.PI * 2)
  }
  g.fill()
  g.fillStyle = bg
  g.beginPath()
  for (const e of ends) {
    g.moveTo(f.x[e] * S + u * 0.11, f.y[e] * S)
    g.arc(f.x[e] * S, f.y[e] * S, u * 0.11, 0, Math.PI * 2)
  }
  g.fill()
}

function drawObstacle(g: CanvasRenderingContext2D, o: Obstacle, S: number, line: Features['Line'], pal: Palette, c: number) {
  const x = o.x * S
  const y = o.y * S
  const R = o.r * S
  g.fillStyle = pal.accent
  g.beginPath()
  g.arc(x, y, R, 0, Math.PI * 2)
  g.fill()
  if (line === 'Double' || line === 'Trace') {
    // a ring cut into the disc, one corridor wide
    g.strokeStyle = pal.bg
    g.lineWidth = c * S * (line === 'Trace' ? 0.26 : 0.34)
    for (let k = 1; R - k * c * S > c * S * 0.6; k += 2) {
      g.beginPath()
      g.arc(x, y, R - k * c * S, 0, Math.PI * 2)
      g.stroke()
    }
  }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const w = W / S
  const h = H / S
  const c = GRAIN[f.Grain]

  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)

  // fixed stream order: plan, obstacles, rooms, colour
  const pr = stream(hash, 'plan')
  const orr = stream(hash, 'obstacles')
  const rr = stream(hash, 'rooms')
  const cr = stream(hash, 'color')

  const m = 0.055
  const outer: Rect = { x0: m, y0: m, x1: w - m, y1: h - m }
  const area = (outer.x1 - outer.x0) * (outer.y1 - outer.y0)
  let rooms: Rect[]
  if (f.Plan === 'Hall')
    rooms = [outer]
  else if (f.Plan === 'Rooms')
    rooms = guillotine(pr, outer, Math.max(3, Math.round(area * range(pr, 4, 7.5))), c * 9)
  else if (f.Plan === 'Cells')
    rooms = guillotine(pr, outer, Math.max(8, Math.round(area * range(pr, 13, 24))), c * 6)
  else
    rooms = terraces(pr, outer, c)

  // obstacles: round stones the corridors flow around
  const obstacles: Obstacle[] = []
  const nObs = f.Plan === 'Hall'
    ? weighted(orr, [[0, 25], [1, 35], [2, 25], [3, 15]] as const)
    : f.Plan === 'Rooms'
      ? weighted(orr, [[0, 50], [1, 35], [2, 15]] as const)
      : (chance(orr, 0.3) ? 1 : 0)
  for (let k = 0; k < nObs; k++) {
    const r = k === 0 ? range(orr, 0.06, 0.14) : range(orr, 0.03, 0.07)
    const x = range(orr, outer.x0 + r, outer.x1 - r)
    const y = range(orr, outer.y0 + r, outer.y1 - r)
    // stones never touch: a corridor must be able to pass between them
    if (obstacles.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + c * 4))
      obstacles.push({ x, y, r })
  }

  const gut = c * 0.9
  const nib = chance(cr, 0.5) ? 0 : Math.PI / 2
  const inkOf = () => pal.inks[Math.floor(cr() ** 1.7 * pal.inks.length)]

  rooms.forEach((q, qi) => {
    const inset: Rect = { x0: q.x0 + gut, y0: q.y0 + gut, x1: q.x1 - gut, y1: q.y1 - gut }
    const kind = f.Lattice === 'Square' ? 'square' : f.Lattice === 'Triangular' ? 'tri' : (chance(rr, 0.5) ? 'square' : 'tri')
    const minSide = Math.min(inset.x1 - inset.x0, inset.y1 - inset.y0)
    let scale = 1
    if (f.Plan === 'Rooms' || f.Plan === 'Cells') {
      const s = pick(rr, [1, 1, 1, 1.5, 2])
      if (minSide > c * s * 8)
        scale = s
    }
    const rule = weighted(rr, RULES[f.Plan])
    const filled = fillRoom(rr, inset, kind, c * scale, rule, obstacles)
    let ink = inkOf()
    if (f.Plan === 'Terraces' && pal.inks.length > 1)
      ink = pal.inks[(qi + (cr() < 0.5 ? 0 : 1)) % Math.min(2, pal.inks.length)]
    if (!filled)
      return
    if (f.Line === 'Channel')
      drawChannel(g, filled, S, ink, 0.56)
    else if (f.Line === 'Double')
      drawDouble(g, filled, S, ink, pal.bg)
    else if (f.Line === 'Nib')
      drawNib(g, filled, S, ink, nib)
    else
      drawTrace(g, filled, S, ink, pal.bg)
  })

  for (const o of obstacles)
    drawObstacle(g, o, S, f.Line, pal, c)
}

export default {
  slug: 'meander',
  title: 'Meander',
  summary: 'Rooms packed with corridors by agents that may only turn by 90° or 60°: serpentines, square spirals, Greek keys and wandering walks that stop at walls and stones.',
  order: 270,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x3ea2de50 ("gallery" stream): the first hash found for each
  // plan × line pair (12 of the 16), so the selection covers the whole table.
  // The last one found is moved first: the clearest cover for the index.
  gallery: [
    '0x52b2b0744c6b590c9c509308a9e04a6efe4046b60788132a6729be4d3a046e49',
    '0x76052858a6fc45df74f36f2b5ecb131d7d2318de680d74ad88a40a81b8c2c300',
    '0xaa2f8e8aa28e9d38d49c41b3a4c19e9d0f7c195ed56899d48adfefd47cb70fe9',
    '0x71e3d63d7b61aa61b675376bb7d780a5082c97450481e06cefe06c0c3b84d1eb',
    '0x404d3c117992d6a48db8fc60673ecef3224140edbf6ac2aa8b30c10d037e71c6',
    '0x5e9942cc8e2121fcaf7bcfb8c5c78c5e98d2f63141f39ecbc195249f2fafb496',
    '0xb54464482fc6c0e94e3e64e4a779dc270af79408020bf6cd914c315c362bb3a6',
    '0x2df8be03d8525556d94946a3367fcf36928695dcaf720c16092a3882a6959c7b',
    '0xc9c7bfc5514839b6ab37097b8790550708865f113e65179177083cdc4f6864aa',
    '0xcaf8b05484bad5b7ae273c451db84bac305addaefe766d327b2da42d484ef44b',
    '0x03e9c97e80552fbb7d9ae8a44608ee6d65f8f6d765f9796cdb780319c47eaca9',
    '0xd432634c4d5d83940e785b527177c6ee89420272cec8365589cbe4e508a92ea1',
  ],
} satisfies Series
