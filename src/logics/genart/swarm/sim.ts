// Boids for the "Swarm" series.
//
// Craig Reynolds' three local rules (separation, alignment, cohesion; "Flocks,
// Herds, and Schools: A Distributed Behavioral Model", SIGGRAPH 1987), plus a
// few steering behaviours from his "Steering Behaviors For Autonomous
// Characters" (GDC 1999): wander, obstacle avoidance, flee and pursuit.
//
// The simulation runs a fixed number of steps in world units (the canvas short
// side is 1) and only ever uses +, -, *, / and sqrt, which IEEE 754 rounds
// exactly: no sin, cos or exp whose last bit may differ between engines. A
// chaotic system amplifies such a bit, so this keeps a hash on one piece.
//
// Neighbours are found with a uniform grid rebuilt by counting sort at every
// step; the iteration order is fixed, so the run is reproducible.

import type { Rng } from '../random'

export interface Rock { x: number, y: number, r: number }
export interface Mill { x: number, y: number, r: number, spin: number }
/** A migration lane: boids of this group seek (tx, ty) and are released again at (sx, sy). */
export interface Lane { sx: number, sy: number, tx: number, ty: number, spread: number }

export interface SimConfig {
  /** World size: the short side is 1. */
  w: number
  h: number
  steps: number
  /** World units travelled per step at speed 1. */
  speed: number
  /** Neighbourhood and separation radii. */
  rNb: number
  rSep: number
  wSep: number
  wAli: number
  wCoh: number
  wWander: number
  /** Random-walk amplitude of each boid's wander direction. */
  jitter: number
  maxForce: number
  vMin: number
  vMax: number
  /** Torus wrap over the padded world (streams), or soft walls (arenas). */
  wrap: boolean
  pad: number
  wall: number
  /** Uniform stream (boid speed units) along (cx, cy), bent round the rocks. */
  current: number
  cx: number
  cy: number
  /** Pull of the boids' own heading towards the stream direction. */
  wDrift: number
  rocks: readonly Rock[]
  mills: readonly Mill[]
  wMill: number
  /** Pull back towards a band through (bx, by) along the stream: a river of boids. */
  wBand: number
  bx: number
  by: number
  /** One lane per group (empty: no lanes). */
  lanes: readonly Lane[]
  wLane: number
  rFear: number
  wFlee: number
  predatorSpeed: number
  /** Largest change of a predator's velocity per step: low values overshoot and loop. */
  predatorTurn: number
}

export interface Herd {
  x: Float64Array
  y: Float64Array
  vx: Float64Array
  vy: Float64Array
  group: Uint8Array
}

export interface Track {
  n: number
  steps: number
  /** Position of boid i at step t: xs[t * n + i]. */
  xs: Float32Array
  ys: Float32Array
  /** 1 where a boid was wrapped round: its trail restarts at that step. */
  brk: Uint8Array
}

/**
 * Ideal flow past a cylinder (a uniform stream plus a doublet per rock):
 * the classic potential-flow solution, superposed for several rocks. Returns
 * the stream velocity at (x, y) into out[0], out[1].
 */
function flowAt(cfg: SimConfig, x: number, y: number, out: Float64Array): void {
  const U = cfg.current
  const ux = cfg.cx
  const uy = cfg.cy
  let gx = U * ux
  let gy = U * uy
  for (const k of cfg.rocks) {
    const rx = x - k.x
    const ry = y - k.y
    // rock frame: the stream runs along +zx
    const zx = rx * ux + ry * uy
    const zy = -rx * uy + ry * ux
    const d2 = zx * zx + zy * zy
    const R2 = k.r * k.r
    if (d2 < R2) {
      gx -= U * ux
      gy -= U * uy
      continue
    }
    // u - iv = dW/dz = U (1 - R^2 / z^2), and R^2 / z^2 = R^2 (a - ib) / |z|^4
    // with z^2 = a + ib: the rock adds (-U R^2 a, -U R^2 b) / |z|^4
    const m = d2 * d2
    const a = zx * zx - zy * zy
    const b = 2 * zx * zy
    const pu = -U * R2 * a / m
    const pv = -U * R2 * b / m
    // back from the rock frame
    gx += pu * ux - pv * uy
    gy += pu * uy + pv * ux
  }
  out[0] = gx
  out[1] = gy
}

export function simulate(cfg: SimConfig, herd: Herd, predators: Herd, r: Rng): { boids: Track, hunters: Track } {
  const n = herd.x.length
  const np = predators.x.length
  const T = cfg.steps
  const x = herd.x.slice()
  const y = herd.y.slice()
  const vx = herd.vx.slice()
  const vy = herd.vy.slice()
  const nvx = new Float64Array(n)
  const nvy = new Float64Array(n)
  const wdx = new Float64Array(n)
  const wdy = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    wdx[i] = vx[i]
    wdy[i] = vy[i]
  }
  const px = predators.x.slice()
  const py = predators.y.slice()
  const pvx = predators.vx.slice()
  const pvy = predators.vy.slice()

  const boids: Track = { n, steps: T, xs: new Float32Array((T + 1) * n), ys: new Float32Array((T + 1) * n), brk: new Uint8Array((T + 1) * n) }
  const hunters: Track = { n: np, steps: T, xs: new Float32Array((T + 1) * np), ys: new Float32Array((T + 1) * np), brk: new Uint8Array((T + 1) * np) }
  const record = (t: number) => {
    for (let i = 0; i < n; i++) {
      boids.xs[t * n + i] = x[i]
      boids.ys[t * n + i] = y[i]
    }
    for (let i = 0; i < np; i++) {
      hunters.xs[t * np + i] = px[i]
      hunters.ys[t * np + i] = py[i]
    }
  }
  record(0)

  // grid over the padded world, one cell per neighbourhood radius
  const margin = cfg.pad + cfg.rNb
  const x0 = -margin
  const y0 = -margin
  const cell = cfg.rNb
  const gw = Math.ceil((cfg.w + 2 * margin) / cell)
  const gh = Math.ceil((cfg.h + 2 * margin) / cell)
  const start = new Int32Array(gw * gh + 1)
  const items = new Int32Array(n)
  const cellOf = new Int32Array(n)

  const rNb2 = cfg.rNb * cfg.rNb
  const rSep2 = cfg.rSep * cfg.rSep
  const rFear2 = cfg.rFear * cfg.rFear
  const maxF2 = cfg.maxForce * cfg.maxForce
  const flow = new Float64Array(2)
  const W = cfg.w
  const H = cfg.h
  const spanX = W + 2 * cfg.pad
  const spanY = H + 2 * cfg.pad
  // per-boid sums of the neighbour pass
  const SX = new Float64Array(n)
  const SY = new Float64Array(n)
  const AX = new Float64Array(n)
  const AY = new Float64Array(n)
  const MX = new Float64Array(n)
  const MY = new Float64Array(n)
  const CNT = new Int32Array(n)
  const rSep = cfg.rSep
  // each pair is met once: same cell, then the four "forward" neighbours
  const FWD = [1, 0, -1, 1, 0, 1, 1, 1]
  const pair = (i: number, j: number) => {
    const dx = x[i] - x[j]
    const dy = y[i] - y[j]
    const d2 = dx * dx + dy * dy
    if (d2 >= rNb2)
      return
    CNT[i]++
    CNT[j]++
    AX[i] += vx[j]
    AY[i] += vy[j]
    AX[j] += vx[i]
    AY[j] += vy[i]
    MX[i] -= dx
    MY[i] -= dy
    MX[j] += dx
    MY[j] += dy
    if (d2 < rSep2 && d2 > 1e-12) {
      const d = Math.sqrt(d2)
      const s = (1 - d / rSep) / d
      SX[i] += dx * s
      SY[i] += dy * s
      SX[j] -= dx * s
      SY[j] -= dy * s
    }
  }

  // one step per call: a function of its own is optimised whole by the JIT,
  // where one huge loop keeps falling back from on-stack replacement
  const step = (t: number) => {
    // Neighbours are gathered every other step: the sums of the previous
    // step stand in for the next one, which halves the cost of the run.
    if (t % 2 === 1) {
      // --- grid (counting sort) ------------------------------------------------
      start.fill(0)
      for (let i = 0; i < n; i++) {
        let cx = Math.floor((x[i] - x0) / cell)
        let cy = Math.floor((y[i] - y0) / cell)
        cx = Math.max(0, Math.min(gw - 1, cx))
        cy = Math.max(0, Math.min(gh - 1, cy))
        const c = cy * gw + cx
        cellOf[i] = c
        start[c + 1]++
      }
      for (let c = 0; c < gw * gh; c++)
        start[c + 1] += start[c]
      {
        const fillAt = start.slice(0, gw * gh)
        for (let i = 0; i < n; i++)
          items[fillAt[cellOf[i]]++] = i
      }

      // --- neighbours ----------------------------------------------------------
      SX.fill(0)
      SY.fill(0)
      AX.fill(0)
      AY.fill(0)
      MX.fill(0)
      MY.fill(0)
      CNT.fill(0)
      for (let cj = 0; cj < gh; cj++) {
        for (let ci = 0; ci < gw; ci++) {
          const c = cj * gw + ci
          const a0 = start[c]
          const a1 = start[c + 1]
          if (a0 === a1)
            continue
          for (let k = a0; k < a1; k++) {
            for (let l = k + 1; l < a1; l++)
              pair(items[k], items[l])
          }
          for (let q = 0; q < 8; q += 2) {
            const ii = ci + FWD[q]
            const jj = cj + FWD[q + 1]
            if (ii < 0 || ii >= gw || jj >= gh)
              continue
            const cc = jj * gw + ii
            const b0 = start[cc]
            const b1 = start[cc + 1]
            for (let k = a0; k < a1; k++) {
              for (let l = b0; l < b1; l++)
                pair(items[k], items[l])
            }
          }
        }
      }
    }

    // --- boids ---------------------------------------------------------------
    for (let i = 0; i < n; i++) {
      const xi = x[i]
      const yi = y[i]
      let fx = SX[i] * cfg.wSep
      let fy = SY[i] * cfg.wSep
      const cnt = CNT[i]
      if (cnt > 0) {
        fx += (AX[i] / cnt - vx[i]) * cfg.wAli + (MX[i] / cnt / cfg.rNb) * cfg.wCoh
        fy += (AY[i] / cnt - vy[i]) * cfg.wAli + (MY[i] / cnt / cfg.rNb) * cfg.wCoh
      }

      // wander: a slowly turning private heading
      {
        let wx = wdx[i] + (r() - 0.5) * cfg.jitter
        let wy = wdy[i] + (r() - 0.5) * cfg.jitter
        const wl = Math.sqrt(wx * wx + wy * wy) || 1
        wx /= wl
        wy /= wl
        wdx[i] = wx
        wdy[i] = wy
        fx += wx * cfg.wWander
        fy += wy * cfg.wWander
      }

      // stream: keep heading roughly downstream
      if (cfg.wDrift > 0) {
        fx += (cfg.cx - vx[i]) * cfg.wDrift
        fy += (cfg.cy - vy[i]) * cfg.wDrift
      }

      // band: only the offset across the stream is pulled back
      if (cfg.wBand > 0) {
        const off = (xi - cfg.bx) * -cfg.cy + (yi - cfg.by) * cfg.cx
        fx += cfg.cy * off * cfg.wBand
        fy -= cfg.cx * off * cfg.wBand
      }

      // groups heading their own way
      if (cfg.lanes.length) {
        const ln = cfg.lanes[herd.group[i]]
        const dx = ln.tx - xi
        const dy = ln.ty - yi
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-9
        fx += (dx / d - vx[i]) * cfg.wLane
        fy += (dy / d - vy[i]) * cfg.wLane
      }

      // mills: orbit the nearest centre on a preferred ring
      if (cfg.mills.length) {
        let best = 0
        let bd = Infinity
        for (let m = 0; m < cfg.mills.length; m++) {
          const dx = xi - cfg.mills[m].x
          const dy = yi - cfg.mills[m].y
          const d2 = dx * dx + dy * dy
          // distance relative to the ring, so a big mill does not swallow a small one
          const rel = d2 / (cfg.mills[m].r * cfg.mills[m].r)
          if (rel < bd) {
            bd = rel
            best = m
          }
        }
        const ml = cfg.mills[best]
        const dx = xi - ml.x
        const dy = yi - ml.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-9
        const nx = dx / d
        const ny = dy / d
        const k = (ml.r - d) / ml.r
        const ex = -ny * ml.spin + nx * k * 1.6
        const ey = nx * ml.spin + ny * k * 1.6
        fx += (ex - vx[i]) * cfg.wMill
        fy += (ey - vy[i]) * cfg.wMill
      }

      // rocks: steer off when close (the stream already bends round them)
      for (const k of cfg.rocks) {
        const dx = xi - k.x
        const dy = yi - k.y
        const reach = k.r + 0.05
        const d2 = dx * dx + dy * dy
        if (d2 < reach * reach) {
          const d = Math.sqrt(d2) || 1e-9
          const s = (reach - d) / 0.05
          fx += (dx / d) * s * 0.25
          fy += (dy / d) * s * 0.25
        }
      }

      // soft walls
      if (cfg.wall > 0) {
        const m = 0.1
        if (xi < m)
          fx += ((m - xi) / m) * cfg.wall
        else if (xi > W - m)
          fx -= ((xi - W + m) / m) * cfg.wall
        if (yi < m)
          fy += ((m - yi) / m) * cfg.wall
        else if (yi > H - m)
          fy -= ((yi - H + m) / m) * cfg.wall
      }

      let maxF2i = maxF2
      let vMax = cfg.vMax
      // flee: predators override the flock's manners
      for (let p = 0; p < np; p++) {
        const dx = xi - px[p]
        const dy = yi - py[p]
        const d2 = dx * dx + dy * dy
        if (d2 < rFear2) {
          const d = Math.sqrt(d2) || 1e-9
          const s = (1 - d / cfg.rFear) * cfg.wFlee / d
          fx += dx * s
          fy += dy * s
          maxF2i = maxF2 * 9
          vMax = cfg.vMax * 1.35
        }
      }

      const f2 = fx * fx + fy * fy
      if (f2 > maxF2i) {
        const s = Math.sqrt(maxF2i / f2)
        fx *= s
        fy *= s
      }
      let ux = vx[i] + fx
      let uy = vy[i] + fy
      const v = Math.sqrt(ux * ux + uy * uy) || 1e-9
      if (v > vMax) {
        ux *= vMax / v
        uy *= vMax / v
      }
      else if (v < cfg.vMin) {
        ux *= cfg.vMin / v
        uy *= cfg.vMin / v
      }
      nvx[i] = ux
      nvy[i] = uy
    }

    // --- predators -----------------------------------------------------------
    for (let p = 0; p < np; p++) {
      let bj = -1
      let bd = Infinity
      for (let j = 0; j < n; j++) {
        const dx = x[j] - px[p]
        const dy = y[j] - py[p]
        const d2 = dx * dx + dy * dy
        if (d2 < bd) {
          bd = d2
          bj = j
        }
      }
      let fx = 0
      let fy = 0
      if (bj >= 0) {
        // pursuit: aim a few steps ahead of the prey
        const tx = x[bj] + vx[bj] * cfg.speed * 6 - px[p]
        const ty = y[bj] + vy[bj] * cfg.speed * 6 - py[p]
        const d = Math.sqrt(tx * tx + ty * ty) || 1e-9
        fx = (tx / d * cfg.predatorSpeed - pvx[p]) * 0.08
        fy = (ty / d * cfg.predatorSpeed - pvy[p]) * 0.08
      }
      if (!cfg.wrap) {
        const m = 0.12
        if (px[p] < m)
          fx += ((m - px[p]) / m) * 0.12
        else if (px[p] > W - m)
          fx -= ((px[p] - W + m) / m) * 0.12
        if (py[p] < m)
          fy += ((m - py[p]) / m) * 0.12
        else if (py[p] > H - m)
          fy -= ((py[p] - H + m) / m) * 0.12
      }
      const f2 = fx * fx + fy * fy
      const pf = cfg.predatorTurn
      if (f2 > pf * pf) {
        const s = pf / Math.sqrt(f2)
        fx *= s
        fy *= s
      }
      let ux = pvx[p] + fx
      let uy = pvy[p] + fy
      const v = Math.sqrt(ux * ux + uy * uy) || 1e-9
      if (v > cfg.predatorSpeed) {
        ux *= cfg.predatorSpeed / v
        uy *= cfg.predatorSpeed / v
      }
      pvx[p] = ux
      pvy[p] = uy
      let qx = px[p] + ux * cfg.speed
      let qy = py[p] + uy * cfg.speed
      let wrapped = 0
      if (cfg.wrap) {
        if (qx < -cfg.pad || qx > W + cfg.pad) {
          qx += qx < 0 ? spanX : -spanX
          wrapped = 1
        }
        if (qy < -cfg.pad || qy > H + cfg.pad) {
          qy += qy < 0 ? spanY : -spanY
          wrapped = 1
        }
      }
      px[p] = qx
      py[p] = qy
      hunters.brk[t * np + p] = wrapped
    }

    // --- move ----------------------------------------------------------------
    for (let i = 0; i < n; i++) {
      vx[i] = nvx[i]
      vy[i] = nvy[i]
      let gx = vx[i]
      let gy = vy[i]
      if (cfg.current > 0) {
        flowAt(cfg, x[i], y[i], flow)
        gx += flow[0]
        gy += flow[1]
      }
      let xi = x[i] + gx * cfg.speed
      let yi = y[i] + gy * cfg.speed
      // never inside a rock
      for (const k of cfg.rocks) {
        const dx = xi - k.x
        const dy = yi - k.y
        const d2 = dx * dx + dy * dy
        if (d2 < k.r * k.r) {
          const d = Math.sqrt(d2) || 1e-9
          xi = k.x + dx / d * k.r
          yi = k.y + dy / d * k.r
        }
      }
      let wrapped = 0
      if (cfg.wrap) {
        if (xi < -cfg.pad) {
          xi += spanX
          wrapped = 1
        }
        else if (xi > W + cfg.pad) {
          xi -= spanX
          wrapped = 1
        }
        if (yi < -cfg.pad) {
          yi += spanY
          wrapped = 1
        }
        else if (yi > H + cfg.pad) {
          yi -= spanY
          wrapped = 1
        }
      }
      if (cfg.lanes.length) {
        // arrived, or lost: released again at the head of its lane
        const ln = cfg.lanes[herd.group[i]]
        const dx = ln.tx - xi
        const dy = ln.ty - yi
        const out = xi < -cfg.pad || yi < -cfg.pad || xi > W + cfg.pad || yi > H + cfg.pad
        if (out || dx * dx + dy * dy < 0.0036) {
          const lx = ln.tx - ln.sx
          const ly = ln.ty - ln.sy
          const l = Math.sqrt(lx * lx + ly * ly) || 1
          const s = (r() * 2 - 1) * ln.spread
          const back = r() * 0.04
          xi = ln.sx - (ly / l) * s - (lx / l) * back
          yi = ln.sy + (lx / l) * s - (ly / l) * back
          vx[i] = lx / l
          vy[i] = ly / l
          wrapped = 1
        }
      }
      x[i] = xi
      y[i] = yi
      boids.brk[t * n + i] = wrapped
    }
    for (let i = 0; i < n; i++) {
      boids.xs[t * n + i] = x[i]
      boids.ys[t * n + i] = y[i]
    }
    for (let i = 0; i < np; i++) {
      hunters.xs[t * np + i] = px[i]
      hunters.ys[t * np + i] = py[i]
    }
  }
  for (let t = 1; t <= T; t++)
    step(t)
  return { boids, hunters }
}
