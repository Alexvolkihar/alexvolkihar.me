// Dielectric breakdown model on a square lattice.
//
// Niemeyer, Pietronero & Wiesmann, "Fractal Dimension of Dielectric
// Breakdown", Phys. Rev. Lett. 52, 1033 (1984): the discharge is held at
// potential 0, the far electrode at potential 1, and the electric potential
// in between solves Laplace's equation. A site next to the discharge breaks
// down with a probability proportional to the local potential to the power
// eta (the field at a neighbour of a zero-potential cell is its potential).
// eta = 1 gives DLA-like feathers, eta < 1 bushy growth, eta > 1 lone bolts.
//
// Laplace's equation is relaxed by red-black successive over-relaxation, a
// few sweeps after every batch of new sites, warm-started from the previous
// solution: the potential never fully converges, but it only has to be good
// near the tips, where the change happens.
//
// Two discharges may grow at once (a spark gap): side A sits at potential 0
// and grows with phi^eta, side B at potential 1 and grows with (1 - phi)^eta,
// and the run stops when they touch.

import type { Rng } from '../random'

export const FREE = 0
export const SIDE_A = 1
export const SIDE_B = 2
export const TARGET = 3
export const NEUMANN = 4
/** Fixed at potential 0 but never part of the discharge (outside a ring). */
export const GROUND = 5

export interface Lattice {
  gx: number
  gy: number
  /** FREE, SIDE_A, SIDE_B, TARGET (fixed at 1) or NEUMANN (insulating border). */
  owner: Uint8Array
}

export interface GrowthOptions {
  eta: number
  /** Stop when side A comes this close (in cells) to a TARGET cell. */
  stopDistance: number
  maxNodes: number
  /** Preferred growth axis (radians) and strength in [0, 1); 0 is isotropic. */
  grainAngle: number
  grain: number
}

export interface Discharge {
  count: number
  /** Lattice cell of each node, in creation order (parents first). */
  cell: Int32Array
  /** Parent node, -1 for the electrode cells. */
  parent: Int32Array
  side: Uint8Array
  /** Nodes of A and B that touched, or -1 when the run ended otherwise. */
  meetA: number
  meetB: number
}

export function createLattice(gx: number, gy: number): Lattice {
  return { gx, gy, owner: new Uint8Array(gx * gy) }
}

// 8-neighbourhood offsets, as (dx, dy).
const NX = [1, 1, 0, -1, -1, -1, 0, 1]
const NY = [0, 1, 1, 1, 0, -1, -1, -1]
/** Half-size and sweep count of the window relaxed around each new site. */
const LOCAL = 5
const LOCAL_SWEEPS = 3

/**
 * Approximate Euclidean distance (in cells) to the nearest cell whose owner is
 * in `from`, by a two-pass chamfer transform.
 */
function distanceTo(lat: Lattice, from: (o: number) => boolean): Float64Array {
  const { gx, gy, owner } = lat
  const d = new Float64Array(gx * gy).fill(1e9)
  for (let i = 0; i < d.length; i++) {
    if (from(owner[i]))
      d[i] = 0
  }
  const D = Math.SQRT2
  for (let y = 0; y < gy; y++) {
    for (let x = 0; x < gx; x++) {
      const i = y * gx + x
      let v = d[i]
      if (x > 0)
        v = Math.min(v, d[i - 1] + 1)
      if (y > 0) {
        v = Math.min(v, d[i - gx] + 1)
        if (x > 0)
          v = Math.min(v, d[i - gx - 1] + D)
        if (x < gx - 1)
          v = Math.min(v, d[i - gx + 1] + D)
      }
      d[i] = v
    }
  }
  for (let y = gy - 1; y >= 0; y--) {
    for (let x = gx - 1; x >= 0; x--) {
      const i = y * gx + x
      let v = d[i]
      if (x < gx - 1)
        v = Math.min(v, d[i + 1] + 1)
      if (y < gy - 1) {
        v = Math.min(v, d[i + gx] + 1)
        if (x < gx - 1)
          v = Math.min(v, d[i + gx + 1] + D)
        if (x > 0)
          v = Math.min(v, d[i + gx - 1] + D)
      }
      d[i] = v
    }
  }
  return d
}

export function grow(lat: Lattice, opt: GrowthOptions, r: Rng): Discharge {
  const { gx, gy, owner } = lat
  const N = gx * gy
  const phi = new Float64Array(N)
  const fixed = new Uint8Array(N)

  // Insulating border cells copy their inner neighbour after every sweep.
  const neuCell: number[] = []
  const neuSrc: number[] = []
  for (let y = 0; y < gy; y++) {
    for (let x = 0; x < gx; x++) {
      const i = y * gx + x
      const o = owner[i]
      if (o !== FREE)
        fixed[i] = 1
      if (o === NEUMANN) {
        const sx = Math.min(gx - 2, Math.max(1, x))
        const sy = Math.min(gy - 2, Math.max(1, y))
        neuCell.push(i)
        neuSrc.push(sy * gx + sx)
      }
    }
  }

  // Warm start: a log-harmonic blend of the distances to both electrodes.
  const dSrc = distanceTo(lat, o => o === SIDE_A)
  const dDst = distanceTo(lat, o => o === TARGET || o === SIDE_B)
  for (let i = 0; i < N; i++) {
    const o = owner[i]
    if (o === SIDE_A || o === GROUND) {
      phi[i] = 0
    }
    else if (o === SIDE_B || o === TARGET) {
      phi[i] = 1
    }
    else {
      const a = Math.log1p(dSrc[i])
      const b = Math.log1p(dDst[i])
      phi[i] = a / (a + b || 1)
    }
  }
  for (let k = 0; k < neuCell.length; k++)
    phi[neuCell[k]] = phi[neuSrc[k]]

  const OMEGA = 1.86
  function sweep(y0: number, y1: number, x0: number, x1: number, borders = true) {
    for (let c = 0; c < 2; c++) {
      for (let y = y0; y <= y1; y++) {
        const row = y * gx
        for (let x = x0 + ((x0 + y + c) & 1); x <= x1; x += 2) {
          const i = row + x
          if (fixed[i])
            continue
          const v = phi[i]
          phi[i] = v + OMEGA * ((phi[i - 1] + phi[i + 1] + phi[i - gx] + phi[i + gx]) * 0.25 - v)
        }
      }
    }
    if (!borders)
      return
    for (let k = 0; k < neuCell.length; k++)
      phi[neuCell[k]] = phi[neuSrc[k]]
  }
  for (let s = 0; s < 36; s++)
    sweep(1, gy - 2, 1, gx - 2)

  // --- nodes -------------------------------------------------------------------
  // a cell is taken at most once, so N bounds the node count
  const cell = new Int32Array(N)
  const parent = new Int32Array(cell.length)
  const side = new Uint8Array(cell.length)
  const nodeOf = new Int32Array(N).fill(-1)
  let count = 0

  // candidates: flag bit 1 = next to A, bit 2 = next to B
  const candFlag = new Uint8Array(N)
  const candParA = new Int32Array(N).fill(-1)
  const candParB = new Int32Array(N).fill(-1)
  // anisotropy weight of the step from the parent, cached per candidate
  const candDirA = new Float64Array(N)
  const candDirB = new Float64Array(N)
  const cand: number[] = []

  // growth anisotropy per direction: 1 - s + 2 s cos^2(direction - grain)
  // Diagonal steps are damped: they reach further than axial ones and would
  // otherwise comb high-eta discharges into 45-degree rakes.
  const diagonal = opt.eta < 1 ? 0.5 : 0.7 ** opt.eta
  const dirW = NX.map((dx, k) => {
    const a = Math.atan2(NY[k], dx) - opt.grainAngle
    return (1 - opt.grain + 2 * opt.grain * Math.cos(a) ** 2) * (dx !== 0 && NY[k] !== 0 ? diagonal : 1)
  })

  // bounding box of the discharge, for local relaxation
  let bx0 = gx
  let by0 = gy
  let bx1 = 0
  let by1 = 0

  function addNode(i: number, s: number, p: number): number {
    const id = count++
    cell[id] = i
    parent[id] = p
    side[id] = s
    nodeOf[i] = id
    owner[i] = s
    fixed[i] = 1
    phi[i] = s === SIDE_A ? 0 : 1
    const x = i % gx
    const y = (i - x) / gx
    bx0 = Math.min(bx0, x)
    bx1 = Math.max(bx1, x)
    by0 = Math.min(by0, y)
    by1 = Math.max(by1, y)
    const bit = s === SIDE_A ? 1 : 2
    for (let k = 0; k < 8; k++) {
      const xx = x + NX[k]
      const yy = y + NY[k]
      if (xx < 1 || yy < 1 || xx > gx - 2 || yy > gy - 2)
        continue
      const j = yy * gx + xx
      if (owner[j] !== FREE)
        continue
      if (candFlag[j] === 0)
        cand.push(j)
      if (!(candFlag[j] & bit)) {
        candFlag[j] |= bit
        if (bit === 1) {
          candParA[j] = id
          candDirA[j] = dirW[k]
        }
        else {
          candParB[j] = id
          candDirB[j] = dirW[k]
        }
      }
    }
    return id
  }

  // electrode cells, in scan order
  for (let i = 0; i < N; i++) {
    if (owner[i] === SIDE_A || owner[i] === SIDE_B) {
      const s = owner[i]
      owner[i] = FREE
      addNode(i, s, -1)
    }
  }

  let meetA = -1
  let meetB = -1
  let grown = 0
  let wA = new Float64Array(1024)
  let cum = new Float64Array(1024)
  const eta = opt.eta
  let done = false
  let batches = 0

  while (!done && grown < opt.maxNodes) {
    // drop the candidates taken by the last batch
    let n = 0
    for (let k = 0; k < cand.length; k++) {
      const j = cand[k]
      if (owner[j] === FREE)
        cand[n++] = j
    }
    cand.length = n
    if (n === 0)
      break
    if (wA.length < n) {
      wA = new Float64Array(n * 2)
      cum = new Float64Array(n * 2)
    }
    let total = 0
    for (let k = 0; k < n; k++) {
      const j = cand[k]
      const f = candFlag[j]
      const v = Math.min(1, Math.max(0, phi[j]))
      let a = 0
      let b = 0
      if (f & 1)
        a = v ** eta * candDirA[j]
      if (f & 2)
        b = (1 - v) ** eta * candDirB[j]
      wA[k] = a
      total += a + b
      cum[k] = total
    }
    if (!(total > 0))
      break

    // a batch of breakdowns per relaxation, growing with the front
    const batch = Math.min(128, 1 + Math.floor(n / 40))
    const fresh0 = count
    for (let b = 0; b < batch && grown < opt.maxNodes; b++) {
      const x = r() * total
      let lo = 0
      let hi = n - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (cum[mid] > x)
          hi = mid
        else
          lo = mid + 1
      }
      const j = cand[lo]
      if (owner[j] !== FREE)
        continue
      const u = x - (lo > 0 ? cum[lo - 1] : 0)
      const s = u < wA[lo] ? SIDE_A : SIDE_B
      const id = addNode(j, s, s === SIDE_A ? candParA[j] : candParB[j])
      grown++
      if (s === SIDE_A && dDst[j] <= opt.stopDistance)
        done = true
      // touching the other side closes the gap
      const other = s === SIDE_A ? SIDE_B : SIDE_A
      const xj = j % gx
      const yj = (j - xj) / gx
      for (let k = 0; k < 8; k++) {
        const q = (yj + NY[k]) * gx + xj + NX[k]
        if (owner[q] === other && nodeOf[q] >= 0) {
          meetA = s === SIDE_A ? id : nodeOf[q]
          meetB = s === SIDE_A ? nodeOf[q] : id
          done = true
          break
        }
      }
      if (done)
        break
    }

    // relax near the discharge every time, the whole lattice now and then
    // Relax around every new site first (screening is mostly local), then
    // let the change spread through the whole discharge's neighbourhood.
    for (let k = fresh0; k < count; k++) {
      const c = cell[k]
      const x = c % gx
      const y = (c - x) / gx
      for (let s = 0; s < LOCAL_SWEEPS; s++)
        sweep(Math.max(1, y - LOCAL), Math.min(gy - 2, y + LOCAL), Math.max(1, x - LOCAL), Math.min(gx - 2, x + LOCAL), false)
    }
    const m = 14
    batches++
    if ((batches & 3) === 0)
      sweep(1, gy - 2, 1, gx - 2)
    else
      sweep(Math.max(1, by0 - m), Math.min(gy - 2, by1 + m), Math.max(1, bx0 - m), Math.min(gx - 2, bx1 + m))
  }
  return { count, cell, parent, side, meetA, meetB }
}
