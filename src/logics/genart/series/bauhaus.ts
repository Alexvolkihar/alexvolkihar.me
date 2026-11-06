// "Bauhaus" — geometric poster compositions in the modernist tradition.
//
// Each piece is a poster laid out on paper with a few primary forms: discs,
// half and quarter discs, squares, triangles, rings and bars, in a handful of
// flat colours. Five layout methods place them:
//
// - Modular: forms snapped to a square module grid with gutters, around one
//   large form that sets the scale.
// - Golden: the sheet cut again and again at the golden section (often cutting
//   a square off a rectangle), one form or blank paper per piece.
// - Diagonal: a heavy bar on a tilted axis, with discs, domes and cross bars
//   resting on it or straddling it.
// - Axis: a symmetrical figure built row by row on the vertical centre line,
//   broken by one small off-axis mark.
// - Totem: stacked forms standing on a ground line like small monuments.
//
// The forms can overlap flat, overprint like transparent inks, or cut each
// other out (overlaps go back to paper). A last layer adds thin rules, a
// block of bars standing in for text, or a field of dots, placed in the
// emptiest part of the sheet.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side: the composition lives in the centred square and
// the paper (with the rules and ground lines that bleed off it) fills the rest
// of a non-square canvas.

import type { Rng } from '../random'
import type { Series } from '../types'
import { chance, int, pick, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Dessau', 26], ['Weimar', 18], ['Basel', 16], ['Night', 16], ['Ulm', 14], ['Vorkurs', 10]],
  Composition: [['Modular', 30], ['Golden', 22], ['Diagonal', 18], ['Axis', 16], ['Totem', 14]],
  Density: [['Sparse', 30], ['Balanced', 45], ['Busy', 25]],
  Accent: [['Rules', 35], ['Text bars', 25], ['Dots', 20], ['None', 20]],
  Overlap: [['Flat', 50], ['Overprint', 30], ['Cut-out', 20]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Composition: weighted(r, TRAITS.Composition),
    Density: weighted(r, TRAITS.Density),
    Accent: weighted(r, TRAITS.Accent),
    Overlap: weighted(r, TRAITS.Overlap),
  }
}

// ---------------------------------------------------------------------------
// Palettes. Original colour sets. The first three colours follow the order
// of the Bauhaus form-colour questionnaire (square, triangle, circle), the
// fourth is an extra used freely.
// ---------------------------------------------------------------------------

interface Palette {
  paper: string
  ink: string
  cols: readonly [string, string, string, string]
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Dessau: { paper: '#ece5d4', ink: '#1c1b1a', cols: ['#cf3a2b', '#efb52f', '#2a55a0', '#1c1b1a'], dark: false },
  Weimar: { paper: '#e7d9be', ink: '#2b2621', cols: ['#b4532e', '#d59f3a', '#3d5873', '#7b8a66'], dark: false },
  Basel: { paper: '#f2f1ec', ink: '#141414', cols: ['#e1301d', '#141414', '#bfbcb4', '#e1301d'], dark: false },
  Night: { paper: '#15161a', ink: '#ebe3d1', cols: ['#e0442f', '#f0bf48', '#3f74c6', '#ebe3d1'], dark: true },
  Ulm: { paper: '#dde1dd', ink: '#22282b', cols: ['#e1692b', '#e5c24a', '#2b8483', '#22282b'], dark: false },
  Vorkurs: { paper: '#ebe6dc', ink: '#171615', cols: ['#171615', '#8a867e', '#c6c0b3', '#4b4844'], dark: false },
}

const DENSITY: Record<Features['Density'], 0 | 1 | 2> = { Sparse: 0, Balanced: 1, Busy: 2 }

const TAU = Math.PI * 2
const HALF = Math.PI / 2
const INV_PHI = (Math.sqrt(5) - 1) / 2

// ---------------------------------------------------------------------------
// Forms. Coordinates are in the unit square of the composition. `rot` turns
// a form about the centre of the square (the Diagonal layout).
// ---------------------------------------------------------------------------

// 'half': centre of the diameter, arc from a to a + π.
// 'quarter': centre at the corner, arc from a to a + π/2.
type Shape
  = | { k: 'rect', x: number, y: number, w: number, h: number }
    | { k: 'disc', x: number, y: number, r: number }
    | { k: 'ring', x: number, y: number, r: number, t: number }
    | { k: 'half', x: number, y: number, r: number, a: number }
    | { k: 'quarter', x: number, y: number, r: number, a: number }
    | { k: 'tri', p: readonly [number, number, number, number, number, number] }

interface El { s: Shape, c: string, rot: number }

interface Box { x0: number, y0: number, x1: number, y1: number }

/** Lines a layout offers to the Rules accent: horizontal y, vertical x, in a frame turned by rot. */
interface Guides { h: number[], v: number[], rot: number }

interface Layout { els: El[], guides: Guides }

/** Form family for the colour questionnaire: 0 square, 1 triangle, 2 circle. */
function family(s: Shape): 0 | 1 | 2 {
  if (s.k === 'rect')
    return 0
  if (s.k === 'tri')
    return 1
  return 2
}

function trace(g: CanvasRenderingContext2D, s: Shape): void {
  switch (s.k) {
    case 'rect':
      g.rect(s.x, s.y, s.w, s.h)
      break
    case 'disc':
      g.moveTo(s.x + s.r, s.y)
      g.arc(s.x, s.y, s.r, 0, TAU)
      break
    case 'ring':
      g.moveTo(s.x + s.r, s.y)
      g.arc(s.x, s.y, s.r, 0, TAU)
      g.moveTo(s.x + s.r - s.t, s.y)
      g.arc(s.x, s.y, s.r - s.t, TAU, 0, true)
      break
    case 'half':
      g.moveTo(s.x + Math.cos(s.a) * s.r, s.y + Math.sin(s.a) * s.r)
      g.arc(s.x, s.y, s.r, s.a, s.a + Math.PI)
      g.closePath()
      break
    case 'quarter':
      g.moveTo(s.x, s.y)
      g.arc(s.x, s.y, s.r, s.a, s.a + HALF)
      g.closePath()
      break
    case 'tri':
      g.moveTo(s.p[0], s.p[1])
      g.lineTo(s.p[2], s.p[3])
      g.lineTo(s.p[4], s.p[5])
      g.closePath()
      break
  }
}

/** Axis-aligned bounds of a form before rotation. */
function rawBox(s: Shape): Box {
  switch (s.k) {
    case 'rect':
      return { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h }
    case 'disc':
    case 'ring':
      return { x0: s.x - s.r, y0: s.y - s.r, x1: s.x + s.r, y1: s.y + s.r }
    case 'half':
    case 'quarter': {
      // bounds of the corner plus the arc's sampled points (enough for boxes)
      const span = s.k === 'half' ? Math.PI : HALF
      let x0 = s.x
      let y0 = s.y
      let x1 = s.x
      let y1 = s.y
      for (let i = 0; i <= 8; i++) {
        const a = s.a + (span * i) / 8
        const px = s.x + Math.cos(a) * s.r
        const py = s.y + Math.sin(a) * s.r
        x0 = Math.min(x0, px)
        y0 = Math.min(y0, py)
        x1 = Math.max(x1, px)
        y1 = Math.max(y1, py)
      }
      return { x0, y0, x1, y1 }
    }
    case 'tri': {
      const p = s.p
      return {
        x0: Math.min(p[0], p[2], p[4]),
        y0: Math.min(p[1], p[3], p[5]),
        x1: Math.max(p[0], p[2], p[4]),
        y1: Math.max(p[1], p[3], p[5]),
      }
    }
  }
}

function boxOf(el: El): Box {
  const b = rawBox(el.s)
  if (!el.rot)
    return b
  const c = Math.cos(el.rot)
  const s = Math.sin(el.rot)
  const out: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) {
    const dx = x - 0.5
    const dy = y - 0.5
    const px = 0.5 + dx * c - dy * s
    const py = 0.5 + dx * s + dy * c
    out.x0 = Math.min(out.x0, px)
    out.y0 = Math.min(out.y0, py)
    out.x1 = Math.max(out.x1, px)
    out.y1 = Math.max(out.y1, py)
  }
  return out
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return w > 0 && h > 0 ? w * h : 0
}

// Form helpers, all inside a box (x, y, w, h).

/** Quarter disc with its corner on corner `k` of the box (0 TL, 1 TR, 2 BR, 3 BL), filling the box. */
function quarterIn(x: number, y: number, w: number, h: number, k: number): Shape {
  const r = Math.min(w, h)
  const cx = k === 1 || k === 2 ? x + w : x
  const cy = k >= 2 ? y + h : y
  return { k: 'quarter', x: cx, y: cy, r, a: k * HALF }
}

/** Half disc whose diameter lies on side `k` of the box (0 bottom, 1 top, 2 left, 3 right). */
function halfIn(x: number, y: number, w: number, h: number, k: number): Shape {
  if (k <= 1) {
    const r = Math.min(w / 2, h)
    return { k: 'half', x: x + w / 2, y: k === 0 ? y + h : y, r, a: k === 0 ? Math.PI : 0 }
  }
  const r = Math.min(h / 2, w)
  return { k: 'half', x: k === 2 ? x : x + w, y: y + h / 2, r, a: k === 2 ? -HALF : HALF }
}

/** Triangle in a box: kind 0..3 right triangles on each corner, 4 apex up, 5 apex down. */
function triIn(x: number, y: number, w: number, h: number, k: number): Shape {
  const X = x + w
  const Y = y + h
  switch (k) {
    case 0: return { k: 'tri', p: [x, y, X, y, x, Y] }
    case 1: return { k: 'tri', p: [x, y, X, y, X, Y] }
    case 2: return { k: 'tri', p: [X, y, X, Y, x, Y] }
    case 3: return { k: 'tri', p: [x, y, X, Y, x, Y] }
    case 4: return { k: 'tri', p: [x + w / 2, y, X, Y, x, Y] }
    default: return { k: 'tri', p: [x, y, X, y, x + w / 2, Y] }
  }
}

// ---------------------------------------------------------------------------
// Colour. With a per-piece probability the form takes its questionnaire
// colour; otherwise any colour of the palette (or the ink), never the same
// as the form drawn just before when it can be avoided.
// ---------------------------------------------------------------------------

type Paint = (s: Shape) => string

function painter(r: Rng, pal: Palette): Paint {
  const strict = range(r, 0.2, 0.7)
  const all = [...pal.cols, pal.ink]
  let last = ''
  return (s) => {
    let c: string
    if (r() < strict) {
      c = pal.cols[family(s)]
      // a run of same-family forms would turn the sheet into a single colour
      if (c === last && r() < 0.6)
        c = pick(r, all)
    }
    else {
      c = pick(r, all)
      if (c === last)
        c = pick(r, all)
    }
    last = c
    return c
  }
}

// ---------------------------------------------------------------------------
// Layouts. `d` is the density (0 sparse, 1 balanced, 2 busy). `bx` are the
// canvas bounds in unit coordinates, used only by forms that bleed off the
// square: they never change what the random streams draw.
// ---------------------------------------------------------------------------

function modular(r: Rng, paint: Paint, d: number): Layout {
  const n = d === 0 ? int(r, 3, 4) : d === 1 ? int(r, 5, 6) : pick(r, [6, 7, 8])
  const M = 0.08
  const gu = range(r, 0.008, 0.02)
  const m = (1 - 2 * M - (n - 1) * gu) / n
  const X = (i: number) => M + i * (m + gu)
  const L = (s: number) => s * m + (s - 1) * gu
  const occ = new Uint8Array(n * n)
  const els: El[] = []
  const add = (s: Shape) => els.push({ s, c: paint(s), rot: 0 })
  const free = (i: number, j: number, si: number, sj: number) => {
    for (let a = i; a < i + si; a++) {
      for (let b = j; b < j + sj; b++) {
        if (occ[b * n + a])
          return false
      }
    }
    return true
  }
  const mark = (i: number, j: number, si: number, sj: number) => {
    for (let a = i; a < i + si; a++) {
      for (let b = j; b < j + sj; b++)
        occ[b * n + a] = 1
    }
  }

  // The large form that sets the scale.
  const hs = Math.max(2, Math.min(n - 1, Math.round(n * range(r, 0.45, 0.72))))
  const hi = int(r, 0, n - hs)
  const hj = int(r, 0, n - hs)
  const hk = weighted(r, [['disc', 40], ['quarter', 35], ['half', 25]] as const)
  const hx = X(hi)
  const hy = X(hj)
  const hw = L(hs)
  if (hk === 'disc')
    add({ k: 'disc', x: hx + hw / 2, y: hy + hw / 2, r: hw / 2 })
  else if (hk === 'quarter')
    add(quarterIn(hx, hy, hw, hw, int(r, 0, 3)))
  else
    add(halfIn(hx, hy, hw, hw, int(r, 0, 3)))
  mark(hi, hj, hs, hs)

  // Smaller forms in free modules.
  const target = [4, 8, 15][d]
  const spans = [
    [[1, 1], 30],
    [[2, 1], 14],
    [[1, 2], 14],
    [[2, 2], 12],
    [[3, 1], 9],
    [[1, 3], 9],
    [[4, 1], 6],
    [[1, 4], 6],
  ] as const
  let placed = 0
  for (let tries = 0; tries < 240 && placed < target; tries++) {
    const [si, sj] = weighted(r, spans)
    const i = int(r, 0, n - 1)
    const j = int(r, 0, n - 1)
    if (i + si > n || j + sj > n || !free(i, j, si, sj))
      continue
    mark(i, j, si, sj)
    placed++
    const x = X(i)
    const y = X(j)
    const w = L(si)
    const h = L(sj)
    const ratio = Math.max(si, sj) / Math.min(si, sj)
    if (ratio === 1) {
      const k = weighted(r, [['disc', 22], ['quarter', 22], ['rect', 12], ['tri', 14], ['ring', 12], ['half', 18]] as const)
      if (k === 'disc')
        add({ k: 'disc', x: x + w / 2, y: y + h / 2, r: w / 2 })
      else if (k === 'quarter')
        add(quarterIn(x, y, w, h, int(r, 0, 3)))
      else if (k === 'rect')
        add({ k: 'rect', x, y, w, h })
      else if (k === 'tri')
        add(triIn(x, y, w, h, int(r, 0, 5)))
      else if (k === 'ring')
        add({ k: 'ring', x: x + w / 2, y: y + h / 2, r: w / 2, t: w * range(r, 0.1, 0.22) })
      else
        add(halfIn(x, y, w, h, int(r, 0, 3)))
    }
    else if (ratio === 2) {
      const k = weighted(r, [['half', 40], ['rect', 15], ['bar', 25], ['twin', 20]] as const)
      const across = w > h
      if (k === 'half') {
        add(halfIn(x, y, w, h, across ? int(r, 0, 1) : int(r, 2, 3)))
      }
      else if (k === 'rect') {
        add({ k: 'rect', x, y, w, h })
      }
      else if (k === 'bar') {
        const t = Math.min(w, h) * range(r, 0.22, 0.5)
        const at = r()
        if (across)
          add({ k: 'rect', x, y: y + (h - t) * at, w, h: t })
        else
          add({ k: 'rect', x: x + (w - t) * at, y, w: t, h })
      }
      else {
        const rr = Math.min(w, h) / 2
        const ox = across ? (w + gu) / 4 : 0
        const oy = across ? 0 : (h + gu) / 4
        add({ k: 'disc', x: x + w / 2 - ox, y: y + h / 2 - oy, r: rr * 0.92 })
        add({ k: 'disc', x: x + w / 2 + ox, y: y + h / 2 + oy, r: rr * 0.92 })
      }
    }
    else {
      const across = w > h
      const t = Math.min(w, h) * (chance(r, 0.5) ? 1 : range(r, 0.18, 0.45))
      const at = r()
      if (across)
        add({ k: 'rect', x, y: y + (h - t) * at, w, h: t })
      else
        add({ k: 'rect', x: x + (w - t) * at, y, w: t, h })
    }
  }

  // Forms that ignore the grid cells and cross the others.
  const extras = [1, 2, 3][d]
  for (let e = 0; e < extras; e++) {
    const k = weighted(r, [['ring', 35], ['bar', 35], ['node', 30]] as const)
    if (k === 'ring') {
      const s = int(r, 2, Math.max(2, n - 1))
      const i = int(r, 0, n - s)
      const j = int(r, 0, n - s)
      const rr = L(s) / 2
      add({ k: 'ring', x: X(i) + rr, y: X(j) + rr, r: rr, t: rr * range(r, 0.06, 0.14) })
    }
    else if (k === 'bar') {
      const t = range(r, 0.008, 0.02)
      const s = int(r, Math.ceil(n / 2), n)
      const i = int(r, 0, n - s)
      const j = int(r, 1, n - 1)
      if (chance(r, 0.5))
        add({ k: 'rect', x: X(i), y: X(j) - gu / 2 - t / 2, w: L(s), h: t })
      else
        add({ k: 'rect', x: X(j) - gu / 2 - t / 2, y: X(i), w: t, h: L(s) })
    }
    else {
      const i = int(r, 1, n - 1)
      const j = int(r, 1, n - 1)
      add({ k: 'disc', x: X(i) - gu / 2, y: X(j) - gu / 2, r: m * range(r, 0.3, 0.6) })
    }
  }

  const lines: number[] = []
  for (let i = 1; i < n; i++)
    lines.push(X(i) - gu / 2)
  return { els, guides: { h: [M, ...lines, 1 - M], v: [M, ...lines, 1 - M], rot: 0 } }
}

function golden(r: Rng, paint: Paint, d: number): Layout {
  const M = 0.08
  const gu = range(r, 0.006, 0.014)
  const maxDepth = [3, 5, 7][d]
  const leaves: { x: number, y: number, w: number, h: number }[] = []
  const hs: number[] = []
  const vs: number[] = []
  const split = (x: number, y: number, w: number, h: number, depth: number): void => {
    if (depth >= maxDepth || Math.min(w, h) < 0.085 || (depth >= 2 && r() < 0.2)) {
      leaves.push({ x, y, w, h })
      return
    }
    const across = w > h * 1.05 ? true : h > w * 1.05 ? false : r() < 0.5
    const long = across ? w : h
    const short = across ? h : w
    // cut a square off the rectangle most of the time, else a golden section
    let cut = r() < 0.65 && short < long * 0.9 ? short : long * (r() < 0.5 ? INV_PHI : 1 - INV_PHI)
    if (r() < 0.5)
      cut = long - cut
    if (across) {
      vs.push(x + cut)
      split(x, y, cut, h, depth + 1)
      split(x + cut, y, w - cut, h, depth + 1)
    }
    else {
      hs.push(y + cut)
      split(x, y, w, cut, depth + 1)
      split(x, y + cut, w, h - cut, depth + 1)
    }
  }
  split(M, M, 1 - 2 * M, 1 - 2 * M, 0)

  // The largest piece always carries a form, the others may stay blank.
  let big = 0
  for (let i = 1; i < leaves.length; i++) {
    if (leaves[i].w * leaves[i].h > leaves[big].w * leaves[big].h)
      big = i
  }
  const els: El[] = []
  const add = (s: Shape) => els.push({ s, c: paint(s), rot: 0 })
  leaves.forEach((lf, i) => {
    const x = lf.x + gu / 2
    const y = lf.y + gu / 2
    const w = lf.w - gu
    const h = lf.h - gu
    if (w <= 0 || h <= 0)
      return
    const aspect = Math.max(w, h) / Math.min(w, h)
    const blank = i === big ? 0 : 1
    if (Math.min(w, h) < 0.04) {
      if (r() < 0.5)
        add({ k: 'rect', x, y, w, h })
      return
    }
    if (aspect < 1.3) {
      const k = weighted(r, [['quarter', 30], ['disc', 22], ['rect', 10], ['tri', 8], ['ring', 8], ['blank', 22 * blank]] as const)
      const s = Math.min(w, h)
      const ox = x + (w - s) * r()
      const oy = y + (h - s) * r()
      if (k === 'quarter')
        add(quarterIn(x, y, w, h, int(r, 0, 3)))
      else if (k === 'disc')
        add({ k: 'disc', x: ox + s / 2, y: oy + s / 2, r: s / 2 })
      else if (k === 'rect')
        add({ k: 'rect', x, y, w, h })
      else if (k === 'tri')
        add(triIn(ox, oy, s, s, int(r, 0, 5)))
      else if (k === 'ring')
        add({ k: 'ring', x: ox + s / 2, y: oy + s / 2, r: s / 2, t: s * range(r, 0.05, 0.12) })
    }
    else {
      const k = weighted(r, [['half', 30], ['rect', 14], ['bar', 20], ['quarter', 8], ['blank', 28 * blank]] as const)
      const across = w > h
      if (k === 'half') {
        add(halfIn(x, y, w, h, across ? int(r, 0, 1) : int(r, 2, 3)))
      }
      else if (k === 'rect') {
        add({ k: 'rect', x, y, w, h })
      }
      else if (k === 'bar') {
        const t = Math.min(w, h) * range(r, 0.12, 0.35)
        const at = r()
        if (across)
          add({ k: 'rect', x, y: y + (h - t) * at, w, h: t })
        else
          add({ k: 'rect', x: x + (w - t) * at, y, w: t, h })
      }
      else if (k === 'quarter') {
        add(quarterIn(x, y, w, h, int(r, 0, 3)))
      }
    }
  })
  return { els, guides: { h: [M, ...hs, 1 - M], v: [M, ...vs, 1 - M], rot: 0 } }
}

function diagonal(r: Rng, paint: Paint, d: number): Layout {
  const rot = pick(r, [-60, -45, -30, 30, 45, 60]) * Math.PI / 180
  const R = 0.45
  const els: El[] = []
  // local frame: u along the axis, v across it, centred on the sheet
  const add = (s: Shape) => els.push({ s, c: paint(s), rot })
  const chord = (v: number) => Math.sqrt(Math.max(0, R * R - v * v))
  const bar = (v: number, t: number, u0: number, u1: number) => {
    const lim = chord(Math.abs(v) + t / 2)
    const a = Math.max(-lim, u0)
    const b = Math.min(lim, u1)
    if (b - a > t)
      add({ k: 'rect', x: 0.5 + a, y: 0.5 + v - t / 2, w: b - a, h: t })
  }
  const fitR = (u: number, v: number, rr: number) => Math.max(0.02, Math.min(rr, R - Math.hypot(u, v)))

  // Optional backdrop disc behind everything.
  if (chance(r, 0.55)) {
    const u = range(r, -0.18, 0.18)
    const v = (chance(r, 0.5) ? -1 : 1) * range(r, 0.06, 0.16)
    add({ k: 'disc', x: 0.5 + u, y: 0.5 + v, r: fitR(u, v, range(r, 0.16, 0.3)) })
  }

  const v0 = range(r, -0.06, 0.06)
  const t0 = range(r, 0.035, 0.08)
  const bars: [number, number][] = [[v0, t0]]

  const nb = [1, 2, 3][d]
  for (let i = 0; i < nb; i++) {
    const v = v0 + (chance(r, 0.5) ? -1 : 1) * range(r, 0.08, 0.28)
    const t = range(r, 0.01, 0.035)
    const u0 = range(r, -0.42, 0.05)
    bars.push([v, t])
    bar(v, t, u0, u0 + range(r, 0.18, 0.55))
  }

  // Discs sitting on the main bar or straddling it.
  const nd = [2, 2, 3][d]
  for (let i = 0; i < nd; i++) {
    const u = range(r, -0.28, 0.28)
    const want = i === 0 ? range(r, 0.1, 0.2) : range(r, 0.035, 0.11)
    const mode = int(r, 0, 2)
    const side = mode === 0 ? -1 : 1
    const v = mode === 2 ? v0 : v0 + side * (t0 / 2 + want)
    add({ k: 'disc', x: 0.5 + u, y: 0.5 + v, r: fitR(u, v, want) })
  }

  // The main bar over the discs that straddle it.
  bar(v0, t0, -range(r, 0.3, 0.45), range(r, 0.3, 0.45))

  // Domes and triangles resting on a bar.
  const nh = [1, 2, 3][d]
  for (let i = 0; i < nh; i++) {
    const [v, t] = pick(r, bars)
    const up = chance(r, 0.5)
    const u = range(r, -0.3, 0.3)
    const edge = up ? v - t / 2 : v + t / 2
    const rr = range(r, 0.035, 0.09)
    if (Math.hypot(u, edge) + rr > R)
      continue
    if (chance(r, 0.65)) {
      add({ k: 'half', x: 0.5 + u, y: 0.5 + edge, r: rr, a: up ? Math.PI : 0 })
    }
    else {
      const y1 = up ? edge - rr * 1.6 : edge + rr * 1.6
      add({ k: 'tri', p: [0.5 + u - rr, 0.5 + edge, 0.5 + u + rr, 0.5 + edge, 0.5 + u, 0.5 + y1] })
    }
  }

  // Short bars across the axis.
  const nc = [1, 1, 2][d]
  const cross: number[] = []
  for (let i = 0; i < nc; i++) {
    const u = range(r, -0.3, 0.3)
    const t = range(r, 0.008, 0.022)
    const l = range(r, 0.1, 0.28)
    const vc = v0 + range(r, -0.06, 0.06)
    const lim = chord(Math.abs(u) + t)
    const a = Math.max(-lim, vc - l)
    const b = Math.min(lim, vc + l)
    cross.push(u)
    add({ k: 'rect', x: 0.5 + u - t / 2, y: 0.5 + a, w: t, h: b - a })
  }

  return { els, guides: { h: bars.map(([v]) => 0.5 + v), v: cross.map(u => 0.5 + u), rot } }
}

function axis(r: Rng, paint: Paint, d: number): Layout {
  const M = 0.09
  const k = d === 0 ? 3 : d === 1 ? int(r, 4, 5) : int(r, 6, 7)
  const gy = range(r, 0.012, 0.03)
  const ws = Array.from({ length: k }, () => range(r, 0.6, 1.6))
  const tot = ws.reduce((a, b) => a + b, 0)
  const rows: [number, number][] = []
  let y = M
  for (const w of ws) {
    const h = (w / tot) * (1 - 2 * M)
    rows.push([y, y + h - gy])
    y += h
  }
  const els: El[] = []
  const add = (s: Shape) => els.push({ s, c: paint(s), rot: 0 })

  // A large disc behind the figure.
  const backdrop = chance(r, 0.6)
  if (backdrop) {
    const at = Math.max(0.3, Math.min(0.7, rows[int(r, 0, k - 1)][0]))
    const rr = Math.min(range(r, 0.2, 0.34), at - 0.04, 0.96 - at)
    add({ k: 'disc', x: 0.5, y: at, r: rr })
  }

  type Motif = 'disc' | 'half' | 'bars' | 'pair' | 'tri' | 'ring' | 'quarters'
  const motifs = [['disc', 14], ['half', 16], ['bars', 18], ['pair', 14], ['tri', 12], ['ring', 10], ['quarters', 16]] as const
  let prev: Motif | '' = ''
  for (const [y0, y1] of rows) {
    const h = y1 - y0
    let mo: Motif = weighted(r, motifs)
    if (mo === prev)
      mo = weighted(r, motifs)
    prev = mo
    if (mo === 'disc') {
      const rr = Math.min(h / 2, 0.3)
      add({ k: 'disc', x: 0.5, y: (y0 + y1) / 2, r: rr })
    }
    else if (mo === 'half') {
      const rr = Math.min(h, 0.34)
      if (chance(r, 0.6))
        add({ k: 'half', x: 0.5, y: y1, r: rr, a: Math.PI })
      else
        add({ k: 'half', x: 0.5, y: y0, r: rr, a: 0 })
    }
    else if (mo === 'bars') {
      const nb = int(r, 1, 4)
      const step = h / nb
      for (let i = 0; i < nb; i++) {
        const t = step * range(r, 0.35, 0.7)
        const w = range(r, 0.14, 0.8)
        add({ k: 'rect', x: 0.5 - w / 2, y: y0 + i * step + (step - t) / 2, w, h: t })
      }
    }
    else if (mo === 'pair') {
      const s = Math.min(h, 0.22)
      const gap = range(r, 0.01, 0.12)
      let kind = int(r, 0, 2)
      // two discs on the backdrop disc read as a face
      if (backdrop && kind === 0)
        kind = 1
      for (const side of [-1, 1]) {
        const x = side < 0 ? 0.5 - gap / 2 - s : 0.5 + gap / 2
        if (kind === 0)
          add({ k: 'disc', x: x + s / 2, y: y0 + h / 2, r: s / 2 })
        else if (kind === 1)
          add({ k: 'rect', x, y: y0 + (h - s) / 2, w: s, h: s })
        else
          add(quarterIn(x, y0 + (h - s) / 2, s, s, side < 0 ? 2 : 3))
      }
    }
    else if (mo === 'tri') {
      const w = Math.min(h * 1.3, 0.6)
      add(triIn(0.5 - w / 2, y0, w, h, chance(r, 0.6) ? 4 : 5))
    }
    else if (mo === 'ring') {
      const rr = Math.min(h / 2, 0.3)
      add({ k: 'ring', x: 0.5, y: (y0 + y1) / 2, r: rr, t: rr * range(r, 0.18, 0.35) })
    }
    else {
      const rr = Math.min(h, 0.3)
      const gap = range(r, 0, 0.03)
      if (chance(r, 0.5)) {
        // back to back: an arch split down the middle
        add({ k: 'quarter', x: 0.5 - gap / 2, y: y0 + rr, r: rr, a: Math.PI })
        add({ k: 'quarter', x: 0.5 + gap / 2, y: y0 + rr, r: rr, a: 3 * HALF })
      }
      else {
        // facing each other across the axis
        add({ k: 'quarter', x: 0.5 - gap / 2 - rr, y: y0 + rr, r: rr, a: 3 * HALF })
        add({ k: 'quarter', x: 0.5 + gap / 2 + rr, y: y0 + rr, r: rr, a: Math.PI })
      }
    }
  }

  // One small mark off the axis breaks the symmetry.
  if (chance(r, 0.75)) {
    const x = chance(r, 0.5) ? range(r, 0.12, 0.26) : range(r, 0.74, 0.88)
    const yy = range(r, 0.15, 0.85)
    const s = range(r, 0.025, 0.05)
    if (chance(r, 0.5))
      add({ k: 'disc', x, y: yy, r: s / 2 })
    else
      add({ k: 'rect', x: x - s / 2, y: yy - s / 2, w: s, h: s })
  }

  return { els, guides: { h: rows.map(([y0]) => y0 - gy / 2).slice(1), v: [0.5], rot: 0 } }
}

const PIECES = [['block', 30], ['step', 12], ['dome', 14], ['disc', 14], ['tri', 10], ['quarter', 12], ['ring', 8]] as const

function totem(r: Rng, paint: Paint, d: number, bx: Box): Layout {
  const M = 0.08
  const gy = range(r, 0.8, 0.88)
  const bt = range(r, 0.012, 0.03)
  const els: El[] = []
  const add = (s: Shape) => els.push({ s, c: paint(s), rot: 0 })

  // A sun behind the columns.
  if (chance(r, 0.55))
    add({ k: 'disc', x: range(r, 0.22, 0.78), y: range(r, 0.2, 0.36), r: range(r, 0.08, 0.18) })

  const nc = d === 0 ? 2 : d === 1 ? 3 : 4
  const ws = Array.from({ length: nc }, () => range(r, 0.6, 1.4))
  const tot = ws.reduce((a, b) => a + b, 0)
  let x = M
  const centres: number[] = []
  const gap = range(r, 0.004, 0.012)
  for (const wsi of ws) {
    const slot = (wsi / tot) * (1 - 2 * M)
    const w = slot * range(r, 0.62, 0.9)
    const cx = x + slot / 2 + (slot - w) * range(r, -0.3, 0.3)
    centres.push(cx)
    x += slot
    const top = range(r, M + 0.04, gy - 0.4)
    let yb = gy
    let width = w
    for (let piece = 0; piece < 8 && yb > top; piece++) {
      // pieces keep their own proportions; only the top margin of the sheet caps them
      const room = yb - M
      if (room < 0.04)
        break
      let k = weighted(r, PIECES)
      // a dome or a gable this low would leave a stump: try once more
      if ((k === 'dome' || k === 'tri') && yb - top > 0.12)
        k = weighted(r, PIECES)
      if (k === 'block' || k === 'step') {
        if (k === 'step')
          width *= range(r, 0.55, 0.8)
        const h = Math.min(room, width * range(r, 0.35, 1.2))
        add({ k: 'rect', x: cx - width / 2, y: yb - h, w: width, h })
        yb -= h + gap
      }
      else if (k === 'dome') {
        add({ k: 'half', x: cx, y: yb, r: Math.min(width / 2, room), a: Math.PI })
        break
      }
      else if (k === 'disc' || k === 'ring') {
        const rr = Math.min(width / 2, room / 2) * range(r, 0.7, 1)
        if (k === 'disc')
          add({ k: 'disc', x: cx, y: yb - rr, r: rr })
        else
          add({ k: 'ring', x: cx, y: yb - rr, r: rr, t: rr * range(r, 0.2, 0.4) })
        yb -= 2 * rr + gap
      }
      else if (k === 'tri') {
        const h = Math.min(room, width * range(r, 0.8, 1.4))
        add(triIn(cx - width / 2, yb - h, width, h, 4))
        break
      }
      else {
        const sq = Math.min(width, room)
        add(quarterIn(cx - sq / 2, yb - sq, sq, sq, chance(r, 0.5) ? 2 : 3))
        yb -= sq + gap
      }
    }
  }

  // The ground line bleeds off both sides of the sheet.
  add({ k: 'rect', x: bx.x0 - 0.01, y: gy, w: bx.x1 - bx.x0 + 0.02, h: bt })

  return { els, guides: { h: [gy + bt + 0.03, M], v: centres, rot: 0 } }
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

/** Least-covered spot of the sheet for a w × h block, scanning a grid of candidates. */
function emptiest(r: Rng, boxes: Box[], w: number, h: number): [number, number] {
  const M = 0.07
  const steps = 24
  let best = Infinity
  let bx = M
  let by = M
  const jitter = r() * 0.5
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const x = M + ((i + jitter) / (steps + 1)) * (1 - 2 * M - w)
      const y = M + ((j + jitter) / (steps + 1)) * (1 - 2 * M - h)
      const b = { x0: x - 0.015, y0: y - 0.015, x1: x + w + 0.015, y1: y + h + 0.015 }
      let cover = 0
      for (const o of boxes)
        cover += overlapArea(b, o)
      // prefer spots away from the exact centre on ties
      cover += 1e-4 * (1 - Math.hypot(x + w / 2 - 0.5, y + h / 2 - 0.5))
      if (cover < best) {
        best = cover
        bx = x
        by = y
      }
    }
  }
  return [bx, by]
}

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const d = DENSITY[f.Density]

  const S = Math.min(width, height)
  const ox = (width - S) / 2
  const oy = (height - S) / 2
  // canvas bounds in unit coordinates of the composition square
  const bounds: Box = { x0: -ox / S, y0: -oy / S, x1: (width - ox) / S, y1: (height - oy) / S }

  // Fixed stream order: layout, colour, accent, paper.
  const lay = stream(hash, 'layout')
  const col = stream(hash, 'colour')
  const paint = painter(col, pal)
  let layout: Layout
  switch (f.Composition) {
    case 'Modular': layout = modular(lay, paint, d)
      break
    case 'Golden': layout = golden(lay, paint, d)
      break
    case 'Diagonal': layout = diagonal(lay, paint, d)
      break
    case 'Axis': layout = axis(lay, paint, d)
      break
    default: layout = totem(lay, paint, d, bounds)
  }
  const { els, guides } = layout

  const unit = (rot: number) => {
    ctx.setTransform(S, 0, 0, S, ox, oy)
    if (rot) {
      ctx.translate(0.5, 0.5)
      ctx.rotate(rot)
      ctx.translate(-0.5, -0.5)
    }
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = pal.paper
  ctx.fillRect(0, 0, width, height)

  // Forms.
  if (f.Overlap === 'Overprint')
    ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply'
  for (const el of els) {
    unit(el.rot)
    ctx.fillStyle = el.c
    ctx.beginPath()
    trace(ctx, el.s)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  const boxes = els.map(boxOf)
  if (f.Overlap === 'Cut-out') {
    // every overlap between two forms goes back to paper
    ctx.fillStyle = pal.paper
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        if (overlapArea(boxes[i], boxes[j]) <= 1e-6)
          continue
        ctx.save()
        unit(els[i].rot)
        ctx.beginPath()
        trace(ctx, els[i].s)
        ctx.clip()
        unit(els[j].rot)
        ctx.beginPath()
        trace(ctx, els[j].s)
        ctx.fill()
        ctx.restore()
      }
    }
  }

  // Accent layer.
  const acc = stream(hash, 'accent')
  const accentCol = pal.cols[int(acc, 0, 2)]
  if (f.Accent === 'Rules') {
    unit(guides.rot)
    const t = range(acc, 0.0016, 0.0032)
    const far = 3
    ctx.fillStyle = pal.ink
    const hs = guides.h.length ? Array.from({ length: int(acc, 1, 2) }, () => pick(acc, guides.h)) : []
    const vs = guides.v.length ? Array.from({ length: int(acc, 1, 2) }, () => pick(acc, guides.v)) : []
    for (const y of hs)
      ctx.fillRect(-far, y - t / 2, 2 * far + 1, t)
    for (const x of vs)
      ctx.fillRect(x - t / 2, -far, t, 2 * far + 1)
    if (hs.length && vs.length) {
      const rr = range(acc, 0.008, 0.016)
      ctx.fillStyle = accentCol
      ctx.beginPath()
      ctx.arc(vs[0], hs[0], rr, 0, TAU)
      ctx.fill()
    }
  }
  else if (f.Accent === 'Text bars') {
    // a block of bars standing in for a headline and a few lines of text
    const lines = int(acc, 4, 8)
    const lh = range(acc, 0.014, 0.022)
    const bw = range(acc, 0.15, 0.27)
    const bh = lines * lh + lh * 1.6
    const vertical = chance(acc, 0.15)
    const [w, h] = vertical ? [bh, bw] : [bw, bh]
    const [x, y] = emptiest(acc, boxes, w, h)
    const lens = Array.from({ length: lines }, (_, i) => (i === lines - 1 ? range(acc, 0.25, 0.6) : range(acc, 0.6, 1)))
    const head = range(acc, 0.5, 1)
    unit(0)
    if (vertical) {
      // read bottom to top, as on the spine of a poster
      ctx.translate(x, y + h)
      ctx.rotate(-HALF)
    }
    else {
      ctx.translate(x, y)
    }
    ctx.fillStyle = accentCol
    ctx.fillRect(0, 0, bw * head, lh * 1.1)
    ctx.fillStyle = pal.ink
    lens.forEach((l, i) => ctx.fillRect(0, lh * 1.6 + i * lh + lh * 0.3, bw * l, lh * 0.42))
  }
  else if (f.Accent === 'Dots') {
    const cols = int(acc, 3, 7)
    const rows = int(acc, 2, 6)
    const sp = range(acc, 0.024, 0.042)
    const rr = sp * range(acc, 0.17, 0.3)
    const [x, y] = emptiest(acc, boxes, (cols - 1) * sp + 2 * rr, (rows - 1) * sp + 2 * rr)
    unit(0)
    ctx.fillStyle = chance(acc, 0.5) ? pal.ink : accentCol
    ctx.beginPath()
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cx = x + rr + i * sp
        const cy = y + rr + j * sp
        ctx.moveTo(cx + rr, cy)
        ctx.arc(cx, cy, rr, 0, TAU)
      }
    }
    ctx.fill()
  }

  // Paper: faint specks over the whole sheet, a constant number per unit area.
  const pr = stream(hash, 'paper')
  unit(0)
  const area = (bounds.x1 - bounds.x0) * (bounds.y1 - bounds.y0)
  const specks = Math.round(900 * area)
  ctx.fillStyle = pal.dark ? '#ffffff' : '#000000'
  for (let i = 0; i < specks; i++) {
    const x = bounds.x0 + pr() * (bounds.x1 - bounds.x0)
    const y = bounds.y0 + pr() * (bounds.y1 - bounds.y0)
    const s = 0.0007 + pr() * 0.0012
    ctx.globalAlpha = 0.04 + pr() * 0.08
    ctx.fillRect(x, y, s, s * (0.6 + pr() * 0.8))
  }
  ctx.restore()
}

export default {
  slug: 'bauhaus',
  title: 'Bauhaus',
  summary: 'Geometric posters in the modernist tradition: discs, quarter circles, squares, triangles and bars set on a module grid, golden sections, a tilted axis or a ground line.',
  order: 510,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xba0aba07 ("gallery" stream, 64-hex candidates): the first
  // hash found for each Palette x Composition pair, twelve pairs in the order
  // found, except that the eleventh (Dessau totem, primary colours on a ground
  // line) is moved first to serve as the cover. 0xba0aba07 is the first seed
  // counting up from 0xba0aba05 whose twelve pairs cover every palette and
  // every composition.
  gallery: [
    '0xa8d019fb1ce566365d450ee4f31dcd6fc081e20292a84dd0be8ad208d5d29949',
    '0xa469130a40ff0677e9a287b8a0924667572bc359f8e88c6882cb1ba1202e102c',
    '0x13e47da09a777cc319bbd0d23567f674d91a63caeb0ef54dfd3c43cf01c42b34',
    '0x59b1ced6436cc81789ae47f547fe4a961a48666c82168941af7c9af343bf4aa2',
    '0xed0ac789ec05e9408491b79c1a87fd398877eb5667fb9252a5b55c4edcf401fa',
    '0x213155011f50c209a0868d5458d2b859fdb9f2b912b7a9b8dbfb366aee9ff067',
    '0x6d79b6abbe84e765345e16dba7fca003eca93d612c322248c2f68be551a98c72',
    '0x81402c24eb1035cabc2a9bcc06877aabd1c58313b9d901ddfbb211c02b83dc93',
    '0x7b7c4def2afbcc4b04c4bd04e2e565fcd52061a73e36e15f2f535277f7c6e028',
    '0x182e2dfeefede4efc40671ff2e3115abe5e0af3e4199833ca70d31f9fb2e2fda',
    '0xdcf0039505398daacf6008d91175fd11b9cf87cdafeb232465934870c0a43423',
    '0x618717704e23e8cd2fc86ba1ebabe855ce63dd44ab598f1ba14a66e661bb0635',
  ],
} satisfies Series
