// Lattices and turning agents for the "Meander" series.
//
// A room is filled on a lattice of nodes: a square lattice (4 headings,
// 90° turns) or a triangular one (6 headings, 60° turns, odd rows shifted by
// half a step). Agents walk from node to node, never enter a node twice and
// never cross a blocked node; each one keeps its heading until a rule tells
// it to turn, and dies when every neighbour is taken. The rules are local:
//
// - serpentine: straight on, U-turn towards its side at a wall, then swap
//   sides (the boustrophedon of a ploughed field or a circuit-board trace);
// - spiral: straight on, always turn to the same side at a wall;
// - key: replay a turtle program of (length, turn) pairs, a Greek-key hook
//   or a spirolateral (F. C. Odds, 1973), until something is in the way;
// - wander: random turns after a minimum run, a self-avoiding walk.
//
// The order in which agents move and the random draws are fixed, so a hash
// always yields the same corridors.

import type { Rng } from '../random'

export type LatticeKind = 'square' | 'tri'

export interface Lattice {
  kind: LatticeKind
  /** Number of headings: 4 or 6. Heading 0 is east, turning +1 is clockwise (y down). */
  D: number
  cols: number
  rows: number
  /** Node spacing, in units of the canvas short side. */
  step: number
  x: Float64Array
  y: Float64Array
  /** 0 blocked, 1 free, 2 taken. */
  state: Uint8Array
  /** Neighbour of node n in heading d at nb[n * D + d], -1 outside. */
  nb: Int32Array
}

const SQRT3_2 = Math.sqrt(3) / 2

/** Lattice centred in the rectangle [x0, x1] × [y0, y1], or null if too small. */
export function makeLattice(kind: LatticeKind, x0: number, y0: number, x1: number, y1: number, step: number): Lattice | null {
  const w = x1 - x0
  const h = y1 - y0
  const dy = kind === 'square' ? step : step * SQRT3_2
  const shift = kind === 'square' ? 0 : 0.5
  const cols = Math.floor(w / step - shift + 1e-9) + 1
  const rows = Math.floor(h / dy + 1e-9) + 1
  if (cols < 2 || rows < 2)
    return null
  const ox = x0 + (w - (cols - 1 + shift) * step) / 2
  const oy = y0 + (h - (rows - 1) * dy) / 2
  const n = cols * rows
  const D = kind === 'square' ? 4 : 6
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const nb = new Int32Array(n * D).fill(-1)
  const id = (i: number, j: number) => (i < 0 || j < 0 || i >= cols || j >= rows) ? -1 : j * cols + i
  for (let j = 0; j < rows; j++) {
    const odd = j & 1
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i
      x[k] = ox + (i + (kind === 'tri' && odd ? 0.5 : 0)) * step
      y[k] = oy + j * dy
      if (kind === 'square') {
        nb[k * 4] = id(i + 1, j)
        nb[k * 4 + 1] = id(i, j + 1)
        nb[k * 4 + 2] = id(i - 1, j)
        nb[k * 4 + 3] = id(i, j - 1)
      }
      else {
        // headings: E, SE, SW, W, NW, NE
        nb[k * 6] = id(i + 1, j)
        nb[k * 6 + 1] = id(i + odd, j + 1)
        nb[k * 6 + 2] = id(i - 1 + odd, j + 1)
        nb[k * 6 + 3] = id(i - 1, j)
        nb[k * 6 + 4] = id(i - 1 + odd, j - 1)
        nb[k * 6 + 5] = id(i + odd, j - 1)
      }
    }
  }
  return { kind, D, cols, rows, step, x, y, state: new Uint8Array(n).fill(1), nb }
}

export type Rule = 'serpentine' | 'spiral' | 'key' | 'wander'

/** One instruction of a turtle program: walk `len` nodes, then turn by `turn` headings. */
export type Program = ReadonlyArray<readonly [number, number]>

interface Agent {
  rule: Rule
  at: number
  d: number
  /** Preferred side: +1 clockwise, -1 counter-clockwise. */
  s: number
  path: number[]
  alive: boolean
  /** Steps since the last turn. */
  run: number
  prog?: Program
  pi: number
  left: number
}

export class Walkers {
  readonly paths: number[][] = []
  private agents: Agent[] = []

  constructor(readonly L: Lattice, private r: Rng) {}

  private wrap(d: number) {
    const D = this.L.D
    return ((d % D) + D) % D
  }

  /** The free neighbour of n in heading d, or -1. */
  free(n: number, d: number) {
    const m = this.L.nb[n * this.L.D + this.wrap(d)]
    return m >= 0 && this.L.state[m] === 1 ? m : -1
  }

  /** Neighbour of n in heading d inside the lattice (free or not), or -1. */
  inside(n: number, d: number) {
    return this.L.nb[n * this.L.D + this.wrap(d)]
  }

  spawn(rule: Rule, at: number, d: number, s: number, prog?: Program) {
    if (this.L.state[at] !== 1)
      return
    this.L.state[at] = 2
    const a: Agent = { rule, at, d: this.wrap(d), s, path: [at], alive: true, run: 0, prog, pi: 0, left: prog ? prog[0][0] : 0 }
    this.agents.push(a)
    this.paths.push(a.path)
  }

  private move(a: Agent, m: number, d: number) {
    if (d !== a.d)
      a.run = 0
    a.run++
    a.d = this.wrap(d)
    a.at = m
    a.path.push(m)
    this.L.state[m] = 2
  }

  /** Turn amounts tried, smallest first, on one side. */
  private turns(wide = false) {
    if (this.L.D === 4)
      return [1]
    return wide ? [2, 1] : [1, 2]
  }

  /** Straight on, else the first free turn on side s then on -s. */
  private fallback(a: Agent, s: number, wide = false) {
    let m = this.free(a.at, a.d)
    if (m >= 0) {
      this.move(a, m, a.d)
      return true
    }
    for (const side of [s, -s]) {
      for (const k of this.turns(wide)) {
        m = this.free(a.at, a.d + side * k)
        if (m >= 0) {
          this.move(a, m, a.d + side * k)
          return true
        }
      }
    }
    return false
  }

  private step(a: Agent): boolean {
    const { r } = this
    switch (a.rule) {
      case 'serpentine': {
        const m = this.free(a.at, a.d)
        if (m >= 0) {
          this.move(a, m, a.d)
          return true
        }
        // U-turn: one step to the side, then head back
        for (const side of [a.s, -a.s]) {
          for (const k of this.turns()) {
            const t = this.free(a.at, a.d + side * k)
            if (t >= 0) {
              const back = a.d + this.L.D / 2
              this.move(a, t, a.d + side * k)
              a.d = this.wrap(back)
              a.s = -side
              return true
            }
          }
        }
        return false
      }
      case 'spiral':
        // on the triangular lattice, 120° turns wind triangles
        return this.fallback(a, a.s, true)
      case 'key': {
        const prog = a.prog!
        for (let guard = 0; guard < prog.length + 1; guard++) {
          if (a.left > 0) {
            const m = this.free(a.at, a.d)
            if (m >= 0) {
              this.move(a, m, a.d)
              a.left--
              return true
            }
          }
          // end of a segment (or blocked): turn and start the next one
          const [, turn] = prog[a.pi]
          a.d = this.wrap(a.d + turn)
          a.pi = (a.pi + 1) % prog.length
          a.left = prog[a.pi][0]
        }
        // the program is stuck: wander on, then pick the program up again
        a.left = 0
        return this.fallback(a, a.s)
      }
      case 'wander': {
        if (a.run >= 2 && r() < 0.22) {
          const side = r() < 0.5 ? -1 : 1
          const k = this.L.D === 4 ? 1 : (r() < 0.6 ? 1 : 2)
          const m = this.free(a.at, a.d + side * k)
          if (m >= 0) {
            this.move(a, m, a.d + side * k)
            return true
          }
        }
        return this.fallback(a, r() < 0.5 ? -1 : 1)
      }
    }
  }

  /** Move every living agent one node per round until all are stuck. */
  run() {
    let alive = this.agents.filter(a => a.alive)
    while (alive.length) {
      for (const a of alive) {
        if (!this.step(a))
          a.alive = false
      }
      alive = alive.filter(a => a.alive)
    }
    this.agents = []
  }

  /**
   * Fill what is left: an agent of `rule` is started on every free node, in
   * the given order, and runs alone until it is stuck.
   */
  fill(order: Int32Array | number[], rule: Rule) {
    for (const n of order) {
      if (this.L.state[n] !== 1)
        continue
      // start towards the longest free run, so the filler lies along the pocket
      let best = 0
      let bestLen = -1
      for (let d = 0; d < this.L.D; d++) {
        let len = 0
        let m = this.free(n, d)
        while (m >= 0 && len < 64) {
          len++
          m = this.free(m, d)
        }
        if (len > bestLen) {
          bestLen = len
          best = d
        }
      }
      this.spawn(rule, n, best, this.r() < 0.5 ? -1 : 1)
      this.run()
    }
  }
}
