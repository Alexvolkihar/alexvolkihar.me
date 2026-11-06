// "Tessellate" — interlocking creatures from isohedral tilings.
//
// A polygon that tiles the plane under a known symmetry (translations, glide
// reflections, or turns of 180°, 120°, 90° or 60°) has its edges replaced by
// hash-generated curves, each one obeying its edge relation: a translated
// edge gets a translated copy, a half-turn edge is point-symmetric about its
// midpoint, a rotated edge is the turned image of its partner. The deformed
// tile still fills the plane exactly (see ../tessellate/tiling.ts). It is
// then coloured so that no two neighbours match, using a linear colouring of
// the symmetry group, and given an inner life: an eye and gill lines, echoed
// outlines, or stripes, the way Escher turned his tiles into creatures.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider or taller canvas shows more of the same
// periodic plane around the same centre.

import type { Rng } from '../random'
import type { Aff, Colouring, Field, Pt, Symmetry } from '../tessellate/tiling'
import type { Series } from '../types'
import { range, stream, weighted } from '../random'
import {
  apply,
  boundary,
  colourings,
  contour,
  distanceField,
  edgeCoefficients,
  isGoodTile,
  mul,
  neighbours,
  polygonArea,
  prototile,
  translate,
} from '../tessellate/tiling'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Symmetry: [['Translation', 20], ['Glide', 16], ['Half-turn', 18], ['Three-fold', 18], ['Four-fold', 14], ['Six-fold', 14]],
  Palette: [['Woodblock', 24], ['Delft', 18], ['Orchard', 18], ['Lagoon', 16], ['Ember', 12], ['Night', 12]],
  Detail: [['Creature', 35], ['Echo', 25], ['Stripes', 20], ['Plain', 20]],
  Line: [['Woodcut', 40], ['Hairline', 35], ['None', 25]],
  Scale: [['Large', 25], ['Medium', 50], ['Fine', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Symmetry: weighted(r, TRAITS.Symmetry),
    Palette: weighted(r, TRAITS.Palette),
    Detail: weighted(r, TRAITS.Detail),
    Line: weighted(r, TRAITS.Line),
    Scale: weighted(r, TRAITS.Scale),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original). fills[0] and fills[1] always contrast, so a two-colour
// piece reads like a day-and-night print.
// ---------------------------------------------------------------------------

interface Palette {
  ink: string
  fills: readonly [string, string, string, string]
  /** White of the eye. */
  eye: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Woodblock: { ink: '#1b1a17', fills: ['#ece2c9', '#2a2824', '#c4472d', '#d7a043'], eye: '#f6efdc' },
  Delft: { ink: '#13244a', fills: ['#f1eee4', '#2b5797', '#9cb8da', '#1b2f5a'], eye: '#fbfaf5' },
  Orchard: { ink: '#1f2a1b', fills: ['#e8dfbf', '#4b7337', '#7a3352', '#cf9a3a'], eye: '#f7f2de' },
  Lagoon: { ink: '#0f3236', fills: ['#f0e2c4', '#1d7473', '#e0785b', '#86bcb3'], eye: '#fbf5e6' },
  Ember: { ink: '#24110c', fills: ['#f0d6a4', '#5c1d15', '#c0412a', '#e5922e'], eye: '#fbf0d8' },
  Night: { ink: '#04050a', fills: ['#1a2140', '#d4b05c', '#46305f', '#2f6370'], eye: '#efe6cf' },
}

const SIZE: Record<Features['Scale'], number> = { Large: 0.3, Medium: 0.205, Fine: 0.14 }

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function rgb(c: RGB, k = 1): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const luma = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255

/** Integer hash of a tile identity, for per-tile tint independent of the canvas size. */
function tileNoise(seed: number, a: number, b: number, c: number): number {
  let h = seed ^ Math.imul(a + 3, 0x27D4EB2D) ^ Math.imul(b, 0x165667B1) ^ Math.imul(c + 7, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// The tile: deform the prototile, shrinking the deformation until the tile is
// a simple polygon with no thin neck.
// ---------------------------------------------------------------------------

interface Tile {
  pts: Pt[]
  area: number
  field: Field
  /** Deepest interior point, its depth, and the farthest boundary point from it. */
  pole: Pt
  depth: number
  tip: Pt
  radius: number
}

function makeTile(sym: Symmetry, lay: Rng, edges: Rng, ampPick: number): { tile: Tile, proto: ReturnType<typeof prototile> } {
  const proto = prototile(sym, lay)
  const base = Math.sqrt(Math.abs(polygonArea(proto.verts)))
  const neck = base * 0.07
  // Draw edge shapes until one gives a good tile at full strength. The
  // "edges" stream is the last one drawn from, so a variable number of
  // attempts shifts nothing else.
  const amp = 0.7 + 0.3 * ampPick
  const first = edgeCoefficients(edges)
  let pts = boundary(proto, first, amp, 40)
  for (let t = 0; t < 24 && !isGoodTile(pts, neck); t++)
    pts = boundary(proto, edgeCoefficients(edges), amp, 40)
  if (!isGoodTile(pts, neck)) {
    let a = amp
    for (let t = 0; t < 10 && !isGoodTile(pts, neck); t++) {
      a *= 0.8
      pts = boundary(proto, first, a, 40)
    }
    if (!isGoodTile(pts, base * 0.03))
      pts = boundary(proto, first, 0, 40)
  }
  // counter-clockwise, scaled to unit area
  const a = polygonArea(pts)
  const k = 1 / Math.sqrt(Math.abs(a))
  const unit: Pt[] = pts.map(([x, y]) => [x * k, y * k])
  const scaled = {
    ...proto,
    verts: proto.verts.map(([x, y]) => [x * k, y * k] as Pt),
    aspects: proto.aspects.map(m => [m[0], m[1], m[2], m[3], m[4] * k, m[5] * k] as Aff),
    u: [proto.u[0] * k, proto.u[1] * k] as Pt,
    v: [proto.v[0] * k, proto.v[1] * k] as Pt,
  }
  const field = distanceField(unit, 72)
  let best = -Infinity
  let pole: Pt = unit[0]
  for (let j = 0; j < field.ny; j++) {
    for (let i = 0; i < field.nx; i++) {
      const d = field.d[j * field.nx + i]
      if (d > best) {
        best = d
        pole = [field.x0 + i * field.step, field.y0 + j * field.step]
      }
    }
  }
  let tip = unit[0]
  let radius = 0
  for (const p of unit) {
    const d = Math.hypot(p[0] - pole[0], p[1] - pole[1])
    if (d > radius) {
      radius = d
      tip = p
    }
  }
  return { tile: { pts: unit, area: 1, field, pole, depth: best, tip, radius }, proto: scaled }
}

function fieldAt(f: Field, x: number, y: number): number {
  const i = Math.round((x - f.x0) / f.step)
  const j = Math.round((y - f.y0) / f.step)
  if (i < 0 || j < 0 || i >= f.nx || j >= f.ny)
    return -1
  return f.d[j * f.nx + i]
}

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]

  // Fixed stream order: layout (shape), colour, detail. Each stream always
  // makes the same number of draws for a given set of features.
  const lay = stream(hash, 'layout')
  const ampPick = lay()
  const turnPick = lay()
  const turnAngle = lay()
  const ox = lay()
  const oy = lay()
  const { tile, proto } = makeTile(f.Symmetry, lay, stream(hash, 'edges'), ampPick)

  const col = stream(hash, 'colour')
  const kRoll = col()
  const colPick = col()
  const permPick = col()
  const tintSeed = Math.floor(col() * 4294967296) | 0

  const det = stream(hash, 'detail')
  const echoLevels = 2 + Math.floor(det() * 3)
  const stripeTurn = range(det, -0.5, 0.5)
  const stripeGap = range(det, 0.9, 1.25)
  const eyeSize = range(det, 0.2, 0.28)
  const gillCount = 1 + Math.floor(det() * 3)

  // --- colouring ---------------------------------------------------------
  const nb = neighbours(proto)
  const order = kRoll < 0.5 ? [3, 2, 4] : kRoll < 0.75 ? [2, 3, 4] : [4, 3, 2]
  let cols: Colouring[] = []
  for (const k of order) {
    cols = colourings(proto, nb, k)
    if (cols.length)
      break
  }
  const colouring = cols[Math.floor(colPick * cols.length)]
  const K = colouring.k
  const perms: number[][] = K === 2 ? [[0, 1], [1, 0]] : K === 3 ? [[0, 1, 2], [1, 0, 2], [2, 1, 0], [0, 2, 1]] : [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [1, 2, 0, 3]]
  const perm = perms[Math.floor(permPick * perms.length)]
  const fills = perm.map(i => hex(pal.fills[i]))
  const ink = hex(pal.ink)
  // detail colour of each class: darker on light tiles, lighter on dark ones
  // Marks on very light tiles borrow the hue of the next class, mid tones
  // darken their own hue, dark tiles lighten it.
  const marks = fills.map((c, i) => {
    const l = luma(c)
    if (l > 0.72)
      return rgb(mix(c, fills[(i + 1) % K], 0.42), 0.94)
    return l > 0.3 ? rgb(mix(c, ink, 0.12), 0.8) : rgb(mix(c, hex(pal.eye), 0.32))
  })

  // --- placement ---------------------------------------------------------
  const S = Math.min(width, height)
  const scale = SIZE[f.Scale] * S // tile area = scale^2
  let rot = 0
  if (turnPick < 0.45)
    rot = (turnAngle - 0.5) * 0.5
  else if (turnPick < 0.6)
    rot = Math.PI / 2
  const cr = Math.cos(rot) * scale
  const sr = Math.sin(rot) * scale
  // phase of the lattice: the canvas centre falls anywhere in the cell
  const org = [ox * proto.u[0] + oy * proto.v[0], ox * proto.u[1] + oy * proto.v[1]]
  // world -> canvas
  const view: Aff = mul([cr, sr, -sr, cr, width / 2, height / 2], translate(-org[0], -org[1]))

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = rgb(ink)
  ctx.fillRect(0, 0, width, height)

  // lattice range covering the canvas
  const det2 = proto.u[0] * proto.v[1] - proto.u[1] * proto.v[0]
  const toLattice = (x: number, y: number): Pt => [(x * proto.v[1] - y * proto.v[0]) / det2, (proto.u[0] * y - proto.u[1] * x) / det2]
  let reach = 0
  for (const A of proto.aspects) {
    const c = apply(A, tile.pole[0], tile.pole[1])
    reach = Math.max(reach, Math.hypot(c[0], c[1]))
  }
  const R = tile.radius
  const invS = 1 / scale
  const corners: Pt[] = [[0, 0], [width, 0], [0, height], [width, height]].map(([px, py]) => {
    const dx = (px - width / 2) * invS
    const dy = (py - height / 2) * invS
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    return toLattice(c * dx + s * dy + org[0], -s * dx + c * dy + org[1])
  })
  const frob = Math.hypot(proto.v[1], proto.v[0], proto.u[1], proto.u[0]) / Math.abs(det2)
  const pad = Math.ceil((R + reach) * frob) + 1
  const i0 = Math.floor(Math.min(...corners.map(c => c[0]))) - pad
  const i1 = Math.ceil(Math.max(...corners.map(c => c[0]))) + pad
  const j0 = Math.floor(Math.min(...corners.map(c => c[1]))) - pad
  const j1 = Math.ceil(Math.max(...corners.map(c => c[1]))) + pad

  interface Placed { m: Aff, cls: number, a: number, i: number, j: number }
  const tiles: Placed[] = []
  const margin = R * scale
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const L = translate(i * proto.u[0] + j * proto.v[0], i * proto.u[1] + j * proto.v[1])
      for (let a = 0; a < proto.aspects.length; a++) {
        const m = mul(view, mul(L, proto.aspects[a]))
        const [cx, cy] = apply(m, tile.pole[0], tile.pole[1])
        if (cx < -margin || cy < -margin || cx > width + margin || cy > height + margin)
          continue
        const cls = ((((colouring.p[a] + colouring.q * i + colouring.r * j) % K) + K) % K)
        tiles.push({ m, cls, a, i, j })
      }
    }
  }

  // --- paths in tile coordinates ------------------------------------------
  const body = new Path2D()
  tile.pts.forEach(([x, y], n) => n ? body.lineTo(x, y) : body.moveTo(x, y))
  body.closePath()

  const depth = tile.depth
  const axis = Math.atan2(tile.tip[1] - tile.pole[1], tile.tip[0] - tile.pole[0])
  const ax = Math.cos(axis)
  const ay = Math.sin(axis)

  const segPath = (segs: number[], into = new Path2D()) => {
    for (let s = 0; s < segs.length; s += 4) {
      into.moveTo(segs[s], segs[s + 1])
      into.lineTo(segs[s + 2], segs[s + 3])
    }
    return into
  }

  let detailPath: Path2D | null = null
  let detailWidth = 0
  let eyeWhite: Path2D | null = null
  let pupil: Path2D | null = null
  let clipStripes = false
  if (f.Detail === 'Echo') {
    detailPath = new Path2D()
    const gap = depth / (echoLevels + 0.6)
    for (let l = 1; l <= echoLevels; l++)
      segPath(contour(tile.field, gap * l), detailPath)
    detailWidth = 0.022
  }
  else if (f.Detail === 'Stripes') {
    detailPath = new Path2D()
    const ang = axis + Math.PI / 2 + stripeTurn
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const gap = depth * stripeGap
    const n = Math.ceil(tile.radius * 2 / gap) + 2
    for (let s = -n; s <= n; s++) {
      // lines across the body, perpendicular-ish to its long axis
      const cx = tile.pole[0] + Math.cos(ang - Math.PI / 2) * s * gap
      const cy = tile.pole[1] + Math.sin(ang - Math.PI / 2) * s * gap
      detailPath.moveTo(cx - dx * tile.radius * 2, cy - dy * tile.radius * 2)
      detailPath.lineTo(cx + dx * tile.radius * 2, cy + dy * tile.radius * 2)
    }
    detailWidth = gap * 0.36
    clipStripes = true
  }
  else if (f.Detail === 'Creature') {
    // The eye sits as far towards the tip as the body allows.
    const er = depth * eyeSize
    const fld = tile.field
    let eye: Pt = tile.pole
    let bestD = Infinity
    for (let j = 0; j < fld.ny; j++) {
      for (let i = 0; i < fld.nx; i++) {
        if (fld.d[j * fld.nx + i] < er * 1.9)
          continue
        const x = fld.x0 + i * fld.step
        const y = fld.y0 + j * fld.step
        const d = Math.hypot(x - tile.tip[0], y - tile.tip[1])
        if (d < bestD) {
          bestD = d
          eye = [x, y]
        }
      }
    }
    eyeWhite = new Path2D()
    eyeWhite.arc(eye[0], eye[1], er, 0, Math.PI * 2)
    pupil = new Path2D()
    pupil.arc(eye[0] + ax * er * 0.32, eye[1] + ay * er * 0.32, er * 0.48, 0, Math.PI * 2)
    // gill lines behind the eye, kept inside the body
    detailPath = new Path2D()
    const back = Math.atan2(eye[1] - tile.tip[1], eye[0] - tile.tip[0])
    for (let g = 0; g < gillCount; g++) {
      const rad = er * (2.3 + g * 0.75)
      const pts: Pt[] = []
      for (let s = 0; s <= 16; s++) {
        const t = back + (s / 16 - 0.5) * 1.3
        pts.push([eye[0] + Math.cos(t) * rad, eye[1] + Math.sin(t) * rad])
      }
      if (pts.every(([x, y]) => fieldAt(fld, x, y) > er * 0.5)) {
        pts.forEach(([x, y], n) => n ? detailPath!.lineTo(x, y) : detailPath!.moveTo(x, y))
      }
    }
    // and one inner contour following the body
    segPath(contour(tile.field, depth * 0.16), detailPath)
    detailWidth = 0.02
  }
  else if (f.Line === 'None') {
    // Plain colour with no outline would read as camouflage: a single keyline
    // just inside the edge keeps every creature distinct.
    detailPath = segPath(contour(tile.field, depth * 0.09))
    detailWidth = 0.014
  }

  const lineW = f.Line === 'Woodcut' ? 0.026 : f.Line === 'Hairline' ? 0.008 : 0
  const seamW = 1.2 / scale

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const t of tiles) {
    ctx.setTransform(t.m[0], t.m[1], t.m[2], t.m[3], t.m[4], t.m[5])
    const tint = 0.96 + 0.07 * tileNoise(tintSeed, t.a, t.i, t.j)
    const fill = rgb(fills[t.cls], tint)
    ctx.fillStyle = fill
    ctx.fill(body)
    if (!lineW) {
      // close the anti-aliasing seams between tiles
      ctx.strokeStyle = fill
      ctx.lineWidth = seamW
      ctx.stroke(body)
    }
  }
  for (const t of tiles) {
    if (!detailPath && !eyeWhite)
      break
    ctx.setTransform(t.m[0], t.m[1], t.m[2], t.m[3], t.m[4], t.m[5])
    if (detailPath) {
      if (clipStripes) {
        ctx.save()
        ctx.clip(body)
      }
      ctx.strokeStyle = marks[t.cls]
      ctx.lineWidth = detailWidth
      ctx.stroke(detailPath)
      if (clipStripes)
        ctx.restore()
    }
    if (eyeWhite && pupil) {
      ctx.fillStyle = pal.eye
      ctx.fill(eyeWhite)
      ctx.strokeStyle = rgb(ink)
      ctx.lineWidth = 0.014
      ctx.stroke(eyeWhite)
      ctx.fillStyle = rgb(ink)
      ctx.fill(pupil)
    }
  }
  if (lineW) {
    ctx.strokeStyle = rgb(ink)
    ctx.lineWidth = lineW
    for (const t of tiles) {
      ctx.setTransform(t.m[0], t.m[1], t.m[2], t.m[3], t.m[4], t.m[5])
      ctx.stroke(body)
    }
  }
  ctx.restore()
}

export default {
  slug: 'tessellate',
  title: 'Tessellate',
  summary: 'Interlocking creatures cut from isohedral tilings: hash-drawn edges bent under translations, glides and turns, coloured so no neighbours match.',
  order: 390,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x7e55e11a7e ("gallery" stream, 64-hex candidates): the
  // first hash found for each Symmetry x Palette pair, twelve pairs in the
  // order found, except that the sixth (four-fold creatures in Woodblock) is
  // moved to the front as the cover.
  gallery: [
    '0x5ec75b0a54580e515f154acc23eaa363a8f5e520515a2bd8f65c8a548c0e741e',
    '0xc32d92ba292038011cdf30d745408e70d9895e0940046e3fad2accc92ca34f66',
    '0x06f7aca8b24d456d995ae38cec1ed93280cf38342424e70aa0f90d7a985219c4',
    '0x7a9c1ec71888a153aea799baf2288da5045e7434729314dd12a0e4fe665f1a06',
    '0xf1852ad831f76b65d79523c20b75a96be82203e2544d099908e216cce9d696c5',
    '0x498d24f875c7cc7382261f6164fd3c80ea9a878e7c35823fabdc9349754578f9',
    '0xb2f78427a045930cc948bd987ae6278cd1597d2b742c197412a20e389b73d49b',
    '0xb6cb256debacc64435ecb5fa48a3e5f0009d8d540bb7a7138f964874cd05111a',
    '0xfe8fa4a457a2d7921f316f9d2ff99015d9785c715f33e26ec801f475e76135b0',
    '0x2b438fd4e1ddadd0f26d4d5e0e5d5219c6683f981b180521ce0371ec91b65845',
    '0x553ce55145cfa3f413c94cac3ada40d9da6f44469d9453676cf47c81422eba1d',
    '0x00c2cd349e6d29138485dcf022b31d596a908851ffe752022352d759304382e8',
  ],
} satisfies Series
