// "Knots" — Celtic-style interlace from a grid of breaks, and torus knots.
//
// A plait of diagonal strands is laid on a square grid; breaks placed on the
// grid lines turn the strands back, so the plait becomes knotwork with
// borders, corner terminals and closed loops (see ../knots/grid.ts). Every
// strand passes alternately over and under. The forms are a single panel, a
// panel inside a knotwork border, a sampler of small panels, or a torus knot
// T(p, q) set in a medallion cut out of a panel (see ../knots/torus.ts).
// Strands are drawn as ribbons: outlined, shaded as tubes, split by a centre
// line, or carved in relief.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side: a wider or taller canvas holds more cells of the
// same size, so the panels always fill the whole canvas.

import type { Crossing, Strand } from '../knots/geometry'
import type { Pattern, Region } from '../knots/grid'
import type { Series } from '../types'
import { localPath, strandPath } from '../knots/geometry'
import { KnotGrid, placeBreaks } from '../knots/grid'
import { torusKnot } from '../knots/torus'
import { int, pick, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Vellum', 22], ['Slate', 18], ['Enamel', 16], ['Moss', 16], ['Rust', 14], ['Bone', 14]],
  Form: [['Panel', 34], ['Frame', 26], ['Sampler', 20], ['Torus', 20]],
  Pattern: [['Plait', 12], ['Mirrored', 40], ['Lattice', 23], ['Wild', 25]],
  Ribbon: [['Tube', 32], ['Split', 26], ['Flat', 24], ['Carved', 18]],
  Corners: [['Round', 55], ['Pointed', 45]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Form: weighted(r, TRAITS.Form),
    Pattern: weighted(r, TRAITS.Pattern),
    Ribbon: weighted(r, TRAITS.Ribbon),
    Corners: weighted(r, TRAITS.Corners),
  }
}

// ---------------------------------------------------------------------------
// Palettes: original colour sets, after vellum and oak-gall ink, slate,
// cloisonné enamel, moss and lichen, fired iron oxides and bone.
// ---------------------------------------------------------------------------

interface Palette {
  bg: string
  /** Panel ground, and the gaps where a strand passes under. */
  field: string
  /** Panel rules. */
  rim: string
  /** Ribbon outlines. */
  ink: string
  strands: readonly string[]
}

const PAL: Record<Features['Palette'], Palette> = {
  Vellum: { bg: '#efe4ca', field: '#e6d5b0', rim: '#5a3b22', ink: '#24170f', strands: ['#a3331f', '#2f5a47', '#c4952f', '#27396b'] },
  Slate: { bg: '#14171b', field: '#1d2127', rim: '#8a7a55', ink: '#050608', strands: ['#d9cfb6', '#b4874a', '#6d8b99', '#a2493a'] },
  Enamel: { bg: '#0b1833', field: '#112449', rim: '#d2a94c', ink: '#d2a94c', strands: ['#2b8a8f', '#c23b30', '#ece2c6', '#3c9a57'] },
  Moss: { bg: '#e2e6d6', field: '#d3dac0', rim: '#2f3d2b', ink: '#1c281f', strands: ['#4c7b45', '#a7b86a', '#c79b3f', '#6a4630'] },
  Rust: { bg: '#f1e3d1', field: '#e8d0b2', rim: '#6b2e1d', ink: '#33170f', strands: ['#b5522a', '#7b2c1e', '#dba35b', '#365869'] },
  Bone: { bg: '#f2eee4', field: '#e7e1d1', rim: '#1b1a18', ink: '#1b1a18', strands: ['#fbf8f1'] },
}

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function css(c: RGB): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x)))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const tint = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]

// ---------------------------------------------------------------------------
// Ribbons. Widths in grid units (one cell = 1); outline and gap scale with them.
// ---------------------------------------------------------------------------

const WIDTH: Record<Features['Ribbon'], number> = { Tube: 0.3, Split: 0.31, Flat: 0.28, Carved: 0.32 }
const OUTLINE = 0.15
const GAP = 0.13

interface Layer { c: string, w: number, dx: number, dy: number }

function layers(style: Features['Ribbon'], colour: string, w: number, pal: Palette): Layer[] {
  const c = hex(colour)
  const o = w * OUTLINE
  const L = (col: string, width: number, dx = 0, dy = 0): Layer => ({ c: col, w: width, dx, dy })
  if (style === 'Flat')
    return [L(pal.ink, w + 2 * o), L(colour, w)]
  if (style === 'Split')
    return [L(pal.ink, w + 2 * o), L(colour, w), L(pal.ink, w * 0.13)]
  // Every layer is opaque: a crossing redraws the layers on top of the
  // finished strand, and only opaque layers give back the same colours.
  if (style === 'Tube')
    return [L(pal.ink, w + 2 * o), L(css(shade(c, 0.74)), w), L(colour, w * 0.66, -0.04 * w, -0.04 * w), L(css(tint(c, 0.36)), w * 0.2, -0.12 * w, -0.12 * w)]
  // Carved: no outline, a cast shadow and a lit upper edge
  const field = hex(pal.field)
  return [L(css(shade(field, 0.62)), w * 1.02, 0.12 * w, 0.16 * w), L(css(shade(c, 0.7)), w), L(colour, w * 0.72, -0.07 * w, -0.08 * w), L(css(tint(c, 0.21)), w * 0.22, -0.18 * w, -0.2 * w)]
}

// ---------------------------------------------------------------------------

const TAU = Math.PI * 2
const TORI: readonly (readonly [number, number])[] = [[2, 3], [2, 5], [3, 4], [2, 7], [3, 5], [3, 7], [4, 5], [2, 9]]

/** Turns stay this far from their wall (grid units). */
const INSET = 0.26

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const pattern: Pattern = f.Pattern

  // Fixed stream order: layout, breaks, colour.
  const lay = stream(hash, 'layout')
  const brk = stream(hash, 'breaks')
  const col = stream(hash, 'colour')

  const S = Math.min(width, height)
  const aspectW = width / S
  const aspectH = height / S
  const nPick = lay()

  // Cells across the short side, and the grid that fits the canvas.
  const margin = (cells: number) => 0.055 * cells + 0.5
  const fit = (cells: number) => {
    const mg = margin(cells)
    return [cells, Math.max(2, Math.floor(aspectW * cells - 2 * mg + 1e-6)), Math.max(2, Math.floor(aspectH * cells - 2 * mg + 1e-6))]
  }

  let n: number
  let nx: number
  let ny: number
  let grid: KnotGrid
  let torus: { p: number, q: number, cx: number, cy: number, r: number, rot: number, inner: number } | null = null

  if (f.Form === 'Sampler') {
    const p = int(lay, 3, 5)
    const k = p === 5 ? 2 : int(lay, 2, 3)
    const mg = 1.2
    n = k * p + (k - 1) + 2 * mg
    // As many panels as fit, then stretched to fill the long side: square
    // panels on a square canvas, oblong ones on a wide or tall one.
    const spanW = aspectW * n - 2 * mg + 1
    const spanH = aspectH * n - 2 * mg + 1
    const cols = Math.max(1, Math.floor(spanW / (p + 1) + 1e-6))
    const rows = Math.max(1, Math.floor(spanH / (p + 1) + 1e-6))
    const pw = Math.floor(spanW / cols + 1e-6) - 1
    const ph = Math.floor(spanH / rows + 1e-6) - 1
    nx = cols * (pw + 1) - 1
    ny = rows * (ph + 1) - 1
    grid = new KnotGrid(nx, ny)
    for (let b = 0; b < rows; b++) {
      for (let a = 0; a < cols; a++) {
        const reg: Region = { x0: a * (pw + 1), y0: b * (ph + 1), w: pw, h: ph }
        grid.fill(reg)
        if (p >= 4 && brk() < 0.35) {
          for (const [dx, dy] of [[0, 0], [pw - 1, 0], [0, ph - 1], [pw - 1, ph - 1]])
            grid.fill({ x0: reg.x0 + dx, y0: reg.y0 + dy, w: 1, h: 1 }, 0)
        }
        placeBreaks(grid, reg, pattern, brk, brk())
      }
    }
  }
  else {
    const cells = f.Form === 'Panel' ? 8 + 7 * nPick : (f.Form === 'Frame' ? 14 : 13) + 5 * nPick;
    [n, nx, ny] = fit(cells)
    grid = new KnotGrid(nx, ny)
    const full: Region = { x0: 0, y0: 0, w: nx, h: ny }
    grid.fill(full)
    if (f.Form === 'Frame') {
      const b = n >= 16.5 && lay() < 0.6 ? 3 : 2
      grid.fill({ x0: b, y0: b, w: nx - 2 * b, h: ny - 2 * b }, 0)
      const inner: Region = { x0: b + 1, y0: b + 1, w: nx - 2 * b - 2, h: ny - 2 * b - 2 }
      placeBreaks(grid, full, pattern, brk, brk())
      if (inner.w >= 2 && inner.h >= 2) {
        grid.fill(inner)
        placeBreaks(grid, inner, pattern === 'Plait' ? 'Mirrored' : pattern, brk, brk())
      }
    }
    else if (f.Form === 'Torus') {
      const [p, q] = pick(lay, TORI)
      const rot = lay() * TAU
      const inner = 0.2 + 0.2 * lay()
      const cx = nx / 2
      const cy = ny / 2
      const r = Math.min(nx, ny) / 2 - 2.1
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          if (Math.hypot(i + 0.5 - cx, j + 0.5 - cy) < r + 0.2)
            grid.fill({ x0: i, y0: j, w: 1, h: 1 }, 0)
        }
      }
      torus = { p, q, cx, cy, r, rot, inner }
      placeBreaks(grid, full, pattern, brk, brk())
    }
    else {
      placeBreaks(grid, full, pattern, brk, brk())
    }
  }
  const fullField = torus !== null

  const rot = Math.floor(col() * pal.strands.length)
  const w = WIDTH[f.Ribbon]
  const pointed = f.Corners === 'Pointed'
  const { strands, crossings } = grid.trace(INSET, pointed, w, 0)
  for (const s of strands)
    s.colour = (s.colour + rot) % pal.strands.length
  if (torus) {
    const outer = (torus.r - 0.3) * 0.88
    const tw = Math.min(0.6, Math.max(0.24, outer * 0.55 / (torus.q + 1)))
    const k = torusKnot(torus.p, torus.q, torus.cx, torus.cy, outer, outer * torus.inner, torus.rot, tw, rot)
    for (const c of k.crossings)
      c.strand = strands.length
    strands.push(k.strand)
    crossings.push(...k.crossings)
  }

  // --- draw ----------------------------------------------------------------
  const cell = S / n
  const ox = (width - nx * cell) / 2
  const oy = (height - ny * cell) / 2
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, width, height)
  ctx.setTransform(cell, 0, 0, cell, ox, oy)

  // Panels: ground, widened by `e`, inside a double rule.
  const e = 0.25
  const lw = 0.05
  const gp = 0.07
  const edges = grid.border()
  const rimPath = new Path2D()
  const allPath = new Path2D()
  for (let o = 0; o < edges.length; o += 6) {
    const [x0, y0, x1, y1, nxv, nyv] = edges.slice(o, o + 6)
    allPath.moveTo(x0, y0)
    allPath.lineTo(x1, y1)
    // edges of a torus medallion's hole get no rule
    const mx = (x0 + x1) / 2 + nxv * 0.5
    const my = (y0 + y1) / 2 + nyv * 0.5
    if (fullField && mx > 0 && my > 0 && mx < nx && my < ny)
      continue
    rimPath.moveTo(x0, y0)
    rimPath.lineTo(x1, y1)
  }
  ctx.lineCap = 'square'
  ctx.lineJoin = 'miter'
  ctx.miterLimit = 4
  const rule = (c: string, half: number) => {
    ctx.strokeStyle = c
    ctx.lineWidth = 2 * half
    ctx.stroke(rimPath)
  }
  rule(pal.rim, e + gp + 2 * lw)
  rule(pal.bg, e + gp + lw)
  rule(pal.rim, e + lw)
  ctx.strokeStyle = pal.field
  ctx.lineWidth = 2 * e
  ctx.stroke(allPath)
  ctx.fillStyle = pal.field
  if (fullField) {
    ctx.fillRect(0, 0, nx, ny)
  }
  else {
    ctx.beginPath()
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (grid.inside(i, j))
          ctx.rect(i, j, 1, 1)
      }
    }
    ctx.fill()
  }
  if (torus) {
    ctx.strokeStyle = pal.rim
    ctx.lineWidth = lw
    for (const rr of [torus.r - 0.05, torus.r - 0.05 - gp - lw]) {
      ctx.beginPath()
      ctx.arc(torus.cx, torus.cy, rr, 0, TAU)
      ctx.stroke()
    }
  }

  drawRibbons(ctx, strands, crossings, f.Ribbon, pal, pointed)
  ctx.restore()
}

function drawRibbons(ctx: CanvasRenderingContext2D, strands: Strand[], crossings: Crossing[], style: Features['Ribbon'], pal: Palette, pointed: boolean): void {
  // One path per colour and width for the whole strands, and one per layer
  // for the short stretches that pass over at the crossings.
  const groups = new Map<string, { main: Path2D, local: Path2D[], layers: Layer[] }>()
  const groupOf = (s: Strand) => {
    const key = `${s.colour}|${s.width}`
    let g = groups.get(key)
    if (!g) {
      const layerList = layers(style, pal.strands[s.colour], s.width, pal)
      g = { main: new Path2D(), local: layerList.map(() => new Path2D()), layers: layerList }
      groups.set(key, g)
    }
    return g
  }
  for (const s of strands)
    strandPath(groupOf(s).main, s.seg)

  const carved = style === 'Carved'
  const inkCut = new Path2D()
  const fieldCut = new Path2D()
  // Strip of the under band between two offsets from the over band's
  // centre line (a1..a2 across the over band, ±h2 across the under band).
  const strip = (path: Path2D, c: Crossing, a1: number, a2: number, h2: number) => {
    const ax = -c.oy
    const ay = c.ox
    const bx = -c.uy
    const by = c.ux
    const det = ax * by - ay * bx
    for (const side of [1, -1]) {
      let first = true
      for (const [p, q] of [[a1, h2], [a2, h2], [a2, -h2], [a1, -h2]]) {
        const ps = p * side
        const x = c.x + (ps * by - ay * q) / det
        const y = c.y + (ax * q - ps * bx) / det
        if (first)
          path.moveTo(x, y)
        else
          path.lineTo(x, y)
        first = false
      }
      path.closePath()
    }
  }
  for (const c of crossings) {
    const s = strands[c.strand]
    const w = s.width
    const o = w * OUTLINE
    const g = w * GAP
    const hb = w / 2 + o
    const sin = Math.abs(c.ox * c.uy - c.oy * c.ux)
    const cos = Math.abs(c.ox * c.ux + c.oy * c.uy)
    if (!carved) {
      // The gap beside the over band, then an ink cap on the cut ends of
      // the under band. The over band itself is never cut: it is redrawn.
      strip(inkCut, c, hb + g - 0.002, hb + g + o, w / 2)
      strip(fieldCut, c, hb - 0.002, hb + g, hb + 0.004)
    }
    const L = Math.min(3 * w, (hb + (hb + g + o) * cos) / Math.max(0.2, sin) + 0.1 * w) + (carved ? 0.3 * w : 0)
    // Each layer runs a little further than the one below, so it covers the
    // anti-aliased end of that layer and leaves no seam.
    const grp = groupOf(s)
    grp.local.forEach((path, li) => localPath(path, s.seg, c.seg, L + li * 0.08 * w))
  }

  ctx.lineJoin = pointed ? 'miter' : 'round'
  ctx.miterLimit = 4
  const count = groups.values().next().value?.layers.length ?? 0
  const pass = (local: boolean) => {
    ctx.lineCap = local ? 'butt' : 'round'
    for (let li = 0; li < count; li++) {
      for (const g of groups.values()) {
        const L = g.layers[li]
        ctx.save()
        ctx.translate(L.dx, L.dy)
        ctx.strokeStyle = L.c
        ctx.lineWidth = L.w
        ctx.stroke(local ? g.local[li] : g.main)
        ctx.restore()
      }
    }
  }
  pass(false)
  if (!carved) {
    ctx.fillStyle = pal.field
    ctx.fill(fieldCut)
    ctx.fillStyle = pal.ink
    ctx.fill(inkCut)
  }
  pass(true)
}

export default {
  slug: 'knots',
  title: 'Knots',
  summary: 'Celtic-style knotwork from a plait and its breaks, with borders, samplers and torus knots, every strand passing over and under in turn.',
  order: 240,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x6b0760b0 ("gallery" stream): the first hash found for each
  // palette × form pair, until twelve pairs are covered.
  gallery: [
    '0xd695bdb7a4b288726180be1a8a1a533a39e065e3387e4224c09cf4e4180abba2',
    '0x440f4802868d6cc95fed6ebae8dd63745b9847c96b4e3e2a7cd12ee1cd5546a6',
    '0x797f8206442e633aa30090d20ad1e6797d42a745dde2773e97b62f5d69ea70fd',
    '0x17dc9804a79b79117d522708a1bcc5286d6be32ae5698ab08637c9b44842c39c',
    '0x2930b2b36d794c3b2d8b162dd3c9333bea4ddc73f8c1e40848b22f2fa0f304bb',
    '0xd063187f347d21fb8d8485313a1d41adef3efc3e47769ac8224b62abdc571425',
    '0xde7a4f0167f9dd031d800f84c89b33b593362777dba1a5092912eaa060848836',
    '0x044cfa86084e2fec197eadc12b7d31ade3d4a0be14985c126ada44fbfba21364',
    '0xdafe32f24e8caa82c83bd00de4ffdf2b73491f46d8ac8555a42583be0f5be719',
    '0xd191dc981bd20cff248c27c25ee526dcc30a1de01805d5a5e99dcffa0e4b2048',
    '0xd210853d0f6ebfacc33e4379298a7669f1ba59d70c056c54a84d954e6b332f2e',
    '0x61e5b960116618ccfabf91226bcd69d655d07fdfad8e46f739915cf436191ac6',
  ],
} satisfies Series
