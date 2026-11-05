// One continuous line through every stipple: a travelling-salesman tour, as
// in Kaplan & Bosch's "TSP Art" (Bridges 2005). The tour is built by the
// nearest-neighbour heuristic, then shortened by 2-opt moves restricted to
// each point's K nearest neighbours, with "don't look" bits (Bentley, "Fast
// algorithms for geometric traveling salesman problems", 1992). The closed
// tour is finally opened at its longest edge.
//
// Everything is deterministic: no randomness is consumed here.

import { Buckets, knn } from './lloyd'

const K = 8

function bounds(x: Float64Array, y: Float64Array, n: number) {
  let w = 0
  let h = 0
  for (let i = 0; i < n; i++) {
    if (x[i] > w)
      w = x[i]
    if (y[i] > h)
      h = y[i]
  }
  return [w + 1e-9, h + 1e-9] as const
}

/** Greedy nearest-neighbour tour, starting from the top-left-most point. */
function nearestNeighbourTour(x: Float64Array, y: Float64Array, n: number, w: number, h: number): Int32Array {
  const b = new Buckets(x, y, n, w, h, Math.sqrt((w * h * 2) / n))
  const cells = b.gx * b.gy
  const live = new Int32Array(cells)
  const slot = new Int32Array(n)
  const cellOf = new Int32Array(n)
  for (let c = 0; c < cells; c++) {
    live[c] = b.start[c + 1] - b.start[c]
    for (let k = b.start[c]; k < b.start[c + 1]; k++) {
      slot[b.items[k]] = k
      cellOf[b.items[k]] = c
    }
  }
  const remove = (i: number) => {
    const c = cellOf[i]
    const last = b.start[c] + live[c] - 1
    const j = b.items[last]
    b.items[slot[i]] = j
    slot[j] = slot[i]
    b.items[last] = i
    slot[i] = last
    live[c]--
  }

  let cur = 0
  for (let i = 1; i < n; i++) {
    if (x[i] + y[i] < x[cur] + y[cur])
      cur = i
  }
  const tour = new Int32Array(n)
  tour[0] = cur
  remove(cur)
  const maxR = Math.max(b.gx, b.gy)
  for (let t = 1; t < n; t++) {
    const qx = x[cur]
    const qy = y[cur]
    const ix = Math.min(b.gx - 1, Math.floor(qx / b.h))
    const iy = Math.min(b.gy - 1, Math.floor(qy / b.h))
    const fx = qx - ix * b.h
    const fy = qy - iy * b.h
    const edge = Math.max(0, Math.min(fx, b.h - fx, fy, b.h - fy))
    let best = -1
    let bd = Infinity
    for (let r = 0; r <= maxR; r++) {
      if (r > 0) {
        const lb = edge + (r - 1) * b.h
        if (lb * lb >= bd)
          break
      }
      for (let cy = Math.max(0, iy - r); cy <= Math.min(b.gy - 1, iy + r); cy++) {
        const full = cy === iy - r || cy === iy + r
        const step = full ? 1 : 2 * r
        for (let cx = ix - r; cx <= ix + r; cx += step || 1) {
          if (cx < 0 || cx >= b.gx)
            continue
          const c = cy * b.gx + cx
          const end = b.start[c] + live[c]
          for (let k = b.start[c]; k < end; k++) {
            const i = b.items[k]
            const dx = x[i] - qx
            const dy = y[i] - qy
            const d = dx * dx + dy * dy
            if (d < bd) {
              bd = d
              best = i
            }
          }
        }
      }
    }
    tour[t] = best
    remove(best)
    cur = best
  }
  return tour
}

/** 2-opt with neighbour lists and don't-look bits, on a closed tour. */
function twoOpt(x: Float64Array, y: Float64Array, n: number, tour: Int32Array, nb: Int32Array, maxMoves: number) {
  const pos = new Int32Array(n)
  for (let i = 0; i < n; i++)
    pos[tour[i]] = i
  const dist = (a: number, b: number) => Math.hypot(x[a] - x[b], y[a] - y[b])
  const next = (a: number) => tour[pos[a] + 1 === n ? 0 : pos[a] + 1]
  const prev = (a: number) => tour[pos[a] === 0 ? n - 1 : pos[a] - 1]

  // Reverses the cyclic segment tour[i..j]; the shorter side is flipped,
  // which is the same tour on a cycle.
  const reverse = (i: number, j: number) => {
    let len = j - i
    if (len < 0)
      len += n
    len += 1
    if (len * 2 > n) {
      const ni = j + 1 === n ? 0 : j + 1
      const nj = i === 0 ? n - 1 : i - 1
      i = ni
      j = nj
      len = n - len
    }
    for (let s = 0; s < len >> 1; s++) {
      const a = tour[i]
      const b = tour[j]
      tour[i] = b
      pos[b] = i
      tour[j] = a
      pos[a] = j
      i = i + 1 === n ? 0 : i + 1
      j = j === 0 ? n - 1 : j - 1
    }
  }

  const queue = new Int32Array(n)
  const queued = new Uint8Array(n)
  let head = 0
  let size = n
  for (let i = 0; i < n; i++) {
    queue[i] = tour[i]
    queued[tour[i]] = 1
  }
  const push = (a: number) => {
    if (!queued[a]) {
      queued[a] = 1
      queue[(head + size) % n] = a
      size++
    }
  }

  let moves = 0
  while (size > 0 && moves < maxMoves) {
    const a = queue[head]
    head = head + 1 === n ? 0 : head + 1
    size--
    queued[a] = 0
    let improved = false
    for (let dir = 0; dir < 2 && !improved; dir++) {
      const b = dir === 0 ? next(a) : prev(a)
      const dab = dist(a, b)
      for (let k = 0; k < K; k++) {
        const c = nb[a * K + k]
        if (c < 0)
          break
        const dac = dist(a, c)
        if (dac >= dab)
          break
        const d = dir === 0 ? next(c) : prev(c)
        if (c === b || d === a)
          continue
        const gain = dab + dist(c, d) - dac - dist(b, d)
        if (gain > 1e-12) {
          // Replace (a,b) and (c,d) with (a,c) and (b,d).
          if (dir === 0)
            reverse(pos[b], pos[c])
          else
            reverse(pos[c], pos[b])
          push(a)
          push(b)
          push(c)
          push(d)
          improved = true
          moves++
          break
        }
      }
    }
  }
}

/** Visiting order of a short open path through all the points. */
export function singleLine(x: Float64Array, y: Float64Array, n: number): Int32Array {
  if (n < 4)
    return Int32Array.from({ length: n }, (_, i) => i)
  const [w, h] = bounds(x, y, n)
  const tour = nearestNeighbourTour(x, y, n, w, h)
  const b = new Buckets(x, y, n, w, h, Math.sqrt((w * h * 2) / n))
  twoOpt(x, y, n, tour, knn(b, x, y, n, K), n * 40)
  // Open the loop at its longest edge.
  let cut = 0
  let longest = -1
  for (let i = 0; i < n; i++) {
    const a = tour[i]
    const c = tour[i + 1 === n ? 0 : i + 1]
    const d = (x[a] - x[c]) ** 2 + (y[a] - y[c]) ** 2
    if (d > longest) {
      longest = d
      cut = i + 1 === n ? 0 : i + 1
    }
  }
  const out = new Int32Array(n)
  for (let i = 0; i < n; i++)
    out[i] = tour[(cut + i) % n]
  return out
}
