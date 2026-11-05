// "Isometric" — tiny invented districts in isometric projection.
//
// A square grid of cells is planned from the hash (../isometric/scene.ts):
// streets and squares, terraced hillsides with flights of steps, an island
// ringed with sand, canals crossed by arched bridges, or a walled citadel
// around its keep. Each cell holds at most one object: a block of flats with
// a flat, hipped, gabled or domed roof, a slender tower, trees, stairs, an
// arch, a rampart, a jetty or a fountain. Everything is drawn back to front
// (the painter's algorithm: cells in order of i + j, which is exact for
// objects that stay inside their own cell), every box with three tones, one
// for the top and one for each visible side, set by where the light comes
// from. Shadows are computed, not painted: each horizontal face that can
// receive one sweeps the footprints of the nearby prisms along the light
// direction, clips them to itself and fills them in three passes, which
// gives them a soft edge.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A non-square canvas keeps the same diorama,
// centred and fitted, on a background that fills the whole frame.

import type { Arch, Axis, Block, Cell, Obj, Scene, Tower, Trees } from '../isometric/scene'
import type { Series } from '../types'
import { buildScene, DEPTH, FLOOR, STEP, WATER_BED, WATER_TOP } from '../isometric/scene'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Pastel', 22], ['Dusk', 20], ['Night', 18], ['Sandstone', 14], ['Blueprint', 14], ['Lagoon', 12]],
  Layout: [['Town', 28], ['Terraces', 22], ['Island', 20], ['Canals', 18], ['Citadel', 12]],
  Skyline: [['Low', 30], ['Mixed', 45], ['Towers', 25]],
  Light: [['Morning', 42], ['Afternoon', 42], ['Noon', 16]],
  Greenery: [['Bare', 20], ['Leafy', 55], ['Garden', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Layout: weighted(r, TRAITS.Layout),
    Skyline: weighted(r, TRAITS.Skyline),
    Light: weighted(r, TRAITS.Light),
    Greenery: weighted(r, TRAITS.Greenery),
  }
}

// ---------------------------------------------------------------------------
// Palettes. Original colour sets.
// ---------------------------------------------------------------------------

interface Palette {
  sky: readonly [string, string]
  motif: 'haze' | 'sun' | 'moon' | 'grid'
  sun: string
  lawn: string
  paving: string
  road: string
  sand: string
  soil: string
  stone: string
  water: string
  waterHi: string
  walls: readonly string[]
  roofs: readonly string[]
  leaf: readonly string[]
  trunk: string
  window: string
  lit: string
  /** Share of lit windows. */
  litP: number
  shadow: string
  shadowA: number
  /** Dark faces drift towards this colour instead of plain black. */
  tint: string
  edge: string
  edgeA: number
  /** Edge width, fraction of the cell width on screen. */
  edgeW: number
  roofKinds: ReadonlyArray<readonly ['flat' | 'pyramid' | 'gable' | 'dome', number]>
}

const PAL: Record<Features['Palette'], Palette> = {
  Pastel: {
    sky: ['#f7f0e8', '#ecdde6'],
    motif: 'haze',
    sun: '#ffffff',
    lawn: '#bcdab0',
    paving: '#efe4d6',
    road: '#dccfc4',
    sand: '#f3e2c2',
    soil: '#d4b2a0',
    stone: '#e6d0c0',
    water: '#a2d4dc',
    waterHi: '#effafa',
    walls: ['#f4bcb0', '#f6dbac', '#bcd2ec', '#dbcaec', '#f7f2ea', '#c4e4d2'],
    roofs: ['#e2877a', '#7f9fcf', '#9c88c4', '#e9b06a'],
    leaf: ['#8fc69c', '#b0d48a'],
    trunk: '#a58068',
    window: '#8a9abc',
    lit: '#fff3c4',
    litP: 0,
    shadow: '#5e4a72',
    shadowA: 1,
    tint: '#8676a8',
    edge: '#6a5a78',
    edgeA: 0.22,
    edgeW: 0.012,
    roofKinds: [['gable', 45], ['pyramid', 30], ['flat', 25]],
  },
  Dusk: {
    sky: ['#3d3160', '#f2a27a'],
    motif: 'sun',
    sun: '#ffd9a0',
    lawn: '#7c8a66',
    paving: '#d4a690',
    road: '#b08680',
    sand: '#e4b48e',
    soil: '#6a485c',
    stone: '#a87a7c',
    water: '#6a78aa',
    waterHi: '#f6c4a0',
    walls: ['#f2aa80', '#de8c72', '#c47c94', '#f5cc9e', '#e8b6a4'],
    roofs: ['#5c3c62', '#8e4c5e', '#3e3a5e'],
    leaf: ['#5f7c62', '#7a8a5a'],
    trunk: '#5a3e44',
    window: '#4a3456',
    lit: '#ffd68a',
    litP: 0.22,
    shadow: '#2a1a40',
    shadowA: 1,
    tint: '#4a2e6a',
    edge: '#3a2440',
    edgeA: 0.28,
    edgeW: 0.012,
    roofKinds: [['flat', 40], ['gable', 35], ['pyramid', 25]],
  },
  Night: {
    sky: ['#060914', '#1c2444'],
    motif: 'moon',
    sun: '#f4ecd2',
    lawn: '#1f3934',
    paving: '#2c3248',
    road: '#21263a',
    sand: '#3a3a4a',
    soil: '#14161f',
    stone: '#2c2e40',
    water: '#13284e',
    waterHi: '#6688c4',
    walls: ['#343c5c', '#40364f', '#2c4054', '#4a4762', '#3a424e'],
    roofs: ['#1c2036', '#2c2642', '#3c2c3c'],
    leaf: ['#1e3e34', '#2a4a3c'],
    trunk: '#1a1a24',
    window: '#171c2e',
    lit: '#ffc866',
    litP: 0.5,
    shadow: '#000004',
    shadowA: 0.75,
    tint: '#0a0c22',
    edge: '#04050c',
    edgeA: 0.4,
    edgeW: 0.012,
    roofKinds: [['flat', 50], ['gable', 30], ['pyramid', 20]],
  },
  Sandstone: {
    sky: ['#f7eacf', '#ebcd9e'],
    motif: 'sun',
    sun: '#fff6de',
    lawn: '#c4b472',
    paving: '#ecd8b4',
    road: '#dbc099',
    sand: '#f1d9a6',
    soil: '#b4825a',
    stone: '#d6ac7c',
    water: '#4fb0b0',
    waterHi: '#d0f4ec',
    walls: ['#eec99a', '#e2b082', '#f5e1be', '#d29668', '#f1d3a7'],
    roofs: ['#3f8f8c', '#c8643c', '#ecdcbc'],
    leaf: ['#7d9a52', '#9aa85a'],
    trunk: '#8a6040',
    window: '#6a4430',
    lit: '#fff0c0',
    litP: 0,
    shadow: '#6e3e30',
    shadowA: 1,
    tint: '#9a5444',
    edge: '#6a4430',
    edgeA: 0.2,
    edgeW: 0.012,
    roofKinds: [['flat', 55], ['dome', 35], ['pyramid', 10]],
  },
  Blueprint: {
    sky: ['#103a70', '#184a86'],
    motif: 'grid',
    sun: '#ffffff',
    lawn: '#2a60a2',
    paving: '#285c9e',
    road: '#225494',
    sand: '#3068aa',
    soil: '#163f78',
    stone: '#1f4f8c',
    water: '#0c2a5c',
    waterHi: '#8fb4e6',
    walls: ['#3570b4', '#3a76ba', '#2f68ac'],
    roofs: ['#2a5ea6', '#3a7abc'],
    leaf: ['#3070b2'],
    trunk: '#1e4a84',
    window: '#1a4884',
    lit: '#d4e6ff',
    litP: 0,
    shadow: '#061a42',
    shadowA: 0.8,
    tint: '#0c2c5c',
    edge: '#e6f0fe',
    edgeA: 0.85,
    edgeW: 0.02,
    roofKinds: [['flat', 40], ['gable', 30], ['pyramid', 20], ['dome', 10]],
  },
  Lagoon: {
    sky: ['#e6f4f1', '#bfe0e4'],
    motif: 'haze',
    sun: '#ffffff',
    lawn: '#a6d29c',
    paving: '#f3f1e7',
    road: '#e2ded2',
    sand: '#f5e9c8',
    soil: '#86a69e',
    stone: '#dcdcd0',
    water: '#2f9fbd',
    waterHi: '#dcf8fb',
    walls: ['#ffffff', '#f3f3eb', '#f7ebd1', '#d6eaf0', '#f9e1d5'],
    roofs: ['#2f6f9e', '#e07a5a', '#4aa0b0'],
    leaf: ['#5aa274', '#7cb86a'],
    trunk: '#8a6a50',
    window: '#3f6a86',
    lit: '#fff0c0',
    litP: 0,
    shadow: '#1a4458',
    shadowA: 1,
    tint: '#2a6a8a',
    edge: '#2a4a5a',
    edgeA: 0.2,
    edgeW: 0.012,
    roofKinds: [['flat', 50], ['dome', 25], ['gable', 15], ['pyramid', 10]],
  },
}

// ---------------------------------------------------------------------------
// Light. `s` is the shadow cast by one unit of height, in grid units; the
// three factors shade the top, the left (+j) and the right (+i) faces.
// `sun` is the screen direction towards the light, for the round trees.
// ---------------------------------------------------------------------------

interface Light { s: readonly [number, number], top: number, left: number, right: number, sun: readonly [number, number] }

const LIGHT: Record<Features['Light'], Light> = {
  Morning: { s: [0.62, -0.32], top: 1.08, left: 0.92, right: 0.68, sun: [-0.6, -0.8] },
  Afternoon: { s: [-0.32, 0.62], top: 1.08, left: 0.68, right: 0.92, sun: [0.6, -0.8] },
  Noon: { s: [0.2, 0.2], top: 1.1, left: 0.84, right: 0.72, sun: [0, -1] },
}

/** Screen height of one world unit, for a cell half-width of 1 (true isometric: sqrt(1.5)). */
const CZ = Math.sqrt(1.5)

/** Soft shadow: (footprint growth, length factor, opacity) per pass. */
const PASSES = [[0.06, 1.1, 0.08], [0, 1, 0.1], [-0.035, 0.85, 0.12]] as const

type RGB = readonly [number, number, number]

function hexRgb(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Integer hash of a few integers, for per-element details that must not consume a stream. */
function h01(seed: number, a: number, b: number, c: number): number {
  let h = seed ^ Math.imul(a + 1, 0x27D4EB2D) ^ Math.imul(b + 3, 0x165667B1) ^ Math.imul(c + 7, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

interface Prism { x0: number, y0: number, x1: number, y1: number, z0: number, z1: number }

function cellTop(c: Cell): number {
  return c.surface === 'water' ? WATER_TOP : c.ground
}

/** The prisms a cell casts shadows with (the object only; the terrain is added separately). */
function objectPrisms(i: number, j: number, c: Cell): Prism[] {
  const o = c.obj
  const z = cellTop(c)
  if (!o)
    return []
  const box = (e: number, z0: number, z1: number): Prism => ({ x0: i + e, y0: j + e, x1: i + 1 - e, y1: j + 1 - e, z0, z1 })
  switch (o.t) {
    case 'block': {
      const lower = o.floors - o.upper
      const zt = z + lower * FLOOR
      const out = [box(o.inset, z, zt)]
      let top = zt
      let e = o.inset
      if (o.upper) {
        e += 0.13
        top = zt + o.upper * FLOOR
        out.push(box(e, zt, top))
      }
      if (o.roof !== 'flat')
        out.push(box(e + 0.15, top, top + (1 - 2 * e) * 0.22))
      return out
    }
    case 'tower': {
      const e = o.roof === 'crown' ? 0.16 : 0.3
      const top = z + o.floors * FLOOR
      const out = [box(e, z, top)]
      if (o.roof === 'spire')
        out.push(box(e + 0.12, top, top + 0.45))
      if (o.roof === 'lantern')
        out.push(box(e + 0.05, top, top + 0.3))
      return out
    }
    case 'trees':
      return o.spots.map((s) => {
        const h = s.cone ? s.size * 3 : s.size * 2
        const w = s.size * 0.75
        return { x0: i + s.x - w, y0: j + s.y - w, x1: i + s.x + w, y1: j + s.y + w, z0: z + 0.12, z1: z + 0.12 + h }
      })
    case 'arch':
      if (o.kind === 'gate')
        return [box(0, z, z + 0.78)]
      return []
    case 'wall':
      return [box(0, z, z + 0.48)]
    case 'fountain':
      return [box(0.44, z, z + 0.36)]
    default:
      return []
  }
}

// Convex hull (monotone chain) of a handful of points.
function hull(pts: number[][]): number[][] {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: number[][] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: number[][] = []
  for (let k = pts.length - 1; k >= 0; k--) {
    const p = pts[k]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

// Sutherland-Hodgman clip of a convex polygon to an axis-aligned rectangle.
function clipRect(poly: number[][], x0: number, y0: number, x1: number, y1: number): number[][] {
  let out = poly
  const edges: Array<[number, number, number]> = [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]]
  for (const [ax, v, sgn] of edges) {
    const inp = out
    out = []
    if (!inp.length)
      break
    for (let k = 0; k < inp.length; k++) {
      const a = inp[k]
      const b = inp[(k + 1) % inp.length]
      const ia = (a[ax] - v) * sgn >= 0
      const ib = (b[ax] - v) * sgn >= 0
      if (ia)
        out.push(a)
      if (ia !== ib) {
        const t = (v - a[ax]) / (b[ax] - a[ax])
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      }
    }
  }
  return out
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const L = LIGHT[f.Light]
  const scene: Scene = buildScene(stream(hash, 'plan'), {
    layout: f.Layout,
    skyline: f.Skyline,
    greenery: f.Greenery,
    roofs: pal.roofKinds,
    walls: pal.walls.length,
    roofTints: pal.roofs.length,
  })
  const sky = stream(hash, 'sky')
  const seed = Math.floor(stream(hash, 'detail')() * 4294967296) >>> 0
  const S = Math.min(W, H)
  const n = scene.n
  const cells = scene.cells
  const at = (i: number, j: number) => cells[i * n + j]

  // --- shadow casters and fit -------------------------------------------
  const casters: Prism[][] = []
  let maxZ = 0
  let yMin = Infinity
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = at(i, j)
      const list = objectPrisms(i, j, c)
      const t = cellTop(c)
      if (t > 0)
        list.push({ x0: i, y0: j, x1: i + 1, y1: j + 1, z0: 0, z1: t })
      casters.push(list)
      let top = t
      for (const p of list) top = Math.max(top, p.z1)
      maxZ = Math.max(maxZ, top)
      yMin = Math.min(yMin, (i + j) * 0.5 - top * CZ)
    }
  }
  const yMax = n + DEPTH * CZ + 0.6
  const margin = 0.055 * S
  const A = Math.min((W - 2 * margin) / (2 * n + 0.4), (H - 2 * margin) / (yMax - yMin))
  const B = A / 2
  const C = A * CZ
  const ox = W / 2
  const oy = H / 2 - ((yMin + yMax) / 2) * A
  const [sx, sy] = L.s
  const K = Math.ceil(maxZ * Math.max(Math.abs(sx), Math.abs(sy)) * 1.1) + 1

  const P = (x: number, y: number, z: number): [number, number] => [ox + (x - y) * A, oy + (x + y) * B - z * C]

  // --- colour ---------------------------------------------------------------
  const tint = hexRgb(pal.tint)
  const memo = new Map<string, string>()
  function col(hex: string, k: number): string {
    const key = hex + k.toFixed(3)
    let v = memo.get(key)
    if (v)
      return v
    const c = hexRgb(hex)
    let out: number[]
    if (k >= 1) {
      const t = Math.min(1, (k - 1) * 1.8)
      out = c.map(x => x + (255 - x) * t)
    }
    else {
      const t = (1 - k) * 0.4
      out = c.map((x, q) => x * k * (1 - t) + tint[q] * t)
    }
    v = `rgb(${out.map(x => Math.round(Math.max(0, Math.min(255, x)))).join(',')})`
    memo.set(key, v)
    return v
  }

  // --- drawing primitives -------------------------------------------------
  const edgeRgb = hexRgb(pal.edge)
  const edgeOn = pal.edgeA > 0
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const edgeStyle = `rgba(${edgeRgb.join(',')},${pal.edgeA})`
  const edgeWidth = pal.edgeW * A

  function poly(pts: ReadonlyArray<readonly [number, number]>) {
    g.moveTo(pts[0][0], pts[0][1])
    for (let k = 1; k < pts.length; k++)
      g.lineTo(pts[k][0], pts[k][1])
    g.closePath()
  }
  function face(pts: ReadonlyArray<readonly [number, number]>, fill: string) {
    g.beginPath()
    poly(pts)
    g.fillStyle = fill
    g.fill()
    if (edgeOn) {
      g.strokeStyle = edgeStyle
      g.lineWidth = edgeWidth
      g.stroke()
    }
  }
  /** A box: left (+j) face, right (+i) face, then the top (unless topHex is null). */
  function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, hex: string, topHex: string | null = hex, sides = true) {
    const a = P(x0, y1, z1)
    const b = P(x1, y1, z1)
    const c = P(x1, y0, z1)
    if (sides) {
      const a0 = P(x0, y1, z0)
      const b0 = P(x1, y1, z0)
      const c0 = P(x1, y0, z0)
      face([a, b, b0, a0], col(hex, L.left))
      face([b, c, c0, b0], col(hex, L.right))
    }
    if (topHex)
      face([P(x0, y0, z1), c, b, a], col(topHex, L.top))
  }

  // --- shadows --------------------------------------------------------------
  const shadowCol = pal.shadow
  function receive(ri: number, rj: number, x0: number, y0: number, x1: number, y1: number, z: number) {
    const cand: Prism[] = []
    for (let i = Math.max(0, ri - K); i <= Math.min(n - 1, ri + K); i++) {
      for (let j = Math.max(0, rj - K); j <= Math.min(n - 1, rj + K); j++) {
        for (const p of casters[i * n + j]) {
          if (p.z1 <= z + 1e-6)
            continue
          const db = (p.z1 - z) * 1.1
          const da = (Math.max(p.z0, z) - z)
          const lo = Math.min(sx * da, sx * db)
          const hi = Math.max(sx * da, sx * db)
          const lo2 = Math.min(sy * da, sy * db)
          const hi2 = Math.max(sy * da, sy * db)
          if (p.x1 + hi + 0.06 <= x0 || p.x0 + lo - 0.06 >= x1 || p.y1 + hi2 + 0.06 <= y0 || p.y0 + lo2 - 0.06 >= y1)
            continue
          cand.push(p)
        }
      }
    }
    if (!cand.length)
      return
    g.fillStyle = shadowCol
    for (const [e, l, a] of PASSES) {
      g.beginPath()
      let any = false
      for (const p of cand) {
        const ex = Math.min(e, (p.x1 - p.x0) * 0.4)
        const ey = Math.min(e, (p.y1 - p.y0) * 0.4)
        const da = (Math.max(p.z0, z) - z) * l
        const db = (p.z1 - z) * l
        const pts: number[][] = []
        for (const d of [da, db]) {
          const dx = sx * d
          const dy = sy * d
          pts.push([p.x0 - ex + dx, p.y0 - ey + dy], [p.x1 + ex + dx, p.y0 - ey + dy], [p.x1 + ex + dx, p.y1 + ey + dy], [p.x0 - ex + dx, p.y1 + ey + dy])
        }
        const clipped = clipRect(hull(pts), x0, y0, x1, y1)
        if (clipped.length < 3)
          continue
        any = true
        const s0 = P(clipped[0][0], clipped[0][1], z)
        g.moveTo(s0[0], s0[1])
        for (let k = 1; k < clipped.length; k++) {
          const s = P(clipped[k][0], clipped[k][1], z)
          g.lineTo(s[0], s[1])
        }
        g.closePath()
      }
      if (any) {
        g.globalAlpha = a * pal.shadowA
        g.fill()
      }
    }
    g.globalAlpha = 1
  }

  // --- background -----------------------------------------------------------
  const grad = g.createLinearGradient(0, 0, 0, H)
  grad.addColorStop(0, pal.sky[0])
  grad.addColorStop(1, pal.sky[1])
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  const cx = W / 2
  const cy = H / 2
  if (pal.motif === 'haze') {
    const rg = g.createRadialGradient(cx, cy - 0.05 * S, 0, cx, cy - 0.05 * S, 0.62 * S)
    rg.addColorStop(0, 'rgba(255,255,255,0.7)')
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = rg
    g.fillRect(0, 0, W, H)
  }
  else if (pal.motif === 'sun' || pal.motif === 'moon') {
    const moon = pal.motif === 'moon'
    if (moon) {
      g.fillStyle = pal.sun
      for (let k = 0; k < 110; k++) {
        const x = sky() * W
        const y = sky() * H
        const rad = (0.0007 + sky() ** 3 * 0.0026) * S
        g.globalAlpha = 0.25 + sky() * 0.6
        g.beginPath()
        g.arc(x, y, rad, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }
    const side = L.sun[0] === 0 ? (sky() < 0.5 ? -1 : 1) : Math.sign(L.sun[0])
    const sxp = cx + side * range(sky, 0.2, 0.34) * S
    const syp = cy - range(sky, 0.26, 0.36) * S
    const rad = (moon ? 0.045 : 0.085) * S
    const glow = g.createRadialGradient(sxp, syp, rad * 0.5, sxp, syp, rad * 4)
    const sc = hexRgb(pal.sun)
    glow.addColorStop(0, `rgba(${sc.join(',')},${moon ? 0.25 : 0.45})`)
    glow.addColorStop(1, `rgba(${sc.join(',')},0)`)
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
    g.fillStyle = pal.sun
    g.globalAlpha = moon ? 1 : 0.85
    g.beginPath()
    g.arc(sxp, syp, rad, 0, Math.PI * 2)
    g.fill()
    g.globalAlpha = 1
  }
  else {
    // blueprint grid, aligned on the canvas centre
    const step = 0.03 * S
    const ec = hexRgb(pal.edge)
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath()
      const kx = Math.ceil(cx / step)
      const ky = Math.ceil(cy / step)
      for (let k = -kx; k <= kx; k++) {
        if ((k % 5 === 0) !== (pass === 1))
          continue
        g.moveTo(cx + k * step, 0)
        g.lineTo(cx + k * step, H)
      }
      for (let k = -ky; k <= ky; k++) {
        if ((k % 5 === 0) !== (pass === 1))
          continue
        g.moveTo(0, cy + k * step)
        g.lineTo(W, cy + k * step)
      }
      g.strokeStyle = `rgba(${ec.join(',')},${pass ? 0.16 : 0.07})`
      g.lineWidth = (pass ? 0.0012 : 0.0007) * S
      g.stroke()
    }
  }

  // drop shadow under the plinth, blurred on a small buffer and scaled up
  // (a full-size shadowBlur costs about a second on an 8K export)
  {
    const sc = hexRgb(pal.shadow)
    const pad = 1.6 * A
    const left = ox - n * A - pad
    const top = oy + DEPTH * C - 0.2 * A - pad
    const bw = 2 * n * A + 2 * pad
    const bh = (n + 0.8) * A + 2 * pad
    const k = Math.min(1, 220 / bw)
    const w = Math.max(1, Math.round(bw * k))
    const h = Math.max(1, Math.round(bh * k))
    const buf = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const bg = buf.getContext('2d') as CanvasRenderingContext2D | null
    if (bg) {
      const q = [P(-0.2, -0.2, -DEPTH), P(n + 0.2, -0.2, -DEPTH), P(n + 0.2, n + 0.2, -DEPTH), P(-0.2, n + 0.2, -DEPTH)]
      const away = w + h
      bg.shadowColor = `rgba(${sc.join(',')},${0.32 * pal.shadowA})`
      bg.shadowBlur = 0.9 * A * k
      bg.shadowOffsetX = away
      bg.shadowOffsetY = 0.4 * A * k
      bg.fillStyle = '#000'
      bg.beginPath()
      q.forEach(([x, y], idx) => (idx ? bg.lineTo : bg.moveTo).call(bg, (x - left) * k - away, (y - top) * k))
      bg.closePath()
      bg.fill()
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(buf, left, top, bw, bh)
    }
  }

  // --- terrain --------------------------------------------------------------
  const surfaceHex = (c: Cell) => ({ lawn: pal.lawn, paving: pal.paving, road: pal.road, sand: pal.sand, water: pal.water })[c.surface]
  const neighbourTop = (i: number, j: number) => (i < n && j < n ? cellTop(at(i, j)) : -DEPTH)

  // terrain sides get no outline (it would draw the cell grid on the plinth), except on the blueprint
  const terrainEdges = pal.edgeA > 0.5
  function side(axis: Axis, i: number, j: number, za: number, zb: number, hex: string) {
    if (zb <= za + 1e-6)
      return
    g.beginPath()
    if (axis === 'j')
      poly([P(i, j + 1, zb), P(i + 1, j + 1, zb), P(i + 1, j + 1, za), P(i, j + 1, za)])
    else
      poly([P(i + 1, j + 1, zb), P(i + 1, j, zb), P(i + 1, j, za), P(i + 1, j + 1, za)])
    g.fillStyle = col(hex, axis === 'j' ? L.left : L.right)
    g.fill()
    // outline on the blueprint, otherwise a same-colour hairline over the seams
    g.strokeStyle = terrainEdges ? edgeStyle : g.fillStyle
    g.lineWidth = terrainEdges ? edgeWidth : Math.max(0.6, 0.012 * A)
    g.stroke()
  }

  function terrain(i: number, j: number, c: Cell) {
    const top = cellTop(c)
    const water = c.surface === 'water'
    for (const axis of ['j', 'i'] as const) {
      const lo = axis === 'j' ? neighbourTop(i, j + 1) : neighbourTop(i + 1, j)
      if (water) {
        side(axis, i, j, lo, Math.min(top, WATER_BED), pal.soil)
        side(axis, i, j, Math.max(lo, WATER_BED), top, pal.water)
      }
      else {
        side(axis, i, j, lo, Math.min(top, 0), pal.soil)
        side(axis, i, j, Math.max(lo, 0), top, pal.stone)
      }
    }
    const v = water ? 1 : 0.97 + 0.05 * h01(seed, i, j, 1)
    g.beginPath()
    poly([P(i, j, top), P(i + 1, j, top), P(i + 1, j + 1, top), P(i, j + 1, top)])
    g.fillStyle = col(surfaceHex(c), L.top * v)
    g.fill()
    // a hairline in the same colour closes the antialiasing seams between cells
    g.strokeStyle = g.fillStyle
    g.lineWidth = Math.max(0.6, 0.012 * A)
    g.stroke()
    if (terrainEdges && !water) {
      g.strokeStyle = edgeStyle
      g.lineWidth = edgeWidth * 0.6
      g.globalAlpha = 0.4
      g.stroke()
      g.globalAlpha = 1
    }
    if (water) {
      g.strokeStyle = pal.waterHi
      g.lineWidth = 0.03 * A
      g.globalAlpha = 0.7
      g.beginPath()
      for (let k = 0; k < 2; k++) {
        if (h01(seed, i, j, 40 + k) < 0.45)
          continue
        const u = 0.15 + 0.5 * h01(seed, i, j, 10 + k)
        const w = 0.15 + 0.6 * h01(seed, i, j, 20 + k)
        const len = 0.18 + 0.12 * h01(seed, i, j, 30 + k)
        const [ax, ay] = k ? P(i + u, j + w, top) : P(i + w, j + u, top)
        const [bx, by] = k ? P(i + u + len, j + w, top) : P(i + w, j + u + len, top)
        g.moveTo(ax, ay)
        g.lineTo(bx, by)
      }
      g.stroke()
      g.globalAlpha = 1
    }
    else if (c.surface === 'road') {
      g.strokeStyle = col(pal.paving, 1.12)
      g.lineWidth = 0.035 * A
      g.beginPath()
      const [ax, ay] = c.road === 'j' ? P(i + 0.5, j + 0.28, top) : P(i + 0.28, j + 0.5, top)
      const [bx, by] = c.road === 'j' ? P(i + 0.5, j + 0.72, top) : P(i + 0.72, j + 0.5, top)
      g.moveTo(ax, ay)
      g.lineTo(bx, by)
      g.stroke()
    }
    receive(i, j, i, j, i + 1, j + 1, top)
  }

  // --- objects --------------------------------------------------------------
  const litFace: Axis = L.left >= L.right ? 'j' : 'i'

  function windows(x0: number, y0: number, x1: number, y1: number, zb: number, floors: number, id: number, door: boolean, slim = false) {
    for (const axis of ['j', 'i'] as const) {
      const len = axis === 'j' ? x1 - x0 : y1 - y0
      const m = slim ? 1 : Math.max(1, Math.round(len / 0.24))
      const hw = slim ? 0.035 : Math.min(0.055, (len / m) * 0.28)
      const k = axis === 'j' ? L.left : L.right
      const dark: number[][][] = []
      const lit: number[][][] = []
      for (let fl = 0; fl < floors; fl++) {
        for (let q = 0; q < m; q++) {
          const u = ((q + 0.5) * len) / m
          const isDoor = door && fl === 0 && axis === litFace && q === Math.floor(m / 2)
          const za = isDoor ? zb : zb + fl * FLOOR + 0.09
          const zt = isDoor ? zb + 0.2 : za + (slim ? 0.16 : 0.12)
          const w = isDoor ? Math.max(hw, 0.05) : hw
          const pts = axis === 'j'
            ? [P(x0 + u - w, y1, zt), P(x0 + u + w, y1, zt), P(x0 + u + w, y1, za), P(x0 + u - w, y1, za)]
            : [P(x1, y0 + u - w, zt), P(x1, y0 + u + w, zt), P(x1, y0 + u + w, za), P(x1, y0 + u - w, za)]
          const isLit = !isDoor && pal.litP > 0 && h01(seed, id, fl * 8 + q, axis === 'j' ? 2 : 3) < pal.litP
          ;(isLit ? lit : dark).push(pts)
        }
      }
      for (const [list, fill] of [[dark, col(pal.window, k)], [lit, pal.lit]] as const) {
        if (!list.length)
          continue
        g.beginPath()
        for (const pts of list) poly(pts as [number, number][])
        g.fillStyle = fill
        g.fill()
      }
    }
  }

  function pyramid(x0: number, y0: number, x1: number, y1: number, z: number, h: number, hex: string) {
    const apex = P((x0 + x1) / 2, (y0 + y1) / 2, z + h)
    const a = P(x0, y1, z)
    const b = P(x1, y1, z)
    const c = P(x1, y0, z)
    const d = P(x0, y0, z)
    face(hull([d, c, b, a, apex].map(p => [p[0], p[1]])) as [number, number][], col(hex, 0.55))
    face([a, b, apex], col(hex, (L.left + L.top) / 2))
    face([b, c, apex], col(hex, (L.right + L.top) / 2 - 0.08))
  }

  function gable(x0: number, y0: number, x1: number, y1: number, z: number, ridge: Axis, roofHex: string, wallHex: string) {
    if (ridge === 'i') {
      const h = (y1 - y0) * 0.38
      const ym = (y0 + y1) / 2
      face([P(x0, y0, z), P(x1, y0, z), P(x1, ym, z + h), P(x0, ym, z + h)], col(roofHex, 0.82))
      face([P(x0, y1, z), P(x1, y1, z), P(x1, ym, z + h), P(x0, ym, z + h)], col(roofHex, (L.left + L.top) / 2))
      face([P(x1, y0, z), P(x1, y1, z), P(x1, ym, z + h)], col(wallHex, L.right))
    }
    else {
      const h = (x1 - x0) * 0.38
      const xm = (x0 + x1) / 2
      face([P(x0, y0, z), P(x0, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], col(roofHex, 0.82))
      face([P(x1, y0, z), P(x1, y1, z), P(xm, y1, z + h), P(xm, y0, z + h)], col(roofHex, (L.right + L.top) / 2))
      face([P(x0, y1, z), P(x1, y1, z), P(xm, y1, z + h)], col(wallHex, L.left))
    }
  }

  function dome(x0: number, y0: number, x1: number, y1: number, z: number, hex: string) {
    const R = Math.min(x1 - x0, y1 - y0) * 0.4
    const [px, py] = P((x0 + x1) / 2, (y0 + y1) / 2, z)
    const rx = Math.SQRT2 * R * A
    const lg = g.createLinearGradient(px - rx * L.sun[0] * -1, py - rx, px + rx * L.sun[0] * -1, py + rx * 0.3)
    lg.addColorStop(0, col(hex, L.top + 0.04))
    lg.addColorStop(1, col(hex, Math.min(L.left, L.right) - 0.05))
    g.beginPath()
    g.ellipse(px, py, rx, rx / 2, 0, 0, Math.PI)
    g.arc(px, py, rx, Math.PI, Math.PI * 2)
    g.closePath()
    g.fillStyle = lg
    g.fill()
    if (edgeOn) {
      g.strokeStyle = edgeStyle
      g.lineWidth = edgeWidth
      g.stroke()
    }
  }

  function merlons(x0: number, y0: number, x1: number, y1: number, z: number, hex: string) {
    const w = 0.16
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = x0 + (x1 - x0) * u
      const y = y0 + (y1 - y0) * v
      box(x - w / 2, y - w / 2, x + w / 2, y + w / 2, z, z + 0.12, hex)
    }
  }

  function drawBlock(i: number, j: number, z0: number, b: Block) {
    const wall = pal.walls[b.wall]
    const roof = pal.roofs[b.roofTint]
    let e = b.inset
    const lower = b.floors - b.upper
    let zb = z0
    let zt = z0 + lower * FLOOR
    box(i + e, j + e, i + 1 - e, j + 1 - e, zb, zt, wall)
    windows(i + e, j + e, i + 1 - e, j + 1 - e, zb, lower, (i * n + j) * 4, true)
    if (b.upper) {
      receive(i, j, i + e, j + e, i + 1 - e, j + 1 - e, zt)
      e += 0.13
      zb = zt
      zt += b.upper * FLOOR
      box(i + e, j + e, i + 1 - e, j + 1 - e, zb, zt, wall)
      windows(i + e, j + e, i + 1 - e, j + 1 - e, zb, b.upper, (i * n + j) * 4 + 1, false)
    }
    const x0 = i + e
    const y0 = j + e
    const x1 = i + 1 - e
    const y1 = j + 1 - e
    if (b.roof === 'flat' || b.roof === 'dome') {
      const p = 0.035
      box(x0 + p, y0 + p, x1 - p, y1 - p, zt, zt, roof, roof, false)
      receive(i, j, x0, y0, x1, y1, zt)
      if (b.roof === 'dome') {
        dome(x0, y0, x1, y1, zt, roof)
      }
      else if (h01(seed, i, j, 50) < 0.45) {
        // a small rooftop box: stair head or water tank
        const s = 0.14 + 0.08 * h01(seed, i, j, 51)
        const u = x0 + 0.06 + (x1 - x0 - s - 0.12) * h01(seed, i, j, 52)
        const v = y0 + 0.06 + (y1 - y0 - s - 0.12) * h01(seed, i, j, 53)
        box(u, v, u + s, v + s, zt, zt + 0.13, wall)
      }
    }
    else if (b.roof === 'pyramid') {
      pyramid(x0, y0, x1, y1, zt, (x1 - x0) * 0.45, roof)
    }
    else {
      gable(x0, y0, x1, y1, zt, b.ridge, roof, wall)
    }
  }

  function drawTower(i: number, j: number, z0: number, t: Tower) {
    const wall = pal.walls[t.wall]
    const roof = pal.roofs[t.roofTint]
    const e = t.roof === 'crown' ? 0.16 : 0.3
    const x0 = i + e
    const y0 = j + e
    const x1 = i + 1 - e
    const y1 = j + 1 - e
    const zt = z0 + t.floors * FLOOR
    if (t.stripes) {
      for (let k = 0; k < t.floors; k++)
        box(x0, y0, x1, y1, z0 + k * FLOOR, z0 + (k + 1) * FLOOR, k % 2 ? roof : pal.walls[0], k === t.floors - 1 ? wall : null)
    }
    else {
      box(x0, y0, x1, y1, z0, zt, t.roof === 'crown' ? pal.stone : wall)
      windows(x0, y0, x1, y1, z0, t.floors, (i * n + j) * 4 + 2, false, true)
    }
    if (t.roof === 'spire') {
      pyramid(x0 - 0.03, y0 - 0.03, x1 + 0.03, y1 + 0.03, zt, 0.5 + (x1 - x0) * 0.6, roof)
    }
    else if (t.roof === 'crown') {
      box(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, zt - 0.1, zt + 0.04, pal.stone)
      merlons(x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, zt + 0.04, pal.stone)
    }
    else {
      box(x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.05, zt, zt + 0.2, pal.lit, pal.lit)
      pyramid(x0 - 0.02, y0 - 0.02, x1 + 0.02, y1 + 0.02, zt + 0.2, 0.16, roof)
    }
  }

  function drawTrees(i: number, j: number, z0: number, t: Trees) {
    const lightK = Math.max(L.left, L.right)
    const darkK = Math.min(L.left, L.right)
    for (let k = 0; k < t.spots.length; k++) {
      const s = t.spots[k]
      const x = i + s.x
      const y = j + s.y
      const leaf = pal.leaf[Math.floor(h01(seed, i * n + j, k, 60) * pal.leaf.length)]
      box(x - 0.035, y - 0.035, x + 0.035, y + 0.035, z0, z0 + 0.14, pal.trunk)
      const r = s.size * Math.SQRT2 * A
      if (s.cone) {
        const [bx, by] = P(x, y, z0 + 0.1)
        const [tx, ty] = P(x, y, z0 + 0.1 + s.size * 3)
        const leftLit = L.sun[0] <= 0
        g.beginPath()
        g.moveTo(tx, ty)
        g.lineTo(bx - r, by)
        g.quadraticCurveTo(bx - r, by + r / 2, bx, by + r / 2)
        g.closePath()
        g.fillStyle = col(leaf, leftLit ? lightK : darkK)
        g.fill()
        g.beginPath()
        g.moveTo(tx, ty)
        g.lineTo(bx, by + r / 2)
        g.quadraticCurveTo(bx + r, by + r / 2, bx + r, by)
        g.closePath()
        g.fillStyle = col(leaf, leftLit ? darkK : lightK)
        g.fill()
      }
      else {
        const [px, py] = P(x, y, z0 + 0.12 + s.size)
        const [ux, uy] = L.sun
        const disc = (dx: number, dy: number, rad: number, fill: string) => {
          g.beginPath()
          g.arc(px + dx, py + dy, rad, 0, Math.PI * 2)
          g.fillStyle = fill
          g.fill()
        }
        disc(0, 0, r, col(leaf, darkK))
        disc(ux * r * 0.18, uy * r * 0.18, r * 0.8, col(leaf, lightK))
        disc(ux * r * 0.4, uy * r * 0.4, r * 0.36, col(leaf, L.top))
      }
    }
  }

  function archOpening(axis: Axis, x0: number, y0: number, x1: number, y1: number, zo: number, zs: number, ry: number, fill: string) {
    const len = axis === 'j' ? x1 - x0 : y1 - y0
    const um = len / 2
    const hu = len * 0.3
    const at2 = (u: number, z: number) => (axis === 'j' ? P(x0 + u, y1, z) : P(x1, y0 + u, z))
    const pts: [number, number][] = [at2(um - hu, zo), at2(um - hu, zs)]
    for (let k = 1; k < 16; k++) {
      const t = Math.PI - (k / 16) * Math.PI
      pts.push(at2(um + hu * Math.cos(t), zs + ry * Math.sin(t)))
    }
    pts.push(at2(um + hu, zs), at2(um + hu, zo))
    face(pts, fill)
  }

  function drawArch(i: number, j: number, z0: number, a: Arch) {
    if (a.kind === 'gate') {
      const zt = z0 + 0.78
      box(i, j, i + 1, j + 1, z0, zt, pal.stone)
      archOpening(a.axis, i, j, i + 1, j + 1, z0, z0 + 0.2, 0.24, col(pal.stone, 0.3))
      receive(i, j, i, j, i + 1, j + 1, zt)
      merlons(i, j, i + 1, j + 1, zt, pal.stone)
      return
    }
    const zt = 0.12
    const w = 0.26
    const x0 = a.axis === 'i' ? i + w : i
    const x1 = a.axis === 'i' ? i + 1 - w : i + 1
    const y0 = a.axis === 'j' ? j + w : j
    const y1 = a.axis === 'j' ? j + 1 - w : j + 1
    box(x0, y0, x1, y1, WATER_TOP, zt, pal.stone)
    archOpening(a.axis, x0, y0, x1, y1, WATER_TOP, WATER_TOP, 0.19, col(pal.water, 0.5))
    receive(i, j, x0, y0, x1, y1, zt)
    const p = 0.06
    if (a.axis === 'j') {
      box(x0, y0, x1, y0 + p, zt, zt + 0.09, pal.stone)
      box(x0, y1 - p, x1, y1, zt, zt + 0.09, pal.stone)
    }
    else {
      box(x0, y0, x0 + p, y1, zt, zt + 0.09, pal.stone)
      box(x1 - p, y0, x1, y1, zt, zt + 0.09, pal.stone)
    }
  }

  function drawStairs(i: number, j: number, z0: number, axis: Axis) {
    const steps = 4
    for (let t = 0; t < steps; t++) {
      const zt = z0 + (STEP * (steps - t)) / steps
      const a0 = t / steps
      const a1 = (t + 1) / steps
      if (axis === 'i')
        box(i + a0, j + 0.14, i + a1, j + 0.86, z0, zt, pal.stone, pal.paving)
      else
        box(i + 0.14, j + a0, i + 0.86, j + a1, z0, zt, pal.stone, pal.paving)
    }
  }

  function drawDock(i: number, j: number, axis: Axis) {
    const wood = pal.trunk
    const post = (x: number, y: number) => box(x - 0.03, y - 0.03, x + 0.03, y + 0.03, WATER_TOP, 0.1, wood)
    if (axis === 'i') {
      post(i + 0.85, j + 0.3)
      box(i, j + 0.3, i + 1, j + 0.7, -0.04, 0.03, wood)
      post(i + 0.85, j + 0.7)
    }
    else {
      post(i + 0.3, j + 0.85)
      box(i + 0.3, j, i + 0.7, j + 1, -0.04, 0.03, wood)
      post(i + 0.7, j + 0.85)
    }
  }

  function drawFountain(i: number, j: number, z0: number) {
    box(i + 0.18, j + 0.18, i + 0.82, j + 0.82, z0, z0 + 0.13, pal.stone)
    box(i + 0.23, j + 0.23, i + 0.77, j + 0.77, z0 + 0.13, z0 + 0.13, pal.water, pal.water, false)
    box(i + 0.45, j + 0.45, i + 0.55, j + 0.55, z0 + 0.13, z0 + 0.36, pal.stone)
    box(i + 0.38, j + 0.38, i + 0.62, j + 0.62, z0 + 0.36, z0 + 0.4, pal.stone, pal.water)
  }

  function object(i: number, j: number, c: Cell, o: Obj) {
    const z0 = cellTop(c)
    switch (o.t) {
      case 'block': return drawBlock(i, j, z0, o)
      case 'tower': return drawTower(i, j, z0, o)
      case 'trees': return drawTrees(i, j, z0, o)
      case 'arch': return drawArch(i, j, z0, o)
      case 'stairs': return drawStairs(i, j, z0, o.axis)
      case 'dock': return drawDock(i, j, o.axis)
      case 'fountain': return drawFountain(i, j, z0)
      case 'wall': {
        box(i, j, i + 1, j + 1, z0, z0 + 0.48, pal.stone)
        receive(i, j, i, j, i + 1, j + 1, z0 + 0.48)
        merlons(i, j, i + 1, j + 1, z0 + 0.48, pal.stone)
      }
    }
  }

  // --- painter's order: back to front, by i + j -----------------------------
  for (let d = 0; d <= 2 * n - 2; d++) {
    for (let i = Math.max(0, d - n + 1); i <= Math.min(d, n - 1); i++) {
      const j = d - i
      const c = at(i, j)
      terrain(i, j, c)
      if (c.obj)
        object(i, j, c, c.obj)
    }
  }
}

export default {
  slug: 'isometric',
  title: 'Isometric',
  summary: 'Tiny invented districts in isometric projection: blocks, stairs, arches, towers, canals and trees, shaded in three tones with computed soft shadows.',
  order: 230,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x150a1e7c ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Layout pair, twelve pairs in the
  // order found, then the Sandstone town moved to the front as the cover.
  gallery: [
    '0x75ad9e5a5f1f734bb1a7a9a6c6ee710f6d04915d30be4adf2b311e4f985f853a',
    '0xfa6902d62024f29de0e4a06567e10b19864452b6e3095592d2242bd6e36cbb0e',
    '0x9863c2c7a4f8ee65dc240a71ff87496d636f1b5f43fece23da360273fbec5ada',
    '0x5b9d16a31f8161bd24cfa1950d8800cc5f44f829178466eaf8d07b92e0f612a8',
    '0x7559674cbb093a8a64f222e36b7e92ec60d5c612f2adfa3ee4e13a55ee49137a',
    '0x5a54e1ea02007a549aa56ead3a57b806193c09ba2e286fb2a0ce893c06d83e61',
    '0x1874b9678a975ca7e35d777b2630dc184243a925551b9f4481b183acb452046d',
    '0x5244b4556d801bb5eb856ccfaeac785610b5bf9ed5f8b3a104d787c5248b0883',
    '0x46c99f5a2dea52082cd81fe68fba723ae6bfed42777cf923327ab20e23cdcc3b',
    '0xd4215dd59631ee43f00c81439e49d31f5be15e9e283fcc994d405aa094875f66',
    '0x52a05d1d15d56e87dbda5b29799ef6e4252a2fb62f67c0196c14cd5c70a78dd3',
    '0xd67f5b2d3892f98e4db6859833c95707d96be894c9d27ec9af0254dd789e3d15',
  ],
} satisfies Series
