// Circle packing by random insertion ("random sequential addition", the dart
// throwing scheme known from Poisson-disc sampling) with a decaying radius cap.
//
// Every candidate point is grown to the largest radius that still fits, up to
// the current cap: the cap shrinks after each placement and after a run of
// misses, so the first circles are large and the last ones fill the cracks.
// Collisions are checked against a uniform grid: each circle is registered in
// every cell its bounding box covers, so a query only visits nearby cells.
//
// All coordinates live in the unit square; nothing here reads the canvas.

import type { Rng } from '../random'

export interface Boundary {
  /** Conservative distance to the edge: positive inside, never larger than the true distance. */
  inside: (x: number, y: number) => number
  /** Bounding box [x0, y0, x1, y1], in unit coordinates. */
  box: readonly [number, number, number, number]
}

export interface PackOptions {
  /** Radius cap of the first circle. */
  rStart: number
  /** Smallest circle kept. */
  rMin: number
  /** Empty space between two circles, and between a circle and the edge. */
  gap: number
  /** Cap multiplier after each placement... */
  placeDecay: number
  /** ...down to this floor; below it only misses shrink the cap. */
  capFloor: number
  /** Cap multiplier after `patience` consecutive misses. */
  failDecay: number
  patience: number
  /** Consecutive misses at `rMin` before giving up. */
  finalPatience: number
  /** A spot is kept when it fits at least `accept * cap`. */
  accept: number
  maxAttempts: number
}

export interface Circle {
  x: number
  y: number
  r: number
}

const CELL = 0.02

export function pack(r: Rng, boundary: Boundary, o: PackOptions): Circle[] {
  const [x0, y0, x1, y1] = boundary.box
  const cols = Math.ceil((x1 - x0) / CELL) + 1
  const rows = Math.ceil((y1 - y0) / CELL) + 1
  const grid: number[][] = Array.from({ length: cols * rows }, () => [])
  const circles: Circle[] = []

  const col = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / CELL)))
  const row = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / CELL)))

  /** Largest radius (≤ cap) a circle centred on (x, y) can take; below `need`, any value. */
  function fitAt(x: number, y: number, cap: number, need: number): number {
    let fit = Math.min(cap, boundary.inside(x, y) - o.gap)
    if (fit < need)
      return fit
    const reach = cap + o.gap
    const ca = col(x - reach)
    const cb = col(x + reach)
    const ra = row(y - reach)
    const rb = row(y + reach)
    for (let j = ra; j <= rb; j++) {
      for (let i = ca; i <= cb; i++) {
        for (const k of grid[j * cols + i]) {
          const c = circles[k]
          const dx = x - c.x
          const dy = y - c.y
          const d = Math.sqrt(dx * dx + dy * dy) - c.r - o.gap
          if (d < fit) {
            fit = d
            if (fit < need)
              return fit
          }
        }
      }
    }
    return fit
  }

  function add(c: Circle) {
    const k = circles.length
    circles.push(c)
    for (let j = row(c.y - c.r); j <= row(c.y + c.r); j++) {
      for (let i = col(c.x - c.r); i <= col(c.x + c.r); i++)
        grid[j * cols + i].push(k)
    }
  }

  let cap = o.rStart
  let misses = 0
  for (let a = 0; a < o.maxAttempts; a++) {
    // exactly two draws per attempt, whatever happens next
    const x = x0 + r() * (x1 - x0)
    const y = y0 + r() * (y1 - y0)
    const need = Math.max(o.rMin, cap * o.accept)
    const fit = fitAt(x, y, cap, need)
    if (fit >= need) {
      add({ x, y, r: fit })
      cap = Math.max(Math.min(cap, o.capFloor), o.rMin, cap * o.placeDecay)
      misses = 0
    }
    else if (++misses >= (cap <= o.rMin ? o.finalPatience : o.patience)) {
      if (cap <= o.rMin)
        break
      cap = Math.max(o.rMin, cap * o.failDecay)
      misses = 0
    }
  }
  return circles
}

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

export function squareBoundary(margin: number): Boundary {
  return {
    inside: (x, y) => Math.min(x - margin, 1 - margin - x, y - margin, 1 - margin - y),
    box: [margin, margin, 1 - margin, 1 - margin],
  }
}

export function discBoundary(cx: number, cy: number, radius: number): Boundary {
  return {
    inside: (x, y) => radius - Math.hypot(x - cx, y - cy),
    box: [cx - radius, cy - radius, cx + radius, cy + radius],
  }
}

/**
 * A union of discs. max(rᵢ − dᵢ) is a lower bound of the distance to the edge
 * of the union (a point that deep inside one disc is that deep inside the
 * union), so circles packed with it never cross the outline.
 */
export function blobBoundary(discs: ReadonlyArray<readonly [number, number, number]>): Boundary {
  let bx0 = 1
  let by0 = 1
  let bx1 = 0
  let by1 = 0
  for (const [cx, cy, rr] of discs) {
    bx0 = Math.min(bx0, cx - rr)
    by0 = Math.min(by0, cy - rr)
    bx1 = Math.max(bx1, cx + rr)
    by1 = Math.max(by1, cy + rr)
  }
  return {
    inside: (x, y) => {
      let best = -Infinity
      for (const [cx, cy, rr] of discs)
        best = Math.max(best, rr - Math.hypot(x - cx, y - cy))
      return best
    },
    box: [bx0, by0, bx1, by1],
  }
}
