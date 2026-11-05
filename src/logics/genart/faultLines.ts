// "Fault Lines" — a static, hash-seeded generative piece.
//
// A square slab is cut again and again by straight faults until it breaks
// into convex shards; every shard is pulled apart from its neighbours and
// engraved with its own hatching. Everything is a pure function of a 32-byte
// hash: same hash, same artwork, at any canvas size.
//
// Techniques (shared heritage, credited): recursive subdivision of convex
// polygons, half-plane clipping after Sutherland & Hodgman (1974), polygon
// inset by clipping against shifted edges. Palettes are original to this site.

import type { Rng } from './random'
import { gaussian, int, pick, range, stream, weighted } from './random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

export const TRAITS = {
  Palette: [['Paper', 30], ['Ember', 22], ['Tide', 20], ['Moss', 16], ['Night', 9], ['Gilt', 3]],
  Cuts: [['Few', 25], ['Balanced', 50], ['Shattered', 25]],
  Grain: [['Orthogonal', 30], ['Diagonal', 25], ['Free', 45]],
  Fill: [['Hatch', 45], ['Bands', 30], ['Solid', 15], ['Mixed', 10]],
  Drift: [['Tight', 40], ['Open', 45], ['Scattered', 15]],
  Accent: [['None', 60], ['Single', 30], ['Constellation', 10]],
} as const

type TraitName = keyof typeof TRAITS
type TraitValue<K extends TraitName> = typeof TRAITS[K][number][0]

export type Features = { [K in TraitName]: TraitValue<K> }

/** Pure function of the hash, computed before (and without) any rendering. */
export function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Cuts: weighted(r, TRAITS.Cuts),
    Grain: weighted(r, TRAITS.Grain),
    Fill: weighted(r, TRAITS.Fill),
    Drift: weighted(r, TRAITS.Drift),
    Accent: weighted(r, TRAITS.Accent),
  }
}

interface Palette {
  bg: string
  ink: string
  colors: readonly string[]
  accent: string
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Paper: { bg: '#efe8da', ink: '#1f1e1b', colors: ['#1f1e1b', '#3d3b36', '#5a5750', '#1f1e1b'], accent: '#b5402a' },
  Ember: { bg: '#f3e6d3', ink: '#3a1f1a', colors: ['#c2412d', '#e07a3f', '#eaa94a', '#3a1f1a'], accent: '#2d5b6b' },
  Tide: { bg: '#e8edee', ink: '#14304d', colors: ['#173a5e', '#2f6f8f', '#78aabb', '#14304d'], accent: '#e09a4f' },
  Moss: { bg: '#ece8da', ink: '#26382a', colors: ['#2f4a33', '#5f8549', '#a7b67a', '#26382a'], accent: '#a9572f' },
  Night: { bg: '#121418', ink: '#e9e4d8', colors: ['#e9e4d8', '#8fa3b8', '#5d6b7d', '#c9c2b2'], accent: '#d98b5f' },
  Gilt: { bg: '#18160f', ink: '#efe1b0', colors: ['#d6b25e', '#efe1b0', '#9c7a35', '#d6b25e'], accent: '#7fa7a0' },
}

const SHARD_COUNT: Record<Features['Cuts'], readonly [number, number]> = {
  Few: [6, 10],
  Balanced: [14, 22],
  Shattered: [32, 46],
}

// All lengths are fractions of the short side of the canvas.
const MARGIN = 0.085
const GAP: Record<Features['Drift'], number> = { Tight: 0.0035, Open: 0.009, Scattered: 0.007 }
const OUTLINE = 0.0011
const GRAIN_SPECKS = 5000

// ---------------------------------------------------------------------------
// Convex polygon geometry
// ---------------------------------------------------------------------------

type Pt = readonly [number, number]
type Poly = Pt[]

function area(p: Poly): number {
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

function centroid(p: Poly): Pt {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    const k = x0 * y1 - x1 * y0
    a += k
    cx += (x0 + x1) * k
    cy += (y0 + y1) * k
  }
  if (Math.abs(a) < 1e-12)
    return p[0]
  return [cx / (3 * a), cy / (3 * a)]
}

function perimeter(p: Poly): number {
  let l = 0
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i]
    const [x1, y1] = p[(i + 1) % p.length]
    l += Math.hypot(x1 - x0, y1 - y0)
  }
  return l
}

/** Keeps the part of `p` where dot(v - o, n) >= 0. */
function clipHalfPlane(p: Poly, o: Pt, n: Pt): Poly {
  const out: Poly = []
  const side = (v: Pt) => (v[0] - o[0]) * n[0] + (v[1] - o[1]) * n[1]
  for (let i = 0; i < p.length; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0)
      out.push(a)
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Shrinks a counter-clockwise convex polygon by `d` on every edge. */
function inset(p: Poly, d: number): Poly {
  let q = p
  for (let i = 0; i < p.length && q.length >= 3; i++) {
    const a = p[i]
    const b = p[(i + 1) % p.length]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < 1e-9)
      continue
    // left normal of a CCW edge points inwards
    const n: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]
    q = clipHalfPlane(q, [a[0] + n[0] * d, a[1] + n[1] * d], n)
  }
  return q
}

function transform(p: Poly, c: Pt, angle: number, dx: number, dy: number): Poly {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return p.map(([x, y]) => {
    const ux = x - c[0]
    const uy = y - c[1]
    return [c[0] + ux * cos - uy * sin + dx, c[1] + ux * sin + uy * cos + dy] as const
  })
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

function faultAngle(r: Rng, grain: Features['Grain']): number {
  switch (grain) {
    case 'Orthogonal':
      return pick(r, [0, Math.PI / 2]) + gaussian(r) * 0.035
    case 'Diagonal':
      return pick(r, [Math.PI / 4, (3 * Math.PI) / 4]) + gaussian(r) * 0.035
    default:
      return r() * Math.PI
  }
}

/** Breaks the slab into convex shards. Own stream: rejection sampling has a data-dependent draw count. */
function subdivide(hash: string, f: Features): Poly[] {
  const r = stream(hash, 'cuts')
  const [lo, hi] = SHARD_COUNT[f.Cuts]
  const target = int(r, lo, hi)
  const m = MARGIN
  let shards: Poly[] = [[[m, m], [1 - m, m], [1 - m, 1 - m], [m, 1 - m]]]
  const total = area(shards[0])
  const minArea = (total / target) * 0.22

  for (let attempt = 0; shards.length < target && attempt < target * 60; attempt++) {
    // pick a shard with probability proportional to its area
    const areas = shards.map(area)
    let x = r() * areas.reduce((s, a) => s + a, 0)
    let idx = 0
    while (idx < areas.length - 1 && x >= areas[idx]) {
      x -= areas[idx]
      idx++
    }
    const shard = shards[idx]
    const c = centroid(shard)
    const s = Math.sqrt(areas[idx])
    const o: Pt = [c[0] + gaussian(r) * 0.16 * s, c[1] + gaussian(r) * 0.16 * s]
    const a = faultAngle(r, f.Grain)
    const n: Pt = [-Math.sin(a), Math.cos(a)]
    const left = clipHalfPlane(shard, o, n)
    const right = clipHalfPlane(shard, o, [-n[0], -n[1]])
    if (left.length < 3 || right.length < 3)
      continue
    const ok = [left, right].every((q) => {
      const qa = area(q)
      const p = perimeter(q)
      // reject slivers: compactness well below a thin rectangle's
      return qa >= minArea && qa / (p * p) > 0.028
    })
    if (!ok)
      continue
    shards = [...shards.slice(0, idx), left, right, ...shards.slice(idx + 1)]
  }
  return shards
}

interface Shard {
  poly: Poly
  mode: 'hatch' | 'bands' | 'solid'
  color: string
  color2: string
  angle: number
  spacing: number
  weight: number
  band: number
  accent: boolean
}

function layout(hash: string, f: Features, polys: Poly[]): Shard[] {
  const pal = PALETTES[f.Palette]
  const r = stream(hash, 'shards')
  const ra = stream(hash, 'accent')
  const gap = GAP[f.Drift]

  const accentCount = f.Accent === 'None' ? 0 : f.Accent === 'Single' ? 1 : Math.max(3, Math.round(polys.length * 0.18))
  const accented = new Set<number>()
  for (let guard = 0; accented.size < Math.min(accentCount, polys.length) && guard < 200; guard++)
    accented.add(Math.floor(ra() * polys.length))

  return polys.map((poly, i) => {
    // fixed number of draws per shard, whatever the fill mode
    const u = r()
    const color = pick(r, pal.colors)
    const color2 = pick(r, pal.colors)
    const angle = pick(r, [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) + gaussian(r) * 0.05
    const spacing = 0.0062 + r() ** 2 * 0.011
    const weight = range(r, 0.3, 0.55)
    const band = int(r, 2, 6)
    const dx = gaussian(r)
    const dy = gaussian(r)
    const rot = gaussian(r)

    let mode: Shard['mode'] = 'hatch'
    if (f.Fill === 'Bands')
      mode = 'bands'
    else if (f.Fill === 'Solid')
      mode = 'solid'
    else if (f.Fill === 'Mixed')
      mode = u < 0.45 ? 'hatch' : u < 0.75 ? 'bands' : 'solid'

    let shape = inset(poly, gap / 2)
    if (f.Drift === 'Scattered' && shape.length >= 3)
      shape = transform(shape, centroid(shape), rot * 0.035, dx * 0.006, dy * 0.006)

    return { poly: shape, mode, color, color2, angle, spacing, weight, band, accent: accented.has(i) }
  })
}

// ---------------------------------------------------------------------------
// Drawing — everything below works in a 0..1 space scaled to the short side.
// ---------------------------------------------------------------------------

function tracePoly(ctx: CanvasRenderingContext2D, p: Poly) {
  ctx.beginPath()
  ctx.moveTo(p[0][0], p[0][1])
  for (let i = 1; i < p.length; i++)
    ctx.lineTo(p[i][0], p[i][1])
  ctx.closePath()
}

function hatch(ctx: CanvasRenderingContext2D, s: Shard, colors: readonly string[], every: number) {
  const c = centroid(s.poly)
  let radius = 0
  for (const [x, y] of s.poly)
    radius = Math.max(radius, Math.hypot(x - c[0], y - c[1]))
  const vx = Math.cos(s.angle)
  const vy = Math.sin(s.angle)
  const ux = -vy
  const uy = vx
  ctx.lineWidth = s.spacing * s.weight
  const steps = Math.ceil(radius / s.spacing)
  for (let k = 0; k < colors.length; k++) {
    ctx.strokeStyle = colors[k]
    ctx.beginPath()
    for (let j = -steps; j <= steps; j++) {
      if (Math.floor((j + steps) / every) % colors.length !== k)
        continue
      const t = j * s.spacing
      ctx.moveTo(c[0] + ux * t - vx * radius, c[1] + uy * t - vy * radius)
      ctx.lineTo(c[0] + ux * t + vx * radius, c[1] + uy * t + vy * radius)
    }
    ctx.stroke()
  }
}

function drawShard(ctx: CanvasRenderingContext2D, s: Shard, pal: Palette) {
  if (s.poly.length < 3)
    return
  ctx.save()
  tracePoly(ctx, s.poly)
  ctx.clip()
  if (s.accent) {
    ctx.fillStyle = pal.accent
    ctx.fill()
  }
  else if (s.mode === 'solid') {
    ctx.fillStyle = s.color
    ctx.fill()
    ctx.globalAlpha = 0.18
    hatch(ctx, { ...s, spacing: s.spacing * 0.8 }, [pal.bg], 1)
    ctx.globalAlpha = 1
  }
  else if (s.mode === 'bands') {
    const second = s.color2 === s.color ? pal.accent : s.color2
    hatch(ctx, s, [s.color, second], s.band)
  }
  else {
    hatch(ctx, s, [s.color], 1)
  }
  ctx.restore()

  tracePoly(ctx, s.poly)
  ctx.lineWidth = OUTLINE
  ctx.strokeStyle = pal.ink
  ctx.stroke()
}

function grain(ctx: CanvasRenderingContext2D, hash: string, pal: Palette) {
  const r = stream(hash, 'texture')
  ctx.fillStyle = pal.ink
  ctx.globalAlpha = 0.07
  for (let i = 0; i < GRAIN_SPECKS; i++) {
    const x = r()
    const y = r()
    const s = 0.0007 + r() * 0.0013
    ctx.fillRect(x, y, s, s)
  }
  ctx.globalAlpha = 1
}

/**
 * Draws the piece for `hash` into the whole canvas. Same hash → same artwork at
 * any buffer size: the composition is drawn in a normalised square, centred.
 * Leaves the context state as it found it.
 */
export function renderFaultLines(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): Features {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const shards = layout(hash, f, subdivide(hash, f))

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, width, height)

  const S = Math.min(width, height)
  ctx.translate((width - S) / 2, (height - S) / 2)
  ctx.scale(S, S)
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'

  for (const s of shards)
    drawShard(ctx, s, pal)
  grain(ctx, hash, pal)

  ctx.restore()
  return f
}
