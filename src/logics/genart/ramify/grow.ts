// Growth of wide ribbons that go straight, branch and stop before they touch.
//
// The agent model follows Jared Tarbell's "Substrate" (2003): agents walk in
// straight lines, sprout new agents from their flanks and die when they meet
// another agent's trail. Here every agent has a width, so it sweeps a ribbon,
// and it dies when its front (widened by a gap on both sides) would reach any
// other ribbon, a wall or its own older body. Collisions are tested on an
// occupancy grid in canvas units (short side = 1), so the result does not
// depend on the pixel size.

import type { Rng } from '../random'
import { range } from '../random'

export type Rule = 'Straight' | 'Drift' | 'Arches' | 'Orbit'

export interface GrowParams {
  /** Domain size in short-side units. */
  A: number
  B: number
  margin: number
  gap: number
  rule: Rule
  maxLevel: number
  /** Child width / parent width. */
  ratio: number
  wMin: number
  /** Birth angle sampler (radians, positive). */
  angle: (r: Rng) => number
  /** Drift: rotation rate (rad per unit length) in the half plane n·(p - c) > 0. */
  drift: { cx: number, cy: number, nx: number, ny: number, rate: number }
  /** Orbit: curvature k / distance to the centre. */
  orbit: { cx: number, cy: number, k: number }
}

export interface Ribbon {
  id: number
  parent: number
  /** -1 for the fixed structure (frame, plinth), 0 for roots, then 1, 2... */
  level: number
  w: number
  xs: number[]
  ys: number[]
  /** Heading at each vertex. */
  hs: number[]
}

export interface Disc {
  id: number
  x: number
  y: number
  r: number
}

interface Agent {
  rb: Ribbon
  x: number
  y: number
  a: number
  w: number
  traveled: number
  nextBirth: number
  anchor: number
  // Arches: straight arm, then a turn of fixed radius
  arm: number
  turn: number
  turnRate: number
}

const STEP = 0.003
const CELL = 0.0025
const WALL = -1

export class World {
  readonly gw: number
  readonly gh: number
  readonly occ: Int32Array
  /** Distance travelled by the owner when the cell was stamped. */
  readonly when: Float32Array
  readonly ribbons: Ribbon[] = []
  readonly discs: Disc[] = []
  private parentOf: number[] = [0]
  private graceOf: number[] = [0]
  private agents: Agent[] = []
  private steps = 0

  constructor(readonly p: GrowParams, readonly r: Rng) {
    this.gw = Math.ceil(p.A / CELL) + 1
    this.gh = Math.ceil(p.B / CELL) + 1
    this.occ = new Int32Array(this.gw * this.gh)
    this.when = new Float32Array(this.gw * this.gh)
  }

  private newId(parent: number, grace: number) {
    this.parentOf.push(parent)
    this.graceOf.push(grace)
    return this.parentOf.length - 1
  }

  /** Occupant at a point, WALL outside the margins. */
  private at(x: number, y: number) {
    const m = this.p.margin
    if (x < m || y < m || x > this.p.A - m || y > this.p.B - m)
      return -2
    return ((y / CELL) | 0) * this.gw + ((x / CELL) | 0)
  }

  private mark(x: number, y: number, id: number, t: number) {
    const i = ((y / CELL) | 0) * this.gw + ((x / CELL) | 0)
    if (i < 0 || i >= this.occ.length || x < 0 || x > this.p.A)
      return
    if (this.occ[i] === 0) {
      this.occ[i] = id
      this.when[i] = t
    }
  }

  /** Stamp the rectangle swept by a step from (x0, y0) along heading a. */
  private stamp(x0: number, y0: number, a: number, len: number, w: number, id: number, t: number) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const h = CELL * 0.7
    for (let u = 0; u <= len + 1e-9; u += h) {
      for (let s = -w / 2; s <= w / 2 + 1e-9; s += h)
        this.mark(x0 + dx * u - dy * s, y0 + dy * u + dx * s, id, t + u)
    }
  }

  /** True when the given cell blocks agent `me` at travelled distance `t`. */
  private blocks(i: number, me: number, t: number, w: number) {
    if (i === -2)
      return true
    const o = this.occ[i]
    if (o === 0)
      return false
    if (o === WALL)
      return true
    if (o === me)
      return t - this.when[i] > w + 2 * this.p.gap + STEP * 2
    if (o === this.parentOf[me] && t < this.graceOf[me])
      return false
    if (this.parentOf[o] === me && this.when[i] < this.graceOf[o])
      return false
    return true
  }

  /** Is the strip ahead of a front free? */
  private clear(x: number, y: number, a: number, w: number, me: number, t: number, from: number, to: number) {
    const dx = Math.cos(a)
    const dy = Math.sin(a)
    const side = w / 2 + this.p.gap
    const h = CELL * 0.9
    for (let u = from; u <= to + 1e-9; u += h) {
      for (let s = -side; s <= side + 1e-9; s += h) {
        if (this.blocks(this.at(x + dx * u - dy * s, y + dy * u + dx * s), me, t, w))
          return false
      }
    }
    return true
  }

  /** A fixed straight ribbon (frame side, plinth), stamped at once. */
  addBar(x0: number, y0: number, x1: number, y1: number, w: number): Ribbon {
    const id = this.newId(0, 0)
    const a = Math.atan2(y1 - y0, x1 - x0)
    const len = Math.hypot(x1 - x0, y1 - y0)
    this.stamp(x0, y0, a, len, w, id, 0)
    const rb: Ribbon = { id, parent: 0, level: -1, w, xs: [x0, x1], ys: [y0, y1], hs: [a, a] }
    this.ribbons.push(rb)
    return rb
  }

  addDisc(x: number, y: number, r: number): Disc {
    const id = this.newId(0, 0)
    const h = CELL * 0.7
    for (let yy = y - r; yy <= y + r; yy += h) {
      for (let xx = x - r; xx <= x + r; xx += h) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r)
          this.mark(xx, yy, id, 0)
      }
    }
    const d = { id, x, y, r }
    this.discs.push(d)
    return d
  }

  /**
   * Start an agent at (x, y) heading a, born from `parent`. Returns false when
   * the first stretch ahead is not free enough to be worth drawing.
   */
  spawn(parent: number, level: number, x: number, y: number, a: number, w: number, grace: number, probe: number) {
    const id = this.parentOf.length
    // probe as the future agent, before it exists: parent cells are ignored
    this.parentOf.push(parent)
    this.graceOf.push(Infinity)
    const ok = this.clear(x, y, a, w, id, 0, 0, probe)
    if (!ok) {
      this.parentOf.pop()
      this.graceOf.pop()
      return false
    }
    this.graceOf[id] = grace
    const rb: Ribbon = { id, parent, level, w, xs: [x, x], ys: [y, y], hs: [a, a] }
    this.ribbons.push(rb)
    const r = this.r
    const ag: Agent = {
      rb,
      x,
      y,
      a,
      w,
      traveled: 0,
      nextBirth: w * range(r, 0.8, 2.4),
      anchor: a,
      arm: range(r, 0.1, 0.45),
      turn: 0,
      turnRate: 0,
    }
    this.agents.push(ag)
    return true
  }

  private turnRate(ag: Agent) {
    const p = this.p
    switch (p.rule) {
      case 'Drift': {
        const d = (ag.x - p.drift.cx) * p.drift.nx + (ag.y - p.drift.cy) * p.drift.ny
        return d > 0 ? p.drift.rate : 0
      }
      case 'Orbit': {
        const d = Math.max(0.09, Math.hypot(ag.x - p.orbit.cx, ag.y - p.orbit.cy))
        return p.orbit.k / d
      }
      case 'Arches': {
        if (ag.turn > 0) {
          ag.turn -= Math.abs(ag.turnRate) * STEP
          if (ag.turn <= 0)
            ag.arm = range(this.r, 0.1, 0.4)
          return ag.turnRate
        }
        ag.arm -= STEP
        // only the two widest generations bend: thin ones would curl into hooks
        if (ag.arm <= 0 && ag.rb.level <= 1) {
          // a quarter or a half turn, on a radius a little wider than the ribbon
          ag.turn = this.r() < 0.55 ? Math.PI / 2 : Math.PI
          const radius = Math.max(0.03, ag.w * range(this.r, 0.9, 2.2)) + p.gap
          ag.turnRate = (this.r() < 0.5 ? -1 : 1) / radius
        }
        return 0
      }
      default:
        return 0
    }
  }

  /** Advance one agent by one step. Returns false when it dies. */
  private advance(ag: Agent) {
    const p = this.p
    const me = ag.rb.id
    const a = ag.a + this.turnRate(ag) * STEP
    const nx = ag.x + Math.cos(a) * STEP
    const ny = ag.y + Math.sin(a) * STEP
    if (!this.clear(nx, ny, a, ag.w, me, ag.traveled + STEP, CELL * 0.5, p.gap))
      return false
    this.stamp(ag.x, ag.y, a, STEP, ag.w, me, ag.traveled)
    ag.traveled += STEP
    ag.x = nx
    ag.y = ny
    ag.a = a
    const rb = ag.rb
    const n = rb.xs.length - 1
    if (Math.abs(a - ag.anchor) > 0.035) {
      rb.xs.push(nx)
      rb.ys.push(ny)
      rb.hs.push(a)
      ag.anchor = a
    }
    else {
      rb.xs[n] = nx
      rb.ys[n] = ny
      rb.hs[n] = a
    }

    if (ag.traveled >= ag.nextBirth)
      this.birth(ag)
    return true
  }

  private birth(ag: Agent) {
    const p = this.p
    const r = this.r
    const level = ag.rb.level + 1
    const wc = ag.w * p.ratio * range(r, 0.85, 1.1)
    if (level > p.maxLevel || wc < p.wMin) {
      ag.nextBirth = Infinity
      return
    }
    const side = r() < 0.5 ? -1 : 1
    const th = p.angle(r)
    const ca = Math.abs(Math.cos(th))
    const off = Math.max(0, ag.w / 2 - (wc / 2) * ca - 0.15 * wc)
    const x = ag.x - Math.sin(ag.a) * side * off
    const y = ag.y + Math.cos(ag.a) * side * off
    const grace = (ag.w / 2 - off + wc / 2 + 2.5 * p.gap) / Math.max(0.35, Math.sin(th)) + STEP * 2
    const ok = this.spawn(ag.rb.id, level, x, y, ag.a + side * th, wc, grace, grace + Math.max(2.5 * wc, 0.06))
    if (ok)
      ag.nextBirth = ag.traveled + (ag.w + wc) * range(r, 1.1, 3.2)
    else
      ag.nextBirth = ag.traveled + ag.w * range(r, 0.3, 0.8)
  }

  /** Run every live agent in turn, one step each, until all have died. */
  grow(maxSteps: number) {
    while (this.agents.length && this.steps < maxSteps) {
      const live = this.agents
      this.agents = []
      const keep: Agent[] = []
      for (const ag of live) {
        this.steps++
        if (this.advance(ag))
          keep.push(ag)
      }
      // children spawned during this round were pushed to this.agents
      this.agents = keep.concat(this.agents)
    }
    this.agents = []
  }

  /**
   * Fill pass: try to start new branches from random points along existing
   * ribbons, so the empty rooms left by the first growth get furnished.
   */
  sprout(tries: number) {
    const p = this.p
    const r = this.r
    const pool = this.ribbons.filter(rb => rb.level >= 0 && rb.level < p.maxLevel && rb.w * p.ratio >= p.wMin)
    if (!pool.length)
      return
    for (let k = 0; k < tries; k++) {
      const rb = pool[Math.floor(r() * pool.length)]
      const n = rb.xs.length
      const j = Math.floor(r() * (n - 1))
      const u = r()
      const x0 = rb.xs[j] + (rb.xs[j + 1] - rb.xs[j]) * u
      const y0 = rb.ys[j] + (rb.ys[j + 1] - rb.ys[j]) * u
      const a = rb.hs[j + 1]
      const wc = rb.w * p.ratio * range(r, 0.85, 1.1)
      const side = r() < 0.5 ? -1 : 1
      const th = p.angle(r)
      const off = Math.max(0, rb.w / 2 - (wc / 2) * Math.abs(Math.cos(th)) - 0.15 * wc)
      const grace = (rb.w / 2 - off + wc / 2 + 2.5 * p.gap) / Math.max(0.35, Math.sin(th)) + STEP * 2
      this.spawn(rb.id, rb.level + 1, x0 - Math.sin(a) * side * off, y0 + Math.cos(a) * side * off, a + side * th, wc, grace, grace + Math.max(3 * wc, 0.08))
    }
  }
}
