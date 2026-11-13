// Marching squares on a regular grid, every integer level at once, with the
// segments chained into polylines (open at the grid border, closed around
// eddies and stones). Saddle cells are split by the value at their centre.

export interface Contour {
  /** Flat x0, y0, x1, y1, … in the grid's world units. */
  pts: number[]
  level: number
  closed: boolean
}

export interface ScalarGrid {
  w: number
  h: number
  /** World position of node (0, 0) and the node spacing. */
  x0: number
  y0: number
  step: number
  v: Float32Array
}

/**
 * Contours of `g` at every integer level in [lo, hi]. Corners at or above a
 * level count as inside.
 */
export function contours(g: ScalarGrid, lo: number, hi: number): Contour[] {
  const { w, h, x0, y0, step, v } = g
  const NE = w * h * 2
  let vmin = Infinity
  for (let o = 0; o < v.length; o++) {
    if (v[o] < vmin)
      vmin = v[o]
  }
  // keys (level, edge) stay small integers
  const lbase = Math.max(lo, Math.floor(vmin))
  // segment ends: key (level, edge) and position
  const keys: number[] = []
  const px: number[] = []
  const py: number[] = []
  const lev: number[] = []
  const ex = [0, 0, 0, 0]
  const ey = [0, 0, 0, 0]
  const ek = [0, 0, 0, 0]
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const o = j * w + i
      const a = v[o]
      const b = v[o + 1]
      const c = v[o + w + 1]
      const d = v[o + w]
      let mn = a
      let mx = a
      if (b < mn)
        mn = b
      if (b > mx)
        mx = b
      if (c < mn)
        mn = c
      if (c > mx)
        mx = c
      if (d < mn)
        mn = d
      if (d > mx)
        mx = d
      // levels l with mn < l <= mx are crossed
      let l0 = Math.floor(mn) + 1
      if (l0 < lo)
        l0 = lo
      let l1 = Math.floor(mx)
      if (l1 > hi)
        l1 = hi
      if (l0 > l1)
        continue
      const X = x0 + i * step
      const Y = y0 + j * step
      for (let l = l0; l <= l1; l++) {
        const ia = a >= l
        const ib = b >= l
        const ic = c >= l
        const id = d >= l
        if (ia === ib && ib === ic && ic === id)
          continue
        const base = (l - lbase) * NE
        // edge crossings: 0 top (a-b), 1 right (b-c), 2 bottom (d-c), 3 left (a-d)
        if (ia !== ib) {
          ex[0] = X + step * (l - a) / (b - a)
          ey[0] = Y
          ek[0] = base + o * 2
        }
        if (ib !== ic) {
          ex[1] = X + step
          ey[1] = Y + step * (l - b) / (c - b)
          ek[1] = base + (o + 1) * 2 + 1
        }
        if (id !== ic) {
          ex[2] = X + step * (l - d) / (c - d)
          ey[2] = Y + step
          ek[2] = base + (o + w) * 2
        }
        if (ia !== id) {
          ex[3] = X
          ey[3] = Y + step * (l - a) / (d - a)
          ek[3] = base + o * 2 + 1
        }
        const n = (ia ? 1 : 0) + (ib ? 1 : 0) + (ic ? 1 : 0) + (id ? 1 : 0)
        const seg = (e0: number, e1: number) => {
          keys.push(ek[e0], ek[e1])
          px.push(ex[e0], ex[e1])
          py.push(ey[e0], ey[e1])
          lev.push(l)
        }
        if (n === 2 && ia === ic) {
          // saddle: the corners whose state differs from the centre are cut off
          const ctr = (a + b + c + d) / 4 >= l
          if (ia !== ctr) {
            seg(0, 3)
            seg(1, 2)
          }
          else {
            seg(0, 1)
            seg(2, 3)
          }
        }
        else {
          let e0 = -1
          for (let e = 0; e < 4; e++) {
            const cross = e === 0 ? ia !== ib : e === 1 ? ib !== ic : e === 2 ? id !== ic : ia !== id
            if (!cross)
              continue
            if (e0 < 0) {
              e0 = e
            }
            else {
              seg(e0, e)
              break
            }
          }
        }
      }
    }
  }
  const nSeg = lev.length
  const link = new Int32Array(nSeg * 2).fill(-1)
  const open = new Map<number, number>()
  for (let r = 0; r < nSeg * 2; r++) {
    const k = keys[r]
    const other = open.get(k)
    if (other === undefined) {
      open.set(k, r)
    }
    else {
      link[r] = other
      link[other] = r
      open.delete(k)
    }
  }
  const used = new Uint8Array(nSeg)
  const out: Contour[] = []
  for (let s = 0; s < nSeg; s++) {
    if (used[s])
      continue
    used[s] = 1
    const fx = [px[s * 2], px[s * 2 + 1]]
    const fy = [py[s * 2], py[s * 2 + 1]]
    let closed = false
    let next = link[s * 2 + 1]
    while (next >= 0) {
      const sg = next >> 1
      if (used[sg]) {
        closed = sg === s
        break
      }
      used[sg] = 1
      const exit = next ^ 1
      fx.push(px[exit])
      fy.push(py[exit])
      next = link[exit]
    }
    const bx: number[] = []
    const by: number[] = []
    if (!closed) {
      next = link[s * 2]
      while (next >= 0) {
        const sg = next >> 1
        if (used[sg])
          break
        used[sg] = 1
        const exit = next ^ 1
        bx.push(px[exit])
        by.push(py[exit])
        next = link[exit]
      }
    }
    const pts: number[] = []
    for (let i = bx.length - 1; i >= 0; i--)
      pts.push(bx[i], by[i])
    for (let i = 0; i < fx.length; i++)
      pts.push(fx[i], fy[i])
    if (closed)
      pts.length -= 2
    out.push({ pts, level: lev[s], closed })
  }
  return out
}

/** Chaikin corner cutting; open polylines keep their end points. */
export function chaikin(pts: number[], closed: boolean, rounds: number): number[] {
  let cur = pts
  for (let r = 0; r < rounds; r++) {
    const n = cur.length / 2
    if (n < 3)
      return cur
    const out: number[] = []
    if (!closed)
      out.push(cur[0], cur[1])
    const m = closed ? n : n - 1
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % n
      const ax = cur[i * 2]
      const ay = cur[i * 2 + 1]
      const bx = cur[j * 2]
      const by = cur[j * 2 + 1]
      out.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by)
    }
    if (!closed)
      out.push(cur[cur.length - 2], cur[cur.length - 1])
    cur = out
  }
  return cur
}
