// "Marbling" — paper marbling (ebru, suminagashi) by mathematical marbling.
//
// Ink drops fall on the bath one after another: each is an exact circle that
// pushes every earlier boundary outwards (see ../marbling/ops.ts). Then the
// bath is worked like a real tray: rakes drawn back and forth, a fine comb,
// a comb pulled along a wavy path, a stylus stirred into spirals, or a soft
// breath over suminagashi rings. Each boundary is a polygon refined as it
// stretches; they are filled in the order the drops fell, so a later drop
// sits inside the rings it pushed away. The paper is printed last.
//
// Everything is a pure function of the hash. Lengths are fractions of the
// canvas short side and the unit square is centred: a wider or taller canvas
// shows more of the tray. Drops are drawn tile by tile, each tile with its own
// stream, so the tray around the square keeps the same drops at every ratio.

import type { Detail, Op, Poly } from '../marbling/ops'
import type { Series } from '../types'
import { circle, circularTine, comb, drop, transform, vortex, wave } from '../marbling/ops'
import { range, stream, weighted } from '../random'

// ---------------------------------------------------------------------------
// Rarity table — decided before the drawing code, never reordered.
// ---------------------------------------------------------------------------

const TRAITS = {
  Palette: [['Ottoman', 22], ['Indigo', 20], ['Sumi', 16], ['Candy', 14], ['Malachite', 14], ['Night', 14]],
  Pattern: [['Stone', 18], ['Gel-git', 18], ['Nonpareil', 16], ['Bouquet', 14], ['Chevron', 12], ['Suminagashi', 12], ['Nightingale', 10]],
  Drops: [['Few', 30], ['Medium', 45], ['Many', 25]],
  Comb: [['Coarse', 35], ['Medium', 40], ['Fine', 25]],
  Paper: [['Smooth', 45], ['Laid', 35], ['Aged', 20]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Pattern: weighted(r, TRAITS.Pattern),
    Drops: weighted(r, TRAITS.Drops),
    Comb: weighted(r, TRAITS.Comb),
    Paper: weighted(r, TRAITS.Paper),
  }
}

// ---------------------------------------------------------------------------
// Palettes: the bath (ground) colour, five inks, and the gall line drawn
// along every boundary.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number]

interface Palette {
  bath: string
  inks: readonly [string, string, string, string, string]
  gall: string
  gallAlpha: number
  /** Inks used for suminagashi rings (those that read on the bath). */
  rings: readonly number[]
}

const PAL: Record<Features['Palette'], Palette> = {
  Ottoman: { bath: '#efe3c8', inks: ['#9b2b22', '#233a63', '#c99332', '#3f7a6e', '#e7cfa6'], gall: '#2a1c14', gallAlpha: 0.28, rings: [0, 1, 3] },
  Indigo: { bath: '#e8edf1', inks: ['#0e2347', '#21508c', '#6b97c8', '#b2cbe2', '#f4f0e6'], gall: '#0a1630', gallAlpha: 0.22, rings: [0, 1, 2] },
  Sumi: { bath: '#f2ede2', inks: ['#151414', '#3e3c39', '#7d786f', '#b9b3a6', '#a8352b'], gall: '#151414', gallAlpha: 0.2, rings: [0, 1, 2, 4] },
  Candy: { bath: '#fdf1f1', inks: ['#ec6a8c', '#f4b63f', '#4fbcb9', '#9a7fd3', '#ffffff'], gall: '#5a2f45', gallAlpha: 0.18, rings: [0, 2, 3] },
  Malachite: { bath: '#e4e6d2', inks: ['#1b4a37', '#5f8c55', '#b9a24b', '#7a3a2c', '#dfe2c4'], gall: '#0f2a1f', gallAlpha: 0.26, rings: [0, 1, 3] },
  Night: { bath: '#0b0e19', inks: ['#1f2e55', '#c9a14a', '#e9ddc1', '#7e2838', '#3c7191'], gall: '#000000', gallAlpha: 0.45, rings: [1, 2, 3, 4] },
}

function hex(c: string): RGB {
  const v = Number.parseInt(c.slice(1), 16)
  return [v >> 16, (v >> 8) & 255, v & 255]
}

/** Lighter (k > 0) or darker (k < 0) by a fraction. */
function shade(c: RGB, k: number): string {
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k))))
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`
}

// ---------------------------------------------------------------------------
// Sizes, in units of the canvas short side.
// ---------------------------------------------------------------------------

/** Drops per unit area for stone-based patterns, and suminagashi centres. */
const DROPS: Record<Features['Drops'], { n: number, rings: number }> = {
  Few: { n: 38, rings: 4.5 },
  Medium: { n: 85, rings: 7 },
  Many: { n: 150, rings: 10 },
}

/** Fraction of the tray covered by the drops (before pushing). */
const COVER = 2.5

/** Rake spacing. */
const COMB: Record<Features['Comb'], number> = { Coarse: 0.15, Medium: 0.1, Fine: 0.062 }

/** Ink layers: relative radius and weight. The last layers fall last and stay round. */
const LAYER_SIZE = [1.35, 1.12, 0.95, 0.8, 0.66]
const LAYER_WEIGHT = [[0, 28], [1, 24], [2, 20], [3, 16], [4, 12]] as const

/** Polygon refinement (normalised units): the geometry is identical at any size. */
const MIN_LEN = 0.0012
/** Longest edge kept: the combed patterns have far longer boundaries, drawn with fewer points. */
const MAX_LEN: Record<Features['Pattern'], number> = {
  'Stone': 0.0048,
  'Gel-git': 0.0048,
  'Nonpareil': 0.0058,
  'Bouquet': 0.0066,
  'Chevron': 0.0054,
  'Suminagashi': 0.0048,
  'Nightingale': 0.0052,
}

const TILE = 0.5

// ---------------------------------------------------------------------------
// The program of a piece: drops and tray operations, in time order.
// ---------------------------------------------------------------------------

interface DropStep { x: number, y: number, r: number, ink: number, tone: number, t: number }
type Step = { kind: 'drop', d: DropStep } | { kind: 'op', op: Op }

interface Box { x0: number, y0: number, x1: number, y1: number }

function tiles(box: Box, fn: (tx: number, ty: number) => void) {
  for (let ty = Math.floor(box.y0 / TILE); ty < Math.ceil(box.y1 / TILE); ty++) {
    for (let tx = Math.floor(box.x0 / TILE); tx < Math.ceil(box.x1 / TILE); tx++)
      fn(tx, ty)
  }
}

const inside = (b: Box, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1

/** Stone ground: layers of drops thrown over the whole tray, one colour after another. */
function stoneDrops(hash: string, f: Features, keep: Box, sizeK = 1): DropStep[] {
  const { n } = DROPS[f.Drops]
  const rMean = Math.sqrt(COVER / (n * Math.PI)) * sizeK
  const count = n * TILE * TILE / (sizeK * sizeK)
  const out: DropStep[] = []
  tiles(keep, (tx, ty) => {
    const r = stream(hash, `drops ${tx} ${ty}`)
    const k = Math.floor(count + r())
    for (let i = 0; i < k; i++) {
      const x = (tx + r()) * TILE
      const y = (ty + r()) * TILE
      const layer = weighted(r, LAYER_WEIGHT)
      const rad = rMean * LAYER_SIZE[layer] * (0.55 + 0.9 * r())
      const t = layer + r()
      const tone = r() * 2 - 1
      if (inside(keep, x, y))
        out.push({ x, y, r: rad, ink: layer, tone, t })
    }
  })
  return out.sort((a, b) => a.t - b.t)
}

/** Suminagashi: concentric rings, ink and clear water dropped in turn at a few centres. */
function ringDrops(hash: string, f: Features, keep: Box, inkSet: readonly number[]): DropStep[] {
  const per = DROPS[f.Drops].rings * TILE * TILE
  const out: DropStep[] = []
  tiles(keep, (tx, ty) => {
    const r = stream(hash, `rings ${tx} ${ty}`)
    const k = Math.floor(per + r())
    for (let c = 0; c < k; c++) {
      const cx = (tx + r()) * TILE
      const cy = (ty + r()) * TILE
      const rings = 8 + Math.floor(r() * 11)
      const rad = range(r, 0.045, 0.08)
      const start = r() * 6
      const inks = 1 + Math.floor(r() * Math.min(3, inkSet.length))
      const first = Math.floor(r() * inkSet.length)
      for (let i = 0; i < rings; i++) {
        const x = cx + (r() - 0.5) * 0.006
        const y = cy + (r() - 0.5) * 0.006
        const rr = rad * (0.75 + 0.5 * r())
        const t = start + i + r() * 0.8
        // even drops are ink, odd drops clear water (-1)
        const ink = i % 2 === 0 ? inkSet[(first + ((i >> 1) % inks)) % inkSet.length] : -1
        const tone = r() * 2 - 1
        if (inside(keep, cx, cy))
          out.push({ x, y, r: rr, ink, tone, t })
      }
    }
  })
  return out.sort((a, b) => a.t - b.t)
}

/** A rake drawn one way, then shifted by half a tine and drawn back. */
function backAndForth(angle: number, phase: number, s: number, alpha: number, soft = 0.14): Op[] {
  const lambda = s * soft
  return [comb(angle, phase, s, alpha, lambda), comb(angle + Math.PI, phase + s / 2, s, alpha, lambda)]
}

function program(hash: string, f: Features, keep: Box, pal: Palette): Step[] {
  const r = stream(hash, 'tray')
  const s = COMB[f.Comb]
  // Fixed draws first, whatever the pattern.
  const axis = r() < 0.5 ? 0 : Math.PI / 2
  const tilt = range(r, -0.1, 0.1)
  const a = axis + tilt
  const ph = [r(), r(), r(), r(), r(), r()]
  const amp = range(r, 0.7, 1.3)
  const both = r() < 0.6

  const steps: Step[] = []
  const ops = (...o: Op[]) => o.forEach(op => steps.push({ kind: 'op', op }))
  const drops = (d: DropStep[]) => d.forEach(d => steps.push({ kind: 'drop', d }))

  switch (f.Pattern) {
    case 'Stone': {
      drops(stoneDrops(hash, f, keep))
      // a few slow stylus lines, barely felt
      const lines = { Coarse: 1, Medium: 2, Fine: 3 }[f.Comb]
      for (let i = 0; i < lines; i++)
        ops(comb(a + ph[i] * Math.PI * 2, ph[i + 3] - 0.5, Infinity, 0.035 * amp, 0.03))
      break
    }
    case 'Gel-git': {
      drops(stoneDrops(hash, f, keep))
      ops(...backAndForth(a, ph[0] * s * 1.6, s * 1.6, 0.13 * amp))
      if (both)
        ops(...backAndForth(a + Math.PI / 2, ph[1] * s * 2, s * 2, 0.08 * amp, 0.4))
      break
    }
    case 'Nonpareil': {
      drops(stoneDrops(hash, f, keep, 0.85))
      ops(...backAndForth(a, ph[0] * 0.2, 0.2, 0.14 * amp))
      ops(...backAndForth(a + Math.PI / 2, ph[1] * 0.2, 0.2, 0.14 * amp))
      ops(comb(a, ph[2] * s, s * 0.5, 0.09 * amp, s * 0.05))
      break
    }
    case 'Bouquet': {
      drops(stoneDrops(hash, f, keep, 1.2))
      ops(...backAndForth(a, ph[0] * 0.2, 0.2, 0.14 * amp))
      ops(...backAndForth(a + Math.PI / 2, ph[1] * 0.2, 0.2, 0.14 * amp))
      // a fine comb pulled along a wavy path: straighten the path, comb, bend it back
      const sb = 0.04 + s * 0.6
      ops(comb(a, ph[2] * sb, sb * 0.6, 0.06 * amp, sb * 0.05))
      const wl = sb * 2.6
      const wa = sb * 0.6
      const sh = ph[3] * Math.PI * 2
      ops(wave(a + Math.PI / 2, wl, -wa, sh), comb(a, ph[4] * sb, sb * 1.2, 0.08 * amp, sb * 0.08), wave(a + Math.PI / 2, wl, wa, sh))
      break
    }
    case 'Chevron': {
      // fine stripes from two rakings, then a zigzag across them
      drops(stoneDrops(hash, f, keep, 0.9))
      ops(...backAndForth(a + Math.PI / 2, ph[0] * 0.09, 0.09, 0.12 * amp, 0.3))
      ops(wave(a + Math.PI / 2, 0.11, 0.035 * amp, ph[2] * Math.PI * 2))
      ops(...backAndForth(a, ph[1] * s * 1.6, s * 1.6, s * amp, 0.3))
      break
    }
    case 'Suminagashi': {
      drops(ringDrops(hash, f, keep, pal.rings))
      // a breath, a fan and a slow stylus over the floating rings
      const k = { Coarse: 1, Medium: 1.6, Fine: 2.6 }[f.Comb]
      ops(wave(a, 0.9 / k, 0.07 * amp, ph[0] * 6.28))
      ops(wave(a + Math.PI / 2 + tilt * 3, 1.3 / k, 0.06 * amp, ph[1] * 6.28))
      ops(circularTine(ph[2], ph[3], 0.3 + ph[4] * 0.3, 0.1 * amp, 0.14))
      ops(comb(a + ph[5] * 3, ph[4] - 0.5, Infinity, 0.05 * amp, 0.04))
      break
    }
    case 'Nightingale': {
      drops(stoneDrops(hash, f, keep))
      ops(...backAndForth(a, ph[0] * s, s * 1.4, 0.07 * amp))
      // a grid of spirals, stirred alternately one way and the other
      const g = 0.2 + s * 1.6
      const R = g * 0.36
      const omega = (1.5 + ph[2]) * Math.PI
      const ox = ph[3] * g
      const oy = ph[4] * g
      for (let j = Math.floor((keep.y0 - oy) / g); j <= Math.ceil((keep.y1 - oy) / g); j++) {
        for (let i = Math.floor((keep.x0 - ox) / g); i <= Math.ceil((keep.x1 - ox) / g); i++)
          ops(vortex(ox + i * g, oy + j * g, (i + j) % 2 === 0 ? omega : -omega, R))
      }
      break
    }
  }
  return steps
}

// ---------------------------------------------------------------------------
// Paper
// ---------------------------------------------------------------------------

function paper(g: CanvasRenderingContext2D, f: Features, hash: string, view: Box, S: number, X: (x: number) => number, Y: (y: number) => number) {
  const W = X(view.x1)
  const H = Y(view.y1)
  const dark = f.Palette === 'Night'
  if (f.Paper === 'Smooth') {
    const lg = g.createLinearGradient(0, 0, W, H)
    lg.addColorStop(0, dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)')
    lg.addColorStop(0.5, 'rgba(255,255,255,0)')
    lg.addColorStop(1, 'rgba(0,0,0,0.06)')
    g.fillStyle = lg
    g.fillRect(0, 0, W, H)
    return
  }
  if (f.Paper === 'Laid') {
    // laid lines every 0.008, chain lines every 0.09, in normalised units
    g.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(40,30,20,0.06)'
    g.lineWidth = Math.max(0.6, 0.0016 * S)
    g.beginPath()
    for (let y = Math.ceil(view.y0 / 0.008) * 0.008; y < view.y1; y += 0.008) {
      g.moveTo(0, Y(y))
      g.lineTo(W, Y(y))
    }
    g.stroke()
    g.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(40,30,20,0.06)'
    g.lineWidth = Math.max(0.8, 0.003 * S)
    g.beginPath()
    for (let x = Math.ceil((view.x0 - 0.03) / 0.09) * 0.09 + 0.03; x < view.x1; x += 0.09) {
      g.moveTo(X(x), 0)
      g.lineTo(X(x), H)
    }
    g.stroke()
    return
  }
  // Aged: a warm wash, foxing spots, darker edges
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = dark ? 'rgba(120,100,70,0.25)' : 'rgba(214,180,120,0.22)'
  g.fillRect(0, 0, W, H)
  tiles(view, (tx, ty) => {
    const r = stream(hash, `foxing ${tx} ${ty}`)
    const k = Math.floor(3 + r() * 4)
    for (let i = 0; i < k; i++) {
      const x = X((tx + r()) * TILE)
      const y = Y((ty + r()) * TILE)
      const rad = (0.004 + r() ** 3 * 0.03) * S
      const a = 0.15 + r() * 0.3
      const rg = g.createRadialGradient(x, y, 0, x, y, rad)
      rg.addColorStop(0, `rgba(150,95,45,${a})`)
      rg.addColorStop(1, 'rgba(150,95,45,0)')
      g.fillStyle = rg
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
  })
  const cx = W / 2
  const cy = H / 2
  const rg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.35, cx, cy, Math.hypot(W, H) * 0.6)
  rg.addColorStop(0, 'rgba(120,80,40,0)')
  rg.addColorStop(1, 'rgba(120,80,40,0.35)')
  g.fillStyle = rg
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'source-over'
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

let buf = new Float64Array(1 << 15)

/** Copies a polygon into `buf`, clamped to the frame, dropping the middle of runs along one side. */
function framed(poly: Poly, b: Box): number {
  const { p, n } = poly
  if (buf.length < n * 2)
    buf = new Float64Array(n * 4)
  const cx = (i: number) => Math.min(b.x1, Math.max(b.x0, p[i * 2]))
  const cy = (i: number) => Math.min(b.y1, Math.max(b.y0, p[i * 2 + 1]))
  let k = 0
  for (let i = 0; i < n; i++) {
    const x = cx(i)
    const y = cy(i)
    if (x !== p[i * 2] || y !== p[i * 2 + 1]) {
      const a = i > 0 ? i - 1 : n - 1
      const c = i + 1 < n ? i + 1 : 0
      const ax = cx(a)
      const ay = cy(a)
      const bx = cx(c)
      const by = cy(c)
      if ((ax === x && bx === x && (x === b.x0 || x === b.x1)) || (ay === y && by === y && (y === b.y0 || y === b.y1)))
        continue
    }
    buf[k * 2] = x
    buf[k * 2 + 1] = y
    k++
  }
  if (k < 3) {
    buf.set(p.subarray(0, 6))
    return 3
  }
  return k
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const view: Box = { x0: -(W / S - 1) / 2, y0: -(H / S - 1) / 2, x1: 0, y1: 0 }
  view.x1 = 1 - view.x0
  view.y1 = 1 - view.y0
  const X = (x: number) => (x - view.x0) * S
  const Y = (y: number) => (y - view.y0) * S
  // Drops are thrown a little beyond the window; polygons that drift far out are dropped.
  const keep: Box = { x0: view.x0 - 0.15, y0: view.y0 - 0.15, x1: view.x1 + 0.15, y1: view.y1 + 0.15 }
  const far: Box = { x0: view.x0 - 0.4, y0: view.y0 - 0.4, x1: view.x1 + 0.4, y1: view.y1 + 0.4 }
  // full detail a little beyond the window, coarse outlines further out
  const maxLen = MAX_LEN[f.Pattern]
  const detail: Detail = { x0: view.x0 - 0.2, y0: view.y0 - 0.2, x1: view.x1 + 0.2, y1: view.y1 + 0.2, maxLen, minLen: MIN_LEN, coarse: 0.03, cap: 60000 }

  // Ink order: the palette is turned so that each piece leads with its own colour.
  const cr = stream(hash, 'colors')
  // (suminagashi keeps the palette order: its ring inks are chosen by index)
  const spin = cr()
  const turn = f.Pattern === 'Suminagashi' ? 0 : Math.floor(spin * 5)
  const inks = pal.inks.map((_, i) => hex(pal.inks[(i + turn) % 5]))
  const bath = hex(pal.bath)

  const steps = program(hash, f, keep, pal)
  const polys: Array<Poly & { fill: string }> = []
  for (const st of steps) {
    const op = st.kind === 'drop' ? drop(st.d.x, st.d.y, st.d.r) : st.op
    let w = 0
    for (let i = 0; i < polys.length; i++) {
      const p = polys[i]
      transform(p, op, detail)
      if (p.x1 > far.x0 && p.x0 < far.x1 && p.y1 > far.y0 && p.y0 < far.y1)
        polys[w++] = p
    }
    polys.length = w
    if (st.kind === 'drop') {
      const d = st.d
      const c = d.ink < 0 ? bath : inks[d.ink]
      const fill = shade(c, d.ink < 0 ? 0 : d.tone * 0.06)
      polys.push(Object.assign(circle(d.x, d.y, d.r, maxLen), { fill }))
    }
  }

  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = pal.bath
  g.fillRect(0, 0, W, H)
  // suminagashi ink carries no gall: the rings meet edge to edge
  const gall = f.Pattern !== 'Suminagashi'
  g.lineJoin = 'round'
  g.lineWidth = Math.max(0.5, 0.0012 * S)
  g.strokeStyle = pal.gall
  // Vertices beyond the window are pulled onto a frame just outside it, and
  // the runs that lie along the frame collapse: the inside is unchanged.
  const m = Math.max(2 * maxLen, 4 / S)
  const frame: Box = { x0: view.x0 - m, y0: view.y0 - m, x1: view.x1 + m, y1: view.y1 + m }
  // quadratic curves through the edge midpoints when an edge spans several pixels
  const smooth = maxLen * S > 6
  for (const poly of polys) {
    if (poly.x1 < view.x0 || poly.x0 > view.x1 || poly.y1 < view.y0 || poly.y0 > view.y1)
      continue
    const k = framed(poly, frame)
    g.beginPath()
    if (smooth) {
      g.moveTo(X((buf[2 * k - 2] + buf[0]) / 2), Y((buf[2 * k - 1] + buf[1]) / 2))
      for (let i = 0; i < k; i++) {
        const j = i + 1 < k ? i + 1 : 0
        g.quadraticCurveTo(X(buf[i * 2]), Y(buf[i * 2 + 1]), X((buf[i * 2] + buf[j * 2]) / 2), Y((buf[i * 2 + 1] + buf[j * 2 + 1]) / 2))
      }
    }
    else {
      g.moveTo(X(buf[0]), Y(buf[1]))
      for (let i = 1; i < k; i++)
        g.lineTo(X(buf[i * 2]), Y(buf[i * 2 + 1]))
    }
    g.closePath()
    g.fillStyle = poly.fill
    g.fill()
    if (gall) {
      g.globalAlpha = pal.gallAlpha
      g.stroke()
      g.globalAlpha = 1
    }
  }

  paper(g, f, hash, view, S, X, Y)
}

export default {
  slug: 'marbling',
  title: 'Marbling',
  summary: 'Ink drops pushed into stone, combed into nonpareil and bouquet, stirred into spirals or left as suminagashi rings: mathematical marbling.',
  order: 120,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x3a4b1e5003 ("gallery" stream): the first hash found for each
  // Palette x Pattern pair, the first twelve pairs in the order found (this
  // seed-of-seeds is the first whose twelve cover every palette and pattern),
  // except that the fourth, an indigo bouquet, is moved first as the cover.
  gallery: [
    '0x4b6b134bc2d7d48418ba6b76cb80f32762abb41674577588067757264ccb23ed',
    '0x38c8996bc07cd4ecd1999388a8dbde7724a9bc3cf0d86b5195aebf962fd91030',
    '0xc72cfc78fdc89d78bec8230a4789bde1e2c06e0dfc8687389479320c36162723',
    '0xd99c37d6273496d24395289cf816ee3e2489841e2d1b872247dbb5488a49bece',
    '0x5b47cc68a5a2622c92cb780d0bd0dcf686ea635364290488a5abbba7b5c375d4',
    '0xfee06961923814abacb66c4204b7480144670dc0fc7a8659eb33e5be1efcb827',
    '0x1f43590d0e63ad476da635777081afa11c074a3f0adf55ebda2afcbbb76b72d9',
    '0x1b3cc1a6021bc592f6fb7c2b32a567b1e50a7ce263d3d136eb7280ed2fcd81d1',
    '0xbc9dbbedfb3c40405f745414ff844907bdf23d6b33b8a7883022998380ea56d7',
    '0xd9b882dc10b177f4c60d2f8fc97b0662084008fb4a7ccd96e0cf36758a44df5d',
    '0xd0ab2fb22d2ac33de2a09c15574bf2fb52fd0d77b27f05ff58f080032d671a40',
    '0x31410858ae71f8bd736e32e45d598606cd54dfd2e048056b5707f077525b0eb8',
  ],
} satisfies Series
