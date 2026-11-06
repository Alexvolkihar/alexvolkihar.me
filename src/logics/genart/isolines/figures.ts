// The five figures of the series, each an ordered list of SDF primitives,
// and the events that disturb the field around them.
//
// Every builder draws from its own stream in a fixed order, so the same hash
// always yields the same figure. Coordinates are fractions of the canvas
// short side, centred on the canvas: the figure lives in [-0.5, 0.5]².

import type { Rng } from '../random'
import type { Kind, Prim } from './sdf'
import { chance, int, pick, range } from '../random'
import { bound, evalFigure, prim, rotation } from './sdf'

export type FigureName = 'Emblem' | 'Pair' | 'Constellation' | 'Lattice' | 'Frame'
export type EventName = 'Calm' | 'Seam' | 'Fold' | 'Ripple' | 'Mixed'

const TAU = Math.PI * 2

/** A random solid primitive of about `size`, centred on (x, y). */
function solid(r: Rng, kind: Kind, x: number, y: number, size: number, extra: Partial<Prim> = {}): Prim {
  const turn = rotation(r() * TAU)
  switch (kind) {
    case 'box': {
      const aspect = range(r, 0.45, 1)
      return prim('box', 'union', x, y, size, { h: size * aspect, round: size * range(r, 0, 0.35), ...turn, ...extra })
    }
    case 'capsule': {
      const a = r() * TAU
      const half = size * range(r, 0.9, 1.6)
      return prim('capsule', 'union', x - Math.cos(a) * half, y - Math.sin(a) * half, size * range(r, 0.22, 0.4), {
        x2: x + Math.cos(a) * half,
        y2: y + Math.sin(a) * half,
        ...extra,
      })
    }
    case 'triangle':
      return prim('triangle', 'union', x, y, size * 1.15, { ...turn, ...extra })
    default:
      return prim('circle', 'union', x, y, size, extra)
  }
}

const KINDS: readonly Kind[] = ['circle', 'box', 'capsule', 'triangle']

/** A central body with bites, a halo and a bar, symmetric about the vertical axis. */
function emblem(r: Rng): Prim[] {
  const base = pick(r, ['circle', 'box', 'triangle'] as const)
  const size = range(r, 0.17, 0.24)
  const out: Prim[] = [solid(r, base, 0, range(r, -0.03, 0.03), size, base === 'box' ? { cos: 1, sin: 0 } : base === 'triangle' ? rotation(Math.PI * (r() < 0.5 ? 0 : 1)) : {})]
  // a halo ring around the body
  if (chance(r, 0.7))
    out.push(prim('circle', 'union', 0, 0, size * range(r, 1.35, 1.7), { onion: range(r, 0.008, 0.022), k: range(r, 0.01, 0.04) }))
  // mirrored bites and lugs
  const n = int(r, 1, 3)
  for (let i = 0; i < n; i++) {
    const a = range(r, -0.45, 0.45) * Math.PI
    const dist = size * range(r, 0.75, 1.35)
    const p = solid(r, pick(r, KINDS), Math.abs(Math.cos(a)) * dist + 0.01, Math.sin(a) * dist, size * range(r, 0.25, 0.5), {
      mirror: true,
      k: range(r, 0.01, 0.05),
    })
    p.op = chance(r, 0.55) ? 'cut' : 'union'
    out.push(p)
  }
  // a crossing bar, sometimes
  if (chance(r, 0.5)) {
    const len = size * range(r, 1.4, 2.1)
    out.push(prim('capsule', 'union', -len, 0, range(r, 0.012, 0.03), { x2: len, y2: 0, k: range(r, 0.02, 0.06) }))
  }
  // a central eye cut out, sometimes
  if (chance(r, 0.45))
    out.push(prim('circle', 'cut', 0, 0, size * range(r, 0.22, 0.45), { k: 0.01 }))
  return out
}

/** Two bodies joined by a soft neck. */
function pair(r: Rng): Prim[] {
  const a = r() * TAU
  const gap = range(r, 0.17, 0.25)
  const s1 = range(r, 0.11, 0.17)
  const s2 = range(r, 0.07, 0.14)
  const out: Prim[] = [
    solid(r, pick(r, ['circle', 'box', 'triangle'] as const), Math.cos(a) * gap, Math.sin(a) * gap, s1),
    solid(r, pick(r, ['circle', 'box', 'triangle', 'circle'] as const), -Math.cos(a) * gap, -Math.sin(a) * gap, s2, { k: range(r, 0.1, 0.2) }),
  ]
  // a hole in one of them
  if (chance(r, 0.6)) {
    const side = r() < 0.5 ? 1 : -1
    out.push(solid(r, pick(r, KINDS), side * Math.cos(a) * gap, side * Math.sin(a) * gap, (side > 0 ? s1 : s2) * range(r, 0.3, 0.55), { op: 'cut', k: 0.012 }))
  }
  // a small satellite
  if (chance(r, 0.5)) {
    const b = a + Math.PI / 2 * (r() < 0.5 ? 1 : -1)
    out.push(solid(r, 'circle', Math.cos(b) * range(r, 0.2, 0.3), Math.sin(b) * range(r, 0.2, 0.3), range(r, 0.025, 0.05), { k: range(r, 0.02, 0.06) }))
  }
  return out
}

/** A loose scatter of small shapes, merged where they come close. */
function constellation(r: Rng): Prim[] {
  const n = int(r, 6, 10)
  const out: Prim[] = []
  for (let i = 0; i < n; i++) {
    const a = r() * TAU
    const rad = 0.36 * Math.sqrt(r())
    out.push(solid(r, pick(r, KINDS), Math.cos(a) * rad, Math.sin(a) * rad, range(r, 0.035, 0.085), { k: range(r, 0.02, 0.07) }))
  }
  const cuts = int(r, 1, 2)
  for (let i = 0; i < cuts; i++)
    out.push(solid(r, pick(r, KINDS), range(r, -0.25, 0.25), range(r, -0.25, 0.25), range(r, 0.04, 0.08), { op: 'cut', k: 0.015 }))
  return out
}

/** A grid of alternating shapes, some missing, graded in size across the grid. */
function lattice(r: Rng): Prim[] {
  const n = int(r, 3, 5)
  const pitch = 0.68 / n
  const turn = rotation(pick(r, [0, Math.PI / 4, Math.PI / 12]))
  const kinds = [pick(r, KINDS), pick(r, ['circle', 'box'] as const)]
  const gx = Math.cos(r() * TAU)
  const gy = Math.sin(r() * TAU)
  const k = range(r, 0.005, 0.03)
  const out: Prim[] = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const keep = r()
      const u = (i - (n - 1) / 2) * pitch
      const v = (j - (n - 1) / 2) * pitch
      if (keep < 0.2)
        continue
      const grade = 0.5 + 0.5 * ((u * gx + v * gy) / 0.35)
      const size = pitch * (0.16 + 0.22 * Math.max(0, Math.min(1, grade)))
      const x = turn.cos * u - turn.sin * v
      const y = turn.sin * u + turn.cos * v
      out.push(solid(r, kinds[(i + j) % 2], x, y, size, { k, ...turn }))
    }
  }
  if (!out.length)
    out.push(prim('circle', 'union', 0, 0, 0.1))
  // one large cut through the grid
  if (chance(r, 0.6))
    out.push(prim('circle', 'cut', range(r, -0.2, 0.2), range(r, -0.2, 0.2), range(r, 0.1, 0.2), { onion: range(r, 0.01, 0.03), k: 0.01 }))
  return out
}

/** A hollow frame with an object inside and windows cut through it. */
function frame(r: Rng): Prim[] {
  const w = range(r, 0.26, 0.34)
  const h = w * range(r, 0.7, 1)
  const tall = r() < 0.5
  const out: Prim[] = [
    prim('box', 'union', 0, 0, tall ? h : w, { h: tall ? w : h, round: range(r, 0, 0.08), onion: range(r, 0.012, 0.03) }),
  ]
  // inner object
  out.push(solid(r, pick(r, ['circle', 'triangle', 'box'] as const), range(r, -0.06, 0.06), range(r, -0.06, 0.06), range(r, 0.07, 0.13), { k: range(r, 0.02, 0.05) }))
  // a bar from the frame to the object
  if (chance(r, 0.65)) {
    const a = int(r, 0, 3) * Math.PI / 2
    out.push(prim('capsule', 'union', 0, 0, range(r, 0.008, 0.02), { x2: Math.cos(a) * w * 1.1, y2: Math.sin(a) * w * 1.1, k: range(r, 0.02, 0.05) }))
  }
  // windows through the frame
  const n = int(r, 1, 3)
  for (let i = 0; i < n; i++) {
    const a = r() * TAU
    out.push(prim('circle', 'cut', Math.cos(a) * w, Math.sin(a) * h, range(r, 0.03, 0.06), { mirror: chance(r, 0.5), k: 0.01 }))
  }
  return out
}

const BUILDERS: Record<FigureName, (r: Rng) => Prim[]> = {
  Emblem: emblem,
  Pair: pair,
  Constellation: constellation,
  Lattice: lattice,
  Frame: frame,
}

export function buildFigure(r: Rng, name: FigureName): Prim[] {
  return bound(BUILDERS[name](r))
}

// ---------------------------------------------------------------------------
// Events: local disturbances of the field.
//   seam   — a short stitched strip across which the lines step by a phase,
//            the step dying out away from the strip;
//   fold   — a crease: a V-shaped ridge added along a short straight
//            segment, which kinks every line that crosses it into a chevron;
//   ripple — a damped standing wave added to the field around a point, kept
//            gentle enough that the lines wave without tearing into loops.
// ---------------------------------------------------------------------------

export interface Seam { cx: number, cy: number, ux: number, uy: number, len: number, width: number, reach: number, step: number }
export interface Fold { cx: number, cy: number, ux: number, uy: number, len: number, slope: number, reach: number }
export interface Ripple { cx: number, cy: number, amp: number, wave: number, radius: number }
export interface Events { seams: Seam[], folds: Fold[], ripples: Ripple[] }

/**
 * Moves (x, y) onto the level `target` of the figure by a few Newton steps
 * along the numerical gradient, so that an event lands where lines are.
 */
function snap(prims: readonly Prim[], x: number, y: number, target: number): readonly [number, number] {
  const e = 1e-4
  for (let i = 0; i < 4; i++) {
    const d = evalFigure(prims, x, y) - target
    const gx = (evalFigure(prims, x + e, y) - evalFigure(prims, x - e, y)) / (2 * e)
    const gy = (evalFigure(prims, x, y + e) - evalFigure(prims, x, y - e)) / (2 * e)
    const g2 = gx * gx + gy * gy
    if (g2 < 1e-6)
      break
    x = Math.max(-0.42, Math.min(0.42, x - d * gx / g2))
    y = Math.max(-0.42, Math.min(0.42, y - d * gy / g2))
  }
  return [x, y]
}

/**
 * Events near the figure. `period` is the length of one rhythm period of the
 * field, `spacing` the gap between two lines (fractions of the short side).
 */
export function buildEvents(r: Rng, name: EventName, prims: readonly Prim[], spacing: number, period: number): Events {
  const ev: Events = { seams: [], folds: [], ripples: [] }
  const kinds: Array<'seam' | 'fold' | 'ripple'> = []
  if (name === 'Seam' || name === 'Fold' || name === 'Ripple') {
    const n = int(r, 1, 3)
    for (let i = 0; i < n; i++)
      kinds.push(name === 'Seam' ? 'seam' : name === 'Fold' ? 'fold' : 'ripple')
  }
  else if (name === 'Mixed') {
    kinds.push('seam', 'fold', 'ripple')
    kinds.push(pick(r, ['seam', 'fold', 'ripple'] as const))
  }
  for (const k of kinds) {
    // every event draws the same number of values, whatever its kind
    const [cx, cy] = snap(prims, range(r, -0.3, 0.3), range(r, -0.3, 0.3), range(r, 0, 4) * period)
    const a = r() * TAU
    const s1 = r()
    const s2 = r()
    const s3 = r()
    if (k === 'seam') {
      ev.seams.push({ cx, cy, ux: Math.cos(a), uy: Math.sin(a), len: 0.16 + s1 * 0.18, width: spacing * (1.5 + s2 * 2), reach: 0.1 + s3 * 0.14, step: period * (0.5 + s2 * 0.5) })
    }
    else if (k === 'fold') {
      ev.folds.push({ cx, cy, ux: Math.cos(a), uy: Math.sin(a), len: 0.14 + s1 * 0.16, slope: 0.7 + s2 * 0.6, reach: 0.04 + s3 * 0.04 })
    }
    else {
      const wave = spacing * (4 + s2 * 4)
      ev.ripples.push({ cx, cy, amp: wave * (0.09 + s1 * 0.05), wave, radius: 0.09 + s3 * 0.08 })
    }
  }
  return ev
}

function smooth(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** The disturbed field at (x, y): the figure's distance plus every event's contribution. */
export function makeField(prims: readonly Prim[], ev: Events): (x: number, y: number) => number {
  const { seams, folds, ripples } = ev
  return (x: number, y: number) => {
    let v = evalFigure(prims, x, y)
    for (const f of folds) {
      const dx = x - f.cx
      const dy = y - f.cy
      const u = dx * f.ux + dy * f.uy
      if (Math.abs(u) >= f.len)
        continue
      const n = Math.abs(-dx * f.uy + dy * f.ux)
      v += f.slope * n * Math.exp(-n / f.reach) * (1 - smooth(0.5 * f.len, f.len, Math.abs(u)))
    }
    for (const s of seams) {
      const dx = x - s.cx
      const dy = y - s.cy
      const u = dx * s.ux + dy * s.uy
      if (Math.abs(u) >= s.len)
        continue
      const n = -dx * s.uy + dy * s.ux
      const along = 1 - smooth(0.6 * s.len, s.len, Math.abs(u))
      const across = smooth(-s.width, s.width, n) * Math.exp(-Math.max(n, 0) / s.reach)
      v += s.step * along * across
    }
    for (const p of ripples) {
      const dx = x - p.cx
      const dy = y - p.cy
      const d2 = dx * dx + dy * dy
      const lim = 2.5 * p.radius
      if (d2 >= lim * lim)
        continue
      const d = Math.sqrt(d2)
      v += p.amp * Math.sin(TAU * d / p.wave) * Math.exp(-d2 / (p.radius * p.radius))
    }
    return v
  }
}
