// "Penrose" — aperiodic tilings by Robinson-triangle deflation.
//
// A five-fold "sun" much larger than the canvas is deflated again and again
// (every half-tile replaced by two or three smaller ones, scaled by 1/φ)
// until the tiles reach the size the hash asks for: Penrose's thick and thin
// rhombs (P3) or his kites and darts (P2), see ../penrose/tiling.ts. The
// tiling never repeats, yet the same few neighbourhoods come back
// everywhere, and around the centre of the sun the whole pattern keeps an
// exact five-fold symmetry.
//
// Tiles are coloured by type, by orientation, by the supertile they came
// from a few deflations back, or by decagonal rings around the centre. Then
// they are outlined, set as tesserae in grout, folded along their seam, or
// decorated with the matching arcs that join up into Conway's "worms".
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. A wider or taller canvas shows more of the same
// tiling around the same centre.

import type { Half, TilingKind } from '../penrose/tiling'
import type { Series } from '../types'
import { buildTiling, mirrorB, pointId, pointKey } from '../penrose/tiling'
import { int, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Porcelain', 20], ['Terrazzo', 18], ['Lagoon', 18], ['Saffron', 14], ['Obsidian', 16], ['Aurora', 14]],
  Tiling: [['Rhombs', 55], ['Kites & Darts', 45]],
  Colouring: [['Tile type', 25], ['Orientation', 25], ['Supertile', 30], ['Decagonal', 20]],
  Ornament: [['Outline', 30], ['Arcs', 35], ['Inlay', 20], ['Folded', 15]],
  Centre: [['Fivefold', 60], ['Drift', 40]],
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
    Ornament: weighted(r, TRAITS.Ornament),
    Centre: weighted(r, TRAITS.Centre),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original).
// ---------------------------------------------------------------------------

interface Palette {
  /** Grout and the background behind everything. */
  ground: string
  /** Tile outlines. */
  ink: string
  /** Five tile tones, the first one dominant. */
  tones: readonly [string, string, string, string, string]
  /** The two families of matching arcs. */
  arcs: readonly [string, string]
}

const PAL: Record<Features['Palette'], Palette> = {
  Porcelain: { ground: '#f4f0e6', ink: '#1d2a4a', tones: ['#2c4c8f', '#7f9fd2', '#ece5d3', '#c6d4ea', '#b98a34'], arcs: ['#a8322a', '#f7f3ea'] },
  Terrazzo: { ground: '#efe4d2', ink: '#3a2a20', tones: ['#c1603c', '#e3a76c', '#8d9c6c', '#f3e0c4', '#5b6c58'], arcs: ['#2f3d45', '#fbf4e8'] },
  Lagoon: { ground: '#e9f0ed', ink: '#0e2d38', tones: ['#12667a', '#43a3a7', '#a9d6cf', '#f1e7c9', '#e27b5e'], arcs: ['#f8f1df', '#0e2d38'] },
  Saffron: { ground: '#f6ead0', ink: '#2a2350', tones: ['#e7a33c', '#d65a2c', '#f4d47e', '#3e3a7e', '#f8ecd6'], arcs: ['#2a2350', '#fff9ea'] },
  Obsidian: { ground: '#0c0d11', ink: '#d6bd86', tones: ['#23262f', '#3a3f4c', '#5a6070', '#8c7442', '#15161b'], arcs: ['#e2bf6c', '#9fb2c6'] },
  Aurora: { ground: '#0a0f1f', ink: '#93cdbf', tones: ['#17305a', '#2c6d8c', '#3f9c95', '#6b3470', '#0f1b38'], arcs: ['#7cefc2', '#ff8db0'] },
}

const DARK = new Set<Features['Palette']>(['Obsidian', 'Aurora'])

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function css(c: RGB, k = 1): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x * k)))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

/** Uniform in [0, 1) from an integer, for per-tile variation independent of the canvas size. */
function unit(seed: number, k: number): number {
  let h = Math.imul(seed ^ k, 0x9E3779B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Matching arcs. Each half-tile carries one arc around A and one around C,
// with radii (fractions of the edge V–B) chosen so that every arc meets the
// arc of the neighbouring tile on their shared edge: the arcs join into
// closed curves and endless worms. The family of each arc fixes its colour.
// Checked numerically on every shared edge of both tilings.
// ---------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2
const PSI = 1 / PHI

/** [radius around A, radius around C] by half type, and the arc family of each. */
const ARCS: Record<TilingKind, { r: readonly [readonly [number, number], readonly [number, number]], fam: readonly [readonly [number, number], readonly [number, number]] }> = {
  // thin: both obtuse corners; thick: a large arc at A, a small one at C
  P3: { r: [[1 - PSI, 0.2], [PSI, 0.2]], fam: [[0, 1], [0, 1]] },
  // kite: tip and 144° corner; dart: re-entrant corner and tip (Conway)
  P2: { r: [[PSI, PSI], [1 - PSI, 1 - PSI]], fam: [[0, 1], [1, 0]] },
}

interface Tile {
  t: number
  /** Polygon A, B1, C, B2. */
  xs: [number, number, number, number]
  ys: [number, number, number, number]
  halves: Half[]
  anc: number
}

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const kind: TilingKind = f.Tiling === 'Rhombs' ? 'P3' : 'P2'
  const dark = DARK.has(f.Palette)

  // Fixed stream order: layout, then colour. Each stream always makes the
  // same number of draws.
  const lay = stream(hash, 'layout')
  const scale = Math.exp(range(lay, Math.log(0.042), Math.log(0.11)))
  const rot = lay() * 2 * Math.PI
  const driftA = lay() * 2 * Math.PI
  const driftR = range(lay, 0.3, 0.85)
  const superDepth = int(lay, 2, 3)
  const ringW = range(lay, 2.2, 3.6)

  const col = stream(hash, 'colour')
  const order = [0, 1, 2, 3, 4]
  for (let i = 4; i > 0; i--) {
    const j = Math.floor(col() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  const light = col() * 2 * Math.PI
  const tileSeed = Math.floor(col() * 4294967296) | 0
  const flipArcs = col() < 0.5

  // arcs need room: the finest scales are kept for the plain ornaments
  const edge = Math.max(scale, f.Ornament === 'Arcs' ? 0.08 : 0) * (kind === 'P2' ? 1.25 : 1)
  const drift = f.Centre === 'Drift'
  const ox = drift ? -driftR * Math.cos(driftA) : 0
  const oy = drift ? -driftR * Math.sin(driftA) : 0

  const S = Math.min(width, height)
  const hw = width / (2 * S)
  const hh = height / (2 * S)
  const m = edge * 0.1
  const { halves } = buildTiling({
    kind,
    edge,
    reach: 3.6 + Math.hypot(ox, oy),
    rot,
    ox,
    oy,
    x0: -hw - m,
    y0: -hh - m,
    x1: hw + m,
    y1: hh + m,
    superDepth,
  })

  // Pair the halves into whole tiles along their shared edge A–C. A tile cut
  // by the margin gets its missing half by reflection.
  const byKey = new Map<string, Tile>()
  for (const h of halves) {
    const ka = pointId(h.ax, h.ay)
    const kc = pointId(h.cx, h.cy)
    const key = ka < kc ? `${ka}|${kc}` : `${kc}|${ka}`
    const t = byKey.get(key)
    if (t) {
      t.xs[3] = h.bx
      t.ys[3] = h.by
      t.halves.push(h)
      t.anc = Math.min(t.anc, h.anc)
    }
    else {
      byKey.set(key, { t: h.t, xs: [h.ax, h.bx, h.cx, Number.NaN], ys: [h.ay, h.by, h.cy, Number.NaN], halves: [h], anc: h.anc })
    }
  }
  const tiles = [...byKey.values()]
  for (const t of tiles) {
    if (t.halves.length === 1) {
      const h = t.halves[0]
      const [mx, my] = mirrorB(h)
      t.xs[3] = mx
      t.ys[3] = my
      t.halves.push({ ...h, bx: mx, by: my })
    }
  }

  // --- colour of every tile ---------------------------------------------
  const tones = pal.tones.map(hex)
  const ground = hex(pal.ground)
  const minor = (c: RGB) => mix(c, ground, dark ? 0.18 : 0.32)
  const dirs = [0, 1, 2, 3, 4].map(k => [Math.cos(rot + k * Math.PI / 5), Math.sin(rot + k * Math.PI / 5)])

  const colourOf = (tl: Tile): RGB => {
    const h = tl.halves[0]
    const thick = tl.t === 1
    switch (f.Colouring) {
      case 'Tile type':
        return thick ? tones[0] : tones[kind === 'P3' ? 3 : 1]
      case 'Orientation': {
        const a = Math.atan2(h.cy - h.ay, h.cx - h.ax) - rot
        let o: number
        if (kind === 'P3') {
          const q = Math.round((((a % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 10)) % 10
          o = q >> 1
        }
        else {
          const q = Math.round((((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 5)) % 10
          o = q % 5
        }
        const c = tones[order[o]]
        return thick ? c : minor(c)
      }
      case 'Supertile': {
        const c = tones[order[Math.floor(unit(tileSeed, tl.anc) * 5)]]
        return thick ? c : minor(c)
      }
      default: {
        // decagonal rings: the distance in the norm whose unit ball is a
        // decagon aligned with the tiling, around the centre of the sun
        const cx = (tl.xs[0] + tl.xs[1] + tl.xs[2] + tl.xs[3]) / 4 - ox
        const cy = (tl.ys[0] + tl.ys[1] + tl.ys[2] + tl.ys[3]) / 4 - oy
        let d = 0
        for (const [ux, uy] of dirs)
          d = Math.max(d, Math.abs(cx * ux + cy * uy))
        const band = Math.floor(d / (edge * ringW))
        const c = tones[order[band % 5]]
        return thick ? c : minor(c)
      }
    }
  }

  ctx.save()
  ctx.setTransform(S, 0, 0, S, width / 2, height / 2)
  ctx.fillStyle = pal.ground
  ctx.fillRect(-hw - 1, -hh - 1, 2 * hw + 2, 2 * hh + 2)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Fill: one path per colour, so the whole tiling is a handful of fills.
  const fillGroups = (items: Iterable<[string, (c: CanvasRenderingContext2D) => void]>, seal: number) => {
    const groups = new Map<string, Array<(c: CanvasRenderingContext2D) => void>>()
    for (const [c, draw] of items) {
      const g = groups.get(c)
      if (g)
        g.push(draw)
      else
        groups.set(c, [draw])
    }
    for (const [c, draws] of groups) {
      ctx.beginPath()
      for (const d of draws)
        d(ctx)
      ctx.fillStyle = c
      ctx.fill()
      if (seal > 0) {
        // a hairline of the same colour closes the anti-aliasing seams
        ctx.strokeStyle = c
        ctx.lineWidth = seal
        ctx.stroke()
      }
    }
  }
  const poly = (xs: ArrayLike<number>, ys: ArrayLike<number>) => (c: CanvasRenderingContext2D) => {
    c.moveTo(xs[0], ys[0])
    for (let k = 1; k < xs.length; k++)
      c.lineTo(xs[k], ys[k])
    c.closePath()
  }

  // Unique edges of the tiling, each drawn once.
  const edgesPath = () => {
    const seen = new Set<string>()
    ctx.beginPath()
    for (const tl of tiles) {
      for (let k = 0; k < 4; k++) {
        const k1 = (k + 1) & 3
        const a = pointId(tl.xs[k], tl.ys[k])
        const b = pointId(tl.xs[k1], tl.ys[k1])
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        if (seen.has(key))
          continue
        seen.add(key)
        ctx.moveTo(tl.xs[k], tl.ys[k])
        ctx.lineTo(tl.xs[k1], tl.ys[k1])
      }
    }
  }

  const ink = hex(pal.ink)

  if (f.Ornament === 'Inlay') {
    // Tesserae: every tile shrunk inside its outline, with its own firing.
    const g = edge * 0.055
    fillGroups(tiles.map((tl) => {
      const c = colourOf(tl)
      const k = 0.94 + 0.12 * unit(tileSeed, pointKey(tl.xs[0] + tl.xs[2], tl.ys[0] + tl.ys[2]))
      const [ix, iy] = inset(tl.xs, tl.ys, g)
      return [css(c, k), poly(ix, iy)] as [string, (c: CanvasRenderingContext2D) => void]
    }), 0)
    ctx.restore()
    return
  }

  if (f.Ornament === 'Folded') {
    // Each half takes the light differently, as if the tile were creased
    // along its seam.
    fillGroups(tiles.flatMap((tl) => {
      const c = colourOf(tl)
      return tl.halves.map((h) => {
        const nx = h.bx - (h.ax + h.cx) / 2
        const ny = h.by - (h.ay + h.cy) / 2
        const k = 1 + (dark ? 0.22 : 0.12) * Math.cos(Math.atan2(ny, nx) - light)
        // quantised so that equal shades share a path
        const kq = Math.round(k * 40) / 40
        return [css(c, kq), poly([h.ax, h.bx, h.cx], [h.ay, h.by, h.cy])] as [string, (c: CanvasRenderingContext2D) => void]
      })
    }), edge * 0.008)
    edgesPath()
    ctx.strokeStyle = css(dark ? ink : mix(ink, ground, 0.35))
    ctx.globalAlpha = dark ? 0.7 : 0.8
    ctx.lineWidth = edge * 0.026
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.restore()
    return
  }

  fillGroups(tiles.map(tl => [css(colourOf(tl)), poly(tl.xs, tl.ys)] as [string, (c: CanvasRenderingContext2D) => void]), edge * 0.006)

  if (f.Ornament === 'Outline') {
    edgesPath()
    ctx.strokeStyle = pal.ink
    ctx.lineWidth = edge * 0.07
    ctx.stroke()
    ctx.restore()
    return
  }

  // Arcs: faint edges, then the two families of arcs over a thin casing.
  edgesPath()
  ctx.strokeStyle = pal.ink
  ctx.globalAlpha = 0.4
  ctx.lineWidth = edge * 0.02
  ctx.stroke()
  ctx.globalAlpha = 1

  const spec = ARCS[kind]
  const fams: [Path2DLike, Path2DLike] = [[], []]
  for (const tl of tiles) {
    for (const h of tl.halves) {
      const rA = spec.r[h.t][0] * Math.hypot(h.bx - h.ax, h.by - h.ay)
      const rC = spec.r[h.t][1] * Math.hypot(h.bx - h.cx, h.by - h.cy)
      fams[spec.fam[h.t][0]].push([h.ax, h.ay, rA, Math.atan2(h.by - h.ay, h.bx - h.ax), Math.atan2(h.cy - h.ay, h.cx - h.ax)])
      fams[spec.fam[h.t][1]].push([h.cx, h.cy, rC, Math.atan2(h.by - h.cy, h.bx - h.cx), Math.atan2(h.ay - h.cy, h.ax - h.cx)])
    }
  }
  const arcPath = (arcs: Path2DLike) => {
    ctx.beginPath()
    for (const [x, y, r, a0, a1] of arcs) {
      let d = a1 - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      ctx.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0))
      ctx.arc(x, y, r, a0, a0 + d, d < 0)
    }
  }
  const w = edge * 0.11
  const arcCols = flipArcs ? [pal.arcs[1], pal.arcs[0]] : [pal.arcs[0], pal.arcs[1]]
  for (const i of [1, 0]) {
    arcPath(fams[i])
    ctx.lineCap = 'butt'
    ctx.strokeStyle = pal.ink
    ctx.globalAlpha = dark ? 0.6 : 0.85
    ctx.lineWidth = w + edge * 0.04
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.strokeStyle = arcCols[i]
    ctx.lineWidth = w
    ctx.stroke()
  }
  ctx.restore()
}

/** Arcs as [centre x, centre y, radius, start angle, end angle]. */
type Path2DLike = Array<[number, number, number, number, number]>

/** The polygon moved inwards by g on every side (works for the dart's re-entrant corner too). */
function inset(xs: ArrayLike<number>, ys: ArrayLike<number>, g: number): [number[], number[]] {
  const n = xs.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += xs[i] * ys[j] - xs[j] * ys[i]
  }
  const s = area > 0 ? 1 : -1
  // offset lines: point + direction for every edge
  const lx: number[] = []
  const ly: number[] = []
  const dx: number[] = []
  const dy: number[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ex = xs[j] - xs[i]
    const ey = ys[j] - ys[i]
    const l = Math.hypot(ex, ey)
    // inward normal of a counter-clockwise polygon is (-ey, ex)
    lx.push(xs[i] - (s * ey / l) * g)
    ly.push(ys[i] + (s * ex / l) * g)
    dx.push(ex)
    dy.push(ey)
  }
  const ox: number[] = []
  const oy: number[] = []
  for (let i = 0; i < n; i++) {
    const p = (i + n - 1) % n
    // intersection of the offset lines of edges p and i
    const det = dx[p] * dy[i] - dy[p] * dx[i]
    const t = ((lx[i] - lx[p]) * dy[i] - (ly[i] - ly[p]) * dx[i]) / det
    ox.push(lx[p] + dx[p] * t)
    oy.push(ly[p] + dy[p] * t)
  }
  return [ox, oy]
}

export default {
  slug: 'penrose',
  title: 'Penrose',
  summary: 'Aperiodic Penrose tilings, rhombs or kites and darts, grown by deflation and coloured by type, orientation, supertile or decagonal ring.',
  order: 190,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x9e7205e5 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Ornament pair, twelve pairs in the
  // order found, except that the third (Lagoon arcs) is moved first as the
  // index cover.
  gallery: [
    '0x7652430d816dcc450ffc8162a9866a30f2014874dc4fc2ab74d720374ab7c016',
    '0xee57b8e6c477fa33d69524852f85115b4af07f3333aab9178a7dc6b0458125e1',
    '0x16535bb1b650cf754b5b5dcd57b7fb96b8fd733b16a99535d63567868caa446d',
    '0x8599c39ea6409315959743119afd5d3c1d681bb09091eca2c1a93a4ea5c0606e',
    '0x5cdccb74b0d8ec1c83670f7b71a88b3927c71152eb760d877e64711d9913fa9f',
    '0x2f6d999b04322553aa9f92f5a9e457fef3fdaa62428cead0ba973bde5c5fe985',
    '0x060c973a551b687215ca31488b76f1715f887dcc7d8f93b2b4660634c69e57a7',
    '0x11c760f684e833a88b88d95fe50e9be2ac704f05564427b31e84f6d269d45323',
    '0x1a79558720982a238d962ab34ccd8a0a07841d77a2baa6d1bd6e7a3c4237cba9',
    '0x8b19931545348f31583bdbc5650aa7c01462b373f8bcb06ea9329f5c746ca146',
    '0x87c9b2378225de58538006ac7ce7830f8b229b1e7e59edb9952bc9063d2f950c',
    '0x0e67740061e7099e2f7340c82573515b2c71c7efb1fec7638b173e4d2b56d220',
  ],
} satisfies Series
