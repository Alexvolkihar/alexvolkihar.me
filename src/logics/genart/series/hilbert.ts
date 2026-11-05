// "Hilbert" — space-filling curves.
//
// One unbroken line visits every cell of a square: the Hilbert, Moore,
// Peano, Sierpinski or Gosper curve (../hilbert/curves.ts). The curve is
// built by recursive subdivision; at a fixed order every cell is split the
// same number of times, at an adaptive order a seeded density field decides
// where to go deeper, so the line packs tight in some places and opens into
// wide loops elsewhere. The stroke follows the line: its colour along the
// length, its width with the local spacing, partly revealed, drawn as a
// hollow ribbon, as nested orders or as interleaved copies.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wide or tall canvas holds two or three square
// blocks joined end to end.

import type { Polyline, Split } from '../hilbert/curves'
import type { Rng } from '../random'
import type { Series } from '../types'
import { gosper, gosperFit, hilbert, moore, peano, polyline, sierpinski } from '../hilbert/curves'
import { chance, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Curve: [['Hilbert', 26], ['Moore', 16], ['Peano', 18], ['Sierpinski', 20], ['Gosper', 20]],
  Order: [['Low', 25], ['High', 35], ['Adaptive', 40]],
  Stroke: [['Ink', 16], ['Gradient', 20], ['Ribbon', 18], ['Reveal', 16], ['Nested', 14], ['Interleaved', 16]],
  Palette: [['Graphite', 20], ['Riso', 20], ['Lagoon', 16], ['Blueprint', 16], ['Ember', 16], ['Ultraviolet', 12]],
  Corners: [['Sharp', 50], ['Rounded', 50]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }
type CurveName = Features['Curve']

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Curve: weighted(r, TRAITS.Curve),
    Order: weighted(r, TRAITS.Order),
    Stroke: weighted(r, TRAITS.Stroke),
    Palette: weighted(r, TRAITS.Palette),
    Corners: weighted(r, TRAITS.Corners),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original).
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  ink: string
  /** Colour along the length of the curve. */
  ramp: readonly string[]
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Graphite: { bg: '#efebe3', ink: '#1d1c1a', ramp: ['#1d1c1a', '#4a4741', '#857e72', '#b5432e'], dark: false },
  Riso: { bg: '#f3ebdd', ink: '#22223a', ramp: ['#2b3a8f', '#e0457b', '#f39a3d', '#2a9d8f'], dark: false },
  Lagoon: { bg: '#e8eee8', ink: '#103a40', ramp: ['#0d3b4f', '#11706f', '#3aa58a', '#9fd39a', '#e0b85a'], dark: false },
  Blueprint: { bg: '#0e2440', ink: '#dce8f4', ramp: ['#3f7cc0', '#8fc0ea', '#e9f2fb', '#f2c14e'], dark: true },
  Ember: { bg: '#120c0b', ink: '#f2e3cb', ramp: ['#7a1d33', '#b8302a', '#e46f2a', '#f7c55a', '#fff1cf'], dark: true },
  Ultraviolet: { bg: '#140f26', ink: '#ece6ff', ramp: ['#4a3aa8', '#8a55e0', '#d653a8', '#ff9f6b', '#ffe1a8'], dark: true },
}

type RGB = [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

const RAMP_STEPS = 160

/** The palette ramp sampled into RAMP_STEPS + 1 css colours. */
function rampLut(stops: readonly string[]): string[] {
  const cs = stops.map(hex)
  const out: string[] = []
  for (let i = 0; i <= RAMP_STEPS; i++) {
    const x = (i / RAMP_STEPS) * (cs.length - 1)
    const k = Math.min(cs.length - 2, Math.floor(x))
    const f = x - k
    const c = cs[k].map((a, j) => Math.round(a + (cs[k + 1][j] - a) * f))
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`)
  }
  return out
}

// ---------------------------------------------------------------------------
// Orders. Depth is the number of subdivisions; one level halves a Hilbert or
// Moore cell, thirds a Peano cell, bisects a Sierpinski triangle and divides
// a Gosper segment by √7. [min, max] ranges, the layout stream picks inside.
// ---------------------------------------------------------------------------

// `bias` > 1 keeps the adaptive Peano curve from going to its finest level
// almost everywhere: one of its levels is three times finer than the last.
const DEPTH: Record<CurveName, { Low: [number, number], High: [number, number], Adaptive: [number, number], step: number, bias: number }> = {
  Hilbert: { Low: [3, 4], High: [5, 6], Adaptive: [3, 7], step: 1, bias: 1 },
  Moore: { Low: [3, 4], High: [5, 6], Adaptive: [3, 7], step: 1, bias: 1 },
  Peano: { Low: [2, 3], High: [4, 4], Adaptive: [2, 4], step: 1, bias: 1.8 },
  Sierpinski: { Low: [6, 7], High: [10, 11], Adaptive: [6, 13], step: 2, bias: 1 },
  Gosper: { Low: [2, 3], High: [4, 4], Adaptive: [3, 5], step: 1, bias: 1 },
}

/** Closed curves are drawn as one loop per block. */
const CLOSED: Record<CurveName, boolean> = { Hilbert: false, Moore: true, Peano: false, Sierpinski: true, Gosper: false }

// ---------------------------------------------------------------------------
// Density field: two octaves of value noise on an integer-hashed lattice,
// plus an optional focus, in canvas units (short side = 1, origin at the
// centre), so it does not depend on the resolution.
// ---------------------------------------------------------------------------

function makeNoise(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (a: number, b: number) => val[perm[perm[a] + b]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const X = xi & 255
    const Y = yi & 255
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(X, Y) + u * (v(X + 1, Y) - v(X, Y))
    const b = v(X, Y + 1) + u * (v(X + 1, Y + 1) - v(X, Y + 1))
    return a + w * (b - a)
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Smooth 1-D value noise over [0, 1] through `knots` values. */
function noise1(vals: readonly number[], knots: number) {
  return (t: number) => {
    const x = Math.max(0, Math.min(0.999999, t)) * knots
    const i = Math.floor(x)
    const f = x - i
    const s = f * f * (3 - 2 * f)
    return vals[i] + (vals[i + 1] - vals[i]) * s
  }
}

// ---------------------------------------------------------------------------
// Geometry: square blocks, the curve in each, mapped to canvas units.
// ---------------------------------------------------------------------------

interface Layout {
  /** Block side, canvas units. */
  B: number
  n: number
  /** Chain along x (landscape) or y (portrait). */
  horizontal: boolean
  start: number
}

const MARGIN = 0.075

function layout(hw: number, hh: number): Layout {
  const ax = 2 * hw - 2 * MARGIN
  const ay = 2 * hh - 2 * MARGIN
  const horizontal = ax >= ay
  const long = Math.max(ax, ay)
  const short = Math.min(ax, ay)
  const n = Math.max(1, Math.round(long / short))
  const B = Math.min(short, long / n)
  return { B, n, horizontal, start: (-n * B) / 2 }
}

/** Unit-square transform of one copy of the curve (Interleaved). */
type UnitXf = (u: number, v: number) => [number, number]

const IDENTITY: UnitXf = (u, v) => [u, v]

function buildCurves(name: CurveName, L: Layout, base: Split, xf: UnitXf, gosperTurn: number): Polyline[] {
  const closed = CLOSED[name]
  const out: Polyline[] = []
  // Hilbert and Peano run on from block to block; a Gosper island stands alone.
  const chain = name === 'Hilbert' || name === 'Peano' ? polyline(false) : null
  for (let k = 0; k < L.n; k++) {
    // Peano leaves a block at the corner opposite its entry: every other
    // block is flipped so that the next one starts where this one ends.
    const flip = name === 'Peano' && k % 2 === 1
    const o = L.start + k * L.B
    const map = (u0: number, v0: number): [number, number] => {
      const [u, v1] = xf(u0, v0)
      const v = flip ? 1 - v1 : v1
      if (L.horizontal)
        return [o + u * L.B, L.B / 2 - v * L.B]
      return [L.B / 2 - v * L.B, o + u * L.B]
    }
    const split: Split = (cx, cy, size, depth) => {
      const [x, y] = map(cx, cy)
      return base(x, y, size * L.B, depth)
    }
    const unit = polyline(closed)
    if (name === 'Hilbert') {
      hilbert(unit, 0, 0, 0, 1, 1, 0, 0, split)
    }
    else if (name === 'Moore') {
      moore(unit, split)
    }
    else if (name === 'Peano') {
      peano(unit, 0, 0, 1, 0, 0, 1, 0, split)
    }
    else if (name === 'Sierpinski') {
      sierpinski(unit, split)
    }
    else {
      const f = gosperFit(gosperTurn)
      gosper(unit, f.px, f.py, f.qx, f.qy, split)
    }
    const dst = chain ?? polyline(closed)
    for (let i = 0; i < unit.xs.length; i++) {
      const [x, y] = map(unit.xs[i], unit.ys[i])
      dst.xs.push(x)
      dst.ys.push(y)
      dst.ss.push(unit.ss[i] * L.B)
    }
    if (!chain)
      out.push(dst)
  }
  if (chain)
    out.push(chain)
  return out
}

/** Arc-length position of every point, over all the curves in order, in [0, 1]. */
function arcParams(curves: Polyline[]): number[][] {
  const cum: number[][] = []
  let acc = 0
  for (const c of curves) {
    const n = c.xs.length
    const a: number[] = []
    for (let i = 0; i < n; i++) {
      if (i > 0)
        acc += Math.hypot(c.xs[i] - c.xs[i - 1], c.ys[i] - c.ys[i - 1])
      a.push(acc)
    }
    if (c.closed && n > 1)
      acc += Math.hypot(c.xs[0] - c.xs[n - 1], c.ys[0] - c.ys[n - 1])
    cum.push(a)
  }
  const total = acc || 1
  return cum.map(a => a.map(x => x / total))
}

// ---------------------------------------------------------------------------
// Stroking. The curve is cut into pieces, one per point: from the midpoint
// of the incoming segment, through the point, to the midpoint of the
// outgoing one (a quadratic curve when the corners are rounded). Runs of
// pieces with the same colour and width go into one path.
// ---------------------------------------------------------------------------

/** Colour and width of the piece at arc position t and local spacing s; null skips it. */
type Look = (t: number, s: number) => readonly [string, number] | null

/** Widths are snapped to 4 % steps, so runs stay long. */
const qw = (w: number) => Math.exp(Math.round(Math.log(w) / 0.04) * 0.04)

function strokeCurves(ctx: CanvasRenderingContext2D, curves: Polyline[], ts: number[][], rounded: boolean, look: Look) {
  for (let ci = 0; ci < curves.length; ci++) {
    const c = curves[ci]
    const n = c.xs.length
    if (n < 2)
      continue
    const X = c.xs
    const Y = c.ys
    const t = ts[ci]
    const mx = (i: number) => (X[(i + n) % n] + X[(i + 1 + n) % n]) / 2
    const my = (i: number) => (Y[(i + n) % n] + Y[(i + 1 + n) % n]) / 2
    const draw = (from: number, to: number, col: string, w: number) => {
      ctx.beginPath()
      if (!c.closed && from === 0)
        ctx.moveTo(X[0], Y[0])
      else
        ctx.moveTo(mx(from - 1), my(from - 1))
      for (let i = from; i < to; i++) {
        const last = !c.closed && i === n - 1
        const ex = last ? X[i] : mx(i)
        const ey = last ? Y[i] : my(i)
        if (rounded) {
          ctx.quadraticCurveTo(X[i], Y[i], ex, ey)
        }
        else {
          ctx.lineTo(X[i], Y[i])
          ctx.lineTo(ex, ey)
        }
      }
      ctx.strokeStyle = col
      ctx.lineWidth = w
      ctx.stroke()
    }
    let from = -1
    let col = ''
    let w = 0
    const S = c.ss
    for (let i = 0; i < n; i++) {
      // Where the order changes, the piece takes the finer of its
      // neighbours' spacings, so a wide stroke never spills into a fine area.
      let s = S[i]
      if (i > 0 || c.closed)
        s = Math.min(s, S[(i - 1 + n) % n])
      if (i < n - 1 || c.closed)
        s = Math.min(s, S[(i + 1) % n])
      const l = look(t[i], s)
      if (!l || l[0] !== col || l[1] !== w) {
        if (from >= 0)
          draw(from, i, col, w)
        from = -1
      }
      if (l && from < 0) {
        from = i
        col = l[0]
        w = l[1]
      }
    }
    if (from >= 0)
      draw(from, n, col, w)
  }
}

/** Strand spacing to stroke width: the lines of these curves sit closer than their nominal cell. */
const PITCH: Record<CurveName, number> = { Hilbert: 1, Moore: 1, Peano: 1, Sierpinski: 1.05, Gosper: 0.62 }

// ---------------------------------------------------------------------------

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const spec = DEPTH[f.Curve]

  // Fixed stream order: layout, field, colour. Each always makes the same draws.
  const lay = stream(hash, 'layout')
  const [d0, d1] = spec[f.Order]
  const dPick = lay()
  const gosperTurn = lay() < 0.5 ? 0 : Math.PI / 3
  const level = f.Order === 'Adaptive' ? d1 : d0 + Math.floor(dPick * (d1 - d0 + 1))

  const fr = stream(hash, 'field')
  const n1 = makeNoise(fr)
  const n2 = makeNoise(fr)
  const fs = range(fr, 1.3, 2.4)
  const ox = range(fr, -40, 40)
  const oy = range(fr, -40, 40)
  const focus = chance(fr, 0.45)
  const fx = range(fr, -0.3, 0.3)
  const fy = range(fr, -0.3, 0.3)
  const fRad = range(fr, 0.16, 0.3)
  const lo = range(fr, 0.3, 0.42)
  const density = (x: number, y: number) => {
    const a = n1(x * fs + ox, y * fs + oy) * 0.68 + n2(x * fs * 2.3 + oy, y * fs * 2.3 + ox) * 0.32
    let d = smooth(lo, lo + 0.4, a)
    if (focus)
      d = Math.max(d, Math.exp(-((x - fx) ** 2 + (y - fy) ** 2) / (fRad * fRad)))
    return d
  }

  const col = stream(hash, 'colour')
  const reverse = chance(col, 0.5)
  const swell: number[] = []
  const reveal: number[] = []
  for (let i = 0; i < 33; i++) {
    swell.push(col())
    reveal.push(col())
  }
  const revealKnots = 9 + Math.floor(col() * 10)
  const revealCut = range(col, 0.46, 0.58)

  const S = Math.min(width, height)
  const hw = width / (2 * S)
  const hh = height / (2 * S)
  const L = layout(hw, hh)

  ctx.save()
  ctx.setTransform(S, 0, 0, S, width / 2, height / 2)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = pal.bg
  ctx.fillRect(-hw - 1, -hh - 1, 2 * hw + 2, 2 * hh + 2)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const splitAt = (cap: number): Split => {
    if (f.Order !== 'Adaptive')
      return (_x, _y, _s, depth) => depth < cap
    return (x, y, _s, depth) => {
      if (depth >= cap)
        return false
      if (depth < d0)
        return true
      return depth < d0 + density(x, y) ** spec.bias * (d1 - d0 + 1)
    }
  }

  const lut = rampLut(reverse ? [...pal.ramp].reverse() : pal.ramp)
  const ramp = (t: number) => lut[Math.round(Math.max(0, Math.min(1, t)) * RAMP_STEPS)]
  const pitch = PITCH[f.Curve]
  const rounded = f.Corners === 'Rounded'
  // Stroke widths follow the local spacing, but softened (spacing^0.6) so
  // that the coarse parts of an adaptive curve do not turn into slabs.
  let sMin = 1
  const soft = (s: number) => sMin * (s / sMin) ** 0.6
  const finest = (curves: Polyline[]) => {
    sMin = Infinity
    for (const c of curves) {
      for (const x of c.ss)
        sMin = Math.min(sMin, x)
    }
  }

  if (f.Stroke === 'Nested') {
    // Three orders of the same curve on top of each other, coarse and wide
    // underneath, fine and thin on top.
    const caps = [level - 2 * spec.step, level - spec.step, level].map(c => Math.max(1, c))
    const widths = [0.5, 0.36, 0.2]
    const tone = [0.85, 0.45, 0]
    for (let k = 0; k < 3; k++) {
      const curves = buildCurves(f.Curve, L, splitAt(caps[k]), IDENTITY, gosperTurn)
      const ts = arcParams(curves)
      finest(curves)
      const c0 = k === 2 ? pal.ink : null
      ctx.globalAlpha = k === 0 ? 0.55 : 0.85
      strokeCurves(ctx, curves, ts, rounded, (t, s) => [c0 ?? ramp(k === 0 ? t : tone[k] + 0.3 * t), qw(widths[k] * soft(s) * pitch)])
    }
    ctx.restore()
    return
  }

  if (f.Stroke === 'Interleaved') {
    // Copies of the curve, mirrored or turned and shifted by half a cell,
    // blended so that their crossings show.
    const cell = (f.Curve === 'Peano' ? 3 ** -level : 2 ** -(level / spec.step)) * 0.5
    // Every copy keeps the entry and exit corners of an open curve where
    // the chain of blocks expects them: Hilbert is mirrored, Peano
    // transposed (it then runs row by row across the original's columns).
    let copies: UnitXf[] = [IDENTITY, IDENTITY, IDENTITY]
    if (CLOSED[f.Curve])
      copies = [IDENTITY, (u, v) => [1 - v + cell, u + cell]]
    else if (f.Curve === 'Hilbert')
      copies = [IDENTITY, (u, v) => [u + cell, 1 - v - cell]]
    else if (f.Curve === 'Peano')
      copies = [IDENTITY, (u, v) => [v + cell, u + cell]]
    ctx.globalCompositeOperation = pal.dark ? 'screen' : 'multiply'
    for (let k = 0; k < copies.length; k++) {
      const turn = f.Curve === 'Gosper' ? gosperTurn + (k * 2 * Math.PI) / 3 : gosperTurn
      // three flowsnakes at the finest level would be too slow for the index: one level less
      const curves = buildCurves(f.Curve, L, splitAt(f.Curve === 'Gosper' ? level - 1 : level), copies[k], turn)
      const ts = arcParams(curves)
      finest(curves)
      const base = copies.length === 2 ? [0.15, 0.75][k] : [0.1, 0.5, 0.9][k]
      strokeCurves(ctx, curves, ts, rounded, (t, s) => [ramp(base + 0.25 * (t - 0.5)), qw(0.3 * soft(s) * pitch)])
    }
    ctx.restore()
    return
  }

  // A ribbon needs room for its hollow core: one level coarser, unless the order is already low.
  const ribbon = f.Stroke === 'Ribbon'
  const curves = buildCurves(f.Curve, L, splitAt(ribbon && f.Order !== 'Low' ? level - spec.step : level), IDENTITY, gosperTurn)
  const ts = arcParams(curves)
  finest(curves)

  if (f.Stroke === 'Ink') {
    strokeCurves(ctx, curves, ts, rounded, (_t, s) => [pal.ink, qw(0.22 * soft(s) * pitch)])
  }
  else if (f.Stroke === 'Gradient') {
    const sw = noise1(swell, 8)
    strokeCurves(ctx, curves, ts, rounded, (t, s) => [ramp(t), qw((0.18 + 0.42 * sw(t)) * soft(s) * pitch)])
  }
  else if (ribbon) {
    // A hollow tube: the outline in the ramp colour, then its core in the ground.
    strokeCurves(ctx, curves, ts, rounded, (t, s) => [ramp(t), qw(0.64 * s * pitch)])
    strokeCurves(ctx, curves, ts, rounded, (_t, s) => [pal.bg, qw(0.34 * s * pitch)])
  }
  else {
    // Reveal: the whole curve as a faint hairline, and stretches of it
    // inked, swelling in the middle of each stretch and tapering at its ends.
    ctx.globalAlpha = 0.4
    strokeCurves(ctx, curves, ts, rounded, (_t, s) => [pal.ink, qw(0.07 * soft(s) * pitch)])
    ctx.globalAlpha = 1
    const rv = noise1(reveal, revealKnots)
    strokeCurves(ctx, curves, ts, rounded, (t, s) => {
      const a = (rv(t) - revealCut) / (1 - revealCut)
      if (a <= 0)
        return null
      return [ramp(t), qw((0.12 + 0.5 * Math.sqrt(Math.min(1, a * 1.6))) * soft(s) * pitch)]
    })
  }
  ctx.restore()
}

export default {
  slug: 'hilbert',
  title: 'Hilbert',
  summary: 'Space-filling curves (Hilbert, Moore, Peano, Sierpinski, Gosper) at fixed or field-driven adaptive orders, inked, graded, ribboned or interleaved.',
  order: 220,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5f111bed ("gallery" stream): the first hash found for
  // each curve × stroke pair, twelve pairs; the Hilbert interleaved one is
  // moved first as the cover.
  gallery: [
    '0xac296e329e44360fae57b5541da1e5520316ebf3c2553fd50380d8229bc00d90',
    '0x456379919a2b3133aa2d893ed02b2156b01d9a5881a91bcf574dc9b7f25f8308',
    '0x805c1553d386926bc0f4d7e658b8088c60ada765f2bcc9ff68f607234fc18305',
    '0x82c7842573b934e580d423a37b969f4480d9afc17ac993ab8ed5114afa289cc4',
    '0x43a0a2efcf9c385d85bffd771864e8336a1df9534277eec920fd3f5393d71c6d',
    '0x98c45a751ac40ea29d1878902f48e02f54d0aab0fe4fd759dfc4378111d0b816',
    '0xdf0d2efa0299f87f146ed71bdfdee49f5eb017192dfca037e15ea672721ecce8',
    '0x740e7b321cffd2d90bd3f2130e3ca7d4b9ec5c90c67904e5158eb108488b7283',
    '0xd1afa16e40bc8ed99392985e1a00109609ec1075bf3bd260eccb32750d8f225f',
    '0xd5ded07c9529c3ff52f907b85c207615b085706916b586ffeb2f8b5b15a1ffe0',
    '0x7cee0614b5d9f7af3eb0b40f431c4d8cf767ce4fcd215fb58062a716c76443b1',
    '0x61db3d0f1afe8fee1042cbf6781f47d06f2befae630ea6a3d3b359d418883c24',
  ],
} satisfies Series
