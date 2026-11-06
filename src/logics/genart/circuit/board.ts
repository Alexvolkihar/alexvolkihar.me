// Board model for the "Circuit" series: footprints, placement, netlist and
// routing. Everything is measured in routing cells (cell centres on integer
// coordinates); the renderer maps one cell to a fixed fraction of the canvas
// short side.

import type { Rng } from '../random'
import type { Cell, RouteOptions } from './route'
import { chance, int, pick, range } from '../random'
import { DX, DY, Router } from './route'

export type Shape = 'rect' | 'round' | 'oval'
export type Role = 'sig' | 'gnd' | 'vcc' | 'none'
export type Kind
  = | 'qfp' | 'qfn' | 'soic' | 'tsop' | 'dip' | 'chip' | 'sot23' | 'diode' | 'led'
    | 'elco' | 'xtal' | 'header' | 'to220' | 'inductor' | 'terminal' | 'trimpot'
    | 'film' | 'tp' | 'fid' | 'hole' | 'edge'

export interface Box { x0: number, y0: number, x1: number, y1: number }

export interface Pad {
  id: number
  part: Part
  /** Pin number, from 1. */
  n: number
  /** Anchor cell. */
  x: number
  y: number
  /** Drawn centre and size. */
  px: number
  py: number
  w: number
  h: number
  shape: Shape
  th: boolean
  drill: number
  /** Outward direction of an IC lead: 0 E, 1 N, 2 W, 3 S; -1 none. */
  side: number
  role: Role
  net: number
  cells: number[]
  used: boolean
}

export interface Part {
  id: number
  kind: Kind
  prefix: string
  ref: string
  x: number
  y: number
  rot: number
  body: Box
  keep: Box
  pads: Pad[]
  populated: boolean
  /** Pins per side for ICs, pin count for headers, size class for chips. */
  k: number
  /** 'r' resistor, 'c' capacitor, ... */
  sub: string
  /** Two rows for headers, colour index for LEDs and plastic bodies. */
  variant: number
  mark: string
}

export interface Track { net: number, w: number, cells: Cell[] }
export interface Via { x: number, y: number, net: number, gnd: boolean, d: number }
export interface Label { text: string, x: number, y: number, h: number, vertical: boolean }

export type Layout = 'Logic' | 'Analog' | 'Power' | 'Memory'
export type Routing = 'Right-angle' | 'Mitred' | 'Rounded' | 'Two-layer'
export type Assembly = 'Bare' | 'Populated' | 'Partial'

export interface BoardSpec {
  cols: number
  rows: number
  /** Routing cells per canvas short side, for density scaling. */
  perSide: number
  layout: Layout
  routing: Routing
  assembly: Assembly
  pour: boolean
  traceW: number
  powerW: number
  labelH: number
}

export interface Board {
  spec: BoardSpec
  parts: Part[]
  pads: Pad[]
  tracks: Track[]
  vias: Via[]
  labels: Label[]
  title: Label[]
  router: Router
}

interface LPad { x: number, y: number, w: number, h: number, shape: Shape, th: boolean, drill: number, side: number, role: Role, ox: number, oy: number }
interface Fp { pads: LPad[], body: Box, margin: number }

function lp(x: number, y: number, w: number, h: number, o: Partial<LPad> = {}): LPad {
  return { x, y, w, h, shape: 'rect', th: false, drill: 0, side: -1, role: 'sig', ox: 0, oy: 0, ...o }
}

// ---------------------------------------------------------------------------
// Footprints, in cells (one cell is about 0.635 mm, so the 1.27 mm SOIC pitch
// is 2 cells, the 2.54 mm header pitch 4 cells).
// ---------------------------------------------------------------------------

function fpQuad(k: number, qfn: boolean): Fp {
  const a0 = -Math.floor((k - 1) / 2)
  const a1 = a0 + k - 1
  const off = qfn ? 2 : 3
  const len = qfn ? 1.3 : 2
  const push = qfn ? 0.2 : 0.3
  const pads: LPad[] = []
  const role = (i: number): Role => {
    if (k < 6)
      return 'sig'
    if (i === Math.floor(k / 2))
      return 'gnd'
    if (i === Math.floor(k / 2) - 1)
      return 'vcc'
    return 'sig'
  }
  for (let i = 0; i < k; i++)
    pads.push(lp(a0 - off, a0 + i, len, 0.55, { side: 2, ox: -push, role: role(i) }))
  for (let i = 0; i < k; i++)
    pads.push(lp(a0 + i, a1 + off, 0.55, len, { side: 3, oy: push, role: role(i) }))
  for (let i = 0; i < k; i++)
    pads.push(lp(a1 + off, a1 - i, len, 0.55, { side: 0, ox: push, role: role(i) }))
  for (let i = 0; i < k; i++)
    pads.push(lp(a1 - i, a0 - off, 0.55, len, { side: 1, oy: -push, role: role(i) }))
  const e = qfn ? off + 0.35 : off - 1.1
  if (qfn) {
    const c = (a0 + a1) / 2
    const t = lp(Math.round(c), Math.round(c), k - 2, k - 2, { role: 'gnd' })
    t.ox = c - Math.round(c)
    t.oy = c - Math.round(c)
    pads.push(t)
  }
  return { pads, body: { x0: a0 - e, y0: a0 - e, x1: a1 + e, y1: a1 + e }, margin: 2 }
}

function fpDual(k: number, pitch: number, rowY: number, padW: number, th: boolean): Fp {
  const base = -Math.floor(pitch * (k - 1) / 2)
  const pads: LPad[] = []
  for (let i = 0; i < k; i++) {
    const x = base + pitch * i
    pads.push(th
      ? lp(x, rowY, 2.2, 2.2, { shape: i === 0 ? 'rect' : 'round', th: true, drill: 1, side: 3, role: i === k - 1 ? 'gnd' : 'sig' })
      : lp(x, rowY, padW, 2, { side: 3, oy: 0.25, role: i === k - 1 ? 'gnd' : 'sig' }))
  }
  for (let i = 0; i < k; i++) {
    const x = base + pitch * (k - 1 - i)
    pads.push(th
      ? lp(x, -rowY, 2.2, 2.2, { shape: 'round', th: true, drill: 1, side: 1, role: i === k - 1 ? 'vcc' : 'sig' })
      : lp(x, -rowY, padW, 2, { side: 1, oy: -0.25, role: i === k - 1 ? 'vcc' : 'sig' }))
  }
  const x0 = base
  const x1 = base + pitch * (k - 1)
  const ex = th ? 2.4 : pitch === 2 ? 1.3 : 1.2
  const ey = th ? rowY - 1.8 : rowY - 1.55
  return { pads, body: { x0: x0 - ex, y0: -ey, x1: x1 + ex, y1: ey }, margin: 2 }
}

function fpChip(size: number): Fp {
  if (size === 0)
    return { pads: [lp(-1, 0, 0.9, 1.1), lp(1, 0, 0.9, 1.1)], body: { x0: -1.4, y0: -0.65, x1: 1.4, y1: 0.65 }, margin: 1 }
  return { pads: [lp(-2, 0, 1.5, 2), lp(2, 0, 1.5, 2)], body: { x0: -2.5, y0: -1.05, x1: 2.5, y1: 1.05 }, margin: 1 }
}

function footprint(kind: Kind, k: number, variant: number): Fp {
  switch (kind) {
    case 'qfp': return fpQuad(k, false)
    case 'qfn': return fpQuad(k, true)
    case 'soic': return fpDual(k, 2, 4, 1, false)
    case 'tsop': return fpDual(k, 1, 5, 0.55, false)
    case 'dip': return fpDual(k, 4, 6, 0, true)
    case 'chip':
    case 'led': return fpChip(k)
    case 'sot23':
      return { pads: [lp(-1, 2, 0.8, 1.1), lp(1, 2, 0.8, 1.1), lp(0, -2, 0.8, 1.1)], body: { x0: -1.5, y0: -0.8, x1: 1.5, y1: 0.8 }, margin: 1 }
    case 'diode':
      return { pads: [lp(-3, 0, 2, 2.2), lp(3, 0, 2, 2.2)], body: { x0: -2.8, y0: -1.5, x1: 2.8, y1: 1.5 }, margin: 1 }
    case 'elco': {
      const r = k ? 6.5 : 4
      const p = k ? 3 : 2
      const d = k ? 2.5 : 1.9
      return {
        pads: [lp(-p, 0, d, d, { th: true, drill: d * 0.5 }), lp(p, 0, d, d, { shape: 'round', th: true, drill: d * 0.5, role: 'gnd' })],
        body: { x0: -r, y0: -r, x1: r, y1: r },
        margin: 1,
      }
    }
    case 'xtal':
      return { pads: [lp(-3, 0, 1.8, 1.8, { shape: 'round', th: true, drill: 0.9 }), lp(3, 0, 1.8, 1.8, { shape: 'round', th: true, drill: 0.9 })], body: { x0: -5.4, y0: -2.2, x1: 5.4, y1: 2.2 }, margin: 1 }
    case 'header': {
      const pads: LPad[] = []
      const rows = variant ? 2 : 1
      for (let i = 0; i < k; i++) {
        for (let j = 0; j < rows; j++) {
          const y = rows === 2 ? (j ? 2 : -2) : 0
          pads.push(lp(4 * i - 2 * (k - 1), y, 2.6, 2.6, { shape: i + j === 0 ? 'rect' : 'round', th: true, drill: 1.3, role: i === k - 1 && j === rows - 1 ? 'gnd' : 'sig' }))
        }
      }
      const ex = 2 * (k - 1) + 2
      const ey = rows === 2 ? 4 : 2
      return { pads, body: { x0: -ex, y0: -ey, x1: ex, y1: ey }, margin: 1 }
    }
    case 'to220':
      return {
        pads: [-4, 0, 4].map((x, i) => lp(x, 0, 2, 3.2, { shape: 'oval', th: true, drill: 1.2, role: i === 1 ? 'gnd' : 'sig' })),
        body: { x0: -5.2, y0: -15, x1: 5.2, y1: -2.2 },
        margin: 1,
      }
    case 'inductor':
      return { pads: [lp(-5, 0, 3, 5), lp(5, 0, 3, 5)], body: { x0: -6, y0: -6, x1: 6, y1: 6 }, margin: 1 }
    case 'terminal': {
      const pads: LPad[] = []
      for (let i = 0; i < k; i++)
        pads.push(lp(8 * i - 4 * (k - 1), 0, 3.4, 3.4, { shape: 'round', th: true, drill: 1.6, role: i === k - 1 ? 'gnd' : 'sig' }))
      const ex = 4 * (k - 1) + 4
      return { pads, body: { x0: -ex, y0: -5.5, x1: ex, y1: 4.5 }, margin: 1 }
    }
    case 'trimpot':
      return {
        pads: [lp(-4, 3, 1.9, 1.9, { shape: 'round', th: true, drill: 0.9 }), lp(0, -3, 1.9, 1.9, { shape: 'round', th: true, drill: 0.9 }), lp(4, 3, 1.9, 1.9, { shape: 'round', th: true, drill: 0.9 })],
        body: { x0: -5, y0: -5, x1: 5, y1: 5 },
        margin: 1,
      }
    case 'film':
      return { pads: [lp(-5, 0, 1.9, 1.9, { shape: 'round', th: true, drill: 0.9 }), lp(5, 0, 1.9, 1.9, { shape: 'round', th: true, drill: 0.9 })], body: { x0: -6.8, y0: -2.4, x1: 6.8, y1: 2.4 }, margin: 1 }
    case 'tp':
      return { pads: [lp(0, 0, 1.5, 1.5, { shape: 'round' })], body: { x0: -1, y0: -1, x1: 1, y1: 1 }, margin: 1 }
    case 'fid':
      return { pads: [lp(0, 0, 1.1, 1.1, { shape: 'round', role: 'none' })], body: { x0: -1.7, y0: -1.7, x1: 1.7, y1: 1.7 }, margin: 1 }
    case 'hole':
      return { pads: [lp(0, 0, 6, 6, { shape: 'round', th: true, drill: 3.3, role: 'gnd' })], body: { x0: -3.6, y0: -3.6, x1: 3.6, y1: 3.6 }, margin: 0 }
    case 'edge':
      return { pads: [], body: { x0: 0, y0: 0, x1: 0, y1: 0 }, margin: 0 }
  }
}

const PREFIX: Record<Kind, string> = {
  qfp: 'U',
  qfn: 'U',
  soic: 'U',
  tsop: 'U',
  dip: 'U',
  chip: 'R',
  sot23: 'Q',
  diode: 'D',
  led: 'D',
  elco: 'C',
  xtal: 'Y',
  header: 'J',
  to220: 'U',
  inductor: 'L',
  terminal: 'J',
  trimpot: 'RV',
  film: 'C',
  tp: 'TP',
  fid: '',
  hole: '',
  edge: '',
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildBoard(spec: BoardSpec, place: Rng, nets: Rng, silk: Rng): Board {
  const { cols, rows } = spec
  const taken = new Uint8Array(cols * rows)
  const parts: Part[] = []
  const pads: Pad[] = []
  const A = (cols * rows) / (spec.perSide * spec.perSide)
  const minSide = Math.min(cols, rows)

  function rotBox(b: Box): Box {
    return { x0: -b.y1, y0: b.x0, x1: -b.y0, y1: b.x1 }
  }

  function tryPart(kind: Kind, k: number, variant: number, cx: number, cy: number, rot: number, edge = 3): Part | null {
    const fp = footprint(kind, k, variant)
    let lps = fp.pads
    let body = fp.body
    if (rot) {
      lps = lps.map(p => ({ ...p, x: -p.y, y: p.x, w: p.h, h: p.w, ox: -p.oy, oy: p.ox, side: p.side < 0 ? -1 : (p.side + 3) % 4 }))
      body = rotBox(body)
    }
    let bx0 = body.x0
    let by0 = body.y0
    let bx1 = body.x1
    let by1 = body.y1
    for (const p of lps) {
      bx0 = Math.min(bx0, p.x + p.ox - p.w / 2)
      by0 = Math.min(by0, p.y + p.oy - p.h / 2)
      bx1 = Math.max(bx1, p.x + p.ox + p.w / 2)
      by1 = Math.max(by1, p.y + p.oy + p.h / 2)
    }
    const kx0 = Math.floor(cx + bx0 + 0.3)
    const ky0 = Math.floor(cy + by0 + 0.3)
    const kx1 = Math.ceil(cx + bx1 - 0.3)
    const ky1 = Math.ceil(cy + by1 - 0.3)
    const m = fp.margin
    if (kx0 - m < edge || ky0 - m < edge || kx1 + m > cols - 1 - edge || ky1 + m > rows - 1 - edge)
      return null
    for (let y = ky0 - m; y <= ky1 + m; y++) {
      for (let x = kx0 - m; x <= kx1 + m; x++) {
        if (taken[y * cols + x])
          return null
      }
    }
    for (let y = ky0; y <= ky1; y++) {
      for (let x = kx0; x <= kx1; x++)
        taken[y * cols + x] = 1
    }
    const part: Part = {
      id: parts.length,
      kind,
      prefix: PREFIX[kind],
      ref: '',
      x: cx,
      y: cy,
      rot,
      body: { x0: cx + body.x0, y0: cy + body.y0, x1: cx + body.x1, y1: cy + body.y1 },
      keep: { x0: kx0, y0: ky0, x1: kx1, y1: ky1 },
      pads: [],
      populated: false,
      k,
      sub: '',
      variant,
      mark: '',
    }
    lps.forEach((p, i) => addPad(part, i + 1, cx + p.x, cy + p.y, p))
    parts.push(part)
    return part
  }

  function addPad(part: Part, n: number, x: number, y: number, p: Omit<LPad, 'x' | 'y'>) {
    const pad: Pad = {
      id: pads.length,
      part,
      n,
      x,
      y,
      px: x + p.ox,
      py: y + p.oy,
      w: p.w,
      h: p.h,
      shape: p.shape,
      th: p.th,
      drill: p.drill,
      side: p.side,
      role: p.role,
      net: 0,
      cells: [],
      used: false,
    }
    const ex = p.w / 2 + 0.3 + 1e-9
    const ey = p.h / 2 + 0.3 + 1e-9
    for (let cy = Math.ceil(pad.py - ey); cy <= Math.floor(pad.py + ey); cy++) {
      for (let cx = Math.ceil(pad.px - ex); cx <= Math.floor(pad.px + ex); cx++) {
        if (cx >= 0 && cy >= 0 && cx < cols && cy < rows)
          pad.cells.push(cy * cols + cx)
      }
    }
    if (!pad.cells.includes(y * cols + x))
      pad.cells.push(y * cols + x)
    part.pads.push(pad)
    pads.push(pad)
    return pad
  }

  // Random candidate positions.
  const anywhere = (): [number, number] => [int(place, 3, cols - 4), int(place, 3, rows - 4)]
  const near = (p: Part, r0: number, r1: number) => (): [number, number] => {
    const a = place() * Math.PI * 2
    const r = range(place, r0, r1)
    const bx = (p.body.x1 - p.body.x0) / 2
    const by = (p.body.y1 - p.body.y0) / 2
    return [Math.round((p.body.x0 + p.body.x1) / 2 + Math.cos(a) * (bx + r)), Math.round((p.body.y0 + p.body.y1) / 2 + Math.sin(a) * (by + r))]
  }
  const nearEdge = (): [number, number] => {
    const side = int(place, 0, 3)
    const d = int(place, 5, 14)
    if (side === 0)
      return [d, int(place, 6, rows - 7)]
    if (side === 1)
      return [cols - 1 - d, int(place, 6, rows - 7)]
    if (side === 2)
      return [int(place, 6, cols - 7), d]
    return [int(place, 6, cols - 7), rows - 1 - d]
  }
  function put(kind: Kind, k: number, variant: number, cand: () => [number, number], tries = 40, rotP = 0.5): Part | null {
    for (let t = 0; t < tries; t++) {
      const [x, y] = cand()
      const rot = chance(place, rotP) ? 1 : 0
      const p = tryPart(kind, k, variant, x, y, rot)
      if (p)
        return p
    }
    return null
  }
  const n = (a: number, b: number) => Math.max(0, Math.round(range(place, a, b) * A))

  // Mounting holes in the corners, three fiducials beside them.
  const hm = 5
  for (const [x, y] of [[hm, hm], [cols - 1 - hm, hm], [hm, rows - 1 - hm], [cols - 1 - hm, rows - 1 - hm]])
    tryPart('hole', 0, 0, x, y, 0, 0)
  for (const [x, y] of [[hm + 9, hm - 1], [cols - hm, hm + 9], [hm - 1, rows - 1 - hm - 9]])
    tryPart('fid', 0, 0, x, y, 0, 1)

  const ics: Part[] = []
  const decouple: [Part, Part][] = []
  const pairs: [Part, Part][] = []
  let crystal: { x: Part, caps: Part[], ic: Part } | null = null
  let edgePads: Pad[] = []
  const series: [Part, Pad][] = []

  const chipSub = (p: Part | null, sub: string) => {
    if (p)
      p.sub = sub
    return p
  }
  const decoupleAll = (lo: number, hi: number, size = 0) => {
    for (const ic of ics) {
      const c = int(place, lo, hi)
      for (let i = 0; i < c; i++) {
        const cap = chipSub(put('chip', size, 0, near(ic, 1.5, 4), 30), 'c')
        if (cap)
          decouple.push([cap, ic])
      }
    }
  }
  const center = (f: number) => (): [number, number] => [
    Math.round(cols / 2 + (place() - 0.5) * cols * f),
    Math.round(rows / 2 + (place() - 0.5) * rows * f),
  ]

  if (spec.layout === 'Logic') {
    const main = put('qfp', pick(place, [8, 10, 12, 16]), 0, center(0.5), 60, 0)
    if (main)
      ics.push(main)
    const extra = Math.max(3, n(4, 7))
    for (let i = 0; i < extra; i++) {
      const kind = pick(place, ['soic', 'soic', 'qfp', 'qfn', 'tsop'] as Kind[])
      const k = kind === 'soic' ? pick(place, [4, 7, 8]) : kind === 'tsop' ? pick(place, [10, 14]) : pick(place, [6, 8])
      const p = put(kind, k, 0, anywhere, 60)
      if (p)
        ics.push(p)
    }
    if (main) {
      const x = put('xtal', 0, 0, near(main, 3, 9), 40)
      if (x) {
        const caps = [chipSub(put('chip', 0, 0, near(x, 1, 3), 30), 'c'), chipSub(put('chip', 0, 0, near(x, 1, 3), 30), 'c')].filter((p): p is Part => !!p)
        crystal = { x, caps, ic: main }
      }
    }
    decoupleAll(2, 4)
    for (let i = 0; i < Math.max(1, n(1.5, 3.2)); i++)
      put('header', int(place, 3, 8), chance(place, 0.4) ? 1 : 0, nearEdge, 40)
    for (let i = 0; i < n(2, 5); i++)
      put('sot23', 0, 0, anywhere)
    for (let i = 0; i < n(2, 4); i++) {
      const led = put('led', 0, int(place, 0, 3), anywhere)
      if (led) {
        const r = chipSub(put('chip', 0, 0, near(led, 1, 3), 30), 'r')
        if (r)
          pairs.push([led, r])
      }
    }
    for (let i = 0; i < n(50, 85); i++)
      chipSub(put('chip', chance(place, 0.2) ? 1 : 0, 0, ics.length && chance(place, 0.7) ? near(pick(place, ics), 1, 10) : anywhere), chance(place, 0.6) ? 'r' : 'c')
    for (let i = 0; i < n(3, 7); i++)
      put('tp', 0, 0, anywhere)
  }
  else if (spec.layout === 'Analog') {
    for (let i = 0; i < Math.max(2, n(3, 6)); i++) {
      const p = chance(place, 0.25) ? put('dip', 4, 0, center(0.8), 40, 0.3) : put('soic', 4, 0, center(0.8), 40, 0.3)
      if (p)
        ics.push(p)
    }
    decoupleAll(1, 2, 1)
    for (let i = 0; i < n(50, 80); i++)
      chipSub(put('chip', chance(place, 0.55) ? 1 : 0, 0, ics.length && chance(place, 0.75) ? near(pick(place, ics), 1, 16) : anywhere, 40, 0.5), chance(place, 0.7) ? 'r' : 'c')
    for (let i = 0; i < n(3, 7); i++)
      put('elco', 0, 0, anywhere)
    for (let i = 0; i < n(1, 4); i++)
      put('trimpot', 0, 0, anywhere, 40, 0)
    for (let i = 0; i < n(2, 4.5); i++)
      put('film', 0, int(place, 0, 2), anywhere)
    for (let i = 0; i < n(3, 7); i++)
      put('sot23', 0, 0, ics.length && chance(place, 0.6) ? near(pick(place, ics), 2, 14) : anywhere)
    for (let i = 0; i < n(2, 5); i++)
      put('diode', 0, 0, anywhere)
    for (let i = 0; i < Math.max(1, n(1, 2.4)); i++) {
      if (chance(place, 0.5))
        put('terminal', int(place, 2, 3), int(place, 0, 1), nearEdge)
      else
        put('header', int(place, 3, 6), 0, nearEdge)
    }
    for (let i = 0; i < n(1, 4); i++)
      put('tp', 0, 0, anywhere)
  }
  else if (spec.layout === 'Power') {
    for (let i = 0; i < Math.max(2, n(2, 4)); i++)
      put('to220', 0, 0, center(0.8), 40, 0.4)
    for (let i = 0; i < Math.max(1, n(1.5, 3)); i++)
      put('inductor', 0, 0, center(0.8))
    for (let i = 0; i < Math.max(2, n(3, 6)); i++)
      put('elco', 1, int(place, 0, 1), anywhere)
    for (let i = 0; i < Math.max(1, n(1.5, 3.5)); i++) {
      const p = put('soic', 4, 0, center(0.8), 40, 0.3)
      if (p)
        ics.push(p)
    }
    decoupleAll(1, 2, 0)
    for (let i = 0; i < Math.max(2, n(1.6, 3)); i++)
      put('terminal', int(place, 2, 3), int(place, 0, 1), nearEdge)
    for (let i = 0; i < n(3, 7); i++)
      put('diode', 0, 0, anywhere)
    for (let i = 0; i < n(26, 42); i++)
      chipSub(put('chip', chance(place, 0.7) ? 1 : 0, 0, ics.length && chance(place, 0.4) ? near(pick(place, ics), 1, 8) : anywhere), chance(place, 0.6) ? 'r' : 'c')
    for (let i = 0; i < n(1, 4); i++)
      put('elco', 0, 0, anywhere)
    for (let i = 0; i < n(1, 3); i++)
      put('film', 0, int(place, 0, 2), anywhere)
    for (let i = 0; i < n(2, 4); i++)
      put('sot23', 0, 0, anywhere)
    for (let i = 0; i < n(0.6, 2); i++) {
      const led = put('led', 1, int(place, 0, 3), anywhere)
      if (led) {
        const r = chipSub(put('chip', 1, 0, near(led, 1, 3), 30), 'r')
        if (r)
          pairs.push([led, r])
      }
    }
  }
  else {
    // Memory: gold fingers on the bottom edge, rows of identical chips above,
    // a row of series resistors between them.
    const fingerTop = rows - 1 - 8
    // between the two lower mounting holes
    const span = Math.floor((cols - 26) / 2)
    const f0 = Math.floor((cols - (span * 2 - 1)) / 2)
    const notch = Math.round(span * range(place, 0.3, 0.7))
    const edge = tryPart('edge', 0, 0, 0, 0, 0, -100)
    if (edge) {
      for (let i = 0; i < span; i++) {
        if (Math.abs(i - notch) <= 1)
          continue
        const x = f0 + i * 2
        addPad(edge, edge.pads.length + 1, x, fingerTop + 4, lp(0, 0, 1.25, 7.6, { side: 3, oy: 0.6, role: i % 9 === 4 ? 'gnd' : 'sig' }))
        for (let y = fingerTop; y < rows; y++)
          taken[y * cols + x] = 1
      }
      edge.body = { x0: f0 - 1, y0: fingerTop, x1: f0 + span * 2, y1: rows - 1 }
      edgePads = edge.pads
    }
    const k = pick(place, [16, 19, 22])
    const chipW = k + 3
    const resRow = fingerTop - int(place, 6, 8)
    const maxBands = Math.max(1, Math.min(6, Math.floor((resRow - 12) / 24)))
    const bands = int(place, Math.max(1, Math.min(maxBands - 1, 2)), maxBands)
    const pitchY = Math.min(30, Math.floor((resRow - 16) / bands))
    const maxPer = Math.max(1, Math.floor((cols - 8) / (chipW + 4)))
    const per = int(place, Math.max(1, maxPer - 1), maxPer)
    const gap = per > 1 ? Math.min(16, Math.floor((cols - 14 - per * chipW) / (per - 1))) : 0
    const used = per * chipW + (per - 1) * gap
    const xs = Math.floor((cols - used) / 2) + Math.floor(chipW / 2)
    for (let b = 0; b < bands; b++) {
      const y = resRow - 13 - b * pitchY
      for (let i = 0; i < per; i++) {
        const p = tryPart('tsop', k, 0, xs + i * (chipW + gap), y, 0, 2)
        if (p)
          ics.push(p)
      }
    }
    // series resistors under the chips of the lowest band
    for (const ic of ics.filter(p => p.y === Math.max(...ics.map(q => q.y)))) {
      const bottom = ic.pads.filter(p => p.side === 3 && p.role === 'sig')
      for (const pin of bottom) {
        if (!chance(place, 0.5))
          continue
        const r = tryPart('chip', 0, 0, pin.x, resRow, 1, 2)
        if (r) {
          r.sub = 'r'
          series.push([r, pin])
        }
      }
    }
    decoupleAll(1, 2, 0)
    const spd = put('soic', 4, 0, () => [int(place, 8, cols - 9), int(place, 6, Math.max(7, Math.floor(rows * 0.3)))], 60, 0)
    if (spd)
      ics.push(spd)
    for (let i = 0; i < n(14, 26); i++)
      chipSub(put('chip', 0, 0, anywhere), chance(place, 0.5) ? 'r' : 'c')
    for (let i = 0; i < n(2, 5); i++)
      put('sot23', 0, 0, anywhere)
  }

  // Geographic annotation: reference designators run in reading order.
  const band = Math.max(8, Math.round(minSide / 8))
  const order = parts.filter(p => p.prefix).sort((a, b) => Math.floor(a.y / band) - Math.floor(b.y / band) || a.x - b.x)
  const count: Record<string, number> = {}
  for (const p of order) {
    let pre = p.prefix
    if (p.kind === 'chip' && p.sub === 'c')
      pre = 'C'
    p.prefix = pre
    count[pre] = (count[pre] ?? 0) + 1
    p.ref = `${pre}${count[pre]}`
  }

  // Assembly.
  for (const p of parts) {
    if (p.kind === 'tp' || p.kind === 'fid' || p.kind === 'hole' || p.kind === 'edge')
      continue
    if (spec.assembly === 'Populated')
      p.populated = true
    else if (spec.assembly === 'Partial')
      p.populated = chance(place, p.prefix === 'U' ? 0.75 : 0.45)
  }

  // -------------------------------------------------------------------------
  // Netlist
  // -------------------------------------------------------------------------
  const parent = pads.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  interface Conn { a: Pad, b: Pad | null, w: number, key: number, fat: boolean }
  const conns: Conn[] = []
  const dist = (a: Pad, b: Pad) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  const join = (a: Pad, b: Pad, w = spec.traceW) => {
    a.used = true
    b.used = true
    parent[find(a.id)] = find(b.id)
    // power stages: big pads are tied by wide copper
    const fat = spec.layout === 'Power' && Math.min(a.w, a.h) >= 1.9 && Math.min(b.w, b.h) >= 1.9
    conns.push({ a, b, w: fat ? spec.powerW * 1.6 : w, key: dist(a, b), fat })
  }
  const stub = (a: Pad, w: number) => {
    a.used = true
    conns.push({ a, b: null, w, key: -1, fat: false })
  }
  const nearest = (from: Pad, list: Pad[]) => {
    let best: Pad | null = null
    let bd = Infinity
    for (const p of list) {
      const d = dist(from, p)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    return best
  }
  const free = (p: Part, role: Role = 'sig') => p.pads.filter(q => !q.used && q.role === role)

  for (const [cap, ic] of decouple) {
    const [a, b] = cap.pads
    const ia = nearest(a, ic.pads)
    const ib = nearest(b, ic.pads)
    const near = ia && ib && dist(a, ia) <= dist(b, ib) ? a : b
    const far = near === a ? b : a
    const v = nearest(near, free(ic, 'vcc')) ?? nearest(near, free(ic))
    if (v)
      join(near, v, spec.powerW)
    far.role = 'gnd'
  }
  if (crystal) {
    const [a, b] = crystal.x.pads
    const pa = nearest(a, free(crystal.ic))
    if (pa)
      join(a, pa)
    const pb = nearest(b, free(crystal.ic))
    if (pb)
      join(b, pb)
    for (const cap of crystal.caps) {
      const [c0, c1] = cap.pads
      const t = nearest(c0, [a, b])!
      const near = dist(c0, t) < dist(c1, nearest(c1, [a, b])!) ? c0 : c1
      join(near, nearest(near, [a, b])!)
      ;(near === c0 ? c1 : c0).role = 'gnd'
    }
  }
  for (const [led, r] of pairs) {
    const ra = nearest(led.pads[0], r.pads)!
    join(led.pads[0], ra)
    led.pads[1].role = 'gnd'
  }
  for (const [r, pin] of series) {
    const top = r.pads[0].y < r.pads[1].y ? r.pads[0] : r.pads[1]
    const bot = top === r.pads[0] ? r.pads[1] : r.pads[0]
    join(pin, top)
    const f = nearest(bot, edgePads.filter(p => !p.used && p.role === 'sig'))
    if (f && Math.abs(f.x - bot.x) < 12)
      join(bot, f)
  }
  if (spec.layout === 'Power') {
    // the power stage: terminal, regulators, inductors, diodes and bulk
    // capacitors chained by nearest neighbour, tied by wide copper
    const big = parts.filter(p => ['to220', 'inductor', 'terminal', 'diode'].includes(p.kind) || (p.kind === 'elco' && p.k === 1))
    const centre = (p: Part) => [(p.body.x0 + p.body.x1) / 2, (p.body.y0 + p.body.y1) / 2]
    let cur = big.find(p => p.kind === 'terminal') ?? big[0]
    const chain: Part[] = []
    while (cur) {
      chain.push(cur)
      big.splice(big.indexOf(cur), 1)
      const [cx, cy] = centre(cur)
      let best: Part | undefined
      let bd = Infinity
      for (const q of big) {
        const [qx, qy] = centre(q)
        const d = Math.hypot(qx - cx, qy - cy)
        if (d < bd) {
          bd = d
          best = q
        }
      }
      cur = best!
    }
    const link = (A: Part, B: Part, role: Role) => {
      let pa: Pad | null = null
      let pb: Pad | null = null
      let bd = Infinity
      for (const a of A.pads) {
        for (const b of B.pads) {
          const ok = role === 'gnd' ? a.role === 'gnd' && b.role === 'gnd' : a.role !== 'gnd' && b.role !== 'gnd' && !b.used
          if (ok && dist(a, b) < bd) {
            bd = dist(a, b)
            pa = a
            pb = b
          }
        }
      }
      if (pa && pb)
        join(pa, pb)
    }
    for (let i = 0; i + 1 < chain.length; i++)
      link(chain[i], chain[i + 1], 'sig')
    if (!spec.pour) {
      for (let i = 0; i + 1 < chain.length; i++)
        link(chain[i], chain[i + 1], 'gnd')
    }
  }
  if (spec.layout === 'Memory') {
    // the other bottom pins go straight down to a finger, top pins fan out
    for (const ic of ics) {
      for (const pin of ic.pads.filter(p => p.side === 3 && !p.used && p.role === 'sig')) {
        const f = nearest(pin, edgePads.filter(p => !p.used && p.role === 'sig'))
        if (f && Math.abs(f.x - pin.x) < 8 && chance(nets, 0.7))
          join(pin, f)
      }
    }
    if (spec.routing === 'Two-layer') {
      // shared address lines between neighbouring chips of a band
      const byBand = new Map<number, Part[]>()
      for (const ic of ics.filter(p => p.kind === 'tsop'))
        byBand.set(ic.y, [...(byBand.get(ic.y) ?? []), ic])
      for (const row of byBand.values()) {
        row.sort((a, b) => a.x - b.x)
        for (let i = 0; i + 1 < row.length; i++) {
          const a = row[i].pads.filter(p => p.side === 1)
          const b = row[i + 1].pads.filter(p => p.side === 1)
          for (let j = 0; j < a.length; j++) {
            if (a[j].role === 'sig' && b[j].role === 'sig' && chance(nets, 0.55))
              join(a[j], b[j])
          }
        }
      }
    }
  }
  else {
    // Buses between ICs: the facing sides, pin for pin, in order.
    for (let i = 0; i < ics.length; i++) {
      for (let j = i + 1; j < ics.length; j++) {
        const a = ics[i]
        const b = ics[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (Math.hypot(dx, dy) > minSide * 0.75 || !chance(nets, 0.7))
          continue
        const face = (p: Part, ux: number, uy: number) => {
          let best = -1
          let bd = -Infinity
          for (let s = 0; s < 4; s++) {
            const d = DX[s * 2] * ux + DY[s * 2] * uy
            if (d > bd && p.pads.some(q => q.side === s)) {
              bd = d
              best = s
            }
          }
          return best
        }
        const sa = face(a, dx, dy)
        const sb = face(b, -dx, -dy)
        const pa = a.pads.filter(p => p.side === sa && !p.used && p.role === 'sig')
        const pb = b.pads.filter(p => p.side === sb && !p.used && p.role === 'sig')
        const m = Math.min(pa.length, pb.length, int(nets, 3, 9))
        if (m < 2)
          continue
        // sort both ends along the axis across the line of centres
        const ax = -dy
        const ay = dx
        const sort = (ps: Pad[]) => ps.sort((p, q) => (p.x * ax + p.y * ay) - (q.x * ax + q.y * ay))
        sort(pa)
        sort(pb)
        const oa = Math.floor((pa.length - m) / 2)
        const ob = Math.floor((pb.length - m) / 2)
        for (let t = 0; t < m; t++)
          join(pa[oa + t], pb[ob + t])
      }
    }
  }

  // Random point-to-point nets between the remaining signal pads.
  const reach = minSide * 0.3 + 8
  const pool = pads.filter(p => p.role === 'sig' && !p.used && p.part.kind !== 'edge' && p.part.kind !== 'tp')
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nets() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  for (const p of pool) {
    if (p.used)
      continue
    const ic = p.part.prefix === 'U'
    if (!chance(nets, ic ? 0.75 : 0.9))
      continue
    const cands = pool.filter(q => !q.used && q.part !== p.part && dist(p, q) < reach)
      .sort((a, b) => dist(p, a) - dist(p, b))
      .slice(0, 3)
    if (cands.length)
      join(p, pick(nets, cands))
  }
  for (const p of pads) {
    if (p.part.kind === 'tp' && !p.used) {
      const q = nearest(p, pads.filter(o => o.role === 'sig' && o.part !== p.part && o.part.kind !== 'edge'))
      if (q)
        join(p, q)
    }
  }
  // Leftovers drop to an inner layer through a via, or stay unconnected.
  const powerStubs: Pad[] = []
  for (const p of pads) {
    if (p.used || p.part.kind === 'edge' || p.part.kind === 'hole' || p.role === 'none')
      continue
    if (p.role === 'gnd' || p.role === 'vcc') {
      if (p.role === 'vcc' || !spec.pour)
        powerStubs.push(p)
      continue
    }
    const ic = p.part.prefix === 'U' || p.part.kind === 'header' || p.part.kind === 'terminal'
    if (chance(nets, ic ? (spec.layout === 'Memory' ? 0.8 : 0.6) : 0.85))
      stub(p, spec.traceW)
  }
  for (const p of powerStubs)
    stub(p, spec.powerW)

  // Net numbers: one per connected group, singletons included.
  const netOf = new Map<number, number>()
  for (const p of pads) {
    const r = find(p.id)
    if (!netOf.has(r))
      netOf.set(r, netOf.size + 1)
    p.net = netOf.get(r)!
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------
  const layers = spec.routing === 'Two-layer' ? 2 : 1
  const R = new Router(cols, rows, layers)
  const { occ } = R
  const plane = cols * rows
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x < 1 || y < 1 || x > cols - 2 || y > rows - 2) {
        for (let l = 0; l < layers; l++)
          occ[l * plane + y * cols + x] = -1
      }
    }
  }
  for (const p of parts) {
    if (p.kind === 'tp' || p.kind === 'fid' || p.kind === 'edge')
      continue
    const b = p.body
    const all = p.kind === 'hole'
    for (let y = Math.ceil(b.y0 + 0.15); y <= Math.floor(b.y1 - 0.15); y++) {
      for (let x = Math.ceil(b.x0 + 0.15); x <= Math.floor(b.x1 - 0.15); x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows)
          continue
        for (let l = 0; l < (all ? layers : 1); l++)
          occ[l * plane + y * cols + x] = -1
      }
    }
  }
  if (spec.layout === 'Memory') {
    // nothing may run between the fingers
    for (const p of edgePads) {
      for (let y = p.y - 4; y < rows; y++) {
        for (const dx of [-1, 1]) {
          const c = y * cols + p.x + dx
          if (occ[c] === 0)
            occ[c] = -1
        }
      }
    }
  }
  for (const p of pads) {
    for (const c of p.cells) {
      for (let l = 0; l < (p.th ? layers : 1); l++) {
        occ[l * plane + c] = p.net
        R.pad[l * plane + c] = 1
      }
    }
  }
  if (spec.layout === 'Memory') {
    for (const p of edgePads) {
      for (let y = p.y - 4; y < rows; y++)
        R.pad[y * cols + p.x] = 1
    }
  }

  const opts: RouteOptions = {
    diagonal: spec.routing === 'Mitred' || spec.routing === 'Two-layer',
    viaCost: 7,
    preferAxis: layers === 2,
    margin: spec.layout === 'Memory' ? 7 : 14,
    // the dense memory boards fail many searches: keep each one cheap
    maxExpand: layers > 1 ? (spec.layout === 'Memory' ? 1200 : 5000) : 12000,
  }
  const tracks: Track[] = []
  const vias: Via[] = []
  const netCells = new Map<number, Cell[]>()
  const padCells = (p: Pad): Cell[] => {
    const out: Cell[] = []
    for (const c of p.cells) {
      for (let l = 0; l < (p.th ? layers : 1); l++)
        out.push({ x: c % cols, y: Math.floor(c / cols), l })
    }
    return out
  }
  const commit = (net: number, path: Cell[], w: number, fat = false) => {
    R.commit(net, path, fat)
    tracks.push({ net, w, cells: path })
    const list = netCells.get(net) ?? []
    for (const c of path)
      list.push(c)
    netCells.set(net, list)
    for (let i = 1; i < path.length; i++) {
      if (path[i].l !== path[i - 1].l)
        vias.push({ x: path[i].x, y: path[i].y, net, gnd: false, d: 0.95 })
    }
  }
  const viaSpot = (p: Pad): Cell | null => {
    const dirs: number[] = []
    if (p.side >= 0) {
      dirs.push(p.side * 2)
    }
    else {
      for (let d = 0; d < 8; d++)
        dirs.push(d)
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(nets() * (i + 1));
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]]
      }
    }
    const ext = Math.max(p.w, p.h) / 2
    for (let dist = 2; dist <= 5; dist++) {
      for (const d of dirs) {
        for (const lat of p.side >= 0 ? [0, 1, -1] : [0]) {
          const r = Math.round(ext) + dist
          const x = p.x + DX[d] * r + (DY[d] !== 0 ? lat : 0)
          const y = p.y + DY[d] * r + (DX[d] !== 0 ? lat : 0)
          if (x < 2 || y < 2 || x > cols - 3 || y > rows - 3)
            continue
          let ok = true
          for (let l = 0; l < layers && ok; l++) {
            if (occ[l * plane + y * cols + x] !== 0)
              ok = false
          }
          if (ok && R.viaRoom(x, y, p.net))
            return { x, y, l: 0 }
        }
      }
    }
    return null
  }

  conns.sort((a, b) => a.key - b.key)
  const routed = pads.map((_, i) => i)
  const rfind = (i: number): number => {
    while (routed[i] !== i) {
      routed[i] = routed[routed[i]]
      i = routed[i]
    }
    return i
  }
  const failed: Pad[] = []
  for (const c of conns) {
    const net = c.a.net
    if (c.b) {
      if (rfind(c.a.id) === rfind(c.b.id))
        continue
      const targets = [...padCells(c.b), ...(netCells.get(net) ?? [])]
      let path = R.route(net, padCells(c.a), targets, c.fat ? { ...opts, fat: true } : opts)
      let w = c.w
      if (!path && c.fat) {
        path = R.route(net, padCells(c.a), targets, opts)
        w = spec.powerW
      }
      if (path) {
        commit(net, path, w, c.fat && w === c.w)
        routed[rfind(c.a.id)] = rfind(c.b.id)
      }
      else {
        failed.push(c.a)
      }
    }
    else {
      const spot = viaSpot(c.a)
      if (!spot)
        continue
      const targets: Cell[] = []
      for (let l = 0; l < layers; l++)
        targets.push({ x: spot.x, y: spot.y, l })
      const path = R.route(net, padCells(c.a), targets, { ...opts, margin: 4, maxExpand: 600 })
      if (path) {
        commit(net, path, c.w)
        for (let l = 0; l < layers; l++) {
          occ[l * plane + spot.y * cols + spot.x] = net
          R.pad[l * plane + spot.y * cols + spot.x] = 1
        }
        vias.push({ x: spot.x, y: spot.y, net, gnd: c.a.role === 'gnd', d: c.w > spec.traceW ? 1.25 : 0.95 })
      }
    }
  }
  // a pad whose route failed gets an escape via instead, as on a real board
  for (const p of failed) {
    if (netCells.get(p.net)?.some(c => p.cells.includes(c.y * cols + c.x)))
      continue
    const spot = viaSpot(p)
    if (!spot)
      continue
    const path = R.route(p.net, padCells(p), [{ ...spot }], { ...opts, margin: 4, maxExpand: 600 })
    if (path) {
      commit(p.net, path, spec.traceW)
      R.occ[spot.y * cols + spot.x] = p.net
      R.pad[spot.y * cols + spot.x] = 1
      vias.push({ x: spot.x, y: spot.y, net: p.net, gnd: false, d: 0.95 })
    }
  }

  // Stitching vias tie the ground pour to the inner ground plane.
  if (spec.pour) {
    const step = int(silk, 5, 8)
    for (let y = 3; y < rows - 3; y += step) {
      for (let x = 3 + ((y / step) & 1) * Math.floor(step / 2); x < cols - 3; x += step) {
        let ok = true
        for (let dy = -2; dy <= 2 && ok; dy++) {
          for (let dx = -2; dx <= 2 && ok; dx++) {
            for (let l = 0; l < layers; l++) {
              if (occ[l * plane + (y + dy) * cols + x + dx] !== 0)
                ok = false
            }
          }
        }
        if (ok && chance(silk, 0.8)) {
          vias.push({ x, y, net: -2, gnd: true, d: 0.95 })
          for (let l = 0; l < layers; l++) {
            occ[l * plane + y * cols + x] = -2
            R.pad[l * plane + y * cols + x] = 1
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Silkscreen legends
  // -------------------------------------------------------------------------
  const silkOcc = new Uint8Array(cols * rows)
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(rows - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(cols - 1, Math.ceil(x1)); x++)
        silkOcc[y * cols + x] = 1
    }
  }
  const clear = (x0: number, y0: number, x1: number, y1: number, copper: boolean) => {
    if (x0 < 1.5 || y0 < 1.5 || x1 > cols - 2.5 || y1 > rows - 2.5)
      return false
    // cells whose centre the box covers
    for (let y = Math.ceil(y0); y <= Math.floor(y1); y++) {
      for (let x = Math.ceil(x0); x <= Math.floor(x1); x++) {
        if (silkOcc[y * cols + x])
          return false
        if (copper && occ[y * cols + x] !== 0)
          return false
      }
    }
    return true
  }
  for (const p of pads)
    mark(p.px - p.w / 2 - 0.4, p.py - p.h / 2 - 0.4, p.px + p.w / 2 + 0.4, p.py + p.h / 2 + 0.4)
  for (const v of vias)
    mark(v.x - 0.6, v.y - 0.6, v.x + 0.6, v.y + 0.6)
  for (const p of parts) {
    if (p.kind !== 'tp')
      mark(p.body.x0 - 0.3, p.body.y0 - 0.3, p.body.x1 + 0.3, p.body.y1 + 0.3)
  }
  const labels: Label[] = []
  const H = spec.labelH
  const adv = (s: string) => (s.length * 5.4 / 6 - (5.4 - 4) / 6) * H
  for (const p of parts) {
    if (!p.ref)
      continue
    const w = adv(p.ref)
    const b = p.body
    const mx = (b.x0 + b.x1) / 2
    const my = (b.y0 + b.y1) / 2
    const big = p.prefix === 'U' && !p.populated && b.x1 - b.x0 > w + 2 && b.y1 - b.y0 > H + 2
    const cands: [number, number, boolean][] = []
    const g = 0.7
    cands.push([mx - w / 2, b.y0 - g - H, false], [mx - w / 2, b.y1 + g, false])
    cands.push([b.x0 - g - H, my - w / 2, true], [b.x1 + g, my - w / 2, true])
    cands.push([b.x0 - g - w, my - H / 2, false], [b.x1 + g, my - H / 2, false])
    if (big) {
      labels.push({ text: p.ref, x: mx - w / 2, y: my - H / 2, h: H, vertical: false })
      continue
    }
    for (const [x, y, v] of cands) {
      const x1 = x + (v ? H : w)
      const y1 = y + (v ? w : H)
      if (clear(x, y, x1, y1, false)) {
        labels.push({ text: p.ref, x, y, h: H, vertical: v })
        mark(x - 0.2, y - 0.2, x1 + 0.2, y1 + 0.2)
        break
      }
    }
  }

  // Board name and revision in a quiet corner of the mask.
  const title: Label[] = []
  const hex = Array.from({ length: 4 }, () => '0123456789ABCDEF'[int(silk, 0, 15)]).join('')
  const lines = [`CRCT-${hex}`, `REV ${pick(silk, ['A', 'B', 'C', 'D', 'E'])}  ${String(int(silk, 1, 52)).padStart(2, '0')}${String(int(silk, 88, 99)).slice(-2)}`]
  const th = H * 1.35
  const tw = Math.max(adv(lines[0]), adv(lines[1])) * 1.35
  const tH = th * 2 + th * 0.6
  for (let t = 0; t < 300; t++) {
    const x = range(silk, 3, cols - 4 - tw)
    const y = range(silk, 3, rows - 4 - tH)
    if (clear(x - 1, y - 1, x + tw + 1, y + tH + 1, true)) {
      title.push({ text: lines[0], x, y, h: th, vertical: false })
      title.push({ text: lines[1], x, y: y + th * 1.6, h: th * 0.8, vertical: false })
      mark(x - 1, y - 1, x + tw + 1, y + tH + 1)
      break
    }
  }

  // IC markings: invented part numbers.
  for (const p of parts) {
    if (p.prefix === 'U' || p.kind === 'inductor' || p.kind === 'elco' || p.kind === 'film')
      p.mark = `${pick(silk, ['CX', 'TQ', 'MV', 'LR', 'ZE', 'KP'])}${int(silk, 10, 989)}${pick(silk, ['', 'A', 'B', 'S', 'T'])}`
  }

  return { spec, parts, pads, tracks, vias, labels, title, router: R }
}
