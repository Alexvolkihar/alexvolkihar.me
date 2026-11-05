// Invented alphabets for the "Asemic" series.
//
// A glyph is a handful of strokes, each one a short list of control points in
// "x-height units": the baseline is y = 0, the x-height line is y = -1 (y
// points down, like the canvas), ascenders reach -asc and descenders +desc.
// Every script draws its glyphs from a small stroke vocabulary with rules of
// its own, and every alphabet keeps only part of that vocabulary, so the
// glyphs of one piece look related, like letters of one hand.

import type { Rng } from '../random'
import { chance, int, pick, range } from '../random'

export type Script = 'Looped' | 'Angular' | 'Hanging' | 'Geometric'

export interface Stroke {
  /** Flat list of control points: x0, y0, x1, y1... */
  p: number[]
  /** Smooth curve through the points (else a polyline with sharp corners). */
  smooth: boolean
  /** A single touch of the pen (p holds one point). */
  dot: boolean
}

export interface Glyph {
  /** Cursive scripts: the stroke that joins the previous and next glyphs. */
  main: Stroke | null
  strokes: Stroke[]
  /** Advance width. */
  w: number
  top: number
  bottom: number
}

export interface Alphabet {
  script: Script
  glyphs: Glyph[]
  /** Cumulative Zipf-like frequencies, aligned with glyphs. */
  cumul: number[]
  /** Horizontal shear applied to every glyph (handwriting slant). */
  slant: number
  /** Instance jitter, in x-height units. */
  jitter: number
  /** Gap between two glyphs of a word. */
  spacing: number
  /** Chance that two glyphs of a word are joined by a connecting stroke. */
  joinProb: number
  /** Words hang from a continuous headline. */
  headline: boolean
  asc: number
  desc: number
}

const S = (p: number[], smooth = true): Stroke => ({ p, smooth, dot: false })
const D = (x: number, y: number): Stroke => ({ p: [x, y], smooth: false, dot: true })

/** Unique, per-glyph perturbation of control points (not per instance). */
function wobble(r: Rng, p: number[], amt: number): number[] {
  return p.map(v => v + (r() - 0.5) * 2 * amt)
}

// ---------------------------------------------------------------------------
// Diacritics, shared by every script: an alphabet keeps one to three kinds.
// ---------------------------------------------------------------------------

type DiaKind = 'dot' | 'dots' | 'dash' | 'caret' | 'arc' | 'under' | 'tick'
const DIAS: DiaKind[] = ['dot', 'dots', 'dash', 'caret', 'arc', 'under', 'tick']

function diacritic(kind: DiaKind, cx: number, top: number, bottom: number): Stroke[] {
  const y = Math.min(top, -1) - 0.42
  switch (kind) {
    case 'dot': return [D(cx, y)]
    case 'dots': return [D(cx - 0.17, y), D(cx + 0.17, y)]
    case 'dash': return [S([cx - 0.2, y + 0.04, cx + 0.22, y - 0.04], false)]
    case 'caret': return [S([cx - 0.18, y + 0.1, cx, y - 0.12, cx + 0.18, y + 0.1], false)]
    case 'arc': return [S([cx - 0.22, y - 0.05, cx, y + 0.1, cx + 0.22, y - 0.08])]
    case 'under': return [D(cx, Math.max(bottom, 0) + 0.4)]
    case 'tick': return [S([cx - 0.05, y - 0.12, cx + 0.12, y + 0.12], false)]
  }
}

// ---------------------------------------------------------------------------
// Looped: a cursive hand. Each glyph is one continuous stroke, from an entry
// on the baseline to an exit, built from two or three "moves" (humps, cups,
// ovals, eyes, loops), so that consecutive glyphs chain into words.
// ---------------------------------------------------------------------------

type Move = (x: number, A: number, Dd: number) => { p: number[], adv: number }

const MOVES: Record<string, Move> = {
  hump: x => ({ p: [x + 0.18, -0.82, x + 0.42, -1.02, x + 0.6, -0.62, x + 0.62, 0], adv: 0.68 }),
  cup: x => ({ p: [x + 0.06, -1, x + 0.1, -0.22, x + 0.36, 0.02, x + 0.6, -0.45, x + 0.66, -1, x + 0.68, -0.08], adv: 0.74 }),
  oval: x => ({ p: [x + 0.56, -0.86, x + 0.3, -1.02, x + 0.05, -0.62, x + 0.14, -0.04, x + 0.48, -0.16, x + 0.6, -0.92, x + 0.64, -0.02], adv: 0.7 }),
  eye: x => ({ p: [x + 0.38, -0.52, x + 0.44, -0.86, x + 0.2, -0.96, x + 0.04, -0.52, x + 0.3, -0.02, x + 0.58, -0.22], adv: 0.62 }),
  loopUp: (x, A) => ({ p: [x + 0.3, -0.72, x + 0.46, -A + 0.28, x + 0.3, -A, x + 0.12, -A + 0.34, x + 0.14, -0.2, x + 0.34, 0], adv: 0.5 }),
  loopDown: (x, _A, Dd) => ({ p: [x + 0.42, -0.92, x + 0.38, 0, x + 0.28, Dd, x + 0.06, Dd - 0.22, x + 0.22, 0.02, x + 0.52, -0.38], adv: 0.58 }),
  spike: x => ({ p: [x + 0.26, -1, x + 0.3, -0.12, x + 0.46, 0], adv: 0.48 }),
  curl: x => ({ p: [x + 0.32, -0.92, x + 0.1, -1.02, x + 0.14, -0.7, x + 0.46, -0.86, x + 0.42, 0], adv: 0.56 }),
  wave: x => ({ p: [x + 0.16, -0.62, x + 0.36, -0.86, x + 0.56, -0.5, x + 0.74, -0.8, x + 0.78, -0.04], adv: 0.82 }),
}

function loopedGlyph(r: Rng, moves: string[], dias: DiaKind[], pDia: number, A: number, Dd: number): Glyph {
  const p = [0, 0]
  let x = 0
  const n = r() < 0.18 ? 1 : r() < 0.85 ? 2 : 3
  let usedDot = false
  for (let i = 0; i < n; i++) {
    const m = MOVES[pick(r, moves)](x, A, Dd)
    p.push(...wobble(r, m.p, 0.07))
    if (m.p.length === 6)
      usedDot = true
    x += m.adv
  }
  p.push(x + 0.12, -0.2)
  const main = S(p)
  const strokes: Stroke[] = []
  let top = -1
  let bottom = 0
  for (let i = 1; i < p.length; i += 2) {
    top = Math.min(top, p[i])
    bottom = Math.max(bottom, p[i])
  }
  if ((usedDot && r() < 0.6) || chance(r, pDia))
    strokes.push(...diacritic(usedDot ? 'dot' : pick(r, dias), range(r, 0.25, 0.75) * x, top, bottom))
  if (top < -1.3 && chance(r, 0.3)) {
    // a bar across the ascender
    const yb = range(r, -1.25, -1.05)
    strokes.push(S([x * 0.15, yb, x * 0.75, yb - 0.06], false))
  }
  return { main, strokes, w: x + 0.12, top, bottom }
}

// ---------------------------------------------------------------------------
// Angular: polylines on a coarse grid with sharp corners and terminal ticks.
// The alphabet builds a few skeletons; each glyph mirrors, stretches and
// decorates one of them.
// ---------------------------------------------------------------------------

function angularSkeleton(r: Rng, levels: number[]): number[] {
  const xs = [0, 0.5, 1]
  const n = int(r, 3, 4)
  const p: number[] = []
  let ix = int(r, 0, 2)
  let iy = int(r, 0, levels.length - 1)
  p.push(xs[ix], levels[iy])
  for (let i = 1; i < n; i++) {
    let jx = ix
    let jy = iy
    while (jx === ix && jy === iy) {
      jx = r() < 0.7 ? int(r, 0, 2) : ix
      jy = int(r, 0, levels.length - 1)
    }
    ix = jx
    iy = jy
    p.push(xs[ix], levels[iy])
  }
  return p
}

function angularGlyph(r: Rng, skels: number[][], dias: DiaKind[], pDia: number, A: number, Dd: number, tick: number): Glyph {
  const w = range(r, 0.55, 0.85)
  const sk = pick(r, skels)
  const flip = r() < 0.5
  const pts: number[] = []
  for (let i = 0; i < sk.length; i += 2) {
    const sx = flip ? 1 - sk[i] : sk[i]
    let y = sk[i + 1]
    // stretch some extremities into ascenders or descenders
    if (y === -1 && r() < 0.18)
      y = -A
    else if (y === 0 && r() < 0.12)
      y = Dd
    pts.push(sx * w, y)
  }
  const strokes: Stroke[] = []
  const main = wobble(r, pts, 0.06)
  if (chance(r, tick)) {
    // a hairline lead-in tick before the first point
    main.unshift(main[0] - 0.14, main[1] + 0.1)
  }
  strokes.push(S(main, false))
  if (chance(r, 0.55)) {
    // a bar or chevron hanging from one vertex of the skeleton
    const k = int(r, 0, pts.length / 2 - 1) * 2
    const ex = pick(r, [0, 0.5, 1]) * w
    const ey = pick(r, [-1, -0.5, 0])
    if (Math.abs(ex - pts[k]) + Math.abs(ey - pts[k + 1]) > 0.3) {
      const bar = [pts[k], pts[k + 1], ex, ey]
      if (chance(r, 0.3))
        bar.push(ex + (flip ? -0.16 : 0.16), ey - 0.18)
      strokes.push(S(wobble(r, bar, 0.05), false))
    }
  }
  let top = -1
  let bottom = 0
  for (const s of strokes) {
    for (let i = 1; i < s.p.length; i += 2) {
      top = Math.min(top, s.p[i])
      bottom = Math.max(bottom, s.p[i])
    }
  }
  if (chance(r, pDia))
    strokes.push(...diacritic(pick(r, dias), w * 0.5, top, bottom))
  return { main: null, strokes, w, top, bottom }
}

// ---------------------------------------------------------------------------
// Hanging: glyph bodies hang from the headline of their word (drawn once per
// word, see the layout), with an occasional flag above the line.
// ---------------------------------------------------------------------------

type Part = (w: number, Dd: number) => Stroke
const PARTS: Record<string, Part> = {
  stem: w => S([w * 0.78, -1, w * 0.8, -0.12, w * 0.66, 0.02]),
  belly: w => S([w * 0.5, -1, w * 0.08, -0.72, w * 0.16, -0.18, w * 0.52, -0.04, w * 0.72, -0.4]),
  knot: w => S([w * 0.42, -1, w * 0.38, -0.62, w * 0.08, -0.48, w * 0.2, -0.24, w * 0.48, -0.44, w * 0.32, -0.02]),
  fork: w => S([w * 0.2, -1, w * 0.42, -0.5, w * 0.82, -0.52], false),
  tail: (w, Dd) => S([w * 0.62, -1, w * 0.66, -0.05, w * 0.48, Dd * 0.82, w * 0.14, Dd * 0.6]),
  hook: w => S([w * 0.32, -1, w * 0.3, -0.34, w * 0.1, -0.04, -w * 0.06, -0.32]),
  chev: w => S([w * 0.12, -1, w * 0.5, -0.36, w * 0.86, -1], false),
}

function hangingGlyph(r: Rng, parts: string[], dias: DiaKind[], pDia: number, A: number, Dd: number): Glyph {
  const w = range(r, 0.6, 0.9)
  const strokes: Stroke[] = []
  const a = pick(r, parts)
  const pa = PARTS[a](w, Dd)
  strokes.push({ ...pa, p: wobble(r, pa.p, 0.06) })
  if (chance(r, 0.5)) {
    let b = pick(r, parts)
    if (b === a)
      b = 'stem'
    const pb = PARTS[b](w, Dd)
    strokes.push({ ...pb, p: wobble(r, pb.p, 0.06) })
  }
  let top = -1
  if (chance(r, 0.22)) {
    // a flag rising above the headline
    const fx = range(r, 0.3, 0.7) * w
    strokes.push(S(wobble(r, [fx, -1, fx + 0.1, -1 - (A - 1) * 0.6, fx + 0.34, -A + 0.1], 0.05)))
    top = -A
  }
  let bottom = 0
  for (const s of strokes) {
    for (let i = 1; i < s.p.length; i += 2)
      bottom = Math.max(bottom, s.p[i])
  }
  if (chance(r, pDia)) {
    // an arc would merge into the headline: use a dot instead
    const k = pick(r, dias)
    strokes.push(...diacritic(k === 'arc' ? 'dot' : k, w * 0.5, top - 0.15, bottom))
  }
  return { main: null, strokes, w, top, bottom }
}

// ---------------------------------------------------------------------------
// Geometric: rings, half rings, stems and bars, as if drawn with compass and
// rule. Shapes snap to a box of fixed proportions.
// ---------------------------------------------------------------------------

function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, sweep: number): number[] {
  const n = Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 4)))
  const p: number[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n
    p.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry)
  }
  return p
}

type Shape = (w: number, A: number, Dd: number, r: Rng) => Stroke
const SHAPES: Record<string, Shape> = {
  ring: w => S(arcPts(w * 0.5, -0.5, w * 0.48, 0.5, -Math.PI / 2, Math.PI * 2.1)),
  halfL: w => S(arcPts(w * 0.6, -0.5, w * 0.5, 0.5, -Math.PI / 2, -Math.PI)),
  halfR: w => S(arcPts(w * 0.4, -0.5, w * 0.5, 0.5, -Math.PI / 2, Math.PI)),
  halfU: w => S(arcPts(w * 0.5, -0.55, w * 0.46, 0.5, 0, Math.PI)),
  halfN: w => S(arcPts(w * 0.5, -0.45, w * 0.46, 0.5, Math.PI, Math.PI)),
  stem: (w, A, Dd, r) => {
    const x = pick(r, [0.04, 0.5, 0.96]) * w
    const k = r()
    return S([x, k < 0.3 ? -A : -1, x, k > 0.8 ? Dd : 0], false)
  },
  bar: (w, _A, _D, r) => {
    const y = pick(r, [-1, -0.5, 0])
    return S([0, y, w, y], false)
  },
  diag: (w, _A, _D, r) => (r() < 0.5 ? S([0, 0, w, -1], false) : S([0, -1, w, 0], false)),
  ringUp: (w, A) => S(arcPts(w * 0.5, -1 - (A - 1) * 0.5, (A - 1) * 0.42, (A - 1) * 0.42, 0, Math.PI * 2.1)),
}

function geometricGlyph(r: Rng, shapes: string[], dias: DiaKind[], pDia: number, A: number, Dd: number): Glyph {
  const w = range(r, 0.62, 0.86)
  const strokes: Stroke[] = []
  const n = r() < 0.6 ? 2 : r() < 0.7 ? 1 : 3
  const used = new Set<string>()
  for (let i = 0; i < n; i++) {
    const k = pick(r, shapes)
    if (used.has(k))
      continue
    used.add(k)
    const s = SHAPES[k](w, A, Dd, r)
    strokes.push({ ...s, p: wobble(r, s.p, 0.02) })
  }
  let top = -1
  let bottom = 0
  for (const s of strokes) {
    for (let i = 1; i < s.p.length; i += 2) {
      top = Math.min(top, s.p[i])
      bottom = Math.max(bottom, s.p[i])
    }
  }
  if (chance(r, pDia))
    strokes.push(...diacritic(pick(r, dias), w * 0.5, top, bottom))
  return { main: null, strokes, w, top, bottom }
}

// ---------------------------------------------------------------------------

/** Keeps k distinct entries of xs, in a random order. */
function subset<T>(r: Rng, xs: readonly T[], k: number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, k)
}

export function makeAlphabet(r: Rng, script: Script): Alphabet {
  const n = int(r, 20, 40)
  const A = range(r, 1.75, 2.1)
  const Dd = range(r, 0.7, 0.95)
  const dias = subset(r, DIAS, int(r, 1, 3))
  const pDia = range(r, 0.12, 0.32)
  const glyphs: Glyph[] = []

  let slant = 0
  let jitter = 0.035
  let spacing = 0.2
  let joinProb = 0
  if (script === 'Looped') {
    const keys = Object.keys(MOVES)
    const moves = subset(r, keys, int(r, 5, 7))
    for (let i = 0; i < n; i++)
      glyphs.push(loopedGlyph(r, moves, dias, pDia, A, Dd))
    slant = range(r, 0.12, 0.34)
    spacing = 0.02
    joinProb = range(r, 0.75, 0.95)
  }
  else if (script === 'Angular') {
    const levels = [-1, -0.5, 0]
    const skels = Array.from({ length: int(r, 4, 6) }, () => angularSkeleton(r, levels))
    const tick = range(r, 0.2, 0.7)
    for (let i = 0; i < n; i++)
      glyphs.push(angularGlyph(r, skels, dias, pDia, A, Dd, tick))
    slant = range(r, -0.05, 0.22)
    spacing = range(r, 0.18, 0.28)
    joinProb = range(r, 0, 0.12)
  }
  else if (script === 'Hanging') {
    const parts = subset(r, Object.keys(PARTS), int(r, 4, 6))
    for (let i = 0; i < n; i++)
      glyphs.push(hangingGlyph(r, parts, dias, pDia, A, Dd))
    slant = range(r, -0.04, 0.06)
    spacing = range(r, 0.04, 0.12)
  }
  else {
    // rings are kept in only some alphabets, or every glyph turns into an o
    const shapes = subset(r, Object.keys(SHAPES), int(r, 5, 7)).filter(k => !k.startsWith('ring') || r() < 0.5)
    for (let i = 0; i < n; i++)
      glyphs.push(geometricGlyph(r, shapes, dias, pDia, A, Dd))
    jitter = 0.018
    spacing = range(r, 0.22, 0.32)
    joinProb = range(r, 0, 0.06)
  }

  // true extent, diacritics included
  for (const G of glyphs) {
    for (const st of G.main ? [G.main, ...G.strokes] : G.strokes) {
      for (let i = 1; i < st.p.length; i += 2) {
        G.top = Math.min(G.top, st.p[i] - (st.dot ? 0.1 : 0))
        G.bottom = Math.max(G.bottom, st.p[i] + (st.dot ? 0.1 : 0))
      }
    }
  }

  // Zipf-like letter frequencies: a few glyphs carry most of the text.
  const cumul: number[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    t += 1 / (i + 2) ** 0.85
    cumul.push(t)
  }
  for (let i = 0; i < n; i++)
    cumul[i] /= t

  return { script, glyphs, cumul, slant, jitter, spacing, joinProb, headline: script === 'Hanging', asc: A, desc: Dd }
}

export function pickGlyph(r: Rng, a: Alphabet): number {
  const x = r()
  let i = 0
  while (i < a.cumul.length - 1 && a.cumul[i] < x)
    i++
  return i
}

/** A small lexicon, so that words recur through the page as in real text. */
export function makeLexicon(r: Rng, a: Alphabet): number[][] {
  const LEN = [[1, 5], [2, 11], [3, 17], [4, 19], [5, 16], [6, 13], [7, 9], [8, 6], [9, 4]] as const
  const words: number[][] = []
  const n = int(r, 36, 60)
  for (let i = 0; i < n; i++) {
    let x = r() * 100
    let len = 9
    for (const [l, w] of LEN) {
      x -= w
      if (x < 0) {
        len = l
        break
      }
    }
    words.push(Array.from({ length: len }, () => pickGlyph(r, a)))
  }
  return words
}
