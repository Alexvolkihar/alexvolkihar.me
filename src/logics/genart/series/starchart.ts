// "Starchart" — plates from celestial atlases of a sky that does not exist.
//
// Each hash invents a sky (../starchart/sky.ts): a few thousand stars on the
// sphere whose magnitudes follow the star-count law, a galactic plane with its
// Milky Way and dark rift, constellations carved out of a right-ascension /
// declination cell grid and joined into stick figures (minimum spanning trees
// or nearest-neighbour chains), and clusters, nebulae and galaxies where they
// would be found in a real galaxy. It is then charted (../starchart/proj.ts)
// as a polar planisphere, a pair of hemispheres, an equatorial strip or a
// gnomonic atlas plate, with the coordinate grid, the ecliptic, a graduated
// rim, a magnitude key, a compass rose and a title. All the lettering is
// stroked with a small vector font (../starchart/font.ts): no system font.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side. Wider or taller canvases get a wider chart (or
// the hemispheres side by side or stacked), never a stretched one.

import type { Rng } from '../random'
import type { Align } from '../starchart/font'
import type { Region } from '../starchart/proj'
import type { Sky, Vec } from '../starchart/sky'
import type { Series } from '../types'
import { chance, int, pick, range, stream, weighted } from '../random'
import { textPath, textWidth } from '../starchart/font'
import { equirect, gnomonic, outline, polar } from '../starchart/proj'
import { buildSky, DEC_CELLS, fromRaDec, inventName, makeNoise3, milkyDensity, RA_CELLS, slerp } from '../starchart/sky'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code. Never reorder: it re-rolls
// the whole edition.
// ---------------------------------------------------------------------------

const TRAITS = {
  Style: [['Engraved Atlas', 28], ['Navy Chart', 24], ['Blueprint', 18], ['Gilt Night', 14], ['Rubric Print', 16]],
  Projection: [['Planisphere', 32], ['Twin Hemispheres', 20], ['Equatorial Strip', 22], ['Atlas Plate', 26]],
  Sky: [['Sparse', 25], ['Rich', 45], ['Galactic', 30]],
  Figures: [['Spanning Trees', 42], ['Chains', 33], ['Bordered', 25]],
  Ornament: [['Compass Rose', 40], ['Graduated Border', 35], ['Plain', 25]],
} as const satisfies Record<string, ReadonlyArray<readonly [string, number]>>

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

/** Pure function of the hash, computed before (and without) any rendering. */
function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Style: weighted(r, TRAITS.Style),
    Projection: weighted(r, TRAITS.Projection),
    Sky: weighted(r, TRAITS.Sky),
    Figures: weighted(r, TRAITS.Figures),
    Ornament: weighted(r, TRAITS.Ornament),
  }
}

// ---------------------------------------------------------------------------
// Palettes (original): an engraved plate on aged paper, a modern navy chart,
// a blueprint, gold on black, and a light printed atlas with red figures.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

interface Palette {
  /** Sheet outside the charts, and the chart ground. */
  sheet: string
  ground: string
  /** Grid, rim and lettering. */
  ink: string
  star: string
  figure: string
  accent: string
  bound: string
  dso: string
  milky: RGB
  milkyAlpha: number
  dark: boolean
}

const PAL: Record<Features['Style'], Palette> = {
  'Engraved Atlas': { sheet: '#e3d3b0', ground: '#ecdfc2', ink: '#2e2318', star: '#1f170f', figure: '#3d2e20', accent: '#8e2f1a', bound: '#6e5638', dso: '#5b3b22', milky: [120, 86, 44], milkyAlpha: 0.24, dark: false },
  'Navy Chart': { sheet: '#0a1428', ground: '#0f1d3a', ink: '#bfcde6', star: '#f5f8ff', figure: '#7da5dc', accent: '#e4b45c', bound: '#56729f', dso: '#d98fae', milky: [150, 182, 232], milkyAlpha: 0.34, dark: true },
  'Blueprint': { sheet: '#1a4c88', ground: '#1f5698', ink: '#e6efff', star: '#ffffff', figure: '#d9e8ff', accent: '#ffe7a3', bound: '#a6c3ec', dso: '#ffffff', milky: [232, 242, 255], milkyAlpha: 0.22, dark: true },
  'Gilt Night': { sheet: '#0b0b0c', ground: '#121315', ink: '#c9a85e', star: '#f7eed6', figure: '#b8954c', accent: '#cf6a48', bound: '#7a6537', dso: '#c9a85e', milky: [218, 194, 146], milkyAlpha: 0.24, dark: true },
  'Rubric Print': { sheet: '#ebe7dd', ground: '#f8f6f0', ink: '#29323d', star: '#131518', figure: '#b5392b', accent: '#2b6e9c', bound: '#8b9097', dso: '#b5392b', milky: [118, 146, 186], milkyAlpha: 0.32, dark: false },
}

const SKY: Record<Features['Sky'], { mLim: number, band: number, milky: number, dso: number }> = {
  Sparse: { mLim: 5.1, band: 0.15, milky: 0.6, dso: 26 },
  Rich: { mLim: 6, band: 0.3, milky: 0.85, dso: 42 },
  Galactic: { mLim: 6.3, band: 0.55, milky: 1.15, dso: 66 },
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// Layout: the charts on the sheet, and free slots for the ornaments.
// ---------------------------------------------------------------------------

interface Chart {
  rg: Region
  /** Graduated rim (circles) or labelled margin (rects). */
  rimLabels: boolean
  south: boolean
}

interface Layout {
  charts: Chart[]
  /** Neatline inset from the canvas edge, and border band width. */
  m: number
  band: number
  /** True when the charts cover the inner frame (ornaments go on top in boxes). */
  full: boolean
  info: string
  /** Rotation of the hour circles on the polar charts. */
  rot: number
}

const RIM = 0.05

/** Largest outer radius for two circles in opposite corners of a w x h box with gap g. */
function diagonalRadius(w: number, h: number, g: number): number {
  let lo = 0
  let hi = Math.min(w, h) / 2
  for (let i = 0; i < 30; i++) {
    const r = (lo + hi) / 2
    const d = Math.hypot(w - 2 * r, h - 2 * r)
    if (d >= 2 * r + g)
      lo = r
    else
      hi = r
  }
  return lo
}

function fmtDec(d: number): string {
  const v = Math.round(d)
  return `${v >= 0 ? '+' : '-'}${Math.abs(v)}°`
}

function layout(f: Features, sky: Sky, r: Rng, W: number, H: number, S: number): Layout {
  const m = 0.03 * S
  const band = f.Ornament === 'Graduated Border' ? 0.014 * S : 0.006 * S
  const fx0 = m + band
  const fy0 = m + band
  const fx1 = W - m - band
  const fy1 = H - m - band
  const rot = r() * TAU
  const north = chance(r, 0.7)
  const charts: Chart[] = []
  let full = false
  let info = ''

  if (f.Projection === 'Planisphere') {
    const limit = (90 + range(r, 28, 45)) * DEG
    const R = S * (0.5 - 0.03) - band - RIM * S - 0.02 * S
    charts.push({ rg: polar(W / 2, H / 2, R, north ? 1 : -1, limit, rot, false), rimLabels: true, south: !north })
    const lim = 90 - limit / DEG
    info = north ? `DECL. +90° TO ${fmtDec(lim)}` : `DECL. -90° TO ${fmtDec(-lim)}`
  }
  else if (f.Projection === 'Twin Hemispheres') {
    const g = 0.03 * S
    const w = fx1 - fx0
    const h = fy1 - fy0
    const title = 0.11 * S
    const side = Math.min((w - g) / 4, (h - title) / 2)
    const stack = Math.min((w) / 2, (h - g - title) / 4)
    // corner to corner only on near-square sheets: elsewhere it degenerates into a row with no room for the title
    const diag = w / h > 0.75 && w / h < 1.34 ? diagonalRadius(w, h, g) : 0
    const limit = 92 * DEG
    const best = Math.max(side, stack, diag)
    const R = best - RIM * S
    let c1: [number, number]
    let c2: [number, number]
    if (best === diag) {
      c1 = [fx0 + diag, fy0 + diag]
      c2 = [fx1 - diag, fy1 - diag]
    }
    else if (best === side) {
      const cy = (fy0 + fy1) / 2 + title / 4
      c1 = [W / 2 - side - g / 2, cy]
      c2 = [W / 2 + side + g / 2, cy]
    }
    else {
      c1 = [W / 2, H / 2 - stack - g / 2 + title / 4]
      c2 = [W / 2, H / 2 + stack + g / 2 + title / 4]
    }
    charts.push({ rg: polar(c1[0], c1[1], R, 1, limit, rot, true), rimLabels: true, south: false })
    charts.push({ rg: polar(c2[0], c2[1], R, -1, limit, rot, true), rimLabels: true, south: true })
    info = 'NORTHERN · SOUTHERN HEMISPHERE'
  }
  else if (f.Projection === 'Equatorial Strip') {
    const lab = 0.045 * S
    let x0 = fx0 + lab
    let x1 = fx1 - lab
    let y0 = fy0 + lab
    let y1 = fy1 - lab
    const span = range(r, 50, 64) * DEG
    let k = (y1 - y0) / (2 * span)
    if ((x1 - x0) / k > TAU) {
      k = (x1 - x0) / TAU
      const hh = Math.min(y1 - y0, Math.PI * k * 0.9)
      y0 = (fy0 + fy1) / 2 - hh / 2
      y1 = y0 + hh
    }
    const raSpan = (x1 - x0) / k
    if (raSpan > TAU) {
      const ww = TAU * k
      x0 = W / 2 - ww / 2
      x1 = x0 + ww
    }
    const ra0 = Math.round(r() * 24) * 15 * DEG
    charts.push({ rg: equirect(x0, y0, x1, y1, ra0, k), rimLabels: true, south: false })
    full = true
    const d = Math.min(90, (y1 - y0) / 2 / k / DEG)
    info = `DECL. ${fmtDec(-d)} TO ${fmtDec(d)}`
  }
  else {
    const lab = 0.045 * S
    const x0 = fx0 + lab
    const x1 = fx1 - lab
    const y0 = fy0 + lab
    const y1 = fy1 - lab
    // centre the plate on a constellation with a real figure
    const cands = sky.cons.filter(c => c.stars.length >= 5)
    const con = cands.length ? pick(r, cands) : sky.cons[0]
    let v: Vec = [0, 0, 0]
    for (const i of con.stars) {
      v = [v[0] + sky.x[i], v[1] + sky.y[i], v[2] + sky.z[i]]
    }
    const l = Math.hypot(v[0], v[1], v[2]) || 1
    v = [v[0] / l, v[1] / l, v[2] / l]
    let dec0 = Math.asin(v[2])
    dec0 = Math.max(-75 * DEG, Math.min(75 * DEG, dec0))
    const ra0 = Math.atan2(v[1], v[0])
    const half = range(r, 21, 30) * DEG
    const k = Math.min(x1 - x0, y1 - y0) / 2 / Math.tan(half)
    charts.push({ rg: gnomonic(x0, y0, x1, y1, ra0, dec0, k), rimLabels: true, south: false })
    full = true
    info = `CENTRE ${Math.floor(((ra0 / DEG + 360) % 360) / 15)}h ${fmtDec(dec0 / DEG)}`
  }
  return { charts, m, band, full, info, rot }
}

// ---------------------------------------------------------------------------
// Drawing helpers.
// ---------------------------------------------------------------------------

/** Add a sphere polyline to the path, breaking it off the chart or across seams. */
function polyPath(g: CanvasRenderingContext2D, rg: Region, pts: Vec[]) {
  let prev: [number, number] | null = null
  for (const v of pts) {
    const p = rg.fwd(v)
    if (p && prev && Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) < rg.jump)
      g.lineTo(p[0], p[1])
    else if (p)
      g.moveTo(p[0], p[1])
    prev = p
  }
}

function inside(rg: Region, x: number, y: number, pad = 0): boolean {
  if (rg.kind === 'circle')
    return Math.hypot(x - rg.cx, y - rg.cy) <= rg.r - pad
  return x >= rg.x0 + pad && x <= rg.x1 - pad && y >= rg.y0 + pad && y <= rg.y1 - pad
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: Align = 'left', track = 0) {
  g.lineWidth = Math.max(0.5, size * 0.11)
  g.beginPath()
  textPath(g, text, x, y, size, align, track)
  g.stroke()
}

const GREEK = ['α', 'β', 'γ', 'δ', 'ε']

function roman(n: number): string {
  const t: [number, string][] = [[40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  for (const [v, c] of t) {
    while (n >= v) {
      s += c
      n -= v
    }
  }
  return s
}

function mixHex(a: string, b: RGB, t: number): string {
  const n = Number.parseInt(a.slice(1), 16)
  const r0 = (n >> 16) & 255
  const g0 = (n >> 8) & 255
  const b0 = n & 255
  const c = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${c(r0, b[0])},${c(g0, b[1])},${c(b0, b[2])})`
}

interface Ctx {
  g: CanvasRenderingContext2D
  S: number
  f: Features
  pal: Palette
  sky: Sky
  /** Star size factor: atlas plates are zoomed in. */
  zoom: number
}

/** Star disc radius for magnitude m. */
function starRadius(c: Ctx, m: number): number {
  const ref = c.sky.mLim + 0.4
  const t = Math.max(0, Math.min(1, (ref - m) / (ref + 1.6)))
  return c.S * (0.00055 + 0.0058 * t ** 1.7) * c.zoom
}

/** A many-pointed engraved star for the brightest stars of the antique plates. */
function engravedStar(g: CanvasRenderingContext2D, x: number, y: number, rad: number, points: number) {
  for (let i = 0; i <= points * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / points
    const rr = i % 2 ? rad * 0.42 : rad * 1.55
    if (i === 0)
      g.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
    else
      g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
  }
  g.closePath()
}

function drawStarSymbol(c: Ctx, x: number, y: number, m: number, tint: number) {
  const { g, pal } = c
  const rad = starRadius(c, m)
  if (c.f.Style === 'Engraved Atlas' && m < 2.3) {
    g.fillStyle = pal.ground
    g.beginPath()
    g.arc(x, y, rad * 1.9, 0, TAU)
    g.fill()
    g.fillStyle = pal.star
    g.beginPath()
    engravedStar(g, x, y, rad, m < 0.8 ? 8 : 6)
    g.fill()
    return
  }
  if (pal.dark && m < 1.8) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad * 4.5)
    gr.addColorStop(0, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.beginPath()
    g.arc(x, y, rad * 4.5, 0, TAU)
    g.fill()
  }
  g.fillStyle = pal.ground
  g.beginPath()
  g.arc(x, y, rad + c.S * 0.0011, 0, TAU)
  g.fill()
  if (pal.dark && m < 3.6) {
    const col: RGB = tint < 0.5 ? [170, 200, 255] : [255, 205, 150]
    g.fillStyle = mixHex(pal.star, col, Math.abs(tint - 0.5) * 0.9)
  }
  else {
    g.fillStyle = pal.star
  }
  g.beginPath()
  g.arc(x, y, rad, 0, TAU)
  g.fill()
}

// ---------------------------------------------------------------------------
// Layers inside one chart (clipped to its outline).
// ---------------------------------------------------------------------------

function drawGrid(c: Ctx, rg: Region, plate: boolean) {
  const { g, S, pal } = c
  const raStep = plate ? 7.5 : 15
  const decStep = plate ? 5 : 10
  g.strokeStyle = pal.ink
  g.lineWidth = S * 0.0008
  g.globalAlpha = pal.dark ? 0.32 : 0.42
  g.beginPath()
  for (let ra = 0; ra < 360; ra += raStep) {
    const major = ra % 90 === 0
    const lim = major || plate ? 89 : 80
    const pts: Vec[] = []
    for (let d = -lim; d <= lim; d += 2)
      pts.push(fromRaDec(ra * DEG, d * DEG))
    polyPath(g, rg, pts)
  }
  for (let d = -80; d <= 80; d += decStep) {
    if (d === 0)
      continue
    const pts: Vec[] = []
    for (let ra = 0; ra <= 360; ra += 2)
      pts.push(fromRaDec(ra * DEG, d * DEG))
    polyPath(g, rg, pts)
  }
  g.stroke()
  // the celestial equator, heavier
  g.globalAlpha = pal.dark ? 0.6 : 0.75
  g.lineWidth = S * 0.0016
  g.beginPath()
  const eq: Vec[] = []
  for (let ra = 0; ra <= 360; ra += 2)
    eq.push(fromRaDec(ra * DEG, 0))
  polyPath(g, rg, eq)
  g.stroke()
  g.globalAlpha = 1
}

/** The ecliptic: a great circle tilted 23.44 degrees, dashed, with a tick every 10 degrees. */
function drawEcliptic(c: Ctx, rg: Region) {
  const { g, S, pal } = c
  const eps = 23.44 * DEG
  const at = (lon: number): Vec => {
    const x = Math.cos(lon)
    const y = Math.sin(lon) * Math.cos(eps)
    const z = Math.sin(lon) * Math.sin(eps)
    return [x, y, z]
  }
  const pts: Vec[] = []
  for (let l = 0; l <= 360; l += 1.5)
    pts.push(at(l * DEG))
  g.strokeStyle = pal.accent
  g.globalAlpha = 0.85
  g.lineWidth = S * 0.0014
  g.setLineDash([S * 0.012, S * 0.006])
  g.beginPath()
  polyPath(g, rg, pts)
  g.stroke()
  g.setLineDash([])
  g.beginPath()
  for (let l = 0; l < 360; l += 10) {
    const p = rg.fwd(at(l * DEG))
    const q = rg.fwd(at((l + 0.5) * DEG))
    if (!p || !q)
      continue
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const dl = Math.hypot(dx, dy) || 1
    const len = S * (l % 30 === 0 ? 0.007 : 0.004)
    g.moveTo(p[0] - dy / dl * len, p[1] + dx / dl * len)
    g.lineTo(p[0] + dy / dl * len, p[1] - dx / dl * len)
  }
  g.stroke()
  g.globalAlpha = 1
}

/** Stepped constellation boundaries along hour circles and parallels. */
function drawBoundaries(c: Ctx, rg: Region) {
  const { g, S, pal, sky } = c
  const raW = TAU / RA_CELLS
  const decH = Math.PI / DEC_CELLS
  g.strokeStyle = pal.bound
  g.globalAlpha = 0.8
  g.lineWidth = S * 0.0011
  g.setLineDash([S * 0.005, S * 0.0035])
  g.beginPath()
  for (let j = 0; j < DEC_CELLS; j++) {
    const d0 = -Math.PI / 2 + j * decH
    for (let i = 0; i < RA_CELLS; i++) {
      const o = sky.owner[j * RA_CELLS + i]
      const ra1 = (i + 1) * raW
      if (o !== sky.owner[j * RA_CELLS + (i + 1) % RA_CELLS] && j > 0 && j < DEC_CELLS - 1)
        polyPath(g, rg, [fromRaDec(ra1, d0), fromRaDec(ra1, d0 + decH / 2), fromRaDec(ra1, d0 + decH)])
      if (j < DEC_CELLS - 1 && o !== sky.owner[(j + 1) * RA_CELLS + i]) {
        const pts: Vec[] = []
        for (let s = 0; s <= 4; s++)
          pts.push(fromRaDec(i * raW + raW * s / 4, d0 + decH))
        polyPath(g, rg, pts)
      }
    }
  }
  g.stroke()
  g.setLineDash([])
  g.globalAlpha = 1
}

function drawFigures(c: Ctx, rg: Region) {
  const { g, S, pal, sky } = c
  g.strokeStyle = pal.figure
  g.globalAlpha = pal.dark ? 0.85 : 0.9
  g.lineWidth = S * 0.0017 * Math.sqrt(c.zoom)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  for (const con of sky.cons) {
    for (const [a, b] of con.edges) {
      const va: Vec = [sky.x[a], sky.y[a], sky.z[a]]
      const vb: Vec = [sky.x[b], sky.y[b], sky.z[b]]
      polyPath(g, rg, slerp(va, vb, 8))
    }
  }
  g.stroke()
  g.globalAlpha = 1
}

function drawDso(c: Ctx, rg: Region, boxes: Box[]) {
  const { g, S, pal, sky } = c
  g.strokeStyle = pal.dso
  g.fillStyle = pal.dso
  g.lineWidth = S * 0.0011
  for (const d of sky.dsos) {
    const p = rg.fwd(d.v)
    if (!p || !inside(rg, p[0], p[1]))
      continue
    const [x, y] = p
    const s = S * (0.0045 + d.size * 0.22) * Math.sqrt(c.zoom)
    g.globalAlpha = 0.9
    g.beginPath()
    if (d.kind === 'open') {
      g.setLineDash([s * 0.35, s * 0.3])
      g.arc(x, y, s, 0, TAU)
      g.stroke()
      g.setLineDash([])
    }
    else if (d.kind === 'globular') {
      g.arc(x, y, s * 0.8, 0, TAU)
      g.moveTo(x - s * 0.8, y)
      g.lineTo(x + s * 0.8, y)
      g.moveTo(x, y - s * 0.8)
      g.lineTo(x, y + s * 0.8)
      g.stroke()
    }
    else if (d.kind === 'galaxy') {
      g.ellipse(x, y, s * 1.1, s * 1.1 * d.ratio * 0.6, d.pa, 0, TAU)
      g.globalAlpha = 0.25
      g.fill()
      g.globalAlpha = 0.9
      g.stroke()
    }
    else if (d.kind === 'nebula') {
      if (c.f.Style === 'Engraved Atlas') {
        // a soft engraved cloud
        const gr = g.createRadialGradient(x, y, 0, x, y, s * 1.6)
        gr.addColorStop(0, 'rgba(70,45,25,0.35)')
        gr.addColorStop(1, 'rgba(70,45,25,0)')
        g.fillStyle = gr
        g.arc(x, y, s * 1.6, 0, TAU)
        g.fill()
        g.fillStyle = pal.dso
      }
      else {
        g.rect(x - s, y - s * 0.8, s * 2, s * 1.6)
        g.globalAlpha = 0.18
        g.fill()
        g.globalAlpha = 0.9
        g.stroke()
      }
    }
    else {
      g.arc(x, y, s * 0.45, 0, TAU)
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2
        g.moveTo(x + Math.cos(a) * s * 0.45, y + Math.sin(a) * s * 0.45)
        g.lineTo(x + Math.cos(a) * s * 0.9, y + Math.sin(a) * s * 0.9)
      }
      g.stroke()
    }
    const t = `${sky.catalogue}${d.num}`
    const size = S * 0.0062
    const bx: Box = [x + s * 1.2, y - size, x + s * 1.2 + textWidth(t, size), y + size]
    if (!hits(boxes, bx) && inside(rg, bx[2], y)) {
      boxes.push(bx)
      g.globalAlpha = 0.75
      label(g, t, bx[0], y, size)
    }
  }
  g.globalAlpha = 1
}

type Box = [number, number, number, number]
function hits(boxes: Box[], b: Box): boolean {
  for (const o of boxes) {
    if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
      return true
  }
  return false
}

function drawStars(c: Ctx, rg: Region): [number, number, number][] {
  const { g, S, pal, sky } = c
  // faint stars in batched paths by size bucket (halo first, then disc)
  const buckets = new Map<number, number[]>()
  const bright: [number, number, number, number][] = []
  for (let i = 0; i < sky.n; i++) {
    const p = rg.fwd([sky.x[i], sky.y[i], sky.z[i]])
    if (!p || !inside(rg, p[0], p[1], -S * 0.01))
      continue
    const m = sky.mag[i]
    if (m < 3.6) {
      bright.push([p[0], p[1], m, sky.tint[i]])
      continue
    }
    const key = Math.round(starRadius(c, m) / S * 8000)
    let list = buckets.get(key)
    if (!list)
      buckets.set(key, list = [])
    list.push(p[0], p[1])
  }
  // on the light plates a thin paper ring cuts the lines under each star; on
  // the dark ones it would punch holes in the Milky Way, so it is left out
  if (!pal.dark) {
    const halo = S * 0.0007
    g.fillStyle = pal.ground
    g.beginPath()
    for (const [key, pts] of buckets) {
      const rad = key / 8000 * S + halo
      for (let i = 0; i < pts.length; i += 2) {
        g.moveTo(pts[i] + rad, pts[i + 1])
        g.arc(pts[i], pts[i + 1], rad, 0, TAU)
      }
    }
    g.fill()
  }
  g.fillStyle = pal.star
  for (const [key, pts] of buckets) {
    const rad = Math.max(key / 8000 * S, S * 0.0004)
    g.globalAlpha = pal.dark ? Math.min(1, 0.55 + key / 30) : 1
    g.beginPath()
    for (let i = 0; i < pts.length; i += 2) {
      g.moveTo(pts[i] + rad, pts[i + 1])
      g.arc(pts[i], pts[i + 1], rad, 0, TAU)
    }
    g.fill()
  }
  g.globalAlpha = 1
  bright.sort((a, b) => b[2] - a[2])
  for (const [x, y, m, t] of bright)
    drawStarSymbol(c, x, y, m, t)
  return bright.map(([x, y, m]) => [x, y, m])
}

function drawNames(c: Ctx, rg: Region, boxes: Box[]) {
  const { g, S, pal, sky } = c
  const size = S * 0.0105 * Math.sqrt(c.zoom)
  const gsize = S * 0.0078 * Math.sqrt(c.zoom)
  g.strokeStyle = pal.ink
  for (const con of sky.cons) {
    const pts: [number, number, number][] = []
    for (const i of con.stars) {
      const p = rg.fwd([sky.x[i], sky.y[i], sky.z[i]])
      if (p && inside(rg, p[0], p[1]))
        pts.push([p[0], p[1], i])
    }
    if (pts.length < 2)
      continue
    // Bayer-style letters on the three brightest stars of the figure
    g.globalAlpha = 0.8
    for (let k = 0; k < Math.min(3, pts.length); k++) {
      const [x, y, i] = pts[k]
      const rad = starRadius(c, sky.mag[i])
      const gx = x + rad + S * 0.003
      const gy = y - rad - S * 0.002
      const bx: Box = [gx, gy - gsize * 0.7, gx + gsize * 0.7, gy + gsize * 0.9]
      if (!hits(boxes, bx) && inside(rg, gx, gy)) {
        boxes.push(bx)
        label(g, GREEK[k], gx, gy, gsize)
      }
    }
    // the name, under the figure's centroid
    let sx = 0
    let sy = 0
    let maxY = -Infinity
    for (const [x, y] of pts) {
      sx += x
      sy += y
      maxY = Math.max(maxY, y)
    }
    sx /= pts.length
    sy /= pts.length
    const w = textWidth(con.name, size, 1.6)
    const below = Math.min(maxY + size * 2.2, sy + S * 0.04)
    for (const [ox, oy] of [[sx, below], [sx, sy], [sx, sy - size * 3], [sx, sy + size * 3], [sx - w * 0.6, sy], [sx + w * 0.6, sy]]) {
      const bx: Box = [ox - w / 2 - size * 0.3, oy - size, ox + w / 2 + size * 0.3, oy + size]
      if (hits(boxes, bx) || !inside(rg, bx[0], oy, S * 0.01) || !inside(rg, bx[2], oy, S * 0.01))
        continue
      boxes.push(bx)
      g.globalAlpha = pal.dark ? 0.85 : 0.9
      label(g, con.name, ox, oy, size, 'center', 1.6)
      break
    }
  }
  g.globalAlpha = 1
}

/** The Milky Way, painted once on a coarse raster (fixed resolution per short side) and scaled up smoothly. */
function drawMilky(c: Ctx, charts: Chart[], W: number, H: number, density: (v: Vec) => number) {
  const { g, S, pal } = c
  // about 36k cells whatever the aspect ratio
  const L = Math.min(190, Math.sqrt(36000 * S * S / (W * H)))
  const lw = Math.max(2, Math.round(L * W / S))
  const lh = Math.max(2, Math.round(L * H / S))
  const off = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(lw, lh) : Object.assign(document.createElement('canvas'), { width: lw, height: lh })
  const og = off.getContext('2d') as CanvasRenderingContext2D
  const img = og.createImageData(lw, lh)
  const data = img.data
  const sx = W / lw
  const sy = H / lh
  for (let j = 0; j < lh; j++) {
    const py = (j + 0.5) * sy
    for (let i = 0; i < lw; i++) {
      const px = (i + 0.5) * sx
      let v: Vec | null = null
      for (const ch of charts) {
        if (inside(ch.rg, px, py, -S * 0.02)) {
          v = ch.rg.inv(px, py)
          break
        }
      }
      if (!v)
        continue
      const d = density(v)
      const o = (j * lw + i) * 4
      data[o] = pal.milky[0]
      data[o + 1] = pal.milky[1]
      data[o + 2] = pal.milky[2]
      data[o + 3] = Math.round(255 * Math.min(1, d * pal.milkyAlpha * 1.6))
    }
  }
  og.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.imageSmoothingQuality = 'high'
  g.drawImage(off as CanvasImageSource, 0, 0, W, H)
}

/** Engraver's stipple over the Milky Way: dots kept with the probability of the local brightness. */
function stippleMilky(c: Ctx, charts: Chart[], W: number, H: number, density: (v: Vec) => number, r: Rng) {
  const { g, S, pal } = c
  const n = Math.round(24000 * W * H / (S * S))
  g.fillStyle = pal.star
  g.globalAlpha = 0.55
  g.beginPath()
  const rad = S * 0.00065
  for (let i = 0; i < n; i++) {
    const px = r() * W
    const py = r() * H
    const keep = r()
    for (const ch of charts) {
      if (!inside(ch.rg, px, py))
        continue
      const v = ch.rg.inv(px, py)
      if (v && keep < density(v) * 1.2) {
        g.moveTo(px + rad, py)
        g.arc(px, py, rad, 0, TAU)
      }
      break
    }
  }
  g.fill()
  g.globalAlpha = 1
}

// ---------------------------------------------------------------------------
// Rims, grid labels and the sheet furniture.
// ---------------------------------------------------------------------------

function drawRim(c: Ctx, ch: Chart, rot: number) {
  const { g, S, pal } = c
  const rg = ch.rg
  const R = rg.r
  const w = S * 0.016
  const sign = ch.south ? -1 : 1
  g.strokeStyle = pal.ink
  g.lineWidth = S * 0.0016
  g.beginPath()
  g.arc(rg.cx, rg.cy, R, 0, TAU)
  g.stroke()
  g.lineWidth = S * 0.0011
  g.beginPath()
  g.arc(rg.cx, rg.cy, R + w, 0, TAU)
  g.stroke()
  // graduation: every degree, longer every 5, full width every hour (15)
  g.lineWidth = S * 0.0007
  g.beginPath()
  for (let d = 0; d < 360; d++) {
    const a = d * DEG + rot
    const len = d % 15 === 0 ? w : d % 5 === 0 ? w * 0.6 : w * 0.3
    const cs = Math.cos(a)
    const sn = -sign * Math.sin(a)
    g.moveTo(rg.cx + cs * R, rg.cy + sn * R)
    g.lineTo(rg.cx + cs * (R + len), rg.cy + sn * (R + len))
  }
  g.stroke()
  // hour labels outside the rim
  const size = S * 0.0115
  for (let h = 0; h < 24; h++) {
    const a = h * 15 * DEG + rot
    const x = rg.cx + Math.cos(a) * (R + w + size * 1.5)
    const y = rg.cy - sign * Math.sin(a) * (R + w + size * 1.5)
    label(g, `${h}h`, x, y, size, 'center')
  }
}

/** Label meridians and parallels where they cross the edges of a rectangular chart. */
function drawEdgeLabels(c: Ctx, rg: Region, plate: boolean) {
  const { g, S, pal } = c
  const size = S * 0.011
  const tick = S * 0.008
  g.strokeStyle = pal.ink
  g.lineWidth = S * 0.0016
  g.strokeRect(rg.x0, rg.y0, rg.x1 - rg.x0, rg.y1 - rg.y0)
  const used: Box[] = []
  const put = (t: string, x: number, y: number, align: Align) => {
    const w = textWidth(t, size)
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
    const b: Box = [x0 - size * 0.4, y - size, x0 + w + size * 0.4, y + size]
    if (hits(used, b))
      return
    used.push(b)
    label(g, t, x, y, size, align)
  }
  const cross = (pts: Vec[], test: (p: [number, number]) => number, emit: (p: [number, number]) => void) => {
    let prev: [number, number] | null = null
    for (const v of pts) {
      const p = rg.fwd(v)
      if (p && prev && Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) < rg.jump) {
        const a = test(prev)
        const b = test(p)
        if (a * b < 0) {
          const t = a / (a - b)
          emit([prev[0] + (p[0] - prev[0]) * t, prev[1] + (p[1] - prev[1]) * t])
        }
      }
      prev = p
    }
  }
  const raStep = plate ? 7.5 : 15
  g.beginPath()
  const ticks: [number, number, number, number][] = []
  for (let ra = 0; ra < 360; ra += raStep) {
    const pts: Vec[] = []
    for (let d = -89; d <= 89; d += 0.5)
      pts.push(fromRaDec(ra * DEG, d * DEG))
    const h = Math.floor(ra / 15)
    const mm = Math.round((ra / 15 - h) * 60)
    const t = mm ? `${h}h${mm}` : `${h}h`
    cross(pts, p => p[1] - rg.y0, (p) => {
      if (p[0] < rg.x0 || p[0] > rg.x1)
        return
      ticks.push([p[0], rg.y0, p[0], rg.y0 - tick])
      put(t, p[0], rg.y0 - tick - size, 'center')
    })
    cross(pts, p => p[1] - rg.y1, (p) => {
      if (p[0] < rg.x0 || p[0] > rg.x1)
        return
      ticks.push([p[0], rg.y1, p[0], rg.y1 + tick])
      put(t, p[0], rg.y1 + tick + size, 'center')
    })
  }
  const decStep = plate ? 5 : 10
  for (let d = -80; d <= 80; d += decStep) {
    const pts: Vec[] = []
    for (let ra = 0; ra <= 360; ra += 0.5)
      pts.push(fromRaDec(ra * DEG, d * DEG))
    const t = fmtDec(d)
    cross(pts, p => p[0] - rg.x0, (p) => {
      if (p[1] < rg.y0 || p[1] > rg.y1)
        return
      ticks.push([rg.x0, p[1], rg.x0 - tick, p[1]])
      put(t, rg.x0 - tick - size * 0.4, p[1], 'right')
    })
    cross(pts, p => p[0] - rg.x1, (p) => {
      if (p[1] < rg.y0 || p[1] > rg.y1)
        return
      ticks.push([rg.x1, p[1], rg.x1 + tick, p[1]])
      put(t, rg.x1 + tick + size * 0.4, p[1], 'left')
    })
  }
  g.lineWidth = S * 0.0011
  g.beginPath()
  for (const [a, b, cc, d] of ticks) {
    g.moveTo(a, b)
    g.lineTo(cc, d)
  }
  g.stroke()
}

function drawFrame(c: Ctx, lay: Layout, W: number, H: number) {
  const { g, S, pal } = c
  const { m, band } = lay
  g.strokeStyle = pal.ink
  g.lineWidth = S * 0.0022
  g.strokeRect(m, m, W - 2 * m, H - 2 * m)
  g.lineWidth = S * 0.0009
  g.strokeRect(m + band, m + band, W - 2 * (m + band), H - 2 * (m + band))
  if (c.f.Ornament !== 'Graduated Border')
    return
  // alternating bars, as on the neatline of a map
  const seg = S * 0.025
  g.fillStyle = pal.ink
  g.beginPath()
  const half = band / 2
  const run = (x0: number, y0: number, len: number, horiz: boolean) => {
    const n = Math.max(1, Math.round(len / seg))
    const s = len / n
    for (let i = 0; i < n; i += 2) {
      if (horiz)
        g.rect(x0 + i * s, y0, s, half)
      else
        g.rect(x0, y0 + i * s, half, s)
    }
  }
  run(m + band, m, W - 2 * (m + band), true)
  run(m + band, H - m - half, W - 2 * (m + band), true)
  run(m, m + band, H - 2 * (m + band), false)
  run(W - m - half, m + band, H - 2 * (m + band), false)
  g.fill()
  g.lineWidth = S * 0.0006
  g.beginPath()
  g.moveTo(m, m + half)
  g.lineTo(W - m, m + half)
  g.moveTo(m, H - m - half)
  g.lineTo(W - m, H - m - half)
  g.moveTo(m + half, m)
  g.lineTo(m + half, H - m)
  g.moveTo(W - m - half, m)
  g.lineTo(W - m - half, H - m)
  g.stroke()
}

/** A sixteen-point compass rose. On a sky chart east is on the left. */
function drawRose(c: Ctx, x: number, y: number, rr: number) {
  const { g, S, pal } = c
  g.strokeStyle = pal.ink
  g.lineWidth = S * 0.0009
  g.beginPath()
  g.arc(x, y, rr * 0.86, 0, TAU)
  g.moveTo(x + rr * 0.8, y)
  g.arc(x, y, rr * 0.8, 0, TAU)
  g.moveTo(x + rr * 0.32, y)
  g.arc(x, y, rr * 0.32, 0, TAU)
  g.stroke()
  g.beginPath()
  for (let d = 0; d < 360; d += 5) {
    const a = d * DEG
    const l = d % 45 === 0 ? 0.74 : 0.77
    g.moveTo(x + Math.cos(a) * rr * l, y + Math.sin(a) * rr * l)
    g.lineTo(x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.8)
  }
  g.stroke()
  const spike = (a: number, len: number, wid: number) => {
    const tx = x + Math.cos(a) * len
    const ty = y + Math.sin(a) * len
    const lx = x + Math.cos(a - Math.PI / 2) * wid
    const ly = y + Math.sin(a - Math.PI / 2) * wid
    const rx = x + Math.cos(a + Math.PI / 2) * wid
    const ry = y + Math.sin(a + Math.PI / 2) * wid
    // one half filled with ink, the other with the ground: the classic shaded point
    g.fillStyle = pal.ink
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(tx, ty)
    g.lineTo(lx, ly)
    g.closePath()
    g.fill()
    g.fillStyle = pal.ground
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(tx, ty)
    g.lineTo(rx, ry)
    g.closePath()
    g.fill()
    g.stroke()
    g.beginPath()
    g.moveTo(lx, ly)
    g.lineTo(tx, ty)
    g.stroke()
  }
  for (let k = 0; k < 8; k++)
    spike(k * Math.PI / 4 + Math.PI / 8, rr * 0.42, rr * 0.05)
  for (let k = 0; k < 4; k++)
    spike(k * Math.PI / 2 + Math.PI / 4, rr * 0.6, rr * 0.08)
  for (let k = 0; k < 4; k++)
    spike(k * Math.PI / 2 - Math.PI / 2, rr * 0.98, rr * 0.11)
  const size = rr * 0.13
  label(g, 'N', x, y - rr * 1.13, size, 'center')
  label(g, 'S', x, y + rr * 1.13, size, 'center')
  label(g, 'E', x - rr * 1.13, y, size, 'center')
  label(g, 'W', x + rr * 1.13, y, size, 'center')
}

function drawLegend(c: Ctx, x: number, y: number, w: number, h: number) {
  const { g, S, pal } = c
  const size = S * 0.0085
  g.strokeStyle = pal.ink
  g.globalAlpha = 1
  label(g, 'MAGNITUDES', x + w / 2, y + size * 0.9, size, 'center', 1.5)
  const top = c.sky.mLim > 5.5 ? 6 : 5
  const n = top + 2
  const zoom = c.zoom
  c.zoom = 1
  for (let k = 0; k < n; k++) {
    const m = k - 1
    const cx = x + w * (k + 0.5) / n
    const cy = y + h * 0.5
    drawStarSymbol(c, cx, cy, m, 0.5)
    g.strokeStyle = pal.ink
    label(g, m < 0 ? '-1' : `${m}`, cx, y + h - size * 0.7, size * 0.9, 'center')
  }
  c.zoom = zoom
}

function drawTitle(c: Ctx, x: number, y: number, title: string, sub: string, info: string, k: number) {
  const { g, S, pal } = c
  const align: Align = 'center'
  const big = S * 0.02 * k
  const small = S * 0.0085 * Math.max(0.8, k)
  g.strokeStyle = pal.ink
  label(g, title, x, y + big * 0.5, big, align, 2.2)
  label(g, sub, x, y + big * 1.55, small, align, 1.8)
  label(g, info, x, y + big * 1.55 + small * 2.2, small, align, 1.2)
}

// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Style]
  const sp = SKY[f.Sky]
  const S = Math.min(W, H)
  const plate = f.Projection === 'Atlas Plate'

  // named streams, all created up front
  const skyR = stream(hash, 'sky')
  const figR = stream(hash, 'figures')
  const dsoR = stream(hash, 'dso')
  const nameR = stream(hash, 'names')
  const milkR = stream(hash, 'milky')
  const layR = stream(hash, 'layout')
  const paperR = stream(hash, 'paper')

  const sky = buildSky({ sky: skyR, figures: figR, dso: dsoR, names: nameR }, {
    mLim: sp.mLim + (plate ? 2 : 0),
    band: sp.band,
    dsoCount: sp.dso,
    figures: f.Figures,
  })
  const title = inventName(nameR)
  const plateNo = int(nameR, 1, 48)
  const density = milkyDensity(sky.galaxy, makeNoise3(milkR), sp.milky)
  const lay = layout(f, sky, layR, W, H, S)
  const c: Ctx = { g, S, f, pal, sky, zoom: plate ? 1.25 : 1 }

  g.save()
  g.globalAlpha = 1
  g.setLineDash([])
  g.fillStyle = pal.sheet
  g.fillRect(0, 0, W, H)
  paper(c, paperR, W, H)

  // chart grounds
  for (const ch of lay.charts) {
    g.fillStyle = pal.ground
    g.beginPath()
    outline(g, ch.rg)
    g.fill()
  }
  g.save()
  g.beginPath()
  for (const ch of lay.charts)
    outline(g, ch.rg)
  g.clip()
  drawMilky(c, lay.charts, W, H, density)
  if (f.Style === 'Engraved Atlas')
    stippleMilky(c, lay.charts, W, H, density, milkR)
  g.restore()

  const boxes: Box[] = []
  for (const ch of lay.charts) {
    const rg = ch.rg
    g.save()
    g.beginPath()
    outline(g, rg)
    g.clip()
    drawGrid(c, rg, plate)
    if (f.Figures === 'Bordered')
      drawBoundaries(c, rg)
    drawEcliptic(c, rg)
    drawFigures(c, rg)
    drawDso(c, rg, boxes)
    const bright = drawStars(c, rg)
    for (const [x, y, m] of bright) {
      const rad = starRadius(c, m)
      boxes.push([x - rad, y - rad, x + rad, y + rad])
    }
    drawNames(c, rg, boxes)
    g.restore()
    if (rg.kind === 'circle')
      drawRim(c, ch, lay.rot)
    else
      drawEdgeLabels(c, rg, plate)
  }

  drawFrame(c, lay, W, H)
  furniture(c, lay, W, H, title, plateNo)
  g.restore()
}

function paper(c: Ctx, r: Rng, W: number, H: number) {
  const { g, S, f } = c
  if (f.Style === 'Engraved Atlas') {
    // foxing and a darker rim, as on an old plate
    const n = 26
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = r() * H
      const rad = S * range(r, 0.004, 0.03)
      const gr = g.createRadialGradient(x, y, 0, x, y, rad)
      gr.addColorStop(0, 'rgba(140,96,48,0.16)')
      gr.addColorStop(1, 'rgba(140,96,48,0)')
      g.fillStyle = gr
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  }
  else if (f.Style === 'Blueprint') {
    g.strokeStyle = 'rgba(255,255,255,0.07)'
    g.lineWidth = S * 0.0006
    const step = S * 0.025
    g.beginPath()
    for (let x = W / 2 % step; x < W; x += step) {
      g.moveTo(x, 0)
      g.lineTo(x, H)
    }
    for (let y = H / 2 % step; y < H; y += step) {
      g.moveTo(0, y)
      g.lineTo(W, y)
    }
    g.stroke()
  }
  const gr = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(1, c.pal.dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,60,20,0.18)')
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
}

/** Title, magnitude key and compass rose, in free corners when there are any. */
function furniture(c: Ctx, lay: Layout, W: number, H: number, name: string, plateNo: number) {
  const { g, S, pal, f } = c
  const fx0 = lay.m + lay.band
  const fy0 = lay.m + lay.band
  const fx1 = W - fx0
  const fy1 = H - fy0
  const pad = S * 0.014
  const used: Box[] = []
  const circles = lay.charts.filter(ch => ch.rg.kind === 'circle').map(ch => [ch.rg.cx, ch.rg.cy, ch.rg.r + RIM * S] as const)
  const rect = lay.charts.find(ch => ch.rg.kind === 'rect')?.rg
  const free = (b: Box) => {
    if (hits(used, b))
      return false
    if (rect)
      return false
    for (const [cx, cy, rr] of circles) {
      const nx = Math.max(b[0], Math.min(cx, b[2]))
      const ny = Math.max(b[1], Math.min(cy, b[3]))
      if (Math.hypot(nx - cx, ny - cy) < rr)
        return false
    }
    return true
  }
  type Anchor = 'TL' | 'TR' | 'BL' | 'BR' | 'TC' | 'BC'
  const boxAt = (a: Anchor, w: number, h: number): Box => {
    // inside a rectangular chart, the ornaments sit on top of it
    const X0 = rect ? rect.x0 + pad * 0.6 : fx0 + pad
    const Y0 = rect ? rect.y0 + pad * 0.6 : fy0 + pad
    const X1 = rect ? rect.x1 - pad * 0.6 : fx1 - pad
    const Y1 = rect ? rect.y1 - pad * 0.6 : fy1 - pad
    const x = a.endsWith('L') ? X0 : a.endsWith('R') ? X1 - w : (X0 + X1) / 2 - w / 2
    const y = a.startsWith('T') ? Y0 : Y1 - h
    return [x, y, x + w, y + h]
  }
  const place = (prefs: Anchor[], w: number, h: number): { b: Box, boxed: boolean } | null => {
    for (const a of prefs) {
      const b = boxAt(a, w, h)
      if (free(b)) {
        used.push(b)
        return { b, boxed: false }
      }
    }
    for (const a of prefs) {
      const b = boxAt(a, w, h)
      if (!hits(used, b)) {
        used.push(b)
        return { b, boxed: true }
      }
    }
    return null
  }
  const panel = (b: Box) => {
    g.fillStyle = pal.ground
    g.globalAlpha = 0.94
    g.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1])
    g.globalAlpha = 1
    g.strokeStyle = pal.ink
    g.lineWidth = S * 0.0012
    g.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1])
    g.lineWidth = S * 0.0006
    const i = S * 0.004
    g.strokeRect(b[0] + i, b[1] + i, b[2] - b[0] - 2 * i, b[3] - b[1] - 2 * i)
  }

  // title
  const sub = `PLATE ${roman(plateNo)} · ${f.Projection.toUpperCase()}`
  const tprefs: Anchor[] = f.Projection === 'Twin Hemispheres' ? ['TC', 'TR', 'BL', 'TL'] : ['TR', 'TL', 'BL', 'BR']
  // the largest title that fits a free corner, else a boxed one on top
  const tsize = (k: number) => {
    const big = S * 0.02 * k
    const small = S * 0.0085 * Math.max(0.8, k)
    const w = Math.max(textWidth(name, big, 2.2), textWidth(sub, small, 1.8), textWidth(lay.info, small, 1.2)) + S * 0.03
    return [w, big * 1.55 + small * 3.4 + S * 0.016, k] as const
  }
  let tdim = tsize(1)
  if (!rect) {
    for (const k of [1, 0.85, 0.72, 0.62]) {
      const d = tsize(k)
      if (tprefs.some(a => free(boxAt(a, d[0], d[1])))) {
        tdim = d
        break
      }
    }
  }
  const tp = place(tprefs, tdim[0], tdim[1])
  if (tp) {
    if (tp.boxed)
      panel(tp.b)
    drawTitle(c, (tp.b[0] + tp.b[2]) / 2, tp.b[1] + S * 0.012, name, sub, lay.info, tdim[2])
  }

  // magnitude key
  const lw = S * 0.2
  const lh = S * 0.055
  const lp = place(['BR', 'BL', 'BC', 'TL'], lw, lh)
  if (lp) {
    if (lp.boxed)
      panel(lp.b)
    drawLegend(c, lp.b[0] + S * 0.006, lp.b[1] + S * 0.004, lw - S * 0.012, lh - S * 0.008)
  }

  // compass rose: the largest that fits a free slot
  if (f.Ornament === 'Compass Rose') {
    for (const k of [0.075, 0.06, 0.048]) {
      const rr = S * k
      const sz = rr * 2.5
      const prefs: Anchor[] = ['TL', 'BL', 'TR', 'BR', 'BC', 'TC']
      let done = false
      for (const a of prefs) {
        const b = boxAt(a, sz, sz)
        if (free(b) || (rect && !hits(used, b) && k === 0.06)) {
          used.push(b)
          if (rect) {
            g.fillStyle = pal.ground
            g.globalAlpha = 0.92
            g.beginPath()
            g.arc((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, rr * 1.25, 0, TAU)
            g.fill()
            g.globalAlpha = 1
          }
          drawRose(c, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, rr)
          done = true
          break
        }
      }
      if (done)
        break
    }
  }
}

export default {
  slug: 'starchart',
  title: 'Starchart',
  summary: 'Plates from atlases of an invented sky: stars by magnitude, made-up constellations, the Milky Way, grids, ecliptic and compass rose.',
  order: 470,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x57a2c4a7 ("gallery" stream, 64-hex candidates): the first
  // hash found for each Style x Projection pair, twelve pairs in the order
  // found, except that the second (a navy planisphere, a whole polar sky in
  // one disc) is moved first to serve as the cover.
  gallery: [
    '0x04a5b31dd142058cca08c8ec41ca1322292f508886975eef2a09792c09cf2802',
    '0xc1c6102bb73d2acafb34160fef9d4e818aca5fb32d5f4f45e3bc4cb128c53904',
    '0x405061ade752380628fa0e3d4c579640a459b0251676397b97220909a6c7f5a8',
    '0x1d8a7fc62f8e211cc939325e13a012375552e2e48ede46b8a8e9917a5b450782',
    '0x39abf18f0d8c25ef08ce6fe5f810cc942923dc35e8a04624956c056dc31e0ed4',
    '0x342d5d19b3c785153cb6156954958475b55058be8ed212b8d31c610b4bf09eff',
    '0xe10e31a39427085b04906be286fc898e7c8103523a96b885d676781288eada53',
    '0x5a693c4614f58607cbfee5496cbb50de919dd253e3a42de376afc096c9736df7',
    '0x525bf17f299cede12fb0e7d07337311e44fbb17d5729218d5eabdd188d137960',
    '0x107f64734d656d459fbb02885c543326b5ca9f952d20b1259c0f72d4f1ef8b19',
    '0x61f5db12f6d5f44f15b15c4d51dcde8eb45957454eee5e45b4e9a7bf89982e62',
    '0xda1b269bccbbd8f209f40bb90f845dfe9b7be7c480feb2c21f54ef9172fe2eb0',
  ],
} satisfies Series
