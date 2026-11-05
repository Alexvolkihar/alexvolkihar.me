// Weighted Voronoi stippling (Adrian Secord, "Weighted Voronoi Stippling",
// NPAR 2002): points start distributed like the density, then each Lloyd
// round moves every point to the density-weighted centroid of its Voronoi
// region. The regions are never built as polygons: the density lives on a
// fixed grid of cells, and each cell is credited to its nearest point, found
// through a uniform bucket grid seeded with the previous round's answer.
//
// The density grid is defined in normalised units (canvas short side = 1),
// so the result does not depend on the pixel size of the canvas.

import type { Rng } from '../random'

export interface DensityGrid {
  /** Columns and rows of cells. */
  gw: number
  gh: number
  /** Cell side, in normalised units. */
  cell: number
  /** Weight of each cell, row-major, in [0, 1]. */
  w: Float32Array
}

export interface Stipples {
  n: number
  x: Float64Array
  y: Float64Array
  /** Density under each point, in [0, 1]. */
  tone: Float32Array
}

/** Uniform bucket grid over a set of points (counting sort). */
export class Buckets {
  readonly gx: number
  readonly gy: number
  readonly h: number
  readonly start: Int32Array
  readonly items: Int32Array

  constructor(x: ArrayLike<number>, y: ArrayLike<number>, n: number, width: number, height: number, h: number) {
    this.h = h
    this.gx = Math.max(1, Math.ceil(width / h))
    this.gy = Math.max(1, Math.ceil(height / h))
    const cells = this.gx * this.gy
    const count = new Int32Array(cells + 1)
    const cellOf = new Int32Array(n)
    for (let i = 0; i < n; i++) {
      const c = this.cellAt(x[i], y[i])
      cellOf[i] = c
      count[c + 1]++
    }
    for (let c = 0; c < cells; c++)
      count[c + 1] += count[c]
    this.start = count
    this.items = new Int32Array(n)
    const fill = count.slice(0, cells)
    for (let i = 0; i < n; i++)
      this.items[fill[cellOf[i]]++] = i
  }

  cellAt(x: number, y: number): number {
    let ix = Math.floor(x / this.h)
    let iy = Math.floor(y / this.h)
    if (ix < 0)
      ix = 0
    else if (ix >= this.gx)
      ix = this.gx - 1
    if (iy < 0)
      iy = 0
    else if (iy >= this.gy)
      iy = this.gy - 1
    return iy * this.gx + ix
  }
}

/**
 * The `k` nearest neighbours of every point, closest first (-1 when there
 * are fewer than k other points).
 */
export function knn(b: Buckets, x: Float64Array, y: Float64Array, n: number, k: number): Int32Array {
  const out = new Int32Array(n * k).fill(-1)
  const bd = new Float64Array(k)
  const bi = new Int32Array(k)
  const maxR = Math.max(b.gx, b.gy)
  for (let p = 0; p < n; p++) {
    const qx = x[p]
    const qy = y[p]
    let found = 0
    const ix = Math.min(b.gx - 1, Math.max(0, Math.floor(qx / b.h)))
    const iy = Math.min(b.gy - 1, Math.max(0, Math.floor(qy / b.h)))
    const fx = qx - ix * b.h
    const fy = qy - iy * b.h
    const edge = Math.max(0, Math.min(fx, b.h - fx, fy, b.h - fy))
    for (let r = 0; r <= maxR; r++) {
      if (r > 0 && found === k) {
        const lb = edge + (r - 1) * b.h
        if (lb * lb >= bd[k - 1])
          break
      }
      for (let cy = Math.max(0, iy - r); cy <= Math.min(b.gy - 1, iy + r); cy++) {
        const full = cy === iy - r || cy === iy + r
        const step = full ? 1 : 2 * r
        for (let cx = ix - r; cx <= ix + r; cx += step || 1) {
          if (cx < 0 || cx >= b.gx)
            continue
          const c = cy * b.gx + cx
          for (let m = b.start[c]; m < b.start[c + 1]; m++) {
            const i = b.items[m]
            if (i === p)
              continue
            const dx = x[i] - qx
            const dy = y[i] - qy
            const d = dx * dx + dy * dy
            if (found < k || d < bd[found - 1]) {
              // insertion into the sorted list of the best k
              let j = found < k ? found++ : k - 1
              while (j > 0 && bd[j - 1] > d) {
                bd[j] = bd[j - 1]
                bi[j] = bi[j - 1]
                j--
              }
              bd[j] = d
              bi[j] = i
            }
          }
        }
      }
    }
    for (let m = 0; m < found; m++)
      out[p * k + m] = bi[m]
  }
  return out
}

/**
 * Nearest point to (qx, qy), starting from a known candidate `hint` (or -1).
 * Rings of buckets are visited outwards until no closer point can exist.
 */
function nearest(b: Buckets, px: Float64Array, py: Float64Array, qx: number, qy: number, hint: number): number {
  let best = hint
  let bd = Infinity
  if (hint >= 0) {
    const dx = px[hint] - qx
    const dy = py[hint] - qy
    bd = dx * dx + dy * dy
  }
  const h = b.h
  const ix = Math.min(b.gx - 1, Math.max(0, Math.floor(qx / h)))
  const iy = Math.min(b.gy - 1, Math.max(0, Math.floor(qy / h)))
  const fx = qx - ix * h
  const fy = qy - iy * h
  const edge = Math.max(0, Math.min(fx, h - fx, fy, h - fy))
  const maxR = Math.max(b.gx, b.gy)
  for (let r = 0; r <= maxR; r++) {
    if (r > 0) {
      const lb = edge + (r - 1) * h
      if (lb * lb >= bd)
        break
    }
    const y0 = iy - r
    const y1 = iy + r
    for (let cy = Math.max(0, y0); cy <= Math.min(b.gy - 1, y1); cy++) {
      const full = cy === y0 || cy === y1
      const step = full ? 1 : 2 * r
      for (let cx = ix - r; cx <= ix + r; cx += step || 1) {
        if (cx < 0 || cx >= b.gx)
          continue
        const c = cy * b.gx + cx
        for (let k = b.start[c]; k < b.start[c + 1]; k++) {
          const i = b.items[k]
          const dx = px[i] - qx
          const dy = py[i] - qy
          const d = dx * dx + dy * dy
          if (d < bd) {
            bd = d
            best = i
          }
        }
      }
    }
  }
  return best
}

/**
 * Places `n` stipples over the density grid with `iterations` Lloyd rounds.
 * Consumes two draws of `r` per inked cell, then two per point.
 */
export function stipple(grid: DensityGrid, n: number, iterations: number, r: Rng): Stipples {
  const { gw, gh, cell, w } = grid
  if (n === 0)
    return { n: 0, x: new Float64Array(0), y: new Float64Array(0), tone: new Float32Array(0) }
  // Active cells only: paper that receives no ink costs nothing.
  let na = 0
  for (let i = 0; i < w.length; i++) {
    if (w[i] > 0)
      na++
  }
  const ax = new Float64Array(na)
  const ay = new Float64Array(na)
  const aw = new Float64Array(na)
  const cum = new Float64Array(na)
  let total = 0
  for (let j = 0, k = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const v = w[j * gw + i]
      if (v > 0) {
        // jittered inside the cell: a lattice of samples would print as rows
        ax[k] = (i + r()) * cell
        ay[k] = (j + r()) * cell
        aw[k] = v
        total += v
        cum[k] = total
        k++
      }
    }
  }

  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const tone = new Float32Array(n)
  if (na === 0 || n === 0)
    return { n: 0, x, y, tone }

  // Stratified sampling of the cumulative density, in raster order: a much
  // better start than plain random sampling, so few rounds are needed.
  let lo = 0
  for (let k = 0; k < n; k++) {
    const target = ((k + r()) / n) * total
    while (lo < na - 1 && cum[lo] < target)
      lo++
    x[k] = ax[lo] + (r() - 0.5) * cell
    y[k] = ay[lo] + (r() - 0.5) * cell
  }

  const width = gw * cell
  const height = gh * cell
  // About two points per bucket where the density peaks.
  let wmax = 0
  for (let a = 0; a < na; a++) {
    if (aw[a] > wmax)
      wmax = aw[a]
  }
  const h = Math.sqrt((2 * total * cell * cell) / (n * wmax))
  const hint = new Int32Array(na).fill(-1)
  const sx = new Float64Array(n)
  const sy = new Float64Array(n)
  const sw = new Float64Array(n)

  const K = 8
  let nb: Int32Array | null = null
  for (let it = 0; it < iterations; it++) {
    const b = new Buckets(x, y, n, width, height, h)
    sx.fill(0)
    sy.fill(0)
    sw.fill(0)
    // The first round searches the buckets; later rounds walk from last
    // round's owner along the k-nearest-neighbour graph, which is far
    // cheaper and lands on the same point in all but rare cases.
    // The graph is refreshed while the points still travel, then only
    // every third round.
    if (it > 0 && (it < 3 || it % 3 === 0))
      nb = knn(b, x, y, n, K)
    for (let a = 0; a < na; a++) {
      const qx = ax[a]
      const qy = ay[a]
      let p: number
      if (nb) {
        p = hint[a]
        let dx = x[p] - qx
        let dy = y[p] - qy
        let bd = dx * dx + dy * dy
        for (let guard = 0; guard < 64; guard++) {
          let best = p
          for (let m = p * K, end = p * K + K; m < end; m++) {
            const q = nb[m]
            if (q < 0)
              break
            dx = x[q] - qx
            dy = y[q] - qy
            const d = dx * dx + dy * dy
            if (d < bd) {
              bd = d
              best = q
            }
          }
          if (best === p)
            break
          p = best
        }
      }
      else {
        p = nearest(b, x, y, qx, qy, -1)
      }
      hint[a] = p
      const v = aw[a]
      sx[p] += v * qx
      sy[p] += v * qy
      sw[p] += v
    }
    for (let i = 0; i < n; i++) {
      if (sw[i] > 0) {
        x[i] = sx[i] / sw[i]
        y[i] = sy[i] / sw[i]
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const ci = Math.min(gw - 1, Math.max(0, Math.floor(x[i] / cell)))
    const cj = Math.min(gh - 1, Math.max(0, Math.floor(y[i] / cell)))
    tone[i] = w[cj * gw + ci]
  }
  return { n, x, y, tone }
}
