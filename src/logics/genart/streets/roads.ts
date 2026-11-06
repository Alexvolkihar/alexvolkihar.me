// Hyperstreamline tracing for street networks (Chen et al. 2008, §5).
//
// Roads come in tiers (arterial, major, minor), each traced along both
// eigenvector fields of the tensor field with its own separation distance.
// A streamline grows from a seed with RK4 steps in both directions and stops
// at the edge, at water (major roads may bridge a narrow stretch), at a park,
// outside the built-up area, or when it comes closer than `dtest` to a road
// of the same direction. Seeds are taken along the roads already traced (so
// the next road starts on a crossing), then at random. A dangling end looks
// ahead for a nearby road and joins it, which closes the blocks.

import type { Rng } from '../random'
import type { TensorField } from './field'

export interface Road {
  xs: number[]
  ys: number[]
  tier: number
  /** 0: major eigenvector, 1: minor eigenvector. */
  dir: number
  /** Segment i (from point i to i + 1) is a bridge. */
  bridge: Uint8Array
  closed: boolean
}

export interface Env {
  x0: number
  y0: number
  x1: number
  y1: number
  field: TensorField
  water: (x: number, y: number) => boolean
  blocked: (x: number, y: number, tier: number) => boolean
  urban: (x: number, y: number) => number
}

export interface TierSpec {
  dsep: number
  dtest: number
  step: number
  maxLen: number
  minLen: number
  lookahead: number
  /** Longest bridge, 0 for none. */
  bridgeMax: number
  /** Roads of this tier stop where urban() falls below this. */
  urbanMin: number
  /** Cap on streamlines for this tier. */
  maxRoads: number
}

/** Uniform bucket grid of points. */
class PointGrid {
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly buckets: number[][]

  constructor(env: Env, cell: number) {
    this.cell = cell
    this.x0 = env.x0
    this.y0 = env.y0
    this.cols = Math.ceil((env.x1 - env.x0) / cell) + 1
    this.rows = Math.ceil((env.y1 - env.y0) / cell) + 1
    this.buckets = Array.from({ length: this.cols * this.rows }, () => [])
  }

  add(x: number, y: number) {
    const i = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)))
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)))
    this.buckets[j * this.cols + i].push(x, y)
  }

  /** Any point closer than r (r <= cell)? */
  near(x: number, y: number, r: number): boolean {
    const ci = Math.floor((x - this.x0) / this.cell)
    const cj = Math.floor((y - this.y0) / this.cell)
    const r2 = r * r
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (j < 0 || j >= this.rows)
        continue
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || i >= this.cols)
          continue
        const b = this.buckets[j * this.cols + i]
        for (let k = 0; k < b.length; k += 2) {
          const dx = b[k] - x
          const dy = b[k + 1] - y
          if (dx * dx + dy * dy < r2)
            return true
        }
      }
    }
    return false
  }

  /** Nearest point within r ahead of (x, y) along (vx, vy), or -1. */
  ahead(x: number, y: number, vx: number, vy: number, r: number, out: number[]): boolean {
    const ci = Math.floor((x - this.x0) / this.cell)
    const cj = Math.floor((y - this.y0) / this.cell)
    let best = r * r
    let found = false
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (j < 0 || j >= this.rows)
        continue
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || i >= this.cols)
          continue
        const b = this.buckets[j * this.cols + i]
        for (let k = 0; k < b.length; k += 2) {
          const dx = b[k] - x
          const dy = b[k + 1] - y
          const d2 = dx * dx + dy * dy
          if (d2 >= best || d2 < 1e-12)
            continue
          // within about 50 degrees of the heading
          if (dx * vx + dy * vy < 0.64 * Math.sqrt(d2))
            continue
          best = d2
          out[0] = b[k]
          out[1] = b[k + 1]
          found = true
        }
      }
    }
    return found
  }
}

/**
 * Points of the streamline being traced, so that it does not run alongside
 * itself (a spiral). Entries: x, y, streamline id, half (0 forward, 1
 * backward), index along the half.
 */
class SelfGrid {
  readonly cell: number
  readonly cols: number
  readonly rows: number
  readonly x0: number
  readonly y0: number
  readonly buckets: number[][]

  constructor(env: Env, cell: number) {
    this.cell = cell
    this.x0 = env.x0
    this.y0 = env.y0
    this.cols = Math.ceil((env.x1 - env.x0) / cell) + 1
    this.rows = Math.ceil((env.y1 - env.y0) / cell) + 1
    this.buckets = Array.from({ length: this.cols * this.rows }, () => [])
  }

  add(x: number, y: number, id: number, half: number, idx: number) {
    const i = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.x0) / this.cell)))
    const j = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.y0) / this.cell)))
    this.buckets[j * this.cols + i].push(x, y, id, half, idx)
  }

  /** A point of streamline `id` closer than r, ignoring the other half's first `skip` points. */
  near(x: number, y: number, r: number, id: number, half: number, skip: number): boolean {
    const ci = Math.floor((x - this.x0) / this.cell)
    const cj = Math.floor((y - this.y0) / this.cell)
    const r2 = r * r
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (j < 0 || j >= this.rows)
        continue
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || i >= this.cols)
          continue
        const b = this.buckets[j * this.cols + i]
        for (let k = 0; k < b.length; k += 5) {
          if (b[k + 2] !== id || (b[k + 3] !== half && b[k + 4] < skip))
            continue
          const dx = b[k] - x
          const dy = b[k + 1] - y
          if (dx * dx + dy * dy < r2)
            return true
        }
      }
    }
    return false
  }
}

interface Half {
  xs: number[]
  ys: number[]
  br: number[]
  /** The trace left the domain. */
  edge: boolean
  closed: boolean
}

/** Trace one tier of roads, appending them to `roads`. */
export function traceTier(env: Env, roads: Road[], spec: TierSpec, tier: number, rng: Rng, seeds: readonly number[]) {
  const F = env.field
  const sep = [new PointGrid(env, spec.dsep), new PointGrid(env, spec.dsep)]
  const all = new PointGrid(env, spec.lookahead)
  const failed = new PointGrid(env, spec.dsep)
  const self = new SelfGrid(env, spec.dsep)
  // A point joins the self grid this many steps after it is traced.
  const lag = Math.ceil(spec.dtest * 1.6 / spec.step) + 1
  let sid = 0
  const queue: number[][] = [[], []]
  const qHead = [0, 0]
  const h = spec.step

  const inside = (x: number, y: number) => x > env.x0 && x < env.x1 && y > env.y0 && y < env.y1

  function register(r: Road) {
    const g = sep[r.dir]
    for (let i = 0; i < r.xs.length; i++) {
      g.add(r.xs[i], r.ys[i])
      all.add(r.xs[i], r.ys[i])
    }
  }

  // Seeds along a road every dsep, queued for the other direction (and, for
  // roads of a higher tier, for both).
  function seedAlong(r: Road, both: boolean) {
    let acc = spec.dsep * 0.5
    for (let i = 1; i < r.xs.length; i++) {
      acc += Math.hypot(r.xs[i] - r.xs[i - 1], r.ys[i] - r.ys[i - 1])
      if (acc >= spec.dsep) {
        acc = 0
        queue[1 - r.dir].push(r.xs[i], r.ys[i])
        if (both)
          queue[r.dir].push(r.xs[i], r.ys[i])
      }
    }
  }

  for (const r of roads) {
    register(r)
    seedAlong(r, true)
  }
  for (let i = 0; i < seeds.length; i += 2) {
    queue[0].push(seeds[i], seeds[i + 1])
    queue[1].push(seeds[i], seeds[i + 1])
  }

  const validSeed = (x: number, y: number, dir: number) =>
    inside(x, y) && !env.water(x, y) && !env.blocked(x, y, tier)
    && env.urban(x, y) >= spec.urbanMin && !sep[dir].near(x, y, spec.dsep)
    && !failed.near(x, y, spec.dsep * 0.5)

  function nextSeed(dir: number, out: number[]): boolean {
    const q = queue[dir]
    while (qHead[dir] < q.length) {
      const x = q[qHead[dir]]
      const y = q[qHead[dir] + 1]
      qHead[dir] += 2
      if (validSeed(x, y, dir)) {
        out[0] = x
        out[1] = y
        return true
      }
    }
    for (let k = 0; k < 24; k++) {
      const x = env.x0 + rng() * (env.x1 - env.x0)
      const y = env.y0 + rng() * (env.y1 - env.y0)
      if (validSeed(x, y, dir)) {
        out[0] = x
        out[1] = y
        return true
      }
    }
    return false
  }

  const minor = (dir: number) => dir === 1
  // Direction at (x, y) aligned with (vx, vy); false when degenerate.
  let ddx = 0
  let ddy = 0
  function aligned(x: number, y: number, dir: number, vx: number, vy: number): boolean {
    if (!F.dir(x, y, minor(dir)))
      return false
    ddx = F.dx
    ddy = F.dy
    if (ddx * vx + ddy * vy < 0) {
      ddx = -ddx
      ddy = -ddy
    }
    return true
  }

  function half(sx: number, sy: number, dir: number, sign: number): Half {
    const hf = sign > 0 ? 0 : 1
    const res: Half = { xs: [sx], ys: [sy], br: [], edge: false, closed: false }
    if (!F.dir(sx, sy, minor(dir)))
      return res
    let vx = F.dx * sign
    let vy = F.dy * sign
    let x = sx
    let y = sy
    let len = 0
    const maxSteps = Math.ceil(spec.maxLen / h)
    // Cumulative turning, to stop tight curls around degenerate points.
    const turn = [0]
    const win = Math.max(3, Math.ceil(spec.dsep * 0.8 / h))
    for (let s = 0; s < maxSteps; s++) {
      // RK4 on the sign-aligned eigenvector field
      if (!aligned(x, y, dir, vx, vy))
        break
      const k1x = ddx
      const k1y = ddy
      if (!aligned(x + k1x * h / 2, y + k1y * h / 2, dir, k1x, k1y))
        break
      const k2x = ddx
      const k2y = ddy
      if (!aligned(x + k2x * h / 2, y + k2y * h / 2, dir, k2x, k2y))
        break
      const k3x = ddx
      const k3y = ddy
      if (!aligned(x + k3x * h, y + k3y * h, dir, k3x, k3y))
        break
      let mx = (k1x + 2 * k2x + 2 * k3x + ddx) / 6
      let my = (k1y + 2 * k2y + 2 * k3y + ddy) / 6
      const ml = Math.hypot(mx, my)
      if (ml < 1e-6)
        break
      mx /= ml
      my /= ml
      const tn = turn[turn.length - 1] + Math.abs(Math.atan2(vx * my - vy * mx, vx * mx + vy * my))
      turn.push(tn)
      if (turn.length > win && tn - turn[turn.length - 1 - win] > 2.2)
        break
      const nx = x + mx * h
      const ny = y + my * h
      if (!inside(nx, ny)) {
        res.xs.push(nx)
        res.ys.push(ny)
        res.br.push(0)
        res.edge = true
        break
      }
      if (env.water(nx, ny)) {
        // Bridge: march straight ahead to the far bank.
        let landed = false
        if (spec.bridgeMax > 0) {
          for (let d = h * 2; d <= spec.bridgeMax; d += h) {
            const bx = x + mx * d
            const by = y + my * d
            if (!inside(bx, by) || env.blocked(bx, by, tier))
              break
            if (!env.water(bx, by)) {
              const ex = bx + mx * h * 2
              const ey = by + my * h * 2
              if (!env.water(ex, ey) && !env.blocked(ex, ey, tier) && !sep[dir].near(ex, ey, spec.dtest)) {
                res.xs.push(ex)
                res.ys.push(ey)
                res.br.push(1)
                len += d + h * 2
                x = ex
                y = ey
                vx = mx
                vy = my
                landed = true
              }
              break
            }
          }
        }
        if (landed)
          continue
        break
      }
      if (env.blocked(nx, ny, tier) || env.urban(nx, ny) < spec.urbanMin)
        break
      len += h
      if (hf === 0 && len > spec.dsep * 3 && (nx - sx) ** 2 + (ny - sy) ** 2 < (spec.dtest * 1.2) ** 2) {
        res.xs.push(sx)
        res.ys.push(sy)
        res.br.push(0)
        res.closed = true
        break
      }
      if (sep[dir].near(nx, ny, spec.dtest) || self.near(nx, ny, spec.dtest, sid, hf, lag))
        break
      res.xs.push(nx)
      res.ys.push(ny)
      res.br.push(0)
      const n = res.xs.length - 1 - lag
      if (n >= 0)
        self.add(res.xs[n], res.ys[n], sid, hf, n)
      x = nx
      y = ny
      vx = mx
      vy = my
    }
    // the rest of the forward half guards the backward one
    if (hf === 0) {
      for (let i = Math.max(0, res.xs.length - lag); i < res.xs.length; i++)
        self.add(res.xs[i], res.ys[i], sid, hf, i)
    }
    return res
  }

  const tmp = [0, 0]
  // Extend a dangling end (last point of xs/ys) to a road just ahead.
  function join(xs: number[], ys: number[], br: number[]) {
    const n = xs.length
    if (n < 2)
      return
    const x = xs[n - 1]
    const y = ys[n - 1]
    let vx = x - xs[n - 2]
    let vy = y - ys[n - 2]
    const l = Math.hypot(vx, vy)
    if (l < 1e-9)
      return
    vx /= l
    vy /= l
    if (!all.ahead(x, y, vx, vy, spec.lookahead, tmp))
      return
    const mx = (x + tmp[0]) / 2
    const my = (y + tmp[1]) / 2
    if (env.water(mx, my) || env.blocked(mx, my, tier))
      return
    xs.push(tmp[0])
    ys.push(tmp[1])
    br.push(0)
  }

  function trace(sx: number, sy: number, dir: number): Road | null {
    sid++
    const f = half(sx, sy, dir, 1)
    let xs: number[]
    let ys: number[]
    let br: number[]
    let closed = false
    if (f.closed) {
      xs = f.xs
      ys = f.ys
      br = f.br
      closed = true
    }
    else {
      const b = half(sx, sy, dir, -1)
      xs = b.xs.slice().reverse()
      ys = b.ys.slice().reverse()
      br = b.br.slice().reverse()
      for (let i = 1; i < f.xs.length; i++) {
        xs.push(f.xs[i])
        ys.push(f.ys[i])
        br.push(f.br[i - 1])
      }
      let len = 0
      for (let i = 1; i < xs.length; i++)
        len += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
      if (len < spec.minLen)
        return null
      if (!f.edge)
        join(xs, ys, br)
      if (!b.edge) {
        xs.reverse()
        ys.reverse()
        br.reverse()
        join(xs, ys, br)
      }
    }
    if (xs.length < 2)
      return null
    return { xs, ys, tier, dir, bridge: Uint8Array.from(br), closed }
  }

  const s = [0, 0]
  let dir = 0
  let misses = 0
  let made = 0
  for (let guard = 0; guard < spec.maxRoads * 4 && made < spec.maxRoads && misses < 2; guard++) {
    if (!nextSeed(dir, s)) {
      misses++
      dir = 1 - dir
      continue
    }
    misses = 0
    const r = trace(s[0], s[1], dir)
    if (r) {
      roads.push(r)
      register(r)
      seedAlong(r, false)
      made++
    }
    else {
      // remember the failed spot so it is not retried forever
      failed.add(s[0], s[1])
    }
    dir = 1 - dir
  }
}
