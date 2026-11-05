// "Girih" — star patterns from polygons in contact.
//
// A periodic tiling by regular polygons (square, hexagonal, triangular, 4.8.8,
// 3.12.12, 4.6.12 or 3.6.3.6) is laid over the canvas. From the midpoint of
// every edge two rays leave at the same contact angle and stop where they
// meet the rays of the neighbouring edges (E. H. Hankin's method, see
// ../girih/hankin.ts). The tiling itself is then erased: what is left is a
// star in every tile and a rosette around every vertex. The pattern is drawn
// as interlaced strapwork (each strand passing alternately over and under),
// as glazed tiles set in grout the way zellige is cut and laid, or as a
// line drawing over the faint construction tiling.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider or taller canvas shows more of the same
// periodic pattern around the same centre.

import type { TilingName } from '../girih/hankin'
import type { Rng } from '../random'
import type { Series } from '../types'
import { buildMotif, TILINGS } from '../girih/hankin'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Zellige', 24], ['Lapis', 18], ['Terracotta', 18], ['Ivory & Gold', 14], ['Night', 14], ['Jade', 12]],
  Tiling: [['Square', 12], ['Hexagonal', 14], ['Triangular', 8], ['Octagon-square', 20], ['Dodecagon-triangle', 14], ['Dodecagon-hexagon', 18], ['Trihexagonal', 14]],
  Angle: [['Sharp', 30], ['Classic', 45], ['Open', 25]],
  Style: [['Strapwork', 40], ['Tiles', 35], ['Lines', 25]],
  Scale: [['Large', 25], ['Medium', 50], ['Fine', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Tiling: weighted(r, TRAITS.Tiling),
    Angle: weighted(r, TRAITS.Angle),
    Style: weighted(r, TRAITS.Style),
    Scale: weighted(r, TRAITS.Scale),
  }
}

// ---------------------------------------------------------------------------
// Palettes. Original colour sets, after glazed tile, lapis, fired clay and
// gilding rather than copied from any one building.
// ---------------------------------------------------------------------------

interface Palette {
  /** Ground, grout and the gaps of the interlace. */
  ground: string
  /** Outline of the straps and lines. */
  ink: string
  /** Body of the straps. */
  strap: string
  /** Region colours: three star classes, then the vertex rosettes. */
  fills: readonly [string, string, string, string]
  /** The medallion at the centre. */
  accent: string
}

const PAL: Record<Features['Palette'], Palette> = {
  'Zellige': { ground: '#efe7d6', ink: '#1c2624', strap: '#f3ecdd', fills: ['#1d6b62', '#24427e', '#c79b38', '#e9dfca'], accent: '#a8432a' },
  'Lapis': { ground: '#101b38', ink: '#060b1c', strap: '#dcc68c', fills: ['#21418c', '#2f5fb0', '#16295c', '#132048'], accent: '#e1bc5c' },
  'Terracotta': { ground: '#ead8bf', ink: '#47241a', strap: '#f4e6cf', fills: ['#b04f2e', '#d48a4f', '#7c3a22', '#e3c7a2'], accent: '#2e5e59' },
  'Ivory & Gold': { ground: '#f4eedf', ink: '#6a5122', strap: '#d6b05a', fills: ['#e6d3a3', '#c49a45', '#9c7431', '#faf5ea'], accent: '#8f2f2a' },
  'Night': { ground: '#0b0d16', ink: '#020308', strap: '#cfbb86', fills: ['#1b2442', '#27335c', '#141a33', '#0f1325'], accent: '#d9b968' },
  'Jade': { ground: '#e6ede3', ink: '#163128', strap: '#f1f4ec', fills: ['#2e6a54', '#5d9a7a', '#a8ccb2', '#d9e6d8'], accent: '#c2873a' },
}

const DARK = new Set<Features['Palette']>(['Lapis', 'Night'])

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function rgb(c: RGB, k: number): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

// ---------------------------------------------------------------------------
// Sizes. Edge length of the tiling (fraction of the short side) at Medium
// scale, chosen so every tiling shows a similar number of motifs.
// ---------------------------------------------------------------------------

const EDGE: Record<TilingName, number> = {
  'Square': 0.16,
  'Hexagonal': 0.105,
  'Triangular': 0.2,
  'Octagon-square': 0.088,
  'Dodecagon-triangle': 0.07,
  'Dodecagon-hexagon': 0.062,
  'Trihexagonal': 0.12,
}

const SCALE: Record<Features['Scale'], number> = { Large: 1.45, Medium: 1, Fine: 0.72 }

/**
 * Contact angle between a ray and its edge, in degrees, from the most open to
 * the sharpest that still reads well on this tiling: triangles close up their
 * stars sooner than octagons and dodecagons do.
 */
const THETA: Record<TilingName, readonly [number, number]> = {
  'Square': [48, 76],
  'Hexagonal': [36, 76],
  'Triangular': [28, 58],
  'Octagon-square': [36, 76],
  'Dodecagon-triangle': [36, 70],
  'Dodecagon-hexagon': [38, 76],
  'Trihexagonal': [30, 64],
}

/** Where the Angle trait falls in that range. */
const ANGLE: Record<Features['Angle'], readonly [number, number]> = {
  Open: [0, 0.3],
  Classic: [0.36, 0.64],
  Sharp: [0.7, 1],
}

const DEG = Math.PI / 180

/** Integer hash of a tile identity, for per-tile glaze variation independent of the canvas size. */
function tileNoise(seed: number, a: number, b: number, c: number): number {
  let h = seed ^ Math.imul(a, 0x27D4EB2D) ^ Math.imul(b, 0x165667B1) ^ Math.imul(c + 7, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function shuffle<T>(r: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = xs[i]
    xs[i] = xs[j]
    xs[j] = t
  }
  return xs
}

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const def = TILINGS[f.Tiling]

  // Fixed stream order: layout, then colour. Each stream always makes the
  // same number of draws.
  const lay = stream(hash, 'layout')
  const [alo, ahi] = ANGLE[f.Angle]
  const [tlo, thi] = THETA[f.Tiling]
  const theta = (tlo + (thi - tlo) * range(lay, alo, ahi)) * DEG
  const turned = lay() < 0.5
  const centrePick = lay()
  const widthPick = lay()

  const col = stream(hash, 'colour')
  const fills = shuffle(col, [0, 1, 2]).map(i => pal.fills[i])
  const medallionRoll = col()
  const glazeSeed = Math.floor(col() * 4294967296) | 0

  // Centre of the composition: the largest polygon (a medallion) most of the
  // time, otherwise another polygon or a vertex of the tiling.
  const options: [number, number][] = []
  const kinds = new Set<number>()
  for (const p of def.protos) {
    if (!kinds.has(p.kind)) {
      kinds.add(p.kind)
      options.push([p.x, p.y])
    }
  }
  const p0 = def.protos[0]
  const r0 = 1 / (2 * Math.sin(Math.PI / p0.n))
  options.push([p0.x + r0 * Math.cos(p0.phi * DEG), p0.y + r0 * Math.sin(p0.phi * DEG)])
  const ci = centrePick < 0.6 ? 0 : 1 + Math.min(options.length - 2, Math.floor(((centrePick - 0.6) / 0.4) * (options.length - 1)))
  const centre = options[ci]
  const medallion = ci === 0 && medallionRoll < 0.65

  const edge = EDGE[f.Tiling] * SCALE[f.Scale]
  const rot = turned ? Math.PI / def.sym : 0

  const S = Math.min(width, height)
  const hw = width / (2 * S)
  const hh = height / (2 * S)
  const motif = buildMotif(def, { edge, rot, centre }, theta, hw, hh)

  ctx.save()
  ctx.setTransform(S, 0, 0, S, width / 2, height / 2)
  ctx.fillStyle = pal.ground
  ctx.fillRect(-hw - 1, -hh - 1, 2 * hw + 2, 2 * hh + 2)

  const isCentre = (cx: number, cy: number) => medallion && Math.hypot(cx, cy) < edge * 0.05

  const starPath = (t: (typeof motif.tiles)[number]) => {
    ctx.beginPath()
    for (let k = 0; k < t.n; k++) {
      if (k === 0)
        ctx.moveTo(t.mx[0], t.my[0])
      else
        ctx.lineTo(t.mx[k], t.my[k])
      ctx.lineTo(t.px[k], t.py[k])
    }
    ctx.closePath()
  }
  const vertexPath = (v: (typeof motif.vertices)[number]) => {
    ctx.beginPath()
    ctx.moveTo(v.xs[0], v.ys[0])
    for (let k = 1; k < v.xs.length; k++)
      ctx.lineTo(v.xs[k], v.ys[k])
    ctx.closePath()
  }
  // All corner pieces (midpoint, inner point, next midpoint) as one path.
  const piecesPath = () => {
    ctx.beginPath()
    for (const t of motif.tiles) {
      for (let k = 0; k < t.n; k++) {
        const k1 = (k + 1) % t.n
        ctx.moveTo(t.mx[k], t.my[k])
        ctx.lineTo(t.px[k], t.py[k])
        ctx.lineTo(t.mx[k1], t.my[k1])
      }
    }
  }

  const accent = hex(pal.accent)

  if (f.Style === 'Tiles') {
    // Glazed pieces: every region its own slightly different firing.
    for (const t of motif.tiles) {
      const c = isCentre(t.cx, t.cy) ? accent : hex(fills[t.cls % 3])
      starPath(t)
      ctx.fillStyle = rgb(c, 0.93 + 0.12 * tileNoise(glazeSeed, t.i, t.j, t.t))
      ctx.fill()
    }
    const vc = hex(pal.fills[3])
    for (const v of motif.vertices) {
      vertexPath(v)
      const a = Math.round(v.x * 1e4)
      const b = Math.round(v.y * 1e4)
      ctx.fillStyle = rgb(vc, 0.94 + 0.1 * tileNoise(glazeSeed, a, b, 99))
      ctx.fill()
    }
    // grout
    piecesPath()
    ctx.lineJoin = 'miter'
    ctx.miterLimit = 6
    ctx.lineCap = 'round'
    const darkGround = DARK.has(f.Palette)
    ctx.strokeStyle = darkGround ? pal.strap : pal.ground
    ctx.lineWidth = edge * (darkGround ? 0.022 + 0.01 * widthPick : 0.045 + 0.02 * widthPick)
    ctx.stroke()
    ctx.restore()
    return
  }

  const dark = DARK.has(f.Palette)
  if (f.Style === 'Strapwork') {
    // The rosettes take a soft tone and the stars of the largest polygons
    // take colour; the smaller stars stay ground.
    ctx.fillStyle = pal.fills[3]
    for (const v of motif.vertices) {
      vertexPath(v)
      ctx.fill()
    }
    const big = def.protos[0].n
    for (const t of motif.tiles) {
      if (t.n !== big && !isCentre(t.cx, t.cy))
        continue
      starPath(t)
      ctx.fillStyle = isCentre(t.cx, t.cy) ? pal.accent : fills[t.cls % 3]
      ctx.fill()
    }
  }
  else {
    // Lines: the construction tiling, faint and dashed, under the pattern.
    // Every edge is drawn from its leftmost end, so the two tiles that share
    // it lay the same dashes on top of each other.
    ctx.beginPath()
    for (const t of motif.tiles) {
      for (let k = 0; k < t.n; k++) {
        const k1 = (k + 1) % t.n
        const dx = t.vx[k1] - t.vx[k]
        const forward = Math.abs(dx) > 1e-9 ? dx > 0 : t.vy[k1] > t.vy[k]
        const [a, b] = forward ? [k, k1] : [k1, k]
        ctx.moveTo(t.vx[a], t.vy[a])
        ctx.lineTo(t.vx[b], t.vy[b])
      }
    }
    ctx.strokeStyle = dark ? pal.strap : pal.ink
    ctx.globalAlpha = 0.16
    ctx.lineWidth = edge * 0.014
    ctx.setLineDash([edge * 0.05, edge * 0.05])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    if (medallion) {
      for (const t of motif.tiles) {
        if (isCentre(t.cx, t.cy)) {
          starPath(t)
          ctx.fillStyle = pal.accent
          ctx.globalAlpha = 0.85
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }
    }
  }

  // Straps: a band of width w with an outline o, interrupted by a gap g
  // wherever it passes under another strand. The band never takes more than
  // part of the narrowest region of the pattern (the middle of the smallest
  // star, or the corner of a rosette), so small triangles keep their stars.
  let narrow = Infinity
  for (const p of def.protos) {
    const half = Math.PI / 2 - Math.PI / p.n
    const vp = (0.5 * Math.sin(theta)) / Math.sin(theta + half)
    narrow = Math.min(narrow, 1 / (2 * Math.sin(Math.PI / p.n)) - vp, vp)
  }
  const lines = f.Style === 'Lines'
  const k = Math.max(0.6, Math.min(1, (0.42 * narrow) / (lines ? 0.11 : 0.15 + 0.04 * widthPick)))
  const w = edge * k * (lines ? 0.07 : 0.11 + 0.035 * widthPick)
  const o = edge * k * (lines ? 0.03 : 0.027)
  const g = edge * k * 0.035
  const outline = lines && dark ? pal.strap : pal.ink
  const body = lines ? pal.ground : pal.strap

  ctx.lineJoin = 'miter'
  ctx.miterLimit = 8
  ctx.lineCap = 'butt'
  piecesPath()
  ctx.strokeStyle = outline
  ctx.lineWidth = w + 2 * o
  ctx.stroke()
  // square caps: two pieces meeting end to end at a midpoint leave no seam
  ctx.lineCap = 'square'
  ctx.strokeStyle = body
  ctx.lineWidth = w
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Crossings. The under band is cut by a parallelogram (the over band
  // widened by the gap, intersected with the under band): first in ink, one
  // outline wider, so the cut end of the under band gets its cap, then in
  // ground. The over band is redrawn across it.
  const hb = w / 2 + o
  const cut = (h1: number, h2: number) => {
    ctx.beginPath()
    for (const c of motif.crossings) {
      // normals of the over and under directions
      const ax = -c.oy
      const ay = c.ox
      const bx = -c.uy
      const by = c.ux
      const det = ax * by - ay * bx
      for (const [s1, s2] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
        const p = s1 * h1
        const q = s2 * h2
        const x = c.x + (p * by - ay * q) / det
        const y = c.y + (ax * q - p * bx) / det
        if (s1 === 1 && s2 === 1)
          ctx.moveTo(x, y)
        else
          ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
    ctx.fill()
  }
  ctx.fillStyle = outline
  cut(hb + g + o, w / 2)
  ctx.fillStyle = pal.ground
  cut(hb + g, hb + 0.002 * edge)

  ctx.beginPath()
  for (const c of motif.crossings) {
    const sin = Math.abs(c.ox * c.uy - c.oy * c.ux)
    const cos = Math.abs(c.ox * c.ux + c.oy * c.uy)
    const L = Math.min((hb + (hb + g + o) * cos) / sin + edge * 0.01, c.lo - w)
    ctx.moveTo(c.x - c.ox * L, c.y - c.oy * L)
    ctx.lineTo(c.x + c.ox * L, c.y + c.oy * L)
  }
  ctx.strokeStyle = outline
  ctx.lineWidth = w + 2 * o
  ctx.stroke()
  // the body runs a little past the outline's ends, hiding their seam
  ctx.lineCap = 'square'
  ctx.strokeStyle = body
  ctx.lineWidth = w
  ctx.stroke()

  ctx.restore()
}

export default {
  slug: 'girih',
  title: 'Girih',
  summary: 'Star and rosette patterns grown from a tiling by Hankin\'s polygons-in-contact method, drawn as interlaced strapwork, glazed tiles or fine lines.',
  order: 140,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x61e161e1 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Tiling pair, twelve pairs in the
  // order found.
  gallery: [
    '0x788821fa0a31fcb2e5603cc46808eb6fc93de95f38ba56b8827baa17b1417191',
    '0x1cf7e7b894437d407166968de1b930b327a754498b9ea4ee4b4a10b041c8f3b5',
    '0x5a7bf455d4eff7dcdcddd71bb3fbbc4664390cbadfe63e181312db2630fb743f',
    '0x81b800efcb214356543ac06b7b761321b8209636795fbade6c78338d710362df',
    '0x33e7a86d6807abf5dba3fedb46e6edf83d839e8a7205f5b5418c1a03450182b0',
    '0x1d02e206693b1cccd42f830da9cf7f5e5c42ef5834d9ae90cbbfd95d6149c8d7',
    '0x60a9326e115f565d3e1b6691ee4bf0a91630b9bc8c90036af742d2b97a7a56ba',
    '0x3bc8c36e17f7a726c999f6a6b420a1a139442ea35a3369fe759abcb781f2f5e8',
    '0x964b1535a567a679baecc5e5767bb0d7204f1347dc7463f5d7528fcca651ce3b',
    '0xae014a1b7adde4cd42046ecfb890071a182af822b0de07c08969742989194e82',
    '0x8aa3e6cc89c570e8055cab9a705f1f064a6c2c238b38998073df5817b48e9cae',
    '0x5c8d7b572bbce95ef485075dbb631083384ca257d33e9e42204910850fec97fe',
  ],
} satisfies Series
