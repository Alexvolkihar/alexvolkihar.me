// Isolines of a gridded heightfield: marching squares (Lorensen & Cline's
// marching cubes reduced to 2D) with linear interpolation along cell edges,
// saddles resolved by the cell-centre average, and the loose segments
// stitched into polylines through the edge they share.
//
// Coordinates are in grid cells: x in [0, nx], y in [0, ny]. Levels are
// processed one at a time with reused typed arrays, to keep the garbage
// collector quiet when every cover of the index renders at once.

export type Polyline = Float32Array

/**
 * Isolines for levels base + k * step, k = 0 .. count - 1.
 * Returns one list of polylines per level.
 */
export function isolines(h: Float32Array, nx: number, ny: number, base: number, step: number, count: number): Polyline[][] {
  const W = nx + 1
  const cells = nx * ny
  const cmin = new Float32Array(cells)
  const cmax = new Float32Array(cells)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = h[j * W + i]
      const b = h[j * W + i + 1]
      const c = h[(j + 1) * W + i + 1]
      const d = h[(j + 1) * W + i]
      cmin[j * nx + i] = Math.min(a, b, c, d)
      cmax[j * nx + i] = Math.max(a, b, c, d)
    }
  }
  // Edge ids: horizontal edge (i, j)-(i + 1, j) is j * nx + i,
  // vertical edge (i, j)-(i, j + 1) is HOFF + j * W + i.
  const HOFF = nx * (ny + 1)
  const edgePt = new Int32Array(HOFF + W * ny).fill(-1)
  let cap = 4096
  let xs = new Float32Array(cap)
  let ys = new Float32Array(cap)
  let e1 = new Int32Array(cap)
  let n1 = new Int32Array(cap)
  let n2 = new Int32Array(cap)
  let np = 0

  const point = (e: number, x: number, y: number) => {
    let p = edgePt[e]
    if (p < 0) {
      if (np === cap) {
        cap *= 2
        const grow = <T extends Float32Array | Int32Array>(a: T, make: (n: number) => T) => {
          const b = make(cap)
          b.set(a)
          return b
        }
        xs = grow(xs, n => new Float32Array(n))
        ys = grow(ys, n => new Float32Array(n))
        e1 = grow(e1, n => new Int32Array(n))
        n1 = grow(n1, n => new Int32Array(n))
        n2 = grow(n2, n => new Int32Array(n))
      }
      p = np++
      xs[p] = x
      ys[p] = y
      e1[p] = e
      n1[p] = -1
      n2[p] = -1
      edgePt[e] = p
    }
    return p
  }
  const link = (p: number, q: number) => {
    if (n1[p] < 0)
      n1[p] = q
    else
      n2[p] = q
    if (n1[q] < 0)
      n1[q] = p
    else
      n2[q] = p
  }

  const out: Polyline[][] = []
  for (let k = 0; k < count; k++) {
    const L = base + k * step
    np = 0
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ci = j * nx + i
        if (cmin[ci] > L || cmax[ci] < L)
          continue
        const a = h[j * W + i]
        const b = h[j * W + i + 1]
        const c = h[(j + 1) * W + i + 1]
        const d = h[(j + 1) * W + i]
        const code = (a >= L ? 8 : 0) | (b >= L ? 4 : 0) | (c >= L ? 2 : 0) | (d >= L ? 1 : 0)
        if (code === 0 || code === 15)
          continue
        const eT = j * nx + i
        const eB = eT + nx
        const eL = HOFF + j * W + i
        const eR = eL + 1
        // crossing points, created only for the edges this case uses
        let T = -1
        let R = -1
        let B = -1
        let Le = -1
        if (code === 4 || code === 5 || code === 6 || code === 7 || code === 8 || code === 9 || code === 10 || code === 11)
          T = point(eT, i + (L - a) / (b - a), j)
        if (code === 2 || code === 3 || code === 4 || code === 5 || code === 10 || code === 11 || code === 12 || code === 13)
          R = point(eR, i + 1, j + (L - b) / (c - b))
        if (code === 1 || code === 2 || code === 5 || code === 6 || code === 9 || code === 10 || code === 13 || code === 14)
          B = point(eB, i + (L - d) / (c - d), j + 1)
        if (code === 1 || code === 3 || code === 5 || code === 7 || code === 8 || code === 10 || code === 12 || code === 14)
          Le = point(eL, i, j + (L - a) / (d - a))
        if (code === 1 || code === 14) {
          link(Le, B)
        }
        else if (code === 2 || code === 13) {
          link(B, R)
        }
        else if (code === 3 || code === 12) {
          link(Le, R)
        }
        else if (code === 4 || code === 11) {
          link(T, R)
        }
        else if (code === 6 || code === 9) {
          link(T, B)
        }
        else if (code === 7 || code === 8) {
          link(T, Le)
        }
        else {
          // saddle (5 or 10): a high centre joins the two high corners
          const highCentre = (a + b + c + d) / 4 >= L
          if ((code === 5) === highCentre) {
            link(T, Le)
            link(R, B)
          }
          else {
            link(T, R)
            link(Le, B)
          }
        }
      }
    }
    out.push(stitch(np, xs, ys, n1, n2))
    for (let p = 0; p < np; p++)
      edgePt[e1[p]] = -1
  }
  return out
}

function stitch(n: number, xs: Float32Array, ys: Float32Array, n1: Int32Array, n2: Int32Array): Polyline[] {
  const seen = new Uint8Array(n)
  const chain = new Int32Array(n + 1)
  const lines: Polyline[] = []
  const walk = (start: number) => {
    let len = 0
    chain[len++] = start
    seen[start] = 1
    let cur = start
    for (;;) {
      let next = n1[cur]
      if (next < 0 || seen[next])
        next = n2[cur]
      if (next < 0 || seen[next])
        break
      seen[next] = 1
      chain[len++] = next
      cur = next
    }
    // close loops: the last point links back to the start
    if (len > 2 && (n1[cur] === start || n2[cur] === start))
      chain[len++] = start
    if (len < 2)
      return
    const pl = new Float32Array(len * 2)
    for (let q = 0; q < len; q++) {
      pl[q * 2] = xs[chain[q]]
      pl[q * 2 + 1] = ys[chain[q]]
    }
    lines.push(pl)
  }
  // open chains start at a point with a single neighbour (the map edge)
  for (let p = 0; p < n; p++) {
    if (!seen[p] && n2[p] < 0)
      walk(p)
  }
  for (let p = 0; p < n; p++) {
    if (!seen[p])
      walk(p)
  }
  return lines
}
