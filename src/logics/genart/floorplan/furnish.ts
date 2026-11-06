// Furniture for the "Floorplan" series: a greedy placer that leans each piece
// against a wall (or centres it) without touching door swings or other
// pieces, and the plan symbols themselves, drawn as simple vector glyphs.
//
// Glyphs live in a local frame: origin at the middle of the piece's back edge
// (the wall it leans on), +x along the wall, +y into the room. Units are grid
// cells (0.3 m).

import type { Rng } from '../random'
import type { Plan, Rect, Room, Side } from './plan'
import { chance, range } from '../random'

export type Kind = 'bed2' | 'bed1' | 'wardrobe' | 'sofa' | 'lounge' | 'lounge2' | 'media' | 'plant'
  | 'table6' | 'table4' | 'round' | 'counter' | 'island' | 'tub' | 'shower' | 'wc' | 'basin'
  | 'desk' | 'shelf' | 'washers' | 'bench' | 'armchair'

export interface Piece {
  kind: Kind
  x: number
  y: number
  /** Rotation in quarter turns: the local +y axis points down, left, up, right for 0..3. */
  rot: number
  w: number
  d: number
}

const ROT_OF_SIDE: Record<Side, number> = { 0: 0, 1: 1, 2: 2, 3: 3 }

function overlaps(a: Rect, b: Rect) {
  return a.x0 < b.x1 - 0.05 && a.x1 > b.x0 + 0.05 && a.y0 < b.y1 - 0.05 && a.y1 > b.y0 + 0.05
}

function footprint(side: Side, inner: Rect, u: number, w: number, d: number): Rect {
  if (side === 0)
    return { x0: u - w / 2, x1: u + w / 2, y0: inner.y0, y1: inner.y0 + d }
  if (side === 2)
    return { x0: u - w / 2, x1: u + w / 2, y0: inner.y1 - d, y1: inner.y1 }
  if (side === 3)
    return { x0: inner.x0, x1: inner.x0 + d, y0: u - w / 2, y1: u + w / 2 }
  return { x0: inner.x1 - d, x1: inner.x1, y0: u - w / 2, y1: u + w / 2 }
}

function origin(side: Side, inner: Rect, u: number): [number, number] {
  if (side === 0)
    return [u, inner.y0]
  if (side === 2)
    return [u, inner.y1]
  if (side === 3)
    return [inner.x0, u]
  return [inner.x1, u]
}

class Room$ {
  occ: Rect[] = []
  out: Piece[]
  constructor(public room: Room, public inner: Rect, public extSides: boolean[], out: Piece[]) {
    this.out = out
  }

  fits(f: Rect) {
    const n = this.inner
    if (f.x0 < n.x0 - 0.01 || f.x1 > n.x1 + 0.01 || f.y0 < n.y0 - 0.01 || f.y1 > n.y1 + 0.01)
      return false
    return !this.occ.some(o => overlaps(o, f))
  }

  /** Lean a piece on a wall; `corner` starts from the ends instead of the middle. */
  wall(kind: Kind, w0: number, d: number, sides: Side[], corner: boolean, clear = 0, minW = w0): Side | -1 {
    for (const side of sides) {
      // shorter pieces are tried before giving up on a wall
      for (let w = w0; w >= minW - 1e-6; w -= 1) {
        if (this.tryWall(kind, side, w, d, corner, clear))
          return side
      }
    }
    return -1
  }

  tryWall(kind: Kind, side: Side, w: number, d: number, corner: boolean, clear: number): boolean {
    const n = this.inner
    const horiz = side === 0 || side === 2
    const lo = (horiz ? n.x0 : n.y0) + w / 2
    const hi = (horiz ? n.x1 : n.y1) - w / 2
    if (hi < lo)
      return false
    const cands: number[] = []
    if (corner) {
      for (let s = 0; lo + s <= hi; s += 0.5) {
        cands.push(lo + s)
        cands.push(hi - s)
      }
    }
    else {
      const mid = (lo + hi) / 2
      for (let s = 0; mid - s >= lo; s += 0.5) {
        cands.push(mid - s)
        cands.push(mid + s)
      }
    }
    for (const u of cands) {
      const f = footprint(side, n, u, w, d + clear)
      if (!this.fits(f))
        continue
      this.occ.push(f)
      const [x, y] = origin(side, n, u)
      this.out.push({ kind, x, y, rot: ROT_OF_SIDE[side], w, d })
      return true
    }
    return false
  }

  /** A free-standing piece (tables), aligned with the room's long axis. */
  centre(kind: Kind, w: number, d: number, margin: number): boolean {
    const n = this.inner
    const across = (n.x1 - n.x0) >= (n.y1 - n.y0)
    const fw = across ? w : d
    const fd = across ? d : w
    const cx = (n.x0 + n.x1) / 2
    const cy = (n.y0 + n.y1) / 2
    const offs = [0, -1.5, 1.5, -3, 3, -4.5, 4.5]
    for (const oy of offs) {
      for (const ox of offs) {
        const x = cx + ox
        const y = cy + oy
        const f = { x0: x - fw / 2 - margin, x1: x + fw / 2 + margin, y0: y - fd / 2 - margin, y1: y + fd / 2 + margin }
        if (!this.fits(f))
          continue
        this.occ.push(f)
        // origin at the back edge, rotated so that +x runs along the long axis
        if (across)
          this.out.push({ kind, x, y: y - d / 2, rot: 0, w, d })
        else
          this.out.push({ kind, x: x + d / 2, y, rot: 1, w, d })
        return true
      }
    }
    return false
  }

  /** Sides ordered: interior walls first (for beds and sofas), longer first. */
  sides(interiorFirst: boolean): Side[] {
    const n = this.inner
    const len = (s: Side) => (s === 0 || s === 2) ? n.x1 - n.x0 : n.y1 - n.y0
    return ([0, 1, 2, 3] as Side[]).sort((a, b) => {
      if (interiorFirst && this.extSides[a] !== this.extSides[b])
        return this.extSides[a] ? 1 : -1
      return len(b) - len(a)
    })
  }

  span(s: Side) {
    const n = this.inner
    return (s === 0 || s === 2) ? n.x1 - n.x0 : n.y1 - n.y0
  }
}

/** Door swings and passage clearances, per room. */
function blocked(plan: Plan): Rect[][] {
  const occ: Rect[][] = plan.rooms.map(() => [])
  for (const p of plan.openings) {
    if (p.kind === 'window')
      continue
    const w = p.b - p.a
    const reach = p.kind === 'door' || p.kind === 'front' ? w + 0.2 : 2
    for (const q of plan.rooms) {
      // both sides of the opening
      for (const dir of [1, -1]) {
        const r: Rect = p.o === 0
          ? { x0: p.a, x1: p.b, y0: dir > 0 ? p.c : p.c - reach, y1: dir > 0 ? p.c + reach : p.c }
          : { x0: dir > 0 ? p.c : p.c - reach, x1: dir > 0 ? p.c + reach : p.c, y0: p.a, y1: p.b }
        if ((p.kind === 'door' || p.kind === 'front') && (p.into !== q.id || dir !== p.dir))
          continue
        if (overlaps(r, q))
          occ[q.id].push(r)
      }
    }
  }
  return occ
}

export function furnish(plan: Plan, r: Rng): Piece[] {
  const out: Piece[] = []
  const occ = blocked(plan)
  const hasDining = plan.rooms.some(q => q.type === 'dining')
  for (const room of plan.rooms) {
    const inner = plan.inner[room.id]
    const ext = [0, 1, 2, 3].map(s => plan.ext[room.id][s].length > 0)
    const R = new Room$(room, inner, ext, out)
    R.occ.push(...occ[room.id])
    const iw = inner.x1 - inner.x0
    const ih = inner.y1 - inner.y0
    const big = Math.min(iw, ih)
    switch (room.type) {
      case 'master':
      case 'bedroom': {
        const dbl = room.type === 'master' || big >= 10.5
        const sides = R.sides(true)
        let ok = -1
        if (dbl) {
          ok = R.wall('bed2', 8.6, 6.8, sides, false, 2)
          if (ok < 0)
            ok = R.wall('bed2', 5.4, 6.8, sides, false, 1.5)
        }
        if (ok < 0 && R.wall('bed1', 4.6, 6.8, sides, true, 1.5) < 0 && R.wall('bed1', 3.1, 6.8, sides, true, 1) < 0)
          R.wall('bed1', 3.1, 6.6, sides, true, 0)
        R.wall('wardrobe', Math.min(8, Math.max(4, big * 0.55)), 2, R.sides(true), true, 1.5, 3)
        if (chance(r, 0.5))
          R.wall('desk', 4.4, 3.4, R.sides(false), true)
        else if (chance(r, 0.5))
          R.wall('armchair', 2.6, 2.6, R.sides(false), true)
        break
      }
      case 'living': {
        const sides = R.sides(true)
        if (R.wall('lounge', 11.4, 6.8, sides, false, 1) < 0 && R.wall('lounge2', 7.6, 6.4, sides, false, 1) < 0)
          R.wall('sofa', 7.3, 3, sides, false, 1)
        R.wall('media', 5.4, 1.5, R.sides(false), false, 2)
        if (!hasDining && !R.centre('table6', 6, 3, 2.2))
          R.centre('round', 3.6, 3.6, 2.2)
        if (chance(r, 0.7))
          R.wall('plant', 1.8, 1.8, R.sides(false), true)
        if (chance(r, 0.5))
          R.wall('shelf', Math.min(7, big * 0.5), 1.3, R.sides(false), true, 1)
        break
      }
      case 'flat': {
        const L = Math.min(10, Math.max(6, big * 0.7))
        R.wall('counter', L, 2, R.sides(false), true, 2.5, 4)
        if (R.wall('lounge2', 7.6, 6.4, R.sides(true), false, 0.5) < 0)
          R.wall('sofa', 6.4, 2.8, R.sides(true), false, 1)
        R.centre('round', 3.4, 3.4, 2)
        if (chance(r, 0.5))
          R.wall('plant', 1.6, 1.6, R.sides(false), true)
        break
      }
      case 'kitchen': {
        const sides = R.sides(false)
        const s1 = R.wall('counter', Math.min(14, Math.max(6, R.span(sides[0]) - 1)), 2, sides, true, 3, 4)
        if (s1 >= 0 && chance(r, 0.6))
          R.wall('counter', Math.min(8, Math.max(4, R.span(((s1 + 1) % 4) as Side) * 0.5)), 2, [((s1 + 1) % 4) as Side, ((s1 + 3) % 4) as Side], true, 2.5, 3)
        if (big >= 14)
          R.centre('island', 6, 3, 3)
        else if (!hasDining && big >= 10)
          R.centre('round', 3.4, 3.4, 1.8)
        break
      }
      case 'dining':
        if (!R.centre('table6', 6, 3, 1.9))
          R.centre('round', 3.6, 3.6, 2)
        if (chance(r, 0.5))
          R.wall('shelf', Math.min(6, big * 0.5), 1.4, R.sides(false), false, 1.5)
        break
      case 'bath': {
        const sides = R.sides(false)
        if (R.wall('tub', 5.7, 2.6, sides, true) < 0)
          R.wall('shower', 3, 3, sides, true)
        R.wall('wc', 1.9, 2.5, R.sides(false), true, 1.2)
        R.wall('basin', range(r, 2, 3.4), 1.7, R.sides(false), true, 1.2)
        break
      }
      case 'wc':
        R.wall('wc', 1.9, 2.5, R.sides(false), false, 1)
        R.wall('basin', 1.6, 1.3, R.sides(false), true)
        break
      case 'study':
        R.wall('desk', 4.6, 3.4, R.sides(false), false, 0.5)
        R.wall('shelf', Math.min(7, big * 0.6), 1.3, R.sides(false), true, 1)
        R.wall('armchair', 2.6, 2.6, R.sides(false), true)
        break
      case 'dressing':
      case 'storage':
        for (const s of R.sides(false).slice(0, 2)) R.wall('shelf', Math.max(3, R.span(s) - 0.4), 1.8, [s], true, 1.6, 2.5)
        break
      case 'laundry':
        R.wall('washers', 4.2, 2.2, R.sides(false), true, 2)
        R.wall('counter', Math.min(6, big), 2, R.sides(false), true, 1.5)
        break
      case 'entry':
        R.wall('bench', Math.min(5, big * 0.6), 1.4, R.sides(false), false, 1.5)
        R.wall('wardrobe', Math.min(5, Math.max(3, big * 0.5)), 2, R.sides(false), true, 1.5)
        if (chance(r, 0.5))
          R.wall('plant', 1.6, 1.6, R.sides(false), true)
        break
      case 'foyer':
        R.wall('wardrobe', Math.min(5, Math.max(3, big * 0.6)), 2, R.sides(false), true, 1.2)
        break
      default:
        break
    }
  }
  return out
}

// ---------------------------------------------------------------- glyphs

export interface Pens {
  fill: string
  line: string
  /** Line widths in cells. */
  lw: number
  fine: number
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 0) {
  g.beginPath()
  if (r > 0)
    rr(g, x, y, w, h, r)
  else
    g.rect(x, y, w, h)
  g.fill()
  g.stroke()
}

function ell(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
}

function line(g: CanvasRenderingContext2D, ...pts: number[]) {
  g.beginPath()
  g.moveTo(pts[0], pts[1])
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1])
  g.stroke()
}

function chair(g: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  box(g, -0.75, -0.7, 1.5, 1.4, 0.2)
  line(g, -0.75, -0.45, 0.75, -0.45)
  g.restore()
}

function sofa(g: CanvasRenderingContext2D, w: number, d: number) {
  box(g, -w / 2, 0, w, d, 0.35)
  line(g, -w / 2 + 0.8, 0.8, w / 2 - 0.8, 0.8)
  line(g, -w / 2 + 0.8, 0.8, -w / 2 + 0.8, d)
  line(g, w / 2 - 0.8, 0.8, w / 2 - 0.8, d)
  const n = w > 6 ? 3 : 2
  const cw = (w - 1.6) / n
  for (let i = 1; i < n; i++) line(g, -w / 2 + 0.8 + cw * i, 0.8, -w / 2 + 0.8 + cw * i, d)
}

function armchair(g: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  box(g, -1.3, -1.3, 2.6, 2.6, 0.35)
  line(g, -1.3, -0.6, 1.3, -0.6)
  line(g, -0.75, -0.6, -0.75, 1.3)
  line(g, 0.75, -0.6, 0.75, 1.3)
  g.restore()
}

function table(g: CanvasRenderingContext2D, w: number, d: number, seats: number) {
  // table centred on (0, d / 2) of the footprint
  const per = Math.max(1, Math.floor(seats / 2))
  for (let i = 0; i < per; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / per
    chair(g, x, d / 2 - 1.9, 0)
    chair(g, x, d / 2 + 1.9, Math.PI)
  }
  if (seats > 4) {
    chair(g, -w / 2 - 0.2, d / 2, -Math.PI / 2)
    chair(g, w / 2 + 0.2, d / 2, Math.PI / 2)
  }
  box(g, -w / 2 + 0.6, d / 2 - 1.5, w - 1.2, 3)
}

function roundTable(g: CanvasRenderingContext2D, w: number) {
  const r = w / 2 - 0.6
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4
    chair(g, Math.cos(a) * (r + 0.75), w / 2 + Math.sin(a) * (r + 0.75), a + Math.PI / 2)
  }
  ell(g, 0, w / 2, r, r)
}

export function drawPiece(g: CanvasRenderingContext2D, p: Piece, pen: Pens) {
  g.save()
  g.translate(p.x, p.y)
  g.rotate((p.rot * Math.PI) / 2)
  g.fillStyle = pen.fill
  g.strokeStyle = pen.line
  g.lineWidth = pen.lw
  const { w, d } = p
  switch (p.kind) {
    case 'bed2':
    case 'bed1': {
      const two = p.kind === 'bed2'
      const bw = Math.min(two ? 5.4 : 3.1, w)
      const x0 = two ? -bw / 2 : -w / 2
      if (w > bw + 0.5) {
        // night stands
        const sw = Math.min(1.6, two ? (w - bw) / 2 : w - bw)
        box(g, x0 + bw, 0, sw, sw)
        if (two)
          box(g, x0 - sw, 0, sw, sw)
      }
      box(g, x0, 0, bw, d, 0.2)
      const pw = two ? bw / 2 - 0.5 : bw - 0.8
      box(g, x0 + 0.4, 0.4, pw, 1.3, 0.35)
      if (two)
        box(g, x0 + bw / 2 + 0.1, 0.4, pw, 1.3, 0.35)
      g.lineWidth = pen.fine
      line(g, x0, 2.3, x0 + bw, 2.3)
      line(g, x0 + bw - 1.6, 2.3, x0 + bw, 3.9)
      break
    }
    case 'wardrobe': {
      box(g, -w / 2, 0, w, d)
      g.lineWidth = pen.fine
      line(g, -w / 2 + 0.2, d / 2, w / 2 - 0.2, d / 2)
      for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.7) line(g, x - 0.2, d / 2 - 0.5, x + 0.2, d / 2 + 0.5)
      break
    }
    case 'sofa':
      sofa(g, w, d)
      break
    case 'lounge':
    case 'lounge2': {
      const sw = 7.3
      g.save()
      g.translate(0, 0)
      sofa(g, Math.min(sw, w), 3)
      g.restore()
      g.lineWidth = pen.fine
      g.setLineDash([0.5, 0.35])
      g.beginPath()
      g.rect(-4, 2.4, 8, d - 2.6)
      g.stroke()
      g.setLineDash([])
      g.lineWidth = pen.lw
      box(g, -2, 4.2, 4, 2, 0.4)
      if (p.kind === 'lounge') {
        armchair(g, -w / 2 + 1.3, 5.2, -Math.PI / 2)
        armchair(g, w / 2 - 1.3, 5.2, Math.PI / 2)
      }
      break
    }
    case 'media':
      box(g, -w / 2, 0, w, d)
      g.lineWidth = pen.fine
      line(g, -w / 2 + 0.8, d * 0.65, w / 2 - 0.8, d * 0.65)
      break
    case 'plant': {
      const r = w / 2
      ell(g, 0, r, r * 0.55, r * 0.55)
      g.lineWidth = pen.fine
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        line(g, Math.cos(a) * r * 0.25, r + Math.sin(a) * r * 0.25, Math.cos(a) * r, r + Math.sin(a) * r)
      }
      break
    }
    case 'table6':
      table(g, w, d, 6)
      break
    case 'table4':
      table(g, w, d, 4)
      break
    case 'round':
      roundTable(g, w)
      break
    case 'counter': {
      box(g, -w / 2, 0, w, d)
      g.lineWidth = pen.fine
      // fridge at one end, sink and hob along the run
      if (w >= 6) {
        line(g, -w / 2 + 2.2, 0, -w / 2 + 2.2, d)
        line(g, -w / 2, 0, -w / 2 + 2.2, d)
      }
      const sx = w >= 6 ? -w / 2 + 2.2 + (w - 2.2) * 0.3 : -w / 4
      box(g, sx - 1.2, 0.35, 1.1, 1.3, 0.25)
      box(g, sx + 0.1, 0.35, 1.1, 1.3, 0.25)
      const hx = w >= 6 ? -w / 2 + 2.2 + (w - 2.2) * 0.72 : w / 4
      for (const [ox, oy, rr2] of [[-0.55, 0.55, 0.38], [0.55, 0.55, 0.3], [-0.55, 1.4, 0.3], [0.55, 1.4, 0.38]]) ell(g, hx + ox, oy, rr2, rr2)
      break
    }
    case 'island':
      table(g, w, d, 4)
      break
    case 'tub':
      box(g, -w / 2, 0, w, d)
      box(g, -w / 2 + 0.3, 0.3, w - 0.6, d - 0.6, 1)
      g.lineWidth = pen.fine
      ell(g, -w / 2 + 1, d / 2, 0.18, 0.18)
      break
    case 'shower':
      box(g, -w / 2, 0, w, d)
      g.lineWidth = pen.fine
      line(g, -w / 2, 0, w / 2, d)
      line(g, w / 2, 0, -w / 2, d)
      ell(g, 0, d / 2, 0.2, 0.2)
      break
    case 'wc':
      box(g, -0.9, 0, 1.8, 0.65, 0.12)
      ell(g, 0, 1.55, 0.62, 0.92)
      g.lineWidth = pen.fine
      ell(g, 0, 1.6, 0.4, 0.62)
      break
    case 'basin':
      box(g, -w / 2, 0, w, d)
      ell(g, 0, d * 0.55, Math.min(w / 2 - 0.3, 0.75), d * 0.3)
      break
    case 'desk':
      box(g, -w / 2, 0, w, 2.2)
      chair(g, 0.4, 2.9, Math.PI)
      g.lineWidth = pen.fine
      box(g, -w / 2 + 0.4, 0.3, 1.6, 1.1)
      break
    case 'shelf': {
      box(g, -w / 2, 0, w, d)
      g.lineWidth = pen.fine
      const n = Math.max(1, Math.round(w / 2.2))
      for (let i = 1; i < n; i++) line(g, -w / 2 + (w * i) / n, 0, -w / 2 + (w * i) / n, d)
      line(g, -w / 2, d, w / 2, 0)
      break
    }
    case 'washers':
      for (const x of [-1.05, 1.05]) {
        box(g, x - 1, 0, 2, 2)
        ell(g, x, 1.05, 0.65, 0.65)
      }
      break
    case 'bench':
      box(g, -w / 2, 0, w, d, 0.2)
      g.lineWidth = pen.fine
      line(g, -w / 2 + 0.3, d / 2, w / 2 - 0.3, d / 2)
      break
    case 'armchair':
      armchair(g, 0, 1.3, 0)
      break
  }
  g.restore()
}
