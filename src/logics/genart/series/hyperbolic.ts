// "Hyperbolic" — regular tilings {p,q} of the hyperbolic plane.
//
// A regular p-gon with q of them around every vertex only closes up flat when
// (p - 2)(q - 2) = 4; when the product is larger the tiling lives in the
// hyperbolic plane, which this series draws in Poincaré's disk, in the upper
// half-plane or in the band model. The central tile is built from Coxeter's
// fundamental triangle (see ../hyperbolic/disk.ts) and the plane is filled by
// reflecting it across its edges, which are circular arcs orthogonal to the
// boundary, until the tiles get smaller than a fraction of the canvas.
//
// The tiles are coloured by symmetric colourings: the 2p triangles of every
// tile alternate (the black and white triangle tiling of Coxeter's figures),
// rings of tiles alternate outwards from a centre, a pinwheel turns one
// wedge per ring, or the triangles counterchange from ring to ring. The
// ornaments (star, rings, petals, vertex roundels, lenses, interlaced bands)
// are built once in the central tile from hyperbolic circles, geodesics and
// hypercycles, all of which are circles in these models, and carried to every
// tile by the same Möbius map as the tile itself.
//
// Everything is a pure function of the hash; every length is a fraction of the
// canvas short side, or a hyperbolic length drawn at the local scale of the
// model.

import type { Mat, Pt, Regular } from '../hyperbolic/disk'
import type { Series } from '../types'
import { apply, geoAngle, geoAt, geoMid, geoPerp, grow, hdist, mat, mul, polar, radius, regular, rotation, toOrigin } from '../hyperbolic/disk'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Vellum', 22], ['Cobalt', 18], ['Obsidian', 16], ['Saffron', 16], ['Celadon', 14], ['Ember', 14]],
  Tiling: [['{7,3}', 18], ['{5,4}', 16], ['{4,5}', 14], ['{6,4}', 14], ['{8,3}', 14], ['{4,6}', 14], ['{3,7}', 10]],
  Colouring: [['Kaleidoscope', 32], ['Rings', 26], ['Pinwheel', 22], ['Counterchange', 20]],
  Style: [['Ornament', 34], ['Tiles', 28], ['Inlay', 22], ['Linework', 16]],
  Model: [['Disk', 34], ['Vertex', 18], ['Drift', 12], ['Half-plane', 22], ['Band', 14]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Tiling: weighted(r, TRAITS.Tiling),
    Colouring: weighted(r, TRAITS.Colouring),
    Style: weighted(r, TRAITS.Style),
    Model: weighted(r, TRAITS.Model),
  }
}

const PQ: Record<Features['Tiling'], readonly [number, number]> = {
  '{7,3}': [7, 3],
  '{5,4}': [5, 4],
  '{4,5}': [4, 5],
  '{6,4}': [6, 4],
  '{8,3}': [8, 3],
  '{4,6}': [4, 6],
  '{3,7}': [3, 7],
}

// ---------------------------------------------------------------------------
// Palettes (original). A and B are the two tile colours, C the third ring
// colour and the roundels, `light` the bands and lenses.
// ---------------------------------------------------------------------------

interface Palette {
  ground: string
  A: string
  B: string
  C: string
  ink: string
  accent: string
  light: string
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  Vellum: { ground: '#efe7d4', A: '#e2d1aa', B: '#2e3a4e', C: '#b0533a', ink: '#191c22', accent: '#c8983a', light: '#f7f0e1', dark: false },
  Cobalt: { ground: '#e8ebee', A: '#22428f', B: '#ebe5d3', C: '#7194cd', ink: '#0c1633', accent: '#d9a63e', light: '#f5f2e9', dark: false },
  Obsidian: { ground: '#0c0d11', A: '#1c2232', B: '#c6b68c', C: '#45547a', ink: '#050609', accent: '#e4c46c', light: '#ece2c6', dark: true },
  Saffron: { ground: '#f2e8d5', A: '#e1a03a', B: '#76261a', C: '#f0d69a', ink: '#2a150e', accent: '#2c6d68', light: '#fbf2de', dark: false },
  Celadon: { ground: '#e5ebe2', A: '#86ad98', B: '#f2f0e6', C: '#2d5b4e', ink: '#17302a', accent: '#b9684b', light: '#f7f5ed', dark: false },
  Ember: { ground: '#140c0a', A: '#5a2119', B: '#e3a159', C: '#a6432b', ink: '#090403', accent: '#f1d49c', light: '#f6e5c6', dark: true },
}

function mix(cols: readonly string[], ws?: readonly number[]): string {
  let r = 0
  let g = 0
  let b = 0
  let t = 0
  cols.forEach((c, i) => {
    const w = ws?.[i] ?? 1
    const v = Number.parseInt(c.slice(1), 16)
    r += (v >> 16) * w
    g += ((v >> 8) & 255) * w
    b += (v & 255) * w
    t += w
  })
  return `rgb(${Math.round(r / t)},${Math.round(g / t)},${Math.round(b / t)})`
}

function rgbOf(c: string): [number, number, number] {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function distance(a: string, b: string): number {
  const x = rgbOf(a)
  const y = rgbOf(b)
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

// ---------------------------------------------------------------------------
// Models. A view maps a point of the disk to the canvas, and gives the number
// of pixels per hyperbolic unit there (line widths follow it, so a line keeps
// the same hyperbolic width everywhere).
// ---------------------------------------------------------------------------

interface View {
  /** True when the map is a Möbius map (circles stay circles). */
  mob: boolean
  map: (x: number, y: number, out: Float64Array, o: number) => void
  scale: (x: number, y: number) => number
  /** Canvas window used to cull tiles. */
  x0: number
  y0: number
  x1: number
  y1: number
}

const tmp = new Float64Array(2)

function diskView(pre: Mat, cx: number, cy: number, rad: number, W: number, H: number, m: number): View {
  return {
    mob: true,
    map(x, y, out, o) {
      apply(pre, x, y, tmp, 0)
      out[o] = cx + rad * tmp[0]
      out[o + 1] = cy - rad * tmp[1]
    },
    scale(x, y) {
      apply(pre, x, y, tmp, 0)
      return (rad * (1 - tmp[0] * tmp[0] - tmp[1] * tmp[1])) / 2
    },
    x0: -m,
    y0: -m,
    x1: W + m,
    y1: H + m,
  }
}

/** Upper half-plane through the Cayley map w = i(1 + u) / (1 - u); the real axis is the line y = base. */
function halfPlaneView(pre: Mat, cx: number, base: number, s: number, W: number, m: number): View {
  const M = mul(mat(0, 1, 0, 1, -1, 0, 1, 0), pre)
  return {
    mob: true,
    map(x, y, out, o) {
      apply(M, x, y, tmp, 0)
      out[o] = cx + s * tmp[0]
      out[o + 1] = base - s * tmp[1]
    },
    scale(x, y) {
      apply(M, x, y, tmp, 0)
      return s * tmp[1]
    },
    x0: -m,
    y0: -m,
    x1: W + m,
    y1: base + m,
  }
}

/** Band model v = (4/π) atanh(u): the strip |Im v| < 1, laid along the long side of the canvas. */
function bandView(pre: Mat, W: number, H: number, s: number, m: number): View {
  const across = H > W
  const cx = W / 2
  const cy = H / 2
  const band = (x: number, y: number) => {
    apply(pre, x, y, tmp, 0)
    const u = tmp[0]
    const v = tmp[1]
    const re = Math.log(((1 + u) * (1 + u) + v * v) / ((1 - u) * (1 - u) + v * v)) / Math.PI
    const im = (2 / Math.PI) * (Math.atan2(v, 1 + u) - Math.atan2(-v, 1 - u))
    tmp[0] = re
    tmp[1] = im
  }
  return {
    mob: false,
    map(x, y, out, o) {
      band(x, y)
      if (across) {
        out[o] = cx + s * tmp[1]
        out[o + 1] = cy - s * tmp[0]
      }
      else {
        out[o] = cx + s * tmp[0]
        out[o + 1] = cy - s * tmp[1]
      }
    },
    scale(x, y) {
      band(x, y)
      return s * (2 / Math.PI) * Math.cos((Math.PI / 2) * tmp[1])
    },
    x0: -m,
    y0: -m,
    x1: W + m,
    y1: H + m,
  }
}

// ---------------------------------------------------------------------------
// Shapes of the central tile: paths of circular arcs, each arc given by its
// start, a point on it and its end. A Möbius map takes arcs to arcs, so a
// shape is carried to a tile by mapping its points only.
// ---------------------------------------------------------------------------

interface Shape {
  /** closed: P0 m0 P1 m1 ... P(n-1) m(n-1); open: P0 m0 P1 ... m(n-1) Pn */
  pts: Float64Array
  closed: boolean
  /** Mean of the points: where the local scale of a stroke is taken. */
  ax: number
  ay: number
}

function shape(points: readonly Pt[], closed: boolean): Shape {
  const pts = new Float64Array(points.length * 2)
  let ax = 0
  let ay = 0
  points.forEach((p, i) => {
    pts[2 * i] = p[0]
    pts[2 * i + 1] = p[1]
    ax += p[0] / points.length
    ay += p[1] / points.length
  })
  // an arc on its own is anchored at its middle point, which is intrinsic:
  // the two tiles sharing an edge then give it the same width
  if (!closed && points.length === 3)
    return { pts, closed, ax: points[1][0], ay: points[1][1] }
  return { pts, closed, ax, ay }
}

/** Closed geodesic polygon. */
function geoPolygon(vs: readonly Pt[]): Shape {
  const pts: Pt[] = []
  vs.forEach((v, i) => {
    pts.push(v, geoMid(v, vs[(i + 1) % vs.length]))
  })
  return shape(pts, true)
}

function rot(pt: Pt, t: number): Pt {
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [pt[0] * c - pt[1] * s, pt[0] * s + pt[1] * c]
}

/** The p copies of a shape built for k = 0, turned about the tile centre. */
function around(p: number, build: () => readonly Pt[], closed: boolean): Shape[] {
  const base = build()
  return Array.from({ length: p }, (_, k) => shape(base.map(pt => rot(pt, (2 * Math.PI * k) / p)), closed))
}

const B1 = new Float64Array(256)
const B2 = new Float64Array(256)
const tmp2 = new Float64Array(2)
const TAU = Math.PI * 2

function arc3(path: Path2D, ax: number, ay: number, mx: number, my: number, bx: number, by: number): void {
  const ex = bx - ax
  const ey = by - ay
  const cross = ex * (my - ay) - ey * (mx - ax)
  const chord = Math.hypot(ex, ey)
  // sagitta under a hundredth of a pixel: a straight line
  if (!(Math.abs(cross) > 0.01 * chord) || !Number.isFinite(cross)) {
    path.lineTo(bx, by)
    return
  }
  const a2 = ax * ax + ay * ay
  const m2 = mx * mx + my * my
  const b2 = bx * bx + by * by
  const d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my))
  const cx = (a2 * (my - by) + m2 * (by - ay) + b2 * (ay - my)) / d
  const cy = (a2 * (bx - mx) + m2 * (ax - bx) + b2 * (mx - ax)) / d
  const r = Math.hypot(ax - cx, ay - cy)
  if (r > 1e6) {
    path.quadraticCurveTo(2 * mx - (ax + bx) / 2, 2 * my - (ay + by) / 2, bx, by)
    return
  }
  const t0 = Math.atan2(ay - cy, ax - cx)
  const t1 = Math.atan2(by - cy, bx - cx)
  const tm = Math.atan2(my - cy, mx - cx)
  const span = (((t1 - t0) % TAU) + TAU) % TAU
  const toM = (((tm - t0) % TAU) + TAU) % TAU
  path.arc(cx, cy, r, t0, t1, toM > span)
}

/** Arc a-m-b of the disk, sampled and sent through a non-Möbius view. */
function sampled(path: Path2D, view: View, ax: number, ay: number, mx: number, my: number, bx: number, by: number, len: number): void {
  const n = Math.min(48, Math.max(2, Math.ceil(Math.sqrt(len / 2)) + 1))
  const d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my))
  const ex = bx - ax
  const ey = by - ay
  const straight = Math.abs(ex * (my - ay) - ey * (mx - ax)) < 1e-9 * (ex * ex + ey * ey) || Math.abs(d) < 1e-14
  let cx = 0
  let cy = 0
  let r = 0
  let t0 = 0
  let sweep = 0
  if (!straight) {
    const a2 = ax * ax + ay * ay
    const m2 = mx * mx + my * my
    const b2 = bx * bx + by * by
    cx = (a2 * (my - by) + m2 * (by - ay) + b2 * (ay - my)) / d
    cy = (a2 * (bx - mx) + m2 * (ax - bx) + b2 * (mx - ax)) / d
    r = Math.hypot(ax - cx, ay - cy)
    t0 = Math.atan2(ay - cy, ax - cx)
    const span = (((Math.atan2(by - cy, bx - cx) - t0) % TAU) + TAU) % TAU
    const toM = (((Math.atan2(my - cy, mx - cx) - t0) % TAU) + TAU) % TAU
    sweep = toM > span ? span - TAU : span
  }
  for (let i = 1; i <= n; i++) {
    const s = i / n
    if (straight)
      view.map(ax + ex * s, ay + ey * s, tmp2, 0)
    else
      view.map(cx + r * Math.cos(t0 + sweep * s), cy + r * Math.sin(t0 + sweep * s), tmp2, 0)
    path.lineTo(tmp2[0], tmp2[1])
  }
}

/**
 * Paths are kept in small chunks: Chrome fills one Path2D holding tens of
 * thousands of sub-paths far more slowly than many small ones.
 */
class Batch {
  private chunks: Path2D[] = []
  private n = 0
  next(): Path2D {
    if (this.n % 48 === 0)
      this.chunks.push(new Path2D())
    this.n++
    return this.chunks[this.chunks.length - 1]
  }

  fill(ctx: CanvasRenderingContext2D, colour: string): void {
    ctx.fillStyle = colour
    for (const c of this.chunks)
      ctx.fill(c)
  }

  stroke(ctx: CanvasRenderingContext2D): void {
    for (const c of this.chunks)
      ctx.stroke(c)
  }
}

/** Add the image of a shape under the tile map m to a batch. */
function trace(batch: Batch, view: View, m: Mat, sh: Shape): void {
  const path = batch.next()
  const src = sh.pts
  const n = src.length / 2
  for (let i = 0; i < n; i++)
    apply(m, src[2 * i], src[2 * i + 1], B1, 2 * i)
  for (let i = 0; i < n; i++)
    view.map(B1[2 * i], B1[2 * i + 1], B2, 2 * i)
  const segs = sh.closed ? n / 2 : (n - 1) / 2
  path.moveTo(B2[0], B2[1])
  for (let s = 0; s < segs; s++) {
    const i = 2 * s
    const j = 2 * s + 1
    const k = (2 * s + 2) % n
    if (view.mob) {
      arc3(path, B2[2 * i], B2[2 * i + 1], B2[2 * j], B2[2 * j + 1], B2[2 * k], B2[2 * k + 1])
    }
    else {
      const len = Math.hypot(B2[2 * j] - B2[2 * i], B2[2 * j + 1] - B2[2 * i + 1]) + Math.hypot(B2[2 * k] - B2[2 * j], B2[2 * k + 1] - B2[2 * j + 1])
      sampled(path, view, B1[2 * i], B1[2 * i + 1], B1[2 * j], B1[2 * j + 1], B1[2 * k], B1[2 * k + 1], len)
    }
  }
  if (sh.closed)
    path.closePath()
}

/** Strokes grouped by width (6% steps), so that few lineWidth changes draw thousands of arcs. */
class Strokes {
  private groups = new Map<number, Batch>()
  get(w: number): Batch {
    const k = Math.round(Math.log(Math.max(w, 1e-3)) / Math.log(1.06))
    let b = this.groups.get(k)
    if (!b) {
      b = new Batch()
      this.groups.set(k, b)
    }
    return b
  }

  stroke(ctx: CanvasRenderingContext2D, colour: string): void {
    ctx.strokeStyle = colour
    for (const [k, b] of this.groups) {
      ctx.lineWidth = 1.06 ** k
      b.stroke(ctx)
    }
  }
}

function divisors(n: number): number[] {
  const out: number[] = []
  for (let d = 1; d <= n; d++) {
    if (n % d === 0)
      out.push(d)
  }
  return out
}

// Sizes as fractions of the canvas short side.
const EXPAND = 0.0065 // tiles smaller than this are drawn but not grown further
const EDGE_MIN = 0.01 // no outlines below this
const MOTIF_MIN = 0.03 // no ornaments below this
const MAX_TILES = 40000

function render(ctx: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const [p, q] = PQ[f.Tiling]
  const g: Regular = regular(p, q)
  const S = Math.min(W, H)

  // Fixed stream order: layout, then motif. Each always makes the same draws.
  const lay = stream(hash, 'layout')
  const spin = lay() * TAU
  const driftDir = lay() * TAU
  const driftDist = range(lay, 0.6, 1.3)
  const shift = range(lay, -0.35, 0.35)
  const ringsN = lay() < 0.6 ? 2 : 3
  const armsPick = lay()
  const twist = lay() < 0.5 ? 1 : -1
  const swap = lay() < 0.5
  const alongAxis = lay() < 0.5
  const inset = range(lay, 0.05, 0.1)

  const mot = stream(hash, 'motif')
  const centreKind = weighted(mot, [['star', 45], ['ring', 25], ['petals', 30]] as const)
  const edgeKind = weighted(mot, [['band', 40], ['lens', 35], ['none', 25]] as const)
  const vertexKind = weighted(mot, [['rosette', 55], ['none', 45]] as const)
  const toVertex = mot() < 0.5
  const s1 = range(mot, 0.55, 0.85)
  const s2 = range(mot, 0.3, 0.55)
  const ringR = range(mot, 0.45, 0.8)
  const petalW = range(mot, 0.12, 0.2)
  const rosR = range(mot, 0.4, 0.75)
  const lensL = range(mot, 0.35, 0.65)
  const lensH = range(mot, 0.2, 0.4)
  const bandW = range(mot, 0.055, 0.09)

  let A = pal.A
  let B = pal.B
  if (swap && f.Colouring !== 'Rings') {
    A = pal.B
    B = pal.A
  }

  // ---- view ---------------------------------------------------------------
  const margin = 0.02 * S
  const isDisk = f.Model === 'Disk' || f.Model === 'Vertex' || f.Model === 'Drift'
  const rad = 0.47 * S
  const cx = W / 2
  const cy = H / 2
  let view: View
  let base = H
  let bandS = 0
  if (f.Model === 'Disk') {
    view = diskView(rotation(spin), cx, cy, rad, W, H, margin)
  }
  else if (f.Model === 'Vertex') {
    view = diskView(mul(rotation(spin), toOrigin(g.V[0])), cx, cy, rad, W, H, margin)
  }
  else if (f.Model === 'Drift') {
    const a = polar(radius(driftDist * g.R), driftDir)
    view = diskView(mul(rotation(spin), toOrigin(a)), cx, cy, rad, W, H, margin)
  }
  else if (f.Model === 'Half-plane') {
    // A vertex or an edge of the central tile points to infinity, and the
    // tile hangs whole from the top of the canvas, above the cascade of ever
    // smaller tiles that runs down to the boundary line. (Near the boundary
    // the size of a tile grows with its height, so some tile is always about
    // as tall as the canvas: this one is chosen to be whole and centred.)
    const vertexUp = spin < Math.PI
    base = H - 0.06 * S
    const s = (base - 0.035 * S) / Math.exp(vertexUp ? g.R : g.r)
    view = halfPlaneView(rotation(vertexUp ? 0 : -Math.PI / p), cx, base, s, W, margin)
  }
  else {
    // along a mirror of the tiling, or across one, shifted along the axis
    const t = Math.tanh((shift * g.R) / 2)
    const pre = mul(mat(1, 0, t, 0, t, 0, 1, 0), rotation(alongAxis ? 0 : Math.PI / p))
    bandS = 0.46 * S
    view = bandView(pre, W, H, bandS, margin)
  }

  // ---- tiles --------------------------------------------------------------
  const probePts = new Float64Array(4 * p)
  const probeScr = new Float64Array(4 * p)
  for (let k = 0; k < p; k++) {
    probePts[4 * k] = g.V[k][0]
    probePts[4 * k + 1] = g.V[k][1]
    probePts[4 * k + 2] = g.M[k][0]
    probePts[4 * k + 3] = g.M[k][1]
  }
  const sizes = new Map<Mat, number>()
  const probe = (m: Mat) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < 2 * p; i++) {
      apply(m, probePts[2 * i], probePts[2 * i + 1], probeScr, 2 * i)
      view.map(probeScr[2 * i], probeScr[2 * i + 1], probeScr, 2 * i)
      const x = probeScr[2 * i]
      const y = probeScr[2 * i + 1]
      if (x < x0)
        x0 = x
      if (x > x1)
        x1 = x
      if (y < y0)
        y0 = y
      if (y > y1)
        y1 = y
    }
    if (!(x1 >= view.x0 && x0 <= view.x1 && y1 >= view.y0 && y0 <= view.y1))
      return -1
    const size = Math.max(x1 - x0, y1 - y0)
    sizes.set(m, size)
    return size
  }

  // Seeds: the central tile, or the q tiles around V_0 when a vertex is the centre.
  const seeds: Mat[] = [Float64Array.of(1, 0, 0, 0, 0, 0, 1, 0)]
  if (f.Model === 'Vertex') {
    for (let k = 1; k < q; k++)
      seeds.push(mul(g.turnV, seeds[k - 1]))
  }
  const tiles = grow(g, seeds, probe, EXPAND * S, MAX_TILES)

  // ---- colourings ---------------------------------------------------------
  // Triangle j of a tile spans the angles [jπ/p, (j+1)π/p] about its centre.
  const pivotVertex = f.Model === 'Vertex'
  const n0 = pivotVertex ? q : p
  const toPivot = pivotVertex ? toOrigin(g.V[0]) : Float64Array.of(1, 0, 0, 0, 0, 0, 1, 0)
  const arms = divisors(n0)[Math.floor(armsPick * divisors(n0).length)]
  const armLen = n0 / arms
  // wedges turned per ring: wide arms turn faster, so that they still spiral
  const step = Math.max(1, Math.round(armLen / 3))
  const rm = radius(g.r)
  const triInner: number[] = []
  for (let j = 0; j < 2 * p; j++)
    triInner.push(...polar(rm * 0.5, ((j + 0.5) * Math.PI) / p))
  const wedgeBuf = new Float64Array(2)
  const triColour = (m: Mat, j: number, layer: number): number => {
    if (f.Colouring === 'Kaleidoscope')
      return j & 1
    if (f.Colouring === 'Counterchange')
      return (j + layer) & 1
    // Pinwheel: wedge about the pivot, turned by one wedge per ring
    apply(m, triInner[2 * j], triInner[2 * j + 1], wedgeBuf, 0)
    apply(toPivot, wedgeBuf[0], wedgeBuf[1], wedgeBuf, 0)
    const ang = Math.atan2(wedgeBuf[1], wedgeBuf[0])
    const w = Math.floor((ang + TAU) / (Math.PI / n0)) % (2 * n0)
    const t = ((((w + twist * step * layer) % (2 * n0)) + 2 * n0) % (2 * n0))
    return Math.floor(t / armLen) & 1
  }

  // ---- shapes of the central tile ----------------------------------------
  const style = f.Style
  const shrink = style === 'Inlay' ? inset * g.r : 0
  const rIn = g.r - shrink
  const RIn = Math.atanh(Math.min(0.999999, Math.tanh(rIn) / Math.cos(Math.PI / p)))
  const vIn: Pt[] = []
  const mIn: Pt[] = []
  for (let k = 0; k < p; k++) {
    vIn.push(polar(radius(RIn), (2 * Math.PI * k) / p))
    mIn.push(polar(radius(rIn), ((2 * k + 1) * Math.PI) / p))
  }
  const tileShape = geoPolygon(vIn)
  const O: Pt = [0, 0]
  // Triangle j runs from boundary point j to j + 1 (V_k, M_k, V_k+1, ...).
  // A run of same-coloured triangles is drawn as one fan, so no seam shows
  // between them.
  const rim2: Pt[] = []
  for (let k = 0; k < p; k++)
    rim2.push(vIn[k], mIn[k])
  const fans = new Map<number, Shape>()
  const fan = (start: number, len: number): Shape => {
    const key = start * 64 + len
    let sh = fans.get(key)
    if (!sh) {
      const pts: Pt[] = [O]
      const first = rim2[start % (2 * p)]
      pts.push([first[0] / 2, first[1] / 2])
      for (let i = 0; i < len; i++) {
        const a = rim2[(start + i) % (2 * p)]
        pts.push(a, geoMid(a, rim2[(start + i + 1) % (2 * p)]))
      }
      const last = rim2[(start + len) % (2 * p)]
      pts.push(last, [last[0] / 2, last[1] / 2])
      sh = shape(pts, true)
      fans.set(key, sh)
    }
    return sh
  }
  const cols = new Uint8Array(2 * p)
  // edges in halves, each stroked at the scale of its own middle
  const edges: Shape[] = []
  for (let k = 0; k < p; k++) {
    edges.push(shape([g.V[k], geoMid(g.V[k], g.M[k]), g.M[k]], false))
    edges.push(shape([g.M[k], geoMid(g.M[k], g.V[(k + 1) % p]), g.V[(k + 1) % p]], false))
  }
  const mirrors: Shape[] = []
  for (let k = 0; k < p; k++) {
    mirrors.push(shape([O, [g.V[k][0] / 2, g.V[k][1] / 2], g.V[k]], false))
    mirrors.push(shape([O, [g.M[k][0] / 2, g.M[k][1] / 2], g.M[k]], false))
  }

  // ---- background ---------------------------------------------------------
  const tileCols = f.Colouring === 'Rings' ? (ringsN === 3 ? [pal.A, pal.B, pal.C] : [pal.A, pal.B]) : [A, B]
  // grout of the inlay: ink, or pale gold lead on the dark palettes
  const groutCol = pal.dark ? pal.light : pal.ink
  // the wash of a line drawing: whichever colour stands out most from the paper
  const washCol = [pal.A, pal.B, pal.C].reduce((a, b) => (distance(b, pal.ground) > distance(a, pal.ground) ? b : a))
  let rim = mix(tileCols)
  if (style === 'Inlay')
    rim = mix([...tileCols, groutCol], [...tileCols.map(() => 1), 1.2])
  if (style === 'Linework')
    rim = mix([pal.ground, washCol], [7, 1])
  ctx.save()
  // arc() joins its start to the current point by a segment that may be a
  // rounding error long: with mitred joins that turns into a spike
  ctx.lineJoin = 'round'
  ctx.fillStyle = pal.ground
  ctx.fillRect(0, 0, W, H)
  const modelPath = new Path2D()
  if (isDisk) {
    modelPath.arc(cx, cy, rad, 0, TAU)
  }
  else if (f.Model === 'Half-plane') {
    modelPath.rect(0, 0, W, base)
  }
  else if (W >= H) {
    modelPath.rect(0, H / 2 - bandS, W, 2 * bandS)
  }
  else {
    modelPath.rect(W / 2 - bandS, 0, 2 * bandS, H)
  }
  ctx.fillStyle = rim
  ctx.fill(modelPath)
  ctx.save()
  ctx.clip(modelPath)

  // ---- fills --------------------------------------------------------------
  const fills = tileCols.map(() => new Batch())
  const second = new Batch()
  const grout = new Batch()
  const fullTile = geoPolygon(g.V)
  for (const t of tiles) {
    if (style === 'Inlay')
      trace(grout, view, t.m, fullTile)
    if (f.Colouring === 'Rings') {
      trace(fills[t.layer % tileCols.length], view, t.m, tileShape)
      continue
    }
    trace(fills[0], view, t.m, tileShape)
    let ones = 0
    for (let j = 0; j < 2 * p; j++) {
      cols[j] = triColour(t.m, j, t.layer)
      ones += cols[j]
    }
    if (ones === 2 * p) {
      trace(second, view, t.m, tileShape)
      continue
    }
    // start just after a triangle of the first colour, walk once around
    let j0 = 0
    while (cols[j0] === 1)
      j0++
    for (let i = 1; i <= 2 * p; i++) {
      const j = (j0 + i) % (2 * p)
      if (cols[j] === 1 && cols[(j + 2 * p - 1) % (2 * p)] === 0) {
        let len = 1
        while (cols[(j + len) % (2 * p)] === 1)
          len++
        trace(second, view, t.m, fan(j, len))
      }
    }
  }
  if (style === 'Inlay') {
    grout.fill(ctx, groutCol)
  }
  // line drawings only wash the second colour(s) over the paper
  const wash = style === 'Linework'
  if (wash)
    ctx.globalAlpha = 0.3
  if (f.Colouring === 'Rings') {
    fills.forEach((path, i) => {
      if (wash && i === 0)
        return
      path.fill(ctx, wash ? (i === 1 ? washCol : pal.accent) : tileCols[i])
    })
  }
  else {
    if (!wash) {
      fills[0].fill(ctx, A)
    }
    second.fill(ctx, wash ? washCol : B)
  }
  ctx.globalAlpha = 1

  // ---- lines --------------------------------------------------------------
  const unit = g.R
  const lineCol = style === 'Linework' && pal.dark ? pal.light : pal.ink
  const big = tiles.filter(t => (sizes.get(t.m) ?? 0) > EDGE_MIN * S)
  const mid = new Float64Array(2)
  // pixels per hyperbolic unit where a shape lands: a stroke keeps the same
  // hyperbolic width even across a tile that grows a lot (half-plane)
  const local = (m: Mat, sh: Shape) => {
    apply(m, sh.ax, sh.ay, mid, 0)
    return view.scale(mid[0], mid[1])
  }
  if (style === 'Linework') {
    const hair = new Strokes()
    for (const t of big) {
      for (const sh of mirrors)
        trace(hair.get(0.01 * unit * local(t.m, sh)), view, t.m, sh)
    }
    ctx.globalAlpha = 0.55
    hair.stroke(ctx, lineCol)
    ctx.globalAlpha = 1
  }
  if (style !== 'Inlay') {
    const ew = style === 'Tiles' ? 0.045 : style === 'Linework' ? 0.032 : 0.02
    const es = new Strokes()
    for (const t of big) {
      for (const sh of edges)
        trace(es.get(ew * unit * local(t.m, sh)), view, t.m, sh)
    }
    ctx.lineCap = 'round'
    es.stroke(ctx, lineCol)
  }
  else {
    // a hairline between the triangles of an inlaid tile
    const hs = new Strokes()
    if (f.Colouring !== 'Rings') {
      const spokes: Shape[] = []
      for (let k = 0; k < p; k++) {
        spokes.push(shape([O, [vIn[k][0] / 2, vIn[k][1] / 2], vIn[k]], false))
        spokes.push(shape([O, [mIn[k][0] / 2, mIn[k][1] / 2], mIn[k]], false))
      }
      for (const t of big) {
        for (const sh of spokes)
          trace(hs.get(0.012 * unit * local(t.m, sh)), view, t.m, sh)
      }
    }
    ctx.globalAlpha = 0.5
    hs.stroke(ctx, pal.ink)
    ctx.globalAlpha = 1
  }

  // ---- ornaments ----------------------------------------------------------
  if (style === 'Ornament') {
    const orn = tiles.filter(t => (sizes.get(t.m) ?? 0) > MOTIF_MIN * S)
    const delta = bandW * unit
    const Mb = geoMid(g.M[0], g.M[1])
    const dBand = hdist(O, Mb)
    // room left by the bands around the centre and around each vertex
    const roomC = edgeKind === 'band' ? 0.82 * (dBand - delta) : 0.82 * g.r
    const roomV = edgeKind === 'band' ? 0.82 * (hdist(g.V[0], geoMid(g.M[p - 1], g.M[0])) - delta) : 0.9 * g.a
    const ow = 0.016 * unit
    const outline = new Strokes()
    const roundel = f.Colouring === 'Rings' && ringsN === 3 ? pal.accent : pal.C

    // vertex roundels: hyperbolic circles about the vertices (each one is
    // drawn by all q tiles around it, so no seam can open between them)
    const circle = (c: Pt, toward: Pt, h: number): Pt[] => [0, 1, 2, 3].map(i => geoAt(c, toward, h, (i * Math.PI) / 2))
    if (vertexKind === 'rosette') {
      const h = rosR * roomV
      const discs = around(p, () => circle(g.V[0], O, h), true)
      const rings = around(p, () => circle(g.V[0], O, h * 0.62), true)
      const fill = new Batch()
      const inner = new Strokes()
      for (const t of orn) {
        for (let k = 0; k < p; k++) {
          trace(fill, view, t.m, discs[k])
          trace(inner.get(ow * local(t.m, rings[k])), view, t.m, rings[k])
        }
      }
      fill.fill(ctx, roundel)
      inner.stroke(ctx, pal.dark ? pal.light : pal.ink)
    }

    // lenses across the edges, drawn whole by both tiles
    if (edgeKind === 'lens') {
      const hl = lensL * g.a
      const hx = lensH * g.r
      const lenses = around(p, () => {
        const m0 = g.M[0]
        return [geoAt(m0, g.V[1], hl), geoAt(m0, O, hx), geoAt(m0, g.V[0], hl), geoAt(m0, O, hx, Math.PI)]
      }, true)
      const fill = new Batch()
      for (const t of orn) {
        for (let k = 0; k < p; k++) {
          trace(fill, view, t.m, lenses[k])
          trace(outline.get(ow * local(t.m, lenses[k])), view, t.m, lenses[k])
        }
      }
      fill.fill(ctx, pal.light)
    }

    // interlaced bands along the lines through the edge midpoints
    if (edgeKind === 'band') {
      const a0 = g.M[0]
      const b0 = g.M[1]
      const cross = geoAngle(a0, b0, g.M[p - 1])
      const reach = (delta * (1 + Math.abs(Math.cos(cross)))) / Math.sin(cross)
      const ell = Math.min(hdist(a0, b0) / 2, 1.35 * reach + 0.2 * delta)
      const strip = (a: Pt, b: Pt, len: number) => {
        const x = geoAt(a, b, len)
        const y = geoMid(a, x)
        const ap = geoPerp(a, b, delta)
        const am = geoPerp(a, b, -delta)
        // perpendiculars taken towards a, so that x may be b itself
        const xp = geoPerp(x, a, -delta)
        const xm = geoPerp(x, a, delta)
        const yp = geoPerp(y, a, -delta)
        const ym = geoPerp(y, a, delta)
        return {
          body: [ap, yp, xp, x, xm, ym, am, a] as Pt[],
          left: [ap, yp, xp] as Pt[],
          right: [xm, ym, am] as Pt[],
        }
      }
      const full = strip(a0, b0, hdist(a0, b0))
      const over = strip(a0, b0, ell)
      const parts = (st: ReturnType<typeof strip>) => ({
        body: around(p, () => st.body, true),
        left: around(p, () => st.left, false),
        right: around(p, () => st.right, false),
      })
      const F = parts(full)
      const V = parts(over)
      for (const P of [F, V]) {
        const body = new Batch()
        const sides = new Strokes()
        for (const t of orn) {
          for (let k = 0; k < p; k++) {
            trace(body, view, t.m, P.body[k])
            trace(sides.get(ow * 1.2 * local(t.m, P.left[k])), view, t.m, P.left[k])
            trace(sides.get(ow * 1.2 * local(t.m, P.right[k])), view, t.m, P.right[k])
          }
        }
        body.fill(ctx, pal.light)
        ctx.lineCap = 'butt'
        sides.stroke(ctx, pal.ink)
      }
    }

    // centre
    {
      const lim = roomC
      const fill = new Batch()
      let shapes: Shape[] = []
      let strokeOnly = false
      if (centreKind === 'star') {
        const dp = s1 * lim
        const dv = s2 * dp
        const pts: Pt[] = []
        const off = toVertex ? 0 : Math.PI / p
        for (let k = 0; k < p; k++) {
          pts.push(polar(radius(dp), off + (2 * Math.PI * k) / p))
          pts.push(polar(radius(dv), off + ((2 * k + 1) * Math.PI) / p))
        }
        shapes = [geoPolygon(pts)]
      }
      else if (centreKind === 'ring') {
        const h = ringR * lim
        const c = radius(h)
        const ci = radius(h * 0.5)
        shapes = [
          shape([[c, 0], [0, c], [-c, 0], [0, -c]], true),
          shape([[ci, 0], [0, ci], [-ci, 0], [0, -ci]], true),
        ]
        strokeOnly = true
      }
      else {
        const off = toVertex ? 0 : Math.PI / p
        shapes = around(p, () => {
          const d0 = 0.16 * lim
          const d1 = s1 * lim
          const a: Pt = polar(radius(d0), off)
          const b: Pt = polar(radius(d1), off)
          const m = polar(radius((d0 + d1) / 2), off)
          const w = petalW * lim
          return [a, geoPerp(m, b, w), b, geoPerp(m, b, -w)]
        }, true)
        const dot = radius(0.11 * lim)
        shapes.push(shape([[dot, 0], [0, dot], [-dot, 0], [0, -dot]], true))
      }
      const st = new Strokes()
      for (const t of orn) {
        // the centre of the tile: the rings are centred on it
        apply(t.m, 0, 0, mid, 0)
        const sc = view.scale(mid[0], mid[1])
        for (const sh of shapes) {
          if (strokeOnly) {
            trace(st.get(0.032 * unit * sc), view, t.m, sh)
          }
          else {
            trace(fill, view, t.m, sh)
            trace(outline.get(ow * local(t.m, sh)), view, t.m, sh)
          }
        }
      }
      fill.fill(ctx, pal.accent)
      st.stroke(ctx, pal.accent)
    }
    outline.stroke(ctx, pal.dark ? pal.ground : pal.ink)
  }
  ctx.restore()

  // ---- boundary -----------------------------------------------------------
  ctx.strokeStyle = pal.dark ? pal.light : pal.ink
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 0.003 * S
  if (isDisk) {
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, TAU)
    ctx.stroke()
  }
  else if (f.Model === 'Half-plane') {
    ctx.beginPath()
    ctx.moveTo(0, base)
    ctx.lineTo(W, base)
    ctx.stroke()
  }
  else {
    ctx.beginPath()
    if (W >= H) {
      ctx.moveTo(0, H / 2 - bandS)
      ctx.lineTo(W, H / 2 - bandS)
      ctx.moveTo(0, H / 2 + bandS)
      ctx.lineTo(W, H / 2 + bandS)
    }
    else {
      ctx.moveTo(W / 2 - bandS, 0)
      ctx.lineTo(W / 2 - bandS, H)
      ctx.moveTo(W / 2 + bandS, 0)
      ctx.lineTo(W / 2 + bandS, H)
    }
    ctx.stroke()
  }
  ctx.restore()
}

export default {
  slug: 'hyperbolic',
  title: 'Hyperbolic',
  summary: 'Regular tilings {p,q} of the hyperbolic plane, reflected out from Coxeter\'s triangle in the Poincaré disk, the half-plane or the band, in kaleidoscopic, ringed and pinwheel colourings.',
  order: 600,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7c0e7e2a ("gallery" stream, 64-hex candidates): the
  // first hash found for each Model x Style pair, twelve pairs in the order
  // found. 0x7c0e7e2a is the first seed from 0x7c0e7e12 upwards whose twelve
  // pairs show every model, style and colouring, no model more than three
  // times and at least three ornaments.
  gallery: [
    '0xd627a7e32b8a502f5a73a944805738e071b18b1197063a2e31c4750b44e3755c',
    '0x2e03e8b192b21c5cea10dbf8774f6ced7222a33fd4ae8512bafe44c20496fbff',
    '0x00c192e0351575be85044711e1b7a7162562333b9c448ac4ee952640029a27fa',
    '0xbed04378f3dd8d9c0416a0e1a37d127b6bd87ab5ef6a5667d94504aa661f33fb',
    '0x1344c8d2c94c0dc98aae92ef97bd3e5bf45473417c5468fbcdef1774a8e4eb98',
    '0x7e3d2aec42f2c40febf4315cad3bf3bf8b79b39287fec0db0f095e52ff3ed236',
    '0x9ab17e34fb8da8153b9bfe46c408c6780f54650f0294914ed77b2b7b82d79656',
    '0x7c3a6356dcad6381eb5cde61a08372e10ab939f5960663858a619c04678d56bb',
    '0xf308a0cff23a83dcae862f339925622cc8953aa93db781eb51e9f3e63295af34',
    '0xa9c4684e70e44ab484d232dab8b3af9f3d1a0fb54075248cc0304b728d104a4c',
    '0xd4485206bfceed25c911d9d4ccbd6ca1ab5aa2d6880c8853833f73ff553dda48',
    '0x22c966f8451f80d0aff18ff9830af7d98ea8c38ad3f3d95c42cccf1b412c15d7',
  ],
} satisfies Series
