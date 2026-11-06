// Floor plan generation for the "Floorplan" series.
//
// Everything lives on an integer grid of 0.3 m cells. A footprint is a union
// of rectangles (zones); each zone may carry a corridor band and fixed pieces
// (stair cores, corridor connectors). The room program is spread over the
// zones by area, and each free rectangle is subdivided either by an
// area-weighted binary space partition or by the squarified treemap of Bruls,
// Huizing and van Wijk (2000), as in Marson and Musse's treemap floor plans
// (2010): whichever gives the better-proportioned rooms. Doors follow a
// minimum spanning tree (Prim) of the room adjacency graph, weighted by how
// natural each connection is; walls are the merged cell edges between rooms.

import type { Rng } from '../random'
import { chance, int, range } from '../random'

export interface Rect { x0: number, y0: number, x1: number, y1: number }

export type RoomType = 'living' | 'kitchen' | 'dining' | 'entry' | 'corridor' | 'bedroom' | 'master'
  | 'bath' | 'wc' | 'study' | 'stair' | 'dressing' | 'laundry' | 'storage' | 'foyer' | 'flat' | 'lift'

export type Program = 'Cottage' | 'House' | 'Villa' | 'Flats'
export type Footprint = 'Rectangle' | 'L-shape' | 'Courtyard' | 'Stepped'

export interface Room extends Rect { id: number, type: RoomType, group: number }

/** A wall run: horizontal (o = 0, line y = c, x from a to b) or vertical (o = 1). */
export interface Wall { o: 0 | 1, c: number, a: number, b: number, t: number, ea: boolean, eb: boolean }

export type OpeningKind = 'door' | 'pass' | 'front' | 'window' | 'slide' | 'lift'

export interface Opening {
  o: 0 | 1
  c: number
  a: number
  b: number
  kind: OpeningKind
  /** Wall thickness at the opening. */
  t: number
  /** Room the leaf swings into (-1: none). */
  into: number
  /** Normal direction (+1 / -1 along y for o = 0, along x for o = 1) pointing into `into`. */
  dir: 1 | -1
  /** Hinge at a (0) or at b (1). */
  hinge: 0 | 1
}

/** Side of a rectangle: 0 top (y0), 1 right (x1), 2 bottom (y1), 3 left (x0). */
export type Side = 0 | 1 | 2 | 3

export interface Plan {
  rooms: Room[]
  walls: Wall[]
  openings: Opening[]
  zones: Rect[]
  bbox: Rect
  terrace: (Rect & { side: Side }) | null
  court: Rect | null
  /** Room interior (rectangle inside the wall faces), per room id. */
  inner: Rect[]
  /** Per room id and side: exterior runs [a, b] along that side. */
  ext: Array<Array<Array<[number, number]>>>
  /** Where the entrance is: point just outside the front door, and the inward normal. */
  entrance: { x: number, y: number, nx: number, ny: number } | null
}

export const EXT_T = 1.2
export const INT_T = 0.4
export const PARTY_T = 0.8

const CIRC: ReadonlySet<RoomType> = new Set(['corridor', 'entry', 'foyer'])
const WET: ReadonlySet<RoomType> = new Set(['bath', 'wc', 'kitchen', 'laundry'])
export const isWet = (t: RoomType) => WET.has(t)

const MIN_DIM: Record<RoomType, number> = {
  living: 11,
  kitchen: 8,
  dining: 9,
  entry: 6,
  corridor: 4,
  bedroom: 9,
  master: 10,
  bath: 6,
  wc: 4,
  study: 8,
  stair: 7,
  dressing: 5,
  laundry: 5,
  storage: 4,
  foyer: 5,
  flat: 10,
  lift: 4,
}

interface Item { type: RoomType, w: number }
type Piece = Rect & { type: RoomType }

const area = (r: Rect) => (r.x1 - r.x0) * (r.y1 - r.y0)
const wOf = (r: Rect) => r.x1 - r.x0
const hOf = (r: Rect) => r.y1 - r.y0

// ---------------------------------------------------------------- program

function program(prog: Program, r: Rng): Item[] {
  const list: Item[] = []
  const add = (type: RoomType, w: number) => list.push({ type, w: w * range(r, 0.85, 1.15) })
  if (prog === 'Cottage') {
    add('entry', 5)
    add('living', 26)
    add('kitchen', 11)
    if (chance(r, 0.4))
      add('study', 8)
    add('bedroom', 13)
    if (chance(r, 0.55))
      add('bedroom', 10)
    add('bath', 6)
    if (chance(r, 0.4))
      add('storage', 3)
  }
  else if (prog === 'House') {
    add('entry', 7)
    add('living', 32)
    add('kitchen', 13)
    if (chance(r, 0.6))
      add('dining', 12)
    add('wc', 3.5)
    if (chance(r, 0.5))
      add('stair', 8)
    if (chance(r, 0.4))
      add('study', 9)
    add('master', 16)
    add('bath', 7.5)
    add('bedroom', 12)
    add('bedroom', 11)
    if (chance(r, 0.4))
      add('bedroom', 10)
    if (chance(r, 0.5))
      add('storage', 3.5)
  }
  else {
    add('entry', 11)
    add('living', 44)
    add('dining', 18)
    add('kitchen', 16)
    if (chance(r, 0.6))
      add('laundry', 6)
    add('wc', 4)
    if (chance(r, 0.7))
      add('stair', 10)
    add('study', 12)
    add('master', 20)
    add('dressing', 6)
    add('bath', 8)
    add('bedroom', 14)
    add('bedroom', 13)
    if (chance(r, 0.6))
      add('bedroom', 12)
    add('bath', 8)
    add('storage', 4)
  }
  return list
}

// ---------------------------------------------------------------- partition

function clampCut(c: number, lo: number, hi: number, m: number) {
  if (hi - lo < 2 * m)
    return Math.round((lo + hi) / 2)
  return Math.min(hi - m, Math.max(lo + m, c))
}

/** Area-weighted binary space partition, keeping the order of the items. */
function bsp(rect: Rect, items: Item[], out: Piece[]) {
  if (items.length === 1) {
    out.push({ ...rect, type: items[0].type })
    return
  }
  let total = 0
  for (const it of items) total += it.w
  let k = 1
  let best = Infinity
  let acc = 0
  let kAcc = 0
  for (let i = 1; i < items.length; i++) {
    acc += items[i - 1].w
    const d = Math.abs(acc - total / 2)
    if (d < best) {
      best = d
      k = i
      kAcc = acc
    }
  }
  const f = kAcc / total
  if (wOf(rect) >= hOf(rect)) {
    const cut = clampCut(rect.x0 + Math.round(wOf(rect) * f), rect.x0, rect.x1, 5)
    bsp({ ...rect, x1: cut }, items.slice(0, k), out)
    bsp({ ...rect, x0: cut }, items.slice(k), out)
  }
  else {
    const cut = clampCut(rect.y0 + Math.round(hOf(rect) * f), rect.y0, rect.y1, 5)
    bsp({ ...rect, y1: cut }, items.slice(0, k), out)
    bsp({ ...rect, y0: cut }, items.slice(k), out)
  }
}

/** Squarified treemap (Bruls, Huizing & van Wijk 2000), snapped to the grid. */
function squarify(rect: Rect, itemsIn: Item[], out: Piece[]) {
  const items = [...itemsIn].sort((a, b) => b.w - a.w)
  const r = { ...rect }
  let i = 0
  while (i < items.length) {
    const W = wOf(r)
    const H = hOf(r)
    let sumRest = 0
    for (let j = i; j < items.length; j++) sumRest += items[j].w
    const s = (W * H) / sumRest
    const side = Math.min(W, H)
    const worst = (n: number) => {
      let a = 0
      for (let j = i; j < i + n; j++) a += items[j].w * s
      const t = a / side
      let m = 0
      for (let j = i; j < i + n; j++) {
        const l = (items[j].w * s) / t
        m = Math.max(m, t / l, l / t)
      }
      return m
    }
    let n = 1
    while (i + n < items.length && worst(n + 1) <= worst(n)) n++
    const last = i + n >= items.length
    let rowArea = 0
    for (let j = i; j < i + n; j++) rowArea += items[j].w * s
    const vertical = W >= H // the row is a column on the left
    const full = vertical ? W : H
    let thick = last ? full : Math.max(1, Math.min(full - 1, Math.round(rowArea / side)))
    if (!last && full - thick < 1)
      thick = full - 1
    let rowSum = 0
    for (let j = i; j < i + n; j++) rowSum += items[j].w
    let acc = 0
    let prev = 0
    for (let j = i; j < i + n; j++) {
      acc += items[j].w
      const pos = j === i + n - 1 ? side : Math.round((side * acc) / rowSum)
      if (vertical)
        out.push({ x0: r.x0, x1: r.x0 + thick, y0: r.y0 + prev, y1: r.y0 + pos, type: items[j].type })
      else
        out.push({ x0: r.x0 + prev, x1: r.x0 + pos, y0: r.y0, y1: r.y0 + thick, type: items[j].type })
      prev = pos
    }
    if (vertical)
      r.x0 += thick
    else
      r.y0 += thick
    i += n
  }
}

function score(pieces: Piece[]) {
  let p = 0
  for (const q of pieces) {
    const w = wOf(q)
    const h = hOf(q)
    const d = Math.min(w, h)
    if (d < MIN_DIM[q.type])
      p += 40 * (MIN_DIM[q.type] - d)
    if (d <= 0)
      p += 1000
    p += Math.max(0, Math.max(w, h) / Math.max(1, d) - 2.2) * 3
  }
  return p
}

function partition(rect: Rect, items: Item[], r: Rng): Piece[] {
  const cands: Piece[][] = []
  const a: Piece[] = []
  bsp(rect, items, a)
  cands.push(a)
  const b: Piece[] = []
  squarify(rect, items, b)
  cands.push(b)
  const c: Piece[] = []
  bsp(rect, [...items].reverse(), c)
  cands.push(c)
  // a coin decides which method wins ties, so both styles appear
  const order = chance(r, 0.5) ? [1, 0, 2] : [0, 1, 2]
  let best = cands[order[0]]
  let bs = score(best)
  for (const k of order.slice(1)) {
    const s = score(cands[k])
    if (s < bs - 0.5) {
      best = cands[k]
      bs = s
    }
  }
  return best
}

/** Splits `items` into consecutive groups whose weights follow `areas`; no group is empty. */
function spread(items: Item[], areas: number[]): Item[][] {
  const groups: Item[][] = areas.map(() => [])
  let W = 0
  for (const it of items) W += it.w
  let A = 0
  for (const a of areas) A += a
  let acc = 0
  for (const it of items) {
    const mid = (acc + it.w / 2) / W
    acc += it.w
    let z = 0
    let ca = areas[0] / A
    while (z < areas.length - 1 && mid > ca) {
      z++
      ca += areas[z] / A
    }
    groups[z].push(it)
  }
  for (let z = 0; z < groups.length; z++) {
    if (groups[z].length)
      continue
    // borrow from the fullest neighbour
    let donor = -1
    for (let k = 0; k < groups.length; k++) {
      if (groups[k].length > 1 && (donor < 0 || groups[k].length > groups[donor].length))
        donor = k
    }
    if (donor >= 0)
      groups[z].push(donor < z ? groups[donor].pop()! : groups[donor].shift()!)
    else
      groups[z].push({ type: 'storage', w: 1 })
  }
  return groups
}

/** Free space of a zone minus its fixed pieces, as a few maximal rectangles. */
function freeRects(zone: Rect, fixed: Rect[]): Rect[] {
  const xs = new Set([zone.x0, zone.x1])
  const ys = new Set([zone.y0, zone.y1])
  for (const f of fixed) {
    xs.add(Math.max(zone.x0, Math.min(zone.x1, f.x0)))
    xs.add(Math.max(zone.x0, Math.min(zone.x1, f.x1)))
    ys.add(Math.max(zone.y0, Math.min(zone.y1, f.y0)))
    ys.add(Math.max(zone.y0, Math.min(zone.y1, f.y1)))
  }
  const X = [...xs].sort((a, b) => a - b)
  const Y = [...ys].sort((a, b) => a - b)
  const free = (i: number, j: number) => {
    const cx = (X[i] + X[i + 1]) / 2
    const cy = (Y[j] + Y[j + 1]) / 2
    return !fixed.some(f => cx > f.x0 && cx < f.x1 && cy > f.y0 && cy < f.y1)
  }
  // runs per row, then merge identical runs downwards
  let open: Rect[] = []
  const done: Rect[] = []
  for (let j = 0; j < Y.length - 1; j++) {
    const runs: Array<[number, number]> = []
    let i = 0
    while (i < X.length - 1) {
      if (!free(i, j)) {
        i++
        continue
      }
      const s = i
      while (i < X.length - 1 && free(i, j)) i++
      runs.push([X[s], X[i]])
    }
    const next: Rect[] = []
    for (const [a, b] of runs) {
      const o = open.find(q => q.x0 === a && q.x1 === b)
      if (o) {
        o.y1 = Y[j + 1]
        next.push(o)
      }
      else {
        next.push({ x0: a, x1: b, y0: Y[j], y1: Y[j + 1] })
      }
    }
    for (const o of open) {
      if (!next.includes(o))
        done.push(o)
    }
    open = next
  }
  return [...done, ...open].filter(q => wOf(q) > 0 && hOf(q) > 0)
}

// ---------------------------------------------------------------- footprints

interface Zone extends Rect {
  /** Side of the zone that touches its parent zone (-1 for the main zone). */
  parent: Side | -1
  fixed: Piece[]
  /** Fixed corridor band for flats (decided with the footprint). */
  flats: boolean
}

const SIZES: Record<Program, [number, number, number, number]> = {
  Cottage: [36, 44, 24, 30],
  House: [46, 56, 30, 36],
  Villa: [60, 72, 36, 44],
  Flats: [70, 84, 38, 42],
}

const CW_FLATS = 5

function flatsCore(zone: Rect, band: Rect, r: Rng, at: number): Piece[] {
  // stair + lift, against the corridor, in the strip with more room
  const top = band.y0 - zone.y0 >= zone.y1 - band.y1
  const y0 = top ? zone.y0 : band.y1
  const y1 = top ? band.y0 : zone.y1
  const x0 = Math.round(at)
  const liftFirst = chance(r, 0.5)
  const sw = 8
  const lw = 5
  if (liftFirst) {
    return [
      { x0, x1: x0 + lw, y0, y1, type: 'lift' },
      { x0: x0 + lw, x1: x0 + lw + sw, y0, y1, type: 'stair' },
    ]
  }
  return [
    { x0, x1: x0 + sw, y0, y1, type: 'stair' },
    { x0: x0 + sw, x1: x0 + sw + lw, y0, y1, type: 'lift' },
  ]
}

function buildZones(fp: Footprint, prog: Program, r: Rng): Zone[] {
  const [l0, l1, d0, d1] = SIZES[prog]
  let L = int(r, l0, l1)
  const D = int(r, d0, d1)
  const flats = prog === 'Flats'
  const z = (x0: number, y0: number, x1: number, y1: number, parent: Side | -1): Zone =>
    ({ x0, y0, x1, y1, parent, fixed: [], flats })

  if (flats) {
    const cy = Math.round((D - CW_FLATS) / 2)
    const band = (zz: Zone) => zz.fixed.push({ x0: zz.x0, x1: zz.x1, y0: zz.y0 + cy, y1: zz.y0 + cy + CW_FLATS, type: 'corridor' })
    if (fp === 'Rectangle') {
      const m = z(0, 0, L, D, -1)
      band(m)
      m.fixed.push(...flatsCore(m, m.fixed[0], r, L * range(r, 0.4, 0.55)))
      return [m]
    }
    if (fp === 'L-shape' || fp === 'Courtyard') {
      if (fp === 'Courtyard')
        L = Math.max(L, 2 * D + 18)
      const Lw = Math.round(D * range(r, 0.75, 1.05))
      const m = z(0, 0, L, D, -1)
      band(m)
      const out = [m]
      const wings = fp === 'Courtyard' ? [0, L - D] : [0]
      const cx = Math.round((D - CW_FLATS) / 2)
      for (const wx of wings) {
        const w = z(wx, D, wx + D, D + Lw, 0)
        w.fixed.push({ x0: wx + cx, x1: wx + cx + CW_FLATS, y0: D, y1: D + Lw, type: 'corridor' })
        // connector through the main slab's lower strip
        m.fixed.push({ x0: wx + cx, x1: wx + cx + CW_FLATS, y0: cy + CW_FLATS, y1: D, type: 'corridor' })
        out.push(w)
      }
      const mid = fp === 'Courtyard' ? L / 2 - 6 : D + (L - D) * range(r, 0.25, 0.5)
      m.fixed.push(...flatsCore(m, m.fixed[0], r, mid))
      return out
    }
    // Stepped slabs sharing one corridor line
    const n = L >= 78 ? 3 : 2
    L = Math.max(L, n * 30)
    const lo = cy + CW_FLATS + 12 - D
    const hi = cy - 12
    const out: Zone[] = []
    let x = 0
    for (let i = 0; i < n; i++) {
      const w = i === n - 1 ? L - x : Math.round((L / n) * range(r, 0.88, 1.12))
      const o = i === 0 ? 0 : int(r, lo, hi)
      const zz = z(x, o, x + w, o + D, i === 0 ? -1 : 3)
      zz.fixed.push({ x0: x, x1: x + w, y0: cy, y1: cy + CW_FLATS, type: 'corridor' })
      out.push(zz)
      x += w
    }
    out[0].fixed.push(...flatsCore(out[0], out[0].fixed[0], r, out[0].x0 + wOf(out[0]) * range(r, 0.3, 0.5)))
    return normalise(out)
  }

  if (fp === 'Rectangle') {
    if (prog === 'Cottage')
      return [z(0, 0, L, D, -1)]
    const dw = Math.round(L * range(r, 0.46, 0.56))
    return [z(0, 0, dw, D, -1), z(dw, 0, L, D, 3)]
  }
  if (fp === 'L-shape') {
    const D1 = Math.round(D * range(r, 0.58, 0.7))
    const Ww = Math.max(16, Math.round(L * range(r, 0.36, 0.46)))
    const Lw = Math.max(14, Math.round(D * range(r, 0.55, 0.8)))
    return [z(0, 0, L, D1, -1), z(0, D1, Ww, D1 + Lw, 0)]
  }
  if (fp === 'Courtyard') {
    const D1 = Math.round(D * range(r, 0.55, 0.66))
    const W1 = Math.max(15, Math.round(L * range(r, 0.27, 0.34)))
    const W2 = Math.max(14, Math.round(L * range(r, 0.24, 0.32)))
    L = Math.max(L, W1 + W2 + 14)
    const L1 = Math.max(14, Math.round(D * range(r, 0.6, 0.85)))
    const L2 = Math.max(12, Math.round(D * range(r, 0.45, 0.8)))
    return [z(0, 0, L, D1, -1), z(0, D1, W1, D1 + L1, 0), z(L - W2, D1, L, D1 + L2, 0)]
  }
  // Stepped: the day zone sits in the middle, the others step up or down
  const n = prog === 'Cottage' ? 2 : 3
  const ws: number[] = []
  let left = L
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? left : Math.max(15, Math.round((L / n) * range(r, 0.85, 1.2)))
    ws.push(w)
    left -= w
  }
  if (ws[n - 1] < 15)
    ws[n - 1] = 15
  const hs = ws.map(() => Math.round(D * range(r, 0.72, 1.05)))
  const ys: number[] = [0]
  for (let i = 1; i < n; i++) {
    const m = Math.min(hs[i], hs[i - 1])
    const sh = Math.round((m * 0.35) * (r() * 2 - 1))
    ys.push(ys[i - 1] + sh)
  }
  const main = n === 3 ? 1 : 0
  const out: Zone[] = []
  let x = 0
  for (let i = 0; i < n; i++) {
    const parent: Side | -1 = i === main ? -1 : (i < main ? 1 : 3)
    out.push(z(x, ys[i], x + ws[i], ys[i] + hs[i], parent))
    x += ws[i]
  }
  // main zone first
  const ordered = [out[main], ...out.filter((_, i) => i !== main)]
  return normalise(ordered)
}

function normalise(zs: Zone[]): Zone[] {
  let mx = Infinity
  let my = Infinity
  for (const q of zs) {
    mx = Math.min(mx, q.x0)
    my = Math.min(my, q.y0)
  }
  for (const q of zs) {
    q.x0 -= mx
    q.x1 -= mx
    q.y0 -= my
    q.y1 -= my
    for (const f of q.fixed) {
      f.x0 -= mx
      f.x1 -= mx
      f.y0 -= my
      f.y1 -= my
    }
  }
  return zs
}

/** Corridor band of a house's night zone. */
function houseCorridor(zone: Zone, r: Rng): Piece | null {
  const W = wOf(zone)
  const H = hOf(zone)
  const alongX = W >= H
  const CW = 4
  const depth = alongX ? H : W
  if (depth < 9 + CW + 2)
    return null
  const parallel = zone.parent >= 0 && (alongX ? (zone.parent === 0 || zone.parent === 2) : (zone.parent === 1 || zone.parent === 3))
  let off: number
  if (parallel) {
    off = (zone.parent === 0 || zone.parent === 3) ? 0 : depth - CW
  }
  else if (depth >= 2 * 9 + CW) {
    off = Math.round((depth - CW) / 2)
  }
  else {
    off = chance(r, 0.5) ? 0 : depth - CW
  }
  if (alongX)
    return { x0: zone.x0, x1: zone.x1, y0: zone.y0 + off, y1: zone.y0 + off + CW, type: 'corridor' }
  return { x0: zone.x0 + off, x1: zone.x0 + off + CW, y0: zone.y0, y1: zone.y1, type: 'corridor' }
}

// ---------------------------------------------------------------- flats units

/** Side of `s` touching any corridor piece, with the longest overlap. */
function corridorSide(s: Rect, cors: Rect[]): Side {
  let best: Side = 0
  let bl = -1
  for (const c of cors) {
    const ox = Math.min(s.x1, c.x1) - Math.max(s.x0, c.x0)
    const oy = Math.min(s.y1, c.y1) - Math.max(s.y0, c.y0)
    const cand: Array<[Side, number]> = []
    if (c.y1 === s.y0)
      cand.push([0, ox])
    if (c.y0 === s.y1)
      cand.push([2, ox])
    if (c.x1 === s.x0)
      cand.push([3, oy])
    if (c.x0 === s.x1)
      cand.push([1, oy])
    for (const [sd, l] of cand) {
      if (l > bl) {
        bl = l
        best = sd
      }
    }
  }
  return best
}

/** Rect from local (u along the corridor, v away from it) coordinates. */
function local(s: Rect, side: Side, u0: number, u1: number, v0: number, v1: number): Rect {
  if (side === 0)
    return { x0: s.x0 + u0, x1: s.x0 + u1, y0: s.y0 + v0, y1: s.y0 + v1 }
  if (side === 2)
    return { x0: s.x0 + u0, x1: s.x0 + u1, y0: s.y1 - v1, y1: s.y1 - v0 }
  if (side === 3)
    return { x0: s.x0 + v0, x1: s.x0 + v1, y0: s.y0 + u0, y1: s.y0 + u1 }
  return { x0: s.x1 - v1, x1: s.x1 - v0, y0: s.y0 + u0, y1: s.y0 + u1 }
}

function flatUnits(strip: Rect, side: Side, r: Rng, nextGroup: () => number): Array<Piece & { group: number }> {
  const out: Array<Piece & { group: number }> = []
  const len = side === 0 || side === 2 ? wOf(strip) : hOf(strip)
  const dep = side === 0 || side === 2 ? hOf(strip) : wOf(strip)
  if (len < 12 || dep < 12) {
    out.push({ ...strip, type: 'storage', group: 0 })
    return out
  }
  const n = Math.max(1, Math.round(len / range(r, 18, 23)))
  let u = 0
  for (let i = 0; i < n; i++) {
    const u1 = i === n - 1 ? len : Math.round((len * (i + 1)) / n)
    const uw = u1 - u
    const g = nextGroup()
    const fd = Math.max(6, Math.min(dep - 9, Math.round(dep * range(r, 0.34, 0.42))))
    const bw = Math.max(6, Math.min(uw - 6, Math.round(uw * range(r, 0.4, 0.5))))
    const flip = chance(r, 0.5)
    const fa = flip ? u + bw : u
    const ba = flip ? u : u + uw - bw
    out.push({ ...local(strip, side, fa, fa + uw - bw, 0, fd), type: 'foyer', group: g })
    out.push({ ...local(strip, side, ba, ba + bw, 0, fd), type: 'bath', group: g })
    if (uw >= 17) {
      const dw = Math.max(9, Math.min(uw - 9, Math.round(uw * range(r, 0.4, 0.48))))
      const flip2 = chance(r, 0.5)
      const la = flip2 ? u + dw : u
      const da = flip2 ? u : u + uw - dw
      out.push({ ...local(strip, side, la, la + uw - dw, fd, dep), type: 'flat', group: g })
      out.push({ ...local(strip, side, da, da + dw, fd, dep), type: 'bedroom', group: g })
    }
    else {
      out.push({ ...local(strip, side, u, u + uw, fd, dep), type: 'flat', group: g })
    }
    u = u1
  }
  return out
}

// ---------------------------------------------------------------- walls

const K = 1024
const ek = (c: number, t: number) => (c + 8) * K + (t + 8)

interface Edges { h: Map<number, number[]>, v: Map<number, number[]> }

function edges(rooms: Room[]): Edges {
  const h = new Map<number, number[]>()
  const v = new Map<number, number[]>()
  const put = (m: Map<number, number[]>, k: number, id: number) => {
    const a = m.get(k)
    if (a)
      a.push(id)
    else
      m.set(k, [id])
  }
  for (const q of rooms) {
    for (let x = q.x0; x < q.x1; x++) {
      put(h, ek(q.y0, x), q.id)
      put(h, ek(q.y1, x), q.id)
    }
    for (let y = q.y0; y < q.y1; y++) {
      put(v, ek(q.x0, y), q.id)
      put(v, ek(q.x1, y), q.id)
    }
  }
  return { h, v }
}

function OPEN_PAIR(a: Room, b: Room) {
  return a.group === 0 && b.group === 0 && (a.type === 'corridor' && b.type === 'corridor')
}

function thickness(ids: number[], rooms: Room[]): number {
  if (ids.length === 1)
    return EXT_T
  const a = rooms[ids[0]]
  const b = rooms[ids[1]]
  if (OPEN_PAIR(a, b))
    return 0
  if (a.group !== b.group)
    return PARTY_T
  return INT_T
}

function buildWalls(E: Edges, rooms: Room[]): Wall[] {
  const walls: Wall[] = []
  for (const [o, m] of [[0, E.h], [1, E.v]] as const) {
    const lines = new Map<number, Array<[number, number]>>()
    for (const [k, ids] of m) {
      const c = Math.floor(k / K) - 8
      const t = (k % K) - 8
      const th = thickness(ids, rooms)
      let a = lines.get(c)
      if (!a)
        lines.set(c, a = [])
      a.push([t, th])
    }
    for (const [c, list] of lines) {
      list.sort((p, q) => p[0] - q[0])
      let i = 0
      while (i < list.length) {
        const th = list[i][1]
        const s = list[i][0]
        let e = s + 1
        i++
        while (i < list.length && list[i][0] === e && list[i][1] === th) {
          e++
          i++
        }
        if (th > 0)
          walls.push({ o, c, a: s, b: e, t: th, ea: true, eb: true })
      }
    }
  }
  return walls
}

// ---------------------------------------------------------------- doors

const RANK: Record<RoomType, number> = {
  corridor: 0,
  entry: 1,
  foyer: 1,
  stair: 1,
  lift: 1,
  living: 2,
  flat: 2,
  dining: 2,
  kitchen: 3,
  study: 4,
  bedroom: 5,
  master: 5,
  dressing: 6,
  laundry: 6,
  storage: 7,
  bath: 7,
  wc: 8,
}

function linkCost(a: Room, b: Room): number {
  if (a.group !== b.group) {
    if (a.group !== 0 && b.group !== 0)
      return Infinity
    const unit = a.group === 0 ? b : a
    const hall = a.group === 0 ? a : b
    if (unit.type !== 'foyer' || hall.type !== 'corridor')
      return Infinity
    return 1
  }
  const ta = a.type
  const tb = b.type
  const has = (t: RoomType) => ta === t || tb === t
  const both = (t: RoomType, u: RoomType) => (ta === t && tb === u) || (ta === u && tb === t)
  if (ta === 'corridor' && tb === 'corridor')
    return 0
  if (has('lift'))
    return has('corridor') ? 0.5 : Infinity
  if (has('stair'))
    return (has('corridor') || has('entry') || has('living')) ? 0.6 : 9
  if (CIRC.has(ta) || CIRC.has(tb))
    return both('entry', 'living') ? 0.8 : 1
  if (has('living')) {
    if (has('kitchen') || has('dining'))
      return 1
    if (has('study'))
      return 3
    if (has('laundry') || has('storage'))
      return 6
    if (has('bedroom') || has('master'))
      return 7
    return 10
  }
  if (has('flat'))
    return has('bedroom') ? 2 : 6
  if (has('kitchen')) {
    if (has('dining'))
      return 1
    if (has('laundry') || has('storage'))
      return 2
    return 9
  }
  if (both('master', 'dressing'))
    return 2
  if (both('master', 'bath') || both('dressing', 'bath'))
    return 3
  if (has('bath') && has('bedroom'))
    return 6
  if (both('bedroom', 'bedroom'))
    return 14
  return 10
}

const PASS_PAIRS: Array<[RoomType, RoomType]> = [
  ['living', 'kitchen'],
  ['living', 'dining'],
  ['kitchen', 'dining'],
  ['entry', 'living'],
  ['corridor', 'stair'],
  ['entry', 'stair'],
  ['living', 'stair'],
  ['foyer', 'flat'],
]
const isPass = (a: RoomType, b: RoomType) => PASS_PAIRS.some(([p, q]) => (p === a && q === b) || (p === b && q === a))

// ---------------------------------------------------------------- build

export function buildPlan(fp: Footprint, prog: Program, rl: Rng, rd: Rng): Plan {
  const zones = buildZones(fp, prog, rl)
  const flats = prog === 'Flats'
  const pieces: Array<Piece & { group: number }> = []
  let groupN = 0
  const nextGroup = () => ++groupN

  if (flats) {
    for (const zn of zones) {
      for (const f of zn.fixed) pieces.push({ ...f, group: 0 })
      const cors = zn.fixed.filter(f => f.type !== 'lift' && f.type !== 'stair')
      const strips = freeRects(zn, zn.fixed)
      // order strips along the slab so groups read left to right
      strips.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0))
      for (const s of strips) {
        const side = corridorSide(s, [...cors, ...zones.flatMap(q => q.fixed.filter(f => f.type === 'corridor'))])
        pieces.push(...flatUnits(s, side, rl, nextGroup))
      }
    }
  }
  else {
    const items = program(prog, rl)
    const groups = spread(items, zones.map(area))
    zones.forEach((zn, zi) => {
      const list = groups[zi]
      const night = list.length >= 3 && !list.some(it => it.type === 'living')
        && list.some(it => it.type === 'bedroom' || it.type === 'master')
      if (night) {
        const c = houseCorridor(zn, rl)
        if (c)
          zn.fixed.push(c)
      }
      for (const f of zn.fixed) pieces.push({ ...f, group: 0 })
      const free = freeRects(zn, zn.fixed)
      const parts = spread(list, free.map(area))
      free.forEach((fr, i) => {
        for (const p of partition(fr, parts[i], rl)) pieces.push({ ...p, group: 0 })
      })
    })
  }

  const rooms: Room[] = pieces
    .filter(p => wOf(p) > 0 && hOf(p) > 0)
    .map((p, id) => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, type: p.type, group: p.group, id }))

  let bx0 = Infinity
  let by0 = Infinity
  let bx1 = -Infinity
  let by1 = -Infinity
  for (const q of rooms) {
    bx0 = Math.min(bx0, q.x0)
    by0 = Math.min(by0, q.y0)
    bx1 = Math.max(bx1, q.x1)
    by1 = Math.max(by1, q.y1)
  }
  const bbox = { x0: bx0, y0: by0, x1: bx1, y1: by1 }

  const E = edges(rooms)
  const walls = buildWalls(E, rooms)

  // per room, per side: wall thickness (max) and exterior runs
  const ext: Array<Array<Array<[number, number]>>> = []
  const inner: Rect[] = []
  for (const q of rooms) {
    const sides: Array<Array<[number, number]>> = []
    const ins: number[] = []
    for (let sd = 0; sd < 4; sd++) {
      const horiz = sd === 0 || sd === 2
      const c = sd === 0 ? q.y0 : sd === 1 ? q.x1 : sd === 2 ? q.y1 : q.x0
      const a = horiz ? q.x0 : q.y0
      const b = horiz ? q.x1 : q.y1
      const m = horiz ? E.h : E.v
      const runs: Array<[number, number]> = []
      let th = 0
      let s = -1
      for (let t = a; t < b; t++) {
        const ids = m.get(ek(c, t))!
        th = Math.max(th, thickness(ids, rooms))
        if (ids.length === 1) {
          if (s < 0)
            s = t
        }
        else if (s >= 0) {
          runs.push([s, t])
          s = -1
        }
      }
      if (s >= 0)
        runs.push([s, b])
      sides.push(runs)
      ins.push(th / 2)
    }
    ext.push(sides)
    inner.push({ x0: q.x0 + ins[3], y0: q.y0 + ins[0], x1: q.x1 - ins[1], y1: q.y1 - ins[2] })
  }

  // adjacency: shared intervals
  const shared = new Map<number, { o: 0 | 1, c: number, a: number, b: number, i: number, j: number }>()
  for (const [o, m] of [[0, E.h], [1, E.v]] as const) {
    for (const [k, ids] of m) {
      if (ids.length !== 2)
        continue
      const i = Math.min(ids[0], ids[1])
      const j = Math.max(ids[0], ids[1])
      const pk = i * 4096 + j
      const c = Math.floor(k / K) - 8
      const t = (k % K) - 8
      const s = shared.get(pk)
      if (s) {
        s.a = Math.min(s.a, t)
        s.b = Math.max(s.b, t + 1)
      }
      else {
        shared.set(pk, { o, c, a: t, b: t + 1, i, j })
      }
    }
  }
  const adj: number[][] = rooms.map(() => [])
  for (const [pk, s] of shared) {
    if (s.b - s.a >= 5) {
      adj[s.i].push(pk)
      adj[s.j].push(pk)
    }
  }

  // Prim's minimum spanning tree from the entrance room
  let root = rooms.findIndex(q => q.type === 'entry')
  if (root < 0)
    root = rooms.findIndex(q => q.type === 'corridor')
  if (root < 0)
    root = rooms.findIndex(q => q.type === 'living')
  if (root < 0)
    root = 0
  const inTree = new Set<number>([root])
  const links: number[] = []
  for (;;) {
    let best = -1
    let bc = Infinity
    for (const i of inTree) {
      for (const pk of adj[i]) {
        const s = shared.get(pk)!
        const o = s.i === i ? s.j : s.i
        if (inTree.has(o))
          continue
        const c = linkCost(rooms[s.i], rooms[s.j])
        if (c < bc) {
          bc = c
          best = pk
        }
      }
    }
    if (best < 0 || bc === Infinity)
      break
    const s = shared.get(best)!
    inTree.add(s.i)
    inTree.add(s.j)
    links.push(best)
  }
  // open plan: extra passages between the day rooms
  for (const [pk, s] of shared) {
    if (links.includes(pk) || s.b - s.a < 6)
      continue
    const a = rooms[s.i]
    const b = rooms[s.j]
    if (isPass(a.type, b.type) && a.group === b.group && !(a.type === 'corridor' || b.type === 'corridor'))
      links.push(pk)
  }

  const openings: Opening[] = []
  const free = (o: 0 | 1, c: number, a: number, b: number, gap: number) =>
    !openings.some(p => p.o === o && p.c === c && p.a < b + gap && p.b > a - gap)

  for (const pk of links) {
    const s = shared.get(pk)!
    const A = rooms[s.i]
    const B = rooms[s.j]
    if (OPEN_PAIR(A, B))
      continue
    const len = s.b - s.a
    const t = thickness([s.i, s.j], rooms)
    const pass = isPass(A.type, B.type) || (A.type === 'lift' || B.type === 'lift')
    if (pass) {
      const lift = A.type === 'lift' || B.type === 'lift'
      const w = lift ? 3 : Math.min(len - 2.4, Math.round(range(rd, 6, 12)))
      const a = s.a + 1.2 + (len - 2.4 - w) * (lift ? 0.5 : range(rd, 0.2, 0.8))
      openings.push({ o: s.o, c: s.c, a, b: a + w, kind: lift ? 'lift' : 'pass', t, into: -1, dir: 1, hinge: 0 })
      continue
    }
    // the leaf swings into the more private room, if there is space for it
    let into = RANK[A.type] >= RANK[B.type] ? A : B
    const depthOf = (q: Room) => s.o === 0 ? hOf(q) : wOf(q)
    if (depthOf(into) < 5)
      into = into === A ? B : A
    const w = 3
    const nearA = chance(rd, 0.5)
    const a = nearA ? s.a + 1.1 : s.b - 1.1 - w
    if (!free(s.o, s.c, a, a + w, 0.6))
      continue
    const dir: 1 | -1 = s.o === 0 ? (into.y0 >= s.c ? 1 : -1) : (into.x0 >= s.c ? 1 : -1)
    openings.push({ o: s.o, c: s.c, a, b: a + w, kind: 'door', t, into: into.id, dir, hinge: nearA ? 0 : 1 })
  }

  const sideLine = (q: Room, sd: Side): [0 | 1, number] =>
    sd === 0 ? [0, q.y0] : sd === 1 ? [1, q.x1] : sd === 2 ? [0, q.y1] : [1, q.x0]
  const outward = (sd: Side): 1 | -1 => (sd === 0 || sd === 3) ? -1 : 1

  // terrace off the living room, on its longest exterior run
  let terrace: Plan['terrace'] = null
  let court: Rect | null = null
  if (fp === 'Courtyard' && zones.length === 3) {
    court = { x0: zones[1].x1, x1: zones[2].x0, y0: zones[0].y1, y1: Math.max(zones[1].y1, zones[2].y1) }
  }
  const zoneHit = (q: Rect) => zones.some(z => q.x0 < z.x1 + 1 && q.x1 > z.x0 - 1 && q.y0 < z.y1 + 1 && q.y1 > z.y0 - 1)
  const living = rooms.find(q => q.type === 'living')
  if (living && !flats) {
    let best: [Side, number, number] | null = null
    for (let sd: number = 0; sd < 4; sd++) {
      for (const [a, b] of ext[living.id][sd]) {
        if (b - a >= 10 && (!best || b - a > best[2] - best[1]))
          best = [sd as Side, a, b]
      }
    }
    if (best) {
      const [sd, a, b] = best
      const [o, c] = sideLine(living, sd)
      const w = Math.min(b - a - 3, Math.round(range(rd, 7, 11)))
      const s0 = a + 1.5 + (b - a - 3 - w) * range(rd, 0.25, 0.75)
      openings.push({ o, c, a: s0, b: s0 + w, kind: 'slide', t: EXT_T, into: living.id, dir: (-outward(sd)) as 1 | -1, hinge: 0 })
      const depth = Math.round(range(rd, 7, 11))
      const ta = Math.max(a - 1, s0 - range(rd, 2, 5))
      const tb = Math.min(b + 1, s0 + w + range(rd, 2, 5))
      for (let d = depth; d >= 5; d--) {
        const dd = outward(sd) * (EXT_T / 2)
        const cand: Rect = o === 0
          ? (outward(sd) < 0 ? { x0: ta, x1: tb, y0: c + dd - d, y1: c + dd } : { x0: ta, x1: tb, y0: c + dd, y1: c + dd + d })
          : (outward(sd) < 0 ? { x0: c + dd - d, x1: c + dd, y0: ta, y1: tb } : { x0: c + dd, x1: c + dd + d, y0: ta, y1: tb })
        const probe: Rect = { x0: cand.x0 + 0.5, x1: cand.x1 - 0.5, y0: cand.y0 + 0.5, y1: cand.y1 - 0.5 }
        // shrink the probe off the wall it leans on
        if (o === 0) {
          if (outward(sd) < 0)
            probe.y1 -= 1.5
          else probe.y0 += 1.5
        }
        else if (outward(sd) < 0) {
          probe.x1 -= 1.5
        }
        else {
          probe.x0 += 1.5
        }
        if (!zoneHit(probe)) {
          terrace = { ...cand, side: sd }
          break
        }
      }
    }
  }

  // front door: entry, else a corridor end (flats), else the living room
  let entrance: Plan['entrance'] = null
  const frontRooms = flats
    ? rooms.filter(q => q.type === 'corridor')
    : [rooms.find(q => q.type === 'entry'), rooms.find(q => q.type === 'corridor'), living].filter(Boolean) as Room[]
  outer: for (const q of frontRooms) {
    const order: Side[] = [2, 0, 3, 1]
    for (const sd of order) {
      if (terrace && terrace.side === sd && q === living)
        continue
      for (const [a, b] of ext[q.id][sd]) {
        if (b - a < 5)
          continue
        const w = flats ? Math.min(b - a - 2, 5) : 3.4
        const [o, c] = sideLine(q, sd)
        const s0 = flats ? (a + b - w) / 2 : a + 1.2 + (b - a - 2.4 - w) * range(rd, 0.3, 0.7)
        if (!free(o, c, s0, s0 + w, 0.8))
          continue
        const inDir = -outward(sd) as 1 | -1
        openings.push({ o, c, a: s0, b: s0 + w, kind: 'front', t: EXT_T, into: q.id, dir: inDir, hinge: chance(rd, 0.5) ? 0 : 1 })
        const mid = s0 + w / 2
        const off = outward(sd) * (EXT_T / 2 + 2.2)
        entrance = o === 0
          ? { x: mid, y: c + off, nx: 0, ny: inDir }
          : { x: c + off, y: mid, nx: inDir, ny: 0 }
        break outer
      }
    }
  }

  // windows on exterior runs
  const WIN: Partial<Record<RoomType, [number, number, number]>> = {
    living: [5, 12, 3],
    flat: [5, 10, 2],
    dining: [4, 9, 2],
    kitchen: [3.5, 7, 1],
    bedroom: [4, 7, 2],
    master: [4, 9, 2],
    study: [3.5, 6, 1],
    bath: [2.5, 3.5, 1],
    wc: [2, 2.5, 1],
    entry: [2.5, 4, 1],
    corridor: [3, 4, 1],
    stair: [3, 5, 1],
    laundry: [2.5, 3, 1],
    dressing: [2, 3, 1],
  }
  for (const q of rooms) {
    const spec = WIN[q.type]
    if (!spec)
      continue
    const [mn, mx, maxN] = spec
    let placed = 0
    const runs: Array<[Side, number, number]> = []
    for (let sd: number = 0; sd < 4; sd++) {
      for (const [a, b] of ext[q.id][sd]) runs.push([sd as Side, a, b])
    }
    runs.sort((p, q2) => (q2[2] - q2[1]) - (p[2] - p[1]))
    for (const [sd, a, b] of runs) {
      if (placed >= maxN)
        break
      const len = b - a
      if (len < mn + 3)
        continue
      const [o, c] = sideLine(q, sd)
      // one or two windows along a long run
      const two = q.type !== 'bath' && q.type !== 'wc' && len >= 2 * mn + 8 && placed + 1 < maxN && chance(rd, 0.5)
      const n = two ? 2 : 1
      const w = Math.min(mx, Math.max(mn, Math.round(len * range(rd, 0.35, 0.6) / n)))
      for (let i = 0; i < n; i++) {
        const cx = a + (len * (i + 0.5)) / n
        const s0 = cx - w / 2
        if (s0 < a + 1.4 || s0 + w > b - 1.4)
          continue
        if (!free(o, c, s0, s0 + w, 1))
          continue
        openings.push({ o, c, a: s0, b: s0 + w, kind: 'window', t: EXT_T, into: q.id, dir: -outward(sd) as 1 | -1, hinge: 0 })
        placed++
      }
    }
  }

  // carve the openings out of the walls
  const cut: Wall[] = []
  for (const wl of walls) {
    const ops = openings
      .filter(p => p.o === wl.o && p.c === wl.c && p.a < wl.b && p.b > wl.a)
      .sort((p, q) => p.a - q.a)
    let a = wl.a
    let ea = wl.ea
    for (const p of ops) {
      if (p.a > a)
        cut.push({ ...wl, a, b: p.a, ea, eb: false })
      a = Math.max(a, p.b)
      ea = false
    }
    if (wl.b > a)
      cut.push({ ...wl, a, b: wl.b, ea, eb: wl.eb })
  }

  return { rooms, walls: cut, openings, zones, bbox, terrace, court, inner, ext, entrance }
}
