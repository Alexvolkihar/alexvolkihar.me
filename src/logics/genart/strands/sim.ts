// Strand agents for the "Strands" series.
//
// Every agent walks with a fixed step, steers by its group's rule, records
// one point per step and dies as soon as it enters a cell of the occupancy
// grid that another trail already holds. Its own recent cells are ignored
// (the "own head" window), and a fresh branch ignores its parent's cells for
// a few steps (and the parent ignores the branch's first cells), so a fork
// does not kill itself at birth. A trail marks a 4-connected chain of cells,
// so no other agent can slip diagonally between two of its cells.
//
// The simulation works in units of the canvas short side and never sees a
// pixel: the same hash grows the same strands at any resolution.

import type { Rng } from '../random'

export type SteerKind = 'Sway' | 'Turn' | 'Curl' | 'Drift'

export interface Steering {
  kind: SteerKind
  /** Sway: heading amplitude (rad) and angular frequency (rad per unit of arc). */
  amp: number
  freq: number
  /** Turn / Curl: starting curvature (1 / radius). Sway: slow bend of the axis. */
  kappa: number
  /** Curl: growth of the curvature per unit of arc (exponential). */
  growth: number
  /** Drift: how fast the heading follows the field, per step. */
  rate: number
  /** Shared by the group, so its strands sway and turn together. */
  phase: number
  sign: number
}

export interface Seed {
  x: number
  y: number
  heading: number
  group: number
}

export interface GrowOptions {
  /** Domain size in short-side units, and the inset where agents stop. */
  aw: number
  ah: number
  margin: number
  /** When set, agents also stop outside this centred disc (radius in short sides). */
  disc: number
  /** Occupancy cell and step length. */
  cell: number
  step: number
  /** Branching probability per step, and the deepest generation. */
  branch: number
  maxGen: number
  /** Global budget of steps, and of agents. */
  maxSteps: number
  maxAgents: number
  /** Drift field: heading at a point. */
  field: (x: number, y: number) => number
}

export interface Strand {
  /** x, y, heading per point. */
  pts: Float32Array
  n: number
  group: number
  gen: number
}

interface Agent {
  id: number
  parent: number
  group: number
  gen: number
  x: number
  y: number
  h: number
  /** Sway axis, phase and Turn / Curl sign and current curvature. */
  base: number
  phase: number
  sign: number
  k: number
  age: number
  s: number
  cx: number
  cy: number
  alive: boolean
  pts: number[]
}

/** Own-head window in steps, and the grace given to a fresh fork. */
const OWN = 8
const GRACE = 12
const TAU = Math.PI * 2

function wrap(a: number) {
  a %= TAU
  if (a > Math.PI)
    a -= TAU
  else if (a < -Math.PI)
    a += TAU
  return a
}

export function grow(seeds: readonly Seed[], groups: readonly Steering[], o: GrowOptions, r: Rng): Strand[] {
  const nx = Math.ceil(o.aw / o.cell) + 1
  const ny = Math.ceil(o.ah / o.cell) + 1
  const owner = new Int32Array(nx * ny).fill(-1)
  const stamp = new Int32Array(nx * ny)
  const parentOf: number[] = []
  const agents: Agent[] = []
  const x0 = o.margin
  const y0 = o.margin
  const x1 = o.aw - o.margin
  const y1 = o.ah - o.margin
  const dcx = o.aw / 2
  const dcy = o.ah / 2
  const dr2 = o.disc > 0 ? o.disc * o.disc : Infinity
  const inside = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1 && (x - dcx) * (x - dcx) + (y - dcy) * (y - dcy) < dr2
  const kmax = 1 / (2.4 * o.cell)

  function spawn(x: number, y: number, h: number, group: number, gen: number, parent: number, rr: Rng) {
    if (agents.length >= o.maxAgents)
      return
    const st = groups[group]
    const a: Agent = {
      id: agents.length,
      parent,
      group,
      gen,
      x,
      y,
      h,
      base: h,
      phase: st.phase + (rr() - 0.5) * 0.5,
      sign: rr() < 0.12 ? -st.sign : st.sign,
      k: st.kappa * (0.85 + 0.3 * rr()),
      age: 0,
      s: 0,
      cx: Math.floor(x / o.cell),
      cy: Math.floor(y / o.cell),
      alive: true,
      pts: [x, y, h],
    }
    if (st.kind === 'Sway')
      a.h = a.base + st.amp * Math.sin(a.phase)
    parentOf.push(parent)
    agents.push(a)
    // a seed claims its cell; a fork shares its parent's
    const c = a.cy * nx + a.cx
    if (parent < 0 && owner[c] < 0) {
      owner[c] = a.id
      stamp[c] = 0
    }
  }

  for (const s of seeds) {
    if (inside(s.x, s.y))
      spawn(s.x, s.y, s.heading, s.group, 0, -1, r)
  }

  // A blocked cell: someone else's trail, or our own trail older than the head.
  function blocked(a: Agent, c: number) {
    const w = owner[c]
    if (w < 0)
      return false
    if (w === a.id)
      return a.age - stamp[c] > OWN
    if (w === a.parent && a.age < GRACE)
      return false
    if (parentOf[w] === a.id && stamp[c] < GRACE)
      return false
    return true
  }

  function claim(a: Agent, c: number) {
    owner[c] = a.id
    stamp[c] = a.age
  }

  let steps = 0
  const live = agents.slice()
  const d = o.step
  while (live.length && steps < o.maxSteps) {
    for (let i = 0; i < live.length; i++) {
      const a = live[i]
      if (!a.alive)
        continue
      const st = groups[a.group]
      a.age++
      a.s += d
      switch (st.kind) {
        case 'Sway':
          a.base += st.kappa * a.sign * d
          a.h = a.base + st.amp * Math.sin(st.freq * a.s + a.phase)
          break
        case 'Turn':
          a.h += a.sign * a.k * d
          break
        case 'Curl':
          a.h += a.sign * a.k * d
          a.k = Math.min(kmax, a.k * (1 + st.growth * d))
          break
        case 'Drift':
          a.h += wrap(o.field(a.x, a.y) - a.h) * st.rate + a.sign * a.k * d
          break
      }
      const px = a.x
      const py = a.y
      const x = px + Math.cos(a.h) * d
      const y = py + Math.sin(a.h) * d
      steps++
      if (!inside(x, y)) {
        a.alive = false
        continue
      }
      a.x = x
      a.y = y
      a.pts.push(x, y, a.h)
      const cx = Math.floor(x / o.cell)
      const cy = Math.floor(y / o.cell)
      if (cx !== a.cx || cy !== a.cy) {
        if (cx !== a.cx && cy !== a.cy) {
          // diagonal move: pass through the cell the segment actually crosses
          const bx = (cx > a.cx ? cx : a.cx) * o.cell
          const by = (cy > a.cy ? cy : a.cy) * o.cell
          const tx = (bx - px) / (x - px)
          const ty = (by - py) / (y - py)
          const mid = tx < ty ? a.cy * nx + cx : cy * nx + a.cx
          if (blocked(a, mid)) {
            a.alive = false
            continue
          }
          claim(a, mid)
        }
        const c = cy * nx + cx
        a.cx = cx
        a.cy = cy
        if (blocked(a, c)) {
          a.alive = false
          continue
        }
        claim(a, c)
      }
      // branching: one draw per step, more only when a fork is born
      if (a.gen < o.maxGen && r() < o.branch) {
        const side = r() < 0.5 ? -1 : 1
        const ang = 0.35 + r() * 0.9
        spawn(a.x, a.y, a.h + side * ang, a.group, a.gen + 1, a.id, r)
        const ch = agents[agents.length - 1]
        if (ch && ch.parent === a.id && ch.age === 0) {
          // a fork curls the other way, starts loose and sways in step with its parent
          ch.sign = -a.sign
          ch.base = a.base + side * ang
          ch.phase = a.phase
          ch.s = a.s
          ch.h = a.h + side * ang
          live.push(ch)
        }
      }
    }
    let k = 0
    for (let i = 0; i < live.length; i++) {
      if (live[i].alive)
        live[k++] = live[i]
    }
    live.length = k
  }

  return agents.map(a => ({ pts: Float32Array.from(a.pts), n: a.pts.length / 3, group: a.group, gen: a.gen }))
}

/** Value noise on a shuffled lattice (no trigonometry in the randomness). */
export function makeNoise(r: Rng) {
  const P = 256
  const perm = new Uint8Array(P * 2)
  const val = new Float32Array(P)
  const idx = Array.from({ length: P }, (_, i) => i)
  for (let i = P - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const t = idx[i]
    idx[i] = idx[j]
    idx[j] = t
  }
  for (let i = 0; i < P * 2; i++)
    perm[i] = idx[i & 255]
  for (let i = 0; i < P; i++)
    val[i] = r()
  const fade = (t: number) => t * t * (3 - 2 * t)
  const v = (a: number, b: number) => val[perm[perm[a & 255] + (b & 255)]]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const w = fade(y - yi)
    const a = v(xi, yi) + u * (v(xi + 1, yi) - v(xi, yi))
    const b = v(xi, yi + 1) + u * (v(xi + 1, yi + 1) - v(xi, yi + 1))
    return a + w * (b - a)
  }
}
