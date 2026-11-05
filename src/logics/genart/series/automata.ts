// "Automata" — cellular automata worked as textiles.
//
// A rule is drawn from the hash: an elementary or three-state totalistic 1D
// rule, whose generations run down the cloth row by row, or a 2D Life-like or
// cyclic rule, read as its final state. It runs on a repeat unit whose
// boundary is a wrap (a seamless repeat), a mirror (each repeat reflected) or
// a wall (panels separated by a selvedge), and candidates that come out
// blank, full, noisy or striped are redrawn from the same stream (see
// ../automata/sim.ts). Each cell is then worked as cross-stitch on aida,
// stockinette knitting, loom beadwork or a pieced quilt with half-square
// corners, the colour of each stitch given by the cell's state and age.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side: the cell is short side / N. A wider or taller
// canvas shows more of the same repeat (and, for 1D rules, more generations
// below), centred on the same cells.

import type { Boundary, Family } from '../automata/sim'
import type { Series } from '../types'
import { grow } from '../automata/sim'
import { stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// Changing a weight or an order re-rolls the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Indigo', 22], ['Madder', 20], ['Fair Isle', 16], ['Moss', 16], ['Night', 14], ['Teal Dusk', 12]],
  Automaton: [['Elementary', 30], ['Totalistic', 22], ['Life-like', 28], ['Cyclic', 20]],
  Stitch: [['Cross-stitch', 30], ['Knit', 28], ['Beadwork', 20], ['Quilt', 22]],
  Repeat: [['Seamless', 45], ['Mirrored', 35], ['Panels', 20]],
  Scale: [['Coarse', 25], ['Medium', 50], ['Fine', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Automaton: weighted(r, TRAITS.Automaton),
    Stitch: weighted(r, TRAITS.Stitch),
    Repeat: weighted(r, TRAITS.Repeat),
    Scale: weighted(r, TRAITS.Scale),
  }
}

// ---------------------------------------------------------------------------
// Palettes: undyed and dark grounds with threads after natural dyes.
// threads[0] is the dominant colour, threads[3] the lightest touch.
// ---------------------------------------------------------------------------

interface Palette {
  ground: string
  threads: readonly [string, string, string, string]
  accent: string
  dark: boolean
}

const PAL: Record<Features['Palette'], Palette> = {
  'Indigo': { ground: '#ebe3d0', threads: ['#1b2a4e', '#2f5288', '#7d9cc4', '#c3a86b'], accent: '#b8432f', dark: false },
  'Madder': { ground: '#efe4cd', threads: ['#6e1a1a', '#b2382a', '#de8a52', '#3b3532'], accent: '#2d5a55', dark: false },
  'Fair Isle': { ground: '#eee5cf', threads: ['#2f4a3a', '#a8322d', '#d9a441', '#3d5f86'], accent: '#6b3f6e', dark: false },
  'Moss': { ground: '#e3dfc9', threads: ['#26362a', '#56743f', '#a3b066', '#8a5a2b'], accent: '#c8452f', dark: false },
  'Night': { ground: '#15161d', threads: ['#e6c562', '#d36f3c', '#5d8db3', '#e8e0cb'], accent: '#c43d5a', dark: true },
  'Teal Dusk': { ground: '#0f1d20', threads: ['#e8dcc0', '#5fb0a2', '#2d7f78', '#d39a4f'], accent: '#e2603f', dark: true },
}

/** Cells across the canvas short side; quilt patches are cut larger than stitches. */
const CELLS: Record<Features['Scale'], number> = { Coarse: 32, Medium: 48, Fine: 64 }
const PATCHES: Record<Features['Scale'], number> = { Coarse: 20, Medium: 28, Fine: 40 }

const BOUNDARY: Record<Features['Repeat'], Boundary> = { Seamless: 'wrap', Mirrored: 'mirror', Panels: 'wall' }

type RGB = readonly [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Mix towards white (t > 0) or black (t < 0). */
function tone(c: RGB, t: number, alpha = 1): string {
  const f = (x: number) => Math.round(t >= 0 ? x + (255 - x) * t : x * (1 + t))
  return alpha < 1 ? `rgba(${f(c[0])},${f(c[1])},${f(c[2])},${alpha})` : `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

/** Integer hash of a canvas cell, independent of the canvas size. */
function cellNoise(seed: number, a: number, b: number): number {
  let h = seed ^ Math.imul(a, 0x27D4EB2D) ^ Math.imul(b + 7, 0x165667B1)
  h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const mod = (a: number, n: number) => ((a % n) + n) % n

/** The four corners of a cell, as signs along x and y. */
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const

/** Three slightly different dye lots per colour. */
const LOTS = [0, -0.08, 0.07] as const

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stitches. Each stitch is drawn once per colour and dye lot into a small
// sprite at the cell's size, then stamped on every cell: a few thousand
// drawImage calls are far cheaper than a few thousand stroked or elliptical
// paths. Sprites are drawn in cell units, the cell being [0, 1]^2.
// ---------------------------------------------------------------------------

/** Margin of a sprite around its cell, in cell units (shadows, overlapping legs). */
const MARGIN = 0.15

type Sprite = HTMLCanvasElement | OffscreenCanvas
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function makeCanvas(px: number): Sprite {
  if (typeof document === 'undefined')
    return new OffscreenCanvas(px, px)
  const cv = document.createElement('canvas')
  cv.width = px
  cv.height = px
  return cv
}

function makeSprite(c: number, draw: (g: Ctx2D) => void): Sprite {
  const span = 1 + 2 * MARGIN
  const px = Math.max(4, Math.ceil(c * span))
  const cv = makeCanvas(px)
  const g = cv.getContext('2d') as Ctx2D
  // drawn at the cell size itself: stamping is then a plain blit, no resampling
  g.setTransform(c, 0, 0, c, c * MARGIN, c * MARGIN)
  draw(g)
  return cv
}

function crossSprite(g: Ctx2D, col: RGB, lot: number, dark: boolean, lean: number): void {
  const i = 0.13
  const leg = (under: boolean, dx: number, dy: number) => {
    g.beginPath()
    if (under) {
      g.moveTo(i + lean + dx, 1 - i + dy)
      g.lineTo(1 - i + dx, i - lean + dy)
    }
    else {
      g.moveTo(i + dx, i + lean + dy)
      g.lineTo(1 - i - lean + dx, 1 - i + dy)
    }
    g.stroke()
  }
  g.lineCap = 'round'
  g.strokeStyle = `rgba(0,0,0,${dark ? 0.45 : 0.2})`
  g.lineWidth = 0.3
  leg(true, 0.03, 0.05)
  leg(false, 0.03, 0.05)
  for (const under of [true, false]) {
    g.lineWidth = 0.27
    g.strokeStyle = tone(col, lot + (under ? -0.12 : 0))
    leg(under, 0, 0)
    // the twist of the strands, as faint ridges across the leg
    g.setLineDash([0.035, 0.055])
    g.strokeStyle = tone(col, -0.35, 0.22)
    leg(under, 0, 0)
    g.setLineDash([])
  }
  // sheen along the top leg
  g.lineWidth = 0.06
  g.strokeStyle = tone(col, 0.45, 0.45)
  leg(false, -0.035, 0.035)
}

function knitSprite(g: Ctx2D, col: RGB, lot: number): void {
  for (const s of [-1, 1]) {
    const ex = 0.5 + s * 0.215
    g.beginPath()
    g.ellipse(ex, 0.5, 0.2, 0.5, s * 0.5, 0, Math.PI * 2)
    g.fillStyle = tone(col, lot)
    g.fill()
    // the shadowed inner edge and the lit outer edge of each leg
    g.beginPath()
    g.ellipse(ex + s * 0.05, 0.52, 0.09, 0.4, s * 0.5, 0, Math.PI * 2)
    g.fillStyle = tone(col, -0.25, 0.4)
    g.fill()
    g.beginPath()
    g.ellipse(ex - s * 0.04, 0.42, 0.06, 0.28, s * 0.5, 0, Math.PI * 2)
    g.fillStyle = tone(col, 0.3, 0.5)
    g.fill()
  }
}

function beadSprite(g: Ctx2D, col: RGB, lot: number): void {
  g.beginPath()
  g.roundRect(0.07, 0.05, 0.86, 0.9, 0.2)
  g.fillStyle = tone(col, lot)
  g.fill()
  g.beginPath()
  g.roundRect(0.12, 0.66, 0.76, 0.2, 0.1)
  g.fillStyle = tone(col, -0.3, 0.45)
  g.fill()
  g.beginPath()
  g.roundRect(0.24, 0.17, 0.52, 0.12, 0.06)
  g.fillStyle = tone(col, 0.6, 0.6)
  g.fill()
}

/** Running stitch of the quilting over one cell: diagonal, crossed or a centred grid. */
function quiltingSprite(g: Ctx2D, mode: number, dark: boolean): void {
  g.strokeStyle = dark ? 'rgba(240,230,210,0.32)' : 'rgba(255,250,240,0.6)'
  g.lineWidth = 0.045
  g.lineCap = 'round'
  // one dash centred on the cell's half: dashes line up from cell to cell
  g.setLineDash([0.18, 0.1])
  g.lineDashOffset = -0.05
  g.beginPath()
  if (mode < 2) {
    g.moveTo(0, 0)
    g.lineTo(1, 1)
    if (mode === 1) {
      g.moveTo(1, 0)
      g.lineTo(0, 1)
    }
  }
  else {
    g.moveTo(0.5, 0)
    g.lineTo(0.5, 1)
    g.moveTo(0, 0.5)
    g.lineTo(1, 0.5)
  }
  g.stroke()
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(ctx: CanvasRenderingContext2D, width: number, height: number, hash: string): void {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const N = f.Stitch === 'Quilt' ? PATCHES[f.Scale] : CELLS[f.Scale]
  const S = Math.min(width, height)
  const c = S / N
  const oneD = f.Automaton === 'Elementary' || f.Automaton === 'Totalistic'

  // Fixed stream order: rules, then texture.
  const rr = stream(hash, 'rules')
  // one repeat across the short side, or two when each stays wide enough
  const twice = rr() < 0.5 && N / 2 >= 14
  const P = twice ? N / 2 : N

  // Canvas grid: columns centred on the canvas middle; 1D rows run down from
  // the top edge, 2D rows are centred too.
  const nx = Math.ceil(width / (2 * c)) + 1
  const gx = 2 * nx
  const x0 = width / 2 - nx * c
  let gy: number
  let y0: number
  let ry0: number
  if (oneD) {
    gy = Math.ceil(height / c) + 1
    y0 = 0
    ry0 = 0
  }
  else {
    const ny = Math.ceil(height / (2 * c)) + 1
    gy = 2 * ny
    y0 = height / 2 - ny * c
    ry0 = -ny
  }

  const lat = grow(rr, f.Automaton as Family, P, oneD ? gy : P, BOUNDARY[f.Repeat])

  const tr = stream(hash, 'texture')
  const seed = Math.floor(tr() * 4294967296) | 0
  const quiltMode = Math.floor(tr() * 3)

  // Lattice coordinate of a canvas column / row, -1 for a selvedge.
  const map = (i: number, n: number): number => {
    if (f.Repeat === 'Seamless')
      return mod(i + n / 2, n)
    if (f.Repeat === 'Mirrored') {
      const t = Math.floor(i / n)
      const l = mod(i, n)
      return mod(t, 2) === 1 ? n - 1 - l : l
    }
    const l = mod(i + n / 2, n + 1)
    return l === n ? -1 : l
  }

  const cells = new Uint8Array(gx * gy)
  const lots = new Uint8Array(gx * gy)
  for (let j = 0; j < gy; j++) {
    const ly = oneD ? Math.min(j, lat.h - 1) : map(j + ry0, P)
    for (let i = 0; i < gx; i++) {
      const lx = map(i - nx, P)
      cells[j * gx + i] = lx < 0 || ly < 0 ? 5 : lat.paint[ly * lat.w + lx]
      lots[j * gx + i] = Math.floor(cellNoise(seed, i - nx, j + ry0) * 3)
    }
  }

  const colours: RGB[] = [hex(pal.ground), ...pal.threads.map(hex), hex(pal.accent)]
  const m = c * MARGIN

  /** Stamp sprites[v * 3 + lot] on every cell whose colour passes `use`, row by row. */
  const stamp = (sprites: (Sprite | null)[]) => {
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const k = j * gx + i
        const sp = sprites[cells[k] * 3 + lots[k]]
        if (sp)
          ctx.drawImage(sp, x0 + i * c - m, y0 + j * c - m)
      }
    }
  }
  const sheet = (from: number, draw: (g: Ctx2D, col: RGB, lot: number, l: number, v: number) => void) => {
    const out: (Sprite | null)[] = []
    for (let v = 0; v <= 5; v++) {
      for (let l = 0; l < 3; l++)
        out.push(v < from ? null : makeSprite(c, g => draw(g, colours[v], LOTS[l], l, v)))
    }
    return out
  }

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  const g0 = colours[0]

  if (f.Stitch === 'Cross-stitch') {
    // aida: faint blocks of the weave, holes at the corners, then the Xs
    ctx.fillStyle = tone(g0, 0)
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = tone(g0, pal.dark ? 0.04 : -0.035)
    ctx.beginPath()
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        if ((i + j) & 1)
          ctx.rect(x0 + i * c + c * 0.1, y0 + j * c + c * 0.1, c * 0.8, c * 0.8)
      }
    }
    ctx.fill()
    ctx.fillStyle = tone(g0, pal.dark ? -0.5 : -0.22)
    const h = c * 0.13
    ctx.beginPath()
    for (let j = 0; j <= gy; j++) {
      for (let i = 0; i <= gx; i++)
        ctx.rect(x0 + i * c - h / 2, y0 + j * c - h / 2, h, h)
    }
    ctx.fill()
    stamp(sheet(1, (g, col, lot, l) => crossSprite(g, col, lot, pal.dark, (l - 1) * 0.025)))
  }
  else if (f.Stitch === 'Knit') {
    ctx.fillStyle = tone(g0, pal.dark ? -0.45 : -0.42)
    ctx.fillRect(0, 0, width, height)
    // the ground is knitted too, in a yarn a shade off the cloth colour
    const yarn = pal.dark ? 0.06 : -0.04
    stamp(sheet(0, (g, col, lot, _l, v) => knitSprite(g, col, lot + (v === 0 ? yarn : 0))))
  }
  else if (f.Stitch === 'Beadwork') {
    ctx.fillStyle = tone(g0, pal.dark ? -0.6 : -0.7)
    ctx.fillRect(0, 0, width, height)
    const ground = pal.dark ? 0.08 : -0.03
    stamp(sheet(0, (g, col, lot, _l, v) => beadSprite(g, col, lot + (v === 0 ? ground : 0))))
  }
  else {
    quilt()
  }

  ctx.restore()

  // --- Quilt: pieced squares, corners turned into half-square triangles ----
  function quilt(): void {
    ctx.fillStyle = tone(g0, 0)
    ctx.fillRect(0, 0, width, height)
    // anti-aliasing seams between patches of one colour: overlap by a pixel
    const e = 0.6
    for (let v = 1; v <= 5; v++) {
      for (let l = 0; l < 3; l++) {
        ctx.fillStyle = tone(colours[v], LOTS[l] * 0.7)
        ctx.beginPath()
        for (let k = 0; k < cells.length; k++) {
          if (cells[k] === v && lots[k] === l) {
            const i = k % gx
            const j = (k - i) / gx
            ctx.rect(x0 + i * c - e, y0 + j * c - e, c + 2 * e, c + 2 * e)
          }
        }
        ctx.fill()
      }
    }
    // A corner whose two neighbours along the sides share a colour other than
    // the cell's takes their colour: staircases become diagonals.
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= gx || j >= gy ? -1 : cells[j * gx + i])
    for (let v = 0; v <= 5; v++) {
      ctx.fillStyle = tone(colours[v], 0)
      ctx.beginPath()
      for (let j = 0; j < gy; j++) {
        for (let i = 0; i < gx; i++) {
          if (cells[j * gx + i] === v)
            continue
          const x = x0 + i * c
          const y = y0 + j * c
          for (const [sx, sy] of CORNERS) {
            if (at(i + sx, j) !== v || at(i, j + sy) !== v)
              continue
            const cx = sx < 0 ? x : x + c
            const cy = sy < 0 ? y : y + c
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx - sx * c * 0.5, cy)
            ctx.lineTo(cx, cy - sy * c * 0.5)
            ctx.closePath()
          }
        }
      }
      ctx.fill()
    }
    // piecing seams
    ctx.strokeStyle = pal.dark ? 'rgba(0,0,0,0.35)' : 'rgba(40,30,20,0.13)'
    ctx.lineWidth = c * 0.025
    ctx.beginPath()
    for (let i = 0; i <= gx; i++) {
      ctx.moveTo(x0 + i * c, 0)
      ctx.lineTo(x0 + i * c, height)
    }
    for (let j = 0; j <= gy; j++) {
      ctx.moveTo(0, y0 + j * c)
      ctx.lineTo(width, y0 + j * c)
    }
    ctx.stroke()
    // quilting: one cell of running stitch, repeated as a pattern on the grid
    const q = Math.max(4, Math.round(c))
    const tile = makeCanvas(q)
    const tg = tile.getContext('2d') as Ctx2D
    tg.setTransform(q, 0, 0, q, 0, 0)
    quiltingSprite(tg, quiltMode, pal.dark)
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) {
      pattern.setTransform(new DOMMatrix([c / q, 0, 0, c / q, x0, y0]))
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, width, height)
    }
  }
}

export default {
  slug: 'automata',
  title: 'Automata',
  summary: 'Cellular automata worked as cloth: elementary, totalistic, Life-like and cyclic rules in cross-stitch, knitting, beads and quilts.',
  order: 210,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xa070a7a0 ("gallery" stream): the first hash found for each
  // Automaton x Stitch pair, the first twelve pairs in the order found, except
  // that the second (cyclic spirals knitted in panels) is moved first to serve
  // as the cover.
  gallery: [
    '0x7840f6124bf3111f335ef7175f73697a51713883fae3689521ceb70148ba03c2',
    '0x4e72dfe58d1275f8998bb5feba6a3ead3353cada4171d04892d84baa31effbad',
    '0xf2de51b969427afc9ede0eb98540ad6a835f3c44b3dcb73e6b28d0d5d7c4af4e',
    '0xa051840b61f417b33cd9b3b9ec3f5c889e8c5b395a57aef46aede73a31fd00f9',
    '0xe048851102e097a429f329966d7c3f482e343225d2f2b5ba463e74edca2f42c7',
    '0x9cdd3358b0694736a824282cc4be6d2ae33f597c5b046fdedb1ff7039cfcdcf9',
    '0xdde0941d39a532c750483eed5e789856e16d05d8efeac01bb70f5336c010856c',
    '0xc1b25ed5c7ab40bab0cc7de5d1cb381c5eb642b2698599e51039365e41d5ac0d',
    '0x5c8956f5eb5f8493e471b8c2b5dcfb078ef922ebb96e2f8318f86939e98695a6',
    '0x42d2f932319150c15962ce28e6b76223b4d5371aa34d8b8f97689f3a9131fdac',
    '0x98554215907dbce36ea70eab92776820904f02490f678411a08bdd9644be5837',
    '0x9c9d4d7980a511e729c3e47c27497c4d9bf4b3d5ea4a88fd526cf535cf56c698',
  ],
} satisfies Series
