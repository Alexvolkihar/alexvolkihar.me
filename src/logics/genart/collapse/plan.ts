// Plans for the symmetric landscapes. A mirrored noise relief reads as an ink
// blot, so a Mirror or Kaleidoscope landscape is laid out as a designed
// estate instead: a walled parterre crossed by canals, a bastioned citadel in
// its moat, or a grand canal running down to a harbour. The plan is only a
// target terrain level at every lattice point and a weight for the road and
// river tiles of every cell: the solver still picks every tile from the local
// rules, then the solved half or quarter is reflected.
//
// Coordinates are in cells from the centre of the grid (lattice points sit on
// integers), and every size is a fraction of h, the half-width of the central
// square in cells, so a plan keeps its proportions on every grid.

import type { Rng } from '../random'
import type { Tile } from './wfc'
import { pick, weighted } from '../random'
import { phash, valueNoise } from './geom'

const DEEP = 0
const SHALLOW = 1
const SAND = 2
const GRASS = 3
const FOREST = 4

export type PlanKind = 'Parterre' | 'Citadel' | 'Canal'

export interface Plan {
  kind: PlanKind
  /** Target terrain level at a lattice point. */
  level: (x: number, y: number) => number
  /** Weight multiplier of a road or river tile in the cell centred at (x, y). */
  feature: (x: number, y: number, t: Tile) => number
  /** Spread of the guide: the smaller, the closer the solver keeps to the plan. */
  sigma: number
}

const isRoad = (t: Tile) => t.groups.some(g => g.kind === 'road')
const isWater = (t: Tile) => t.groups.some(g => g.kind !== 'road')

/** Square with rounded corners: superellipse distance. */
const squircle = (ax: number, ay: number) => (ax ** 10 + ay ** 10) ** (1 / 10)

/**
 * Blocks of `p - 1` lattice points separated by one-point walks, in the band
 * [a, b]. Returns the block index, or -1 on a walk or outside the band.
 */
function block(q: number, a: number, b: number, p: number): number {
  if (q < a || q > b)
    return -1
  const k = q - a
  return k % p === p - 1 ? -1 : Math.floor(k / p)
}

/** How a compartment of a parterre is planted. */
type Planting = 'grove' | 'basin' | 'quincunx'
const PLANTINGS: ReadonlyArray<readonly [Planting, number]> = [['grove', 35], ['basin', 30], ['quincunx', 35]]

function parterre(h: number, r: Rng): Plan {
  // The garden fills the square: a moat all round with a gravel walk on
  // each bank, grass and woods outside, and inside, gravel walks crossed by
  // two canals that meet in a pool. Water only ever meets gravel here, so the
  // banks never need a cliff.
  const E = h >= 12 || h < 8 ? h - 1 : h - 2
  const P = h >= 12 ? 2 : 1
  // Each quarter is a lawn compartment between the gravel banks of the
  // canals and a gravel walk along the moat; on a fine grid a cross walk
  // splits it in four.
  const a0 = P + 1
  const a1 = E - 2
  const p = h >= 12 ? (a1 - a0 + 2) / 2 : a1 - a0 + 2
  const R = (p - 2) / 2
  const inner = weighted(r, PLANTINGS)
  const outer = r() < 0.5 ? inner : weighted(r, PLANTINGS)
  // the moat, the canals on the axes and the central pool
  const water = (ax: number, ay: number) => ax === 0 || ay === 0 || Math.hypot(ax, ay) <= P || (squircle(ax, ay) > E - 0.5 && squircle(ax, ay) <= E + 0.5)
  const wet = (ax: number, ay: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (water(Math.abs(ax + dx), Math.abs(ay + dy)))
          return true
      }
    }
    return false
  }
  return {
    kind: 'Parterre',
    sigma: 0.25,
    level: (x, y) => {
      const ax = Math.abs(x)
      const ay = Math.abs(y)
      const d = squircle(ax, ay)
      if (d > E + 2.5)
        return FOREST
      if (d > E + 1.5)
        return GRASS
      if (d > E + 0.5)
        return SAND
      if (water(ax, ay))
        return Math.hypot(ax, ay) < 0.5 && P > 1 ? DEEP : SHALLOW
      const bx = block(ax, a0, a1, p)
      const by = block(ay, a0, a1, p)
      // gravel, also all round the water, where a lawn would need a cliff
      if (bx < 0 || by < 0 || wet(ax, ay))
        return SAND
      // inside a compartment: a lawn, with trees or a pool in its middle
      const ox = ax - a0 - bx * p - R
      const oy = ay - a0 - by * p - R
      if (R === 0 || Math.max(Math.abs(ox), Math.abs(oy)) >= R - 0.5)
        return GRASS
      const what = bx + by === 0 ? inner : outer
      if (what === 'quincunx')
        return (Math.round(ox + R) % 2 === 1 && Math.round(oy + R) % 2 === 1) || R < 1.5 ? FOREST : GRASS
      return what === 'basin' ? SHALLOW : FOREST
    },
    feature: (_x, _y, t) => isWater(t) || isRoad(t) ? 1e-3 : 1,
  }
}

function citadel(h: number, r: Rng): Plan {
  // On a coarse grid the trace takes more of the square and the moat is
  // narrower, so the town inside keeps a few streets.
  const F = h >= 8 ? Math.round(h * 0.45) : 3
  const B = h * 0.22
  const W = h >= 12 ? 2.3 : h >= 8 ? 2 : 1
  const noise = valueNoise(Math.floor(r() * 4294967296) | 0)
  const groves = pick(r, [0.58, 0.64, 0.7])
  // Euclidean signed distance to the bastioned trace: a square with a
  // diamond bastion on each corner. Euclidean, so that the diagonal faces of
  // the bastions and their moat stay thick enough on the lattice.
  const box = (px: number, py: number, b: number) => {
    const qx = Math.abs(px) - b
    const qy = Math.abs(py) - b
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
  }
  // A coarse grid has no room for bastions: there, the trace is a plain
  // square, measured in the max norm, so the narrow moat never runs
  // diagonally across the lattice.
  const sd = h >= 8
    ? (ax: number, ay: number) => {
        const dx = ax - F
        const dy = ay - F
        return Math.min(box(ax, ay, F), box((dx + dy) / Math.SQRT2, (dx - dy) / Math.SQRT2, B / Math.SQRT2))
      }
    : (ax: number, ay: number) => Math.max(ax, ay) - F
  return {
    kind: 'Citadel',
    sigma: 0.25,
    level: (x, y) => {
      const ax = Math.abs(x)
      const ay = Math.abs(y)
      const d = sd(ax, ay)
      if (d <= 0) {
        // rampart, bastions planted with trees, and the town inside
        if (d > -1)
          return GRASS
        if (Math.max(ax, ay) > F + 0.5)
          return FOREST
        return GRASS
      }
      if (d <= W)
        return SHALLOW
      if (d <= W + 1)
        return GRASS
      // the country around: fields and woods, mirrored with the plan
      return noise(ax * 0.35 + 3, y * 0.35 + 7) > groves ? FOREST : GRASS
    },
    feature: (x, y, t) => {
      if (isWater(t))
        return 1e-3
      if (!isRoad(t))
        return 1
      // streets inside the walls, lanes in the country
      return sd(Math.abs(x), Math.abs(y)) < -1 ? 120 : 0.4
    },
  }
}

function canal(h: number, r: Rng): Plan {
  const m0 = h >= 12 ? 3 : 2
  const quay = h - m0 - 1
  const R = h >= 8 ? 2 : 1
  const yb = -Math.round(h * 0.45)
  const yc = Math.round(h * 0.15)
  const C = Math.max(2, Math.round(h * 0.6))
  const p = h >= 12 ? 4 : 3
  const seed = Math.floor(r() * 4294967296) | 0
  const woods = r() < 0.5
  return {
    kind: 'Canal',
    sigma: 0.25,
    level: (x, y) => {
      const ax = Math.abs(x)
      // the sea, and on a tall canvas the far shore beyond it
      if (y > quay + 9)
        return FOREST
      if (y > quay + 7)
        return GRASS
      if (y > quay + 6)
        return SAND
      if (y > quay)
        return y > quay + 2 && y < quay + 5 ? DEEP : SHALLOW
      if (y === quay)
        return ax === 0 ? SHALLOW : GRASS
      // the grand canal, from its head basin down to the sea
      const rb = Math.hypot(ax, y - yb)
      if (rb <= R)
        return rb < 0.5 && R > 1 ? DEEP : SHALLOW
      if (ax === 0 && y > yb)
        return SHALLOW
      // the cross canal, with a round basin at each end
      if (y === yc && ax <= C)
        return SHALLOW
      if (Math.hypot(ax - C, y - yc) <= 1)
        return SHALLOW
      // woods behind the head basin
      if (y < yb - R - 1)
        return woods || ax > R + 2 ? FOREST : GRASS
      // bosquets along the canal, behind a lawn walk on each bank
      const bx = block(ax, 2, h - 1, p)
      const by = block(y, yb - R + 1, quay - 2, p)
      if (bx < 0 || by < 0 || Math.abs(y - yc) <= 1 || rb <= R + 1)
        return GRASS
      return phash(seed, bx, by) < 0.7 ? FOREST : GRASS
    },
    feature: (x, y, t) => {
      if (isWater(t))
        return 1e-3
      if (!isRoad(t))
        return 1
      // the avenue across the head of the canal, and lanes in the woods
      return Math.abs(y - (yb - R - 1.5)) < 1 ? 30 : y < yb ? 1 : 0.02
    },
  }
}

/** Picks and builds the plan of a symmetric landscape. */
export function landscapePlan(symmetry: 'Mirror' | 'Kaleidoscope', h: number, r: Rng): Plan {
  if (symmetry === 'Kaleidoscope') {
    // a parterre needs more cells than a coarse grid has
    const kind = weighted<PlanKind>(r, [['Parterre', 55], ['Citadel', 45]])
    return kind === 'Parterre' && h >= 8 ? parterre(h, r) : citadel(h, r)
  }
  return weighted<PlanKind>(r, [['Canal', 60], ['Citadel', 40]]) === 'Canal' ? canal(h, r) : citadel(h, r)
}

/**
 * Makes a planned lattice (w x h points, row-major) solvable: every cell must
 * mix levels the tileset can join, i.e. two neighbouring levels or the
 * grass-on-shallows cliff. The plans are drawn with simple shapes, so where
 * two shapes meet a cell can ask for more; those cells are settled by fixed
 * rules applied to every cell at once, so a symmetric plan stays symmetric:
 * forest gives way to grass, deep water to shallows, grass to gravel, and a
 * cliff that only touches the water by a corner takes the water in.
 */
export function legalize(lat: Float64Array, w: number, h: number): void {
  const next = new Float64Array(lat.length)
  for (let pass = 0; pass < 24; pass++) {
    next.set(lat)
    let changed = false
    for (let j = 0; j + 1 < h; j++) {
      for (let i = 0; i + 1 < w; i++) {
        const ids = [j * w + i, j * w + i + 1, (j + 1) * w + i + 1, (j + 1) * w + i]
        const v = ids.map(k => lat[k])
        const lo = Math.min(...v)
        const hi = Math.max(...v)
        const cliff = v.every(x => x === SHALLOW || x === GRASS)
        if (hi - lo <= 1 || (cliff && !(v[0] === v[2] && v[1] === v[3] && v[0] !== v[1])))
          continue
        changed = true
        for (let q = 0; q < 4; q++) {
          const k = ids[q]
          if (hi === FOREST && v[q] === FOREST)
            next[k] = GRASS
          else if (hi !== FOREST && lo === DEEP && v[q] === DEEP)
            next[k] = SHALLOW
          else if (hi !== FOREST && lo !== DEEP && !cliff && v[q] === GRASS)
            next[k] = SAND
          else if (cliff && v[q] === GRASS)
            next[k] = SHALLOW
        }
      }
    }
    lat.set(next)
    if (!changed)
      return
  }
}
