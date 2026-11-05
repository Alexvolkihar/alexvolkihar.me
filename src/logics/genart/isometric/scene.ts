// Plan of one isometric district for the "Isometric" series.
//
// A square grid of n x n cells. Each cell has a ground level, a surface and
// at most one object (a block of flats, a slender tower, a few trees, a
// flight of stairs, an arch, a stretch of rampart, a jetty or a fountain).
// The plan is a pure function of the 'plan' random stream: it never looks at
// the canvas, so the same hash plans the same district at every size.
//
// World units: one cell is 1 x 1, heights use the same unit.

import type { Rng } from '../random'
import { chance, int, range, weighted } from '../random'

export type Layout = 'Town' | 'Terraces' | 'Island' | 'Canals' | 'Citadel'
export type Skyline = 'Low' | 'Mixed' | 'Towers'
export type Greenery = 'Bare' | 'Leafy' | 'Garden'
export type Roof = 'flat' | 'pyramid' | 'gable' | 'dome'
export type Surface = 'lawn' | 'paving' | 'road' | 'sand' | 'water'
export type Axis = 'i' | 'j'

/** Height of one storey. */
export const FLOOR = 0.3
/** Height of one terrace step. */
export const STEP = 0.42
export const WATER_TOP = -0.14
export const WATER_BED = -0.36
/** Bottom of the plinth the district stands on. */
export const DEPTH = 0.8

export interface Block {
  t: 'block'
  inset: number
  floors: number
  /** Storeys of a set-back upper tier (0: none). */
  upper: number
  roof: Roof
  ridge: Axis
  wall: number
  roofTint: number
}
export interface Tower { t: 'tower', floors: number, roof: 'spire' | 'crown' | 'lantern', wall: number, roofTint: number, stripes: boolean }
export interface TreeSpot { x: number, y: number, size: number, cone: boolean }
export interface Trees { t: 'trees', spots: TreeSpot[] }
/** A flight of steps climbing one terrace step towards the -axis neighbour. */
export interface Stairs { t: 'stairs', axis: Axis }
/** A bridge or a gate, its opening on the +axis face. */
export interface Arch { t: 'arch', axis: Axis, kind: 'bridge' | 'gate' }
export interface Wall { t: 'wall' }
/** A jetty running along +axis. */
export interface Dock { t: 'dock', axis: Axis }
export interface Fountain { t: 'fountain' }
export type Obj = Block | Tower | Trees | Stairs | Arch | Wall | Dock | Fountain

export interface Cell {
  ground: number
  surface: Surface
  /** Direction a road runs along. */
  road: Axis
  obj: Obj | null
}

export interface Scene { n: number, cells: Cell[] }

export interface SceneOptions {
  layout: Layout
  skyline: Skyline
  greenery: Greenery
  roofs: ReadonlyArray<readonly [Roof, number]>
  walls: number
  roofTints: number
}

const TREE_P: Record<Greenery, number> = { Bare: 0.03, Leafy: 0.15, Garden: 0.32 }

export function buildScene(r: Rng, o: SceneOptions): Scene {
  const n = o.layout === 'Island' ? 12 : int(r, 10, 12)
  const cells: Cell[] = Array.from({ length: n * n }, () => ({ ground: 0, surface: 'paving' as Surface, road: 'i' as Axis, obj: null }))
  const at = (i: number, j: number) => cells[i * n + j]
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n
  const c0 = (n - 1) / 2
  const centrality = (i: number, j: number) => Math.max(0, 1 - Math.hypot(i - c0, j - c0) / (c0 * Math.SQRT2))
  const treeP = TREE_P[o.greenery]

  function floors(i: number, j: number, cap = 99): number {
    const c = centrality(i, j)
    const x = r()
    let f: number
    if (o.skyline === 'Low')
      f = 1 + Math.floor(x * (2 + c * 1.5))
    else if (o.skyline === 'Mixed')
      f = 1 + Math.floor(x ** 1.5 * (3 + c * 5))
    else if (x < 0.14 + 0.38 * c)
      f = 7 + Math.floor(r() * 6 * (0.5 + c * 0.6))
    else
      f = 2 + Math.floor(r() * 3)
    return Math.min(f, cap)
  }

  function block(i: number, j: number, cap = 99): Block {
    const f = floors(i, j, cap)
    const upper = f >= 4 && chance(r, 0.4) ? Math.max(1, Math.floor(f * range(r, 0.2, 0.45))) : 0
    let roof = weighted(r, o.roofs)
    // tall slabs keep flat tops: a pitched roof on a tower reads as a spire
    if (f >= 7 && roof !== 'dome')
      roof = 'flat'
    return {
      t: 'block',
      inset: range(r, 0.06, 0.17),
      floors: f,
      upper,
      roof,
      ridge: chance(r, 0.5) ? 'i' : 'j',
      wall: int(r, 0, o.walls - 1),
      roofTint: int(r, 0, o.roofTints - 1),
    }
  }

  function trees(count: number): Trees {
    const spots: TreeSpot[] = []
    for (let k = 0; k < count; k++) {
      const size = count === 1 ? range(r, 0.24, 0.32) : range(r, 0.15, 0.21)
      const m = size + 0.06
      spots.push({
        x: count === 1 ? range(r, 0.42, 0.58) : range(r, m, 1 - m),
        y: count === 1 ? range(r, 0.42, 0.58) : range(r, m, 1 - m),
        size,
        cone: chance(r, 0.3),
      })
    }
    spots.sort((a, b) => (a.x + a.y) - (b.x + b.y))
    return { t: 'trees', spots }
  }

  function tower(floorsN: number, roof: Tower['roof'], stripes: boolean): Tower {
    return { t: 'tower', floors: floorsN, roof, wall: int(r, 0, o.walls - 1), roofTint: int(r, 0, o.roofTints - 1), stripes }
  }

  /** Buildings, trees or an open square on one cell. */
  function populate(i: number, j: number, buildP: number, cap = 99) {
    const c = at(i, j)
    const x = r()
    const tp = treeP
    if (x < tp) {
      c.obj = trees(o.greenery === 'Garden' ? int(r, 1, 3) : int(r, 1, 2))
      c.surface = 'lawn'
    }
    else if (x < tp + buildP * (1 - tp)) {
      c.obj = block(i, j, cap)
    }
    else {
      c.surface = chance(r, 0.35 + treeP) ? 'lawn' : 'paving'
      if (c.surface === 'lawn' && chance(r, 0.4))
        c.obj = trees(1)
    }
  }

  if (o.layout === 'Town') {
    const s1 = int(r, 2, n - 4)
    const s2 = int(r, 2, n - 4)
    const s3 = chance(r, 0.6) ? s1 + int(r, 3, 4) : -1
    const plaza = chance(r, 0.65)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        if (i === s1 || i === s3) {
          c.surface = 'road'
          c.road = 'j'
        }
        else if (j === s2) {
          c.surface = 'road'
          c.road = 'i'
        }
        else if (plaza && i > s1 && i <= s1 + 2 && j > s2 && j <= s2 + 2 && i !== s3) {
          c.surface = 'paving'
          if (i === s1 + 1 && j === s2 + 1)
            c.obj = { t: 'fountain' }
          else if (chance(r, treeP * 2))
            c.obj = trees(1)
        }
        else {
          populate(i, j, 0.82)
        }
      }
    }
    // a bell tower near the middle
    if (chance(r, 0.55)) {
      const ti = Math.min(n - 1, s1 + 1 + int(r, 0, 1))
      const tj = Math.max(0, s2 - 1 - int(r, 0, 1))
      if (at(ti, tj).surface !== 'road')
        at(ti, tj).obj = tower(int(r, 6, 9), 'spire', false)
    }
  }
  else if (o.layout === 'Terraces') {
    const tilt = range(r, 0.55, 1.45)
    const f1 = range(r, 0.5, 1.1)
    const p1 = range(r, 0, Math.PI * 2)
    const amp = range(r, 0.15, 0.35)
    const level = (i: number, j: number) => {
      const v = (i * tilt + j * (2 - tilt)) / (2 * (n - 1))
      const wobble = amp * Math.sin((i - j) * f1 * 0.5 + p1)
      return Math.max(0, Math.min(3, Math.floor((1 - v) * 4.2 + wobble - 0.3)))
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++)
        at(i, j).ground = level(i, j) * STEP
    }
    // stairs first, so the landings above them stay clear
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        const c = at(i, j)
        const backI = at(i - 1, j)
        const backJ = at(i, j - 1)
        if (Math.abs(backI.ground - c.ground - STEP) < 1e-6 && chance(r, 0.3) && backI.obj?.t !== 'stairs') {
          c.obj = { t: 'stairs', axis: 'i' }
          backI.surface = 'paving'
        }
        else if (Math.abs(backJ.ground - c.ground - STEP) < 1e-6 && chance(r, 0.3) && backJ.obj?.t !== 'stairs') {
          c.obj = { t: 'stairs', axis: 'j' }
          backJ.surface = 'paving'
        }
      }
    }
    const landing = new Set<number>()
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const s = at(i, j).obj
        if (s?.t === 'stairs')
          landing.add(s.axis === 'i' ? (i - 1) * n + j : i * n + j - 1)
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        if (c.obj || landing.has(i * n + j))
          continue
        c.surface = 'lawn'
        populate(i, j, 0.55)
      }
    }
  }
  else if (o.layout === 'Island') {
    const ph = [range(r, 0, 6.283), range(r, 0, 6.283), range(r, 0, 6.283)]
    const am = [range(r, 0.04, 0.12), range(r, 0.03, 0.1), range(r, 0.02, 0.06)]
    const ox = range(r, -0.6, 0.6)
    const oy = range(r, -0.6, 0.6)
    const hill = chance(r, 0.55)
    const radius = (t: number) => n * 0.43 * (1 + am[0] * Math.sin(2 * t + ph[0]) + am[1] * Math.sin(3 * t + ph[1]) + am[2] * Math.sin(5 * t + ph[2]))
    const land = (i: number, j: number) => {
      if (!inside(i, j))
        return false
      const dx = i - c0 - ox
      const dy = j - c0 - oy
      return Math.hypot(dx, dy) < radius(Math.atan2(dy, dx))
    }
    const shores: number[] = []
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        if (!land(i, j)) {
          c.surface = 'water'
          c.ground = WATER_TOP
          continue
        }
        const shore = !land(i + 1, j) || !land(i - 1, j) || !land(i, j + 1) || !land(i, j - 1)
        if (shore) {
          c.surface = 'sand'
          shores.push(i * n + j)
          if (chance(r, treeP * 0.8))
            c.obj = trees(1)
          continue
        }
        const dx = i - c0 - ox
        const dy = j - c0 - oy
        if (hill && Math.hypot(dx, dy) < radius(Math.atan2(dy, dx)) * 0.45)
          c.ground = STEP
        c.surface = 'lawn'
        populate(i, j, 0.62)
      }
    }
    if (shores.length) {
      // a lighthouse on the shore furthest back, a jetty on the front shore
      let back = shores[0]
      let front = shores[0]
      for (const s of shores) {
        const k = Math.floor(s / n) + (s % n)
        if (k < Math.floor(back / n) + (back % n))
          back = s
        if (k > Math.floor(front / n) + (front % n))
          front = s
      }
      at(Math.floor(back / n), back % n).obj = tower(int(r, 5, 7), 'lantern', true)
      const fi = Math.floor(front / n)
      const fj = front % n
      at(fi, fj).obj = null
      const axis: Axis = chance(r, 0.5) ? 'i' : 'j'
      for (let k = 1; k <= 3; k++) {
        const di = axis === 'i' ? fi + k : fi
        const dj = axis === 'j' ? fj + k : fj
        if (!inside(di, dj) || at(di, dj).surface !== 'water')
          break
        at(di, dj).obj = { t: 'dock', axis }
      }
    }
  }
  else if (o.layout === 'Canals') {
    const ci = int(r, 3, n - 4)
    const cross = chance(r, 0.55)
    const cj = int(r, 2, n - 3)
    const every = int(r, 3, 4)
    const off = int(r, 0, every - 1)
    const water = (i: number, j: number) => inside(i, j) && (i === ci || (cross && j === cj))
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        if (water(i, j)) {
          c.surface = 'water'
          c.ground = WATER_TOP
        }
      }
    }
    const clear = new Set<number>()
    for (let j = off; j < n; j += every) {
      if (cross && Math.abs(j - cj) < 1)
        continue
      at(ci, j).obj = { t: 'arch', axis: 'j', kind: 'bridge' }
      clear.add((ci - 1) * n + j)
      clear.add((ci + 1) * n + j)
    }
    if (cross) {
      for (let i = (off + 1) % every; i < n; i += every) {
        if (Math.abs(i - ci) < 1)
          continue
        at(i, cj).obj = { t: 'arch', axis: 'i', kind: 'bridge' }
        clear.add(i * n + cj - 1)
        clear.add(i * n + cj + 1)
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        if (c.surface === 'water')
          continue
        if (clear.has(i * n + j)) {
          c.surface = 'paving'
          continue
        }
        const quay = water(i + 1, j) || water(i - 1, j) || water(i, j + 1) || water(i, j - 1)
        populate(i, j, quay ? 0.72 : 0.84)
      }
    }
  }
  else {
    // Citadel
    const p0 = int(r, 2, 3)
    const p1 = n - 1 - int(r, 2, 3)
    const moat = chance(r, 0.5)
    const mid = Math.round((p0 + p1) / 2)
    const gateOnI = chance(r, 0.5)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const c = at(i, j)
        const inI = i >= p0 && i <= p1
        const inJ = j >= p0 && j <= p1
        if (inI && inJ) {
          c.ground = STEP
          const edgeI = i === p0 || i === p1
          const edgeJ = j === p0 || j === p1
          if (edgeI && edgeJ) {
            c.obj = tower(int(r, 3, 4), 'crown', false)
          }
          else if (edgeI || edgeJ) {
            const gate = gateOnI ? (i === p1 && j === mid) : (j === p1 && i === mid)
            c.obj = gate ? { t: 'arch', axis: gateOnI ? 'i' : 'j', kind: 'gate' } : { t: 'wall' }
            c.surface = 'paving'
          }
          else if (i === mid && j === mid) {
            c.obj = tower(int(r, 8, 11), chance(r, 0.6) ? 'spire' : 'crown', false)
          }
          else {
            populate(i, j, 0.55, o.skyline === 'Towers' ? 9 : 5)
          }
          continue
        }
        const ring = Math.max(p0 - i, i - p1, p0 - j, j - p1)
        if (moat && ring === 1) {
          c.surface = 'water'
          c.ground = WATER_TOP
          const gateFront = gateOnI ? (i === p1 + 1 && j === mid) : (j === p1 + 1 && i === mid)
          if (gateFront)
            c.obj = { t: 'arch', axis: gateOnI ? 'j' : 'i', kind: 'bridge' }
          continue
        }
        c.surface = 'lawn'
        const gatePath = gateOnI ? (j === mid && i > p1) : (i === mid && j > p1)
        if (gatePath) {
          c.surface = 'paving'
          continue
        }
        populate(i, j, 0.38, 2)
      }
    }
  }

  return { n, cells }
}
