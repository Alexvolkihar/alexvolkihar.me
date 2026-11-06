// Water, parks and buildings for the Streets series.
//
// Water is described by curves that are graphs over a straight axis (a
// meandering river, a coastline), so the inside test is exact and cheap and
// the drawn outline matches it. Building footprints are lots set along each
// street, oriented to it and pushed back from the carriageway; a lot is kept
// only when it clears every road, the water, the parks and the lots already
// placed (tested on a fine occupancy raster).

import type { Rng } from '../random'
import type { Noise2 } from './field'
import type { Road } from './roads'
import { range } from '../random'
import { fbm } from './field'

export type Ring = number[]

export interface Water {
  test: (x: number, y: number) => boolean
  /** Filled areas (closed rings, x/y interleaved). */
  areas: Ring[]
  /** Shorelines (open or closed polylines) used for the water lining. */
  shores: Ring[]
}

interface Wave {
  a: number
  k: number
  p: number
}

function waves(r: Rng, specs: ReadonlyArray<readonly [number, number, number, number]>): Wave[] {
  return specs.map(([a0, a1, k0, k1]) => ({ a: range(r, a0, a1), k: range(r, k0, k1), p: range(r, 0, Math.PI * 2) }))
}

const sumWaves = (ws: readonly Wave[], t: number) => ws.reduce((s, w) => s + w.a * Math.sin(w.k * t + w.p), 0)

export interface WaterSpec {
  kind: 'Inland' | 'River' | 'Coast' | 'Estuary'
  /** Half extents of the visible map, in short-side units. */
  ax: number
  ay: number
  /** City centre (may be moved inland). */
  cx: number
  cy: number
}

export interface WaterResult extends Water {
  cx: number
  cy: number
  riverWidth: number
}

export function makeWater(spec: WaterSpec, r: Rng, noise: Noise2): WaterResult {
  const tests: ((x: number, y: number) => boolean)[] = []
  const areas: Ring[] = []
  const shores: Ring[] = []
  const owners: number[] = []
  let { cx, cy } = spec
  const L = Math.hypot(spec.ax, spec.ay) + 0.4
  const dt = 0.005
  let riverWidth = 0

  // Draws are made in a fixed order whatever the kind.
  const coastAngle = range(r, 0, Math.PI * 2)
  const coastFrac = range(r, 0.3, 0.62)
  const coastWaves = waves(r, [[0.04, 0.12, 2.2, 4.5], [0.012, 0.03, 7, 12], [0.004, 0.01, 18, 30]])
  const riverAngle = range(r, 0, Math.PI * 2)
  const riverOffset = range(r, 0.06, 0.2) * (r() < 0.5 ? -1 : 1)
  const riverWaves = waves(r, [[0.03, 0.075, 3, 5.5], [0.008, 0.02, 8, 13]])
  const riverW = range(r, 0.035, 0.06)
  const estuaryTurn = range(r, -0.45, 0.45)

  const hasCoast = spec.kind === 'Coast' || spec.kind === 'Estuary'
  const nx = Math.cos(coastAngle)
  const ny = Math.sin(coastAngle)
  // How far the visible map reaches along n.
  const reach = spec.ax * Math.abs(nx) + spec.ay * Math.abs(ny)
  const s0 = reach * coastFrac
  const shoreAt = (t: number) => s0 + sumWaves(coastWaves, t) + fbm(noise, t * 6 + 40, 3.5) * 0.012
  if (hasCoast) {
    // keep the centre well inland
    const d = cx * nx + cy * ny - (s0 - 0.32)
    if (d > 0) {
      cx -= nx * d
      cy -= ny * d
    }
    const ux = -ny
    const uy = nx
    tests.push((x, y) => x * nx + y * ny > shoreAt(x * ux + y * uy))
    const shore: Ring = []
    for (let t = -L; t <= L; t += dt) {
      const s = shoreAt(t)
      shore.push(t * ux + s * nx, t * uy + s * ny)
    }
    const far = s0 + 4
    areas.push([...shore, L * ux + far * nx, L * uy + far * ny, -L * ux + far * nx, -L * uy + far * ny])
    shores.push(shore)
    owners.push(tests.length - 1)
  }

  if (spec.kind === 'River' || spec.kind === 'Estuary') {
    let ux = Math.cos(riverAngle)
    let uy = Math.sin(riverAngle)
    if (spec.kind === 'Estuary') {
      // flow towards the sea, at a slant
      ux = nx * Math.cos(estuaryTurn) - ny * Math.sin(estuaryTurn)
      uy = nx * Math.sin(estuaryTurn) + ny * Math.cos(estuaryTurn)
    }
    const rnx = -uy
    const rny = ux
    const ox = cx + rnx * riverOffset
    const oy = cy + rny * riverOffset
    // Where (along u) the river meets the coast, to widen the mouth.
    const mouth = hasCoast ? (s0 - (ox * nx + oy * ny)) / Math.max(0.3, ux * nx + uy * ny) : 1e9
    riverWidth = riverW
    const width = (t: number) => {
      let w = riverW * (1 + 0.12 * Math.sin(t * 2.3 + riverOffset * 9))
      if (hasCoast && t > mouth - 0.6)
        w *= 1 + 2.2 * Math.exp((t - mouth) / 0.18)
      return w
    }
    tests.push((x, y) => {
      const qx = x - ox
      const qy = y - oy
      const t = qx * ux + qy * uy
      return Math.abs(qx * rnx + qy * rny - sumWaves(riverWaves, t)) < width(t) / 2
    })
    const left: Ring = []
    const right: Ring = []
    for (let t = -L; t <= Math.min(L, mouth + 0.3); t += dt) {
      const c = sumWaves(riverWaves, t)
      const w = width(t) / 2
      left.push(ox + t * ux + (c + w) * rnx, oy + t * uy + (c + w) * rny)
      right.push(ox + t * ux + (c - w) * rnx, oy + t * uy + (c - w) * rny)
    }
    const ring = left.slice()
    for (let i = right.length - 2; i >= 0; i -= 2)
      ring.push(right[i], right[i + 1])
    areas.push(ring)
    shores.push(left, right)
    owners.push(tests.length - 1, tests.length - 1)
    // keep the centre on dry land
    const qx = cx - ox
    const qy = cy - oy
    const t = qx * ux + qy * uy
    const off = qx * rnx + qy * rny - sumWaves(riverWaves, t)
    if (Math.abs(off) < riverW) {
      const push = (riverW - Math.abs(off)) * Math.sign(off || 1)
      cx += rnx * push
      cy += rny * push
    }
  }

  return {
    test: (x, y) => {
      for (const t of tests) {
        if (t(x, y))
          return true
      }
      return false
    },
    areas,
    shores: splitShores(shores, owners, tests),
    cx,
    cy,
    riverWidth,
  }
}

/** Cut each shore where it runs inside another body of water (a river mouth, the sea). */
function splitShores(shores: readonly Ring[], owners: readonly number[], tests: readonly ((x: number, y: number) => boolean)[]): Ring[] {
  const out: Ring[] = []
  shores.forEach((s, k) => {
    let cur: Ring = []
    for (let i = 0; i < s.length; i += 2) {
      const wet = tests.some((t, j) => j !== owners[k] && t(s[i], s[i + 1]))
      if (wet) {
        if (cur.length > 2)
          out.push(cur)
        cur = []
      }
      else {
        cur.push(s[i], s[i + 1])
      }
    }
    if (cur.length > 2)
      out.push(cur)
  })
  return out
}

export interface Park {
  kind: 'formal' | 'garden' | 'plaza' | 'lake'
  x: number
  y: number
  test: (x: number, y: number) => boolean
  ring: Ring
}

export function rectPark(x: number, y: number, angle: number, hw: number, hh: number): Park {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const ring = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].flatMap(([u, v]) => [x + u * c - v * s, y + u * s + v * c])
  return {
    kind: 'formal',
    x,
    y,
    test: (px, py) => {
      const qx = px - x
      const qy = py - y
      return Math.abs(qx * c + qy * s) < hw && Math.abs(-qx * s + qy * c) < hh
    },
    ring,
  }
}

export function blobPark(kind: Park['kind'], x: number, y: number, rad: number, r: Rng): Park {
  const hs = [[2, range(r, 0, 0.16), range(r, 0, 6.3)], [3, range(r, 0, 0.12), range(r, 0, 6.3)], [5, range(r, 0, 0.06), range(r, 0, 6.3)]]
  const radius = (a: number) => rad * (1 + hs.reduce((s, [k, amp, p]) => s + amp * Math.sin(k * a + p), 0))
  const ring: Ring = []
  for (let i = 0; i < 96; i++) {
    const a = i / 96 * Math.PI * 2
    const rr = radius(a)
    ring.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  return {
    kind,
    x,
    y,
    test: (px, py) => {
      const dx = px - x
      const dy = py - y
      const d2 = dx * dx + dy * dy
      if (d2 > (rad * 1.4) ** 2)
        return false
      return d2 < radius(Math.atan2(dy, dx)) ** 2
    },
    ring,
  }
}

/** Uniform grid of road segments, for clearance queries. */
export class SegGrid {
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly buckets: number[][]
  /** x1, y1, x2, y2, half width (5 per segment). */
  readonly segs: number[] = []

  constructor(x0: number, y0: number, x1: number, y1: number, cell: number) {
    this.cell = cell
    this.x0 = x0
    this.y0 = y0
    this.cols = Math.ceil((x1 - x0) / cell) + 1
    this.rows = Math.ceil((y1 - y0) / cell) + 1
    this.buckets = Array.from({ length: this.cols * this.rows }, () => [])
  }

  add(ax: number, ay: number, bx: number, by: number, hw: number, pad: number) {
    const id = this.segs.length
    this.segs.push(ax, ay, bx, by, hw)
    const e = hw + pad
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - e - this.x0) / this.cell))
    const i1 = Math.min(this.cols - 1, Math.floor((Math.max(ax, bx) + e - this.x0) / this.cell))
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - e - this.y0) / this.cell))
    const j1 = Math.min(this.rows - 1, Math.floor((Math.max(ay, by) + e - this.y0) / this.cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++)
        this.buckets[j * this.cols + i].push(id)
    }
  }

  /** Smallest (distance - half width) over the segments of the point's cell. */
  clearance(x: number, y: number): number {
    const i = Math.floor((x - this.x0) / this.cell)
    const j = Math.floor((y - this.y0) / this.cell)
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows)
      return 1
    let best = 1
    const S = this.segs
    for (const id of this.buckets[j * this.cols + i]) {
      const ax = S[id]
      const ay = S[id + 1]
      const dx = S[id + 2] - ax
      const dy = S[id + 3] - ay
      const l2 = dx * dx + dy * dy
      let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = ax + t * dx - x
      const ey = ay + t * dy - y
      const lim = best + S[id + 4]
      if (lim <= 0 || ex * ex + ey * ey >= lim * lim)
        continue
      best = Math.sqrt(ex * ex + ey * ey) - S[id + 4]
    }
    return best
  }
}

/** Boolean raster of occupied ground. */
export class Occupancy {
  readonly res: number
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly bits: Uint8Array

  constructor(x0: number, y0: number, x1: number, y1: number, res: number) {
    this.res = res
    this.x0 = x0
    this.y0 = y0
    this.cols = Math.ceil((x1 - x0) / res) + 1
    this.rows = Math.ceil((y1 - y0) / res) + 1
    this.bits = new Uint8Array(this.cols * this.rows)
  }

  /**
   * Visit the cells whose centre lies in the oriented rectangle
   * (centre, unit axis t, half sizes hu along t and hv across).
   * With `mark` false, returns true at the first occupied cell.
   */
  rect(cx: number, cy: number, tx: number, ty: number, hu: number, hv: number, mark: boolean): boolean {
    const ex = Math.abs(tx) * hu + Math.abs(ty) * hv
    const ey = Math.abs(ty) * hu + Math.abs(tx) * hv
    const i0 = Math.max(0, Math.floor((cx - ex - this.x0) / this.res))
    const i1 = Math.min(this.cols - 1, Math.ceil((cx + ex - this.x0) / this.res))
    const j0 = Math.max(0, Math.floor((cy - ey - this.y0) / this.res))
    const j1 = Math.min(this.rows - 1, Math.ceil((cy + ey - this.y0) / this.res))
    for (let j = j0; j <= j1; j++) {
      const y = this.y0 + (j + 0.5) * this.res - cy
      for (let i = i0; i <= i1; i++) {
        const x = this.x0 + (i + 0.5) * this.res - cx
        if (Math.abs(x * tx + y * ty) > hu || Math.abs(-x * ty + y * tx) > hv)
          continue
        const k = j * this.cols + i
        if (mark)
          this.bits[k] = 1
        else if (this.bits[k])
          return true
      }
    }
    return false
  }
}

export interface Lots {
  /** 8 numbers (4 corners) per building. */
  quads: number[]
  /** Shade 0..2 per building. */
  shade: number[]
}

export interface LotSpec {
  /** Typical lot frontage and depth (short-side units). */
  width: number
  depth: number
  setback: number
  /** Ground between two buildings. */
  gap: number
}

/**
 * Lots along every road of tier >= 1, both sides. `urban` in 0..1 scales
 * the chance and size of a building (dense, deep blocks downtown, scattered
 * houses on the fringe).
 */
export function placeLots(
  roads: readonly Road[],
  segs: SegGrid,
  occ: Occupancy,
  spec: LotSpec,
  r: Rng,
  free: (x: number, y: number) => boolean,
  urban: (x: number, y: number) => number,
): Lots {
  const quads: number[] = []
  const shade: number[] = []
  for (const road of roads) {
    const n = road.xs.length
    if (n < 2)
      continue
    // cumulative length
    const cum = [0]
    for (let i = 1; i < n; i++)
      cum.push(cum[i - 1] + Math.hypot(road.xs[i] - road.xs[i - 1], road.ys[i] - road.ys[i - 1]))
    const total = cum[n - 1]
    let s = range(r, 0, spec.width)
    let i = 1
    while (s < total) {
      const lw = spec.width * range(r, 0.7, 1.35)
      const sc = s + lw / 2
      s += lw + spec.gap
      while (i < n - 1 && cum[i] < sc)
        i++
      const segLen = cum[i] - cum[i - 1]
      if (segLen < 1e-9 || road.bridge[i - 1])
        continue
      const f = (sc - cum[i - 1]) / segLen
      const px = road.xs[i - 1] + (road.xs[i] - road.xs[i - 1]) * f
      const py = road.ys[i - 1] + (road.ys[i] - road.ys[i - 1]) * f
      const tx = (road.xs[i] - road.xs[i - 1]) / segLen
      const ty = (road.ys[i] - road.ys[i - 1]) / segLen
      const u = urban(px, py)
      for (const side of [-1, 1]) {
        const roll = r()
        const deep = r()
        if (u <= 0 || roll > Math.min(1, 0.45 + u * 1.6))
          continue
        const big = Math.min(1, u * 1.3)
        const hu = (lw / 2) * (0.82 + big * 0.14)
        const nx = -ty * side
        const ny = tx * side
        // the road's half width (clearance is minus it on the centre line)
        const hw = Math.max(0, -segs.clearance(px, py))
        // a deep lot first, then a shallow one if the block is too narrow
        for (const shrink of [1, 0.55]) {
          const hv = spec.depth * (0.55 + big * 0.7) * (0.75 + deep * 0.6) * shrink / 2
          const off = spec.setback + hv + hw
          const cx = px + nx * off
          const cy = py + ny * off
          // corners and centre must clear roads, water and parks
          let ok = true
          for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const qx = cx + tx * hu * a + nx * hv * b
            const qy = cy + ty * hu * a + ny * hv * b
            if (segs.clearance(qx, qy) < spec.setback * 0.6 || !free(qx, qy)) {
              ok = false
              break
            }
          }
          if (!ok || occ.rect(cx, cy, tx, ty, hu + spec.gap / 2, hv + spec.gap / 2, false))
            continue
          occ.rect(cx, cy, tx, ty, hu, hv, true)
          quads.push(
            cx - tx * hu - nx * hv,
            cy - ty * hu - ny * hv,
            cx + tx * hu - nx * hv,
            cy + ty * hu - ny * hv,
            cx + tx * hu + nx * hv,
            cy + ty * hu + ny * hv,
            cx - tx * hu + nx * hv,
            cy - ty * hu + ny * hv,
          )
          shade.push(Math.min(2, Math.floor(deep * 3)))
          break
        }
      }
    }
  }
  return { quads, shade }
}
