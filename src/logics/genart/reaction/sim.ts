// Gray–Scott reaction–diffusion on a small fixed grid.
//
// Two chemicals, U (the substrate, called A here) and V (the catalyst, B),
// react as U + 2V -> 3V while U is fed in at rate f and V is removed at rate
// k + f (Gray & Scott, 1983; the pattern zoo of Pearson, 1993). Diffusion uses
// the 3x3 Laplacian kernel popularised by Karl Sims (0.2 on the sides, 0.05
// on the corners, -1 in the centre), integrated with explicit Euler.
//
// Determinism: the loop only uses + - * / and comparisons, so every engine
// gets bit-identical results (Float32Array stores round the same way
// everywhere). Feed and kill come in per cell from precomputed arrays, and a
// fixed number of steps is run: the result never depends on the clock.

/** Grid with a one-cell ghost border on every side: (w + 2) x (h + 2) cells. */
export interface Grid {
  w: number
  h: number
  a: Float32Array
  b: Float32Array
  /** Feed rate per cell. */
  feed: Float32Array
  /** Kill + feed per cell (the decay rate of B). */
  decay: Float32Array
}

export function makeGrid(w: number, h: number): Grid {
  const n = (w + 2) * (h + 2)
  return {
    w,
    h,
    a: new Float32Array(n).fill(1),
    b: new Float32Array(n),
    feed: new Float32Array(n),
    decay: new Float32Array(n),
  }
}

/** Zero-flux edges: copy the outer ring of cells into the ghost border. */
function mirrorEdges(v: Float32Array, w: number, h: number): void {
  const s = w + 2
  const last = (h + 1) * s
  for (let x = 1; x <= w; x++) {
    v[x] = v[s + x]
    v[last + x] = v[last - s + x]
  }
  for (let y = 0; y < h + 2; y++) {
    v[y * s] = v[y * s + 1]
    v[y * s + w + 1] = v[y * s + w]
  }
}

// The resting state A = 1, B = 0 is an exact fixed point of the update, so
// cells far from any catalyst are skipped. Every SCAN steps the cells that
// left the rest state are located; since a 3x3 stencil spreads change by at
// most one cell per step, the region they can reach before the next scan is
// known exactly. The region only grows, so a skipped cell still holds the
// rest state in both buffers: skipping changes no bit of the result.
const SCAN = 8

/**
 * Runs `steps` Euler steps in place. Diffusion rates are in cells² per unit
 * time; `dt * da * 1.6` must stay under 2 for the scheme to be stable.
 */
export function grayScott(g: Grid, steps: number, da: number, db: number, dt: number): void {
  const { w, h, feed, decay } = g
  const s = w + 2
  let A = g.a
  let B = g.b
  // copies, so the cells that are never updated hold the rest state
  let A2 = A.slice()
  let B2 = B.slice()
  const ca = da * dt
  const cb = db * dt
  // active columns per row (interior coordinates 1..w, empty when lo > hi)
  const lo = new Int32Array(h + 2).fill(w + 1)
  const hi = new Int32Array(h + 2)
  for (let step = 0; step < steps; step++) {
    mirrorEdges(A, w, h)
    mirrorEdges(B, w, h)
    if (step % SCAN === 0)
      grow(A, B, w, h, lo, hi)
    for (let y = 1; y <= h; y++) {
      if (lo[y] > hi[y])
        continue
      let i = y * s + lo[y]
      // sliding 3x3 window: vertical pair sums (up + down) and middle values
      // of the columns left of, at and right of the current cell
      let sa0 = A[i - 1 - s] + A[i - 1 + s]
      let ma0 = A[i - 1]
      let sa1 = A[i - s] + A[i + s]
      let ma1 = A[i]
      let sb0 = B[i - 1 - s] + B[i - 1 + s]
      let mb0 = B[i - 1]
      let sb1 = B[i - s] + B[i + s]
      let mb1 = B[i]
      const end = i + hi[y] - lo[y] + 1
      for (; i < end; i++) {
        const j = i + 1
        const sa2 = A[j - s] + A[j + s]
        const ma2 = A[j]
        const sb2 = B[j - s] + B[j + s]
        const mb2 = B[j]
        const lapA = 0.2 * (ma0 + ma2 + sa1) + 0.05 * (sa0 + sa2) - ma1
        const lapB = 0.2 * (mb0 + mb2 + sb1) + 0.05 * (sb0 + sb2) - mb1
        const abb = ma1 * mb1 * mb1
        A2[i] = ma1 + ca * lapA + (feed[i] * (1 - ma1) - abb) * dt
        const nb = mb1 + cb * lapB + (abb - decay[i] * mb1) * dt
        // flush the vanishing tail of B to zero: subnormal floats are slow
        B2[i] = nb > 1e-12 ? nb : 0
        sa0 = sa1
        sa1 = sa2
        ma0 = ma1
        ma1 = ma2
        sb0 = sb1
        sb1 = sb2
        mb0 = mb1
        mb1 = mb2
      }
    }
    let t = A
    A = A2
    A2 = t
    t = B
    B = B2
    B2 = t
  }
  g.a = A
  g.b = B
}

/** Widens the active region by SCAN cells around every cell out of the rest state. */
function grow(A: Float32Array, B: Float32Array, w: number, h: number, lo: Int32Array, hi: Int32Array): void {
  const s = w + 2
  for (let y = 1; y <= h; y++) {
    let first = 0
    let last = -1
    const row = y * s
    for (let x = 1; x <= w; x++) {
      if (B[row + x] !== 0 || A[row + x] !== 1) {
        if (first === 0)
          first = x
        last = x
      }
    }
    if (last < 0)
      continue
    const x0 = Math.max(1, first - SCAN)
    const x1 = Math.min(w, last + SCAN)
    for (let yy = Math.max(1, y - SCAN); yy <= Math.min(h, y + SCAN); yy++) {
      if (x0 < lo[yy])
        lo[yy] = x0
      if (x1 > hi[yy])
        hi[yy] = x1
    }
  }
}
