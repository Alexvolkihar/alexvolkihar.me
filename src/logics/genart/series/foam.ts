// "Foam" — soap foam as a relaxed power diagram with curved films.
//
// Bubbles are discs of hash-drawn sizes (equal, spread, two families or an
// aged, coarsened mix) packed by a soft-disc relaxation whose target spacing
// makes neighbouring surfaces cross at 120°, Plateau's angle (see
// ../foam/cells.ts). Each bubble is then its power (Laguerre) cell clipped by
// its own disc: a dry foam is a mosaic of polygons, a wet one leaves round
// bubbles floating in the liquid.
//
// Every film between two bubbles is bent into an arc whose curvature is the
// pressure difference across it, 1/ri - 1/rj (Laplace–Young; the small bubble
// pushes into the big one), so the three curvatures meeting at a junction add
// up to zero as they must. The cell is eroded and rounded back out by the
// Plateau border radius, which grows with the liquid fraction, so the films
// thin into lines and the junctions swell into the concave triangles of the
// Plateau borders, as described by Weaire and Hutzler in "The Physics of
// Foams" (1999).
//
// The bubbles are painted with thin-film interference colours computed from
// the film thickness (../foam/film.ts), as clear bubbles lit from behind, or
// as an ink plate in which the cells that are not hexagons are hatched (by von
// Neumann's law they are the ones that shrink or grow as the foam ages).
//
// Everything is a pure function of the hash and every length is a fraction of
// the canvas short side. A sheet of foam or a draining column fills any
// canvas; a raft and a dish stay centred at the same size.

import type { Bubble, Cell, Domain } from '../foam/cells'
import type { Rng } from '../random'
import type { Series } from '../types'
import { cells, relax } from '../foam/cells'
import { filmTexture, makeNoise } from '../foam/film'
import { chance, gaussian, range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Film: [['Iridescent', 45], ['Clear', 30], ['Plate', 25]],
  Layout: [['Sheet', 40], ['Raft', 25], ['Drainage', 20], ['Dish', 15]],
  Wetness: [['Dry', 35], ['Moist', 40], ['Wet', 25]],
  Bubbles: [['Polydisperse', 40], ['Monodisperse', 20], ['Bimodal', 25], ['Coarsened', 15]],
  Palette: [['Night', 24], ['Abyss', 18], ['Ember', 10], ['Milk', 20], ['Seafoam', 16], ['Rose', 12]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Film: weighted(r, TRAITS.Film),
    Layout: weighted(r, TRAITS.Layout),
    Wetness: weighted(r, TRAITS.Wetness),
    Bubbles: weighted(r, TRAITS.Bubbles),
    Palette: weighted(r, TRAITS.Palette),
  }
}

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

interface Palette {
  dark: boolean
  /** Backdrop around a raft or a dish. */
  back: string
  /** Liquid in the films and the Plateau borders. */
  liquid: string
  /** Inside of a bubble, centre and rim. */
  cell: string
  cellEdge: string
  /** Light caught by the rims. */
  glow: string
  light: string
  /** Plate: paper, ink, and tints for cells with fewer / more than six sides. */
  paper: string
  ink: string
  tintLo: string
  tintHi: string
}

const PAL: Record<Features['Palette'], Palette> = {
  Night: { dark: true, back: '#05060a', liquid: '#1a202c', cell: '#07090e', cellEdge: '#151b28', glow: '#a9c7e8', light: '#ffffff', paper: '#0c1018', ink: '#d9e2ec', tintLo: '#1f3956', tintHi: '#4d2b3e' },
  Abyss: { dark: true, back: '#021019', liquid: '#0d3549', cell: '#03131c', cellEdge: '#0a2a3b', glow: '#86e1e6', light: '#eaffff', paper: '#062033', ink: '#c3e8ef', tintLo: '#0d4b66', tintHi: '#43401f' },
  Ember: { dark: true, back: '#110806', liquid: '#3a1d12', cell: '#0e0705', cellEdge: '#2a140c', glow: '#f2b179', light: '#fff3e0', paper: '#1a0f0b', ink: '#f0cda6', tintLo: '#3f2a3c', tintHi: '#5e3a14' },
  Milk: { dark: false, back: '#e9e5dc', liquid: '#bdb7ab', cell: '#f8f6f1', cellEdge: '#e0dbd0', glow: '#7d776b', light: '#ffffff', paper: '#f3efe6', ink: '#23211d', tintLo: '#c6d5e4', tintHi: '#eccfbf' },
  Seafoam: { dark: false, back: '#cde0da', liquid: '#86b0a7', cell: '#eff7f4', cellEdge: '#c6dfd7', glow: '#3d6c65', light: '#ffffff', paper: '#e8f1ed', ink: '#1c3a37', tintLo: '#b2d0e0', tintHi: '#efd9b0' },
  Rose: { dark: false, back: '#eed7d1', liquid: '#c4958e', cell: '#fcf3f0', cellEdge: '#ebd0ca', glow: '#87494e', light: '#ffffff', paper: '#f6ebe6', ink: '#3a1f24', tintLo: '#d5c3e3', tintHi: '#f2c3ae' },
}

type RGB = [number, number, number]

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

function mix(a: string, b: string, t: number): string {
  const x = hex(a)
  const y = hex(b)
  const f = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t)
  return `rgb(${f(0)},${f(1)},${f(2)})`
}

function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c)
  return `rgba(${r},${g},${b},${a})`
}

// ---------------------------------------------------------------------------
// Foam parameters (lengths in units of the short side)
// ---------------------------------------------------------------------------

/** Packing factor and Plateau border radius (fraction of r) per wetness. */
const WET: Record<Features['Wetness'], { a: number, q: number }> = {
  Dry: { a: 0.5, q: 0.04 },
  Moist: { a: 0.6, q: 0.15 },
  Wet: { a: 0.78, q: 0.3 },
}

/** Typical bubble spacing per size distribution. */
const SPACING: Record<Features['Bubbles'], readonly [number, number]> = {
  Polydisperse: [0.065, 0.095],
  Monodisperse: [0.075, 0.11],
  Bimodal: [0.055, 0.075],
  Coarsened: [0.05, 0.068],
}

/** One bubble spacing. Always consumes three draws. */
function drawSize(r: Rng, kind: Features['Bubbles'], d0: number): number {
  const big = chance(r, 0.13)
  const g = gaussian(r)
  let d: number
  if (kind === 'Monodisperse')
    d = d0 * (1 + 0.045 * g)
  else if (kind === 'Polydisperse')
    d = d0 * Math.exp(0.3 * g)
  else if (kind === 'Bimodal')
    d = d0 * (big ? 2.5 : 0.82) * Math.exp(0.1 * g)
  else
    d = d0 * Math.exp(0.62 * g)
  return Math.max(d0 * 0.3, Math.min(d, 0.42))
}

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

interface Layout {
  bubbles: Bubble[]
  dom: Domain
  /** Raft: centre and radii of the cluster. Dish: its radius. */
  cx: number
  cy: number
  rx: number
  ry: number
  /** Drainage: height of the foam line. */
  line: number
}

function layout(hash: string, f: Features, uw: number, uh: number): Layout {
  const r = stream(hash, 'bubbles')
  const wet = WET[f.Wetness]
  const [lo, hi] = SPACING[f.Bubbles]
  const d0 = range(r, lo, hi)
  const nz = makeNoise(r)
  const swell = f.Bubbles === 'Monodisperse' ? 0.12 : 0.45
  const field = (x: number, y: number) => Math.exp(swell * (nz(x * 1.7 + 3.1, y * 1.7 + 8.3) - 0.5) * 2)
  const bubbles: Bubble[] = []
  const add = (x: number, y: number, d: number, a: number, q: number) => {
    bubbles.push({ x, y, r: d / (2 * a), a, q })
    return 0.866 * d * d
  }
  const cx = uw / 2
  const cy = uh / 2
  const m = 0.12
  let dom: Domain
  let rx = 0
  let ry = 0
  let line = uh

  if (f.Layout === 'Sheet') {
    dom = { kind: 'box', x0: -m, y0: -m, x1: uw + m, y1: uh + m }
    const area = (uw + 2 * m) * (uh + 2 * m)
    for (let acc = 0; acc < area && bubbles.length < 3000;) {
      const x = range(r, -m, uw + m)
      const y = range(r, -m, uh + m)
      acc += add(x, y, drawSize(r, f.Bubbles, d0) * field(x, y), wet.a, wet.q)
    }
  }
  else if (f.Layout === 'Raft' || f.Layout === 'Dish') {
    const R = f.Layout === 'Raft' ? range(r, 0.27, 0.35) : 0.41
    const e = f.Layout === 'Raft' ? range(r, 0.82, 1.18) : 1
    rx = R * e
    ry = R / e
    dom = f.Layout === 'Raft'
      ? { kind: 'free', cx, cy, pull: 0.015, sx: 1 / e, sy: e }
      : { kind: 'disc', cx, cy, R }
    const area = Math.PI * rx * ry * (f.Layout === 'Raft' ? 1 : 0.97)
    for (let acc = 0; acc < area && bubbles.length < 3000;) {
      const t = r() * Math.PI * 2
      const s = Math.sqrt(r())
      const x = cx + Math.cos(t) * s * rx
      const y = cy + Math.sin(t) * s * ry
      acc += add(x, y, drawSize(r, f.Bubbles, d0) * field(x, y), wet.a, wet.q)
    }
  }
  else {
    // Drainage: dry, coarse foam at the top, wetter towards the foam line,
    // and loose round bubbles rising through the liquid below it.
    dom = { kind: 'box', x0: -m, y0: -m, x1: uw + m, y1: uh + m }
    line = uh * range(r, 0.6, 0.76)
    const area = (uw + 2 * m) * (line + m)
    for (let acc = 0; acc < area && bubbles.length < 3000;) {
      const x = range(r, -m, uw + m)
      const y = range(r, -m, line)
      const t = smooth((y - (line - 0.4)) / 0.4)
      const d = drawSize(r, f.Bubbles, d0) * field(x, y) * (1.3 - 0.5 * (y + m) / (line + m))
      acc += add(x, y, d, wet.a + (0.94 - wet.a) * t, wet.q + (0.46 - wet.q) * t)
    }
    const below = (uw + 2 * m) * (uh + m - line) * 0.2
    for (let acc = 0; acc < below && bubbles.length < 3200;) {
      const x = range(r, -m, uw + m)
      const y = range(r, line, uh + m)
      acc += add(x, y, drawSize(r, f.Bubbles, d0) * 0.55, 1.15, 0.5)
    }
  }
  relax(bubbles, dom, 64)
  return { bubbles, dom, cx, cy, rx, ry, line }
}

/** Loose bubbles drifting on the water around a raft, over the whole canvas. */
function drift(hash: string, lay: Layout, uw: number, uh: number): Bubble[] {
  const r = stream(hash, 'drift')
  const out: Bubble[] = []
  const tries = Math.round(uw * uh * 26)
  for (let k = 0; k < tries; k++) {
    const x = r() * uw
    const y = r() * uh
    const d = range(r, 0.015, 0.05)
    const ex = (x - lay.cx) / (lay.rx + 0.07 + d)
    const ey = (y - lay.cy) / (lay.ry + 0.07 + d)
    if (ex * ex + ey * ey < 1)
      continue
    const rr = d / 2
    if (out.some(b => Math.hypot(b.x - x, b.y - y) < b.r + rr + 0.01))
      continue
    out.push({ x, y, r: rr, a: 1.2, q: 0.5 })
  }
  return out
}

// ---------------------------------------------------------------------------
// Bubble outlines
// ---------------------------------------------------------------------------

/**
 * The core polygon dilated by the Plateau border radius q (an arc at every
 * corner), with every film edge bent by the pressure difference across it.
 */
function outline(c: Cell, bs: Bubble[], curv: number): Path2D {
  const p = c.core
  const xs: number[] = []
  const ys: number[] = []
  const lab: number[] = []
  for (let k = 0; k < p.x.length; k++) {
    const k1 = (k + 1) % p.x.length
    if (Math.hypot(p.x[k1] - p.x[k], p.y[k1] - p.y[k]) < 1e-7)
      continue
    xs.push(p.x[k])
    ys.push(p.y[k])
    lab.push(p.lab[k])
  }
  const m = xs.length
  const path = new Path2D()
  if (m < 3)
    return path
  const nx: number[] = []
  const ny: number[] = []
  for (let k = 0; k < m; k++) {
    const k1 = (k + 1) % m
    const ex = xs[k1] - xs[k]
    const ey = ys[k1] - ys[k]
    const L = Math.hypot(ex, ey)
    let ux = ey / L
    let uy = -ex / L
    if (ux * ((xs[k] + xs[k1]) / 2 - c.cx) + uy * ((ys[k] + ys[k1]) / 2 - c.cy) < 0) {
      ux = -ux
      uy = -uy
    }
    nx.push(ux)
    ny.push(uy)
  }
  const q = c.q
  const ri = bs[c.i].r
  for (let k = 0; k < m; k++) {
    const kp = (k + m - 1) % m
    const k1 = (k + 1) % m
    if (q > 1e-6) {
      const a0 = Math.atan2(ny[kp], nx[kp])
      const delta = Math.atan2(nx[kp] * ny[k] - ny[kp] * nx[k], nx[kp] * nx[k] + ny[kp] * ny[k])
      if (k === 0)
        path.moveTo(xs[k] + q * nx[kp], ys[k] + q * ny[kp])
      path.arc(xs[k], ys[k], q, a0, a0 + delta, delta < 0)
    }
    else if (k === 0) {
      path.moveTo(xs[k], ys[k])
    }
    const bx = xs[k1] + q * nx[k]
    const by = ys[k1] + q * ny[k]
    const j = lab[k]
    if (j >= 0) {
      const ax = xs[k] + q * nx[k]
      const ay = ys[k] + q * ny[k]
      const L = Math.hypot(bx - ax, by - ay)
      const rj = bs[j].r
      const inv = curv * Math.abs(1 / ri - 1 / rj)
      let s = 0
      if (inv > 1e-6) {
        const R = 1 / inv
        s = 2 * R > L ? Math.min(0.3 * L, R - Math.sqrt(R * R - L * L / 4)) : 0.3 * L
        if (ri > rj)
          s = -s
      }
      path.quadraticCurveTo((ax + bx) / 2 + 2 * s * nx[k], (ay + by) / 2 + 2 * s * ny[k], bx, by)
    }
    else {
      path.lineTo(bx, by)
    }
  }
  path.closePath()
  return path
}

function union(cs: Cell[]): Path2D {
  const path = new Path2D()
  for (const c of cs) {
    const p = c.full
    path.moveTo(p.x[0], p.y[0])
    for (let k = 1; k < p.x.length; k++)
      path.lineTo(p.x[k], p.y[k])
    path.closePath()
  }
  return path
}

function bbox(c: Cell): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let k = 0; k < c.full.x.length; k++) {
    x0 = Math.min(x0, c.full.x[k])
    y0 = Math.min(y0, c.full.y[k])
    x1 = Math.max(x1, c.full.x[k])
    y1 = Math.max(y1, c.full.y[k])
  }
  return [x0, y0, x1 - x0, y1 - y0]
}

type Canvasish = HTMLCanvasElement | OffscreenCanvas

function canvasFrom(img: ImageData): Canvasish {
  let cv: Canvasish
  if (typeof OffscreenCanvas !== 'undefined') {
    cv = new OffscreenCanvas(img.width, img.height)
  }
  else {
    cv = document.createElement('canvas')
    cv.width = img.width
    cv.height = img.height
  }
  const g = cv.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  g.putImageData(img, 0, 0)
  return cv
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const uw = W / S
  const uh = H / S

  const lay = layout(hash, f, uw, uh)
  const bs = lay.bubbles
  if (f.Layout === 'Raft')
    bs.push(...drift(hash, lay, uw, uh))
  const film = f.Film === 'Plate' ? 0.0034 : f.Film === 'Clear' ? 0.0026 : 0.002
  const cs = cells(bs, lay.dom, film, 4 / S)
  const curv = 1

  const plate = f.Film === 'Plate'
  const liquid = plate ? pal.ink : f.Film === 'Clear' && pal.dark ? mix(pal.liquid, pal.glow, 0.55) : pal.liquid
  const back = plate ? pal.paper : pal.back

  g.save()
  g.setTransform(S, 0, 0, S, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.lineJoin = 'round'
  g.lineCap = 'round'

  // --- ground -------------------------------------------------------------
  if (f.Layout === 'Sheet') {
    g.fillStyle = liquid
    g.fillRect(0, 0, uw, uh)
  }
  else if (f.Layout === 'Drainage') {
    const gr = g.createLinearGradient(0, 0, 0, uh)
    gr.addColorStop(0, liquid)
    gr.addColorStop(lay.line / uh, liquid)
    gr.addColorStop(1, plate ? liquid : mix(liquid, pal.back, 0.6))
    g.fillStyle = gr
    g.fillRect(0, 0, uw, uh)
  }
  else {
    const gr = g.createRadialGradient(lay.cx, lay.cy * 0.8, 0, lay.cx, lay.cy, Math.hypot(uw, uh) * 0.6)
    gr.addColorStop(0, plate ? back : mix(back, pal.liquid, 0.35))
    gr.addColorStop(1, back)
    g.fillStyle = gr
    g.fillRect(0, 0, uw, uh)
    const all = union(cs)
    if (f.Layout === 'Dish') {
      const R = lay.rx
      g.fillStyle = pal.dark ? 'rgba(0,0,0,0.5)' : 'rgba(40,30,20,0.14)'
      g.beginPath()
      g.arc(lay.cx + 0.012, lay.cy + 0.018, R + 0.016, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = liquid
      g.beginPath()
      g.arc(lay.cx, lay.cy, R, 0, Math.PI * 2)
      g.fill()
    }
    else if (!plate) {
      g.save()
      g.translate(0.012, 0.018)
      g.fillStyle = pal.dark ? 'rgba(0,0,0,0.45)' : 'rgba(40,30,20,0.12)'
      g.fill(all)
      g.restore()
    }
    g.fillStyle = liquid
    g.fill(all)
  }

  // --- bubbles ------------------------------------------------------------
  const paint = stream(hash, 'paint')
  const lr = stream(hash, 'light')
  const theta = -2.36 + range(lr, -0.35, 0.35)
  const lx = Math.cos(theta)
  const ly = Math.sin(theta)

  let tex: Canvasish | null = null
  let T = 0
  if (f.Film === 'Iridescent') {
    T = Math.max(256, Math.min(1400, Math.round(S * 0.55)))
    tex = canvasFrom(filmTexture(stream(hash, 'film'), T, !pal.dark))
  }

  for (const c of cs) {
    const path = outline(c, bs, curv)
    const reff = Math.sqrt(c.area / Math.PI)
    const w0 = range(paint, 0.22, 0.42)
    const u0 = paint()
    const v0 = paint()
    const glint = paint()
    const free = c.full.lab.some(l => l < 0)
    g.save()
    g.clip(path)
    const [bx, by, bw, bh] = bbox(c)

    if (plate) {
      // Topological defects: cells with fewer than six sides (which shrink
      // as the foam coarsens) and more than six (which grow) are washed and
      // hatched, once for one side off, crossed for two or more.
      const off = free ? 0 : c.sides - 6
      g.fillStyle = off ? mix(pal.paper, off < 0 ? pal.tintLo : pal.tintHi, 0.3) : pal.paper
      g.fillRect(bx, by, bw, bh)
      if (off) {
        g.strokeStyle = rgba(pal.ink, pal.dark ? 0.28 : 0.5)
        g.lineWidth = 0.0011
        const gap = pal.dark ? 0.011 : 0.0085
        const dirs = Math.abs(off) >= 2 ? [1, -1] : [off < 0 ? 1 : -1]
        g.beginPath()
        for (const s of dirs) {
          // lines x - s*y = k, across the bounding box
          const k0 = Math.floor((s > 0 ? bx - (by + bh) : bx + by) / gap) * gap
          const k1 = s > 0 ? bx + bw - by : bx + bw + by + bh
          for (let k = k0; k <= k1; k += gap) {
            g.moveTo(k + s * by, by)
            g.lineTo(k + s * (by + bh), by + bh)
          }
        }
        g.stroke()
      }
      g.strokeStyle = rgba(pal.ink, 0.35)
      g.lineWidth = 0.0022
      g.stroke(path)
    }
    else {
      if (f.Film === 'Iridescent' && tex) {
        g.fillStyle = pal.cell
        g.fillRect(bx, by, bw, bh)
        g.globalCompositeOperation = pal.dark ? 'screen' : 'multiply'
        // some films are thick and nearly colourless, others in full colour
        g.globalAlpha = pal.dark ? 0.22 + 0.62 * glint * glint : 0.2 + 0.6 * glint * glint
        // a big bubble shows more of the film, not a magnified patch of it
        const sw = T * Math.min(0.95, bw * (1 + w0 * 2.5))
        const sh = T * Math.min(0.55, bh * (1 + w0 * 2.5))
        g.drawImage(tex, u0 * (T - sw), v0 * (T - sh), sw, sh, bx, by, bw, bh)
        g.globalAlpha = 1
        g.globalCompositeOperation = 'source-over'
      }
      else {
        const gr = g.createRadialGradient(c.cx + lx * reff * 0.3, c.cy + ly * reff * 0.3, 0, c.cx, c.cy, reff * 1.15)
        gr.addColorStop(0, pal.cell)
        gr.addColorStop(1, pal.cellEdge)
        g.fillStyle = gr
        g.fillRect(bx, by, bw, bh)
      }
      // rims catch the light at grazing angles
      g.strokeStyle = rgba(pal.glow, pal.dark ? 0.22 : 0.18)
      g.lineWidth = reff * 0.22
      g.stroke(path)
      g.strokeStyle = rgba(pal.dark ? pal.glow : pal.light, pal.dark ? 0.55 : 0.8)
      g.lineWidth = Math.max(0.0012, reff * 0.03)
      g.stroke(path)
      // the window reflection, and a faint one from the far wall
      g.strokeStyle = rgba(pal.light, (pal.dark ? 0.5 : 0.85) * (0.8 + 0.2 * u0))
      g.lineWidth = reff * 0.1
      g.beginPath()
      g.arc(c.cx, c.cy, reff * 0.66, theta - 0.5, theta + 0.5)
      g.stroke()
      g.strokeStyle = rgba(pal.light, pal.dark ? 0.22 : 0.4)
      g.lineWidth = reff * 0.045
      g.beginPath()
      g.arc(c.cx, c.cy, reff * 0.72, theta + Math.PI - 0.3, theta + Math.PI + 0.3)
      g.stroke()
    }
    g.restore()
  }

  // --- glints in the Plateau borders --------------------------------------
  if (!plate) {
    const sr = stream(hash, 'sparkle')
    g.fillStyle = rgba(pal.light, pal.dark ? 0.75 : 0.9)
    for (const c of cs) {
      const p = c.full
      const m = p.x.length
      for (let k = 0; k < m; k++) {
        const a = p.lab[(k + m - 1) % m]
        const b = p.lab[k]
        if (a < 0 || b < 0 || c.i > a || c.i > b || a === b)
          continue
        if (sr() > 0.45)
          continue
        g.beginPath()
        g.arc(p.x[k], p.y[k], Math.max(0.0012, c.q * 0.3), 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  else {
    // the generating points of the power diagram
    g.fillStyle = pal.ink
    for (const c of cs) {
      const b = bs[c.i]
      g.beginPath()
      g.arc(b.x, b.y, 0.0028, 0, Math.PI * 2)
      g.fill()
    }
  }

  // --- dish rim -----------------------------------------------------------
  if (f.Layout === 'Dish') {
    const R = lay.rx
    g.strokeStyle = plate ? pal.ink : rgba(pal.glow, 0.6)
    g.lineWidth = plate ? 0.006 : 0.014
    g.beginPath()
    g.arc(lay.cx, lay.cy, R + 0.004, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = plate ? pal.ink : rgba(pal.light, 0.7)
    g.lineWidth = plate ? 0.0018 : 0.004
    g.beginPath()
    if (plate)
      g.arc(lay.cx, lay.cy, R + 0.016, 0, Math.PI * 2)
    else
      g.arc(lay.cx, lay.cy, R + 0.004, theta - 0.7, theta + 0.7)
    g.stroke()
  }

  // --- vignette -----------------------------------------------------------
  if (!plate) {
    const vg = g.createRadialGradient(uw / 2, uh / 2, Math.min(uw, uh) * 0.35, uw / 2, uh / 2, Math.hypot(uw, uh) * 0.62)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, pal.dark ? 'rgba(0,0,0,0.42)' : 'rgba(60,45,30,0.1)')
    g.fillStyle = vg
    g.fillRect(0, 0, uw, uh)
  }
  g.restore()
}

export default {
  slug: 'foam',
  title: 'Foam',
  summary: 'Soap foam as a relaxed power diagram: curved films meeting at Plateau\'s 120°, wet or dry, painted in thin-film interference colours, backlit or as an ink plate.',
  order: 430,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xf0a30430 ("gallery" stream): the first hash found for each
  // film × layout pair, so the selection covers the whole table; the cover
  // (a draining column in interference colours) is moved to the front.
  gallery: [
    '0x9b9c8ab467f7591c0ff7710d8e63ae7df7ada85b38ec51048d38e345715adea7',
    '0x17ac228d6240ccce1c4da81b9e02d2f41826e399223f41e4aef71a8bdfa185ed',
    '0xad48be66b18b8ac764d86b8a5eef076228a0cabefbe337b7d29e4c1972242cc7',
    '0xa061c5d2e5e92b5b97c632381fa8ec18805a72de4aef113e4b8be6e985d1c7ab',
    '0x787500ae85bae24169a8c020b0a9635b0e22dd3210843f07c2b8b9e008b9802b',
    '0xfd5483c9a1b11361482de08211e9ca475a701772cc3decce4b23389248cf403e',
    '0xddba364f07489245fd4c9b99c3e079e7e3935d30adb76a2748ef095b25d176e3',
    '0xaf5d4ce1889f276cc0ecd9ce3a2c4df16f43950127c98c11ee5273ea67936aea',
    '0xbb32ca24537dd62ec102c2dd19158ae4a0689605ab0a1e7c96f7203cd3aeda9e',
    '0x300250dc9fef2ea8795c4be66d7ee27c14603661d44326bbc879dd159243ad0a',
    '0xfb43480bc1155cd3a6ccd76ce99f82f16070427af2f1a21b8ce2f9381e1b9c63',
    '0xbb22dc27ce113000c8df0be334d97d47bea85a538cafbac7238782e469993df8',
  ],
} satisfies Series
