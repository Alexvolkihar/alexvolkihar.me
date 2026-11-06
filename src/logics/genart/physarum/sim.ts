// Physarum transport networks: Jeff Jones's multi-agent model (Jones 2010,
// "Characteristics of pattern formation and evolution in approximations of
// Physarum transport networks", Artificial Life 16(2)).
//
// Each agent carries three forward sensors (left, front, right, SA apart, SO
// cells ahead). Every step it turns towards the strongest trail it senses (by
// RA), moves SS cells and deposits trail where it lands. The trail map then
// diffuses (3x3 mean) and decays. Sensor angle, rotation angle and sensor
// offset choose the regime: spots, labyrinths, fine lace or coarse veins.
//
// Bit-exact on purpose: headings are integers on a 256-step compass, and the
// compass table is built from a Taylor series using only + - * /, which IEEE
// 754 rounds exactly. The loop never calls Math.sin, Math.cos or Math.exp, so
// every engine walks the agents along exactly the same paths.

import type { Rng } from '../random'

export const DIRS = 256
const MASK = DIRS - 1

/** sin x on [0, pi/2] by its Taylor series (+ - * / only, so bit-exact). */
function taylorSin(x: number): number {
  const x2 = x * x
  let term = x
  let sum = x
  for (let n = 1; n <= 12; n++) {
    term = -term * x2 / ((2 * n) * (2 * n + 1))
    sum += term
  }
  return sum
}

function compass(): { cos: Float64Array, sin: Float64Array } {
  const q = DIRS / 4
  const s = new Float64Array(q + 1)
  for (let k = 0; k <= q; k++)
    s[k] = taylorSin((Math.PI / 2) * (k / q))
  s[0] = 0
  s[q] = 1
  const cos = new Float64Array(DIRS)
  const sin = new Float64Array(DIRS)
  for (let k = 0; k < DIRS; k++) {
    const quad = k >> 6
    const j = k & (q - 1)
    let sv: number
    let cv: number
    if (quad === 0) {
      sv = s[j]
      cv = s[q - j]
    }
    else if (quad === 1) {
      sv = s[q - j]
      cv = -s[j]
    }
    else if (quad === 2) {
      sv = -s[j]
      cv = -s[q - j]
    }
    else {
      sv = -s[q - j]
      cv = s[j]
    }
    cos[k] = cv
    sin[k] = sv
  }
  return { cos, sin }
}

const TABLE = compass()
export const COS = TABLE.cos
export const SIN = TABLE.sin

export interface SimConfig {
  /** Trail grid size, in cells. */
  gw: number
  gh: number
  steps: number
  /** Sensor angle and rotation angle, in compass steps (256 = full turn). */
  sa: number
  ra: number
  /** Sensor offset and step size, in cells. */
  so: number
  ss: number
  deposit: number
  /** Trail kept per step after diffusion (1 - decay). */
  keep: number
  /** Trail fed into each cell every step (food sources), or null. */
  feed: Float64Array | null
  /** 1 where agents may go (0 on stones and outside a dish). */
  mask: Uint8Array
  /** Toroidal world: what leaves one edge comes back on the opposite one. */
  wrap: boolean
  /** Display buffer scale (cells per trail cell) and when it starts recording. */
  dk: number
  recordFrom: number
}

export interface Agents {
  x: Float64Array
  y: Float64Array
  h: Uint8Array
}

export interface SimResult {
  trail: Float64Array
  /** Agent visits on a dk-times finer grid, over the last steps. */
  visits: Float64Array
  dw: number
  dh: number
}

/** Everything one step needs, in one monomorphic object. */
interface State {
  gw: number
  gh: number
  sa: number
  ra: number
  ss: number
  deposit: number
  wrap: boolean
  ax: Float64Array
  ay: Float64Array
  ah: Uint8Array
  /** Sensor offsets per heading, shifted by one grid size (see below). */
  ox: Float64Array
  oy: Float64Array
  /** Trail as the sensors read it: -1 on walls. */
  field: Float64Array
  mask: Uint8Array
  /** One agent per cell at most (Jones's exclusion rule). */
  occ: Uint8Array
  trail: Float64Array
  visits: Float64Array
  dk: number
  dw: number
}

// Sensor coordinates are shifted by one grid size before truncating, so `| 0`
// floors them: they never go below -so, and so is smaller than the grid. A
// dish keeps a margin wider than so between its wall and the grid edge, so its
// sensors never leave the grid either.
function moveAgents(s: State, r: Rng, record: boolean): void {
  const { gw, gh, sa, ra, ss, deposit, wrap, ax, ay, ah, ox, oy, field, mask, occ, trail, visits, dk, dw } = s
  const n = ax.length
  for (let i = 0; i < n; i++) {
    const x = ax[i]
    const y = ay[i]
    let h = ah[i]
    // sensory stage: front, left, right
    const hl = (h - sa) & MASK
    const hr = (h + sa) & MASK
    let fx = (x + ox[h]) | 0
    let fy = (y + oy[h]) | 0
    let lx = (x + ox[hl]) | 0
    let ly = (y + oy[hl]) | 0
    let rx = (x + ox[hr]) | 0
    let ry = (y + oy[hr]) | 0
    fx -= gw
    fy -= gh
    lx -= gw
    ly -= gh
    rx -= gw
    ry -= gh
    if (wrap) {
      if (fx < 0)
        fx += gw
      else if (fx >= gw)
        fx -= gw
      if (fy < 0)
        fy += gh
      else if (fy >= gh)
        fy -= gh
      if (lx < 0)
        lx += gw
      else if (lx >= gw)
        lx -= gw
      if (ly < 0)
        ly += gh
      else if (ly >= gh)
        ly -= gh
      if (rx < 0)
        rx += gw
      else if (rx >= gw)
        rx -= gw
      if (ry < 0)
        ry += gh
      else if (ry >= gh)
        ry -= gh
    }
    const F = field[fy * gw + fx]
    const L = field[ly * gw + lx]
    const R = field[ry * gw + rx]
    if (F > L && F > R) {
      // keep going
    }
    else if (F < L && F < R) {
      if (r() < 0.5)
        h = (h - ra) & MASK
      else
        h = (h + ra) & MASK
    }
    else if (L < R) {
      h = (h + ra) & MASK
    }
    else if (R < L) {
      h = (h - ra) & MASK
    }
    // motor stage
    let nx = x + COS[h] * ss
    let ny = y + SIN[h] * ss
    if (wrap) {
      // (x + gw can round up to gw itself for a tiny negative x)
      if (nx < 0)
        nx = Math.min(nx + gw, gw - 1e-9)
      else if (nx >= gw)
        nx -= gw
      if (ny < 0)
        ny = Math.min(ny + gh, gh - 1e-9)
      else if (ny >= gh)
        ny -= gh
    }
    const to = (ny | 0) * gw + (nx | 0)
    if (!mask[to] || (occ[to] && to !== (y | 0) * gw + (x | 0))) {
      // blocked by the wall or by another agent: stay, turn at random
      ah[i] = Math.floor(r() * DIRS) & MASK
      continue
    }
    occ[(y | 0) * gw + (x | 0)] = 0
    occ[to] = 1
    ax[i] = nx
    ay[i] = ny
    ah[i] = h
    trail[to] += deposit
    if (record)
      visits[((ny * dk) | 0) * dw + ((nx * dk) | 0)] += 1
  }
}

/** 3x3 mean (separable), times keep. Wraps, or clamps at the grid edge. */
function diffuse(src: Float64Array, dst: Float64Array, row: Float64Array, gw: number, gh: number, keep: number, wrap: boolean): void {
  for (let y = 0; y < gh; y++) {
    const o = y * gw
    let l = wrap ? src[o + gw - 1] : src[o]
    let c = src[o]
    for (let x = 0; x < gw; x++) {
      let rr: number
      if (x + 1 < gw)
        rr = src[o + x + 1]
      else
        rr = wrap ? src[o] : c
      row[o + x] = l + c + rr
      l = c
      c = rr
    }
  }
  const f = keep / 9
  for (let y = 0; y < gh; y++) {
    let yu = y - 1
    let yd = y + 1
    if (yu < 0)
      yu = wrap ? gh - 1 : 0
    if (yd >= gh)
      yd = wrap ? 0 : gh - 1
    const o = y * gw
    const ou = yu * gw
    const od = yd * gw
    for (let x = 0; x < gw; x++)
      dst[o + x] = (row[ou + x] + row[o + x] + row[od + x]) * f
  }
}

export function simulate(cfg: SimConfig, a: Agents, r: Rng): SimResult {
  const { gw, gh, so, keep, dk } = cfg
  const N = gw * gh
  const { wrap, mask } = cfg
  const dw = gw * dk
  const dh = gh * dk
  const ox = new Float64Array(DIRS)
  const oy = new Float64Array(DIRS)
  for (let d = 0; d < DIRS; d++) {
    ox[d] = COS[d] * so + gw
    oy[d] = SIN[d] * so + gh
  }
  const s: State = {
    gw,
    gh,
    sa: cfg.sa,
    ra: cfg.ra,
    ss: cfg.ss,
    deposit: cfg.deposit,
    wrap,
    ax: a.x,
    ay: a.y,
    ah: a.h,
    ox,
    oy,
    field: new Float64Array(N),
    mask,
    occ: new Uint8Array(N),
    trail: new Float64Array(N),
    visits: new Float64Array(dw * dh),
    dk,
    dw,
  }
  for (let i = 0; i < a.x.length; i++)
    s.occ[(a.y[i] | 0) * gw + (a.x[i] | 0)] = 1
  let spare: Float64Array = new Float64Array(N)
  const row = new Float64Array(N)

  // wall cells and fed cells (food), as sparse lists
  const wallCells: number[] = []
  for (let k = 0; k < N; k++) {
    if (!mask[k])
      wallCells.push(k)
  }
  const walls = Int32Array.from(wallCells)
  const fedCells: number[] = []
  if (cfg.feed) {
    for (let k = 0; k < N; k++) {
      if (cfg.feed[k] > 0 && mask[k])
        fedCells.push(k)
    }
  }
  const fed = Int32Array.from(fedCells)
  const amount = Float64Array.from(fedCells, k => cfg.feed![k])

  for (let t = 0; t < cfg.steps; t++) {
    const tr = s.trail
    for (let k = 0; k < fed.length; k++)
      tr[fed[k]] += amount[k]
    const field = s.field
    field.set(tr)
    for (let k = 0; k < walls.length; k++)
      field[walls[k]] = -1
    moveAgents(s, r, t >= cfg.recordFrom)
    diffuse(tr, spare, row, gw, gh, keep, wrap)
    for (let k = 0; k < walls.length; k++)
      spare[walls[k]] = 0
    s.trail = spare
    spare = tr
  }
  return { trail: s.trail, visits: s.visits, dw, dh }
}
