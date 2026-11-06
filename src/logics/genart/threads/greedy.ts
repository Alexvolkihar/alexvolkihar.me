// Greedy thread path for the "Threads" series.
//
// The method is the one Petros Vrellis published with "A New Way to Knit"
// (2016): a single thread winds from nail to nail; from the current nail it
// goes to the nail whose straight line covers the most remaining "darkness"
// of the target, then that darkness is partly removed along the line, and the
// search starts again from the new nail. Birsak, Rist, Wonka and Musialski
// ("String Art: Towards Computational Fabrication of String Images",
// Computer Graphics Forum 37(2), 2018) analyse it as a discrete optimisation.
//
// Here the target is never a photograph: it is one of a few procedural
// figures (a lit sphere, a crescent, an eclipse, mountain peaks, a spiral) evaluated on
// a small fixed grid, so the thread path is a pure function of the hash and
// does not depend on the canvas size.

import type { Rng } from '../random'
import type { Frame } from './frames'
import { pick, range } from '../random'
import { allowedPair } from './frames'

/** Coverage wanted at (u, v) in frame units, 0 (bare) to 1 (full of thread). */
export type Target = (u: number, v: number) => number

export const TARGETS = ['Sphere', 'Crescent', 'Eclipse', 'Peaks', 'Spiral'] as const
export type TargetName = typeof TARGETS[number]

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Draws a target and its parameters from the pattern stream (fixed draw count
 * per figure). With `light` the thread is lighter than the board, so the
 * sphere puts its thread in the light instead of the shadow (the peaks read
 * either way: snow-lit faces on a dark board, shaded faces on a light one).
 */
export function makeTarget(r: Rng, light: boolean): { name: TargetName, fn: Target } {
  const name = pick(r, TARGETS)
  const a = range(r, 0, Math.PI * 2)
  const b = range(r, 0, 1)
  const c = range(r, 0, 1)
  const side = r() < 0.5 ? -1 : 1
  if (name === 'Sphere') {
    const rad = 0.52 + b * 0.16
    const cx = side * c * 0.12
    const cy = -0.06
    // light from above, left or right
    const lx = -side * (0.45 + c * 0.3)
    const ly = -0.55
    const lz = Math.sqrt(Math.max(0.05, 1 - lx * lx - ly * ly))
    return {
      name,
      fn: (u, v) => {
        const x = (u - cx) / rad
        const y = (v - cy) / rad
        const d2 = x * x + y * y
        if (d2 < 1) {
          const z = Math.sqrt(1 - d2)
          const lam = Math.max(0, x * lx + y * ly + z * lz)
          if (light)
            return 0.03 + 0.92 * lam ** 1.4 * smooth(1, 0.92, d2)
          // the lit side stays bare, the terminator and the limb fill with thread
          return 0.02 + 0.93 * (1 - lam) ** 1.3 * smooth(1, 0.85, d2) + 0.35 * smooth(0.8, 1, d2)
        }
        if (light)
          return 0.03
        // a threaded backdrop, darker in the cast shadow below the ball
        const sx = (u - cx + lx * rad * 0.6) / (rad * 1.1)
        const sy = (v - (cy + rad * 0.98)) / (rad * 0.25)
        return 0.22 + 0.12 * smooth(-1, 1, v) + 0.45 * smooth(1, 0.15, sx * sx + sy * sy)
      },
    }
  }
  if (name === 'Crescent') {
    const rad = 0.62 + b * 0.14
    const ox = Math.cos(a) * rad * (0.32 + c * 0.25)
    const oy = Math.sin(a) * rad * (0.32 + c * 0.25)
    return {
      name,
      fn: (u, v) => {
        const d = Math.hypot(u, v) / rad
        const e = Math.hypot(u - ox, v - oy) / rad
        const disc = smooth(1.02, 0.96, d)
        const lit = smooth(0.94, 1.04, e)
        // the dark limb still catches a little earthshine
        return disc * (0.12 + 0.85 * lit * (0.6 + 0.4 * smooth(1, 0.3, d)))
      },
    }
  }
  if (name === 'Eclipse') {
    const rad = 0.42 + b * 0.12
    const rays = 5 + Math.floor(c * 9)
    return {
      name,
      fn: (u, v) => {
        const d = Math.hypot(u, v)
        if (d < rad * 0.97)
          return 0.03
        const ang = Math.atan2(v, u)
        const q = (d - rad) / (0.08 + 0.1 * (0.5 + 0.5 * Math.cos(ang * rays + a)))
        const corona = Math.exp(-q * q)
        return 0.05 + 0.9 * corona + 0.15 * smooth(0.98, 0.7, d) * (0.5 + 0.5 * Math.cos(ang * rays * 2 - a))
      },
    }
  }
  if (name === 'Peaks') {
    // two or three peaks: one face in light, the other in shadow
    const peaks = [
      { x: -0.45 + b * 0.3, top: -0.55 + c * 0.2 },
      { x: 0.2 + c * 0.35, top: -0.25 + b * 0.25 },
      { x: -0.05 + b * 0.2, top: 0.05 + c * 0.15 },
    ]
    const slope = 0.75 + b * 0.5
    return {
      name,
      fn: (u, v) => {
        let best = Infinity
        let face = 0
        for (const p of peaks) {
          const ridge = p.top + slope * Math.abs(u - p.x) * (u > p.x ? 1.15 : 0.9) + 0.025 * Math.sin(u * 17 + a)
          if (ridge < best) {
            best = ridge
            // the shadow line runs down from the summit, slanted, a little ragged
            face = (u - p.x + (v - p.top) * 0.4 * side + 0.03 * Math.sin(v * 23 + a)) * side
          }
        }
        if (v < best)
          return 0.02
        const depth = Math.min(1, (v - best) / 0.5)
        const shade = face > 0 ? 0.95 : 0.14
        return shade * (0.55 + 0.45 * smooth(0, 0.08, v - best)) * (1 - 0.3 * depth)
      },
    }
  }
  const arms = 2 + Math.floor(b * 3)
  const twist = (2.2 + c * 2.5) * side
  return {
    name,
    fn: (u, v) => {
      const d = Math.hypot(u, v)
      const ang = Math.atan2(v, u)
      const w = 0.5 + 0.5 * Math.cos(ang * arms - twist * Math.log(d + 0.05) + a)
      return (0.04 + 0.9 * w ** 2.2) * smooth(0.98, 0.75, d) * smooth(0.02, 0.18, d)
    },
  }
}

export interface GreedyOptions {
  grid: number
  threads: number
  /** Darkness removed along a line each time a thread is laid on it. */
  decrement: number
}

/** Returns the sequence of nails the single thread visits. */
export function greedyPath(frame: Frame, target: Target, o: GreedyOptions): Int32Array {
  const G = o.grid
  const E = 1.04
  const n = frame.outer + frame.inner
  const res = new Float32Array(G * G)
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const u = ((i + 0.5) / G) * 2 * E - E
      const v = ((j + 0.5) / G) * 2 * E - E
      res[j * G + i] = target(u, v)
    }
  }
  const gx = new Float64Array(n)
  const gy = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    gx[k] = Math.min(G - 1, Math.max(0, ((frame.x[k] + E) / (2 * E)) * G - 0.5))
    gy[k] = Math.min(G - 1, Math.max(0, ((frame.y[k] + E) / (2 * E)) * G - 0.5))
  }
  // pixel lists of every allowed line, computed once
  const off = new Int32Array(n * n)
  const len = new Int32Array(n * n)
  let total = 0
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (!allowedPair(frame, a, b))
        continue
      const l = Math.max(2, Math.ceil(Math.hypot(gx[b] - gx[a], gy[b] - gy[a])))
      off[a * n + b] = total
      len[a * n + b] = l
      total += l
    }
  }
  const pix = new Int32Array(total)
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const l = len[a * n + b]
      if (!l)
        continue
      const o0 = off[a * n + b]
      for (let s = 0; s < l; s++) {
        const t = (s + 0.5) / l
        const px = Math.round(gx[a] + (gx[b] - gx[a]) * t)
        const py = Math.round(gy[a] + (gy[b] - gy[a]) * t)
        pix[o0 + s] = py * G + px
      }
    }
  }
  const seq = new Int32Array(o.threads + 1)
  let cur = 0
  let prev = -1
  let count = 1
  seq[0] = cur
  for (let t = 0; t < o.threads; t++) {
    let best = -Infinity
    let bi = -1
    for (let b = 0; b < n; b++) {
      if (b === prev)
        continue
      const key = cur < b ? cur * n + b : b * n + cur
      const l = len[key]
      if (!l)
        continue
      const o0 = off[key]
      let s = 0
      for (let k = o0; k < o0 + l; k++)
        s += res[pix[k]]
      s /= l
      if (s > best) {
        best = s
        bi = b
      }
    }
    if (bi < 0 || best < 0.004)
      break
    const key = cur < bi ? cur * n + bi : bi * n + cur
    const o0 = off[key]
    for (let k = o0; k < o0 + len[key]; k++)
      res[pix[k]] -= o.decrement
    prev = cur
    cur = bi
    seq[count++] = cur
  }
  return seq.slice(0, count)
}
