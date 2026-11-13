// "Wash" — a river painted in three stages: water, ink, then watercolour.
//
// 1. Water (../wash/flow.ts): a stream function for a river between two
//    banks, with stones the water parts around, eddies shed behind them and
//    turbulence that ranges from still water to a torrent.
// 2. Ink (../wash/ink.ts): the streamlines, i.e. the integer levels of the
//    banded stream function, found by marching squares and drawn as broken
//    pen strokes with varying pressure and blots where the pen rested.
// 3. Colour (../wash/paint.ts): a wash in each band between two lines,
//    painted pixel by pixel with edge darkening, granulation in the grain of
//    a cold-pressed paper, back-runs, wet-in-wet bleeding and glazes.
//
// Everything is a pure function of the hash. Every length is a fraction of
// the canvas short side: the world frame has the short side = 1 and its
// origin at the centre. The river runs along the long side of the canvas, so
// a wide canvas shows more of the same river and a clearly tall one (2:3 or
// taller) shows it turned a quarter turn; a square or a 4:5 canvas shows the
// central reach with more of the banks.

import type { Rng } from '../random'
import type { Series } from '../types'
import type { CourseName, WaterSpec } from '../wash/flow'
import type { InkLine, PenName, PenSpec } from '../wash/ink'
import type { BandTable, PaintJob } from '../wash/paint'
import { int, range, stream, weighted } from '../random'
import { chaikin, contours } from '../wash/contour'
import { focus, levelOf, planRiver, scratch, solidSdf, streamT, untwirl } from '../wash/flow'
import { drawInk } from '../wash/ink'
import { fbm, makeNoise } from '../wash/noise'
import { paintRows } from '../wash/paint'
import { coldPressed } from '../wash/paper'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Water: [['Still', 18], ['Flowing', 34], ['Rapids', 28], ['Torrent', 20]],
  Course: [['Reach', 22], ['Meander', 34], ['Bend', 26], ['Island', 18]],
  Wash: [['Glazes', 32], ['Wet in wet', 26], ['Blooms', 24], ['Sediment', 18]],
  Pen: [['Fine', 30], ['Reed', 36], ['Brush', 20], ['Sparse', 14]],
  Palette: [['Lagoon', 24], ['Ember', 20], ['Dusk', 20], ['Moss', 18], ['Nightwater', 18]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Water: weighted(r, TRAITS.Water),
    Course: weighted(r, TRAITS.Course),
    Wash: weighted(r, TRAITS.Wash),
    Pen: weighted(r, TRAITS.Pen),
    Palette: weighted(r, TRAITS.Palette),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original). Water pigments: four main ones and an accent.
// ---------------------------------------------------------------------------

interface Palette {
  dark: boolean
  paper: string
  ink: string
  water: readonly [string, string, string, string, string]
  land: readonly [string, string]
  stone: string
  /** Granulation of the water pigments, then of the two land pigments. */
  gran: readonly number[]
}

const PALETTES: Record<Features['Palette'], Palette> = {
  Lagoon: {
    dark: false,
    paper: '#f4efe4',
    ink: '#1c1d22',
    water: ['#5aa8d6', '#2c9c8f', '#4161ab', '#8ccfc3', '#e9b649'],
    land: ['#cba56c', '#90a25f'],
    stone: '#6d6b74',
    gran: [0.5, 0.3, 1, 0.2, 0.2, 1, 0.6],
  },
  Ember: {
    dark: false,
    paper: '#f6efe1',
    ink: '#261a17',
    water: ['#f08a3c', '#d94b74', '#e4613b', '#efba4e', '#6a5ba8'],
    land: ['#a9744b', '#d8b273'],
    stone: '#6f5b53',
    gran: [0.3, 0.4, 0.3, 0.2, 0.9, 1, 0.5],
  },
  Dusk: {
    dark: false,
    paper: '#f3eee7',
    ink: '#1d1929',
    water: ['#7d5daa', '#e586aa', '#3b4778', '#f4a67e', '#389a96'],
    land: ['#a898ae', '#c99688'],
    stone: '#605968',
    gran: [0.8, 0.3, 1, 0.3, 0.4, 0.7, 0.6],
  },
  Moss: {
    dark: false,
    paper: '#f2ede0',
    ink: '#1f2219',
    water: ['#6b9a4f', '#b1a95b', '#2f7f6f', '#e7d074', '#b5562f'],
    land: ['#b17c4d', '#7b6749'],
    stone: '#5e5f53',
    gran: [0.5, 0.6, 0.4, 0.2, 0.9, 1, 1],
  },
  Nightwater: {
    dark: true,
    paper: '#141820',
    ink: '#ece4cf',
    water: ['#8fd0df', '#f2927c', '#f1c457', '#b9a3e3', '#9dd4b3'],
    land: ['#c49a5a', '#5d8fa8'],
    stone: '#3d4351',
    gran: [0.5, 0.4, 0.3, 0.5, 0.4, 1, 0.8],
  },
}

// ---------------------------------------------------------------------------
// Trait parameters.
// ---------------------------------------------------------------------------

const WATER: Record<Features['Water'], WaterSpec> = {
  Still: { bands: [14, 18], noiseAmp: 0.035, noiseFreq: 1.4, noiseOct: 2, eddies: [1, 2], eddyS: [0.6, 1.3], eddyR: [0.09, 0.15], stones: [0, 1], stoneR: [0.03, 0.05], wake: 0 },
  Flowing: { bands: [20, 26], noiseAmp: 0.12, noiseFreq: 2, noiseOct: 3, eddies: [2, 3], eddyS: [1.4, 2.8], eddyR: [0.07, 0.11], stones: [1, 3], stoneR: [0.028, 0.05], wake: 1 },
  Rapids: { bands: [24, 30], noiseAmp: 0.18, noiseFreq: 2.8, noiseOct: 3, eddies: [1, 2], eddyS: [1.8, 3.2], eddyR: [0.05, 0.09], stones: [4, 7], stoneR: [0.022, 0.045], wake: 2 },
  Torrent: { bands: [28, 36], noiseAmp: 0.42, noiseFreq: 2.4, noiseOct: 3, eddies: [5, 8], eddyS: [2.4, 4.2], eddyR: [0.06, 0.11], stones: [2, 4], stoneR: [0.025, 0.045], wake: 2 },
}

const PENS: Record<PenName, PenSpec> = {
  Fine: { w: 0.0021, on: [0.3, 1.1], gap: [0.004, 0.01], press: 0.25, nib: 0, taper: 0.012, pool: 0.25 },
  Reed: { w: 0.0034, on: [0.07, 0.35], gap: [0.004, 0.014], press: 0.5, nib: 0.55, taper: 0.015, pool: 0.6 },
  Brush: { w: 0.0055, on: [0.1, 0.45], gap: [0.006, 0.02], press: 0.65, nib: 0.15, taper: 0.03, pool: 0.4 },
  Sparse: { w: 0.003, on: [0.1, 0.5], gap: [0.005, 0.016], press: 0.45, nib: 0.4, taper: 0.015, pool: 0.5 },
}
const INK_DRY: Record<PenName, number> = { Fine: 0.15, Reed: 0.5, Brush: 0.8, Sparse: 0.5 }

interface WashSpec {
  paint: number
  edgeE: number
  edgeW: number
  soft: number
  bleed: number
  bleedW: number
  gran: number
  dryGap: number
  gap: number
  bloom: number
  glaze: number
}

const WASHES: Record<Features['Wash'], WashSpec> = {
  'Glazes': { paint: 0.66, edgeE: 1.1, edgeW: 0.0035, soft: 0, bleed: 0, bleedW: 0.01, gran: 0.35, dryGap: 0, gap: 0.0035, bloom: 0, glaze: 1 },
  'Wet in wet': { paint: 0.72, edgeE: 0.35, edgeW: 0.006, soft: 0.006, bleed: 0.55, bleedW: 0.012, gran: 0.3, dryGap: 0, gap: 0.0008, bloom: 0, glaze: 0.6 },
  'Blooms': { paint: 0.66, edgeE: 0.9, edgeW: 0.004, soft: 0.0015, bleed: 0, bleedW: 0.01, gran: 0.35, dryGap: 0, gap: 0.003, bloom: 0.5, glaze: 0.6 },
  'Sediment': { paint: 0.6, edgeE: 0.7, edgeW: 0.003, soft: 0, bleed: 0, bleedW: 0.01, gran: 1.25, dryGap: 0.012, gap: 0.0045, bloom: 0, glaze: 0.6 },
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Absorbance of a pigment (bright paper) or its colour (dark ground). */
function pigment(hex: string, dark: boolean): [number, number, number] {
  const c = rgb(hex)
  if (dark)
    return c
  return [-Math.log(Math.max(c[0], 0.02)), -Math.log(Math.max(c[1], 0.02)), -Math.log(Math.max(c[2], 0.02))]
}

/** Darken a pigment: a colour on a dark ground, an absorbance on paper (val < 1 only). */
function scale(p: number[], val: number): number[] {
  return val === 1 ? p : p.map(c => c * val)
}

function emptyTable(k0: number, n: number): BandTable {
  return {
    k0,
    n,
    on: new Uint8Array(n),
    pig: new Float32Array(n * 6),
    dens: new Float32Array(n),
    gap: new Float32Array(n),
    gran: new Float32Array(n),
    bloom: new Uint8Array(n),
  }
}

function setBand(t: BandTable, i: number, a: number[], b: number[], dens: number, gap: number, gran: number) {
  t.pig.set(a, i * 6)
  t.pig.set(b, i * 6 + 3)
  t.dens[i] = dens
  t.gap[i] = gap
  t.gran[i] = gran
}

/** Cut a polyline where `hide` holds, keeping the visible runs (a closed line seen whole stays closed). */
function splitWhere(pts: number[], closed: boolean, hide: (x: number, y: number) => boolean) {
  const n = pts.length / 2
  const vis = new Uint8Array(n)
  let all = true
  for (let i = 0; i < n; i++) {
    vis[i] = hide(pts[i * 2], pts[i * 2 + 1]) ? 0 : 1
    if (!vis[i])
      all = false
  }
  if (all)
    return [{ pts, closed }]
  const runs: { pts: number[], closed: boolean }[] = []
  // start a closed line at a hidden vertex so no run wraps around
  let s0 = 0
  if (closed) {
    while (vis[s0])
      s0++
  }
  let cur: number[] = []
  for (let k = 0; k <= n; k++) {
    if (k === n && !closed)
      break
    const i = (s0 + k) % n
    if (vis[i] && k < n) {
      cur.push(pts[i * 2], pts[i * 2 + 1])
    }
    else {
      if (cur.length >= 4)
        runs.push({ pts: cur, closed: false })
      cur = []
    }
  }
  if (cur.length >= 4)
    runs.push({ pts: cur, closed: false })
  return runs
}

const LAND_BANDS = 60

/** Washes of the water bands, then of the land, then the glazes and island rings. */
function buildTables(r: Rng, half: number, pal: Palette, ws: WashSpec) {
  const water = pal.water.map(c => pigment(c, pal.dark))
  const land = pal.land.map(c => pigment(c, pal.dark))
  const bands = emptyTable(-half - LAND_BANDS, 2 * half + 2 * LAND_BANDS)
  let cur = int(r, 0, 3)
  for (let k = -half; k < half; k++) {
    const i = k - bands.k0
    const step = r()
    const accent = r()
    const on = r()
    const dens = r()
    const gap = r()
    const bloom = r()
    const second = r()
    if (step < 0.4)
      cur = (cur + (step < 0.15 ? 3 : step < 0.3 ? 1 : 2)) % 4
    const p1 = accent < 0.07 ? 4 : cur
    const p2 = second < 0.5 ? (p1 + 1) % 4 : p1
    bands.on[i] = on < ws.paint ? 1 : 0
    bands.bloom[i] = bloom < ws.bloom ? 1 : 0
    // on a dark ground, bands range from deep to light so the river has depth
    // (derived from draws already made, so the bright palettes are unchanged)
    const vq = (dens * 7.31 + gap * 3.17) % 1
    const val = pal.dark ? (vq < 0.3 ? 0.6 : vq < 0.55 ? 0.82 : 1) : 1
    setBand(bands, i, scale(water[p1], val), scale(water[p2], val), 0.5 + dens * 0.5, ws.gap * (0.4 + gap * 1.4), pal.gran[p1])
  }
  for (let j = 0; j < LAND_BANDS; j++) {
    for (const k of [half + j, -half - 1 - j]) {
      const i = k - bands.k0
      const on = r()
      const which = r()
      const dens = r()
      const gap = r()
      const p1 = which < 0.5 ? 0 : 1
      bands.on[i] = on < 0.42 ? 1 : 0
      setBand(bands, i, land[p1], which < 0.25 ? water[3] : land[1 - p1], 0.35 + dens * 0.3, ws.gap * (0.6 + gap * 1.4), pal.gran[5 + p1])
    }
  }
  const glaze = emptyTable(-40, 81)
  for (let i = 0; i < glaze.n; i++) {
    const on = r()
    const p = int(r, 0, 3)
    const dens = r()
    glaze.on[i] = on < 0.25 + 0.25 * ws.glaze ? 1 : 0
    setBand(glaze, i, water[p], water[(p + 2) % 4], (0.12 + 0.22 * dens) * (0.4 + 0.9 * ws.glaze) * (pal.dark ? 0.5 : 1), ws.gap * 1.5, pal.gran[p])
  }
  // island: a sandy rim and a darker interior
  // island: a sandy rim, a mottled interior and dabs of vegetation
  const rings = emptyTable(0, 3)
  const rd = r()
  rings.on.fill(1)
  setBand(rings, 0, land[0], land[0], 0.3 + 0.1 * rd, ws.gap, pal.gran[5])
  setBand(rings, 1, land[1], water[3], 0.32 + 0.12 * rd, ws.gap, pal.gran[6])
  setBand(rings, 2, scale(land[1], pal.dark ? 0.7 : 1), scale(land[0], pal.dark ? 0.7 : 1), pal.dark ? 0.9 : 0.55, 0, pal.gran[6])
  return { bands, glaze, glazeInv: 1 / int(r, 3, 5), glazeOff: r(), rings }
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------

const STEP = 1 / 300

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PALETTES[f.Palette]
  const spec = WATER[f.Water]
  const ws = WASHES[f.Wash]
  const pen = PENS[f.Pen]
  const S = Math.min(W, H)
  // turn the river only for clearly tall canvases, so 1:1 and 4:5 match
  const portrait = H > W * 1.3

  const nr = stream(hash, 'noise')
  const turb = makeNoise(nr)
  const nLowN = makeNoise(nr)
  const nMixN = makeNoise(nr)
  const nBloomN = makeNoise(nr)
  const wobN = makeNoise(nr)
  const penN = makeNoise(nr)
  const rv = planRiver(stream(hash, 'river'), f.Course as CourseName, spec, turb)
  const tables = buildTables(stream(hash, 'bands'), rv.half, pal, ws)

  // --- Stage 1: the field grid, in the screen frame -------------------------
  const ex = Math.round(W / S * 500) / 1000
  const ey = Math.round(H / S * 500) / 1000
  const nx = Math.ceil(ex / STEP) + 3
  const ny = Math.ceil(ey / STEP) + 3
  const gw = nx * 2 + 1
  const gh = ny * 2 + 1
  const gx0 = -nx * STEP
  const gy0 = -ny * STEP
  const Lf = new Float32Array(gw * gh)
  const rockF = new Float32Array(gw * gh)
  const islF = new Float32Array(gw * gh)
  const grid = new Float32Array(gw * gh * 8)
  const nStones = rv.stones.length
  focus(rv, portrait ? ey : ex, portrait ? ex : ey)
  const hasIsland = rv.stones.some(s => s.island)
  const blooms = ws.bloom > 0
  for (let j = 0; j < gh; j++) {
    const v = gy0 + j * STEP
    for (let i = 0; i < gw; i++) {
      const u = gx0 + i * STEP
      const x = portrait ? v : u
      const y = portrait ? -u : v
      untwirl(rv, x, y)
      const qx = scratch.x
      const qy = scratch.y
      const t = streamT(rv, turb, qx, qy, nStones)
      const L = levelOf(rv, t)
      solidSdf(rv, qx, qy)
      const rock = scratch.rock
      const isl = scratch.isl
      const o = j * gw + i
      Lf[o] = L
      rockF[o] = rock
      islF[o] = isl
      const q = o * 8
      grid[q] = L
      grid[q + 2] = rock
      grid[q + 3] = isl
      // the smooth paint fields on even nodes only; the rest is filled below
      if ((i | j) & 1)
        continue
      grid[q + 4] = fbm(nLowN, qx * 4.5, qy * 4.5, 3)
      grid[q + 5] = nMixN(qx * 2.1 + 5.3, qy * 2.1 - 1.7)
      grid[q + 6] = blooms ? fbm(nBloomN, x * 6.5, y * 6.5, 4) : 0
      grid[q + 7] = wobN(x * 42, y * 42)
    }
  }
  // gw and gh are odd, so every odd node has even neighbours on both sides
  for (let j = 0; j < gh; j += 2) {
    for (let i = 1; i < gw; i += 2) {
      const q = (j * gw + i) * 8
      for (let k = 4; k < 8; k++)
        grid[q + k] = (grid[q - 8 + k] + grid[q + 8 + k]) / 2
    }
  }
  for (let j = 1; j < gh; j += 2) {
    for (let i = 0; i < gw; i++) {
      const q = (j * gw + i) * 8
      for (let k = 4; k < 8; k++)
        grid[q + k] = (grid[q - gw * 8 + k] + grid[q + gw * 8 + k]) / 2
    }
  }
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const o = j * gw + i
      const a = i > 0 ? o - 1 : o
      const b = i < gw - 1 ? o + 1 : o
      const c = j > 0 ? o - gw : o
      const d = j < gh - 1 ? o + gw : o
      const dx = (Lf[b] - Lf[a]) / ((b - a) * STEP)
      const dy = (Lf[d] - Lf[c]) / ((d - c) / gw * STEP)
      grid[o * 8 + 1] = Math.sqrt(dx * dx + dy * dy)
    }
  }

  // --- Stage 2: ink -----------------------------------------------------------
  const lines: InkLine[] = []
  const half = rv.half
  // line spacing (world units) at a point, from the gradient of the level
  const spacing = (x: number, y: number) => {
    const i = Math.round((x - gx0) / STEP)
    const j = Math.round((y - gy0) / STEP)
    if (i < 0 || j < 0 || i >= gw || j >= gh)
      return 1
    return 1 / Math.max(grid[(j * gw + i) * 8 + 1], 1e-3)
  }
  for (const c of contours({ w: gw, h: gh, x0: gx0, y0: gy0, step: STEP, v: Lf }, -4000, 4000)) {
    const lv = c.level
    const bank = Math.abs(lv) === half
    const onLand = Math.abs(lv) > half
    if (f.Pen === 'Sparse' && !bank && lv % 2 !== 0)
      continue
    // where eddies squeeze the lines together, drop every other line, then
    // three in four, so the washes stay visible between them
    const minSp = bank ? 0 : lv % 4 !== 0 ? (lv % 2 !== 0 ? 0.008 : 0.005) : 0
    const pts = chaikin(c.pts, c.closed, 1)
    const runs = minSp > 0 ? splitWhere(pts, c.closed, (x, y) => spacing(x, y) < minSp) : [{ pts, closed: c.closed }]
    for (const run of runs) {
      lines.push({
        pts: run.pts,
        closed: run.closed,
        wm: bank ? 1.8 : onLand ? 0.6 : 1,
        alpha: onLand ? 0.7 : 1,
      })
    }
  }
  if (nStones > 0) {
    const rf = new Float32Array(gw * gh)
    for (let o = 0; o < rf.length; o++)
      rf[o] = -rockF[o] * 1000
    for (const c of contours({ w: gw, h: gh, x0: gx0, y0: gy0, step: STEP, v: rf }, 0, 0))
      lines.push({ pts: chaikin(c.pts, c.closed, 1), closed: c.closed, wm: 1.3, alpha: 1 })
  }
  const ringStep = 0.02
  if (hasIsland) {
    const rf = new Float32Array(gw * gh)
    for (let o = 0; o < rf.length; o++)
      rf[o] = -islF[o] / ringStep
    for (const c of contours({ w: gw, h: gh, x0: gx0, y0: gy0, step: STEP, v: rf }, 0, 0))
      lines.push({ pts: chaikin(c.pts, c.closed, 1), closed: c.closed, wm: 1.2, alpha: 1 })
  }

  const margin = Math.round(0.028 * S)
  g.save()
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.clearRect(0, 0, W, H)
  g.beginPath()
  g.rect(margin, margin, W - 2 * margin, H - 2 * margin)
  g.clip()
  g.fillStyle = pal.ink
  // lines thin out where the flow squeezes them together
  const crowd = (x: number, y: number) => {
    const sp = spacing(x, y)
    return sp > 0.013 ? 1 : Math.max(0.3, (sp / 0.013) ** 0.8)
  }
  drawInk(g, lines, W, H, S, pen, stream(hash, 'ink'), penN, crowd)
  g.restore()

  // --- Stage 3: colour ------------------------------------------------------
  const paper = coldPressed()
  // the shared paper tile is turned and shifted per piece, so its repeat is
  // never aligned with the canvas nor the same from one piece to the next
  const pr = stream(hash, 'paper')
  const pa = range(pr, 0.25, Math.PI / 2 - 0.25) + (pr() < 0.5 ? 0 : Math.PI / 2)
  const paperXf = [Math.cos(pa), Math.sin(pa), pr(), pr()]
  const job: PaintJob = {
    W,
    H,
    S,
    margin,
    dark: pal.dark,
    paper: rgb(pal.paper),
    grid,
    gw,
    gx0,
    gy0,
    step: STEP,
    ...paper,
    paperXf,
    ...tables,
    ringStep,
    stone: pigment(pal.stone, pal.dark),
    stoneDens: pal.dark ? 0.9 : 0.55,
    edgeE: pal.dark ? Math.max(ws.edgeE, 0.75) : ws.edgeE,
    edgeW: ws.edgeW,
    soft: ws.soft,
    bleed: ws.bleed,
    bleedW: ws.bleedW,
    gran: ws.gran,
    dryGap: ws.dryGap,
    bloomThr: 0.56,
    inkDry: INK_DRY[f.Pen],
  }
  const rowsPer = Math.max(16, Math.floor(2_000_000 / W))
  for (let y0 = 0; y0 < H; y0 += rowsPer) {
    const rows = Math.min(rowsPer, H - y0)
    const img = g.getImageData(0, y0, W, rows)
    paintRows(job, img.data, y0, rows)
    g.putImageData(img, 0, y0)
  }
}

export default {
  slug: 'wash',
  title: 'Wash',
  summary: 'A river painted in three stages: its flow around stones and eddies, ink streamlines, then watercolour washes that pool, granulate and bloom between the lines.',
  order: 680,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x5741534857415348 ("WASH", "gallery" stream): the first
  // hash found for each water x palette pair, in the order found, skipping
  // three weak pieces (a pale torrent, a near-empty still island at night and
  // a sparse still reach); the flowing Lagoon bend with back-runs leads.
  gallery: [
    '0xc8cf1f96d22ea01616d2b357d4209e2f7a7af3387d448b843998a1bbe4c1b3c4',
    '0xc8cc333791efee7f8cd25fd47607a4bf70fc5c3b1822a612f70b8d737232d4bd',
    '0xe1d8c1192672b300c7f565103732722e57b7a53cb0536d8110e4d45e0af8b1ea',
    '0x8e36d5cf2bed037f4e7b08e0b3e616356f47acc2583ed4ad560ef0845fcd560f',
    '0x8027f589f7629a878b5d8a1a1e32df4549ee2fca925535936cb9193fc88d25e4',
    '0x750bec7f26c42f851aa9e6564adc1c08c5cf67ca1efc6c26867df85fb9931a0f',
    '0x089207d64d1f9c71991f587cc0fec32671d2b108a2ceba5dbf7c10dd0788a689',
    '0x86be006ccf382620585d53035f99a88997ce3cfe2e4728400bb96a4bdbb2bf19',
    '0x3e2f7368d3f8142f9307bcc29238174070948a9ede9ece3f844893dbba3fa520',
    '0x6d7d091f2878b5e747f24c463d95aba18c02ffda7c4d778dcad23362bf58fdbe',
    '0x305774f2849e81e42b8ffe15b4b0caf09a9bf5efac84ea25fa7318c98afeb4cf',
    '0xc4fbf331350d0d30912a2e24dd19b853917b54e1d1ed134002069e315388adf6',
  ],
} satisfies Series
