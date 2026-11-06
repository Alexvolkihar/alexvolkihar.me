// Particle-based hydraulic erosion, after Hans Theobald Beyer, "Implementation
// of a method for hydraulic erosion" (bachelor's thesis, TU München, 2015) and
// Sebastian Lague's write-up and code ("Coding Adventure: Hydraulic Erosion",
// 2019, https://github.com/SebLague/Hydraulic-Erosion, MIT).
//
// Each raindrop starts somewhere on the map with some water and no sediment.
// At every step it reads the bilinear height and gradient under it, turns
// downhill (keeping a little inertia), moves one cell and compares its old and
// new heights. A fast, full drop going down a steep slope can carry a lot: it
// erodes the ground around it with a small radial brush. A drop that slows
// down, climbs, or carries more than it can hold deposits on the four corners
// of its cell. Water evaporates as it goes. Here a drop that reaches the sea
// drops its whole load at the shore, building deltas.
//
// The code is original, written from those descriptions. One deliberate
// difference with Lague's code: speed grows when the drop goes downhill
// (v' = sqrt(v^2 + dh * g), dh = old height - new height, as in Beyer).

import type { Rng } from '../random'

export interface ErosionParams {
  drops: number
  inertia: number
  capacity: number
  minCapacity: number
  erodeRate: number
  depositRate: number
  evaporation: number
  gravity: number
  lifetime: number
  radius: number
}

/** Water-weighted sums of the drop positions around each node. */
export interface Trace {
  sx: Float32Array
  sy: Float32Array
  sw: Float32Array
}

/**
 * Erodes `h` in place. Draws exactly two numbers per drop from `r`, so the
 * stream consumption only depends on the drop count. When `trace` is given,
 * every step adds the drop's position, weighted by its water, to the nearest
 * node: the centroid then tells where in its cell the water really ran.
 */
export function erode(h32: Float32Array, gw: number, gh: number, sea: number, r: Rng, p: ErosionParams, trace?: Trace) {
  // radial brush: weight = radius - distance, normalised
  const bx: number[] = []
  const by: number[] = []
  const bw: number[] = []
  const R = p.radius
  let sum = 0
  for (let oy = -Math.ceil(R); oy <= Math.ceil(R); oy++) {
    for (let ox = -Math.ceil(R); ox <= Math.ceil(R); ox++) {
      const d = Math.hypot(ox, oy)
      if (d < R) {
        bx.push(ox)
        by.push(oy)
        bw.push(R - d)
        sum += R - d
      }
    }
  }
  for (let k = 0; k < bw.length; k++)
    bw[k] /= sum
  const nb = bw.length
  const bo = Int32Array.from(bx.map((ox, k) => by[k] * gw + ox))
  const bwt = Float64Array.from(bw)
  const rc = Math.ceil(R)

  // work in doubles: faster reads and no rounding between steps
  const h = Float64Array.from(h32)
  const maxX = gw - 1
  const maxY = gh - 1
  const inertia = p.inertia
  const capF = p.capacity
  const minCap = p.minCapacity
  const erodeRate = p.erodeRate
  const depositRate = p.depositRate
  const keep = 1 - p.evaporation
  const gravity = p.gravity
  const life = p.lifetime
  const drops = p.drops
  for (let d = 0; d < drops; d++) {
    let x = r() * maxX
    let y = r() * maxY
    let dx = 0
    let dy = 0
    let speed = 1
    let water = 1
    let sed = 0
    for (let step = 0; step < life; step++) {
      const ix = x | 0
      const iy = y | 0
      const fx = x - ix
      const fy = y - iy
      const c = iy * gw + ix
      const hNW = h[c]
      const hNE = h[c + 1]
      const hSW = h[c + gw]
      const hSE = h[c + gw + 1]
      const gx = (hNE - hNW) * (1 - fy) + (hSE - hSW) * fy
      const gy = (hSW - hNW) * (1 - fx) + (hSE - hNE) * fx
      const hOld = hNW * (1 - fx) * (1 - fy) + hNE * fx * (1 - fy) + hSW * (1 - fx) * fy + hSE * fx * fy
      if (hOld < sea)
        break
      if (trace) {
        const t = (fy < 0.5 ? iy : iy + 1) * gw + (fx < 0.5 ? ix : ix + 1)
        trace.sx[t] += x * water
        trace.sy[t] += y * water
        trace.sw[t] += water
      }
      dx = dx * inertia - gx * (1 - inertia)
      dy = dy * inertia - gy * (1 - inertia)
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1e-12)
        break
      dx /= len
      dy /= len
      x += dx
      y += dy
      if (x < 0 || y < 0 || x >= maxX || y >= maxY)
        break
      const jx = x | 0
      const jy = y | 0
      const ex = x - jx
      const ey = y - jy
      const e = jy * gw + jx
      const hNew = h[e] * (1 - ex) * (1 - ey) + h[e + 1] * ex * (1 - ey) + h[e + gw] * (1 - ex) * ey + h[e + gw + 1] * ex * ey
      const dh = hNew - hOld
      // reaching the sea: the whole load settles on the shore
      const toSea = hNew < sea
      const cap = Math.max(-dh * speed * water * capF, minCap)
      if (toSea || sed > cap || dh > 0) {
        let amt: number
        if (toSea)
          amt = sed
        else if (dh > 0)
          amt = Math.min(dh, sed)
        else
          amt = (sed - cap) * depositRate
        sed -= amt
        h[c] += amt * (1 - fx) * (1 - fy)
        h[c + 1] += amt * fx * (1 - fy)
        h[c + gw] += amt * (1 - fx) * fy
        h[c + gw + 1] += amt * fx * fy
        if (toSea)
          break
      }
      else {
        const amt = Math.min((cap - sed) * erodeRate, -dh)
        if (ix >= rc && iy >= rc && ix <= maxX - rc && iy <= maxY - rc) {
          // interior: no bounds checks
          for (let k = 0; k < nb; k++) {
            const q = c + bo[k]
            const w = amt * bwt[k]
            const v = h[q]
            const take = v < w ? v : w
            h[q] = v - take
            sed += take
          }
        }
        else {
          for (let k = 0; k < nb; k++) {
            const cx = ix + bx[k]
            const cy = iy + by[k]
            if (cx < 0 || cy < 0 || cx > maxX || cy > maxY)
              continue
            const q = cy * gw + cx
            const w = amt * bw[k]
            const take = h[q] < w ? h[q] : w
            h[q] -= take
            sed += take
          }
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity))
      water *= keep
    }
  }
  h32.set(h)
}

/**
 * One gentle 3x3 smoothing pass, mixed in by `k`: removes the single-cell
 * pits a finite number of drops leaves behind, keeps the gullies.
 */
export function soften(h: Float32Array, gw: number, gh: number, k: number) {
  const src = Float32Array.from(h)
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const c = j * gw + i
      const b = (src[c - gw - 1] + src[c - gw + 1] + src[c + gw - 1] + src[c + gw + 1]
        + 2 * (src[c - 1] + src[c + 1] + src[c - gw] + src[c + gw]) + 4 * src[c]) / 16
      h[c] = src[c] + (b - src[c]) * k
    }
  }
}
