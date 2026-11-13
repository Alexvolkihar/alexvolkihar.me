// Sheet composition for the "Floorplan" series: the plan shares the sheet
// with other drawings of the same building, laid out the way an architect
// fills a drawing sheet, so that a long plan never leaves an empty band.
//
// - a front elevation under the plan, aligned with it (orthographic
//   projection: every window sits exactly below its opening in the plan);
// - a cross-section, cut along the line marked on the plan;
// - a side elevation to the right, seen from the right of the sheet;
// - a room schedule with a small legend.
//
// All drawings share the plan's scale. The candidate layouts are scored on
// scale and on how much of the sheet they cover; the best one wins. Panels
// are drawn in plan units (0.3 m cells) under a transform set by the caller.

import type { Rng } from '../random'
import type { Pal, Poche } from './draw'
import type { OpeningKind, Plan, Rect, RoomType } from './plan'
import { chance, int, range, weighted } from '../random'
import { dashes } from './draw'
import { EXT_T, isWet } from './plan'

export interface Box { x: number, y: number, w: number, h: number }

export type PanelKind = 'front' | 'section' | 'side' | 'schedule'

export interface Panel {
  kind: PanelKind
  box: Box
  /** Under the plan and lined up with it (rows), or free-standing beside it (column). */
  aligned: boolean
}

export interface Layout {
  rot: 0 | 1
  /** Pixels per cell. */
  k: number
  /** The plan's extents, in pixels. */
  plan: Box
  /** Strip under the plan for its caption (pixels), or null. */
  caption: Box | null
  panels: Panel[]
}

export type Roof = 'gable' | 'hip' | 'flat'

export interface Massing {
  roof: Roof
  /** Roof slope, rise over run. */
  slope: number
  storeys: number
  /** Trees standing beside the building in the elevations: 0, 1 or 2. */
  trees: number
  /** Single row preferred under the plan. */
  row: 'front' | 'section'
}

/** Storey height, eave overhang and slab thickness, in cells. */
const SH = 9.5
const OV = 1.6
const SLAB = 1
const GAP = 3.2
const CAP = 5.5

export function massing(plan: Plan, flats: boolean, construction: boolean, r: Rng): Massing {
  const roof: Roof = flats
    ? (chance(r, 0.7) ? 'flat' : 'gable')
    : weighted<Roof>(r, [['gable', 45], ['hip', 30], ['flat', 25]])
  const slope = range(r, 0.55, 0.8)
  const storeys = flats ? int(r, 3, 5) : (plan.rooms.some(q => q.type === 'stair') ? 2 : 1)
  const trees = int(r, 0, 2)
  const row = construction || chance(r, 0.25) ? 'section' : 'front'
  return { roof, slope, storeys, trees, row }
}

// ---------------------------------------------------------------- masses

/** Roof masses: zones that share a whole side are one volume under one roof. */
export function masses(zones: Rect[]): Rect[] {
  const out = zones.map(z => ({ x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 }))
  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length && !merged; j++) {
        const a = out[i]
        const b = out[j]
        const sameY = a.y0 === b.y0 && a.y1 === b.y1 && (a.x1 === b.x0 || b.x1 === a.x0)
        const sameX = a.x0 === b.x0 && a.x1 === b.x1 && (a.y1 === b.y0 || b.y1 === a.y0)
        if (sameY || sameX) {
          out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }
          out.splice(j, 1)
          merged = true
        }
      }
    }
  }
  return out
}

/** Highest ridge above the eaves, in cells. */
function ridge(ms: Rect[], m: Massing): number {
  if (m.roof === 'flat')
    return 1.4
  let h = 0
  for (const q of ms) h = Math.max(h, (Math.min(q.x1 - q.x0, q.y1 - q.y0) / 2) * m.slope)
  return h + 0.6
}

/** Height of an elevation or section panel, in cells. */
export function elevationHeight(ms: Rect[], m: Massing): number {
  return 3 + ridge(ms, m) + m.storeys * SH + 3.2 + CAP
}

// ---------------------------------------------------------------- layout

export interface LayoutInput {
  /** Drawing area, in pixels. */
  area: Box
  /** Plan extents (dimension chains included), in cells, unrotated. */
  ew: number
  eh: number
  /** Building bounding box, in cells, unrotated. */
  bw: number
  bh: number
  elevH: number
  schedule: { w: number, h: number }
  row: 'front' | 'section'
}

export function chooseLayout(L: LayoutInput): Layout {
  const { area } = L
  let best: Layout | null = null
  let bestScore = -Infinity
  const rowsOpts: PanelKind[][] = [[], [L.row], [L.row, L.row === 'front' ? 'section' : 'front']]
  // column beside the plan: up to two drawings, stacked in this order
  const pool: PanelKind[] = ['schedule', 'front', 'section', 'side']
  const colOpts: PanelKind[][] = [[]]
  for (let i = 0; i < pool.length; i++) {
    colOpts.push([pool[i]])
    for (let j = i + 1; j < pool.length; j++) colOpts.push([pool[i], pool[j]])
  }
  for (const rot of [0, 1] as const) {
    const pw = rot ? L.eh : L.ew
    const ph = rot ? L.ew : L.eh
    const sideW = (rot ? L.bw : L.bh) + 12
    const frontW = (rot ? L.bh : L.bw) + 12
    for (const rows of rowsOpts) {
      for (const cols of colOpts) {
        if (cols.some(c => rows.includes(c)))
          continue
        const extra = rows.length + cols.length
        const cap = extra ? CAP : 0
        const leftH = ph + cap + rows.length * (GAP + L.elevH)
        const size = (p: PanelKind) => p === 'schedule' ? L.schedule : { w: p === 'side' ? sideW : frontW, h: L.elevH }
        let colW = 0
        let colH = 0
        for (const c of cols) {
          colW = Math.max(colW, size(c).w)
          colH += size(c).h + (colH ? GAP : 0)
        }
        const W = pw + (cols.length ? GAP + colW : 0)
        const H = Math.max(leftH, colH)
        const k = Math.min(area.w / W, area.h / H)
        // roughly how much of each drawing's box is actually drawn on
        const body = L.elevH - CAP - 3.2
        let inked = 0.8 * pw * ph + rows.length * 0.85 * pw * body
        for (const c of cols) inked += c === 'schedule' ? 0.9 * L.schedule.w * L.schedule.h : 0.8 * size(c).w * body
        const fill = (inked * k * k) / (area.w * area.h)
        // empty band left along the sheet's long side
        const band = Math.max(1 - (W * k) / area.w, 1 - (H * k) / area.h)
        // scale matters, and so does covering the sheet; extra drawings must earn their place
        // a lone elevation beside the plan floats in white space
        const lone = cols.length === 1 && cols[0] !== 'schedule' && !rows.length ? 0.85 : 1
        const score = k * (1 - band) ** 3 * Math.sqrt(fill) * (1 - 0.025 * extra) * lone
        if (score <= bestScore)
          continue
        bestScore = score
        const ox = area.x + (area.w - W * k) / 2
        const oy = area.y + (area.h - H * k) / 2
        const ly = oy + (H - leftH) * k / 2
        const panels: Panel[] = []
        let y = ly + (ph + cap) * k
        for (const kind of rows) {
          y += GAP * k
          panels.push({ kind, aligned: true, box: { x: ox, y, w: pw * k, h: L.elevH * k } })
          y += L.elevH * k
        }
        const cx = ox + (pw + GAP) * k
        // the column is centred on the sheet, except that a side elevation
        // stands on the same ground line as the front one under the plan
        let cy = oy + (H - colH) * k / 2
        for (const kind of cols) {
          const s = size(kind)
          const py = kind === 'side' && rows.length ? ly + leftH * k - s.h * k : cy
          panels.push({ kind, aligned: false, box: { x: cx + (colW - s.w) * k / 2, y: py, w: s.w * k, h: s.h * k } })
          cy += (s.h + GAP) * k
        }
        best = {
          rot,
          k,
          plan: { x: ox, y: ly, w: pw * k, h: ph * k },
          caption: cap ? { x: ox, y: ly + ph * k, w: pw * k, h: cap * k } : null,
          panels,
        }
      }
    }
  }
  return best!
}

// ---------------------------------------------------------------- projection

/** Plan-to-pixel affine map, as a canvas DOMMatrix would give it. */
export interface Affine { a: number, b: number, c: number, d: number, e: number, f: number }

const ap = (M: Affine, x: number, y: number): [number, number] => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]

function screenBox(M: Affine, r: Rect) {
  const pts = [ap(M, r.x0, r.y0), ap(M, r.x1, r.y0), ap(M, r.x0, r.y1), ap(M, r.x1, r.y1)]
  return {
    x0: Math.min(...pts.map(p => p[0])),
    x1: Math.max(...pts.map(p => p[0])),
    y0: Math.min(...pts.map(p => p[1])),
    y1: Math.max(...pts.map(p => p[1])),
  }
}

/** A volume as seen in an elevation: span along the view, nearness, depth (cells). */
interface Vol {
  u0: number
  u1: number
  near: number
  deep: number
  /** A volume with a ridge at least as high touches this end: the roof stops there, square. */
  abutL?: boolean
  abutR?: boolean
}
interface Hole { u0: number, u1: number, near: number, kind: OpeningKind, room: RoomType }

/**
 * Volumes and exterior openings seen from the bottom of the sheet ('front')
 * or from its right ('side'), in panel cells. `ox` is the panel's left edge
 * (pixels) for the front view; the side view runs from the bottom of the
 * sheet (left) to its top (right), as seen by someone standing on the right.
 */
function project(plan: Plan, ms: Rect[], M: Affine, k: number, view: 'front' | 'side', ox: number, margin: number) {
  const boxes = ms.map(q => screenBox(M, q))
  const yMax = Math.max(...boxes.map(b => b.y1))
  const vol = (b: ReturnType<typeof screenBox>): Vol => view === 'front'
    ? { u0: (b.x0 - ox) / k, u1: (b.x1 - ox) / k, near: b.y1 / k, deep: (b.y1 - b.y0) / k }
    : { u0: margin + (yMax - b.y1) / k, u1: margin + (yMax - b.y0) / k, near: b.x1 / k, deep: (b.x1 - b.x0) / k }
  const vols = boxes.map(vol)
  // volumes that touch along a wall seen end-on: the lower roof runs into the higher one
  const rise = (v: Vol) => Math.min(v.u1 - v.u0, v.deep) / 2
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < boxes.length; j++) {
      if (i === j)
        continue
      const a = boxes[i]
      const b = boxes[j]
      const ov = view === 'front' ? Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) : Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      if (ov < k || rise(vols[j]) < rise(vols[i]) - 0.01)
        continue
      if (view === 'front') {
        if (Math.abs(b.x1 - a.x0) < 0.5)
          vols[i].abutL = true
        if (Math.abs(b.x0 - a.x1) < 0.5)
          vols[i].abutR = true
      }
      else {
        if (Math.abs(b.y0 - a.y1) < 0.5)
          vols[i].abutL = true
        if (Math.abs(b.y1 - a.y0) < 0.5)
          vols[i].abutR = true
      }
    }
  }
  const holes: Hole[] = []
  for (const p of plan.openings) {
    if (p.kind !== 'window' && p.kind !== 'slide' && p.kind !== 'front')
      continue
    // outward normal of the wall, on the sheet
    const nx = p.o === 0 ? 0 : -p.dir
    const ny = p.o === 0 ? -p.dir : 0
    const sx = M.a * nx + M.c * ny
    const sy = M.b * nx + M.d * ny
    const len = Math.hypot(sx, sy)
    if ((view === 'front' ? sy : sx) / len < 0.7)
      continue
    const [x0, y0] = p.o === 0 ? ap(M, p.a, p.c) : ap(M, p.c, p.a)
    const [x1, y1] = p.o === 0 ? ap(M, p.b, p.c) : ap(M, p.c, p.b)
    const room = p.into >= 0 ? plan.rooms[p.into].type : 'living'
    if (view === 'front')
      holes.push({ u0: (Math.min(x0, x1) - ox) / k, u1: (Math.max(x0, x1) - ox) / k, near: y0 / k, kind: p.kind, room })
    else
      holes.push({ u0: margin + (yMax - Math.max(y0, y1)) / k, u1: margin + (yMax - Math.min(y0, y1)) / k, near: x0 / k, kind: p.kind, room })
  }
  return { vols, holes }
}

// ---------------------------------------------------------------- drawing helpers

export interface Ink {
  pal: Pal
  /** Converts a pen width in pixels-per-1000 to cells. */
  pen: (px: number) => number
  rng: Rng
  /** Rendered shading (shadows) on paper palettes. */
  shade: boolean
  /** Opacity of the whole drawing (things seen beyond a section are fainter). */
  fade?: number
}

const alpha = (ink: Ink, a = 1) => a * (ink.fade ?? 1)

function poly(g: CanvasRenderingContext2D, pts: Array<[number, number]>) {
  g.beginPath()
  pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y))
  g.closePath()
}

function hatch(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, step: number, slope: number) {
  g.beginPath()
  if (slope === 0) {
    for (let y = y0 + step; y < y1; y += step) {
      g.moveTo(x0, y)
      g.lineTo(x1, y)
    }
  }
  else {
    const h = y1 - y0
    for (let x = x0 - h; x < x1; x += step) {
      g.moveTo(x, y1)
      g.lineTo(x + h, y0)
    }
  }
  g.stroke()
}

/** Drawing number bubble and title, all in dashes. */
export function caption(g: CanvasRenderingContext2D, x: number, y: number, ink: Ink, len: number) {
  const { pal, pen, rng } = ink
  const r = 1.45
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1.1)
  g.beginPath()
  g.arc(x + r, y, r, 0, Math.PI * 2)
  g.moveTo(x, y)
  g.lineTo(x + 2 * r, y)
  g.stroke()
  g.lineWidth = pen(0.9)
  dashes(g, x + r, y - 0.62, 0.9, rng)
  dashes(g, x + r, y + 0.72, 1.2, rng)
  const tx = x + 2 * r + 1
  g.lineWidth = pen(2)
  dashes(g, tx + len / 2, y - 0.5, len, rng)
  g.lineWidth = pen(0.8)
  g.beginPath()
  g.moveTo(x + 2 * r, y + 0.3)
  g.lineTo(tx + len + 1.5, y + 0.3)
  g.stroke()
  dashes(g, tx + len * 0.25, y + 1.2, len * 0.5, rng)
}

/** Level marks: a datum triangle and a dash figure at each height. */
function levels(g: CanvasRenderingContext2D, x: number, gy: number, zs: number[], ink: Ink, dir: 1 | -1) {
  const { pal, pen, rng } = ink
  g.strokeStyle = pal.dim
  g.fillStyle = pal.dim
  for (const z of zs) {
    const y = gy - z
    g.lineWidth = pen(0.6)
    g.beginPath()
    g.moveTo(x - dir * 0.6, y)
    g.lineTo(x + dir * 3.4, y)
    g.stroke()
    const tx = x + dir * 1.3
    g.beginPath()
    g.moveTo(tx, y)
    g.lineTo(tx - 0.5, y - 0.75)
    g.lineTo(tx + 0.5, y - 0.75)
    g.closePath()
    g.stroke()
    g.beginPath()
    g.moveTo(tx, y)
    g.lineTo(tx + 0.5 * dir, y - 0.75)
    g.lineTo(tx, y - 0.75)
    g.closePath()
    g.fill()
    g.lineWidth = pen(0.7)
    dashes(g, x + dir * 2.4, y - 1.25, 1.8, rng)
  }
}

/** A tree in elevation: trunk and a scalloped crown. */
function elevTree(g: CanvasRenderingContext2D, x: number, gy: number, h: number, w: number, ink: Ink) {
  const { pal, pen, rng } = ink
  g.strokeStyle = pal.furn
  g.lineWidth = pen(0.9)
  g.beginPath()
  g.moveTo(x, gy)
  g.lineTo(x, gy - h * 0.42)
  g.moveTo(x, gy - h * 0.3)
  g.lineTo(x - w * 0.12, gy - h * 0.45)
  g.moveTo(x, gy - h * 0.34)
  g.lineTo(x + w * 0.14, gy - h * 0.5)
  g.stroke()
  const cy = gy - h * 0.62
  const rx = w / 2
  const ry = h * 0.38
  const n = 13
  g.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = range(rng, 0.88, 1.04)
    const px = x + Math.cos(a) * rx * rr
    const py = cy + Math.sin(a) * ry * rr
    if (i === 0) {
      g.moveTo(px, py)
    }
    else {
      const am = a - Math.PI / n
      g.quadraticCurveTo(x + Math.cos(am) * rx * 1.16, cy + Math.sin(am) * ry * 1.16, px, py)
    }
  }
  g.fillStyle = pal.bg
  g.globalAlpha = 0.6
  g.fill()
  g.globalAlpha = 1
  g.stroke()
  g.lineWidth = pen(0.45)
  g.beginPath()
  for (let i = 0; i < 7; i++) {
    const a = range(rng, 0, Math.PI * 2)
    const d = range(rng, 0.2, 0.6)
    const px = x + Math.cos(a) * rx * d
    const py = cy + Math.sin(a) * ry * d
    g.moveTo(px - 0.5, py)
    g.quadraticCurveTo(px, py - 0.4, px + 0.5, py)
  }
  g.stroke()
}

/** Ground line across the panel and the earth below it. */
function ground(g: CanvasRenderingContext2D, x0: number, x1: number, gy: number, ink: Ink) {
  const { pal, pen } = ink
  g.strokeStyle = pal.ink
  g.lineWidth = pen(2.2)
  g.beginPath()
  g.moveTo(x0, gy)
  g.lineTo(x1, gy)
  g.stroke()
  g.save()
  g.beginPath()
  g.rect(x0, gy, x1 - x0, 1.6)
  g.clip()
  g.strokeStyle = pal.dim
  g.lineWidth = pen(0.5)
  g.globalAlpha = 0.7
  hatch(g, x0, gy, x1, gy + 1.6, 0.9, 1)
  g.restore()
  g.globalAlpha = 1
}

/** Sill and head heights of a window, in cells above its floor. */
function sillHead(kind: OpeningKind, room: RoomType, upper: boolean): [number, number] {
  if (kind === 'front')
    return upper ? [2.8, 7.2] : [0, 7.3]
  if (kind === 'slide')
    return [0.3, 7.3]
  if (isWet(room) && room !== 'kitchen')
    return [4.6, 7.2]
  if (room === 'storage' || room === 'dressing')
    return [4.6, 7.2]
  if (room === 'kitchen')
    return [3.6, 7.2]
  return [2.8, 7.2]
}

/** One window or door in elevation, between floor heights z0 and z1 above ground line gy. */
function elevOpening(g: CanvasRenderingContext2D, h: Hole, z0: number, z1: number, gy: number, upper: boolean, ink: Ink) {
  const { pal, pen } = ink
  const top = gy - z1
  const bot = gy - z0
  const w = h.u1 - h.u0
  g.fillStyle = pal.bg
  g.fillRect(h.u0, top, w, bot - top)
  // glass, a little darker than the paper
  g.fillStyle = pal.glass
  g.globalAlpha = alpha(ink, pal.kind === 'cad' ? 0.14 : 0.22)
  g.fillRect(h.u0 + 0.25, top + 0.25, w - 0.5, bot - top - 0.5)
  g.globalAlpha = alpha(ink)
  if (ink.shade) {
    // reveal shadow along the head and one jamb
    g.fillStyle = pal.ink
    g.globalAlpha = alpha(ink, 0.22)
    g.fillRect(h.u0, top, w, 0.45)
    g.fillRect(h.u0, top, 0.35, bot - top)
    g.globalAlpha = alpha(ink)
  }
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1)
  g.strokeRect(h.u0, top, w, bot - top)
  g.lineWidth = pen(0.6)
  g.beginPath()
  if (h.kind === 'front' && !upper) {
    // door leaf with panels and a glazed strip
    g.rect(h.u0 + 0.35, top + 0.35, w - 0.7, bot - top - 0.35)
    g.moveTo(h.u0 + w * 0.5, top + 0.35)
    g.lineTo(h.u0 + w * 0.5, bot)
  }
  else {
    const n = Math.max(1, Math.round(w / 3.4))
    for (let i = 1; i < n; i++) {
      g.moveTo(h.u0 + (w * i) / n, top)
      g.lineTo(h.u0 + (w * i) / n, bot)
    }
    if (bot - top > 5) {
      g.moveTo(h.u0, top + 1.4)
      g.lineTo(h.u1, top + 1.4)
    }
  }
  g.stroke()
  if (h.kind === 'slide' && upper) {
    // a french window gets a railing
    g.beginPath()
    g.moveTo(h.u0 - 0.3, bot - 3.3)
    g.lineTo(h.u1 + 0.3, bot - 3.3)
    for (let x = h.u0 + 0.6; x < h.u1; x += 0.6) {
      g.moveTo(x, bot - 3.3)
      g.lineTo(x, bot)
    }
    g.stroke()
  }
  // sill or canopy
  g.lineWidth = pen(1.4)
  g.beginPath()
  if (h.kind === 'front' && !upper) {
    g.moveTo(h.u0 - 1, top - 0.5)
    g.lineTo(h.u1 + 1, top - 0.5)
  }
  else if (z0 - Math.floor(z0) > 0.2 || z0 > 1) {
    g.moveTo(h.u0 - 0.35, bot + 0.15)
    g.lineTo(h.u1 + 0.35, bot + 0.15)
  }
  g.stroke()
}

// ---------------------------------------------------------------- elevations

export interface ElevationArgs {
  plan: Plan
  ms: Rect[]
  M: Affine
  k: number
  view: 'front' | 'side'
  /** Panel box in pixels. */
  box: Box
  /** Pixel abscissa of the panel's u = 0 for a front view (box.x when lined up with the plan). */
  ox: number
  m: Massing
  ink: Ink
}

/** Draws an elevation into its panel; the context is in panel cells. */
export function elevation(g: CanvasRenderingContext2D, A: ElevationArgs) {
  const { plan, ms, M, k, view, box, ox, m, ink } = A
  const W = box.w / k
  const H = box.h / k
  const gy = H - CAP - 2.2
  const margin = 6
  const { vols, holes } = project(plan, ms, M, k, view, ox, margin)
  const eave = m.storeys * SH
  let bu0 = Infinity
  let bu1 = -Infinity
  for (const v of vols) {
    bu0 = Math.min(bu0, v.u0)
    bu1 = Math.max(bu1, v.u1)
  }
  // trees behind the building first
  const left = bu0
  const right = W - bu1
  const order = [...vols.keys()].sort((p, q) => vols[p].near - vols[q].near)
  if (m.trees > 0) {
    const th = Math.min(gy - 3, eave + range(ink.rng, 3, 9))
    if (right > 7)
      elevTree(g, W - right / 2, gy, th, Math.min(right - 2, th * 0.75), ink)
    else
      elevTree(g, bu1 - 4, gy, th * 1.15, th * 0.8, ink)
    if (m.trees > 1) {
      if (left > 7)
        elevTree(g, left / 2, gy, th * 0.85, Math.min(left - 2, th * 0.65), ink)
      else
        elevTree(g, bu0 + 5, gy, th * 1.1, th * 0.75, ink)
    }
  }
  for (const i of order) volume(g, vols[i], holes, gy, m, ink)
  ground(g, 0.5, W - 0.5, gy, ink)
  // levels on the freer side
  const zs = [0, ...Array.from({ length: m.storeys - 1 }, (_, s) => (s + 1) * SH), eave]
  if (right >= left && right > 5)
    levels(g, bu1 + 1.6, gy, zs, ink, 1)
  else if (left > 5)
    levels(g, bu0 - 1.6, gy, zs, ink, -1)
  caption(g, Math.max(1, bu0), H - CAP / 2 + 0.2, ink, Math.min(14, (bu1 - bu0) * 0.35))
}

/** One volume in elevation: walls, windows and doors, roof. */
function volume(g: CanvasRenderingContext2D, v: Vol, holes: Hole[], gy: number, m: Massing, ink: Ink) {
  const { pal, pen } = ink
  const w = v.u1 - v.u0
  const eave = m.storeys * SH
  g.globalAlpha = alpha(ink)
  g.fillStyle = pal.bg
  g.fillRect(v.u0, gy - eave, w, eave)
  if (pal.kind === 'kraft' || pal.kind === 'vellum') {
    g.fillStyle = pal.ink
    g.globalAlpha = alpha(ink, 0.05)
    g.fillRect(v.u0, gy - eave, w, eave)
    g.globalAlpha = alpha(ink)
  }
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1.4)
  g.strokeRect(v.u0, gy - eave, w, eave)
  g.lineWidth = pen(0.5)
  g.beginPath()
  g.moveTo(v.u0, gy - 1)
  g.lineTo(v.u1, gy - 1)
  for (let s = 1; s < m.storeys; s++) {
    g.moveTo(v.u0, gy - s * SH + 0.5)
    g.lineTo(v.u1, gy - s * SH + 0.5)
  }
  g.stroke()
  for (const h of holes) {
    if (Math.abs(h.near - v.near) > 1 || h.u1 <= v.u0 + 0.1 || h.u0 >= v.u1 - 0.1)
      continue
    for (let s = 0; s < m.storeys; s++) {
      const [z0, z1] = sillHead(h.kind, h.room, s > 0)
      elevOpening(g, h, s * SH + z0, s * SH + z1, gy, s > 0, ink)
    }
  }
  roofElev(g, v, gy - eave, m, ink)
  g.globalAlpha = 1
}

/** Roof of one volume, standing on its eave line at y = ye. */
function roofElev(g: CanvasRenderingContext2D, v: Vol, ye: number, m: Massing, ink: Ink) {
  const { pal, pen } = ink
  const w = v.u1 - v.u0
  g.strokeStyle = pal.ink
  if (m.roof === 'flat') {
    g.fillStyle = pal.bg
    g.fillRect(v.u0 - 0.3, ye - 1.4, w + 0.6, 1.4)
    g.lineWidth = pen(1.4)
    g.strokeRect(v.u0 - 0.3, ye - 1.4, w + 0.6, 1.4)
    g.lineWidth = pen(0.6)
    g.beginPath()
    g.moveTo(v.u0 - 0.3, ye - 1)
    g.lineTo(v.u1 + 0.3, ye - 1)
    g.stroke()
    return
  }
  const along = w >= v.deep
  const rise = (Math.min(w, v.deep) / 2) * m.slope
  // an end that runs into a higher roof has no overhang and no hip: it stops square
  const a = v.abutL ? v.u0 : v.u0 - OV
  const b = v.abutR ? v.u1 : v.u1 + OV
  const drop = OV * m.slope
  let pts: Array<[number, number]>
  let face = true
  if (along) {
    const inset = m.roof === 'hip' ? v.deep / 2 + OV : 0
    pts = [[a, ye + drop], [b, ye + drop], [v.abutR ? b : b - inset, ye - rise], [v.abutL ? a : a + inset, ye - rise]]
  }
  else {
    // the gable or hip end, cut square where it meets a higher roof
    const a0 = v.u0 - OV
    const b0 = v.u1 + OV
    const mid = (a0 + b0) / 2
    const h = (u: number) => ye + drop - (ye + drop - (ye - rise)) * (1 - Math.abs(u - mid) / (mid - a0))
    pts = [[a, ye + drop], [b, ye + drop]]
    if (v.abutR)
      pts.push([b, h(b)])
    pts.push([mid, ye - rise])
    if (v.abutL)
      pts.push([a, h(a)])
    face = m.roof === 'hip'
  }
  poly(g, pts)
  g.fillStyle = pal.bg
  g.fill()
  if (face) {
    // tile courses on a roof plane
    g.save()
    g.clip()
    g.strokeStyle = pal.furn
    g.lineWidth = pen(0.45)
    g.globalAlpha = alpha(ink, 0.85)
    hatch(g, a, ye - rise, b, ye + drop, 0.7, 0)
    g.restore()
    g.globalAlpha = alpha(ink)
  }
  else {
    // gable wall under a barge board
    if (pal.kind === 'kraft' || pal.kind === 'vellum') {
      g.fillStyle = pal.ink
      g.globalAlpha = alpha(ink, 0.05)
      g.fill()
      g.globalAlpha = alpha(ink)
    }
    g.lineWidth = pen(0.6)
    g.beginPath()
    g.moveTo(a + 0.9, ye + drop - 0.1)
    g.lineTo((a + b) / 2, ye - rise + 0.8)
    g.lineTo(b - 0.9, ye + drop - 0.1)
    g.stroke()
  }
  if (ink.shade) {
    // shadow of the eaves on the wall below
    g.fillStyle = pal.ink
    g.globalAlpha = alpha(ink, 0.16)
    g.fillRect(v.u0, ye + drop, w, 1.1)
    g.globalAlpha = alpha(ink)
  }
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1.4)
  poly(g, pts)
  g.stroke()
}

// ---------------------------------------------------------------- section

export interface SectionArgs {
  plan: Plan
  ms: Rect[]
  M: Affine
  k: number
  box: Box
  /** Pixel abscissa of the panel's u = 0 (box.x when lined up with the plan). */
  ox: number
  m: Massing
  ink: Ink
  poche: Poche
  /** The cut, in plan units: a horizontal (0) or vertical (1) line. */
  cut: [0 | 1, number]
}

function pocheFill(g: CanvasRenderingContext2D, ink: Ink, poche: Poche) {
  const { pal } = ink
  g.fillStyle = poche === 'Solid' ? pal.poche : pal.bg
  g.fill()
}

/** Cross-section along the cut, seen towards the top of the sheet. */
export function section(g: CanvasRenderingContext2D, A: SectionArgs) {
  const { plan, ms, M, k, box, ox, m, ink, poche, cut } = A
  const { pal, pen, rng } = ink
  const W = box.w / k
  const H = box.h / k
  const gy = H - CAP - 2.2
  const [co, cc] = cut
  // where the cut crosses a plan rectangle, as a span in panel cells
  const across = (r: Rect): [number, number] | null => {
    const lo = co === 0 ? r.y0 : r.x0
    const hi = co === 0 ? r.y1 : r.x1
    // half-open, so a cut falling on the joint of two wall pieces meets one of them
    if (cc < lo || cc >= hi)
      return null
    const p = co === 0 ? [ap(M, r.x0, cc), ap(M, r.x1, cc)] : [ap(M, cc, r.y0), ap(M, cc, r.y1)]
    const u0 = (Math.min(p[0][0], p[1][0]) - ox) / k
    const u1 = (Math.max(p[0][0], p[1][0]) - ox) / k
    return [u0, u1]
  }
  const eave = m.storeys * SH
  // volumes crossed by the cut
  const vols: Array<{ u0: number, u1: number, along: boolean, deep: number, at: number }> = []
  for (const q of ms) {
    const s = across(q)
    if (!s)
      continue
    const sb = screenBox(M, q)
    const deep = (sb.y1 - sb.y0) / k
    const lo = co === 0 ? q.y0 : q.x0
    const hi = co === 0 ? q.y1 : q.x1
    vols.push({ u0: s[0], u1: s[1], along: s[1] - s[0] >= deep, deep, at: Math.min(cc - lo, hi - cc) })
  }
  if (!vols.length)
    return
  let bu0 = Infinity
  let bu1 = -Infinity
  for (const v of vols) {
    bu0 = Math.min(bu0, v.u0)
    bu1 = Math.max(bu1, v.u1)
  }
  // cut walls and the openings that interrupt them
  const cutWalls: Array<[number, number, boolean]> = []
  for (const w of plan.walls) {
    if (w.o === co)
      continue
    const h = w.t / 2
    const r: Rect = w.o === 0
      ? { x0: w.a - (w.ea ? h : 0), x1: w.b + (w.eb ? h : 0), y0: w.c - h, y1: w.c + h }
      : { x0: w.c - h, x1: w.c + h, y0: w.a - (w.ea ? h : 0), y1: w.b + (w.eb ? h : 0) }
    const s = across(r)
    if (s)
      cutWalls.push([s[0], s[1], w.t >= EXT_T])
  }
  const cutHoles: Array<{ u0: number, u1: number, kind: OpeningKind, room: RoomType }> = []
  for (const p of plan.openings) {
    if (p.o === co)
      continue
    const h = p.t / 2
    const r: Rect = p.o === 0 ? { x0: p.a, x1: p.b, y0: p.c - h, y1: p.c + h } : { x0: p.c - h, x1: p.c + h, y0: p.a, y1: p.b }
    const s = across(r)
    if (s)
      cutHoles.push({ u0: s[0], u1: s[1], kind: p.kind, room: p.into >= 0 ? plan.rooms[p.into].type : 'corridor' })
  }
  const spans = vols.map(v => [v.u0, v.u1] as [number, number])

  // beyond: whole volumes behind the cut, faint, then the far roofs of the cut ones
  const ycut = (co === 0 ? M.d * cc + M.f : M.b * cc + M.f) / k
  const fv = project(plan, ms, M, k, 'front', ox, 0)
  const far = fv.vols.filter(v => v.near <= ycut + 0.01).sort((p, q) => p.near - q.near)
  const faint: Ink = { ...ink, shade: false, fade: 0.5 }
  for (const v of far) volume(g, v, fv.holes, gy, m, faint)
  g.strokeStyle = pal.dim
  g.lineWidth = pen(0.6)
  for (const v of vols) {
    if (m.roof !== 'hip' || !v.along)
      continue
    const rise = (v.deep / 2) * m.slope
    const inset = m.roof === 'hip' ? v.deep / 2 + OV : 0
    g.beginPath()
    g.moveTo(v.u0 - OV, gy - eave + OV * m.slope)
    g.lineTo(v.u0 - OV + inset, gy - eave - rise)
    g.lineTo(v.u1 + OV - inset, gy - eave - rise)
    g.lineTo(v.u1 + OV, gy - eave + OV * m.slope)
    g.stroke()
  }

  // rooms: dash names at eye level, between the cut walls
  const xs = [...cutWalls.map(w => (w[0] + w[1]) / 2), ...cutHoles.map(h => (h.u0 + h.u1) / 2)].sort((a, b) => a - b)
  g.strokeStyle = pal.dim
  for (let s = 0; s < m.storeys; s++) {
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i]
      const b = xs[i + 1]
      if (b - a < 6 || !spans.some(([p, q]) => a >= p - 1 && b <= q + 1))
        continue
      g.lineWidth = pen(0.9)
      dashes(g, (a + b) / 2, gy - s * SH - 4.4, Math.min(4, (b - a) * 0.45), rng)
    }
  }

  g.lineJoin = 'miter'
  const P = new Path2D()
  // ground slab and footings
  for (const [u0, u1] of spans) P.rect(u0, gy - 0.1, u1 - u0, SLAB + 0.1)
  for (const [u0, u1, ext] of cutWalls) {
    if (ext)
      P.rect(u0 - 0.6, gy, u1 - u0 + 1.2, 2.4)
  }
  for (const h of cutHoles) {
    if (h.kind === 'window' || h.kind === 'slide' || h.kind === 'front')
      P.rect(h.u0 - 0.6, gy, h.u1 - h.u0 + 1.2, 2.4)
  }
  for (let s = 0; s < m.storeys; s++) {
    const z0 = s * SH
    const z1 = (s + 1) * SH - SLAB
    // floor slab above this storey
    if (s < m.storeys - 1 || m.roof === 'flat') {
      for (const [u0, u1] of spans) P.rect(u0, gy - z1 - SLAB, u1 - u0, SLAB)
    }
    for (const [u0, u1] of cutWalls) P.rect(u0, gy - z1, u1 - u0, z1 - z0)
    // openings cut through: lintel above, and the wall under a window sill
    for (const hole of cutHoles) {
      const door = hole.kind === 'door' || hole.kind === 'pass' || hole.kind === 'lift'
      const [sill, head] = sillHead(door ? 'front' : hole.kind, hole.room, s > 0 && hole.kind === 'front')
      const hd = Math.min(head, z1 - z0 - 0.4)
      P.rect(hole.u0, gy - z1, hole.u1 - hole.u0, z1 - z0 - hd)
      if (sill > 0.05)
        P.rect(hole.u0, gy - z0 - sill, hole.u1 - hole.u0, sill)
    }
  }
  if (m.roof === 'flat') {
    // parapets over the outer walls
    for (const [u0, u1, ext] of cutWalls) {
      if (ext)
        P.rect(u0, gy - eave - 1.4, u1 - u0, 1.4)
    }
    for (const h of cutHoles) {
      if (h.kind === 'window' || h.kind === 'slide' || h.kind === 'front')
        P.rect(h.u0, gy - eave - 1.4, h.u1 - h.u0, 1.4)
    }
  }
  else {
    // ceiling under the roof space
    for (const [u0, u1] of spans) P.rect(u0, gy - eave, u1 - u0, 0.6)
  }
  g.strokeStyle = pal.ink
  g.lineWidth = pen(2.2)
  g.stroke(P)
  g.save()
  g.beginPath()
  g.rect(0, 0, W, H)
  g.fillStyle = poche === 'Solid' ? pal.poche : pal.bg
  g.fill(P)
  if (poche === 'Hatched') {
    g.clip(P)
    g.strokeStyle = pal.poche
    g.lineWidth = pen(0.6)
    hatch(g, 0, 0, W, H, 0.32 * 1.4, 1)
  }
  g.restore()

  // glazing in the cut openings
  g.strokeStyle = pal.glass
  g.lineWidth = pen(0.8)
  g.beginPath()
  for (const h of cutHoles) {
    if (h.kind !== 'window' && h.kind !== 'slide')
      continue
    for (let s = 0; s < m.storeys; s++) {
      const [sill, head] = sillHead(h.kind, h.room, s > 0)
      const mid = (h.u0 + h.u1) / 2
      g.moveTo(mid - 0.13, gy - s * SH - sill)
      g.lineTo(mid - 0.13, gy - s * SH - head)
      g.moveTo(mid + 0.13, gy - s * SH - sill)
      g.lineTo(mid + 0.13, gy - s * SH - head)
    }
  }
  g.stroke()

  // pitched roofs cut through
  if (m.roof !== 'flat') {
    // lower roofs first, each stopping square against a higher neighbour
    const top = (v: typeof vols[number]) => v.along ? Math.min(v.at, v.deep / 2) * m.slope : ((v.u1 - v.u0) / 2) * m.slope
    for (const v of [...vols].sort((p, q) => top(p) - top(q))) {
      const ye = gy - eave
      const th = 0.9
      const higher = (side: 0 | 1) => vols.some(o => o !== v && top(o) >= top(v) - 0.01
        && Math.abs(side ? o.u0 - v.u1 : o.u1 - v.u0) < 0.3)
      const c0 = higher(0) ? v.u0 : -W
      const c1 = higher(1) ? v.u1 : 2 * W
      g.save()
      g.beginPath()
      g.rect(c0, -H, c1 - c0, 3 * H)
      g.clip()
      let outer: Array<[number, number]>
      if (!v.along) {
        const rise = ((v.u1 - v.u0) / 2) * m.slope
        outer = [[v.u0 - OV, ye + OV * m.slope], [(v.u0 + v.u1) / 2, ye - rise], [v.u1 + OV, ye + OV * m.slope]]
      }
      else {
        // the cut crosses the slope: a level band at the height of the cut,
        // carried by the gable walls at the two ends
        const z = Math.min(v.at, v.deep / 2) * m.slope
        const hip = m.roof === 'hip' ? Math.min(v.deep / 2 - Math.min(v.at, v.deep / 2), (v.u1 - v.u0) / 2) : 0
        if (m.roof === 'hip') {
          outer = [[v.u0 - OV, ye + OV * m.slope], [v.u0 + hip, ye - z], [v.u1 - hip, ye - z], [v.u1 + OV, ye + OV * m.slope]]
        }
        else {
          const G = new Path2D()
          const ends: Array<[number, number, boolean]> = [...cutWalls, ...cutHoles.filter(h => h.kind === 'window' || h.kind === 'slide' || h.kind === 'front').map(h => [h.u0, h.u1, true] as [number, number, boolean])]
          for (const [u0, u1, ext] of ends) {
            if (ext && u0 < v.u0 + 2 && u1 > v.u0 - 1)
              G.rect(u0, ye - z, u1 - u0, z + 0.6)
            else if (ext && u1 > v.u1 - 2 && u0 < v.u1 + 1)
              G.rect(u0, ye - z, u1 - u0, z + 0.6)
          }
          // the far slope seen from below, rafter by rafter
          g.strokeStyle = pal.dim
          g.lineWidth = pen(0.5)
          g.globalAlpha = 0.6
          g.beginPath()
          for (let x = v.u0 + 1.5; x < v.u1 - 1; x += 1.8) {
            g.moveTo(x, ye - z + 0.9)
            g.lineTo(x, ye)
          }
          g.stroke()
          g.globalAlpha = 1
          g.fillStyle = poche === 'Solid' ? pal.poche : pal.bg
          g.fill(G)
          g.strokeStyle = pal.ink
          g.lineWidth = pen(1.6)
          g.stroke(G)
          outer = [[v.u0 - OV, ye - z], [v.u1 + OV, ye - z]]
        }
      }
      const inner = outer.map(([x, y]) => [x, y + th] as [number, number]).reverse()
      poly(g, [...outer, ...inner])
      pocheFill(g, ink, poche)
      g.strokeStyle = pal.ink
      g.lineWidth = pen(1.6)
      g.stroke()
      g.restore()
    }
  }

  ground(g, 0.5, W - 0.5, gy, ink)
  const zs = [0, ...Array.from({ length: m.storeys - 1 }, (_, s) => (s + 1) * SH), eave]
  if (W - bu1 >= bu0 && W - bu1 > 5)
    levels(g, bu1 + 1.6, gy, zs, ink, 1)
  else if (bu0 > 5)
    levels(g, bu0 - 1.6, gy, zs, ink, -1)
  caption(g, Math.max(1, bu0), H - CAP / 2 + 0.2, ink, Math.min(14, (bu1 - bu0) * 0.35))
}

// ---------------------------------------------------------------- schedule

const ROW = 2.4
const SCHED_W = 25

export function scheduleRows(plan: Plan, flats: boolean): number {
  const n = flats ? new Set(plan.rooms.map(q => q.group)).size : plan.rooms.filter(q => q.type !== 'lift').length
  return Math.min(16, n)
}

export function scheduleSize(plan: Plan, flats: boolean) {
  return { w: SCHED_W, h: 3.6 + scheduleRows(plan, flats) * ROW + ROW + 1.2 + 3 * 3 + 1 + CAP }
}

/** Room schedule and legend; the context is in panel cells. */
export function schedule(g: CanvasRenderingContext2D, plan: Plan, flats: boolean, schematic: boolean, poche: Poche, zoneFill: (t: RoomType) => string | null, ink: Ink) {
  const { pal, pen, rng } = ink
  const n = scheduleRows(plan, flats)
  const W = SCHED_W
  const tableH = 3.6 + n * ROW + ROW
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1.4)
  g.strokeRect(0, 0, W, tableH)
  g.lineWidth = pen(1)
  g.beginPath()
  g.moveTo(0, 3.6)
  g.lineTo(W, 3.6)
  g.moveTo(W - 6.5, 3.6)
  g.lineTo(W - 6.5, tableH)
  g.moveTo(0, tableH - ROW)
  g.lineTo(W, tableH - ROW)
  g.stroke()
  g.lineWidth = pen(2)
  dashes(g, W * 0.3, 1.9, W * 0.38, rng)
  // one row per room (or per flat)
  const rows: Array<{ t: RoomType, w: number, h: number }> = []
  if (flats) {
    const seen = new Set<number>()
    for (const q of plan.rooms) {
      if (seen.has(q.group))
        continue
      seen.add(q.group)
      rows.push({ t: q.group ? 'flat' : 'corridor', w: 3, h: 2 })
    }
  }
  else {
    for (const q of plan.rooms) {
      if (q.type !== 'lift')
        rows.push({ t: q.type, w: q.x1 - q.x0, h: q.y1 - q.y0 })
    }
  }
  g.lineWidth = pen(0.5)
  g.strokeStyle = pal.dim
  g.beginPath()
  for (let i = 1; i < n; i++) {
    g.moveTo(0.6, 3.6 + i * ROW)
    g.lineTo(W - 0.6, 3.6 + i * ROW)
  }
  g.stroke()
  for (let i = 0; i < n; i++) {
    const y = 3.6 + i * ROW + ROW / 2
    const row = rows[i]
    const more = i === n - 1 && rows.length > n
    // swatch: zoning colour on schematic sheets, else the room's shape
    const s = 1.3
    if (!more) {
      const fill = schematic ? zoneFill(row.t) : null
      const a = row.w / Math.max(row.w, row.h)
      const b = row.h / Math.max(row.w, row.h)
      const sw = schematic ? s : s * a
      const sh = schematic ? s : s * b
      if (fill) {
        g.fillStyle = fill
        g.fillRect(1.2, y - sh / 2, sw, sh)
      }
      g.strokeStyle = pal.ink
      g.lineWidth = pen(0.7)
      g.strokeRect(1.2, y - sh / 2, sw, sh)
      if (!schematic && isWet(row.t)) {
        g.lineWidth = pen(0.4)
        g.beginPath()
        g.moveTo(1.2 + sw / 2, y - sh / 2)
        g.lineTo(1.2 + sw / 2, y + sh / 2)
        g.moveTo(1.2, y)
        g.lineTo(1.2 + sw, y)
        g.stroke()
      }
    }
    g.strokeStyle = pal.ink
    g.lineWidth = pen(1)
    if (more) {
      dashes(g, 4.5, y, 1.2, rng)
      continue
    }
    const nl = range(rng, 0.25, 0.55) * (W - 12)
    dashes(g, 3.6 + nl / 2, y, nl, rng)
    g.lineWidth = pen(0.8)
    dashes(g, W - 3.25, y, range(rng, 1.6, 2.8), rng)
  }
  // total
  g.lineWidth = pen(1.6)
  const ty = tableH - ROW / 2
  dashes(g, 6, ty, 5, rng)
  dashes(g, W - 3.25, ty, 3, rng)
  // legend: wall, door, window
  let y = tableH + 1.2 + 1.5
  const P = new Path2D()
  P.rect(1.2, y - 0.6, 2.6, 1.2)
  g.strokeStyle = pal.ink
  g.lineWidth = pen(1.6)
  g.stroke(P)
  g.save()
  g.fillStyle = poche === 'Solid' ? pal.poche : pal.bg
  g.fill(P)
  if (poche === 'Hatched') {
    g.clip(P)
    g.strokeStyle = pal.poche
    g.lineWidth = pen(0.5)
    hatch(g, 1, y - 0.8, 4, y + 0.8, 0.32, 1)
  }
  g.restore()
  g.strokeStyle = pal.ink
  g.lineWidth = pen(0.9)
  dashes(g, 9, y, 7, rng)
  y += 3
  g.strokeStyle = pal.door
  g.lineWidth = pen(1.1)
  g.beginPath()
  g.moveTo(1.4, y + 1)
  g.lineTo(1.4, y - 1.2)
  g.stroke()
  g.lineWidth = pen(0.55)
  g.beginPath()
  g.arc(1.4, y + 1, 2.2, -Math.PI / 2, 0)
  g.stroke()
  g.strokeStyle = pal.ink
  g.lineWidth = pen(0.9)
  dashes(g, 8.6, y, 6, rng)
  y += 3
  g.lineWidth = pen(0.6)
  g.strokeRect(1.2, y - 0.6, 2.6, 1.2)
  g.strokeStyle = pal.glass
  g.lineWidth = pen(0.7)
  g.beginPath()
  g.moveTo(1.2, y - 0.13)
  g.lineTo(3.8, y - 0.13)
  g.moveTo(1.2, y + 0.13)
  g.lineTo(3.8, y + 0.13)
  g.stroke()
  g.strokeStyle = pal.ink
  g.lineWidth = pen(0.9)
  dashes(g, 9.4, y, 7.5, rng)
  caption(g, 0.4, scheduleSize(plan, flats).h - CAP / 2 + 0.2, ink, 8)
}
