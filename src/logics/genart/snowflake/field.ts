// Unfolds a grown crystal (one twelfth of the disc) into full lattice fields
// that the renderer interpolates per pixel: ice cover, attachment time, a
// height made from the age of the ice, its gradient, and the vapour deficit
// around the crystal.

import type { Crystal } from './reiter'

export interface Field {
  /** Half-size and side of the axial box; index = (q + M) * side + (r + M). */
  M: number
  side: number
  /** Tip radius of the crystal, in cells. */
  E: number
  ice: Float32Array
  /** Attachment time, 0 (seed) to 1 (last cells); 1 outside the ice. */
  time: Float32Array
  /** Distance to the edge of the ice, in cells (0 outside). */
  depth: Float32Array
  /** Height of the ice (0 outside), 0 to 1: a roof over the depth, ridged along every branch. */
  height: Float32Array
  /** Ridge lines of the roof (minus its Laplacian, scaled), 0 elsewhere. */
  crease: Float32Array
  /** Depth (in cells) at which the roof reaches its full height. */
  ridge: number
  /** Gradient of the height, in the lattice's Cartesian frame (per cell). */
  gx: Float32Array
  gy: Float32Array
  /** Vapour taken from the air around the crystal, 0 to 1. */
  deficit: Float32Array
}

const H = Math.sqrt(3) / 2
// Cartesian unit vectors of the six axial neighbours (+q, -q, +r, -r, +q-r, -q+r).
const EX = [1, -1, 0.5, -0.5, 0.5, -0.5]
const EY = [0, 0, H, -H, -H, H]

export function unfold(c: Crystal, beta: number, ridge: number): Field {
  const { M, table, R } = c
  const side = 2 * M + 1
  const N = side * side
  const E = Math.max(1, c.extent)
  const ice = new Float32Array(N)
  const time = new Float32Array(N).fill(1)
  const height = new Float32Array(N)
  const deficit = new Float32Array(N)
  const steps = Math.max(1, c.steps)
  // the halo fades out before the edge of the simulated disc
  const haloR = Math.min(R - 1, E * 1.6)
  for (let q = -M; q <= M; q++) {
    for (let r = -M; r <= M; r++) {
      const idx = (q + M) * side + (r + M)
      const w = table[idx]
      if (w < 0)
        continue
      if (c.t[w] >= 0) {
        ice[idx] = 1
        time[idx] = c.t[w] / steps
      }
      else {
        const x = q + r / 2
        const y = r * H
        const d = Math.sqrt(x * x + y * y)
        const fade = Math.max(0, 1 - d / haloR)
        deficit[idx] = Math.max(0, Math.min(1, 1 - c.s[w] / beta)) * fade * fade
      }
    }
  }
  const off = [side, -side, 1, -1, side - 1, -side + 1]
  // Depth: breadth-first distance (in hexagonal steps) from the nearest
  // cell that is not ice. Its level lines are hexagons, so the roof built on
  // it has the straight ridges of real sectored plates.
  const depth = new Float32Array(N)
  const queue = new Int32Array(N)
  let head = 0
  let tail = 0
  for (let q = -M + 1; q < M; q++) {
    for (let r = -M + 1; r < M; r++) {
      const idx = (q + M) * side + (r + M)
      if (!ice[idx])
        continue
      depth[idx] = -1
      for (let k = 0; k < 6; k++) {
        if (!ice[idx + off[k]]) {
          depth[idx] = 1
          queue[tail++] = idx
          break
        }
      }
    }
  }
  while (head < tail) {
    const idx = queue[head++]
    for (let k = 0; k < 6; k++) {
      const j = idx + off[k]
      if (depth[j] < 0) {
        depth[j] = depth[idx] + 1
        queue[tail++] = j
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (depth[i] < 0)
      depth[i] = 1
  }
  // A pass of smoothing inside the ice takes the stairs off the hexagonal distance.
  const tmp = new Float32Array(depth)
  for (let q = -M + 1; q < M; q++) {
    for (let r = -M + 1; r < M; r++) {
      const idx = (q + M) * side + (r + M)
      if (!ice[idx])
        continue
      let sum = 2 * tmp[idx]
      for (let k = 0; k < 6; k++)
        sum += tmp[idx + off[k]]
      depth[idx] = Math.max(0.5, sum / 8)
    }
  }
  for (let i = 0; i < N; i++) {
    if (depth[i] > 0)
      height[i] = (Math.min(depth[i], ridge) / ridge) ** 0.7
  }
  const crease = new Float32Array(N)
  for (let q = -M + 1; q < M; q++) {
    for (let r = -M + 1; r < M; r++) {
      const idx = (q + M) * side + (r + M)
      if (!ice[idx])
        continue
      let sum = 0
      for (let k = 0; k < 6; k++)
        sum += height[idx + off[k]]
      // only well inside the ice: at the rim the drop to zero is not a ridge
      if (depth[idx] > 1)
        crease[idx] = Math.max(0, (height[idx] - sum / 6) * ridge * 0.9)
    }
  }
  const gx = new Float32Array(N)
  const gy = new Float32Array(N)
  for (let q = -M + 1; q < M; q++) {
    for (let r = -M + 1; r < M; r++) {
      const idx = (q + M) * side + (r + M)
      const h0 = height[idx]
      let sx = 0
      let sy = 0
      let any = h0 > 0
      for (let k = 0; k < 6; k++) {
        const hk = height[idx + off[k]]
        if (hk > 0)
          any = true
        sx += (hk - h0) * EX[k]
        sy += (hk - h0) * EY[k]
      }
      if (any) {
        gx[idx] = sx / 3
        gy[idx] = sy / 3
      }
    }
  }
  return { M, side, E, ice, time, depth, height, crease, ridge, gx, gy, deficit }
}
