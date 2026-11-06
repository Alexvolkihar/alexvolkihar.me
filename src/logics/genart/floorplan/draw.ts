// Drafting layers for the "Floorplan" series: wall poché, doors and windows,
// stairs, floor finishes, dimension chains, grid axes, and the sheet itself
// (paper, frame, title block, scale bar, north arrow).
//
// Plan layers are drawn in plan units (0.3 m cells) under the plan
// transform; sheet layers in pixels. Pen widths are given in pixels and
// converted, so a line keeps the same weight on every program size.

import type { Rng } from '../random'
import type { Plan, Rect, Room, RoomType } from './plan'
import { range } from '../random'
import { isWet } from './plan'

export interface Pal {
  bg: string
  bg2: string
  ink: string
  poche: string
  door: string
  furn: string
  dim: string
  accent: string
  tile: string
  glass: string
  grid: string | null
  grid2: string | null
  day: string
  night: string
  wet: string
  kind: 'vellum' | 'blue' | 'kraft' | 'cad'
}

export type Poche = 'Solid' | 'Hatched' | 'Outline'

function seg(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.moveTo(x0, y0)
  g.lineTo(x1, y1)
}

// ---------------------------------------------------------------- floors

const DAY: ReadonlySet<RoomType> = new Set(['living', 'kitchen', 'dining', 'study', 'flat'])
const NIGHT: ReadonlySet<RoomType> = new Set(['bedroom', 'master', 'dressing'])

/** Zoning wash for schematic plans: day, night, wet and circulation. */
export function zoning(g: CanvasRenderingContext2D, plan: Plan, pal: Pal) {
  for (const q of plan.rooms) {
    const n = plan.inner[q.id]
    let c: string | null = null
    if (isWet(q.type) && q.type !== 'kitchen')
      c = pal.wet
    else if (DAY.has(q.type))
      c = pal.day
    else if (NIGHT.has(q.type))
      c = pal.night
    if (!c)
      continue
    g.fillStyle = c
    g.fillRect(n.x0, n.y0, n.x1 - n.x0, n.y1 - n.y0)
  }
}

/** Tile grids in wet rooms. */
export function tiles(g: CanvasRenderingContext2D, plan: Plan, pal: Pal, lw: number) {
  g.strokeStyle = pal.tile
  g.lineWidth = lw
  g.beginPath()
  for (const q of plan.rooms) {
    if (!isWet(q.type))
      continue
    const n = plan.inner[q.id]
    const step = q.type === 'kitchen' ? 4 / 3 : 1
    for (let x = q.x0 + step; x < n.x1; x += step) {
      if (x > n.x0)
        seg(g, x, n.y0, x, n.y1)
    }
    for (let y = q.y0 + step; y < n.y1; y += step) {
      if (y > n.y0)
        seg(g, n.x0, y, n.x1, y)
    }
  }
  g.stroke()
}

// ---------------------------------------------------------------- walls

export function walls(g: CanvasRenderingContext2D, plan: Plan, pal: Pal, poche: Poche, lw: number, hatchLw: number) {
  const p = new Path2D()
  for (const w of plan.walls) {
    const h = w.t / 2
    const a = w.a - (w.ea ? h : 0)
    const b = w.b + (w.eb ? h : 0)
    if (w.o === 0)
      p.rect(a, w.c - h, b - a, w.t)
    else
      p.rect(w.c - h, a, w.t, b - a)
  }
  g.lineJoin = 'miter'
  g.strokeStyle = pal.ink
  g.lineWidth = lw * 2
  g.stroke(p)
  g.fillStyle = poche === 'Solid' ? pal.poche : pal.bg
  g.fill(p)
  if (poche === 'Hatched') {
    g.save()
    g.clip(p)
    const b = plan.bbox
    const gap = 0.32
    g.strokeStyle = pal.poche
    g.lineWidth = hatchLw
    g.beginPath()
    const span = (b.x1 - b.x0) + (b.y1 - b.y0) + 4
    for (let s = -2; s < span; s += gap) {
      seg(g, b.x0 - 2 + s, b.y0 - 2, b.x0 - 2 + s - (b.y1 - b.y0 + 4), b.y1 + 2)
    }
    g.stroke()
    g.restore()
  }
}

// ---------------------------------------------------------------- openings

export function openings(g: CanvasRenderingContext2D, plan: Plan, pal: Pal, pens: { door: number, arc: number, fine: number, glass: number }) {
  for (const p of plan.openings) {
    const h = p.t / 2
    // helper mapping (u along the wall, v across it) to plan coordinates
    const P = (u: number, v: number): [number, number] => p.o === 0 ? [u, p.c + v] : [p.c + v, u]
    const L = (u0: number, v0: number, u1: number, v1: number) => {
      const [x0, y0] = P(u0, v0)
      const [x1, y1] = P(u1, v1)
      seg(g, x0, y0, x1, y1)
    }
    if (p.kind === 'window' || p.kind === 'slide') {
      g.strokeStyle = pal.ink
      g.lineWidth = pens.fine
      g.beginPath()
      L(p.a, -h, p.a, h)
      L(p.b, -h, p.b, h)
      L(p.a, -h, p.b, -h)
      L(p.a, h, p.b, h)
      g.stroke()
      g.strokeStyle = pal.glass
      g.lineWidth = pens.glass
      g.beginPath()
      if (p.kind === 'window') {
        L(p.a, -0.13, p.b, -0.13)
        L(p.a, 0.13, p.b, 0.13)
      }
      else {
        const m = (p.a + p.b) / 2
        L(p.a, -0.18, m + 0.4, -0.18)
        L(m - 0.4, 0.18, p.b, 0.18)
      }
      g.stroke()
      continue
    }
    if (p.kind === 'pass' || p.kind === 'lift') {
      // header above the opening, dashed
      g.strokeStyle = pal.ink
      g.lineWidth = pens.fine
      g.setLineDash([0.45, 0.35])
      g.beginPath()
      L(p.a, -h, p.b, -h)
      L(p.a, h, p.b, h)
      g.stroke()
      g.setLineDash([])
      continue
    }
    // swing door: leaf open at 90 degrees, and the arc it sweeps
    const w = p.b - p.a
    const hu = p.hinge === 0 ? p.a : p.b
    const fu = p.hinge === 0 ? p.b : p.a
    const v0 = p.dir * h
    const v1 = v0 + p.dir * w
    const double = p.kind === 'front' && w > 4
    g.strokeStyle = pal.door
    if (double) {
      const m = (p.a + p.b) / 2
      g.lineWidth = pens.door
      g.beginPath()
      L(p.a, v0, p.a, v0 + p.dir * (w / 2))
      L(p.b, v0, p.b, v0 + p.dir * (w / 2))
      g.stroke()
      g.lineWidth = pens.arc
      g.beginPath()
      arcUV(g, P, p.a, v0, w / 2, p.dir, 1)
      arcUV(g, P, p.b, v0, w / 2, p.dir, -1)
      g.stroke()
      void m
      continue
    }
    g.lineWidth = pens.door
    g.beginPath()
    L(hu, v0, hu, v1)
    g.stroke()
    g.lineWidth = pens.arc
    g.beginPath()
    arcUV(g, P, hu, v0, w, p.dir, fu > hu ? 1 : -1)
    g.stroke()
  }
}

/** Quarter arc centred on the hinge, from the open leaf tip back to the closed jamb. */
function arcUV(g: CanvasRenderingContext2D, P: (u: number, v: number) => [number, number], hu: number, v0: number, r: number, dir: number, su: number) {
  const n = 18
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * (Math.PI / 2)
    const [x, y] = P(hu + su * r * Math.sin(a), v0 + dir * r * Math.cos(a))
    if (i === 0)
      g.moveTo(x, y)
    else
      g.lineTo(x, y)
  }
}

// ---------------------------------------------------------------- stairs and lifts

export function stairs(g: CanvasRenderingContext2D, plan: Plan, pal: Pal, lw: number, fine: number) {
  for (const q of plan.rooms) {
    const n = plan.inner[q.id]
    if (q.type === 'lift') {
      g.strokeStyle = pal.furn
      g.lineWidth = lw
      const i = 0.5
      g.strokeRect(n.x0 + i, n.y0 + i, n.x1 - n.x0 - 2 * i, n.y1 - n.y0 - 2 * i)
      g.lineWidth = fine
      g.beginPath()
      seg(g, n.x0 + i, n.y0 + i, n.x1 - i, n.y1 - i)
      seg(g, n.x1 - i, n.y0 + i, n.x0 + i, n.y1 - i)
      g.stroke()
      continue
    }
    if (q.type !== 'stair')
      continue
    const along = (n.x1 - n.x0) >= (n.y1 - n.y0)
    // work in (u along the run, v across), mapped back to the plan
    const u0 = along ? n.x0 : n.y0
    const u1 = along ? n.x1 : n.y1
    const v0 = along ? n.y0 : n.x0
    const v1 = along ? n.y1 : n.x1
    const P = (u: number, v: number): [number, number] => along ? [u, v] : [v, u]
    const L = (a: number, b: number, c: number, d: number) => {
      const [x0, y0] = P(a, b)
      const [x1, y1] = P(c, d)
      seg(g, x0, y0, x1, y1)
    }
    const tread = 0.93
    const wide = v1 - v0
    g.strokeStyle = pal.ink
    g.lineWidth = fine
    g.beginPath()
    const walk: Array<[number, number]> = []
    if (wide >= 7.4 && u1 - u0 >= 9) {
      // two flights and a landing (dog-leg stair)
      const mid = (v0 + v1) / 2
      const land = Math.min(wide / 2, (u1 - u0) * 0.35)
      for (let u = u0 + tread; u < u1 - land; u += tread) {
        L(u, v0, u, mid - 0.2)
        L(u, mid + 0.2, u, v1)
      }
      L(u0, mid - 0.2, u1 - land, mid - 0.2)
      L(u0, mid + 0.2, u1 - land, mid + 0.2)
      L(u1 - land, v0, u1 - land, v1)
      const a = (v0 + mid) / 2
      const b = (mid + v1) / 2
      walk.push([u0 + 0.6, a], [u1 - land / 2, a], [u1 - land / 2, b], [u0 + 1.6, b])
    }
    else {
      for (let u = u0 + tread; u < u1 - 0.3; u += tread) L(u, v0, u, v1)
      const c = (v0 + v1) / 2
      walk.push([u0 + 0.6, c], [u1 - 1, c])
    }
    g.stroke()
    // walking line with an arrow, and the cut line through the flight
    g.lineWidth = fine
    g.beginPath()
    walk.forEach(([u, v], i) => {
      const [x, y] = P(u, v)
      if (i === 0)
        g.moveTo(x, y)
      else
        g.lineTo(x, y)
    })
    g.stroke()
    const [ua, va] = walk[walk.length - 2]
    const [ub, vb] = walk[walk.length - 1]
    const [xa, ya] = P(ua, va)
    const [xb, yb] = P(ub, vb)
    const ang = Math.atan2(yb - ya, xb - xa)
    g.fillStyle = pal.ink
    g.beginPath()
    g.moveTo(xb, yb)
    g.lineTo(xb - Math.cos(ang - 0.4) * 0.9, yb - Math.sin(ang - 0.4) * 0.9)
    g.lineTo(xb - Math.cos(ang + 0.4) * 0.9, yb - Math.sin(ang + 0.4) * 0.9)
    g.closePath()
    g.fill()
    const [s0, s1] = walk.length > 2 ? [v0 + (v1 - v0) / 2, v1] : [v0, v1]
    const um = u0 + (u1 - u0) * 0.55
    g.lineWidth = lw
    g.beginPath()
    L(um - 0.8, s0, um - 0.1, s0 + (s1 - s0) * 0.45)
    L(um - 0.1, s0 + (s1 - s0) * 0.45, um + 0.5, s0 + (s1 - s0) * 0.55)
    L(um + 0.5, s0 + (s1 - s0) * 0.55, um + 1.2, s1)
    g.stroke()
  }
}

// ---------------------------------------------------------------- site

export function terrace(g: CanvasRenderingContext2D, t: Rect & { side: number }, pal: Pal, lw: number, fine: number) {
  g.strokeStyle = pal.furn
  g.lineWidth = fine
  g.beginPath()
  const vertical = t.side === 0 || t.side === 2
  if (vertical) {
    for (let x = t.x0 + 0.5; x < t.x1; x += 0.5) seg(g, x, t.y0, x, t.y1)
  }
  else {
    for (let y = t.y0 + 0.5; y < t.y1; y += 0.5) seg(g, t.x0, y, t.x1, y)
  }
  g.stroke()
  g.lineWidth = lw
  g.strokeStyle = pal.ink
  g.strokeRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0)
}

export function tree(g: CanvasRenderingContext2D, x: number, y: number, r: number, pal: Pal, lw: number, fine: number, rng: Rng) {
  g.strokeStyle = pal.furn
  g.lineWidth = lw
  g.beginPath()
  const n = 14
  for (let i = 0; i <= n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const rr = r * range(rng, 0.88, 1.04)
    const x1 = x + Math.cos(a0) * rr
    const y1 = y + Math.sin(a0) * rr
    if (i === 0)
      g.moveTo(x1, y1)
    else
      g.quadraticCurveTo(x + Math.cos(a0 - Math.PI / n) * rr * 1.18, y + Math.sin(a0 - Math.PI / n) * rr * 1.18, x1, y1)
  }
  g.stroke()
  g.lineWidth = fine
  g.beginPath()
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3
    seg(g, x, y, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6)
  }
  g.stroke()
  g.beginPath()
  g.arc(x, y, r * 0.08, 0, Math.PI * 2)
  g.stroke()
}

export function paving(g: CanvasRenderingContext2D, c: Rect, pal: Pal, fine: number) {
  g.strokeStyle = pal.tile
  g.lineWidth = fine
  g.beginPath()
  const s = 2
  for (let x = c.x0 + 1.6; x < c.x1 - 0.6; x += s) seg(g, x, c.y0 + 0.6, x, c.y1)
  for (let y = c.y0 + 0.6 + s; y < c.y1; y += s) seg(g, c.x0 + 0.6, y, c.x1 - 0.6, y)
  g.stroke()
}

// ---------------------------------------------------------------- annotation

/** "Lettering" as a row of tiny dashes: no font anywhere. */
export function dashes(g: CanvasRenderingContext2D, x: number, y: number, len: number, rng: Rng) {
  let u = 0
  const parts: number[] = []
  while (u < len) {
    const d = range(rng, 0.25, 0.9)
    parts.push(Math.min(d, len - u))
    u += d + 0.28
  }
  const total = parts.reduce((s, d) => s + d, 0) + 0.28 * (parts.length - 1)
  let px = x - total / 2
  g.beginPath()
  for (const d of parts) {
    seg(g, px, y, px + d, y)
    px += d + 0.28
  }
  g.stroke()
}

export function roomLabel(g: CanvasRenderingContext2D, q: Room, inner: Rect, taken: Rect[], rng: Rng, big: boolean) {
  const iw = inner.x1 - inner.x0
  const ih = inner.y1 - inner.y0
  if (Math.min(iw, ih) < 4.5 || q.type === 'stair' || q.type === 'lift')
    return
  const len = Math.min(big ? 5.5 : 4.2, iw * 0.55)
  const cands: Array<[number, number]> = []
  const cx = (inner.x0 + inner.x1) / 2
  const cy = (inner.y0 + inner.y1) / 2
  for (const [dx, dy] of [[0, 0], [0, -0.25], [0, 0.25], [-0.25, 0], [0.25, 0], [-0.25, -0.25], [0.25, 0.25], [0.25, -0.25], [-0.25, 0.25]]) cands.push([cx + dx * iw, cy + dy * ih])
  const l1 = range(rng, 0.7, 1) * len
  const l2 = range(rng, 0.3, 0.45) * len
  for (const [x, y] of cands) {
    const box = { x0: x - len / 2 - 0.3, x1: x + len / 2 + 0.3, y0: y - 1.2, y1: y + 1.2 }
    if (box.x0 < inner.x0 || box.x1 > inner.x1 || box.y0 < inner.y0 || box.y1 > inner.y1)
      continue
    if (taken.some(t => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0))
      continue
    const lw = g.lineWidth
    g.lineWidth = lw * 1.6
    dashes(g, x, y - 0.35, l1, rng)
    g.lineWidth = lw
    dashes(g, x, y + 0.6, l2, rng)
    return
  }
}

export interface Chain { pos: number[], from: number[] }

/**
 * A dimension chain on one side of the plan (0 top, 1 right, 2 bottom, 3 left):
 * extension lines, the chain with slashed ticks, dash "figures", then the
 * overall dimension further out.
 */
export function dimChain(g: CanvasRenderingContext2D, side: number, ch: Chain, line: number, overall: [number, number] | null, line2: number, pal: Pal, pens: { fine: number, tick: number }, rng: Rng) {
  const horiz = side === 0 || side === 2
  const out = side === 0 || side === 3 ? -1 : 1
  const P = (u: number, v: number): [number, number] => horiz ? [u, v] : [v, u]
  const L = (u0: number, v0: number, u1: number, v1: number) => {
    const [a, b] = P(u0, v0)
    const [c, d] = P(u1, v1)
    seg(g, a, b, c, d)
  }
  g.strokeStyle = pal.dim
  g.lineWidth = pens.fine
  g.beginPath()
  const sorted = ch.pos.map((p, i) => [p, ch.from[i]] as const).sort((a, b) => a[0] - b[0])
  // ticks closer than a cell and a half merge into one
  const order: Array<readonly [number, number]> = []
  for (const o of sorted) {
    const last = order[order.length - 1]
    if (last && o[0] - last[0] < 1.5) {
      if (o === sorted[sorted.length - 1])
        order[order.length - 1] = o
      continue
    }
    order.push(o)
  }
  const pos = order.map(o => o[0])
  for (const [p, f] of order) L(p, f + out * 0.8, p, line + out * 0.7)
  L(pos[0] - 0.8, line, pos[pos.length - 1] + 0.8, line)
  if (overall) {
    L(overall[0], line + out * 0.7, overall[0], line2 + out * 0.7)
    L(overall[1], line + out * 0.7, overall[1], line2 + out * 0.7)
    L(overall[0] - 0.8, line2, overall[1] + 0.8, line2)
  }
  g.stroke()
  g.lineWidth = pens.tick
  g.beginPath()
  const tick = (u: number, v: number) => L(u - 0.45, v + 0.45, u + 0.45, v - 0.45)
  for (const p of pos) tick(p, line)
  if (overall) {
    tick(overall[0], line2)
    tick(overall[1], line2)
  }
  g.stroke()
  g.lineWidth = pens.fine
  g.strokeStyle = pal.dim
  const fig = (a: number, b: number, v: number) => {
    if (b - a < 3)
      return
    const [x, y] = P((a + b) / 2, v + out * 0.75)
    g.save()
    g.translate(x, y)
    if (!horiz)
      g.rotate(-Math.PI / 2)
    dashes(g, 0, 0, Math.min(2.6, (b - a) * 0.45), rng)
    g.restore()
  }
  for (let i = 0; i + 1 < pos.length; i++) fig(pos[i], pos[i + 1], line)
  if (overall)
    fig(overall[0], overall[1], line2)
}

// ---------------------------------------------------------------- sheet

export function northArrow(g: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, pal: Pal, lw: number) {
  g.save()
  g.translate(x, y)
  g.strokeStyle = pal.ink
  g.lineWidth = lw
  g.beginPath()
  g.arc(0, 0, r, 0, Math.PI * 2)
  g.stroke()
  g.rotate(ang)
  g.beginPath()
  g.moveTo(0, -r * 1.25)
  g.lineTo(r * 0.38, r * 0.55)
  g.lineTo(0, r * 0.25)
  g.lineTo(-r * 0.38, r * 0.55)
  g.closePath()
  g.stroke()
  g.fillStyle = pal.kind === 'cad' ? pal.accent : pal.ink
  g.beginPath()
  g.moveTo(0, -r * 1.25)
  g.lineTo(0, r * 0.25)
  g.lineTo(r * 0.38, r * 0.55)
  g.closePath()
  g.fill()
  // a short bar in place of the letter N
  g.lineWidth = lw * 1.4
  g.beginPath()
  seg(g, -r * 0.18, -r * 1.55, r * 0.18, -r * 1.55)
  g.stroke()
  g.restore()
}

export function scaleBar(g: CanvasRenderingContext2D, x: number, y: number, unit: number, h: number, pal: Pal, lw: number) {
  g.strokeStyle = pal.ink
  g.fillStyle = pal.ink
  g.lineWidth = lw
  for (let i = 0; i < 5; i++) {
    if (i % 2 === 0)
      g.fillRect(x + i * unit, y, unit, h)
  }
  g.strokeRect(x, y, unit * 5, h)
  g.beginPath()
  for (let i = 0; i <= 5; i++) seg(g, x + i * unit, y + h, x + i * unit, y + h * 1.8)
  g.stroke()
}

export function titleBlock(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pal: Pal, lw: number, rng: Rng) {
  g.strokeStyle = pal.ink
  g.lineWidth = lw * 1.6
  g.strokeRect(x, y, w, h)
  g.lineWidth = lw
  const c1 = x + w * 0.3
  const c2 = x + w * 0.72
  g.beginPath()
  seg(g, c1, y, c1, y + h)
  seg(g, c2, y, c2, y + h)
  seg(g, c1, y + h / 2, x + w, y + h / 2)
  g.stroke()
  // lettering as dashes, scaled to the block
  g.save()
  g.translate(0, 0)
  const s = h / 10
  g.scale(s, s)
  g.lineWidth = (lw * 2.2) / s
  dashes(g, (x + c1) / 2 / s, (y + h * 0.42) / s, (c1 - x) * 0.6 / s, rng)
  g.lineWidth = lw / s
  dashes(g, (x + c1) / 2 / s, (y + h * 0.66) / s, (c1 - x) * 0.4 / s, rng)
  for (const [a, b] of [[c1, c2], [c2, x + w]]) {
    for (const yy of [0.27, 0.77]) dashes(g, (a + b) / 2 / s, (y + h * yy) / s, (b - a) * range(rng, 0.3, 0.6) / s, rng)
  }
  g.restore()
}
