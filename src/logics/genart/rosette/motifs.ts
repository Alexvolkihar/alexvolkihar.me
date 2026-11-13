// Rosettes for the "Rosette" series: a body is a stack of concentric layers,
// drawn from the outside in like enamel poured cell by cell.
//
// Two families of layer alternate. A silhouette fills the whole disc inside
// its edge (plain, scalloped, petalled, star-pointed or crenellated) and so
// becomes the colour every later layer sits on. A decoration only paints a
// ring of small motifs (dots, beads, rays, teardrops, chevrons, a zigzag or a
// thread) on top of the current colour. Motif counts are taken from the
// divisors and multiples of one base count, and neighbouring rings are often
// turned by half a step, so the motifs of one ring fall between those of the
// next.

import type { Rng } from '../random'
import { chance, pick, range, weighted } from '../random'

export type Silhouette = 'disc' | 'scallop' | 'petal' | 'star' | 'cog'
export type Decor = 'dots' | 'beads' | 'rays' | 'drops' | 'chevrons' | 'zigzag' | 'ring'
export type Kind = Silhouette | Decor
export type Role = 'sun' | 'planet' | 'moon' | 'speck'

export interface Grammar {
  silhouettes: ReadonlyArray<readonly [Silhouette, number]>
  decors: ReadonlyArray<readonly [Decor, number]>
}

export interface Layer {
  kind: Kind
  /** Outer radius, as a fraction of the body radius. */
  r: number
  /** Depth of the edge (silhouette) or width of the band (decoration), same unit. */
  d: number
  n: number
  phase: number
  /** Index into the palette inks. */
  ink: number
  /** Cut a thin ground-coloured line along a silhouette edge. */
  cut: boolean
}

export interface Rosette {
  layers: Layer[]
  rot: number
}

const TAU = Math.PI * 2

function counts(base: number, least: number): number[] {
  const out = [base, base, base * 2]
  if (base % 2 === 0 && base / 2 >= least)
    out.push(base / 2)
  return out
}

/** One rosette design. `warm` lists the inks a sun is allowed to burn with. */
export function designRosette(r: Rng, role: Role, gram: Grammar, inkCount: number, warm: readonly number[], cutRate: number): Rosette {
  const layers: Layer[] = []
  let base: number
  if (role === 'sun')
    base = pick(r, [12, 16, 18, 20, 24])
  else if (role === 'planet')
    base = pick(r, [8, 10, 12, 12, 14, 16, 16, 20])
  else
    base = role === 'moon' ? pick(r, [6, 8, 8, 10]) : pick(r, [5, 6, 6, 8])
  const nOf = () => pick(r, counts(base, role === 'speck' ? 4 : 6))
  const inkNot = (avoid: readonly number[], pool?: readonly number[]) => {
    const all = pool ?? Array.from({ length: inkCount }, (_, i) => i)
    const ok = all.filter(i => !avoid.includes(i))
    return ok.length ? pick(r, ok) : pick(r, all)
  }

  let rad = 1
  let under = -1
  let lastSil = -1
  let half = 0
  if (role === 'sun') {
    const n = pick(r, [base, base])
    const a = inkNot([], warm)
    const b = inkNot([a], warm)
    const d1 = range(r, 0.26, 0.4)
    layers.push({ kind: 'star', r: 1, d: d1, n, phase: 0, ink: a, cut: false })
    const r2 = range(r, 0.8, 0.88)
    const d2 = Math.min(range(r, 0.2, 0.3), d1)
    layers.push({ kind: chance(r, 0.6) ? 'star' : 'petal', r: r2, d: d2, n, phase: Math.PI / n, ink: b, cut: false })
    rad = r2 - d2 - range(r, 0.02, 0.06)
    under = b
    lastSil = b
  }

  let minR: number
  let tLo: number
  let tHi: number
  if (role === 'sun') {
    minR = 0.14
    tLo = 0.08
    tHi = 0.16
  }
  else if (role === 'planet') {
    minR = 0.17
    tLo = 0.12
    tHi = 0.22
  }
  else if (role === 'moon') {
    minR = 0.26
    tLo = 0.22
    tHi = 0.34
  }
  else {
    minR = 0.34
    tLo = 0.3
    tHi = 0.45
  }

  let wantSil = role !== 'sun' || chance(r, 0.4)
  let first = role !== 'sun'
  while (rad > minR) {
    const t = Math.min(range(r, tLo, tHi), rad - minR * 0.5)
    half = 1 - half
    if (wantSil) {
      let kind = weighted(r, gram.silhouettes)
      if (first && role === 'speck' && kind === 'disc')
        kind = 'star'
      const n = nOf()
      const d = kind === 'disc' ? 0 : t * range(r, 0.55, 1)
      const ink = inkNot([under, lastSil])
      layers.push({ kind, r: rad, d, n, phase: half * Math.PI / n, ink, cut: !first && chance(r, cutRate) })
      under = ink
      lastSil = ink
      const inset = kind === 'disc' ? t : t * range(r, 0.15, 0.4)
      rad -= d + inset
      wantSil = chance(r, 0.35)
    }
    else {
      const kind = weighted(r, gram.decors)
      const n = nOf()
      const ink = inkNot([under])
      layers.push({ kind, r: rad, d: t, n, phase: half * Math.PI / n, ink, cut: false })
      rad -= t * range(r, 1, 1.25)
      wantSil = chance(r, 0.75)
    }
    first = false
  }
  // the heart: a disc, often pierced by a dot
  const heart = inkNot([under, lastSil])
  layers.push({ kind: 'disc', r: Math.max(rad, 0.1), d: 0, n: 1, phase: 0, ink: heart, cut: chance(r, cutRate) })
  if (chance(r, 0.6))
    layers.push({ kind: 'disc', r: Math.max(rad, 0.1) * range(r, 0.3, 0.45), d: 0, n: 1, phase: 0, ink: inkNot([heart]), cut: false })
  return { layers, rot: r() * TAU }
}

// ---------------------------------------------------------------------------
// Drawing. Every path is built in pixels around (cx, cy) with radius R.
// ---------------------------------------------------------------------------

function silhouettePath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot: number, L: Layer) {
  const ro = L.r * R
  const ri = (L.r - L.d) * R
  const P = (a: number, rr: number): [number, number] => [cx + Math.cos(a + rot) * rr, cy + Math.sin(a + rot) * rr]
  const n = L.n
  const h = Math.PI / n
  g.beginPath()
  if (L.kind === 'disc') {
    g.arc(cx, cy, ro, 0, TAU)
    return
  }
  if (L.kind === 'star') {
    for (let k = 0; k < n; k++) {
      const a = L.phase + k * 2 * h
      const [x0, y0] = P(a, ro)
      const [x1, y1] = P(a + h, ri)
      if (k === 0)
        g.moveTo(x0, y0)
      else
        g.lineTo(x0, y0)
      g.lineTo(x1, y1)
    }
    g.closePath()
    return
  }
  if (L.kind === 'cog') {
    const w = h * 0.55
    for (let k = 0; k < n; k++) {
      const a = L.phase + k * 2 * h + rot
      g.arc(cx, cy, ro, a - w, a + w)
      g.arc(cx, cy, ri, a + w, a + 2 * h - w)
    }
    g.closePath()
    return
  }
  // scallops (round lobes) and petals (pointed lobes) share their seams
  for (let k = 0; k < n; k++) {
    const a = L.phase + k * 2 * h
    const [x0, y0] = P(a - h, ri)
    const [x3, y3] = P(a + h, ri)
    if (k === 0)
      g.moveTo(x0, y0)
    else
      g.lineTo(x0, y0)
    if (L.kind === 'scallop') {
      // cubic whose midpoint reaches the outer radius
      const del = h * 0.95
      const rc = (8 * ro - 2 * ri * Math.cos(h)) / (6 * Math.cos(del * 0.55))
      const [x1, y1] = P(a - del * 0.55, rc)
      const [x2, y2] = P(a + del * 0.55, rc)
      g.bezierCurveTo(x1, y1, x2, y2, x3, y3)
    }
    else {
      const bulge = ri + (ro - ri) * 0.8
      const [qx0, qy0] = P(a - h * 0.85, bulge)
      const [tx, ty] = P(a, ro)
      const [qx1, qy1] = P(a + h * 0.85, bulge)
      g.quadraticCurveTo(qx0, qy0, tx, ty)
      g.quadraticCurveTo(qx1, qy1, x3, y3)
    }
  }
  g.closePath()
}

function drawDecor(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot: number, L: Layer) {
  const ro = L.r * R
  const d = L.d * R
  const n = L.n
  const h = Math.PI / n
  const P = (a: number, rr: number): [number, number] => [cx + Math.cos(a + rot) * rr, cy + Math.sin(a + rot) * rr]
  g.beginPath()
  switch (L.kind) {
    case 'dots':
    case 'beads': {
      const rm = ro - d / 2
      const s = Math.min(d * 0.4, rm * Math.sin(h) * 0.8)
      const m = L.kind === 'beads' ? 2 : 1
      for (let k = 0; k < n * m; k++) {
        const [x, y] = P(L.phase + k * 2 * h / m, rm)
        const sz = L.kind === 'beads' && k % 2 ? s * 0.5 : s
        g.moveTo(x + sz, y)
        g.arc(x, y, sz, 0, TAU)
      }
      g.fill()
      return
    }
    case 'rays': {
      const w = h * 0.28
      for (let k = 0; k < n; k++) {
        const a = L.phase + k * 2 * h
        const [x0, y0] = P(a - w, ro - d)
        const [x1, y1] = P(a, ro)
        const [x2, y2] = P(a + w, ro - d)
        g.moveTo(x0, y0)
        g.lineTo(x1, y1)
        g.lineTo(x2, y2)
        g.closePath()
      }
      g.fill()
      return
    }
    case 'drops': {
      const rc = ro - d * 0.66
      const s = Math.min(d * 0.28, rc * Math.sin(h) * 0.75)
      const tip = ro - d * 0.04
      const phi = Math.acos(Math.min(0.99, s / (tip - rc)))
      for (let k = 0; k < n; k++) {
        const a = L.phase + k * 2 * h
        const [tx, ty] = P(a, tip)
        const [x, y] = P(a, rc)
        const th = a + rot
        g.moveTo(tx, ty)
        g.arc(x, y, s, th + phi, th - phi + TAU)
        g.closePath()
      }
      g.fill()
      return
    }
    case 'chevrons': {
      const w = h * 0.6
      g.lineWidth = d * 0.2
      for (let k = 0; k < n; k++) {
        const a = L.phase + k * 2 * h
        const [x0, y0] = P(a - w, ro - d * 0.8)
        const [x1, y1] = P(a, ro - d * 0.2)
        const [x2, y2] = P(a + w, ro - d * 0.8)
        g.moveTo(x0, y0)
        g.lineTo(x1, y1)
        g.lineTo(x2, y2)
      }
      g.stroke()
      return
    }
    case 'zigzag': {
      g.lineWidth = d * 0.17
      for (let k = 0; k < 2 * n; k++) {
        const [x, y] = P(L.phase + k * h, k % 2 ? ro - d * 0.82 : ro - d * 0.18)
        if (k === 0)
          g.moveTo(x, y)
        else
          g.lineTo(x, y)
      }
      g.closePath()
      g.stroke()
      return
    }
    default: {
      g.lineWidth = d * 0.28
      g.arc(cx, cy, ro - d / 2, 0, TAU)
      g.stroke()
    }
  }
}

export function drawRosette(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, ros: Rosette, inks: readonly string[], ground: string) {
  g.lineJoin = 'round'
  g.lineCap = 'round'
  for (const L of ros.layers) {
    const col = inks[L.ink]
    g.fillStyle = col
    g.strokeStyle = col
    if (L.kind === 'disc' || L.kind === 'scallop' || L.kind === 'petal' || L.kind === 'star' || L.kind === 'cog') {
      silhouettePath(g, cx, cy, R, ros.rot, L)
      g.fill()
      if (L.cut) {
        g.strokeStyle = ground
        g.lineWidth = Math.max(0.6, R * 0.022)
        g.stroke()
      }
    }
    else {
      drawDecor(g, cx, cy, R, ros.rot, L)
    }
  }
}
