// "Kaleido" — one still frame of a kaleidoscope, printed flat.
//
// A handful of flat primitives (petals, drops, lunes, arcs, stripes, stepped
// blocks, dots, quarter circles) is scattered over one fundamental domain,
// with overlaps and cut-outs. The domain is then reflected in its own edges:
// two mirrors at pi / n give a dihedral rosette D_n; concentric rings each
// get their own order; a triangle or rectangle of mirrors tiles the whole
// sheet with one of the four planar kaleidoscopes (*442, *632, *333, *2222).
// Inks are flat with crisp edges; the print can carry a paper grain and a
// slight misregistration of the colour layers.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider or taller canvas shows more of the same
// pattern around the same centre: rosettes and rings grow outwards from
// streams of their own, wallpapers simply repeat further.

import type { Mat, Pt } from '../kaleido/geometry'
import type { MotifWeights, Region, Shape } from '../kaleido/shapes'
import type { Rng } from '../random'
import type { Series } from '../types'
import { grow, mul, reflectCopies, rosetteCopies, rotation, scaling, translation } from '../kaleido/geometry'
import { buildPath, extent, motif } from '../kaleido/shapes'
import { chance, int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Symmetry: [['Rosette', 26], ['Rings', 18], ['Square *442', 16], ['Hexagonal *632', 16], ['Triangle *333', 12], ['Rectangle *2222', 12]],
  Palette: [['Terracotta', 20], ['Rose & Teal', 18], ['Lagoon', 16], ['Cobalt', 16], ['Midnight', 16], ['Ember', 14]],
  Motif: [['Petal', 30], ['Arc', 25], ['Block', 20], ['Medley', 25]],
  Density: [['Sparse', 25], ['Balanced', 50], ['Busy', 25]],
  Print: [['Clean', 35], ['Paper grain', 40], ['Misregistered', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Symmetry: weighted(r, TRAITS.Symmetry),
    Palette: weighted(r, TRAITS.Palette),
    Motif: weighted(r, TRAITS.Motif),
    Density: weighted(r, TRAITS.Density),
    Print: weighted(r, TRAITS.Print),
  }
}

// ---------------------------------------------------------------------------
// Palettes: a paper or a dark ground and up to five inks. A piece prints
// with three to five of them.
// ---------------------------------------------------------------------------

interface Palette {
  ground: string
  inks: readonly string[]
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  'Terracotta': { ground: '#eee3cf', inks: ['#c4543b', '#2d2a28', '#faf6ee', '#e8a27c', '#6f9274'], dark: false },
  'Rose & Teal': { ground: '#f1e3dc', inks: ['#d4607d', '#16474b', '#fcf7ef', '#f0a85e', '#8c2f43'], dark: false },
  'Lagoon': { ground: '#e4ebe4', inks: ['#1d6c75', '#f0c04a', '#262d40', '#f8f4ea', '#df7a5c'], dark: false },
  'Cobalt': { ground: '#ece8de', inks: ['#22398c', '#93acdc', '#f8f5ee', '#e2552c', '#121722'], dark: false },
  'Midnight': { ground: '#1c1d28', inks: ['#f1cfa6', '#e0697a', '#57a8a1', '#f5f0e7', '#6e63c4'], dark: true },
  'Ember': { ground: '#231a1a', inks: ['#f2a256', '#c9474f', '#f5eadb', '#8db46c', '#7f9cc0'], dark: true },
}

const MOTIF: Record<Features['Motif'], MotifWeights> = {
  Petal: [['leaf', 5], ['drop', 3], ['lune', 2], ['dots', 2], ['disc', 2], ['quarter', 1]],
  Arc: [['arc', 5], ['lune', 3], ['quarter', 3], ['disc', 2], ['dots', 1], ['leaf', 1]],
  Block: [['steps', 4], ['stripes', 4], ['quarter', 3], ['bar', 3], ['disc', 1], ['dots', 1]],
  Medley: [['leaf', 2], ['drop', 1], ['lune', 2], ['dots', 1], ['disc', 1], ['quarter', 2], ['arc', 2], ['stripes', 2], ['steps', 2], ['bar', 1]],
}

/** Shapes per fundamental domain of a wallpaper. */
const COUNT: Record<Features['Density'], readonly [number, number]> = {
  Sparse: [5, 6],
  Balanced: [7, 9],
  Busy: [10, 14],
}

/** Order of a single rosette (number of mirrors). */
const ORDER: ReadonlyArray<readonly [number, number]> = [[3, 7], [4, 12], [5, 14], [6, 18], [7, 7], [8, 16], [9, 6], [10, 9], [12, 11]]

const TAU = Math.PI * 2
const SQ3 = Math.sqrt(3)

// ---------------------------------------------------------------------------
// Regions: where shapes may sit in each kind of fundamental domain.
// ---------------------------------------------------------------------------

/** A polygon of mirrors (all edges mirrors), with a constant shape size. */
function polygonRegion(poly: readonly Pt[], L: number): Region {
  const n = poly.length
  const tri = (r: Rng, a: Pt, b: Pt, c: Pt): Pt => {
    let u = r()
    let v = r()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    return [a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]), a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1])]
  }
  return {
    interior: (r) => {
      const k = n === 3 ? 0 : Math.floor(r() * (n - 2))
      return tri(r, poly[0], poly[k + 1], poly[k + 2])
    },
    edge: (r) => {
      const i = Math.floor(r() * n)
      const p = poly[i]
      const q = poly[(i + 1) % n]
      const t = r()
      return [[p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])], Math.atan2(q[1] - p[1], q[0] - p[0])]
    },
    vertex: r => poly[Math.floor(r() * n)],
    scale: () => L,
  }
}

/** A wedge of angle `al` between radii r0 and r1, mirrored on its two radial edges. */
function wedgeRegion(al: number, r0: number, r1: number, ring: boolean): Region {
  // radii spread by a golden-ratio sequence, so a few shapes never bunch up
  let k = 0
  const rad = (r: Rng) => {
    const u = (k++ * 0.618034 + r() * 0.3) % 1
    return r0 + (r1 - r0) * u ** (ring ? 1 : 0.8)
  }
  return {
    interior: (r) => {
      const rr = rad(r)
      const t = al * r()
      return [rr * Math.cos(t), rr * Math.sin(t)]
    },
    edge: (r) => {
      const t = r() < 0.5 ? 0 : al
      const rr = rad(r)
      return [[rr * Math.cos(t), rr * Math.sin(t)], t === 0 ? 0 : al + Math.PI]
    },
    vertex: (r) => {
      if (r0 === 0)
        return [0, 0]
      const rr = r() < 0.5 ? r0 : r1
      const t = r() < 0.5 ? 0 : al
      return [rr * Math.cos(t), rr * Math.sin(t)]
    },
    scale: (p) => {
      const rr = Math.hypot(p[0], p[1])
      if (ring)
        return Math.min((r1 - r0) * 1.15, Math.max(r0, rr) * al * 1.6)
      return Math.min(0.6, 0.26 + rr * al * 1.6)
    },
  }
}

// ---------------------------------------------------------------------------
// Rendering helpers.
// ---------------------------------------------------------------------------

interface Layer {
  /** Clip of one copy of the domain, in domain units. */
  clip: Path2D
  /** Domain units -> canvas pixels, one matrix per mirrored copy. */
  copies: Mat[]
  shapes: Shape[]
  paths: Path2D[]
  /** Radius around each shape's anchor that holds the whole shape. */
  reach: number[]
  /** Shapes wholly inside the domain: drawn without a clip. */
  free: boolean[]
  /** Colour of a cut-out: the ground under this layer. */
  cut: string
}

/** Relative luminance of a #rrggbb colour, 0..1. */
function luma(c: string): number {
  const v = Number.parseInt(c.slice(1), 16)
  const lin = (x: number) => {
    const u = x / 255
    return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(v >> 16) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255)
}

/** Where a shape of a given extent sits: 1 wholly inside the domain, -1 wholly outside, 0 across its border. */
type Fit = (s: Shape, ext: number) => number

/** Fit in a convex polygon with a positive signed area (interior on the left of each edge). */
function polygonFit(poly: readonly Pt[]): Fit {
  const planes = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const l = Math.hypot(q[0] - p[0], q[1] - p[1])
    return [-(q[1] - p[1]) / l, (q[0] - p[0]) / l, p[0], p[1]] as const
  })
  return (s, ext) => {
    let inside = 1
    for (const [nx, ny, px, py] of planes) {
      const d = nx * (s.x - px) + ny * (s.y - py)
      if (d <= -ext)
        return -1
      if (d < ext)
        inside = 0
    }
    return inside
  }
}

/** Fit in a wedge of angle al between radii r0 and R. */
function wedgeFit(al: number, r0: number, R: number): Fit {
  const sa = Math.sin(al)
  const ca = Math.cos(al)
  return (s, ext) => {
    const d1 = s.y
    const d2 = s.x * sa - s.y * ca
    const rr = Math.hypot(s.x, s.y)
    if (d1 <= -ext || d2 <= -ext || rr + ext <= r0 || rr - ext >= R)
      return -1
    return d1 >= ext && d2 >= ext && rr - ext >= r0 && rr + ext <= R ? 1 : 0
  }
}

function polyPath(poly: readonly Pt[]): Path2D {
  const P = new Path2D()
  P.moveTo(poly[0][0], poly[0][1])
  for (let i = 1; i < poly.length; i++)
    P.lineTo(poly[i][0], poly[i][1])
  P.closePath()
  return P
}

function setMat(g: CanvasRenderingContext2D, M: Mat): void {
  g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5])
}

/**
 * Draws a layer: every shape in every copy, clipped to its domain. Shapes are
 * printed one at a time across all copies, as a screen print lays one colour
 * at a time: neighbouring copies overlap by a fraction of a pixel on their
 * mirror, and drawing copy by copy would let a lower shape of the next copy
 * bleed over an upper shape of the previous one along that line.
 */
function drawLayer(g: CanvasRenderingContext2D, W: number, H: number, L: Layer, inks: readonly string[], offsets: readonly Pt[] | null): void {
  for (let i = 0; i < L.shapes.length; i++) {
    const s = L.shapes[i]
    g.fillStyle = s.ink < 0 ? L.cut : inks[s.ink]
    // misregistered: each ink is shifted on the sheet, its clip included
    const o = offsets && s.ink >= 0 ? offsets[s.ink] : null
    for (const M of L.copies) {
      // skip copies that land off the canvas (M includes the scale)
      const x = M[0] * s.x + M[2] * s.y + M[4]
      const y = M[1] * s.x + M[3] * s.y + M[5]
      const rr = L.reach[i] * Math.hypot(M[0], M[1]) + 8
      if (x + rr < 0 || y + rr < 0 || x - rr > W || y - rr > H)
        continue
      if (L.free[i]) {
        setMat(g, o ? mul(translation(o[0], o[1]), M) : M)
        g.fill(L.paths[i])
        continue
      }
      g.save()
      setMat(g, o ? mul(translation(o[0], o[1]), M) : M)
      g.clip(L.clip)
      // twice: where a shape crosses a mirror, the two clipped halves each
      // cover the edge pixels only in part; a second pass closes the seam
      g.fill(L.paths[i])
      g.fill(L.paths[i])
      g.restore()
    }
  }
}

/** A tile of speckles, scaled with the canvas so the grain looks the same at any size. */
function grain(g: CanvasRenderingContext2D, W: number, H: number, S: number, hash: string, dark: boolean): void {
  const r = stream(hash, 'grain')
  const N = 192
  const tile = document.createElement('canvas')
  tile.width = N
  tile.height = N
  const tg = tile.getContext('2d')!
  const img = tg.createImageData(N, N)
  for (let i = 0; i < N * N; i++) {
    const v = r()
    const light = r() < (dark ? 0.7 : 0.3)
    const c = light ? 255 : 30
    img.data[i * 4] = c
    img.data[i * 4 + 1] = c
    img.data[i * 4 + 2] = c
    img.data[i * 4 + 3] = Math.round(v ** 3 * (dark ? 46 : 58))
  }
  tg.putImageData(img, 0, 0)
  const pat = g.createPattern(tile, 'repeat')!
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  // fine speckle, then a coarse mottle from the same tile
  for (const [k, a] of [[S / 900, 1], [S / 150, 0.45]] as const) {
    pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]))
    g.globalAlpha = a
    g.fillStyle = pat
    g.fillRect(0, 0, W, H)
  }
  g.restore()
}

// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const cx = W / 2
  const cy = H / 2
  // half-diagonal of the canvas, in short sides
  const rmax = Math.hypot(W, H) / (2 * S)

  // Fixed stream order: ink, layout, motif (plus one stream per extra band
  // or ring, so a wider canvas never shifts what the square one shows).
  const ir = stream(hash, 'ink')
  const order = [0, 1, 2, 3, 4]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(ir() * (i + 1))
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  const nInks = weighted(ir, [[3, 40], [4, 40], [5, 20]] as const)
  const inks = order.slice(0, nInks).map(i => pal.inks[i])
  // the dominant ink must stand off the ground: a chalk white on cream is
  // fine for details, not for the anchors
  const lg = luma(pal.ground)
  const strong = inks.findIndex(c => Math.abs(luma(c) - lg) > 0.25)
  if (strong > 0) {
    const t = inks[0]
    inks[0] = inks[strong]
    inks[strong] = t
  }
  const inkWeights = [5, 3, 2.2, 1.6, 1.2].slice(0, nInks)
  const offsets: Pt[] = inks.map((_, i) => {
    const a = ir() * TAU
    const d = i === 0 ? 0 : range(ir, 0.002, 0.005) * S
    return [Math.cos(a) * d, Math.sin(a) * d]
  })
  const misreg = f.Print === 'Misregistered' ? offsets : null

  const lr = stream(hash, 'layout')
  const mr = stream(hash, 'motif')
  const weights = MOTIF[f.Motif]
  const [cLo, cHi] = COUNT[f.Density]
  const base = (M: Mat) => mul(translation(cx, cy), mul(M, scaling(S)))
  const layers: Layer[] = []
  const rings: { r: number, out: number, ground: string }[] = []
  let separator: string | null = null

  // Clips are grown by a third of a pixel (see grow) and kept as tight as
  // possible: the cost of a clip grows with its area on large canvases.
  const e = 0.3 / S
  const make = (clip: Path2D, fit: Fit, copies: Mat[], all: Shape[], cut: string): Layer => {
    // shapes wholly outside the domain never show; wholly inside need no clip
    const fits = all.map(s => fit(s, extent(s)))
    const shapes = all.filter((_, i) => fits[i] >= 0)
    return {
      clip,
      copies,
      shapes,
      paths: shapes.map(buildPath),
      reach: shapes.map(extent),
      free: fits.filter(f => f >= 0).map(f => f === 1),
      cut,
    }
  }
  /** The wedge of angle al out to radius R, its two mirrors pushed out by e. */
  const wedgeClip = (al: number, R: number) => {
    // far corners placed so the far edge stays R away from the apex
    const F = R / Math.cos(al / 2)
    return polyPath(grow([[0, 0], [F, 0], [F * Math.cos(al), F * Math.sin(al)]], e))
  }
  /** The annular wedge of a ring, its radial mirrors pushed out by e. */
  const ringClip = (al: number, r0: number, R: number) => {
    const P = new Path2D()
    const x0 = Math.sqrt(r0 * r0 - e * e)
    const x1 = Math.sqrt(R * R - e * e)
    const b0 = Math.atan2(-e, x0)
    const b1 = Math.atan2(-e, x1)
    P.moveTo(x0, -e)
    P.lineTo(x1, -e)
    P.arc(0, 0, R, b1, al - b1)
    P.arc(0, 0, r0, al - b0, b0, true)
    P.closePath()
    return P
  }

  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.fillStyle = pal.ground
  g.fillRect(0, 0, W, H)

  if (f.Symmetry === 'Rosette') {
    const n = weighted(lr, ORDER)
    const al = Math.PI / n
    const phase = -Math.PI / 2 + (chance(lr, 0.5) ? al : 0)
    const copies = rosetteCopies(n, phase).map(base)
    const count = Math.round(int(mr, cLo, cHi) * 2)
    const shapes = motif(mr, wedgeRegion(al, 0, 0.74, false), count, weights, inkWeights)
    // further bands, only on canvases that reach them
    for (let k = 0; 0.74 + 0.3 * k < rmax; k++) {
      const br = stream(hash, `band-${k}`)
      const r0 = 0.74 + 0.3 * k
      shapes.push(...motif(br, wedgeRegion(al, r0, r0 + 0.3, false), int(br, cLo, cHi), weights, inkWeights))
    }
    layers.push(make(wedgeClip(al, rmax + 0.01), wedgeFit(al, 0, rmax + 0.01), copies, shapes, pal.ground))
  }
  else if (f.Symmetry === 'Rings') {
    // radii out to well past any canvas corner, from one fixed sequence
    const radii = [range(lr, 0.12, 0.21)]
    while (radii[radii.length - 1] < 2.2)
      radii.push(radii[radii.length - 1] + range(lr, 0.075, 0.17))
    const n0 = int(lr, 3, 8)
    const snap = chance(lr, 0.6)
    if (chance(lr, 0.5))
      separator = inks[int(lr, 0, nInks - 1)]
    let prevGround = pal.ground
    for (let k = 0; k < radii.length && (k === 0 || radii[k - 1] < rmax); k++) {
      const rr = stream(hash, `ring-${k}`)
      const r0 = k === 0 ? 0 : radii[k - 1]
      const r1 = radii[k]
      let n = n0
      if (k > 0) {
        n = Math.round((Math.PI * (r0 + r1)) / 2 / ((r1 - r0) * range(rr, 0.8, 1.7)))
        if (snap)
          n = n0 * Math.max(1, Math.round(n / n0))
        n = Math.max(3, Math.min(40, n))
      }
      const al = Math.PI / n
      const phase = -Math.PI / 2 + (chance(rr, 0.5) ? al : 0)
      // a few rings are printed on an ink instead of the paper
      let ground = pal.ground
      if (k > 0 && chance(rr, 0.28)) {
        const c = inks[int(rr, 0, nInks - 1)]
        if (c !== prevGround)
          ground = c
      }
      prevGround = ground
      const lo = k === 0 ? cLo : Math.max(2, cLo - 2)
      const hi = k === 0 ? cHi : Math.max(3, cHi - 4)
      const shapes = motif(rr, wedgeRegion(al, r0, r1, k > 0), int(rr, lo, hi), weights, inkWeights)
        .map(s => (s.ink >= 0 && inks[s.ink] === ground ? { ...s, ink: (s.ink + 1) % nInks } : s))
      // how far out this ring's shapes reach: the grounds of the next rings
      // must cover it, and need not go further
      let reach = r1
      for (const s of shapes)
        reach = Math.max(reach, Math.hypot(s.x, s.y) + extent(s))
      rings.push({ r: r0, out: reach, ground })
      const R = Math.min(reach, rmax) + 0.01
      const clip = k === 0 ? wedgeClip(al, R) : ringClip(al, r0, R)
      layers.push(make(clip, wedgeFit(al, r0, R), rosetteCopies(n, phase).map(base), shapes, ground))
    }
  }
  else {
    let poly: Pt[]
    let turn = 0
    if (f.Symmetry === 'Square *442') {
      const a = range(lr, 0.4, 0.72) / 2
      poly = [[0, 0], [a, 0], [a, a]]
      turn = chance(lr, 0.3) ? Math.PI / 4 : 0
    }
    else if (f.Symmetry === 'Hexagonal *632') {
      const h = range(lr, 0.27, 0.42)
      poly = [[0, 0], [(h * SQ3) / 2, 0], [(h * SQ3) / 2, h / 2]]
      turn = chance(lr, 0.5) ? Math.PI / 2 : 0
    }
    else if (f.Symmetry === 'Triangle *333') {
      const s = range(lr, 0.3, 0.48)
      poly = [[0, 0], [s, 0], [s / 2, (s * SQ3) / 2]]
      turn = chance(lr, 0.5) ? Math.PI / 2 : 0
    }
    else {
      const a = range(lr, 0.36, 0.62) / 2
      const b = a * range(lr, 0.55, 1)
      poly = chance(lr, 0.5) ? [[0, 0], [a, 0], [a, b], [0, b]] : [[0, 0], [b, 0], [b, a], [0, a]]
    }
    let L = 0
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      L = Math.max(L, Math.hypot(q[0] - p[0], q[1] - p[1]))
    }
    // the domain's first corner, a centre of highest order, sits at the centre
    const M0 = base(rotation(turn))
    const copies = reflectCopies(poly, poly.map(() => true), M0, [-2, -2, W + 2, H + 2], S)
    const shapes = motif(mr, polygonRegion(poly, L * 1.1), int(mr, cLo, cHi), weights, inkWeights)
    layers.push(make(polyPath(grow(poly, e)), polygonFit(poly), copies, shapes, pal.ground))
  }

  let cover = 0
  for (let k = 0; k < layers.length; k++) {
    const ring = rings[k]
    if (ring)
      cover = Math.max(cover, ring.out, rings[k + 1]?.r ?? Infinity)
    if (ring && k > 0) {
      // The ring's own ground: an annulus from its inner circle out to its
      // outer one and to everything the rings inside it have spilled past
      // it (a full cover once that reaches the canvas corners).
      g.setTransform(1, 0, 0, 1, 0, 0)
      const o = misreg && ring.ground !== pal.ground ? misreg[inks.indexOf(ring.ground)] : [0, 0]
      const P = new Path2D()
      const ox = cx + o[0]
      const oy = cy + o[1]
      if (cover >= rmax) {
        P.rect(-1, -1, W + 2, H + 2)
      }
      else {
        P.moveTo(ox + cover * S + 2, oy)
        P.arc(ox, oy, cover * S + 2, 0, TAU)
      }
      P.moveTo(ox + ring.r * S, oy)
      P.arc(ox, oy, ring.r * S, 0, TAU, true)
      g.fillStyle = ring.ground
      g.fill(P)
    }
    drawLayer(g, W, H, layers[k], inks, misreg)
  }

  if (separator && rings.length > 1) {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.strokeStyle = separator
    g.lineWidth = 0.0045 * S
    for (const ring of rings.slice(1)) {
      g.beginPath()
      g.arc(cx, cy, ring.r * S, 0, TAU)
      g.stroke()
    }
  }

  if (f.Print !== 'Clean')
    grain(g, W, H, S, hash, pal.dark)
  g.restore()
}

export default {
  slug: 'kaleido',
  title: 'Kaleido',
  summary: 'A still frame of a kaleidoscope, printed flat: petals, arcs, stripes and stepped blocks reflected into rosettes, rings and the four mirror wallpapers.',
  order: 660,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x6ca1e1d0 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Symmetry x Palette pair, at most two per
  // symmetry, skipping one weak sparse piece; the cover (a Lagoon rosette)
  // is moved to the front, the others keep the order they were found in.
  gallery: [
    '0x3b9635620daf274d175c8a11ae6e9a1a1a35df1dbb4ee8954e9d557091096b79',
    '0xd6437c9e39ad49b55b115cc4c47cb5f2e8091af47913da31eecaa95e4bf43d68',
    '0x09e48eebec0f64594617f0044d64a5776964af2e17f74b8fd394e5d98aa55d97',
    '0x58b22f31db444c847ad5182e92ffebca08dd8003a7b7310513d471737a414f40',
    '0xd782979b4cf6076fa5275eb3b4e8a035f604c0343a16bd5f56d19c8767ac2666',
    '0x145357e112bf73efd915bd44126a71a3d9a1e69576ffa5423030694ae8ffb24d',
    '0x1c26a31745b835ccc5fd422a6ade73f9ac50ee7707f594ef69a66558313ff472',
    '0x733214e517b78b686f15ce021034e229c836fe88df3ba1a1d0584f0970175daa',
    '0x9650c935df3fd3ec3608823149a962a382d5b4e879d069e5243dfcac664cd855',
    '0x710e7ebca7dd9355edf28269b6cccc524db4e77acb33d551e488d82debdec7c7',
    '0x0da2177a9b0f9c70acd2247b664a16e2a781a2bb72ebe76c872eebc1076da72e',
    '0xfedee819b1c496333d2264274985e9bf6416e867c89c4c4a4ea4a7c035bbbe83',
  ],
} satisfies Series
