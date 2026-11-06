// Grid maze router for the "Circuit" series.
//
// The board is a grid of routing cells on one or two copper layers. A track
// is found by A* search (Hart, Nilsson & Raphael, 1968) over states made of a
// cell, a layer and the direction the track arrived from, which is how the
// classic Lee router (C. Y. Lee, "An Algorithm for Path Connections and Its
// Applications", 1961) is usually extended to price bends and vias. Moves are
// the 4 axis steps (right-angle routing) or the 8 octilinear steps (45°
// mitred routing); a 45° bend is cheap, a 90° bend dearer, sharper turns are
// forbidden. A layer change drops a via.
//
// Cell owners: 0 free, -1 blocked (board edge, part bodies), n > 0 the net
// that holds it. A track may enter free cells and cells of its own net only.

export const DX = [1, 1, 0, -1, -1, -1, 0, 1] as const
export const DY = [0, -1, -1, -1, 0, 1, 1, 1] as const
const NODIR = 8
const SQRT2 = Math.SQRT2

export interface Cell { x: number, y: number, l: number }

export interface RouteOptions {
  diagonal: boolean
  /** Extra cost of a via (a layer change). Only used with two layers. */
  viaCost: number
  /** Two layers: layer 0 prefers horizontal runs, layer 1 vertical ones. */
  preferAxis: boolean
  /** Cells added around the bounding box of the ends to bound the search. */
  margin: number
  maxExpand: number
  /** Wide track: the four neighbours of every cell must be free as well. */
  fat?: boolean
}

export class Router {
  readonly cols: number
  readonly rows: number
  readonly layers: number
  /** Owner of each cell, index (l * rows + y) * cols + x. */
  readonly occ: Int32Array
  /** 1 where a pad or a via sits: diagonal moves may not clip its corner. */
  readonly pad: Uint8Array
  private g: Float32Array
  private par: Int32Array
  private seen: Uint32Array
  private done: Uint32Array
  private stamp = 0
  private tmark: Uint32Array
  private tstamp = 0
  private hf = new Float64Array(1024)
  private hs = new Int32Array(1024)
  private hn = 0

  constructor(cols: number, rows: number, layers: number) {
    this.cols = cols
    this.rows = rows
    this.layers = layers
    const n = cols * rows * layers
    this.occ = new Int32Array(n)
    this.pad = new Uint8Array(n)
    this.g = new Float32Array(n * 9)
    this.par = new Int32Array(n * 9)
    this.seen = new Uint32Array(n * 9)
    this.done = new Uint32Array(n * 9)
    this.tmark = new Uint32Array(n)
  }

  idx(x: number, y: number, l: number) {
    return (l * this.rows + y) * this.cols + x
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows
  }

  /** Owner of a cell, -1 outside the grid. */
  at(x: number, y: number, l: number) {
    return this.inside(x, y) ? this.occ[this.idx(x, y, l)] : -1
  }

  private push(f: number, s: number) {
    if (this.hn === this.hf.length) {
      const nf = new Float64Array(this.hn * 2)
      const ns = new Int32Array(this.hn * 2)
      nf.set(this.hf)
      ns.set(this.hs)
      this.hf = nf
      this.hs = ns
    }
    let i = this.hn++
    const hf = this.hf
    const hs = this.hs
    while (i > 0) {
      const p = (i - 1) >> 1
      if (hf[p] <= f)
        break
      hf[i] = hf[p]
      hs[i] = hs[p]
      i = p
    }
    hf[i] = f
    hs[i] = s
  }

  private pop(): number {
    const hf = this.hf
    const hs = this.hs
    const top = hs[0]
    const n = --this.hn
    const lf = hf[n]
    const ls = hs[n]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= n)
        break
      if (c + 1 < n && hf[c + 1] < hf[c])
        c++
      if (hf[c] >= lf)
        break
      hf[i] = hf[c]
      hs[i] = hs[c]
      i = c
    }
    hf[i] = lf
    hs[i] = ls
    return top
  }

  /**
   * Shortest track for `net` from any start cell to any target cell, or null.
   * The returned cells run from a start to a target, layer changes included.
   */
  route(net: number, starts: readonly Cell[], targets: readonly Cell[], o: RouteOptions): Cell[] | null {
    if (!starts.length || !targets.length || !this.open(net, starts) || !this.open(net, targets))
      return null
    const { cols, rows, layers, occ, pad } = this
    if (++this.stamp === 0xFFFFFFFF)
      this.stamp = 1
    if (++this.tstamp === 0xFFFFFFFF)
      this.tstamp = 1
    const stamp = this.stamp
    const tst = this.tstamp
    const { g, par, seen, done, tmark } = this

    let x0 = cols
    let y0 = rows
    let x1 = 0
    let y1 = 0
    let tx = 0
    let ty = 0
    for (const t of targets) {
      tmark[this.idx(t.x, t.y, t.l)] = tst
      tx += t.x
      ty += t.y
      x0 = Math.min(x0, t.x)
      y0 = Math.min(y0, t.y)
      x1 = Math.max(x1, t.x)
      y1 = Math.max(y1, t.y)
    }
    tx /= targets.length
    ty /= targets.length
    for (const s of starts) {
      x0 = Math.min(x0, s.x)
      y0 = Math.min(y0, s.y)
      x1 = Math.max(x1, s.x)
      y1 = Math.max(y1, s.y)
    }
    x0 = Math.max(0, x0 - o.margin)
    y0 = Math.max(0, y0 - o.margin)
    x1 = Math.min(cols - 1, x1 + o.margin)
    y1 = Math.min(rows - 1, y1 + o.margin)

    const diag = o.diagonal
    const fat = !!o.fat
    const h = (x: number, y: number) => {
      const ax = Math.abs(x - tx)
      const ay = Math.abs(y - ty)
      if (diag)
        return (Math.max(ax, ay) + (SQRT2 - 1) * Math.min(ax, ay)) * 1.15
      return (ax + ay) * 1.15
    }
    // bend price by turn size, in 45° steps (index 0..4)
    const bend = diag ? [0, 0.35, 1.6, 1e9, 1e9] : [0, 1e9, 1.4, 1e9, 1e9]

    this.hn = 0
    for (const s of starts) {
      const c = this.idx(s.x, s.y, s.l)
      const st = c * 9 + NODIR
      seen[st] = stamp
      g[st] = 0
      par[st] = -1
      this.push(h(s.x, s.y), st)
    }

    const plane = cols * rows
    let found = -1
    let expanded = 0
    while (this.hn > 0) {
      const st = this.pop()
      if (done[st] === stamp)
        continue
      done[st] = stamp
      const c = (st / 9) | 0
      if (tmark[c] === tst) {
        found = st
        break
      }
      if (++expanded > o.maxExpand)
        break
      const d = st - c * 9
      const l = (c / plane) | 0
      const rem = c - l * plane
      const y = (rem / cols) | 0
      const x = rem - y * cols
      const gc = g[st]

      for (let nd = 0; nd < 8; nd += diag ? 1 : 2) {
        let turn = 0
        if (d !== NODIR) {
          turn = Math.abs(nd - d)
          if (turn > 4)
            turn = 8 - turn
        }
        const bc = bend[turn]
        if (bc > 1e8)
          continue
        const nx = x + DX[nd]
        const ny = y + DY[nd]
        if (nx < x0 || ny < y0 || nx > x1 || ny > y1)
          continue
        const nc = c + DY[nd] * cols + DX[nd]
        const on = occ[nc]
        if (on !== 0 && on !== net)
          continue
        if (fat && !this.roomy(nc, net))
          continue
        let step = 1
        if (nd & 1) {
          step = SQRT2
          // never clip the corner of a foreign pad, never cross a foreign diagonal
          const c1 = c + DX[nd]
          const c2 = c + DY[nd] * cols
          const o1 = occ[c1]
          const o2 = occ[c2]
          const f1 = o1 !== 0 && o1 !== net
          const f2 = o2 !== 0 && o2 !== net
          if ((f1 && (pad[c1] || o1 < 0)) || (f2 && (pad[c2] || o2 < 0)) || (f1 && f2))
            continue
        }
        let pref = 0
        if (o.preferAxis) {
          const horizontal = DY[nd] === 0
          const vertical = DX[nd] === 0
          if ((l === 0 && vertical) || (l === 1 && horizontal))
            pref = 0.6
          else if (nd & 1)
            pref = 0.25
        }
        const ng = gc + step + bc + pref
        const ns = nc * 9 + nd
        if (seen[ns] !== stamp || ng < g[ns]) {
          seen[ns] = stamp
          g[ns] = ng
          par[ns] = st
          this.push(ng + h(nx, ny), ns)
        }
      }

      // via to the other layer, never inside a pad
      if (layers > 1 && !pad[c]) {
        const ol = 1 - l
        const oc = c + (ol - l) * plane
        const oo = occ[oc]
        if ((oo === 0 || oo === net) && !pad[oc] && this.viaRoom(x, y, net)) {
          const ns = oc * 9 + NODIR
          const ng = gc + o.viaCost
          if (seen[ns] !== stamp || ng < g[ns]) {
            seen[ns] = stamp
            g[ns] = ng
            par[ns] = st
            this.push(ng + h(x, y), ns)
          }
        }
      }
    }
    if (found < 0)
      return null
    const path: Cell[] = []
    for (let s = found; s >= 0; s = par[s]) {
      const c = (s / 9) | 0
      const l = (c / plane) | 0
      const rem = c - l * plane
      const y = (rem / cols) | 0
      path.push({ x: rem - y * cols, y, l })
    }
    return path.reverse()
  }

  /** False when every cell of the set is walled in by foreign copper. */
  private open(net: number, cells: readonly Cell[]) {
    const { occ, cols, rows } = this
    for (const p of cells) {
      for (let d = 0; d < 8; d++) {
        const x = p.x + DX[d]
        const y = p.y + DY[d]
        if (x < 0 || y < 0 || x >= cols || y >= rows)
          continue
        const o = occ[(p.l * rows + y) * cols + x]
        if (o === 0 || o === net)
          return true
      }
    }
    return false
  }

  private roomy(c: number, net: number) {
    const { occ, cols } = this
    for (const d of [1, -1, cols, -cols]) {
      const o = occ[c + d]
      if (o !== 0 && o !== net)
        return false
    }
    return true
  }

  /** A via needs its 8 neighbours free of foreign pads and vias on every layer. */
  viaRoom(x: number, y: number, net: number) {
    for (let l = 0; l < this.layers; l++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!this.inside(x + dx, y + dy))
            return false
          const c = this.idx(x + dx, y + dy, l)
          const o = this.occ[c]
          if (this.pad[c] && o !== net)
            return false
          if (o < 0)
            return false
        }
      }
    }
    return true
  }

  /** Marks a found track as owned by its net. */
  commit(net: number, path: readonly Cell[], fat = false) {
    for (const p of path) {
      const c = this.idx(p.x, p.y, p.l)
      this.occ[c] = net
      if (fat) {
        // keep the shoulders of a wide track for itself
        for (const d of [1, -1, this.cols, -this.cols]) {
          if (this.occ[c + d] === 0)
            this.occ[c + d] = net
        }
      }
    }
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      if (a.l !== b.l) {
        for (let l = 0; l < this.layers; l++) {
          const c = this.idx(a.x, a.y, l)
          this.occ[c] = net
          this.pad[c] = 1
        }
      }
    }
  }
}
