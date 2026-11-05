// Differential growth of closed curves.
//
// Every curve is a ring of nodes. At each step a node is pushed away from
// every other node closer than one repulsion radius (found through a uniform
// grid rebuilt by counting sort), pulled towards the midpoint of its two
// neighbours (which keeps the line smooth), and moves by at most a fixed
// fraction of the radius. Edges that grow too long are split, and a few
// random edges are split every step on top of that, more often where the
// node's "vigour" is high: the line gets longer than the room it has, so it
// buckles into folds that never cross, because the line repels itself.
//
// The model follows the differential line / differential growth writings of
// Anders Hoff (2014) and Jason Webb (2020); the biology behind it is the
// buckling of tissues that grow faster at their edge than inside.
//
// All lengths are in repulsion radii (R = 1), the step count is fixed and
// the loop only uses + - * / and Math.sqrt (correctly rounded by IEEE-754),
// so a seed grows into the same bits in every engine and at every size.

import type { Rng } from '../random'

export interface SeedLoop {
  /** Node coordinates, in order around the loop, in repulsion radii. */
  xs: number[]
  ys: number[]
  /** Growth vigour of each node, in [0, 1]. */
  vigour: number[]
}

export interface GrowthParams {
  /** Hard cap on the number of nodes (bounds the cost). */
  cap: number
  /** Fixed number of steps. */
  steps: number
  /** Random splits attempted per step, as a fraction of the node count. */
  rate: number
  /** Container: a disc or a square of half-size `extent` around the origin, or nothing. */
  bounds: 'disc' | 'square' | 'free'
  extent: number
  /** Steps after which the curves are recorded (the last step is always recorded). */
  record: readonly number[]
}

/** One recorded state: each loop as ordered coordinates plus a cyclic tag in [0, 1). */
export interface Frame {
  loops: { xs: Float64Array, ys: Float64Array, tags: Float64Array }[]
}

const MAX_EDGE = 0.5
const MIN_SPLIT = 0.24
const MAX_STEP = 0.16
const K_REP = 0.3
const K_ALIGN = 0.45

/** Bounds as a number, so the hot loop compares integers. */
const BOUNDS = { disc: 0, square: 1, free: 2 } as const

interface State {
  n: number
  x: Float64Array
  y: Float64Array
  next: Int32Array
  prev: Int32Array
  tag: Float64Array
  vig: Float64Array
}

/** Insert a node in the middle of edge a -> next[a]. */
function split(s: State, a: number): void {
  const { x, y, next, prev, tag, vig } = s
  const b = next[a]
  const id = s.n++
  x[id] = (x[a] + x[b]) * 0.5
  y[id] = (y[a] + y[b]) * 0.5
  // cyclic midpoint of the tags (the last edge wraps from ~1 back to 0)
  let dt = tag[b] - tag[a]
  if (dt < -0.5)
    dt += 1
  let t = tag[a] + dt * 0.5
  if (t >= 1)
    t -= 1
  tag[id] = t
  vig[id] = (vig[a] + vig[b]) * 0.5
  next[a] = id
  prev[id] = a
  next[id] = b
  prev[b] = id
}

/** Reusable buffers of the neighbour grid. */
interface Grid {
  start: Int32Array
  cell: Int32Array
  /** Node ids and their coordinates, sorted by cell (contiguous reads in the hot loop). */
  id: Int32Array
  gx: Float64Array
  gy: Float64Array
  /** Summed repulsion per node. */
  fx: Float64Array
  fy: Float64Array
}

/**
 * One relaxation step. Every node reads the previous positions (Jacobi) and
 * writes its new one into nx / ny.
 */
function relax(s: State, G: Grid, nx: Float64Array, ny: Float64Array, bounds: number, ext: number): void {
  const { n, x, y, next, prev } = s
  // --- uniform grid of cell size R, by counting sort -----------------------
  let minX = x[0]
  let maxX = x[0]
  let minY = y[0]
  let maxY = y[0]
  for (let i = 1; i < n; i++) {
    const xi = x[i]
    const yi = y[i]
    if (xi < minX)
      minX = xi
    else if (xi > maxX)
      maxX = xi
    if (yi < minY)
      minY = yi
    else if (yi > maxY)
      maxY = yi
  }
  const w = Math.floor(maxX - minX) + 1
  const h = Math.floor(maxY - minY) + 1
  const cells = w * h
  if (G.start.length < cells + 1)
    G.start = new Int32Array((cells + 1) * 2)
  const { start, cell, id, gx, gy } = G
  start.fill(0, 0, cells + 1)
  for (let i = 0; i < n; i++) {
    const c = Math.floor(y[i] - minY) * w + Math.floor(x[i] - minX)
    cell[i] = c
    start[c]++
  }
  // running sums give the end of each cell; filling backwards moves each
  // entry back to the start of its cell
  for (let c = 1; c < cells; c++)
    start[c] += start[c - 1]
  start[cells] = n
  for (let i = n - 1; i >= 0; i--) {
    const k = --start[cell[i]]
    id[k] = i
    gx[k] = x[i]
    gy[k] = y[i]
  }

  // --- repulsion, one pair at a time ---------------------------------------
  // Each cell meets itself and the four cells after it (right, and the three
  // below), so every pair within one radius is seen exactly once and pushes
  // both of its nodes.
  const { fx, fy } = G
  fx.fill(0, 0, n)
  fy.fill(0, 0, n)
  for (let cj = 0; cj < h; cj++) {
    for (let ci = 0; ci < w; ci++) {
      const c = cj * w + ci
      const a0 = start[c]
      const a1 = start[c + 1]
      if (a0 === a1)
        continue
      // the cell itself plus the one on its right: a contiguous range
      const b1 = ci < w - 1 ? start[c + 2] : a1
      // the row below, from ci - 1 to ci + 1: contiguous too
      let d0 = 0
      let d1 = 0
      if (cj < h - 1) {
        const row = c + w
        d0 = start[ci > 0 ? row - 1 : row]
        d1 = start[ci < w - 1 ? row + 2 : row + 1]
      }
      for (let ka = a0; ka < a1; ka++) {
        const xa = gx[ka]
        const ya = gy[ka]
        const ia = id[ka]
        const pv = prev[ia]
        const nt = next[ia]
        let ax = 0
        let ay = 0
        for (let pass = 0; pass < 2; pass++) {
          let kb = pass === 0 ? ka + 1 : d0
          const kEnd = pass === 0 ? b1 : d1
          for (; kb < kEnd; kb++) {
            const dx = xa - gx[kb]
            const dy = ya - gy[kb]
            const d2 = dx * dx + dy * dy
            if (d2 >= 1 || d2 === 0)
              continue
            const ib = id[kb]
            if (ib === pv || ib === nt)
              continue
            const d = Math.sqrt(d2)
            const f = (1 - d) / d
            const px = dx * f
            const py = dy * f
            ax += px
            ay += py
            fx[ib] -= px
            fy[ib] -= py
          }
        }
        fx[ia] += ax
        fy[ia] += ay
      }
    }
  }

  // --- moves (Jacobi: every node reads the previous positions) -------------
  const ext2 = ext * ext
  const step2 = MAX_STEP * MAX_STEP
  for (let i = 0; i < n; i++) {
    const xi = x[i]
    const yi = y[i]
    const pv = prev[i]
    const nt = next[i]
    let sx = K_REP * fx[i] + K_ALIGN * ((x[pv] + x[nt]) * 0.5 - xi)
    let sy = K_REP * fy[i] + K_ALIGN * ((y[pv] + y[nt]) * 0.5 - yi)
    const s2 = sx * sx + sy * sy
    if (s2 > step2) {
      const f = MAX_STEP / Math.sqrt(s2)
      sx *= f
      sy *= f
    }
    let px = xi + sx
    let py = yi + sy
    if (bounds === 0) {
      const d2 = px * px + py * py
      if (d2 > ext2) {
        const f = ext / Math.sqrt(d2)
        px *= f
        py *= f
      }
    }
    else if (bounds === 1) {
      if (px > ext)
        px = ext
      else if (px < -ext)
        px = -ext
      if (py > ext)
        py = ext
      else if (py < -ext)
        py = -ext
    }
    nx[i] = px
    ny[i] = py
  }
}

function snapshot(s: State, heads: readonly number[]): Frame {
  const { x, y, next, tag } = s
  const loops: Frame['loops'] = []
  for (const head of heads) {
    let m = 1
    for (let i = next[head]; i !== head; i = next[i])
      m++
    const xs = new Float64Array(m)
    const ys = new Float64Array(m)
    const tags = new Float64Array(m)
    let i = head
    for (let k = 0; k < m; k++) {
      xs[k] = x[i]
      ys[k] = y[i]
      tags[k] = tag[i]
      i = next[i]
    }
    loops.push({ xs, ys, tags })
  }
  return { loops }
}

export function grow(seeds: readonly SeedLoop[], p: GrowthParams, r: Rng): Frame[] {
  const cap = p.cap
  const s: State = {
    n: 0,
    x: new Float64Array(cap),
    y: new Float64Array(cap),
    next: new Int32Array(cap),
    prev: new Int32Array(cap),
    tag: new Float64Array(cap),
    vig: new Float64Array(cap),
  }
  const heads: number[] = []
  for (const seed of seeds) {
    const m = seed.xs.length
    const first = s.n
    heads.push(first)
    for (let k = 0; k < m && s.n < cap; k++) {
      const i = s.n++
      s.x[i] = seed.xs[k]
      s.y[i] = seed.ys[k]
      s.tag[i] = k / m
      s.vig[i] = seed.vigour[k]
      s.next[i] = k === m - 1 ? first : i + 1
      s.prev[i] = k === 0 ? first + m - 1 : i - 1
    }
  }

  const G: Grid = {
    start: new Int32Array(1024),
    cell: new Int32Array(cap),
    id: new Int32Array(cap),
    gx: new Float64Array(cap),
    gy: new Float64Array(cap),
    fx: new Float64Array(cap),
    fy: new Float64Array(cap),
  }
  const nx = new Float64Array(cap)
  const ny = new Float64Array(cap)
  const frames: Frame[] = []
  const record = new Set(p.record)
  const bounds = BOUNDS[p.bounds]

  for (let step = 0; step < p.steps; step++) {
    relax(s, G, nx, ny, bounds, p.extent)
    s.x.set(nx.subarray(0, s.n))
    s.y.set(ny.subarray(0, s.n))

    // --- growth: split long edges, then a few random ones --------------------
    const { x, y, next, vig } = s
    const n0 = s.n
    for (let i = 0; i < n0 && s.n < cap; i++) {
      const j = next[i]
      const dx = x[j] - x[i]
      const dy = y[j] - y[i]
      if (dx * dx + dy * dy > MAX_EDGE * MAX_EDGE)
        split(s, i)
    }
    const tries = Math.floor(s.n * p.rate) + 1
    for (let k = 0; k < tries && s.n < cap; k++) {
      const i = Math.floor(r() * s.n)
      if (r() >= vig[i])
        continue
      const j = next[i]
      const dx = x[j] - x[i]
      const dy = y[j] - y[i]
      if (dx * dx + dy * dy > MIN_SPLIT * MIN_SPLIT)
        split(s, i)
    }

    if (record.has(step) || step === p.steps - 1)
      frames.push(snapshot(s, heads))
  }
  return frames
}
