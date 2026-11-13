// Flat primitives for the Kaleido series, and the generator that scatters
// them over one fundamental domain.
//
// Coordinates are fractions of the canvas short side, in the frame of the
// domain; the caller places the domain with a transform that includes the
// scale, so a path is built once and filled in every mirrored copy.

import type { Rng } from '../random'
import type { Pt } from './geometry'
import { chance, int, pick, range, weighted } from '../random'

export type Kind = 'leaf' | 'drop' | 'lune' | 'dots' | 'disc' | 'quarter' | 'arc' | 'stripes' | 'steps' | 'bar'

export interface Shape {
  kind: Kind
  x: number
  y: number
  rot: number
  size: number
  p1: number
  p2: number
  /** Index into the piece's inks, or -1 for a cut-out in the ground colour. */
  ink: number
}

/** Where shapes may sit inside one fundamental domain. */
export interface Region {
  interior: (r: Rng) => Pt
  /** A point on a mirror edge, with the direction of that edge, turned so the domain lies on its left (direction + pi / 2 points inwards). */
  edge: (r: Rng) => readonly [Pt, number]
  /** A corner of the domain: a centre of rotation. */
  vertex: (r: Rng) => Pt
  /** Characteristic size of a large shape at this point. */
  scale: (p: Pt) => number
}

export type MotifWeights = ReadonlyArray<readonly [Kind, number]>

const TAU = Math.PI * 2

export function buildPath(s: Shape): Path2D {
  const P = new Path2D()
  const { x, y, rot, size } = s
  const ux = Math.cos(rot)
  const uy = Math.sin(rot)
  // local frame: u along rot, v across
  const at = (u: number, v: number): Pt => [x + ux * u - uy * v, y + uy * u + ux * v]
  const poly = (pts: Pt[]) => {
    P.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++)
      P.lineTo(pts[i][0], pts[i][1])
    P.closePath()
  }
  switch (s.kind) {
    case 'leaf': {
      const w = size * s.p1
      const tip = at(size, 0)
      const c1 = at(size / 2, w)
      const c2 = at(size / 2, -w)
      P.moveTo(x, y)
      P.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1])
      P.quadraticCurveTo(c2[0], c2[1], x, y)
      P.closePath()
      break
    }
    case 'drop': {
      const r = (size * s.p1) / 2
      const c = at(r, 0)
      const tip = at(size, 0)
      const phi = Math.acos(r / (size - r))
      P.moveTo(tip[0], tip[1])
      P.arc(c[0], c[1], r, rot + phi, rot + TAU - phi)
      P.closePath()
      break
    }
    case 'lune': {
      const rA = size / 2
      const rB = rA * s.p1
      const d = rA * s.p2
      const bx = x + ux * d
      const by = y + uy * d
      const al = Math.acos((d * d + rA * rA - rB * rB) / (2 * d * rA))
      const be = Math.acos((d * d + rB * rB - rA * rA) / (2 * d * rB))
      P.arc(x, y, rA, rot + al, rot + TAU - al)
      P.arc(bx, by, rB, rot + Math.PI + be, rot + Math.PI - be, true)
      P.closePath()
      break
    }
    case 'dots': {
      const k = Math.round(s.p1)
      const r0 = size * s.p2
      let u = r0
      for (let j = 0; j < k; j++) {
        const r = r0 * (1 - 0.14 * j)
        const c = at(u, 0)
        P.moveTo(c[0] + r, c[1])
        P.arc(c[0], c[1], r, 0, TAU)
        u += r + r0 * 0.9 + r * (1 - 0.14)
      }
      break
    }
    case 'disc':
      P.moveTo(x + size / 2, y)
      P.arc(x, y, size / 2, 0, TAU)
      break
    case 'quarter':
      P.moveTo(x, y)
      P.arc(x, y, size, rot, rot + s.p1)
      P.closePath()
      break
    case 'arc': {
      const sweep = s.p2
      const ri = size * s.p1
      if (sweep >= TAU - 1e-6) {
        P.moveTo(x + size, y)
        P.arc(x, y, size, 0, TAU)
        P.moveTo(x + ri, y)
        P.arc(x, y, ri, TAU, 0, true)
      }
      else {
        P.arc(x, y, size, rot, rot + sweep)
        P.arc(x, y, ri, rot + sweep, rot, true)
        P.closePath()
      }
      break
    }
    case 'stripes': {
      const k = Math.round(s.p1)
      const t = size / (2 * k - 1)
      const L = size * s.p2
      for (let j = 0; j < k; j++) {
        const v = -size / 2 + j * 2 * t
        poly([at(-L / 2, v), at(L / 2, v), at(L / 2, v + t), at(-L / 2, v + t)])
      }
      break
    }
    case 'steps': {
      const k = Math.round(s.p1)
      const h = (size * s.p2) / k
      const left: Pt[] = []
      const right: Pt[] = []
      for (let j = 0; j < k; j++) {
        const w = (size * (1 - (0.85 * j) / k)) / 2
        left.push(at(j * h, -w), at((j + 1) * h, -w))
        right.push(at(j * h, w), at((j + 1) * h, w))
      }
      poly([...left, ...right.reverse()])
      break
    }
    case 'bar': {
      const t = (size * s.p1) / 2
      poly([at(0, -t), at(size, -t), at(size, t), at(0, t)])
      break
    }
  }
  return P
}

/** A radius around the anchor point that contains the whole shape. */
export function extent(s: Shape): number {
  switch (s.kind) {
    case 'lune':
    case 'disc':
      return s.size / 2
    case 'dots':
      return s.size * s.p2 * (1 + 2.9 * Math.round(s.p1))
    case 'stripes':
      return Math.hypot((s.size * s.p2) / 2, s.size / 2)
    case 'steps':
      return Math.hypot(s.size * s.p2, s.size / 2)
    case 'bar':
      return Math.hypot(s.size, (s.size * s.p1) / 2)
    default:
      return s.size
  }
}

function params(r: Rng, kind: Kind): [number, number] {
  switch (kind) {
    case 'leaf': return [range(r, 0.3, 0.62), 0]
    case 'drop': return [range(r, 0.38, 0.7), 0]
    case 'lune': return [range(r, 0.78, 1.05), range(r, 0.32, 0.7)]
    case 'dots': return [int(r, 2, 4), range(r, 0.09, 0.15)]
    case 'disc': return [0, 0]
    case 'quarter': return [pick(r, [Math.PI / 2, Math.PI / 2, Math.PI, 1.5 * Math.PI]), 0]
    case 'arc': return [range(r, 0.5, 0.84), chance(r, 0.3) ? TAU : range(r, 0.6, 1.6) * Math.PI]
    case 'stripes': return [int(r, 3, 5), range(r, 1.1, 1.9)]
    case 'steps': return [int(r, 2, 4), range(r, 0.5, 0.9)]
    case 'bar': return [range(r, 0.16, 0.4), 0]
  }
}

/** Size factors of the three tiers: anchors, middle shapes, details. */
const TIER: ReadonlyArray<readonly [number, number]> = [[0.62, 1.05], [0.3, 0.55], [0.11, 0.26]]

/** Kinds whose size is a diameter rather than a length from the anchor point. */
const ROUND = new Set<Kind>(['disc', 'lune', 'stripes', 'steps'])

/**
 * Scatters `count` shapes over a region. Anchors come first, so they lie
 * under the smaller shapes; some shapes nest in the previous one, cut out in
 * the ground colour or printed in a second ink, which gives the concentric
 * motifs of a printed pattern.
 */
export function motif(r: Rng, region: Region, count: number, weights: MotifWeights, inkWeights: readonly number[]): Shape[] {
  const out: Shape[] = []
  const nA = Math.max(1, Math.ceil(count * 0.25))
  const nB = Math.max(nA + 1, Math.ceil(count * 0.7))
  let prev = -2
  const inkPick = () => {
    let total = 0
    for (let i = 0; i < inkWeights.length; i++)
      total += i === prev ? 0 : inkWeights[i]
    let v = r() * total
    for (let i = 0; i < inkWeights.length; i++) {
      if (i === prev)
        continue
      v -= inkWeights[i]
      if (v < 0)
        return i
    }
    return prev === 0 ? 1 : 0
  }
  for (let i = 0; i < count; i++) {
    const tier = i < nA ? 0 : i < nB ? 1 : 2
    const base = out[out.length - 1]
    let s: Shape
    if (base && tier > 0 && chance(r, 0.24)) {
      // nested in the previous shape: same anchor, same turn, smaller
      const kind = chance(r, 0.6) ? base.kind : weighted(r, weights)
      const [p1, p2] = kind === base.kind ? [base.p1, base.p2] : params(r, kind)
      const shrink = range(r, 0.38, 0.66)
      const centred = ROUND.has(kind) === ROUND.has(base.kind)
      const off = centred ? 0 : base.size * (1 - shrink) * 0.5
      s = {
        kind,
        x: base.x + Math.cos(base.rot) * off,
        y: base.y + Math.sin(base.rot) * off,
        rot: base.rot,
        size: base.size * shrink,
        p1,
        p2,
        ink: chance(r, 0.55) ? -1 : inkPick(),
      }
    }
    else {
      const kind = weighted(r, weights)
      const [p1, p2] = params(r, kind)
      // the first anchor often sits on a centre of rotation: a medallion
      const where = i === 0 && chance(r, 0.55) ? 0 : r()
      let p: Pt
      let rot: number
      if (where < 0.2) {
        p = region.vertex(r)
        rot = r() * TAU
      }
      else if (where < 0.58) {
        // On a mirror. Shapes with straight sides straddle it symmetrically
        // or lie along it, never flush against it: two flush halves would
        // meet edge to edge on the mirror and leave a seam.
        const [q, dir] = region.edge(r)
        p = q
        if (kind === 'quarter' || kind === 'arc') {
          const sweep = kind === 'quarter' ? p1 : p2
          // a half disc centred on the inward normal would be flush
          const half = Math.abs(sweep - Math.PI) < 0.2
          rot = pick(r, [dir - sweep / 2, half ? dir - sweep / 2 : dir + Math.PI / 2 - sweep / 2, r() * TAU])
        }
        else if (kind === 'steps' || kind === 'bar') {
          rot = pick(r, [dir, dir + Math.PI, r() * TAU])
        }
        else {
          rot = dir + pick(r, [0, Math.PI / 2, -Math.PI / 2, Math.PI, r() * TAU])
        }
      }
      else {
        p = region.interior(r)
        rot = r() * TAU
      }
      const [lo, hi] = TIER[tier]
      s = {
        kind,
        x: p[0],
        y: p[1],
        rot,
        size: region.scale(p) * range(r, lo, hi),
        p1,
        p2,
        ink: tier > 0 && chance(r, 0.1) ? -1 : inkPick(),
      }
    }
    if (s.ink >= 0)
      prev = s.ink
    out.push(s)
  }
  return out
}
