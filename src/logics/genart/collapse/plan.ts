// Plans for the symmetric landscapes. A mirrored noise relief reads as an ink
// blot, so a Mirror or Kaleidoscope landscape is laid out as a designed
// estate instead: a parterre crossed by canals, a fortified town in its moat,
// or a grand canal running down to a harbour. The plan is a target terrain
// level at every lattice point and a weight for the road and river tiles of
// every cell: the solver still picks every tile from the local rules, then
// the solved half or quarter is reflected. A plan also lists ornaments
// (fountains, statues, clipped trees, broderie, a keep, house blocks) that
// are drawn over the solved map.
//
// Coordinates are in cells from the centre of the grid (lattice points sit on
// integers), and every size is a fraction of h, the half-width of the central
// square in cells, so a plan keeps its proportions on every grid.

import type { Rng } from '../random'
import type { Ornament } from './geom'
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
  /** Details drawn over the map, in cells from the centre (both halves). */
  ornaments: Ornament[]
  /** The layout picked inside the plan, e.g. the shape of a canal garden. */
  variant?: string
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

/** An ornament and its reflections across the vertical (and horizontal) axis. */
function reflect(list: Ornament[], o: Omit<Ornament, 'v'> & { v?: number }, both: boolean): void {
  const xs = o.x === 0 ? [0] : [o.x, -o.x]
  const ys = both && o.y !== 0 ? [o.y, -o.y] : [o.y]
  for (const x of xs) {
    for (const y of ys)
      list.push({ ...o, x, y, v: o.v ?? 0 })
  }
}

/** Is any lattice point within the max-norm distance d of (x, y) wet? */
function near(water: (x: number, y: number) => boolean, x: number, y: number, d: number): boolean {
  for (let dy = -d; dy <= d; dy++) {
    for (let dx = -d; dx <= d; dx++) {
      if (water(x + dx, y + dy))
        return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Parterre (Kaleidoscope).
// ---------------------------------------------------------------------------

/** How a compartment of a parterre is planted. */
type Planting = 'broderie' | 'grove' | 'basin' | 'quincunx'
const PLANTINGS: ReadonlyArray<readonly [Planting, number]> = [['broderie', 40], ['grove', 20], ['basin', 20], ['quincunx', 20]]

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
  const motif = Math.floor(r() * 4)
  const plant = (bx: number, by: number) => bx + by === 0 ? inner : outer
  // the moat, the canals on the axes and the central pool
  const water = (ax: number, ay: number) => ax === 0 || ay === 0 || Math.hypot(ax, ay) <= P || (squircle(ax, ay) > E - 0.5 && squircle(ax, ay) <= E + 0.5)
  const wet = (ax: number, ay: number) => near((x, y) => water(Math.abs(x), Math.abs(y)), ax, ay, 1)

  // Ornaments: a fountain in the central pool, broderie on the lawns,
  // fountains in their pools, statues where the walks cross, and clipped
  // trees along the canals.
  const ornaments: Ornament[] = []
  reflect(ornaments, { kind: 'fountain', x: 0, y: 0, w: P + 0.6, h: P + 0.6 }, true)
  const nb = h >= 12 ? 2 : 1
  for (let bx = 0; bx < nb; bx++) {
    for (let by = 0; by < nb; by++) {
      const cx = a0 + bx * p + R
      const cy = a0 + by * p + R
      const what = plant(bx, by)
      if (what === 'broderie')
        reflect(ornaments, { kind: 'broderie', x: cx, y: cy, w: 2 * R + 0.8, h: 2 * R + 0.8, v: motif }, true)
      else if (what === 'basin' && R >= 1)
        reflect(ornaments, { kind: 'fountain', x: cx, y: cy, w: 0.7, h: 0.7 }, true)
    }
  }
  for (let k = 1; k <= nb; k++) {
    const q = a0 + k * p - 1
    if (!water(q, q))
      reflect(ornaments, { kind: 'statue', x: q, y: q, w: 0.5, h: 0.5 }, true)
  }
  for (let k = a0; k <= a1; k++) {
    if (block(k, a0, a1, p) >= 0) {
      reflect(ornaments, { kind: 'topiary', x: 1, y: k, w: 0.42, h: 0.42 }, true)
      reflect(ornaments, { kind: 'topiary', x: k, y: 1, w: 0.42, h: 0.42 }, true)
    }
  }

  return {
    kind: 'Parterre',
    sigma: 0.25,
    ornaments,
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
      // inside a compartment: a lawn, with broderie, trees or a pool
      const ox = ax - a0 - bx * p - R
      const oy = ay - a0 - by * p - R
      const what = plant(bx, by)
      if (what === 'broderie' || R === 0 || Math.max(Math.abs(ox), Math.abs(oy)) >= R - 0.5)
        return GRASS
      if (what === 'quincunx')
        return (Math.round(ox + R) % 2 === 1 && Math.round(oy + R) % 2 === 1) || R < 1.5 ? FOREST : GRASS
      return what === 'basin' ? SHALLOW : FOREST
    },
    feature: (_x, _y, t) => isWater(t) || isRoad(t) ? 1e-3 : 1,
  }
}

// ---------------------------------------------------------------------------
// Citadel (Mirror or Kaleidoscope).
// ---------------------------------------------------------------------------

function citadel(h: number, r: Rng): Plan {
  // On a coarse grid the trace takes more of the square and the moat is
  // narrower, so the town inside keeps a few streets.
  const F = h >= 8 ? Math.round(h * 0.45) : 3
  const B = h * 0.22
  const W = h >= 12 ? 2.3 : h >= 8 ? 2 : 1
  const noise = valueNoise(Math.floor(r() * 4294967296) | 0)
  const groves = pick(r, [0.58, 0.64, 0.7])
  // a gravel square in the middle of the town, under the keep
  const plaza = h >= 8 ? 1 : 0
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
  // The keep on the square, and house blocks filling the town.
  const ornaments: Ornament[] = [
    { kind: 'town', x: 0, y: 0, w: 2 * F - 1, h: 2 * F - 1, v: 0 },
    { kind: 'keep', x: 0, y: 0, w: h >= 8 ? 1.7 : 1.25, h: h >= 8 ? 1.7 : 1.25, v: Math.floor(r() * 2) },
  ]
  return {
    kind: 'Citadel',
    sigma: 0.25,
    ornaments,
    level: (x, y) => {
      const ax = Math.abs(x)
      const ay = Math.abs(y)
      const d = sd(ax, ay)
      if (d <= 0) {
        // rampart, bastions planted with trees, the town and its square
        if (d > -1)
          return GRASS
        if (Math.max(ax, ay) > F + 0.5)
          return FOREST
        return Math.max(ax, ay) <= plaza ? SAND : GRASS
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

// ---------------------------------------------------------------------------
// Canal (Mirror only): a garden running down to the sea.
// ---------------------------------------------------------------------------

/** A straight canal from (x1, y1) to (x2, y2), on the x >= 0 half. */
type Segment = readonly [number, number, number, number]
/** An elliptic or square basin, on the x >= 0 half. */
interface Basin { x: number, y: number, rx: number, ry: number }

type CanalLayout = 'cross' | 'goosefoot' | 'chain' | 'fork' | 'terraces' | 'parallel'

function segmentDistance(px: number, py: number, [x1, y1, x2, y2]: Segment): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy)
}

function canal(h: number, r: Rng): Plan {
  const m0 = h >= 12 ? 3 : 2
  const quay = h - m0 - 1
  // basin radius: on a coarse grid a basin is a single round pool
  const R = h >= 8 ? 2 : 0.5
  const yb = -Math.round(h * 0.45)
  const yc = Math.round(h * 0.15)
  const C = Math.max(2, Math.round(h * 0.6))
  const p = h >= 12 ? 4 : 3
  const seed = Math.floor(r() * 4294967296) | 0
  const woods = r() < 0.5
  // the goosefoot and the chain of basins need more rows than a coarse grid has
  const roomy = h >= 8 ? 1 : 0
  const layout = weighted<CanalLayout>(r, [['cross', 15], ['goosefoot', 17 * roomy], ['chain', 17 * roomy], ['fork', 17], ['terraces', 17], ['parallel', 17]])
  const square = r() < 0.4
  // the larger basins: a size up on the medium and fine grids only
  const big = h >= 8 ? R + 1 : 1
  const small = h >= 8 ? 1 : 0.5

  // The water of the layout: canals, basins, and rows of hedges for the
  // terraces.
  const segs: Segment[] = []
  const basins: Basin[] = []
  const hedges: number[] = []
  const basin = (x: number, y: number, rx: number, ry = rx) => basins.push({ x, y, rx, ry })
  let head = yb
  if (layout === 'cross') {
    segs.push([0, yb, 0, quay], [0, yc, C, yc])
    basin(0, yb, R)
    basin(C, yc, small)
  }
  else if (layout === 'goosefoot') {
    // three canals fan out from a harbour basin on the quay
    const k = Math.min(C, quay - yb - 1)
    segs.push([0, yb, 0, quay], [0, quay, k, quay - k])
    basin(0, quay, big)
    basin(0, yb, R)
    basin(k, quay - k, R >= 2 ? 1.5 : small)
  }
  else if (layout === 'chain') {
    // a long canal strung with basins, and ponds on either side
    const ym = Math.round((yb + quay) / 2)
    segs.push([0, yb, 0, quay])
    basin(0, yb, R)
    basin(0, ym, big, R)
    basin(C + 1, yb, small)
    basin(C + 1, ym, small)
  }
  else if (layout === 'fork') {
    // a canal from the sea that forks in two arms, each ending in a basin
    const k = Math.min(C, yc - yb)
    segs.push([0, yc, 0, quay], [0, yc, k, yc - k])
    basin(0, yc, small)
    basin(k, yc - k, R)
    head = yc - k
  }
  else if (layout === 'terraces') {
    // a cascade: square pools widening down the slope, between hedges
    segs.push([0, yb, 0, quay])
    const n = h >= 12 ? 3 : 2
    const step = Math.max(2, Math.floor((quay - 1 - yb) / n))
    for (let i = 0; i < n; i++) {
      const y = yb + i * step
      basins.push({ x: 0, y, rx: Math.min(C, 1 + i + (R > 1 ? 1 : 0)), ry: small })
      if (i > 0)
        hedges.push(y - Math.ceil(step / 2))
    }
  }
  else {
    // a canal along the shore, joined to the sea in the middle, and above
    // it a lawn with a pool and bosquets
    const yp = quay - Math.max(2, Math.round(h * 0.25))
    segs.push([0, yp, h + 12, yp], [0, yp, 0, quay])
    basin(0, Math.round((yb + yp) / 2), R + (h >= 8 ? 0.5 : 0))
    basin(C, yp, small + 0.5, small)
  }
  const box = layout === 'terraces' || square
  const water = (ax: number, y: number): boolean => {
    for (const s of segs) {
      if (segmentDistance(ax, y, s) <= 0.75)
        return true
    }
    for (const b of basins) {
      const u = (ax - b.x) / (b.rx + 0.25)
      const v = (y - b.y) / (b.ry + 0.25)
      if ((box ? squircle(Math.abs(u), Math.abs(v)) : Math.hypot(u, v)) <= 1)
        return true
    }
    return false
  }
  const wet = (x: number, y: number) => water(Math.abs(x), y)

  // Ornaments: fountains in the basins, statues beside them, and clipped
  // trees along the banks of the grand canal.
  const ornaments: Ornament[] = []
  for (const b of basins) {
    if (b.y === quay)
      continue
    reflect(ornaments, { kind: 'fountain', x: b.x, y: b.y, w: Math.min(b.rx, b.ry) + 0.5, h: Math.min(b.rx, b.ry) + 0.5 }, false)
    const sx = b.x + b.rx + 1.25
    if (sx < h - 0.5 && !near(wet, Math.round(sx), b.y, 0))
      reflect(ornaments, { kind: 'statue', x: sx, y: b.y, w: 0.45, h: 0.45 }, false)
  }
  for (let y = head + 1; y < quay; y++) {
    if (wet(0, y) && !wet(1, y) && !wet(2, y) && !wet(1, y - 1) && !wet(1, y + 1))
      reflect(ornaments, { kind: 'topiary', x: 1.1, y, w: 0.42, h: 0.42 }, false)
  }

  return {
    kind: 'Canal',
    variant: layout,
    sigma: 0.25,
    ornaments,
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
      if (water(ax, y)) {
        // deep water in the middle of the wide basins
        const open = h >= 8 && y < quay && [-1, 0, 1].every(dy => [-1, 0, 1].every(dx => wet(ax + dx, y + dy)))
        return open ? DEEP : SHALLOW
      }
      if (y === quay)
        return GRASS
      // woods behind the head of the garden, hedges across the terraces
      if (y < head - R - 1 && !near(wet, ax, y, 1))
        return woods || ax > R + 2 ? FOREST : GRASS
      if (hedges.includes(y) && ax >= 2 && !near(wet, ax, y, 1))
        return FOREST
      if (layout === 'terraces')
        return GRASS
      // bosquets, behind a lawn walk along every bank
      const bx = block(ax, 2, h - 1, p)
      const by = block(y, head - R + 1, quay - 2, p)
      if (bx < 0 || by < 0 || near(wet, ax, y, 2))
        return GRASS
      return phash(seed, bx, by) < 0.7 ? FOREST : GRASS
    },
    feature: (_x, y, t) => {
      if (isWater(t))
        return 1e-3
      if (!isRoad(t))
        return 1
      // the avenue across the head of the garden, and a few lanes
      return Math.abs(y - (head - R - 1.5)) < 1 ? 30 : y < head ? 1 : 0.3
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
