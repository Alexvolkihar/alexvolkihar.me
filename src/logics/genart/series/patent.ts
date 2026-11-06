// "Patent" — drawings filed for machines that never existed.
//
// Each hash assembles a contraption by mechanical rules (involute gears in
// mesh, belts on pulleys, cams under roller followers, cranks, four-bar beams,
// escapements; see ../patent/machine.ts) and lays it out as a patent-office
// sheet of the second half of the nineteenth century: Fig. 1 in elevation,
// sometimes one arbor taken apart in Fig. 2 and an enlarged detail of a tooth
// mesh in Fig. 3, reference numerals on curved leader lines, and a title
// block. All the lettering is stroked with a small vector font
// (../patent/font.ts); there is no system font anywhere.
//
// Everything is a pure function of the hash, and every length is a fraction
// of the canvas short side.

import type { View } from '../patent/draw'
import type { Machine } from '../patent/machine'
import type { Rng } from '../random'
import type { Series } from '../types'
import { circ, dashed, fs, hatch, poly, sx, sy } from '../patent/draw'
import { drawExploded, planExploded } from '../patent/exploded'
import { drawText, textWidth } from '../patent/font'
import { gearOutline, pitchR, PRESSURE } from '../patent/geom'
import { buildMachine } from '../patent/machine'
import { chance, int, pick, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Aged Paper', 32], ['Blueprint', 22], ['Sepia Print', 18], ['Vellum', 15], ['Ink on Black', 13]],
  Mechanism: [['Gear Train', 28], ['Belt Drive', 20], ['Cam Press', 20], ['Linkage', 18], ['Clockwork', 14]],
  Sheet: [['Single', 40], ['Exploded', 38], ['Plate', 22]],
  Shading: [['Outline', 25], ['Hatched', 50], ['Cross-hatched', 25]],
  Complexity: [['Simple', 30], ['Compound', 45], ['Elaborate', 25]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Mechanism: weighted(r, TRAITS.Mechanism),
    Sheet: weighted(r, TRAITS.Sheet),
    Shading: weighted(r, TRAITS.Shading),
    Complexity: weighted(r, TRAITS.Complexity),
  }
}

interface Palette {
  bg: string
  ink: string
  /** Centre lines, traces of motion, detail callouts. */
  accent: string
  /** Foxing spots or blueprint mottling, and the edge darkening. */
  spot: string
  edge: string
  kind: 'paper' | 'blue' | 'dark'
}

const PAL: Record<Features['Palette'], Palette> = {
  'Aged Paper': { bg: '#ece1c6', ink: '#2b2219', accent: '#8a3324', spot: '#a9773d', edge: '#9c7f4e', kind: 'paper' },
  'Blueprint': { bg: '#1f5d93', ink: '#eaf3fa', accent: '#bfe3ff', spot: '#9fd0ff', edge: '#0b3158', kind: 'blue' },
  'Sepia Print': { bg: '#e4cfa9', ink: '#573620', accent: '#8c5a32', spot: '#94622f', edge: '#8a6537', kind: 'paper' },
  'Vellum': { bg: '#eceee6', ink: '#1d2532', accent: '#b0382b', spot: '#8f9483', edge: '#9aa08f', kind: 'paper' },
  'Ink on Black': { bg: '#141413', ink: '#ece5d3', accent: '#d4a64a', spot: '#d9cfb4', edge: '#000000', kind: 'dark' },
}

const TITLES: Record<Features['Mechanism'], readonly string[]> = {
  'Gear Train': ['HOISTING APPARATUS', 'WINDLASSES', 'CRANES', 'WINCHES', 'CAPSTANS', 'LIFTING JACKS'],
  'Belt Drive': ['LATHES', 'SAWING MACHINES', 'GRINDING MILLS', 'BELT GEARING', 'SHAFTING', 'CIDER MILLS'],
  'Cam Press': ['STAMPING PRESSES', 'RIVETING MACHINES', 'PUNCHING PRESSES', 'NAIL MACHINES', 'STAMP MILLS', 'POWER HAMMERS'],
  'Linkage': ['PUMPING ENGINES', 'STEAM ENGINES', 'MOTORS', 'CHURNS', 'WASHING MACHINES', 'FORCE PUMPS'],
  'Clockwork': ['CLOCK MOVEMENTS', 'ESCAPEMENTS', 'TIME LOCKS', 'REGISTERS', 'ALARM CLOCKS', 'SPRING MOTORS'],
}
const NAME_A = ['HAR', 'WIN', 'CAL', 'BRAD', 'THORN', 'ASH', 'MER', 'PEN', 'WHIT', 'ROW', 'STAN', 'COL', 'FAR', 'HOL', 'KEN', 'MAR', 'LAN', 'DEN', 'GRAY', 'BUR']
const NAME_B = ['LOW', 'DER', 'FIELD', 'TON', 'WELL', 'BY', 'LEY', 'MORE', 'WICK', 'SON', 'WORTH', 'STEAD', 'RIDGE', 'DALE', 'COTT', 'HAM']
const INITIALS = 'ABCDEFGHJKLMNOPRSTW'
const MONTHS = ['JAN.', 'FEB.', 'MAR.', 'APR.', 'MAY', 'JUNE', 'JULY', 'AUG.', 'SEPT.', 'OCT.', 'NOV.', 'DEC.']
// First patent number issued in a few years (approximate), for plausible numbers.
const NUMBERS: [number, number][] = [[1856, 14000], [1860, 26600], [1865, 45700], [1870, 98500], [1875, 158300], [1880, 223200], [1885, 310100], [1890, 418700], [1895, 531600], [1900, 640200]]

const name = (r: Rng) => pick(r, NAME_A) + pick(r, NAME_B)
const initial = (r: Rng) => INITIALS[Math.floor(r() * INITIALS.length)]

function titleBlock(r: Rng, mech: Features['Mechanism']) {
  const inventor = `${initial(r)}. ${chance(r, 0.55) ? `${initial(r)}. ` : ''}${name(r)}.`
  const title = `${chance(r, 0.7) ? 'IMPROVEMENT' : 'IMPROVEMENTS'} IN ${pick(r, TITLES[mech])}.`
  const year = int(r, 1856, 1899)
  let k = 0
  while (NUMBERS[k + 1][0] <= year)
    k++
  const [ya, na] = NUMBERS[k]
  const [yb, nb] = NUMBERS[k + 1]
  const t = (year - ya + r()) / (yb - ya)
  const num = Math.floor(na + (nb - na) * t).toLocaleString('en-US')
  const date = `PATENTED ${pick(r, MONTHS)} ${int(r, 1, 28)}, ${year}.`
  const attorney = `${initial(r)}. ${name(r)}`
  return { inventor, title, number: `NO. ${num}.`, date, attorney }
}

// --- paper -----------------------------------------------------------------

/** Foxing, mottling and edge darkening, laid over the finished drawing. */
function ageing(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Palette, r: Rng) {
  const vig = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.55)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, pal.edge)
  g.globalAlpha = pal.kind === 'dark' ? 0.6 : 0.32
  g.fillStyle = vig
  g.fillRect(0, 0, W, H)
  const spots = pal.kind === 'blue' ? 14 : 70
  for (let i = 0; i < spots; i++) {
    const x = r() * W
    const y = r() * H
    const rad = pal.kind === 'blue' ? range(r, 0.08, 0.25) * S : (r() ** 3 * 0.011 + 0.0015) * S
    const a = pal.kind === 'blue' ? range(r, 0.02, 0.05) : range(r, 0.05, 0.2)
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, pal.spot)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = pal.kind === 'dark' ? a * 0.25 : a
    g.fillStyle = gr
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  // a fold across the sheet
  const vertical = chance(r, 0.5)
  const at = range(r, 0.47, 0.53)
  if (pal.kind !== 'dark' && chance(r, 0.6)) {
    g.globalAlpha = 0.1
    g.fillStyle = pal.edge
    if (vertical)
      g.fillRect(W * at, 0, 0.0016 * S, H)
    else
      g.fillRect(0, H * at, W, 0.0016 * S)
    g.globalAlpha = 0.14
    g.fillStyle = '#ffffff'
    if (vertical)
      g.fillRect(W * at + 0.0016 * S, 0, 0.0012 * S, H)
    else
      g.fillRect(0, H * at + 0.0016 * S, W, 0.0012 * S)
  }
  g.globalAlpha = 1
}

/**
 * A quick pen signature: cursive loops of varied height (capital, ascenders,
 * descenders), split into two or three words, with an underline flourish.
 */
function signature(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Rng, lw: number) {
  const letters: [number, number][] = []
  const words = int(r, 2, 3)
  for (let k = 0; k < words; k++) {
    const n = int(r, 2, 6)
    letters.push([range(r, 1.3, 1.7), range(r, 2, 2.6)])
    for (let i = 0; i < n; i++)
      letters.push([range(r, 0.6, 1.1), pick(r, [0.8, 0.9, 1, 1.1, 1.9, -1.4])])
    letters.push([0.5, 0])
  }
  let total = 0
  for (const [lw2] of letters)
    total += lw2
  const k = w / total
  const slant = range(r, 0.25, 0.45)
  g.beginPath()
  let cx = x
  let first = true
  for (const [lwid, lh] of letters) {
    const ww = lwid * k
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      const th = t * Math.PI * 2
      const hh = h * lh * (1 - Math.cos(th)) / 2
      const px = cx + ww * t - ww * 0.38 * Math.sin(th) * (lh === 0 ? 0 : 1) + hh * slant
      const py = y - hh
      if (first)
        g.moveTo(px, py)
      else
        g.lineTo(px, py)
      first = false
    }
    cx += ww
  }
  g.moveTo(x + w * 0.05, y + h * 0.45)
  g.quadraticCurveTo(x + w * 0.55, y + h * range(r, -0.1, 0.3), x + w * 1.02, y + h * 0.25)
  g.lineWidth = lw
  g.stroke()
}

// --- labels ----------------------------------------------------------------

class Grid {
  cells: Uint8Array
  nx: number
  ny: number
  constructor(public W: number, public H: number, public c: number) {
    this.nx = Math.ceil(W / c)
    this.ny = Math.ceil(H / c)
    this.cells = new Uint8Array(this.nx * this.ny)
  }

  rect(x0: number, y0: number, x1: number, y1: number, set: boolean): boolean {
    const i0 = Math.max(0, Math.floor(x0 / this.c))
    const i1 = Math.min(this.nx - 1, Math.floor(x1 / this.c))
    const j0 = Math.max(0, Math.floor(y0 / this.c))
    const j1 = Math.min(this.ny - 1, Math.floor(y1 / this.c))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (set)
          this.cells[j * this.nx + i] = 1
        else if (this.cells[j * this.nx + i])
          return false
      }
    }
    return true
  }

  capsule(ax: number, ay: number, bx: number, by: number, rad: number) {
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.ceil(len / (this.c * 0.7)))
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n
      const y = ay + (by - ay) * k / n
      // a disc as a few stacked rows
      const rows = Math.max(1, Math.ceil(rad / this.c))
      for (let j = -rows; j <= rows; j++) {
        const yy = y + (j / rows) * rad
        const half = Math.sqrt(Math.max(0, rad * rad - (yy - y) ** 2))
        this.rect(x - half, yy, x + half, yy, true)
      }
    }
  }
}

interface Box { x: number, y: number, w: number, h: number }

function placeLabels(g: CanvasRenderingContext2D, grid: Grid, anchors: { id: string, x: number, y: number }[], nums: Map<string, number>, box: Box, cx: number, cy: number, S: number, lw: number, ink: string, r: Rng, max: number) {
  const size = 0.016 * S
  let placed = 0
  g.strokeStyle = ink
  for (const a of anchors) {
    if (placed >= max)
      break
    const num = nums.get(a.id)
    if (num === undefined)
      continue
    const txt = String(num)
    const tw = textWidth(txt, size)
    const base = Math.atan2(a.y - cy, a.x - cx)
    let found: [number, number] | null = null
    search: for (const d of [0.04, 0.055, 0.075, 0.1, 0.13]) {
      for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.1, -2.1, Math.PI]) {
        const lx = a.x + Math.cos(base + off) * d * S
        const ly = a.y + Math.sin(base + off) * d * S
        const x0 = lx - tw / 2 - 0.006 * S
        const x1 = lx + tw / 2 + 0.006 * S
        const y0 = ly - size / 2 - 0.006 * S
        const y1 = ly + size / 2 + 0.006 * S
        if (x0 < box.x || x1 > box.x + box.w || y0 < box.y || y1 > box.y + box.h)
          continue
        if (!grid.rect(x0, y0, x1, y1, false))
          continue
        found = [lx, ly]
        break search
      }
    }
    if (!found)
      continue
    const [lx, ly] = found
    grid.rect(lx - tw / 2 - 0.006 * S, ly - size / 2 - 0.006 * S, lx + tw / 2 + 0.006 * S, ly + size / 2 + 0.006 * S, true)
    drawText(g, txt, lx, ly + size / 2, size, { align: 'center', slant: 0.15, weight: 0.11 })
    // curved leader from the numeral to the part
    const dx = a.x - lx
    const dy = a.y - ly
    const len = Math.hypot(dx, dy)
    const st = (Math.max(tw, size) / 2 + 0.005 * S) / len
    const bx = lx + dx * st
    const by = ly + dy * st
    const bend = (r() < 0.5 ? -1 : 1) * range(r, 0.1, 0.22) * len
    g.beginPath()
    g.moveTo(bx, by)
    g.quadraticCurveTo((bx + a.x) / 2 - dy / len * bend, (by + a.y) / 2 + dx / len * bend, a.x, a.y)
    g.lineWidth = lw * 0.6
    g.stroke()
    for (let k = 1; k < 6; k++) {
      const t = k / 6
      grid.rect(bx + (a.x - bx) * t, by + (a.y - by) * t, bx + (a.x - bx) * t, by + (a.y - by) * t, true)
    }
    placed++
  }
}

// --- figures ---------------------------------------------------------------

function caption(g: CanvasRenderingContext2D, n: number, x: number, y: number, S: number) {
  drawText(g, `FIG. ${n}.`, x, y, 0.022 * S, { align: 'center', slant: 0.2, weight: 0.1 })
}

/** Fig. 3: a tooth mesh of Fig. 1 enlarged, with pitch and base circles and the line of action. */
function detail(base: View, mc: Machine, cx: number, cy: number, Rv: number) {
  const g = base.g
  const mesh = mc.meshes[0]
  const { a, b } = mesh
  const ux = (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y)
  const uy = (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y)
  const ra = pitchR(a.n, a.m)
  const px = a.x + ux * ra
  const py = a.y + uy * ra
  const rho = 6.5 * a.m
  const s = Rv / rho
  const v: View = { ...base, s, ox: cx - px * s, oy: cy - py * s }
  g.save()
  g.beginPath()
  g.arc(cx, cy, Rv, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = v.bg
  g.fillRect(cx - Rv, cy - Rv, Rv * 2, Rv * 2)
  const R = rho * 1.2
  for (const [gr, dir] of [[a, 1], [b, -1]] as const) {
    const out = gearOutline(gr.n, gr.m, gr.phase)
    fs(v, () => poly(v, out, gr.x, gr.y))
    if (v.shading !== 'Outline')
      hatch(v, () => poly(v, out, gr.x, gr.y), px - R, py - R, px + R, py + R, dir * Math.PI / 4, v.shading === 'Cross-hatched' ? 0.006 : 0.009)
    fs(v, () => poly(v, out, gr.x, gr.y), { fill: null, lw: v.lw * 1.2 })
    dashed(v, () => circ(v, gr.x, gr.y, pitchR(gr.n, gr.m)), [0.016, 0.005, 0.002, 0.005], v.lw * 0.8, v.accent)
    dashed(v, () => circ(v, gr.x, gr.y, pitchR(gr.n, gr.m) * Math.cos(PRESSURE)), [0.002, 0.005], v.lw * 0.8, v.accent)
  }
  // line of action, through the pitch point at the pressure angle
  const ta = Math.atan2(uy, ux) + Math.PI / 2 + PRESSURE
  const L = R * 1.2
  dashed(v, () => {
    g.moveTo(sx(v, px - Math.cos(ta) * L), sy(v, py - Math.sin(ta) * L))
    g.lineTo(sx(v, px + Math.cos(ta) * L), sy(v, py + Math.sin(ta) * L))
    g.moveTo(sx(v, px - ux * L), sy(v, py - uy * L))
    g.lineTo(sx(v, px + ux * L), sy(v, py + uy * L))
  }, [0.016, 0.005, 0.002, 0.005], v.lw * 0.8, v.accent)
  fs(v, () => circ(v, px, py, rho * 0.05), { fill: v.ink, stroke: null })
  g.restore()
  g.beginPath()
  g.arc(cx, cy, Rv, 0, Math.PI * 2)
  g.strokeStyle = v.ink
  g.lineWidth = v.lw * 1.6
  g.stroke()
  return { px, py, rho }
}

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  // fixed stream order: machine, text, labels, paper
  const mr = stream(hash, 'machine')
  const tr = stream(hash, 'text')
  const lr = stream(hash, 'labels')
  const pr = stream(hash, 'paper')
  const mc = buildMachine(mr, f.Mechanism, f.Complexity)
  const plan = planExploded(mc.explode, mr)
  const tb = titleBlock(tr, f.Mechanism)

  g.globalAlpha = 1
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  const lw = 0.0014 * S
  g.strokeStyle = pal.ink
  g.fillStyle = pal.ink

  // border: heavy rule and a fine inner one
  const m = 0.03 * S
  g.lineWidth = lw * 2.4
  g.strokeRect(m, m, W - 2 * m, H - 2 * m)
  g.lineWidth = lw * 0.7
  g.strokeRect(m + 0.007 * S, m + 0.007 * S, W - 2 * m - 0.014 * S, H - 2 * m - 0.014 * S)

  // title block
  const inL = m + 0.03 * S
  const inR = W - m - 0.03 * S
  const top = m + 0.012 * S
  drawText(g, '(NO MODEL.)', inL, top + 0.03 * S, 0.011 * S)
  if (f.Sheet !== 'Single')
    drawText(g, `${f.Sheet === 'Plate' ? 3 : 2} SHEETS-SHEET 1.`, inR, top + 0.03 * S, 0.011 * S, { align: 'right' })
  drawText(g, tb.inventor, W / 2, top + 0.06 * S, 0.021 * S, { align: 'center', weight: 0.11 })
  const ts = Math.min(0.015 * S, 0.015 * S * (inR - inL) / Math.max(1, textWidth(tb.title, 0.015 * S)))
  drawText(g, tb.title, W / 2, top + 0.087 * S, ts, { align: 'center' })
  drawText(g, tb.number, W / 2 - 0.05 * S, top + 0.113 * S, 0.013 * S, { align: 'right' })
  drawText(g, tb.date, W / 2 + 0.05 * S, top + 0.113 * S, 0.013 * S)

  // footer: witnesses and inventor
  const fy = H - m - 0.012 * S
  drawText(g, 'WITNESSES:', inL, fy - 0.058 * S, 0.011 * S)
  g.lineWidth = lw * 0.9
  signature(g, inL + 0.01 * S, fy - 0.026 * S, 0.12 * S, 0.011 * S, tr, lw * 0.9)
  signature(g, inL + 0.03 * S, fy - 0.004 * S, 0.11 * S, 0.011 * S, tr, lw * 0.9)
  const rx = inR - 0.2 * S
  drawText(g, 'INVENTOR:', rx, fy - 0.058 * S, 0.011 * S)
  signature(g, rx + 0.03 * S, fy - 0.024 * S, 0.14 * S, 0.012 * S, tr, lw)
  drawText(g, `BY ${tb.attorney}, ATTY.`, inR, fy - 0.002 * S, 0.0095 * S, { align: 'right' })

  // figure boxes
  const area: Box = { x: inL, y: top + 0.13 * S, w: inR - inL, h: fy - 0.075 * S - (top + 0.13 * S) }
  const wide = area.w / area.h >= 1.15
  const split = (b: Box, t: number, horizontal: boolean): [Box, Box] => horizontal
    ? [{ x: b.x, y: b.y, w: b.w * t, h: b.h }, { x: b.x + b.w * t, y: b.y, w: b.w * (1 - t), h: b.h }]
    : [{ x: b.x, y: b.y, w: b.w, h: b.h * t }, { x: b.x, y: b.y + b.h * t, w: b.w, h: b.h * (1 - t) }]
  let fig1 = area
  let fig2: Box | null = null
  let fig3: Box | null = null
  if (f.Sheet === 'Exploded') {
    [fig1, fig2] = split(area, 0.6, wide)
  }
  else if (f.Sheet === 'Plate') {
    let rest: Box
    [fig1, rest] = split(area, 0.57, wide)
    ;[fig2, fig3] = split(rest, 0.57, !wide)
  }

  const grid = new Grid(W, H, 0.008 * S)
  const view: View = { g, s: 1, ox: 0, oy: 0, S, ink: pal.ink, bg: pal.bg, accent: pal.accent, shading: f.Shading, lw }

  // Fig. 1
  const pad = 0.045 * S
  const capH = 0.04 * S
  const [x0, y0, x1, y1] = mc.bbox
  const aw = fig1.w - 2 * pad
  const ah = fig1.h - pad - capH
  const s = Math.min(aw / (x1 - x0), ah / (y1 - y0))
  const v1: View = { ...view, s, ox: fig1.x + pad + (aw - (x1 - x0) * s) / 2 - x0 * s, oy: fig1.y + pad * 0.6 + (ah - (y1 - y0) * s) / 2 - y0 * s }
  for (const it of mc.items)
    it.draw(v1)
  for (const c of mc.caps)
    grid.capsule(sx(v1, c.ax), sy(v1, c.ay), sx(v1, c.bx), sy(v1, c.by), c.r * s + 0.004 * S)
  g.strokeStyle = pal.ink
  g.fillStyle = pal.ink
  const c1x = sx(v1, (x0 + x1) / 2)
  const c1y = Math.min(fig1.y + fig1.h - 0.008 * S, sy(v1, y1) + 0.04 * S)
  caption(g, 1, c1x, c1y, S)
  grid.rect(c1x - 0.06 * S, c1y - 0.03 * S, c1x + 0.06 * S, c1y + 0.005 * S, true)
  const nums = new Map<string, number>()
  for (const a of mc.anchors) {
    if (!nums.has(a.id))
      nums.set(a.id, nums.size + 1)
  }
  const maxLabels = { Simple: 8, Compound: 11, Elaborate: 14 }[f.Complexity]
  const anchors1 = mc.anchors.map(a => ({ id: a.id, x: sx(v1, a.x), y: sy(v1, a.y) }))

  // Fig. 3 first, so its callout in Fig. 1 is known to the label placer
  if (fig3 && mc.meshes.length) {
    const Rv = Math.min(fig3.w, fig3.h - capH) / 2 - pad * 0.7
    const cx = fig3.x + fig3.w / 2
    const cy = fig3.y + (fig3.h - capH) / 2 + pad * 0.2
    const d = detail(view, mc, cx, cy, Rv)
    g.strokeStyle = pal.ink
    caption(g, 3, cx, cy + Rv + 0.042 * S, S)
    const rc = Math.max(d.rho * s, 0.022 * S)
    const kx = sx(v1, d.px)
    const ky = sy(v1, d.py)
    dashed(view, () => {
      g.moveTo(kx + rc, ky)
      g.arc(kx, ky, rc, 0, Math.PI * 2)
    }, [0.006, 0.004], lw * 1.1, pal.accent)
    g.strokeStyle = pal.accent
    drawText(g, 'A', kx + rc * 0.75 + 0.008 * S, ky - rc * 0.75, 0.015 * S, { slant: 0.15 })
    drawText(g, 'A', cx + Rv * 0.72 + 0.01 * S, cy - Rv * 0.72, 0.017 * S, { slant: 0.15 })
    grid.rect(kx - rc, ky - rc - 0.02 * S, kx + rc + 0.03 * S, ky + rc, true)
  }
  else if (fig3) {
    fig2 = { x: Math.min(fig2!.x, fig3.x), y: Math.min(fig2!.y, fig3.y), w: wide ? fig2!.w : fig2!.w + fig3.w, h: wide ? fig2!.h + fig3.h : fig2!.h }
  }
  placeLabels(g, grid, anchors1, nums, fig1, sx(v1, (x0 + x1) / 2), sy(v1, (y0 + y1) / 2), S, lw, pal.ink, lr, maxLabels)

  // Fig. 2
  if (fig2 && mc.explode.length) {
    const ex = drawExploded(view, plan, fig2.x + pad, fig2.y + pad * 0.6, fig2.w - 2 * pad, fig2.h - pad - capH)
    for (const c of ex.caps)
      grid.capsule(c[0], c[1], c[2], c[3], c[4] + 0.004 * S)
    for (const a of ex.anchors) {
      if (!nums.has(a.id))
        nums.set(a.id, nums.size + 1)
    }
    g.strokeStyle = pal.ink
    g.fillStyle = pal.ink
    let ey = -Infinity
    for (const c of ex.caps)
      ey = Math.max(ey, c[1] + c[4], c[3] + c[4])
    const c2y = Math.min(fig2.y + fig2.h - 0.008 * S, ey + 0.04 * S)
    caption(g, 2, fig2.x + fig2.w / 2, c2y, S)
    grid.rect(fig2.x + fig2.w / 2 - 0.06 * S, c2y - 0.03 * S, fig2.x + fig2.w / 2 + 0.06 * S, c2y + 0.005 * S, true)
    placeLabels(g, grid, ex.anchors, nums, fig2, fig2.x + fig2.w / 2, fig2.y + fig2.h / 2, S, lw, pal.ink, lr, 9)
  }
  ageing(g, W, H, S, pal, pr)
}

export default {
  slug: 'patent',
  title: 'Patent',
  summary: 'Patent drawings for machines that never existed: gear trains, belts, cams, linkages and escapements in pen line and hatching, with numbered parts and a lettered title block.',
  order: 320,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0x9a7e9700 ("gallery" stream, 64-hex candidates): the
  // first hash found for each Palette x Mechanism pair, twelve pairs in the
  // order found, except that the second (a cam press on a three-figure plate,
  // the whole sheet in one piece) is moved first to serve as the cover.
  gallery: [
    '0x74c8bb0d584fe25b9e2f60b51fdc26b1c9d49592717b537430d87130f66c1a87',
    '0x300b130aa1648183d2bc0d90df15e6558ded7b8d5f59f40bb0c24db27a72bd52',
    '0x63ad6980f661d6581b8fa1281e773e5c8f86cd0ad05b2ab4f02411394a7b937f',
    '0xc63e13105163f481cc75b2300e9ee039ff011981abdbb2d36f199a8547deb9de',
    '0xa54f3185721681a985250ea1fb2df86dbf83ae4ce0b90f20c44f0da0c739df7b',
    '0xa441183b93815cfa02cd0a1b63bb0d268569c3c08db309d34594b838c11cbec9',
    '0x1eb7fcb2a04b219f6154903118ec5de3b57ba26fe4274efc327fcfb91d9e4dd6',
    '0x6673aa7394412b604aba04b52833927454e9f280eec75abc199536eed0b4dec2',
    '0x2a1802dbecebb23511791b5156cbf7c5f5063df508b64939df0ea82717e03857',
    '0x970bc4d250c499af2847fc69df1fa3383a8713fadccbd86b484bef6aa25d1975',
    '0x1f12d5a7b6cdea5e23e61a73aa831d27b8cbf458035813920dc850a1c39b5b29',
    '0xda4ae35db1f5f5737c9e746836d09f91e4ab8aedfa97adb0a74aec56fe85c506',
  ],
} satisfies Series
