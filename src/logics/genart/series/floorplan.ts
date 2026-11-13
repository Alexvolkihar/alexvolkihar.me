// "Floorplan" — architectural plans of houses and flats that were never built.
//
// A footprint (a rectangle, an L, a U around a courtyard, or stepped wings)
// is split into zones; a room program is spread over them and each zone is
// subdivided by an area-weighted binary space partition or a squarified
// treemap (Bruls, Huizing & van Wijk 2000, used for floor plans by Marson &
// Musse 2010). Night zones get a corridor, flats a double-loaded corridor with
// a stair core. Doors follow a minimum spanning tree of the room adjacency
// graph; windows sit on the exterior runs. The plan is then drafted: wall
// poché, door swings, glazing, stairs, furniture symbols, tiled wet rooms,
// dimension chains with slashed ticks, a north arrow, a scale bar and a title
// block whose lettering is only dashes. The rest of the sheet holds other
// drawings of the same building at the same scale (front and side
// elevations, a cross-section, a room schedule), chosen so that no canvas
// ratio leaves an empty band. See ../floorplan/.
//
// Everything is a pure function of the hash. Plan geometry is in 0.3 m cells
// and the whole drawing is scaled to the canvas short side, so a hash gives
// the same sheet at any size; the layout (and a quarter turn of the plan,
// north arrow included) depends only on the canvas ratio.

import type { Pal, Poche } from '../floorplan/draw'
import type { Piece } from '../floorplan/furnish'
import type { Footprint, Program, Rect } from '../floorplan/plan'
import type { Ink } from '../floorplan/sheet'
import type { Rng } from '../random'
import type { Series } from '../types'
import { dashes, dimChain, northArrow, openings, paving, roomLabel, scaleBar, stairs, terrace, tiles, titleBlock, tree, walls, zoneColor, zoning } from '../floorplan/draw'
import { drawPiece, furnish } from '../floorplan/furnish'
import { buildPlan } from '../floorplan/plan'
import { caption, chooseLayout, elevation, elevationHeight, masses, massing, schedule, scheduleSize, section } from '../floorplan/sheet'
import { chance, range, stream, weighted } from '../random'

// Rarity table, decided before the drawing code. Never reorder: it re-rolls the edition.
const TRAITS = {
  Palette: [['Vellum', 32], ['Blueprint', 26], ['Kraft', 22], ['CAD', 20]],
  Footprint: [['Rectangle', 30], ['L-shape', 30], ['Courtyard', 15], ['Stepped', 25]],
  Program: [['Cottage', 25], ['House', 40], ['Villa', 22], ['Flats', 13]],
  Poché: [['Solid', 35], ['Hatched', 45], ['Outline', 20]],
  Detail: [['Schematic', 15], ['Furnished', 55], ['Construction', 30]],
} as const

type TraitName = keyof typeof TRAITS
type Features = { [K in TraitName]: typeof TRAITS[K][number][0] }

function features(hash: string): Features {
  const r = stream(hash, 'features')
  return {
    Palette: weighted(r, TRAITS.Palette),
    Footprint: weighted(r, TRAITS.Footprint),
    Program: weighted(r, TRAITS.Program),
    Poché: weighted(r, TRAITS.Poché),
    Detail: weighted(r, TRAITS.Detail),
  }
}

const PAL: Record<Features['Palette'], Pal> = {
  // architect's ink on drafting vellum
  Vellum: {
    bg: '#f3f0e7',
    bg2: '#e2dccb',
    ink: '#1d1c1a',
    poche: '#2a2825',
    door: '#1d1c1a',
    furn: '#4a463f',
    dim: '#5d584f',
    accent: '#b4432f',
    tile: 'rgba(60, 55, 45, 0.2)',
    glass: '#4f6f86',
    grid: null,
    grid2: null,
    day: 'rgba(214, 160, 92, 0.22)',
    night: 'rgba(98, 132, 170, 0.2)',
    wet: 'rgba(108, 160, 150, 0.26)',
    kind: 'vellum',
  },
  // white lines on cyanotype blue
  Blueprint: {
    bg: '#1f508f',
    bg2: '#163d6e',
    ink: '#f1f6ff',
    poche: '#d9e6fb',
    door: '#f1f6ff',
    furn: '#bcd2f2',
    dim: '#a9c4ec',
    accent: '#ffffff',
    tile: 'rgba(255, 255, 255, 0.16)',
    glass: '#e8f1ff',
    grid: 'rgba(255, 255, 255, 0.055)',
    grid2: 'rgba(255, 255, 255, 0.11)',
    day: 'rgba(255, 255, 255, 0.1)',
    night: 'rgba(140, 190, 255, 0.17)',
    wet: 'rgba(200, 230, 255, 0.07)',
    kind: 'blue',
  },
  // graphite and white pencil on brown kraft paper
  Kraft: {
    bg: '#d4b384',
    bg2: '#bf9b6c',
    ink: '#140f0b',
    poche: '#1a140f',
    door: '#140f0b',
    furn: '#271e16',
    dim: '#33281d',
    accent: '#fdf7ea',
    tile: 'rgba(30, 20, 10, 0.28)',
    glass: '#fdf7ea',
    grid: null,
    grid2: null,
    day: 'rgba(246, 238, 223, 0.32)',
    night: 'rgba(60, 45, 30, 0.13)',
    wet: 'rgba(246, 238, 223, 0.16)',
    kind: 'kraft',
  },
  // a dark CAD model space, one colour per layer
  CAD: {
    bg: '#15181c',
    bg2: '#0d0f12',
    ink: '#ececec',
    poche: '#8d969e',
    door: '#e8c547',
    furn: '#4fc3d9',
    dim: '#6fcf86',
    accent: '#e8604f',
    tile: 'rgba(79, 195, 217, 0.22)',
    glass: '#d36ba6',
    grid: 'rgba(255, 255, 255, 0.04)',
    grid2: 'rgba(255, 255, 255, 0.085)',
    day: 'rgba(232, 197, 71, 0.12)',
    night: 'rgba(79, 195, 217, 0.12)',
    wet: 'rgba(211, 107, 166, 0.13)',
    kind: 'cad',
  },
}

function paper(g: CanvasRenderingContext2D, W: number, H: number, S: number, pal: Pal, r: Rng) {
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.fillStyle = pal.bg
  g.fillRect(0, 0, W, H)
  if (pal.kind !== 'cad') {
    const v = g.createRadialGradient(W / 2, H / 2, S * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.62)
    v.addColorStop(0, `${pal.bg}00`)
    v.addColorStop(1, pal.bg2)
    g.fillStyle = v
    g.fillRect(0, 0, W, H)
  }
  const P = S / 1000
  const area = (W * H) / (S * S)
  if (pal.kind === 'kraft') {
    // flecks of wood pulp, dark and light
    const n = Math.round(1600 * area)
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = r() * H
      const s = P * range(r, 0.6, 2.2)
      g.fillStyle = r() < 0.6 ? 'rgba(70, 50, 30, 0.16)' : 'rgba(250, 240, 220, 0.24)'
      g.fillRect(x, y, s, s)
    }
  }
  if (pal.kind === 'kraft' || pal.kind === 'vellum') {
    // fibres
    const n = Math.round((pal.kind === 'kraft' ? 420 : 260) * area)
    g.lineWidth = P * 0.7
    g.strokeStyle = pal.kind === 'kraft' ? 'rgba(80, 55, 30, 0.12)' : 'rgba(90, 80, 60, 0.07)'
    g.beginPath()
    for (let i = 0; i < n; i++) {
      const x = r() * W
      const y = r() * H
      const a = r() * Math.PI * 2
      const l = S * range(r, 0.004, 0.016)
      g.moveTo(x, y)
      g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l)
    }
    g.stroke()
  }
  if (pal.kind === 'blue') {
    // uneven exposure of the cyanotype
    for (let i = 0; i < 14; i++) {
      const x = r() * W
      const y = r() * H
      const rr = S * range(r, 0.15, 0.45)
      const gr = g.createRadialGradient(x, y, 0, x, y, rr)
      const a = range(r, 0.02, 0.05)
      gr.addColorStop(0, r() < 0.5 ? `rgba(255, 255, 255, ${a})` : `rgba(5, 20, 50, ${a * 1.6})`)
      gr.addColorStop(1, 'rgba(0, 0, 0, 0)')
      g.fillStyle = gr
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2)
    }
  }
}

interface Box { x0: number, y0: number, x1: number, y1: number }

function render(g: CanvasRenderingContext2D, W: number, H: number, hash: string) {
  const f = features(hash)
  const pal = PAL[f.Palette]
  const S = Math.min(W, H)
  const P = S / 1000

  const rl = stream(hash, 'layout')
  const rd = stream(hash, 'doors')
  const rf = stream(hash, 'furniture')
  const ra = stream(hash, 'annot')
  const rp = stream(hash, 'paper')

  const plan = buildPlan(f.Footprint as Footprint, f.Program as Program, rl, rd)
  const schematic = f.Detail === 'Schematic'
  const construction = f.Detail === 'Construction'
  const flats = f.Program === 'Flats'
  const pieces: Piece[] = schematic ? [] : furnish(plan, rf)
  // the building in three dimensions, for the elevations and the section
  const mass = massing(plan, flats, construction, stream(hash, 'sheet'))
  const vols = masses(plan.zones)

  // annotation choices, in a fixed order
  const mirX = chance(ra, 0.5)
  const mirY = chance(ra, 0.5)
  const north = ra() * Math.PI * 2
  const sectionAt = ra()
  const sectionV = chance(ra, 0.45)
  const sectionAt2 = ra()
  const cursor = [ra(), ra()]

  // extents of the drawing in plan units
  const b = plan.bbox
  const E: Box = { ...b }
  const grow = (q: Rect | null) => {
    if (!q)
      return
    E.x0 = Math.min(E.x0, q.x0)
    E.y0 = Math.min(E.y0, q.y0)
    E.x1 = Math.max(E.x1, q.x1)
    E.y1 = Math.max(E.y1, q.y1)
  }
  grow(plan.terrace)
  const near = 5
  const far = 9
  const mTL = construction ? far + 5.8 : far + 1.6
  const mBR = construction ? far + 1.6 : 4.5
  const X0 = E.x0 - mTL
  const Y0 = E.y0 - mTL
  const X1 = E.x1 + mBR
  const Y1 = E.y1 + mBR
  const ew = X1 - X0
  const eh = Y1 - Y0

  // sheet layout in pixels: the plan, and the other drawings that fill the sheet
  const fi = 0.035 * S
  const bh = 0.08 * S
  const pad = 0.025 * S
  const ax0 = fi + pad
  const ay0 = fi + pad
  const aw = W - 2 * (fi + pad)
  const ah = H - 2 * fi - bh - 1.5 * pad
  const lay = chooseLayout({
    area: { x: ax0, y: ay0, w: aw, h: ah },
    ew,
    eh,
    bw: b.x1 - b.x0,
    bh: b.y1 - b.y0,
    elevH: elevationHeight(vols, mass),
    schedule: scheduleSize(plan, flats),
    row: mass.row,
  })
  const { rot, k } = lay
  const mx = mirX ? -1 : 1
  const my = mirY ? -1 : 1

  paper(g, W, H, S, pal, rp)

  const toPlan = () => {
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.translate(lay.plan.x + lay.plan.w / 2, lay.plan.y + lay.plan.h / 2)
    g.rotate((rot * Math.PI) / 2)
    g.scale(k * mx, k * my)
    g.translate(-(X0 + X1) / 2, -(Y0 + Y1) / 2)
  }
  toPlan()
  // kraft takes a heavier pen: mid-tone paper eats thin lines
  const heavy = pal.kind === 'kraft' ? 1.35 : 1
  const u = (px: number) => (px * P * heavy) / k // pen width in plan units
  g.lineCap = 'butt'
  g.lineJoin = 'round'

  // drafting grid, 1 m and 5 m, over the whole canvas
  if (pal.grid && pal.grid2) {
    const inv = g.getTransform().inverse()
    let gx0 = Infinity
    let gy0 = Infinity
    let gx1 = -Infinity
    let gy1 = -Infinity
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const p = inv.transformPoint({ x: cx, y: cy })
      gx0 = Math.min(gx0, p.x)
      gy0 = Math.min(gy0, p.y)
      gx1 = Math.max(gx1, p.x)
      gy1 = Math.max(gy1, p.y)
    }
    const m = 10 / 3
    for (const major of [false, true]) {
      const st = major ? m * 5 : m
      g.strokeStyle = major ? pal.grid2 : pal.grid
      g.lineWidth = u(major ? 0.8 : 0.5)
      g.beginPath()
      for (let x = Math.ceil(gx0 / st) * st; x <= gx1; x += st) {
        g.moveTo(x, gy0)
        g.lineTo(x, gy1)
      }
      for (let y = Math.ceil(gy0 / st) * st; y <= gy1; y += st) {
        g.moveTo(gx0, y)
        g.lineTo(gx1, y)
      }
      g.stroke()
    }
  }

  // structural grid axes, under everything else
  if (construction) {
    // one axis per zone edge, thinned so that no two bubbles touch
    const thin = (vs: number[]) => {
      const out: number[] = []
      for (const v of [...new Set(vs)].sort((p, q) => p - q)) {
        if (!out.length || v - out[out.length - 1] >= 3.6)
          out.push(v)
      }
      return out
    }
    const xs = thin(plan.zones.flatMap(z => [z.x0, z.x1]))
    const ys = thin(plan.zones.flatMap(z => [z.y0, z.y1]))
    const by = E.y0 - far - 3.6
    const bx = E.x0 - far - 3.6
    g.strokeStyle = pal.dim
    g.globalAlpha = 0.55
    g.lineWidth = u(0.5)
    g.setLineDash([2.4, 0.5, 0.35, 0.5])
    g.beginPath()
    for (const x of xs) {
      g.moveTo(x, by + 1.5)
      g.lineTo(x, E.y1 + 2)
    }
    for (const y of ys) {
      g.moveTo(bx + 1.5, y)
      g.lineTo(E.x1 + 2, y)
    }
    g.stroke()
    g.setLineDash([])
    g.globalAlpha = 1
    g.lineWidth = u(0.8)
    for (const x of xs) {
      g.beginPath()
      g.arc(x, by, 1.5, 0, Math.PI * 2)
      g.stroke()
      g.save()
      g.translate(x, by)
      dashes(g, 0, 0, 0.9, ra)
      g.restore()
    }
    for (const y of ys) {
      g.beginPath()
      g.arc(bx, y, 1.5, 0, Math.PI * 2)
      g.stroke()
      g.save()
      g.translate(bx, y)
      dashes(g, 0, 0, 0.9, ra)
      g.restore()
    }
  }

  // site: courtyard paving and a tree, the terrace deck
  if (plan.court) {
    const c = plan.court
    paving(g, { x0: c.x0 + 0.6, y0: c.y0 + 0.6, x1: c.x1 - 0.6, y1: c.y1 }, pal, u(0.45))
    const tr = Math.min(c.x1 - c.x0, c.y1 - c.y0) * 0.28
    tree(g, (c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2 + 0.5, Math.max(2.2, tr), pal, u(0.8), u(0.45), ra)
  }
  if (plan.terrace)
    terrace(g, plan.terrace, pal, u(0.9), u(0.4))

  // floors
  if (schematic)
    zoning(g, plan, pal)
  else
    tiles(g, plan, pal, u(0.4))

  // furniture
  const pens = { fill: pal.kind === 'cad' ? pal.bg : pal.bg, line: pal.furn, lw: u(0.75), fine: u(0.45) }
  if (pal.kind === 'vellum' || pal.kind === 'kraft')
    pens.fill = 'rgba(0, 0, 0, 0)'
  for (const p of pieces) drawPiece(g, p, pens)

  stairs(g, plan, pal, u(0.9), u(0.55))
  walls(g, plan, pal, f.Poché as Poche, u(pal.kind === 'kraft' ? 1.4 : 1.15), u(pal.kind === 'kraft' ? 0.6 : 0.5))
  openings(g, plan, pal, { door: u(1.1), arc: u(0.55), fine: u(0.6), glass: u(0.7) })

  // room "names": dashes, clear of the furniture
  const taken: Rect[] = pieces.map((p) => {
    const lx0 = -p.w / 2
    const lx1 = p.w / 2
    const ly1 = p.d
    if (p.rot === 0)
      return { x0: p.x + lx0, x1: p.x + lx1, y0: p.y, y1: p.y + ly1 }
    if (p.rot === 2)
      return { x0: p.x - lx1, x1: p.x - lx0, y0: p.y - ly1, y1: p.y }
    if (p.rot === 1)
      return { x0: p.x - ly1, x1: p.x, y0: p.y + lx0, y1: p.y + lx1 }
    return { x0: p.x, x1: p.x + ly1, y0: p.y - lx1, y1: p.y - lx0 }
  })
  g.strokeStyle = pal.dim
  g.lineWidth = u(schematic ? 1.1 : 0.8)
  g.lineCap = 'round'
  for (const q of plan.rooms) {
    // keep the dashes upright on screen when the plan is mirrored
    roomLabel(g, q, plan.inner[q.id], taken, ra, schematic)
  }
  g.lineCap = 'butt'

  // dimension chains
  const sides = construction ? [0, 3, 2, 1] : [0, 3]
  for (const sd of sides) {
    const pos: number[] = []
    const from: number[] = []
    const out = sd === 0 || sd === 3 ? -1 : 1
    for (const q of plan.rooms) {
      for (const [a0, a1] of plan.ext[q.id][sd]) {
        const c = sd === 0 ? q.y0 : sd === 1 ? q.x1 : sd === 2 ? q.y1 : q.x0
        for (const p of [a0, a1]) {
          const i = pos.indexOf(p)
          if (i < 0) {
            pos.push(p)
            from.push(c + out * 0.6)
          }
          else {
            from[i] = out < 0 ? Math.min(from[i], c + out * 0.6) : Math.max(from[i], c + out * 0.6)
          }
        }
      }
    }
    if (pos.length < 2)
      continue
    const horiz = sd === 0 || sd === 2
    const base = sd === 0 ? E.y0 : sd === 1 ? E.x1 : sd === 2 ? E.y1 : E.x0
    const overall: [number, number] = horiz ? [b.x0 - 0.6, b.x1 + 0.6] : [b.y0 - 0.6, b.y1 + 0.6]
    dimChain(g, sd, { pos, from }, base + out * near, overall, base + out * far, pal, { fine: u(0.5), tick: u(1.1) }, ra)
  }

  // section marks: the construction cuts, and the cut drawn in the section panel
  const cutAt = (o: 0 | 1, t: number) => {
    const lo = o === 0 ? b.y0 : b.x0
    const hi = o === 0 ? b.y1 : b.x1
    const pref = Math.round(lo + (hi - lo) * (0.25 + 0.5 * t)) + 0.5
    // never along a wall running the same way
    for (let d = 0; d < hi - lo; d++) {
      for (const c of [pref + d, pref - d]) {
        if (c > lo + 1 && c < hi - 1 && !plan.walls.some(w => w.o === o && Math.abs(w.c - c) < w.t / 2 + 0.3))
          return c
      }
    }
    return pref
  }
  const cuts: Array<[0 | 1, number]> = []
  if (construction) {
    cuts.push([0, cutAt(0, sectionAt)])
    if (sectionV)
      cuts.push([1, cutAt(1, sectionAt2)])
  }
  let secCut: [0 | 1, number] | null = null
  if (lay.panels.some(p => p.kind === 'section')) {
    // the cut that runs across the sheet, so the section lines up under the plan
    const o: 0 | 1 = rot ? 1 : 0
    // through the widest part of the building, near the chosen place if it is wide enough
    const width = (c: number) => plan.zones.reduce((w, z) => {
      const [lo, hi] = o === 0 ? [z.y0, z.y1] : [z.x0, z.x1]
      return c > lo && c < hi ? w + (o === 0 ? z.x1 - z.x0 : z.y1 - z.y0) : w
    }, 0)
    const ts = [o ? sectionAt2 : sectionAt]
    for (let t = -0.4; t <= 1.4; t += 0.1) ts.push(t)
    const cs = ts.map(t => cutAt(o, Math.max(-0.45, Math.min(1.45, t))))
    // the cut that crosses the most building; the chosen place wins ties
    const most = Math.max(...cs.map(width))
    secCut = [o, cs.find(c => width(c) >= most - 1e-6)!]
    const same = cuts.findIndex(c => c[0] === o)
    if (same >= 0)
      cuts[same] = secCut
    else
      cuts.push(secCut)
  }
  {
    g.strokeStyle = pal.accent
    g.fillStyle = pal.accent
    for (const cutLine of cuts) {
      const [o, c] = cutLine
      // the section panel looks towards the top of the sheet: so do its arrows
      const Mt = g.getTransform()
      const up = o === 0 ? -Mt.d : -Mt.b
      const av = cutLine === secCut && up > 0 ? 1.6 : -1.6
      const a = (o === 0 ? E.x0 : E.y0) - 4
      const z = (o === 0 ? E.x1 : E.y1) + 4
      const P2 = (s: number, v: number): [number, number] => o === 0 ? [s, c + v] : [c + v, s]
      g.lineWidth = u(0.6)
      g.setLineDash([3, 0.6, 0.4, 0.6])
      g.beginPath()
      g.moveTo(...P2(a, 0))
      g.lineTo(...P2(z, 0))
      g.stroke()
      g.setLineDash([])
      g.lineWidth = u(2)
      for (const end of [a, z]) {
        const dir = end === a ? 1 : -1
        g.beginPath()
        g.moveTo(...P2(end, 0))
        g.lineTo(...P2(end + dir * 3, 0))
        g.stroke()
        g.beginPath()
        g.moveTo(...P2(end + dir * 0.3, 0))
        g.lineTo(...P2(end + dir * 2.3, 0))
        g.lineTo(...P2(end + dir * 1.3, av))
        g.closePath()
        g.fill()
      }
    }
  }

  // entrance arrow
  if (plan.entrance) {
    const e = plan.entrance
    g.fillStyle = pal.kind === 'cad' ? pal.accent : pal.ink
    const tx = e.x + e.nx * 1.1
    const ty = e.y + e.ny * 1.1
    g.beginPath()
    g.moveTo(tx, ty)
    g.lineTo(tx - e.nx * 1.8 - e.ny * 0.8, ty - e.ny * 1.8 - e.nx * 0.8)
    g.lineTo(tx - e.nx * 1.8 + e.ny * 0.8, ty - e.ny * 1.8 + e.nx * 0.8)
    g.closePath()
    g.fill()
  }

  // ---- sheet, in pixels
  const M = g.getTransform()
  const Pk = P * heavy
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.lineCap = 'butt'

  // the other drawings of the sheet, each in plan units at the plan's scale
  const ink: Ink = { pal, pen: px => (px * P * heavy) / k, rng: stream(hash, 'panels'), shade: pal.kind === 'vellum' || pal.kind === 'kraft' }
  // the building's left edge on the sheet, to centre a free-standing front view or section
  let bLeft = Infinity
  let bRight = -Infinity
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    bLeft = Math.min(bLeft, M.a * x + M.c * y + M.e)
    bRight = Math.max(bRight, M.a * x + M.c * y + M.e)
  }
  for (const pn of lay.panels) {
    g.setTransform(k, 0, 0, k, pn.box.x, pn.box.y)
    const ox = pn.aligned ? pn.box.x : bLeft - (pn.box.w - (bRight - bLeft)) / 2
    if (pn.kind === 'front' || pn.kind === 'side')
      elevation(g, { plan, ms: vols, M, k, view: pn.kind, box: pn.box, ox, m: mass, ink })
    else if (pn.kind === 'section' && secCut)
      section(g, { plan, ms: vols, M, k, box: pn.box, ox, m: mass, ink, poche: f.Poché as Poche, cut: secCut })
    else if (pn.kind === 'schedule')
      schedule(g, plan, flats, schematic, f.Poché as Poche, t => zoneColor(t, pal), ink)
  }
  if (lay.caption) {
    const c = lay.caption
    let left = Infinity
    let right = -Infinity
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const sx = M.a * x + M.c * y + M.e
      left = Math.min(left, sx)
      right = Math.max(right, sx)
    }
    g.setTransform(k, 0, 0, k, c.x, c.y)
    caption(g, (left - c.x) / k, c.h / k / 2, ink, Math.min(14, (right - left) / k * 0.35))
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.lineJoin = 'round'
  if (pal.kind === 'cad') {
    // crosshair cursor and a pick box, as on a live CAD screen
    const cx = ax0 + aw * (0.15 + 0.7 * cursor[0])
    const cy = ay0 + ah * (0.15 + 0.7 * cursor[1])
    g.strokeStyle = 'rgba(236, 236, 236, 0.55)'
    g.lineWidth = P * 0.8
    g.beginPath()
    g.moveTo(0, cy)
    g.lineTo(W, cy)
    g.moveTo(cx, 0)
    g.lineTo(cx, H - fi - bh * 0.5)
    g.stroke()
    g.strokeRect(cx - P * 6, cy - P * 6, P * 12, P * 12)
    g.strokeStyle = 'rgba(236, 236, 236, 0.35)'
    g.lineWidth = P
    g.strokeRect(fi * 0.6, fi * 0.6, W - fi * 1.2, H - fi * 1.2)
  }
  else {
    g.strokeStyle = pal.ink
    g.lineWidth = Pk * 0.7
    g.strokeRect(fi * 0.62, fi * 0.62, W - fi * 1.24, H - fi * 1.24)
    g.lineWidth = Pk * 2.2
    g.strokeRect(fi, fi, W - 2 * fi, H - 2 * fi)
    g.lineWidth = Pk * 0.8
    g.beginPath()
    g.moveTo(fi, H - fi - bh)
    g.lineTo(W - fi, H - fi - bh)
    g.stroke()
  }

  // north arrow: the plan's north, turned by the same transform as the plan
  const nx = Math.sin(north)
  const ny = -Math.cos(north)
  const sxv = M.a * nx + M.c * ny
  const syv = M.b * nx + M.d * ny
  const nang = Math.atan2(sxv, -syv)
  const by = H - fi - bh / 2
  const nr = 0.021 * S
  northArrow(g, fi + 0.025 * S + nr, by + nr * 0.12, nr, nang, pal, Pk * 1.1)
  // scale bar: five metres at the plan scale
  const metre = k / 0.3
  const sbx = fi + 0.025 * S + nr * 2 + 0.03 * S
  scaleBar(g, sbx, by - P * 4, metre, P * 8, pal, Pk * 0.8)
  const tbw = Math.min(0.42 * S, (W - 2 * fi) * 0.46)
  const tbh = bh * 0.72
  if (pal.kind === 'cad') {
    // command line instead of a title block
    g.fillStyle = 'rgba(255, 255, 255, 0.06)'
    g.fillRect(W - fi - tbw, by - tbh / 2, tbw, tbh)
    g.strokeStyle = 'rgba(236, 236, 236, 0.5)'
    g.lineWidth = P * 1.6
    g.save()
    const s = tbh / 10
    g.translate(W - fi - tbw, by - tbh / 2)
    g.scale(s, s)
    g.lineWidth = (P * 1.6) / s
    for (let i = 0; i < 3; i++) {
      const len = tbw / s * range(ra, 0.25, 0.7)
      dashes(g, 0.8 + len / 2, 2.4 + i * 2.8, len, ra)
    }
    g.restore()
  }
  else {
    titleBlock(g, W - fi - tbw - 0.012 * S, by - tbh / 2, tbw, tbh, pal, Pk * 0.8, ra)
  }
  g.globalAlpha = 1
}

export default {
  slug: 'floorplan',
  title: 'Floorplan',
  summary: 'Architectural plans of houses and flats that were never built: rooms carved by treemaps, door swings, wall poché and dimension chains, with elevations and sections filling the sheet, on vellum, blueprint, kraft or a CAD screen.',
  order: 640,
  traits: TRAITS,
  features,
  render,
  // Seed-of-seeds 0xf1007b1a ("gallery" stream, 64-hex candidates): the
  // first hash found for each of 12 palette x footprint pairs, with a
  // vellum courtyard house moved to the front as the cover.
  gallery: [
    '0x7262edc526f73f7b66f748b9eff8fd342a67c3ef8b824946c9dd5ac6a3b4c410',
    '0x6f9a27f833cf98f4125db70df05e04f4a357c053633a6cf7cded19e25bc8fed8',
    '0x7bb65ad31df92f3cddec60a75b342e381f212d14bce791d592a3e428098cf746',
    '0x0c6cbaa1a784aef3e0b4614d36aaa1fbe2132b983824cde3a1ef3cf2ddc43cb7',
    '0xa5c4fc06218c0f44dab30cdb0c8c97803c98f42a285270166fb1cef12b99f4e3',
    '0xb563c1f89a2e9fbdfdcd7d48b9e0f527745d8bc1b1b9a62e1a4fef7f043a4985',
    '0xa9b79a253601b424c175fbd82c134ab99d3920ba0ec9e35c6428cc4c8c2c9eb3',
    '0x3e7ee2e29b8d449bfff7bac7686e380a905d9535153ce8eca008510b597dda4d',
    '0x8db5219f16fbcbd1070087e3ad81489fffb6ee4036936e866e011e39d15168c8',
    '0x4c1e278605e2eee637577463d95b0d6d0ce2dd762d1dc34867c6c71186b45dd1',
    '0xf7f86dd3905bc5783bf00b38755d0574118239f03f57a9590ee370bf869847e1',
    '0x4fe36c8998aa868371538c5590f539fedbfb23b799cb3f154ae35c7cf8b50265',
  ],
} satisfies Series
