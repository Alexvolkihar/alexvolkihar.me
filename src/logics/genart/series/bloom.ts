// "Bloom" — radially symmetric flowers painted in translucent layers.
//
// Every petal starts as a small polygon drawn from a petal profile (round,
// pointed, notched, fringed or ribbon-like), placed n times around a centre
// for an n-fold symmetry, in one to four whorls. Each petal is then deformed
// by recursive Gaussian midpoint displacement and filled again and again at a
// few percent opacity, every layer deformed anew, so petals get a dense core
// and a soft, bleeding rim, like a wash of watercolour (see ../bloom/watercolor.ts).
// Layers of neighbouring petals are interleaved so they blend where they
// overlap. A centre (stamens, a ring of seeds, a disc or a bare dimple),
// leaves, stems, loose petals and large background washes use the same
// technique.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side: the canvas transform is scaled so that the short
// side is 1 and the origin is the centre. The composition is laid out in the
// central square; wider or taller canvases show more of the paper, its washes
// and fallen petals, or more of the printed field of flowers.

import type { Ctx2D, Poly } from '../bloom/watercolor'
import type { Rng } from '../random'
import type { Series } from '../types'
import { deform, ngon, tracePoly, wash } from '../bloom/watercolor'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Peony', 22], ['Iris', 18], ['Marigold', 18], ['Camellia', 14], ['Celadon', 14], ['Nocturne', 14]],
  Symmetry: [['Three', 10], ['Five', 32], ['Six', 22], ['Eight', 20], ['Twelve', 16]],
  Petal: [['Round', 26], ['Pointed', 24], ['Notched', 20], ['Fringed', 16], ['Ribbon', 14]],
  Whorls: [['Single', 35], ['Double', 40], ['Full', 25]],
  Composition: [['Solo', 34], ['Stemmed', 24], ['Bouquet', 24], ['Scatter', 18]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Symmetry: weighted(r, TRAITS.Symmetry),
    Petal: weighted(r, TRAITS.Petal),
    Whorls: weighted(r, TRAITS.Whorls),
    Composition: weighted(r, TRAITS.Composition),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original).
// ---------------------------------------------------------------------------

/** Throat (petal base), body and tip of a petal. */
type Ramp = readonly [string, string, string]

interface Palette {
  bg: string
  /** Large background washes. */
  wash: string
  /** Petal ramps: the first is the main flower, the others appear in bouquets and fields. */
  ramps: readonly Ramp[]
  centre: string
  centreDark: string
  leaf: string
  stem: string
  /** Thin petal outlines. */
  edge: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Peony: {
    bg: '#f3ece2',
    wash: '#ead3c9',
    ramps: [['#7d1d3f', '#d4567a', '#f7c9cf'], ['#b0604e', '#f0cbbd', '#fff6ef'], ['#8a2f5c', '#c77aa6', '#ecd0e3']],
    centre: '#e2b13c',
    centreDark: '#5b2b1c',
    leaf: '#5c7a49',
    stem: '#47602f',
    edge: '#6d1a36',
  },
  Iris: {
    bg: '#efebe3',
    wash: '#d9d8e8',
    ramps: [['#241d5c', '#5a4ea6', '#bcb5ea'], ['#3a2c73', '#8f7cc8', '#efe9fb'], ['#1f3f6e', '#4f86b8', '#c9def0']],
    centre: '#efc14a',
    centreDark: '#3b2a1a',
    leaf: '#4e6e58',
    stem: '#3d5947',
    edge: '#1c1747',
  },
  Marigold: {
    bg: '#f6efdd',
    wash: '#f0d9b6',
    ramps: [['#9a2f16', '#e2742a', '#f8c94f'], ['#b3431c', '#efa33a', '#fbe39a'], ['#7e2414', '#c8452a', '#f39a5c']],
    centre: '#4a2914',
    centreDark: '#26150b',
    leaf: '#69793a',
    stem: '#56652d',
    edge: '#7a2410',
  },
  Camellia: {
    bg: '#f2eee7',
    wash: '#e6d4ce',
    ramps: [['#5e0c18', '#bf2338', '#ee8580'], ['#7a1426', '#e04f5f', '#f8c4c0'], ['#a8998a', '#ebe4d8', '#fffdf8']],
    centre: '#f1d065',
    centreDark: '#6a3a12',
    leaf: '#2e4e39',
    stem: '#2b4232',
    edge: '#4d0a14',
  },
  Celadon: {
    bg: '#e8ece4',
    wash: '#d0ddd1',
    ramps: [['#2b625d', '#7db1a2', '#e3efe0'], ['#5d6d3a', '#b5c48a', '#eef2d8'], ['#6e4a6a', '#c7a3b8', '#efe3ea']],
    centre: '#d4865a',
    centreDark: '#4a2c22',
    leaf: '#3b5847',
    stem: '#324c3c',
    edge: '#24504b',
  },
  Nocturne: {
    bg: '#11131d',
    wash: '#1e2438',
    ramps: [['#3a3d8f', '#b3a3df', '#f5eeff'], ['#5a2f6e', '#d692c2', '#fde8f4'], ['#24506a', '#7ec2d0', '#e6fbff']],
    centre: '#f0c868',
    centreDark: '#c98a3c',
    leaf: '#3f7a6c',
    stem: '#356a5e',
    edge: '#e9e3ff',
  },
}

// ---------------------------------------------------------------------------
// Geometry tables (canvas short side = 1).
// ---------------------------------------------------------------------------

const PETALS: Record<Features['Symmetry'], number> = { Three: 3, Five: 5, Six: 6, Eight: 8, Twelve: 12 }

type Centre = 'stamens' | 'seeds' | 'disc' | 'bare'
const CENTRES = [['stamens', 35], ['seeds', 25], ['disc', 25], ['bare', 15]] as const

/** Half-width of a petal over its length, before the symmetry correction. */
const WIDTH: Record<Features['Petal'], number> = { Round: 1.3, Pointed: 1.15, Notched: 1.35, Fringed: 1.3, Ribbon: 0.6 }

/** Half extent of the field of flowers, washes and fallen petals (covers 21:9). */
const FIELD = 1.3

// ---------------------------------------------------------------------------
// Petal outlines, in unit coordinates: x from 0 (base) to 1 (tip), y in [-1, 1].
// Each vertex carries a variance weight: low at the base, so petals leave the
// centre cleanly, high at the tip, where the paint bleeds.
// ---------------------------------------------------------------------------

type Shape = Features['Petal'] | 'Leaf'

function profile(shape: Shape, t: number): number {
  if (shape === 'Leaf')
    return Math.sin(Math.PI * t ** 0.55) ** 0.8
  if (shape === 'Pointed' || shape === 'Ribbon')
    return Math.sin(Math.PI * t ** 0.8) ** 0.85
  // Rounded end: swells quickly, closes in a half-disc.
  return t ** 0.55 * Math.sqrt(Math.max(0, 1 - t ** 3)) / 0.67
}

function petalOutline(shape: Shape): Poly {
  const n = shape === 'Fringed' ? 14 : 9
  const side: number[][] = []
  for (let i = 1; i < n; i++) {
    const t = 1 - (1 - i / n) ** 1.5
    side.push([t, profile(shape, t)])
  }
  const pts: number[][] = [[0, 0], ...side, [1, 0], ...side.slice().reverse().map(([x, y]) => [x, -y])]
  const out = new Float64Array(pts.length * 3)
  pts.forEach(([x0, y0], i) => {
    let x = x0
    let y = y0
    if (shape === 'Notched') {
      // Pull the tip back between two lobes.
      const s = Math.max(0, (x - 0.72) / 0.28)
      x -= 0.2 * s * s * (1 - Math.min(1, Math.abs(y) / 0.9))
    }
    if (shape === 'Fringed' && x > 0.5) {
      // Alternate vertices in and out around the rounded end: a serrated rim.
      const k = 1 + (i % 2 ? 0.09 : -0.06)
      x = 0.5 + (x - 0.5) * k
      y *= k
    }
    out[i * 3] = x
    out[i * 3 + 1] = y
    out[i * 3 + 2] = 0.25 + 0.95 * x0
  })
  return out
}

/** Places a unit outline: base at radius r0, length L, half-width hw, axis angle a. */
function place(unit: Poly, r0: number, L: number, hw: number, a: number, bend: number): Poly {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const out: Poly = new Float64Array(unit.length)
  for (let i = 0; i < unit.length; i += 3) {
    const x = unit[i]
    const px = r0 + x * L
    const py = unit[i + 1] * hw + bend * L * x * x
    out[i] = px * c - py * s
    out[i + 1] = px * s + py * c
    out[i + 2] = unit[i + 2]
  }
  return out
}

// ---------------------------------------------------------------------------
// Painting.
// ---------------------------------------------------------------------------

interface Bloom {
  x: number
  y: number
  R: number
  /** Ellipse ratio of a flower seen at an angle (1 = face on) and the axis it is squashed along. */
  squash: number
  tilt: number
  ramp: number
  whorls: number
  layers: number
  /** Deformation rounds of each petal's base shape, then of every layer. */
  base: number
  rounds: number
}

interface Ctx {
  g: CanvasRenderingContext2D
  f: Features
  pal: Palette
  unit: Poly
  centre: Centre
  dark: boolean
  /** Canvas size in pixels and short side. */
  W: number
  H: number
  S: number
  /** Scratch layer, grown on demand (see paintWhorl). */
  scratch: { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } | null
}

function makeScratch(w: number, h: number): { cv: HTMLCanvasElement | OffscreenCanvas, g: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const cv = new OffscreenCanvas(w, h)
    return { cv, g: cv.getContext('2d')! }
  }
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  return { cv, g: cv.getContext('2d')! }
}

/**
 * Paints the layers of one whorl. Every layer of a whorl shares one radial
 * gradient, so the layers are stacked in plain colour on a scratch canvas
 * (cheap to rasterise), then the gradient is applied once with 'source-in'
 * and the result is composited on the canvas: the same pixels as filling
 * every layer with the gradient, at a fraction of the cost.
 */
function paintWhorl(c: Ctx, petals: Poly[], b: Bloom, grad: (g: Ctx2D) => CanvasGradient, reach: number, r: Rng): void {
  const { g, W, H } = c
  const m = g.getTransform()
  // Bounding box of the whorl in pixels, clipped to the canvas.
  const rp = reach * c.S
  const x0 = Math.max(0, Math.floor(m.e - rp))
  const y0 = Math.max(0, Math.floor(m.f - rp))
  const x1 = Math.min(W, Math.ceil(m.e + rp))
  const y1 = Math.min(H, Math.ceil(m.f + rp))
  if (x1 <= x0 || y1 <= y0)
    return
  const w = x1 - x0
  const h = y1 - y0
  if (!c.scratch || c.scratch.cv.width < w || c.scratch.cv.height < h) {
    const cw = Math.max(w, c.scratch?.cv.width ?? 0)
    const ch = Math.max(h, c.scratch?.cv.height ?? 0)
    c.scratch = makeScratch(cw, ch)
  }
  const o = c.scratch.g
  o.setTransform(1, 0, 0, 1, 0, 0)
  o.globalCompositeOperation = 'source-over'
  o.clearRect(0, 0, w, h)
  o.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0)
  o.fillStyle = '#000'
  // Interleave the layers of neighbouring petals so they blend where they overlap.
  o.globalAlpha = 1 - 0.16 ** (1 / b.layers)
  for (let l = 0; l < b.layers; l++) {
    for (const base of petals) {
      o.beginPath()
      tracePoly(o, deform(base, b.rounds, 0.38, r))
      o.fill()
    }
  }
  o.globalAlpha = 1
  o.globalCompositeOperation = 'source-in'
  o.fillStyle = grad(o)
  o.fillRect(-reach * 2, -reach * 2, reach * 4, reach * 4)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.drawImage(c.scratch.cv, 0, 0, w, h, x0, y0, w, h)
  g.restore()
}

function paintBloom(c: Ctx, b: Bloom, r: Rng): void {
  const { g, f, pal } = c
  const n = PETALS[f.Symmetry]
  const ramp = pal.ramps[b.ramp]
  const spin = r() * Math.PI * 2
  const ribbon = f.Petal === 'Ribbon'
  const bend = ribbon ? range(r, 0.35, 0.6) * (r() < 0.5 ? -1 : 1) : 0
  const spread = Math.min(ribbon ? 0.24 : 0.62, Math.sin(Math.PI / n) * WIDTH[f.Petal])
  const inner = b.whorls === 2 ? 0.62 : 0.42

  g.save()
  g.translate(b.x, b.y)
  g.rotate(b.tilt)
  g.scale(b.squash, 1)
  g.rotate(spin)

  for (let w = 0; w < b.whorls; w++) {
    const Lw = b.whorls === 1 ? b.R : b.R * (1 - (w / (b.whorls - 1)) * (1 - inner))
    const r0 = b.R * 0.04
    const off = w * (Math.PI / n) + range(r, -0.08, 0.08)
    const petals: Poly[] = []
    for (let p = 0; p < n; p++) {
      const a = off + (p / n) * Math.PI * 2 + range(r, -0.05, 0.05) * (Math.PI * 2 / n)
      const L = Lw * range(r, 0.9, 1.06)
      const hw = L * spread * range(r, 0.88, 1.1) * (w > 0 && !ribbon ? 0.92 : 1)
      petals.push(deform(place(c.unit, r0, L, hw, a, bend), b.base, 0.14, r))
    }
    paintWhorl(c, petals, b, (o) => {
      const grad = o.createRadialGradient(0, 0, r0, 0, 0, Lw * 1.02)
      grad.addColorStop(0, ramp[0])
      grad.addColorStop(0.5, ramp[1])
      grad.addColorStop(1, ramp[2])
      return grad
    }, Lw * 1.45, r)
    // A thin, faint outline of the base shapes gives the petals a drawn edge.
    // Traced on a once-more, gently deformed copy, so the line is not angular.
    g.strokeStyle = pal.edge
    g.globalAlpha = (c.dark ? 0.12 : 0.16) * (1 - 0.5 * w / b.whorls)
    g.lineWidth = b.R * 0.005
    g.beginPath()
    for (const base of petals)
      tracePoly(g, deform(base, 1, 0.05, r))
    g.stroke()
    // Veins on the outer whorl.
    if (w === 0) {
      g.strokeStyle = ramp[0]
      g.globalAlpha = 0.22
      g.lineWidth = b.R * 0.005
      g.beginPath()
      for (let p = 0; p < n; p++) {
        const a = off + (p / n) * Math.PI * 2
        for (let v = 0; v < 3; v++) {
          const da = (v - 1) * spread * 0.32 + range(r, -0.04, 0.04)
          const len = Lw * range(r, 0.3, 0.6)
          g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0)
          g.quadraticCurveTo(Math.cos(a + da * 0.4) * len * 0.5, Math.sin(a + da * 0.4) * len * 0.5, Math.cos(a + da) * len, Math.sin(a + da) * len)
        }
      }
      g.stroke()
    }
  }
  paintCentre(c, b, r)
  g.restore()
}

function paintCentre(c: Ctx, b: Bloom, r: Rng): void {
  const { g, pal } = c
  const R = b.R
  if (c.centre === 'stamens') {
    g.fillStyle = pal.centreDark
    wash(g, ngon(0, 0, R * 0.06, 8, 0.6), 6, 1, 0.3, 0.85, r)
    const m = int(r, 18, 34)
    const lens: number[][] = []
    g.strokeStyle = pal.centre
    g.globalAlpha = 0.85
    g.lineWidth = R * 0.007
    g.beginPath()
    for (let i = 0; i < m; i++) {
      const a = r() * Math.PI * 2
      const len = R * range(r, 0.16, 0.3)
      const k = range(r, -0.25, 0.25)
      const ex = Math.cos(a + k) * len
      const ey = Math.sin(a + k) * len
      g.moveTo(Math.cos(a) * R * 0.03, Math.sin(a) * R * 0.03)
      g.quadraticCurveTo(Math.cos(a) * len * 0.6, Math.sin(a) * len * 0.6, ex, ey)
      lens.push([ex, ey])
    }
    g.stroke()
    g.fillStyle = pal.centre
    g.globalAlpha = 0.95
    g.beginPath()
    for (const [x, y] of lens) {
      g.moveTo(x + R * 0.017, y)
      g.arc(x, y, R * 0.017, 0, Math.PI * 2)
    }
    g.fill()
    return
  }
  if (c.centre === 'seeds') {
    g.fillStyle = pal.centreDark
    wash(g, ngon(0, 0, R * 0.14, 10, 0.5), 8, 1, 0.25, 0.9, r)
    const d = R * 0.03
    for (let ring = 1; ring <= 4; ring++) {
      const rad = ring * d
      const m = Math.max(4, Math.round((Math.PI * 2 * rad) / (1.7 * d)))
      const ph = r() * Math.PI * 2
      g.fillStyle = ring % 2 ? pal.centre : pal.ramps[b.ramp][2]
      g.globalAlpha = 0.9
      g.beginPath()
      for (let i = 0; i < m; i++) {
        const a = ph + (i / m) * Math.PI * 2 + range(r, -0.08, 0.08)
        const x = Math.cos(a) * rad
        const y = Math.sin(a) * rad
        const s = d * range(r, 0.28, 0.4)
        g.moveTo(x + s, y)
        g.arc(x, y, s, 0, Math.PI * 2)
      }
      g.fill()
    }
    return
  }
  if (c.centre === 'disc') {
    g.fillStyle = pal.centre
    wash(g, deform(ngon(0, 0, R * 0.17, 10, 0.5), 1, 0.2, r), 10, 2, 0.25, 0.92, r)
    g.fillStyle = pal.centreDark
    wash(g, ngon(0, 0, R * 0.07, 8, 0.5), 6, 1, 0.3, 0.8, r)
    return
  }
  g.fillStyle = pal.ramps[b.ramp][0]
  wash(g, ngon(0, 0, R * 0.08, 8, 0.7), 8, 2, 0.3, 0.75, r)
}

const petalOutlineLeaf = petalOutline('Leaf')
/**
 * Base, upper side and tip of the leaf outline, then back along the midrib.
 * The midrib is split into short, steady edges, otherwise its single long
 * edge would bulge when deformed.
 */
const leafHalf = (() => {
  const side = Array.from(petalOutlineLeaf.slice(0, 10 * 3))
  for (const x of [0.8, 0.6, 0.4, 0.2])
    side.push(x, 0, 0.1)
  return Float64Array.from(side)
})()

function paintLeaf(c: Ctx, x: number, y: number, a: number, L: number, r: Rng, layers: number, base = 1, slim = 1): void {
  const { g, pal } = c
  const unit = petalOutlineLeaf
  const bend = range(r, -0.18, 0.18)
  const hw = L * range(r, 0.18, 0.25) * slim
  const shape = deform(place(unit, 0, L, hw, 0, bend), base, 0.12, r)
  // One half of the blade, darker: the leaf is folded along its midrib.
  const half = deform(place(leafHalf, 0, L, hw, 0, bend), base, 0.12, r)
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.fillStyle = pal.leaf
  wash(g, shape, layers, 1, 0.2, 0.68, r)
  g.fillStyle = pal.stem
  wash(g, half, Math.max(3, layers >> 1), 1, 0.18, 0.4, r)
  g.strokeStyle = pal.stem
  g.globalAlpha = 0.45
  g.lineWidth = L * 0.018
  g.beginPath()
  g.moveTo(0, 0)
  g.quadraticCurveTo(L * 0.5, bend * L * 0.25, L * 0.92, bend * L * 0.85)
  g.stroke()
  g.restore()
}

function paintStem(c: Ctx, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, r: Rng): void {
  const { g, pal } = c
  g.strokeStyle = pal.stem
  for (let i = 0; i < 6; i++) {
    const j = () => range(r, -0.004, 0.004)
    g.globalAlpha = 0.28
    g.lineWidth = w * range(r, 0.6, 1.1)
    g.beginPath()
    g.moveTo(x0 + j(), y0)
    g.quadraticCurveTo(cx + j() * 3, cy + j() * 3, x1 + j(), y1 + j())
    g.stroke()
  }
}

function quad(t: number, a: number, b: number, c: number): number {
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  /** Visible half extents, in short-side units. */
  const hx = W / 2 / S
  const hy = H / 2 / S
  const visible = (x: number, y: number, rad: number) => Math.abs(x) - rad < hx && Math.abs(y) - rad < hy

  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  g.setTransform(S, 0, 0, S, W / 2, H / 2)
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // Stream order: layout first (every geometry decision), then one stream per
  // painted item, so skipping an item outside the canvas never shifts another.
  const lay = stream(hash, 'layout')
  const centre: Centre = weighted(lay, CENTRES)
  let whorls = 1
  if (f.Whorls === 'Double')
    whorls = 2
  else if (f.Whorls === 'Full')
    whorls = int(lay, 3, 4)
  const c: Ctx = { g, f, pal, unit: petalOutline(f.Petal), centre, dark: f.Palette === 'Nocturne', W, H, S, scratch: null }
  const n = PETALS[f.Symmetry]

  // Background washes over the whole field, painted at a quarter of the
  // resolution and scaled up: they are soft anyway, and it keeps exports fast.
  const Q = 4
  const ww = Math.max(1, Math.ceil(W / Q))
  const wh = Math.max(1, Math.ceil(H / Q))
  const wl = makeScratch(ww, wh)
  wl.g.setTransform(S / Q, 0, 0, S / Q, W / 2 / Q, H / 2 / Q)
  wl.g.fillStyle = pal.wash
  const washes = int(lay, 4, 7)
  for (let i = 0; i < washes; i++) {
    const x = range(lay, -FIELD, FIELD) * 0.8
    const y = range(lay, -FIELD, FIELD) * 0.8
    const rad = range(lay, 0.3, 0.7)
    if (!visible(x, y, rad * 1.3))
      continue
    const r = stream(hash, `wash${i}`)
    wash(wl.g, deform(ngon(x, y, rad, 10, 0.9, r() * 6.3), 2, 0.25, r), 10, 2, 0.35, 0.55, r)
  }
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(wl.cv, 0, 0, ww, wh, 0, 0, ww * Q, wh * Q)
  g.restore()

  // The cost of a piece is mostly the number of polygon vertices sent to the
  // canvas: blooms × petals × layers × vertices per layer (outline · 2^rounds).
  const unitPts = c.unit.length / 3
  const layersFor = (blooms: number, w: number, rounds: number) => Math.max(6, Math.min(22, Math.round(48000 / (blooms * n * w * unitPts * 2 ** rounds))))

  if (f.Composition === 'Solo') {
    const R = range(lay, 0.33, 0.38)
    const b: Bloom = { x: range(lay, -0.03, 0.03), y: range(lay, -0.03, 0.03), R, squash: range(lay, 0.92, 1), tilt: lay() * Math.PI * 2, ramp: 0, whorls, layers: layersFor(1, whorls, n * whorls <= 12 ? 3 : 2), base: 1, rounds: n * whorls <= 12 ? 2 : 1 }
    const leaves = int(lay, 2, 4)
    const leafA: number[] = []
    for (let i = 0; i < leaves; i++)
      leafA.push(lay() * Math.PI * 2)
    // Fallen petals scattered on the paper, away from the flower.
    const falls: number[][] = []
    const nf = int(lay, 9, 16)
    for (let i = 0; i < nf; i++) {
      let x = 0
      let y = 0
      // Every other petal lands in the central square, the rest anywhere on the field.
      const span = i % 2 ? FIELD : 0.46
      for (let t = 0; t < 20; t++) {
        x = range(lay, -span, span)
        y = range(lay, -span, span)
        if (Math.hypot(x - b.x, y - b.y) > R * 1.25)
          break
      }
      falls.push([x, y, lay() * Math.PI * 2, range(lay, 0.06, 0.11)])
    }
    falls.forEach(([x, y, a, L], i) => {
      if (!visible(x, y, L))
        return
      paintLoose(c, x, y, a, L, stream(hash, `fall${i}`))
    })
    const lr = stream(hash, 'leaves')
    for (const a of leafA)
      paintLeaf(c, b.x, b.y, a, R * range(lr, 1.5, 1.8), lr, 14, 1, 0.6)
    paintBloom(c, b, stream(hash, 'bloom0'))
  }
  else if (f.Composition === 'Stemmed') {
    const count = weighted(lay, [[1, 40], [2, 35], [3, 25]] as const)
    const Rs = count === 1 ? [0.25, 0.29] : count === 2 ? [0.18, 0.21] : [0.14, 0.17]
    const heads: Bloom[] = []
    const stems: number[][] = []
    const spacing = count === 3 ? 0.27 : 0.32
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * spacing + range(lay, -0.04, 0.04)
      const y = range(lay, -0.2, -0.06) + (i % 2 ? 0.1 : 0) * (count > 1 ? 1 : 0)
      const R = range(lay, Rs[0], Rs[1])
      const x0 = x * 0.25 + range(lay, -0.04, 0.04)
      const y0 = hy + 0.04
      const cx = (x0 + x) / 2 + range(lay, -0.1, 0.1)
      const cy = (y0 + y) / 2
      // The head faces up and forward: squashed along the stem's direction.
      const tilt = Math.atan2(y - cy, x - cx)
      heads.push({ x, y, R, squash: range(lay, 0.55, 0.82), tilt, ramp: i === 0 ? 0 : int(lay, 0, 2), whorls, layers: layersFor(count, whorls, 2), base: 1, rounds: 1 })
      const nl = int(lay, 1, 3)
      const leaves: number[] = []
      for (let k = 0; k < nl; k++)
        leaves.push(range(lay, 0.3, 0.75), range(lay, 0.12, 0.2), range(lay, 0.5, 0.95) * (k % 2 ? 1 : -1))
      stems.push([x0, y0, cx, cy, x, y, ...leaves])
    }
    stems.forEach((s, i) => {
      const r = stream(hash, `stem${i}`)
      const [x0, y0, cx, cy, x1, y1] = s
      paintStem(c, x0, y0, cx, cy, x1, y1, 0.009, r)
      for (let k = 6; k < s.length; k += 3) {
        const t = s[k]
        const px = quad(t, x0, cx, x1)
        const py = quad(t, y0, cy, y1)
        const tx = 2 * (1 - t) * (cx - x0) + 2 * t * (x1 - cx)
        const ty = 2 * (1 - t) * (cy - y0) + 2 * t * (y1 - cy)
        paintLeaf(c, px, py, Math.atan2(ty, tx) + s[k + 2], s[k + 1], r, 12)
      }
    })
    heads.forEach((b, i) => paintBloom(c, b, stream(hash, `bloom${i}`)))
  }
  else if (f.Composition === 'Bouquet') {
    const m = n >= 8 ? int(lay, 4, 6) : int(lay, 5, 8)
    const bw = Math.min(3, whorls)
    const bb = m * n * bw > 120 ? 0 : 1
    const bs: Bloom[] = []
    for (let i = 0; i < m; i++) {
      const a = lay() * Math.PI * 2
      const d = Math.sqrt(lay()) * 0.24
      bs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, R: range(lay, 0.12, 0.19), squash: range(lay, 0.7, 1), tilt: lay() * Math.PI * 2, ramp: weighted(lay, [[0, 55], [1, 25], [2, 20]] as const), whorls: bw, layers: layersFor(m, bw, bb + 1), base: bb, rounds: 1 })
    }
    // Push overlapping heads apart a little, then keep the bunch in the square.
    for (let it = 0; it < 40; it++) {
      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          const A = bs[i]
          const B = bs[j]
          const dx = B.x - A.x
          const dy = B.y - A.y
          const d = Math.hypot(dx, dy) || 1e-6
          const want = 0.85 * (A.R + B.R)
          if (d < want) {
            const push = (want - d) * 0.25
            A.x -= (dx / d) * push
            A.y -= (dy / d) * push
            B.x += (dx / d) * push
            B.y += (dy / d) * push
          }
        }
      }
      for (const b of bs) {
        const lim = 0.47 - b.R * 0.85
        b.x = Math.max(-lim, Math.min(lim, b.x))
        b.y = Math.max(-lim, Math.min(lim, b.y))
      }
    }
    const nl = int(lay, 6, 10)
    const leaves: number[][] = []
    const ph = lay() * Math.PI * 2
    for (let i = 0; i < nl; i++)
      leaves.push([ph + (i / nl) * Math.PI * 2 + range(lay, -0.25, 0.25), range(lay, 0.28, 0.4)])
    const lr = stream(hash, 'leaves')
    for (const [a, L] of leaves)
      paintLeaf(c, Math.cos(a) * 0.08, Math.sin(a) * 0.08, a, L, lr, 10)
    bs.map((b, i) => [b, i] as const)
      .sort((p, q) => p[0].y - q[0].y)
      .forEach(([b, i]) => paintBloom(c, b, stream(hash, `bloom${i}`)))
  }
  else {
    // Scatter: a printed field of small flowers on a jittered grid that
    // covers every aspect ratio; only the cells on the canvas are painted.
    const cell = 0.28
    const cells = Math.round((FIELD * 2) / cell)
    const sw = Math.min(2, whorls)
    let k = 0
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const on = lay() < 0.9
        const x = -FIELD + (i + 0.5 + range(lay, -0.32, 0.32)) * cell
        const y = -FIELD + (j + 0.5 + range(lay, -0.32, 0.32)) * cell
        const R = range(lay, 0.085, 0.125)
        const squash = range(lay, 0.72, 1)
        const tilt = lay() * Math.PI * 2
        const ramp = weighted(lay, [[0, 60], [1, 25], [2, 15]] as const)
        const id = k++
        if (!on || !visible(x, y, R * 1.6))
          continue
        const r = stream(hash, `bloom${id}`)
        const a = r() * Math.PI * 2
        paintLeaf(c, x, y, a, R * 1.5, r, 6, 0)
        paintLeaf(c, x, y, a + range(r, 2, 4.2), R * 1.3, r, 6, 0)
        paintBloom(c, { x, y, R, squash, tilt, ramp, whorls: sw, layers: Math.max(4, Math.min(10, Math.round(2600 / (n * sw * unitPts * 2)))), base: 0, rounds: 1 }, r)
      }
    }
  }

  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
}

/** A single loose petal lying on the paper. */
function paintLoose(c: Ctx, x: number, y: number, a: number, L: number, r: Rng): void {
  const { g, pal } = c
  const ramp = pal.ramps[0]
  const base = deform(place(c.unit, -L * 0.5, L, L * range(r, 0.35, 0.5), 0, 0), 1, 0.14, r)
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.fillStyle = ramp[2]
  wash(g, base, 10, 1, 0.38, 0.55, r)
  // A darker stain where the petal was attached.
  g.fillStyle = ramp[1]
  wash(g, deform(place(c.unit, -L * 0.5, L * 0.55, L * 0.25, 0, 0), 1, 0.2, r), 6, 1, 0.4, 0.45, r)
  g.restore()
}

export default {
  slug: 'bloom',
  title: 'Bloom',
  summary: 'Radially symmetric flowers built from deformed polygons stacked in dozens of translucent layers, like washes of watercolour.',
  order: 300,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xb1005eed ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Composition pair, twelve pairs; the
  // Peony solo flower is moved to the front as the cover.
  gallery: [
    '0x81e729824d07dcc933b263cd269ea8e978dd54a68c80b4b82b2fb0fc129c5fa7',
    '0x0facb258786772c490556dbad6fdbe4a2bb0a1b04cd33a2b96cc54c1fc5de9c3',
    '0x35e75895663a25889bd81e248de38f8cacd8d4409d7f7e564f1da7241d68d3ad',
    '0x87282ff58b6b093f9b4595de6af7a476e106c6c939445898d5efe3cea00ca516',
    '0xb953ff211539cb874de145aadf6cb2cf99baa1bb859946e407cd0c1a785d9e07',
    '0x8dee92e58c8640b934aff9a4b8a833ff1b9d2f32083863c4c8895f044d6f63c4',
    '0xf17f3a44d30735c2bd658601259e65c791cbeb6bfd5cc5b591aeec1eb7b2f6f6',
    '0xbde814be233ef90918921375b7120263f7c65f43e3d5ae27f9faabc122469132',
    '0xc2cb5ef511c6cf2a7d0af3efb295931176c0c47074d82b09aceaf3b387b63986',
    '0x76ae4bb244f14b1985f7f24dde158a240cc427c6cbd03890fcce42e8b01efad1',
    '0xf2182e6757be47c544fc624e4dfe4f66634132094b46b3580baa320b30a2c9f8',
    '0x633b80a4d226aef352f3b17e29c8fc448f64ab6659a1f438c7ff1f14215d9e78',
  ],
} satisfies Series
