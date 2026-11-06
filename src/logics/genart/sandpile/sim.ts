// Abelian sandpile on a bounded domain, toppled with symmetry folding.
//
// A site holding at least T grains (T = number of neighbours) topples: it
// sends one grain to each neighbour, and grains sent outside the domain fall
// into the sink and are lost (Bak, Tang & Wiesenfeld 1987; Dhar 1990 for the
// abelian property). The final stable configuration does not depend on the
// order of the topplings, which allows two shortcuts:
//
// - a site holding h grains fires floor(h / T) times at once;
// - when the domain and the initial configuration share a symmetry of the
//   lattice, so does every legal toppling sequence that fires whole orbits at
//   once. The pile is then toppled on one representative per orbit (an
//   eighth of the square, a twelfth of the hexagon), each edge carrying the
//   number of grains the whole orbit sends to one member of the target orbit.
//
// The total number of topplings is fixed by the configuration (it is the
// odometer), so the cost is set by the grid size and the grain count, never
// by the output resolution.

export type Lattice = 'square' | 'moore' | 'hex'

/** Neighbour offsets in array coordinates (axial coordinates for hex). */
const NEIGHBOURS: Record<Lattice, ReadonlyArray<readonly [number, number]>> = {
  square: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  moore: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]],
  hex: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]],
}

export const THRESHOLD: Record<Lattice, number> = { square: 4, moore: 8, hex: 6 }

/** 2x2 integer matrix [a, b, c, d]: (x, y) -> (a x + b y, c x + d y). */
type Mat = readonly [number, number, number, number]

function mul2(p: Mat, q: Mat): Mat {
  return [
    p[0] * q[0] + p[1] * q[2],
    p[0] * q[1] + p[1] * q[3],
    p[2] * q[0] + p[3] * q[2],
    p[2] * q[1] + p[3] * q[3],
  ]
}

/** The point group of the lattice around the centre site. */
function pointGroup(lattice: Lattice): Mat[] {
  // Square lattices: D4. Axial hex: a 60 degree turn is (q, r) -> (-r, q + r)
  // and (q, r) -> (r, q) is a mirror, which generate D6.
  const rot: Mat = lattice === 'hex' ? [0, -1, 1, 1] : [0, -1, 1, 0]
  const mirror: Mat = [0, 1, 1, 0]
  const turns = lattice === 'hex' ? 6 : 4
  const out: Mat[] = []
  let r: Mat = [1, 0, 0, 1]
  for (let k = 0; k < turns; k++) {
    out.push(r, mul2(r, mirror))
    r = mul2(rot, r)
  }
  return out
}

export interface Pile {
  lattice: Lattice
  /** Side of the square array; the centre site sits at (c, c). */
  size: number
  c: number
  /** 1 inside the domain, 0 in the sink. */
  mask: Uint8Array
  /** Stable heights, 0 .. T - 1 inside the domain. */
  height: Uint8Array
  T: number
  /** Order of the symmetry group used to fold the grid. */
  symmetry: number
  /** Orbit firings (one firing moves floor(h / T) grains per neighbour). */
  firings: number
}

/**
 * Stabilize `init` (heights on the size x size array) inside `mask`.
 * With `second >= 0`, a second pass h -> stab(second - h) follows, which
 * gives the identity element e = stab(2 c_max - stab(2 c_max)) of the
 * sandpile group when init = second = 2 c_max (Creutz 1991).
 */
export function stabilize(lattice: Lattice, size: number, mask: Uint8Array, init: Int32Array, second = -1): Pile {
  const c = size >> 1
  const nb = NEIGHBOURS[lattice]
  const T = nb.length
  const N = size * size

  // --- symmetry group shared by the domain and the initial configuration ----
  const group: Mat[] = []
  for (const g of pointGroup(lattice)) {
    let ok = true
    for (let i = 0; i < N && ok; i++) {
      const x = (i % size) - c
      const y = ((i / size) | 0) - c
      const gx = g[0] * x + g[1] * y + c
      const gy = g[2] * x + g[3] * y + c
      const inside = gx >= 0 && gy >= 0 && gx < size && gy < size
      const j = gy * size + gx
      const m = inside ? mask[j] : 0
      if (m !== mask[i] || (m && init[i] !== init[j]))
        ok = false
    }
    if (ok)
      group.push(g)
  }

  // --- orbits: the first site met in each orbit represents it ----------------
  const slot = new Int32Array(N).fill(-1)
  const orbitSize: number[] = []
  const repCell: number[] = []
  const members = new Int32Array(group.length)
  for (let i = 0; i < N; i++) {
    if (!mask[i] || slot[i] >= 0)
      continue
    const x = (i % size) - c
    const y = ((i / size) | 0) - c
    let n = 0
    for (const g of group) {
      const j = (g[2] * x + g[3] * y + c) * size + g[0] * x + g[1] * y + c
      let seen = false
      for (let k = 0; k < n; k++) {
        if (members[k] === j)
          seen = true
      }
      if (!seen)
        members[n++] = j
    }
    for (let k = 0; k < n; k++)
      slot[members[k]] = repCell.length
    orbitSize.push(n)
    repCell.push(i)
  }
  const M = repCell.length

  // --- folded adjacency (CSR) -----------------------------------------------
  const start = new Int32Array(M + 1)
  const tgt: number[] = []
  const mul: number[] = []
  const tk: number[] = []
  const tc: number[] = []
  for (let s = 0; s < M; s++) {
    const i = repCell[s]
    const x = i % size
    const y = (i / size) | 0
    tk.length = 0
    tc.length = 0
    for (const [dx, dy] of nb) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || !mask[ny * size + nx])
        continue
      const t = slot[ny * size + nx]
      const k = tk.indexOf(t)
      if (k < 0) {
        tk.push(t)
        tc.push(1)
      }
      else {
        tc[k]++
      }
    }
    for (let k = 0; k < tk.length; k++) {
      tgt.push(tk[k])
      // grains the whole orbit of s sends to one member of the orbit of t
      mul.push(Math.round(tc[k] * orbitSize[s] / orbitSize[tk[k]]))
    }
    start[s + 1] = tgt.length
  }
  const tg = Int32Array.from(tgt)
  const ml = Int32Array.from(mul)

  const h = new Int32Array(M)
  for (let s = 0; s < M; s++)
    h[s] = init[repCell[s]]
  let firings = relax(h, start, tg, ml, T)
  if (second >= 0) {
    for (let s = 0; s < M; s++)
      h[s] = second - h[s]
    firings += relax(h, start, tg, ml, T)
  }

  const height = new Uint8Array(N)
  for (let i = 0; i < N; i++) {
    if (mask[i])
      height[i] = h[slot[i]]
  }
  return { lattice, size, c, mask, height, T, symmetry: group.length, firings }
}

/** Fire every unstable site (FIFO ring) until all heights are below T. */
function relax(h: Int32Array, start: Int32Array, tg: Int32Array, ml: Int32Array, T: number): number {
  const M = h.length
  let cap = 1
  while (cap < M + 1)
    cap <<= 1
  const wrap = cap - 1
  const ring = new Int32Array(cap)
  let head = 0
  let tail = 0
  for (let s = 0; s < M; s++) {
    if (h[s] >= T)
      ring[tail++] = s
  }
  const T1 = T - 1
  let ops = 0
  while (head !== tail) {
    const s = ring[head]
    head = (head + 1) & wrap
    const hs = h[s]
    // almost every firing moves a single grain per edge: skip the division
    const k = hs < 2 * T ? 1 : (hs / T) | 0
    h[s] = hs - k * T
    ops++
    const e = start[s + 1]
    for (let a = start[s]; a < e; a++) {
      const t = tg[a]
      const add = k * ml[a]
      const was = h[t]
      const v = was + add
      h[t] = v
      // branchless push when the target crosses the threshold
      ring[tail] = t
      tail = (tail + (((T1 - v) & ~(T1 - was)) >>> 31)) & wrap
    }
  }
  return ops
}
