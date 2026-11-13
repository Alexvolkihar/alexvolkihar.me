// Stage 1 of the Wash series: the water.
//
// The river is described by a stream function. Across the channel it is the
// normalised cross position t = (c - c0(a)) / w(a) in the river's own frame
// (a along the flow, c across it), so the banks t = ±1 are streamlines and
// no water leaves the bed. Turbulence is added as smooth noise on t (adding
// any scalar to a stream function keeps the flow divergence-free), eddies
// as twirls of the domain (a rotation about a centre whose angle falls off
// with the distance: area preserving, so the banded pattern stays a valid
// advected pattern), and stones as the classic potential flow around a
// cylinder, t <- tc + (t - tc)(1 - R²/r²), windowed so each stone only
// bends the water around it. The level L maps t to band numbers: N bands
// across the water and wider bands on the land past the banks. Ink lines are
// the integer levels of L, and the washes fill the bands between them.

import type { Rng } from '../random'
import type { Noise2 } from './noise'
import { chance, int, range } from '../random'
import { fbm } from './noise'

export type CourseName = 'Reach' | 'Meander' | 'Bend' | 'Island'

export interface WaterSpec {
  /** Bands across the water (even). */
  bands: readonly [number, number]
  noiseAmp: number
  noiseFreq: number
  noiseOct: number
  /** Free eddies in the central square, strength (radians) and radius. */
  eddies: readonly [number, number]
  eddyS: readonly [number, number]
  eddyR: readonly [number, number]
  /** Stones in the central square and their radius. */
  stones: readonly [number, number]
  stoneR: readonly [number, number]
  /** Eddies shed behind each stone. */
  wake: number
}

interface Twirl { x: number, y: number, k: number, s: number, lim: number }
interface Stone {
  x: number
  y: number
  R: number
  e: number
  tc: number
  island: boolean
  harm: number[]
}

export interface River {
  cos: number
  sin: number
  course: CourseName
  A: number
  lambda: number
  phase: number
  w0: number
  wPhase: number
  half: number
  landK: number
  spec: WaterSpec
  twirls: Twirl[]
  /** Twirls that can reach the canvas, flat: x, y, k, s, lim (see `focus`). */
  tw: Float64Array
  stones: Stone[]
}

/** Centre line offset and half width at abscissa a. */
function centre(rv: River, a: number): number {
  switch (rv.course) {
    case 'Meander':
      return rv.A * Math.sin(Math.PI * 2 * a / rv.lambda + rv.phase)
    case 'Bend':
      return rv.A * (Math.cos(2.4 * a + rv.phase) - 0.25)
    default:
      return rv.A * Math.sin(1.4 * a + rv.phase)
  }
}

function halfWidth(rv: River, a: number): number {
  return rv.w0 * (1 + 0.12 * Math.sin(2.3 * a + rv.wPhase))
}

function toWorld(rv: River, a: number, c: number): [number, number] {
  return [a * rv.cos - c * rv.sin, a * rv.sin + c * rv.cos]
}

/** Lay out the river in world units (the central square is [-0.5, 0.5]²). */
export function planRiver(r: Rng, course: CourseName, spec: WaterSpec, noise: Noise2): River {
  const tilt = range(r, -0.32, 0.32)
  const flip = chance(r, 0.5) ? 1 : -1
  const ang = tilt + (flip > 0 ? 0 : Math.PI)
  const rv: River = {
    cos: Math.cos(ang),
    sin: Math.sin(ang),
    course,
    A: 0,
    lambda: 1,
    phase: range(r, 0, Math.PI * 2),
    w0: 0.27,
    wPhase: range(r, 0, Math.PI * 2),
    half: 2 * Math.round(range(r, spec.bands[0], spec.bands[1]) / 2),
    landK: range(r, 1.5, 2.1),
    spec,
    twirls: [],
    tw: new Float64Array(0),
    stones: [],
  }
  const side = chance(r, 0.5) ? 1 : -1
  if (course === 'Reach') {
    rv.A = 0.045
    rv.w0 = range(r, 0.26, 0.31)
  }
  else if (course === 'Meander') {
    rv.A = range(r, 0.12, 0.19) * side
    rv.lambda = range(r, 1.15, 1.6)
    rv.w0 = range(r, 0.21, 0.26)
  }
  else if (course === 'Bend') {
    rv.A = range(r, 0.2, 0.28) * side
    rv.phase = range(r, -0.45, 0.45)
    rv.w0 = range(r, 0.23, 0.28)
  }
  else {
    rv.A = 0.035
    rv.w0 = range(r, 0.3, 0.35)
  }
  rv.half /= 2

  // Features are laid out on a long reach, |a| < 1.35, so a wide canvas shows
  // more river while the central square stays the same. The central ones are
  // placed first.
  const place = (central: boolean, tMax: number): [number, number, number] => {
    let a = range(r, -0.5, 0.5)
    if (!central) {
      const s = chance(r, 0.5) ? 1 : -1
      a = s * range(r, 0.55, 1.35)
    }
    const tt = range(r, -tMax, tMax)
    const c = centre(rv, a) + tt * halfWidth(rv, a)
    const [x, y] = toWorld(rv, a, c)
    return [x, y, a]
  }
  const fits = (x: number, y: number, R: number, e: number) => {
    for (const s of rv.stones) {
      const d = Math.hypot(x - s.x, y - s.y)
      if (d < (R * e + s.R * s.e) * 1.25 + 0.03)
        return false
    }
    return true
  }
  const addStone = (x: number, y: number, R: number, e: number, island: boolean) => {
    const harm: number[] = []
    for (let m = 2; m <= 5; m++)
      harm.push(range(r, 0, island ? 0.1 : 0.09) / (m - 1), range(r, 0, Math.PI * 2))
    rv.stones.push({ x, y, R, e, tc: 0, island, harm })
  }

  if (course === 'Island') {
    const a = range(r, -0.28, 0.28)
    const c = centre(rv, a) + range(r, -0.3, 0.3) * halfWidth(rv, a)
    const [x, y] = toWorld(rv, a, c)
    addStone(x, y, rv.w0 * range(r, 0.26, 0.38), range(r, 1.7, 3.2), true)
  }
  const stoneCount = (central: boolean) => {
    const n = int(r, spec.stones[0], spec.stones[1])
    return central ? n : Math.round(n * 1.6)
  }
  for (const central of [true, false]) {
    const n = stoneCount(central)
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const [x, y] = place(central, 0.62)
        const R = range(r, spec.stoneR[0], spec.stoneR[1])
        const e = range(r, 1, 1.5)
        if (fits(x, y, R, e)) {
          addStone(x, y, R, e, false)
          break
        }
      }
    }
  }
  // wakes: eddies shed downstream of every stone, alternating in sign
  for (const s of rv.stones) {
    let sign = chance(r, 0.5) ? 1 : -1
    const nw = s.island ? Math.max(1, spec.wake) : spec.wake
    for (let k = 0; k < nw; k++) {
      const rho = s.R * range(r, 0.75, 1.1) * (s.island ? 0.7 : 1)
      const along = s.R * s.e + rho * (2 + 1.7 * k) + range(r, 0, 0.3) * s.R
      const across = sign * s.R * range(r, 0.35, 0.7)
      const x = s.x + along * rv.cos - across * rv.sin
      const y = s.y + along * rv.sin + across * rv.cos
      const str = -sign * range(r, spec.eddyS[0], spec.eddyS[1]) * 0.85
      rv.twirls.push({ x, y, k: 1 / (rho * rho), s: str, lim: rho * 3 })
      sign = -sign
    }
  }
  for (const central of [true, false]) {
    let n = int(r, spec.eddies[0], spec.eddies[1])
    if (!central)
      n = Math.round(n * 1.6)
    for (let i = 0; i < n; i++) {
      const [x, y] = place(central, 0.7)
      const R = range(r, spec.eddyR[0], spec.eddyR[1])
      const s = (chance(r, 0.5) ? 1 : -1) * range(r, spec.eddyS[0], spec.eddyS[1])
      // free eddies keep clear of the stones and the island
      const clear = rv.stones.every(st => Math.hypot(x - st.x, y - st.y) > st.R * st.e + R * 2)
      if (clear)
        rv.twirls.push({ x, y, k: 1 / (R * R), s, lim: R * 3 })
    }
  }
  // the stream function at each stone's centre, with the stones before it
  for (let i = 0; i < rv.stones.length; i++) {
    const s = rv.stones[i]
    s.tc = streamT(rv, noise, s.x, s.y, i)
  }
  return rv
}

/** Scratch output of `untwirl` and `solidSdf` (no tuple allocation in the hot loop). */
export const scratch = { x: 0, y: 0, rock: 0, isl: 0 }

/**
 * Keep the twirls whose reach meets the canvas (world half extents hx, hy,
 * padded by the farthest a twirl can carry a point), in their order.
 */
export function focus(rv: River, hx: number, hy: number) {
  const out: number[] = []
  for (const t of rv.twirls) {
    const pad = t.lim + 0.7
    if (Math.abs(t.x) - pad < hx && Math.abs(t.y) - pad < hy)
      out.push(t.x, t.y, t.k, t.s, t.lim)
  }
  rv.tw = new Float64Array(out)
}

/** Twirl a world point through every eddy, in place order; result in scratch.x, scratch.y. */
export function untwirl(rv: River, x: number, y: number) {
  const tw = rv.tw
  for (let o = 0; o < tw.length; o += 5) {
    const dx = x - tw[o]
    const dy = y - tw[o + 1]
    const lim = tw[o + 4]
    if (dx > lim || dx < -lim || dy > lim || dy < -lim)
      continue
    const q = (dx * dx + dy * dy) * tw[o + 2]
    if (q > 9)
      continue
    const th = tw[o + 3] * Math.exp(-q)
    const c = Math.cos(th)
    const s = Math.sin(th)
    x = tw[o] + dx * c - dy * s
    y = tw[o + 1] + dx * s + dy * c
  }
  scratch.x = x
  scratch.y = y
}

/** Stream function t at a (twirled) world point, with the first `upTo` stones. */
export function streamT(rv: River, noise: Noise2, x: number, y: number, upTo: number): number {
  const a = x * rv.cos + y * rv.sin
  const c = -x * rv.sin + y * rv.cos
  let t = (c - centre(rv, a)) / halfWidth(rv, a)
  const at = Math.abs(t)
  const sp = rv.spec
  if (at < 1.2 && sp.noiseAmp > 0) {
    let damp = 1
    if (at > 0.7) {
      const q = (at - 0.7) / 0.5
      damp = 1 - q * q * (3 - 2 * q)
    }
    t += sp.noiseAmp * damp * (fbm(noise, x * sp.noiseFreq + 31.7, y * sp.noiseFreq - 12.9, sp.noiseOct) - 0.5) * 2
  }
  for (let i = 0; i < upTo; i++) {
    const s = rv.stones[i]
    const dx = x - s.x
    const dy = y - s.y
    const lim = s.R * s.e * 5
    if (dx > lim || dx < -lim || dy > lim || dy < -lim)
      continue
    const da = (dx * rv.cos + dy * rv.sin) / s.e
    const dc = -dx * rv.sin + dy * rv.cos
    const re2 = da * da + dc * dc
    const R2 = s.R * s.R
    if (re2 > R2 * 25)
      continue
    let f = 0
    if (re2 > R2)
      f = 1 - R2 / re2 * Math.exp(-(re2 - R2) / (3 * R2))
    t = s.tc + (t - s.tc) * f
  }
  return t
}

/** Band level: N bands across the water, wider bands on the land. */
export function levelOf(rv: River, t: number): number {
  const at = Math.abs(t)
  if (at <= 1)
    return t * rv.half
  return Math.sign(t) * (rv.half + (at - 1) * rv.half / rv.landK)
}

/** Signed distance (roughly, in world units) to the nearest stone and island; result in scratch. */
export function solidSdf(rv: River, x: number, y: number) {
  let rock = 9
  let isl = 9
  for (const s of rv.stones) {
    const dx = x - s.x
    const dy = y - s.y
    const lim = s.R * s.e * 2
    if (dx > lim || dx < -lim || dy > lim || dy < -lim)
      continue
    const da = (dx * rv.cos + dy * rv.sin) / s.e
    const dc = -dx * rv.sin + dy * rv.cos
    const re = Math.sqrt(da * da + dc * dc)
    if (re > s.R * 2)
      continue
    const th = Math.atan2(dc, da)
    let rad = 0.8
    for (let m = 0; m < 4; m++)
      rad += s.harm[m * 2] * Math.cos((m + 2) * th + s.harm[m * 2 + 1])
    const d = re - s.R * rad
    if (s.island)
      isl = Math.min(isl, d)
    else
      rock = Math.min(rock, d)
  }
  scratch.rock = rock
  scratch.isl = isl
}
